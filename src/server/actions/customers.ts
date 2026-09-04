"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin, assertUser } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  createCustomerPinSchema,
  createCustomerSchema,
  deleteCustomerPinSchema,
  deleteCustomerSchema,
  formDataToObject,
  moveCustomerPinSchema,
  setCustomerStatusSchema,
  updateCustomerPinSchema,
  updateCustomerSchema,
} from "@/lib/validation";

import { diffFields } from "./diff";
import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * The customer map.
 *
 * The authorization rule here is deliberately wider than anywhere else in the
 * app, and it is the one thing to keep straight when adding to this file:
 *
 *   reading and writing a lead — every signed-in employee (assertUser)
 *   deleting a lead or a pin  — an admin, with a written reason (assertAdmin)
 *
 * The board is shared because a lead one person found is a lead the next person
 * standing in that street needs to see; two people knocking on the same door is
 * the failure this prevents. Deleting stays admin-only for the reason it does
 * everywhere else in this codebase: it is the one action that leaves nothing
 * behind to argue with, so the audit row has to carry a full copy of what went.
 *
 * Every write records the actor, so a shared board is not an anonymous one.
 */

/** The one page a pin appears on. */
function revalidateCustomerViews() {
  revalidatePath("/customers");
}

/** What an edit to a lead may write, and what it is diffed on. */
const CUSTOMER_FIELDS = [
  "name",
  "status",
  "source",
  "contactName",
  "phone",
  "email",
  "lineId",
  "note",
  "ownerId",
  "firstContactedAt",
  "lastContactedAt",
] as const;

/** The same, for the place rather than the people at it. */
const PIN_FIELDS = ["label", "address", "latitude", "longitude"] as const;

const NOT_FOUND = {
  status: "error",
  message: "ไม่พบหมุดนี้ / Pin not found",
} as const;

const CUSTOMER_NOT_FOUND = {
  status: "error",
  message: "ไม่พบลูกค้ารายนี้ / Customer not found",
} as const;

/**
 * An owner has to be somebody who can still be assigned work. Returns the
 * employee's code for the audit row, or an ActionState explaining the refusal.
 *
 * A null ownerId is not an error — an unclaimed lead is a real state.
 */
async function resolveOwner(
  ownerId: string | null,
): Promise<{ code: string | null } | ActionState> {
  if (ownerId === null) return { code: null };

  const owner = await db.employee.findUnique({
    where: { id: ownerId },
    select: { isActive: true, employeeCode: true },
  });

  if (!owner || !owner.isActive) {
    return {
      status: "error",
      message:
        "ไม่สามารถมอบหมายให้บัญชีที่ถูกระงับ / Cannot assign to an inactive account",
      fieldErrors: { ownerId: "ไม่พร้อมใช้งาน / Unavailable" },
    };
  }

  return { code: owner.employeeCode };
}

function isActionState(value: object): value is ActionState {
  return "status" in value;
}

/**
 * Drop a pin, and put its first customer at it — if there is one yet.
 *
 * One transaction and one form, and the customer half is optional: "this place,
 * I will find out who is in it later" is what somebody standing on a street
 * wants to record before they walk in. The schema still refuses a pin with no
 * name at all; one of the two has to say what the dot is.
 *
 * Everything after this goes through createCustomerAction, which adds to a pin
 * that already exists.
 */
export async function createCustomerPinAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = createCustomerPinSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { label, address, latitude, longitude, ...customer } = parsed.data;
    const { name, ...rest } = customer;

    // Only worth checking when there is a customer for it to belong to.
    const owner = name === null ? { code: null } : await resolveOwner(rest.ownerId);
    if (isActionState(owner)) return owner;

    await db.$transaction(async (tx) => {
      const pin = await tx.customerPin.create({
        data: {
          label,
          address,
          latitude,
          longitude,
          createdById: user.id,
          ...(name === null
            ? {}
            : { customers: { create: { ...rest, name, createdById: user.id } } }),
        },
      });

      await writeAudit(
        {
          actor: user,
          action: "customerPin.created",
          entityType: "CustomerPin",
          entityId: pin.id,
          metadata: {
            label,
            address,
            latitude,
            longitude,
            // Null where the pin was dropped on its own; the customer arrives
            // later through customer.created, with its own entry.
            firstCustomer: name,
            status: name === null ? null : rest.status,
            source: name === null ? null : rest.source,
            owner: owner.code,
          },
        },
        tx,
      );
    });

    revalidateCustomerViews();
    return { status: "success", message: "ปักหมุดแล้ว / Pin saved" };
  });
}

/** Correct the place: what it is called, its address, or where it sits. */
export async function updateCustomerPinAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = updateCustomerPinSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { pinId, ...data } = parsed.data;

    const before = await db.customerPin.findUnique({ where: { id: pinId } });
    if (!before) return NOT_FOUND;

    const changes = diffFields(PIN_FIELDS, before, data);
    if (Object.keys(changes).length === 0) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.customerPin.update({ where: { id: pinId }, data });

      await writeAudit(
        {
          actor: user,
          action: "customerPin.updated",
          entityType: "CustomerPin",
          entityId: pinId,
          metadata: { label: before.label, changes },
        },
        tx,
      );
    });

    revalidateCustomerViews();
    return { status: "success", message: "บันทึกแล้ว / Saved" };
  });
}

/**
 * The drag-to-move path: two numbers, no form.
 *
 * Its own action rather than a call into the one above because it is its own
 * kind of mistake. Somebody nudging a marker with a thumb has not decided to
 * edit anything, so the trail says "moved" and carries both points — enough to
 * put it back by hand if the nudge was an accident.
 */
export async function moveCustomerPinAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = moveCustomerPinSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return { status: "error", message: "พิกัดไม่ถูกต้อง / Invalid coordinates" };
    }

    const { pinId, latitude, longitude } = parsed.data;

    const before = await db.customerPin.findUnique({
      where: { id: pinId },
      select: { id: true, label: true, latitude: true, longitude: true },
    });
    if (!before) return NOT_FOUND;

    if (before.latitude === latitude && before.longitude === longitude) {
      return { status: "success" };
    }

    await db.$transaction(async (tx) => {
      await tx.customerPin.update({
        where: { id: pinId },
        data: { latitude, longitude },
      });

      await writeAudit(
        {
          actor: user,
          action: "customerPin.moved",
          entityType: "CustomerPin",
          entityId: pinId,
          metadata: {
            label: before.label,
            from: { latitude: before.latitude, longitude: before.longitude },
            to: { latitude, longitude },
          },
        },
        tx,
      );
    });

    revalidateCustomerViews();
    return { status: "success", message: "ย้ายหมุดแล้ว / Pin moved" };
  });
}

/**
 * Delete a pin, and with it every customer standing at it.
 *
 * Admin-only, and the fourth hard delete in the application. `Customer.pinId`
 * is `onDelete: Cascade`, so the leads go with the place — which is why the
 * audit row is written first, in the same transaction, carrying the pin *and a
 * full copy of every customer on it*. Either both happen or neither does, and
 * the surviving row is a complete account of what was removed.
 *
 * Preserve that. A delete that leaves only "somebody removed a pin" is the
 * version of this feature the app should not have.
 */
export async function deleteCustomerPinAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = deleteCustomerPinSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "กรุณาระบุเหตุผลในการลบ / A reason is required to delete",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { pinId, reason } = parsed.data;

    const pin = await db.customerPin.findUnique({
      where: { id: pinId },
      include: {
        createdBy: { select: { employeeCode: true, fullName: true } },
        // Not deleted with the pin — FieldTrip.pinId is SetNull — but the
        // audit row should say how many cross-references the delete broke,
        // because after it runs nothing else can.
        fieldTrips: {
          select: { id: true, purpose: true, startDate: true },
        },
        customers: {
          include: {
            owner: { select: { employeeCode: true, fullName: true } },
            createdBy: { select: { employeeCode: true, fullName: true } },
          },
        },
      },
    });

    if (!pin) return NOT_FOUND;

    await db.$transaction(async (tx) => {
      await writeAudit(
        {
          actor: admin,
          action: "customerPin.deleted",
          entityType: "CustomerPin",
          entityId: pin.id,
          metadata: {
            reason,
            label: pin.label,
            address: pin.address,
            latitude: pin.latitude,
            longitude: pin.longitude,
            createdBy: `${pin.createdBy.employeeCode} — ${pin.createdBy.fullName}`,
            createdAt: pin.createdAt.toISOString(),
            // The trips survive; only their link to this place does not.
            unlinkedFieldTrips: pin.fieldTrips.map((trip) => ({
              id: trip.id,
              purpose: trip.purpose,
              startDate: trip.startDate.toISOString(),
            })),
            // Named field by field rather than spread: a spread would copy
            // whatever the row grows next, and this metadata is rendered on a
            // page in a public repository.
            customers: pin.customers.map((customer) => ({
              name: customer.name,
              status: customer.status,
              source: customer.source,
              contactName: customer.contactName,
              phone: customer.phone,
              email: customer.email,
              lineId: customer.lineId,
              note: customer.note,
              owner: customer.owner
                ? `${customer.owner.employeeCode} — ${customer.owner.fullName}`
                : null,
              firstContactedAt: customer.firstContactedAt?.toISOString() ?? null,
              lastContactedAt: customer.lastContactedAt?.toISOString() ?? null,
              createdBy: `${customer.createdBy.employeeCode} — ${customer.createdBy.fullName}`,
              createdAt: customer.createdAt.toISOString(),
            })),
          },
        },
        tx,
      );

      await tx.customerPin.delete({ where: { id: pin.id } });
    });

    revalidateCustomerViews();
    return {
      status: "success",
      message: `ลบหมุดและลูกค้า ${pin.customers.length} รายแล้ว / Pin and ${pin.customers.length} customer(s) deleted`,
    };
  });
}

/** Add another lead to a pin that already exists — the "stack" half. */
export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = createCustomerSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { pinId, ...data } = parsed.data;

    const pin = await db.customerPin.findUnique({
      where: { id: pinId },
      select: { id: true, label: true },
    });
    if (!pin) return NOT_FOUND;

    const owner = await resolveOwner(data.ownerId);
    if (isActionState(owner)) return owner;

    await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { ...data, pinId, createdById: user.id },
      });

      await writeAudit(
        {
          actor: user,
          action: "customer.created",
          entityType: "Customer",
          entityId: customer.id,
          metadata: {
            pinId,
            pinLabel: pin.label,
            name: customer.name,
            status: customer.status,
            source: customer.source,
            owner: owner.code,
          },
        },
        tx,
      );
    });

    revalidateCustomerViews();
    return { status: "success", message: "เพิ่มลูกค้าแล้ว / Customer added" };
  });
}

export async function updateCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = updateCustomerSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { customerId, ...data } = parsed.data;

    const before = await db.customer.findUnique({ where: { id: customerId } });
    if (!before) return CUSTOMER_NOT_FOUND;

    const owner = await resolveOwner(data.ownerId);
    if (isActionState(owner)) return owner;

    const changes = diffFields(CUSTOMER_FIELDS, before, data);
    if (Object.keys(changes).length === 0) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customerId }, data });

      await writeAudit(
        {
          actor: user,
          action: "customer.updated",
          entityType: "Customer",
          entityId: customerId,
          metadata: { name: before.name, pinId: before.pinId, changes },
        },
        tx,
      );
    });

    revalidateCustomerViews();
    return { status: "success", message: "บันทึกแล้ว / Saved" };
  });
}

/**
 * The one-click status change, and the thing this feature is for.
 *
 * Its own action and its own audit entry rather than a narrow updateCustomer:
 * "who moved this lead from ลังเล to สนใจ, and when" is the question the map is
 * asked, and it should be answerable by reading the trail rather than by
 * unpacking a diff out of it.
 */
export async function setCustomerStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = setCustomerStatusSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return { status: "error", message: "สถานะไม่ถูกต้อง / Invalid status" };
    }

    const { customerId, status } = parsed.data;

    const before = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, status: true, pinId: true },
    });
    if (!before) return CUSTOMER_NOT_FOUND;

    // Idempotent rather than an error: tapping the chip a lead already wears is
    // a no-op, not a failure, and writing history for it would fill the trail
    // with nothing.
    if (before.status === status) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customerId }, data: { status } });

      await writeAudit(
        {
          actor: user,
          action: "customer.status.changed",
          entityType: "Customer",
          entityId: customerId,
          metadata: {
            name: before.name,
            pinId: before.pinId,
            from: before.status,
            to: status,
          },
        },
        tx,
      );
    });

    revalidateCustomerViews();
    return { status: "success", message: "เปลี่ยนสถานะแล้ว / Status updated" };
  });
}

/**
 * Remove one lead from a pin, permanently. Admin-only, reason required, and the
 * audit row carries a full copy — the same bargain deleteCustomerPinAction
 * strikes, one row at a time.
 *
 * Note what this deliberately does *not* do: deleting the last customer at a
 * pin leaves the pin standing, empty. Removing the place because the last lead
 * at it was removed would be a second, unasked-for delete, and the pin still
 * says "somebody has been here" — which is worth keeping. An empty pin is
 * deleted through deleteCustomerPinAction, on purpose.
 */
export async function deleteCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = deleteCustomerSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "กรุณาระบุเหตุผลในการลบ / A reason is required to delete",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { customerId, reason } = parsed.data;

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      include: {
        pin: { select: { id: true, label: true } },
        owner: { select: { employeeCode: true, fullName: true } },
        createdBy: { select: { employeeCode: true, fullName: true } },
      },
    });

    if (!customer) return CUSTOMER_NOT_FOUND;

    await db.$transaction(async (tx) => {
      await writeAudit(
        {
          actor: admin,
          action: "customer.deleted",
          entityType: "Customer",
          entityId: customer.id,
          metadata: {
            reason,
            pinId: customer.pin.id,
            pinLabel: customer.pin.label,
            name: customer.name,
            status: customer.status,
            source: customer.source,
            contactName: customer.contactName,
            phone: customer.phone,
            email: customer.email,
            lineId: customer.lineId,
            note: customer.note,
            owner: customer.owner
              ? `${customer.owner.employeeCode} — ${customer.owner.fullName}`
              : null,
            firstContactedAt: customer.firstContactedAt?.toISOString() ?? null,
            lastContactedAt: customer.lastContactedAt?.toISOString() ?? null,
            createdBy: `${customer.createdBy.employeeCode} — ${customer.createdBy.fullName}`,
            createdAt: customer.createdAt.toISOString(),
          },
        },
        tx,
      );

      await tx.customer.delete({ where: { id: customer.id } });
    });

    revalidateCustomerViews();
    return { status: "success", message: "ลบลูกค้าแล้ว / Customer deleted" };
  });
}
