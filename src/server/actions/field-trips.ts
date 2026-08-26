"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  cancelFieldTripSchema,
  createFieldTripSchema,
  formDataToObject,
  updateFieldTripSchema,
} from "@/lib/validation";

import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Off-site trips.
 *
 * Admin-only to write, readable by everyone: the schedule exists so the team
 * knows who is out and where. Trips are cancelled rather than deleted — people
 * plan around them, and a trip that silently vanishes is worse than one marked
 * cancelled with a reason.
 */

function revalidateTripViews() {
  revalidatePath("/field-trips");
  revalidatePath("/dashboard");
}

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

    const before = await db.fieldTrip.findUnique({
      where: { id: fieldTripId },
      select: { id: true, locationName: true, cancelledAt: true },
    });
    if (!before) {
      return { status: "error", message: "ไม่พบรายการ / Trip not found" };
    }
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
            fromLocation: before.locationName,
            toLocation: data.locationName,
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
        employee: { select: { employeeCode: true } },
      },
    });
    if (!trip) return { status: "error", message: "ไม่พบรายการ / Trip not found" };
    if (trip.cancelledAt) return { status: "success" };

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
