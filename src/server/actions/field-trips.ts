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
 */
const EDITABLE_FIELDS = [
  "employeeId",
  "purpose",
  "locationName",
  "address",
  "latitude",
  "longitude",
  "mapUrl",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "note",
  "completionNote",
  "proofUrl",
] as const;

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

    const employee = await db.employee.findUnique({
      where: { id: parsed.data.employeeId },
      select: { id: true, isActive: true, employeeCode: true },
    });

    if (!employee || !employee.isActive) {
      return {
        status: "error",
        message:
          "ไม่สามารถบันทึกให้บัญชีที่ถูกระงับ / Cannot schedule for an inactive account",
        fieldErrors: { employeeId: "ไม่พร้อมใช้งาน / Unavailable" },
      };
    }

    await db.$transaction(async (tx) => {
      const trip = await tx.fieldTrip.create({
        data: { ...parsed.data, createdById: admin.id },
      });

      await writeAudit(
        {
          actor: admin,
          action: "fieldTrip.created",
          entityType: "FieldTrip",
          entityId: trip.id,
          metadata: {
            employeeCode: employee.employeeCode,
            location: trip.locationName,
            startDate: trip.startDate.toISOString(),
            endDate: trip.endDate.toISOString(),
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

    const { fieldTripId, ...data } = parsed.data;

    const before = await db.fieldTrip.findUnique({ where: { id: fieldTripId } });
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

    const employee = await db.employee.findUnique({
      where: { id: data.employeeId },
      select: { isActive: true, employeeCode: true },
    });
    if (!employee || !employee.isActive) {
      return {
        status: "error",
        message:
          "ไม่สามารถบันทึกให้บัญชีที่ถูกระงับ / Cannot schedule for an inactive account",
        fieldErrors: { employeeId: "ไม่พร้อมใช้งาน / Unavailable" },
      };
    }

    const changes = diffFields(EDITABLE_FIELDS, before, data);
    if (Object.keys(changes).length === 0) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.fieldTrip.update({ where: { id: fieldTripId }, data });

      await writeAudit(
        {
          actor: admin,
          action: "fieldTrip.updated",
          entityType: "FieldTrip",
          entityId: fieldTripId,
          metadata: {
            employeeCode: employee.employeeCode,
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
        employee: { select: { employeeCode: true } },
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
            employeeCode: trip.employee.employeeCode,
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
  employeeId: true,
  locationName: true,
  purpose: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  employee: { select: { employeeCode: true } },
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

    if (!canRunFieldTrip(user, trip)) {
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
            employeeCode: trip.employee.employeeCode,
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

    if (!canRunFieldTrip(user, trip)) {
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
            employeeCode: trip.employee.employeeCode,
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
 * FieldTrip owns no child rows, so nothing cascades — the snapshot is simply
 * the trip.
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
        employee: { select: { employeeCode: true, fullName: true } },
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
            employee: `${trip.employee.employeeCode} — ${trip.employee.fullName}`,
            createdBy: `${trip.createdBy.employeeCode} — ${trip.createdBy.fullName}`,
            locationName: trip.locationName,
            address: trip.address,
            latitude: trip.latitude,
            longitude: trip.longitude,
            mapUrl: trip.mapUrl,
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
