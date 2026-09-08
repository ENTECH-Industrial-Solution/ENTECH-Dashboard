"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, assertUser, canRunFieldTrip } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  cancelFieldTripSchema,
  completeFieldTripSchema,
  createFieldTripSchema,
  deleteFieldTripSchema,
  formDataToObject,
  startFieldTripSchema,
  updateFieldTripSchema,
} from "@/lib/validation";

import { diffFields } from "./diff";
import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Off-site trips.
 *
 * Scheduling is admin-only and readable by everyone: the schedule exists so the
 * team knows who is out and where. Trips are cancelled rather than deleted —
 * people plan around them, and a trip that silently vanishes is worse than one
 * marked cancelled with a reason.
 *
 * Running a trip is the exception to the admin-only rule. Starting and
 * completing one is the traveller reporting from the field, so those two go
 * through assertUser + canRunFieldTrip rather than assertAdmin.
 *
 * Completing a trip closes its *lifecycle*: it can no longer be started, or
 * completed again, or cancelled — cancelling a trip that was seen through to
 * the end would be rewriting what happened. Its *content* stays correctable by
 * an admin, archived or not, on the same terms tasks are: the edit is granted
 * and the accounting is what is made non-optional, an AuditLog row carrying a
 * field-by-field before/after and a flag saying it landed on a finished trip.
 */

/** The two pages a trip appears on. Trips have no page of their own. */
function revalidateTripViews() {
  revalidatePath("/dashboard");
  revalidatePath("/admin/tasks");
}

/**
 * What an edit may write, and what it is diffed on. Everything a person chose;
 * nothing the system recorded — startedAt, completedAt, cancelledAt and
 * createdAt are the account of when things happened, not data to correct.
 *
 * The traveller list is editable too but is absent here on purpose: `diffFields`
 * compares single values, and a list is not one. It is diffed by hand in
 * `updateFieldTripAction` and lands in the same `changes` object under
 * `travellers`, because a change nobody can see in the trail is the one outcome
 * this design cannot have.
 */
const EDITABLE_FIELDS = [
  "purpose",
  "locationName",
  "address",
  "latitude",
  "longitude",
  "mapUrl",
  "pinId",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "note",
  "completionNote",
  "proofUrl",
] as const;

/**
 * The pin a trip is being attached to, if it is being attached to one.
 *
 * The foreign key would refuse a bad id on its own, but a raw FK violation
 * reaches the browser as runAction's generic message — this turns it into a
 * sentence that names the field. Returns null both for "not asked for" and for
 * "not found"; the caller separates them by looking at the input.
 */
async function findPin(pinId: string | null) {
  if (pinId === null) return null;
  return db.customerPin.findUnique({
    where: { id: pinId },
    select: { id: true, label: true },
  });
}

const PIN_NOT_FOUND = {
  status: "error",
  message: "ไม่พบหมุดนี้บนแผนที่ / That pin is not on the map",
  fieldErrors: { pinId: "ไม่พบหมุด / Not found" },
} as const;

/**
 * The people a trip is being given to, checked in one query for the whole list.
 *
 * One round trip rather than one per person — the same reason everything else
 * here batches (see CLAUDE.md, "Round trips are the performance budget") — and
 * it answers both questions at once: is every id real, and is every one of them
 * still an active account.
 *
 * The failure *names the codes*. "Somebody on this list is deactivated" leaves
 * an admin to work out which by removing people one at a time, and the list is
 * exactly the thing that can now be long.
 *
 * The codes come back sorted, and every audit row below uses them in that
 * order, so two trips with the same people read the same in the trail.
 */
async function checkTravellers(
  employeeIds: string[],
): Promise<
  { ok: true; codes: string[] } | { ok: false; error: ActionState }
> {
  const found = await db.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { isActive: true, employeeCode: true },
  });

  const inactive = found
    .filter((employee) => !employee.isActive)
    .map((employee) => employee.employeeCode)
    .sort();

  // Short by any amount means an id matched nothing at all. There is no code to
  // name for those, so the count is what the message can offer.
  const missing = employeeIds.length - found.length;

  if (inactive.length > 0 || missing > 0) {
    const named = inactive.length > 0 ? `: ${inactive.join(", ")}` : "";
    return {
      ok: false,
      error: {
        status: "error",
        message: `ไม่สามารถบันทึกให้บัญชีที่ถูกระงับหรือไม่มีอยู่${named} / Cannot schedule for a missing or inactive account${named}`,
        fieldErrors: { employeeIds: "ไม่พร้อมใช้งาน / Unavailable" },
      },
    };
  }

  return {
    ok: true,
    codes: found.map((employee) => employee.employeeCode).sort(),
  };
}

/** The staff codes already on a trip, sorted, as every audit row below wants them. */
function codesOf(trip: {
  travellers: { employee: { employeeCode: string } }[];
}): string[] {
  return trip.travellers.map((t) => t.employee.employeeCode).sort();
}

/** The ids `canRunFieldTrip` asks for. */
function travellerIdsOf(trip: {
  travellers: { employeeId: string }[];
}): string[] {
  return trip.travellers.map((t) => t.employeeId);
}

/** The message every guard below gives for a trip that is already closed out. */
const COMPLETED_LOCKED = {
  status: "error",
  message:
    "ภารกิจที่เสร็จแล้วถูกล็อกไว้เป็นหลักฐาน / A completed trip is locked as evidence",
} as const;

export async function createFieldTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = createFieldTripSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { employeeIds, ...tripData } = parsed.data;

    // Sent together, so checking the pin costs no wall clock on top of
    // checking the travellers — one round trip's latency for both.
    const [travellers, pin] = await Promise.all([
      checkTravellers(employeeIds),
      findPin(parsed.data.pinId),
    ]);

    if (!travellers.ok) return travellers.error;
    if (parsed.data.pinId !== null && pin === null) return PIN_NOT_FOUND;

    await db.$transaction(async (tx) => {
      const trip = await tx.fieldTrip.create({
        data: {
          ...tripData,
          createdById: admin.id,
          // The schema validated the list is non-empty and deduplicated it, so
          // createMany cannot collide with the join table's composite key.
          travellers: {
            createMany: { data: employeeIds.map((employeeId) => ({ employeeId })) },
          },
        },
      });

      await writeAudit(
        {
          actor: admin,
          action: "fieldTrip.created",
          entityType: "FieldTrip",
          entityId: trip.id,
          metadata: {
            employeeCodes: travellers.codes,
            location: trip.locationName,
            startDate: trip.startDate.toISOString(),
            endDate: trip.endDate.toISOString(),
            pinId: trip.pinId,
            pinLabel: pin?.label ?? null,
          },
        },
        tx,
      );
    });

    revalidateTripViews();
    return { status: "success", message: "บันทึกแผนการเดินทางแล้ว / Trip saved" };
  });
}

export async function updateFieldTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = updateFieldTripSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { fieldTripId, employeeIds, ...data } = parsed.data;

    const before = await db.fieldTrip.findUnique({
      where: { id: fieldTripId },
      include: {
        travellers: {
          select: {
            employeeId: true,
            employee: { select: { employeeCode: true } },
          },
        },
      },
    });
    if (!before) {
      return { status: "error", message: "ไม่พบรายการ / Trip not found" };
    }
    // A cancelled trip is still closed to edits: it never happened, so there is
    // nothing about it to correct. A completed one did happen, and may be.
    if (before.cancelledAt) {
      return {
        status: "error",
        message: "รายการนี้ถูกยกเลิกแล้ว / This trip has been cancelled",
      };
    }

    const [travellers, pin] = await Promise.all([
      checkTravellers(employeeIds),
      findPin(data.pinId),
    ]);
    if (!travellers.ok) return travellers.error;

    if (data.pinId !== null && pin === null) return PIN_NOT_FOUND;

    /*
     * The traveller list, diffed by hand because `diffFields` compares single
     * values. Set comparison rather than a string compare of the two lists: the
     * ids arrive in whatever order the picker produced them, and reordering the
     * same three people is not an edit.
     */
    const beforeIds = before.travellers.map((t) => t.employeeId);
    const added = employeeIds.filter((id) => !beforeIds.includes(id));
    const removed = beforeIds.filter((id) => !employeeIds.includes(id));

    const changes = diffFields(EDITABLE_FIELDS, before, data);
    if (added.length > 0 || removed.length > 0) {
      // Codes, not ids, and joined into a string because FieldDiff carries
      // `string | null`. This is what the audit page renders, and "ENT-0002,
      // ENT-0007 -> ENT-0002" is the sentence somebody reading the trail needs.
      changes.travellers = {
        from: before.travellers
          .map((t) => t.employee.employeeCode)
          .sort()
          .join(", "),
        to: travellers.codes.join(", "),
      };
    }
    if (Object.keys(changes).length === 0) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.fieldTrip.update({
        where: { id: fieldTripId },
        data: {
          ...data,
          // Only the difference is written. The two sets are disjoint by
          // construction, so it does not matter which of the two Prisma runs
          // first, and a person who stayed on the trip keeps their row rather
          // than being deleted and recreated on every unrelated edit.
          ...(added.length > 0 || removed.length > 0
            ? {
                travellers: {
                  deleteMany: { employeeId: { in: removed } },
                  createMany: {
                    data: added.map((employeeId) => ({ employeeId })),
                  },
                },
              }
            : {}),
        },
      });

      await writeAudit(
        {
          actor: admin,
          action: "fieldTrip.updated",
          entityType: "FieldTrip",
          entityId: fieldTripId,
          metadata: {
            employeeCodes: travellers.codes,
            location: before.locationName,
            // Worth its own key rather than being inferred from the timestamps:
            // "this edit touched a finished trip" is what someone auditing the
            // archive is scanning for.
            archived: before.completedAt !== null,
            changes,
          },
        },
        tx,
      );
    });

    revalidateTripViews();
    return { status: "success", message: "บันทึกแล้ว / Saved" };
  });
}

export async function cancelFieldTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = cancelFieldTripSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "กรุณาระบุเหตุผล / A reason is required",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { fieldTripId, reason } = parsed.data;

    const trip = await db.fieldTrip.findUnique({
      where: { id: fieldTripId },
      select: {
        id: true,
        locationName: true,
        cancelledAt: true,
        completedAt: true,
        travellers: { select: { employee: { select: { employeeCode: true } } } },
      },
    });
    if (!trip) return { status: "error", message: "ไม่พบรายการ / Trip not found" };
    if (trip.cancelledAt) return { status: "success" };
    // A trip that was seen through to the end is not something to cancel after
    // the fact — reaching back to erase a finished one is exactly what the
    // completed lock exists to stop.
    if (trip.completedAt) return COMPLETED_LOCKED;

    await db.$transaction(async (tx) => {
      await tx.fieldTrip.update({
        where: { id: fieldTripId },
        data: { cancelledAt: new Date(), cancelledReason: reason },
      });

      await writeAudit(
        {
          actor: admin,
          action: "fieldTrip.cancelled",
          entityType: "FieldTrip",
          entityId: fieldTripId,
          metadata: {
            employeeCodes: codesOf(trip),
            location: trip.locationName,
            reason,
          },
        },
        tx,
      );
    });

    revalidateTripViews();
    return { status: "success", message: "ยกเลิกแล้ว / Trip cancelled" };
  });
}

/**
 * The fields every lifecycle guard below needs, in one place so the two actions
 * cannot drift apart on what they check before writing.
 */
const runnableTripSelect = {
  id: true,
  locationName: true,
  purpose: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  /// Both halves of a traveller: the id is what decides whether the caller may
  /// run this trip, the code is what the audit row records.
  travellers: {
    select: { employeeId: true, employee: { select: { employeeCode: true } } },
  },
} as const;

export async function startFieldTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    // assertUser, not assertAdmin: the traveller is the one standing there.
    const user = await assertUser();
    const parsed = startFieldTripSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };
    }

    const trip = await db.fieldTrip.findUnique({
      where: { id: parsed.data.fieldTripId },
      select: runnableTripSelect,
    });
    if (!trip) return { status: "error", message: "ไม่พบรายการ / Trip not found" };

    if (!canRunFieldTrip(user, { travellerIds: travellerIdsOf(trip) })) {
      return {
        status: "error",
        message: "ไม่มีสิทธิ์แก้ไขรายการนี้ / Not authorized for this trip",
      };
    }

    if (trip.cancelledAt) {
      return {
        status: "error",
        message: "รายการนี้ถูกยกเลิกแล้ว / This trip has been cancelled",
      };
    }
    if (trip.completedAt) return COMPLETED_LOCKED;
    // Already running. Idempotent rather than an error: a double tap on a phone
    // in the field should not read as a failure, and the first timestamp is the
    // true one — overwriting it would lose exactly the fact being recorded.
    if (trip.startedAt) return { status: "success" };

    await db.$transaction(async (tx) => {
      const startedAt = new Date();

      await tx.fieldTrip.update({
        where: { id: trip.id },
        data: { startedAt },
      });

      await writeAudit(
        {
          actor: user,
          action: "fieldTrip.started",
          entityType: "FieldTrip",
          entityId: trip.id,
          metadata: {
            employeeCodes: codesOf(trip),
            location: trip.locationName,
            startedAt: startedAt.toISOString(),
          },
        },
        tx,
      );
    });

    revalidateTripViews();
    return {
      status: "success",
      message: "เริ่มทำงานนอกสถานที่แล้ว / Off-site work started",
    };
  });
}

export async function completeFieldTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = completeFieldTripSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const trip = await db.fieldTrip.findUnique({
      where: { id: parsed.data.fieldTripId },
      select: runnableTripSelect,
    });
    if (!trip) return { status: "error", message: "ไม่พบรายการ / Trip not found" };

    if (!canRunFieldTrip(user, { travellerIds: travellerIdsOf(trip) })) {
      return {
        status: "error",
        message: "ไม่มีสิทธิ์แก้ไขรายการนี้ / Not authorized for this trip",
      };
    }

    if (trip.cancelledAt) {
      return {
        status: "error",
        message: "รายการนี้ถูกยกเลิกแล้ว / This trip has been cancelled",
      };
    }
    if (trip.completedAt) return COMPLETED_LOCKED;

    const completedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.fieldTrip.update({
        where: { id: trip.id },
        data: {
          completedAt,
          completionNote: parsed.data.completionNote,
          proofUrl: parsed.data.proofUrl,
          // Closing out a trip nobody pressed "start" on is the normal case for
          // a one-day job: the two timestamps collapse onto the same instant
          // rather than leaving a finished trip that never began.
          startedAt: trip.startedAt ?? completedAt,
        },
      });

      await writeAudit(
        {
          actor: user,
          action: "fieldTrip.completed",
          entityType: "FieldTrip",
          entityId: trip.id,
          metadata: {
            employeeCodes: codesOf(trip),
            purpose: trip.purpose,
            location: trip.locationName,
            completedAt: completedAt.toISOString(),
            hasProof: parsed.data.proofUrl !== null,
          },
        },
        tx,
      );
    });

    revalidateTripViews();
    return { status: "success", message: "บันทึกภารกิจที่เสร็จแล้ว / Trip completed" };
  });
}

/**
 * Delete a trip, permanently. The trip counterpart of deleteTaskAction, and
 * the second and last hard delete in the app.
 *
 * Unlike every other write here it accepts a trip in *any* state, cancelled and
 * completed included. That is not a hole in the completed lock — the lock stops
 * a finished trip being quietly rewritten or made to look cancelled, which are
 * both ways of changing what the record says. Deleting does not change what it
 * says; it removes the row and leaves an audit entry that says so, by name,
 * with a reason and a copy of everything the row held.
 *
 * FieldTrip owns one set of child rows, its travellers, and they are
 * `onDelete: Cascade` — so they go with it and the snapshot has to carry them.
 * A surviving row saying a trip to Rayong was deleted, without saying who was
 * going on it, is the version of this audit entry the app should not have.
 */
export async function deleteFieldTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = deleteFieldTripSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "กรุณาระบุเหตุผลในการลบ / A reason is required to delete",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { fieldTripId, reason } = parsed.data;

    const trip = await db.fieldTrip.findUnique({
      where: { id: fieldTripId },
      include: {
        travellers: {
          select: { employee: { select: { employeeCode: true, fullName: true } } },
          orderBy: { employee: { employeeCode: "asc" } },
        },
        createdBy: { select: { employeeCode: true, fullName: true } },
      },
    });

    if (!trip) return { status: "error", message: "ไม่พบรายการ / Trip not found" };

    await db.$transaction(async (tx) => {
      await writeAudit(
        {
          actor: admin,
          action: "fieldTrip.deleted",
          entityType: "FieldTrip",
          entityId: trip.id,
          metadata: {
            reason,
            purpose: trip.purpose,
            travellers: trip.travellers.map(
              (t) => `${t.employee.employeeCode} — ${t.employee.fullName}`,
            ),
            createdBy: `${trip.createdBy.employeeCode} — ${trip.createdBy.fullName}`,
            locationName: trip.locationName,
            address: trip.address,
            latitude: trip.latitude,
            longitude: trip.longitude,
            mapUrl: trip.mapUrl,
            pinId: trip.pinId,
            startDate: trip.startDate.toISOString(),
            endDate: trip.endDate.toISOString(),
            startTime: trip.startTime,
            endTime: trip.endTime,
            note: trip.note,
            startedAt: trip.startedAt?.toISOString() ?? null,
            completedAt: trip.completedAt?.toISOString() ?? null,
            completionNote: trip.completionNote,
            proofUrl: trip.proofUrl,
            cancelledAt: trip.cancelledAt?.toISOString() ?? null,
            cancelledReason: trip.cancelledReason,
            createdAt: trip.createdAt.toISOString(),
          },
        },
        tx,
      );

      await tx.fieldTrip.delete({ where: { id: trip.id } });
    });

    revalidateTripViews();
    return { status: "success", message: "ลบรายการแล้ว / Trip deleted" };
  });
}
