"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth/rbac";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  createEmployeeSchema,
  employeeIdSchema,
  formDataToObject,
  updateEmployeeSchema,
} from "@/lib/validation";

import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Admin-only employee provisioning.
 *
 * Employees are never hard-deleted. `deactivateEmployeeAction` is the delete
 * path: it blocks sign-in and kills live sessions, while every task and audit
 * row the person touched stays intact — which is the whole point of the
 * completed-task archive.
 */

export async function createEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = createEmployeeSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    try {
      const employee = await db.$transaction(async (tx) => {
        const created = await tx.employee.create({
          data: {
            ...parsed.data,
            passwordHash,
            mustChangePassword: true,
            createdById: admin.id,
          },
        });

        await writeAudit(
          {
            actor: admin,
            action: "employee.created",
            entityType: "Employee",
            entityId: created.id,
            metadata: {
              employeeCode: created.employeeCode,
              fullName: created.fullName,
              role: created.role,
            },
          },
          tx,
        );

        return created;
      });

      revalidatePath("/admin/employees");

      // The plaintext is returned exactly once, to the admin who created the
      // account. It is never stored and never logged.
      return {
        status: "success",
        message: `สร้างบัญชี ${employee.employeeCode} เรียบร้อย / Account created`,
        data: {
          employeeCode: employee.employeeCode,
          temporaryPassword,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const target = (error.meta?.target as string[] | undefined)?.[0];
        const field = target === "email" ? "email" : "employeeCode";
        return {
          status: "error",
          message:
            field === "email"
              ? "อีเมลนี้ถูกใช้แล้ว / That email is already in use"
              : "รหัสพนักงานนี้ถูกใช้แล้ว / That employee code is already in use",
          fieldErrors: { [field]: "ถูกใช้แล้ว / Already in use" },
        };
      }
      throw error;
    }
  });
}

export async function updateEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = updateEmployeeSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { employeeId, ...data } = parsed.data;
    const before = await db.employee.findUnique({ where: { id: employeeId } });
    if (!before) {
      return { status: "error", message: "ไม่พบพนักงาน / Employee not found" };
    }

    // An admin must not be able to demote themselves into a state where no
    // admin remains, and must not silently lose their own access mid-session.
    if (employeeId === admin.id && data.role !== "ADMIN") {
      return {
        status: "error",
        message: "ไม่สามารถลดสิทธิ์ของตนเองได้ / You cannot demote your own account",
      };
    }

    await db.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employeeId }, data });

      await writeAudit(
        {
          actor: admin,
          action: before.role === data.role ? "employee.updated" : "employee.role.changed",
          entityType: "Employee",
          entityId: employeeId,
          metadata: {
            employeeCode: before.employeeCode,
            ...(before.role === data.role
              ? {}
              : { fromRole: before.role, toRole: data.role }),
          },
        },
        tx,
      );
    });

    // A role change must take effect immediately, not at the next login.
    if (before.role !== data.role) await revokeAllSessions(employeeId);

    revalidatePath("/admin/employees");
    return { status: "success", message: "บันทึกแล้ว / Saved" };
  });
}

export async function deactivateEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = employeeIdSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };
    }

    const { employeeId } = parsed.data;

    if (employeeId === admin.id) {
      return {
        status: "error",
        message: "ไม่สามารถระงับบัญชีของตนเองได้ / You cannot deactivate your own account",
      };
    }

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      include: {
        _count: { select: { assignedTasks: { where: { status: { not: "COMPLETED" } } } } },
      },
    });

    if (!employee) {
      return { status: "error", message: "ไม่พบพนักงาน / Employee not found" };
    }

    if (employee._count.assignedTasks > 0) {
      return {
        status: "error",
        message: `พนักงานคนนี้ยังมีงานค้างอยู่ ${employee._count.assignedTasks} งาน กรุณาย้ายงานก่อน / ${employee._count.assignedTasks} open task(s) must be reassigned first`,
      };
    }

    // Refuse to remove the last administrator.
    if (employee.role === "ADMIN") {
      const remainingAdmins = await db.employee.count({
        where: { role: "ADMIN", isActive: true, id: { not: employeeId } },
      });
      if (remainingAdmins === 0) {
        return {
          status: "error",
          message: "ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน / At least one administrator must remain",
        };
      }
    }

    await db.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: { isActive: false, deactivatedAt: new Date() },
      });
      await writeAudit(
        {
          actor: admin,
          action: "employee.deactivated",
          entityType: "Employee",
          entityId: employeeId,
          metadata: { employeeCode: employee.employeeCode, fullName: employee.fullName },
        },
        tx,
      );
    });

    await revokeAllSessions(employeeId);
    revalidatePath("/admin/employees");

    return { status: "success", message: "ระงับบัญชีแล้ว / Account deactivated" };
  });
}

export async function reactivateEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = employeeIdSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };
    }

    const employee = await db.employee.update({
      where: { id: parsed.data.employeeId },
      data: { isActive: true, deactivatedAt: null, failedLoginAttempts: 0, lockedUntil: null },
    });

    await writeAudit({
      actor: admin,
      action: "employee.reactivated",
      entityType: "Employee",
      entityId: employee.id,
      metadata: { employeeCode: employee.employeeCode },
    });

    revalidatePath("/admin/employees");
    return { status: "success", message: "คืนสถานะแล้ว / Account reactivated" };
  });
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = employeeIdSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const employee = await db.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: parsed.data.employeeId },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await writeAudit(
        {
          actor: admin,
          action: "employee.password.reset",
          entityType: "Employee",
          entityId: updated.id,
          metadata: { employeeCode: updated.employeeCode },
        },
        tx,
      );
      return updated;
    });

    await revokeAllSessions(employee.id);
    revalidatePath("/admin/employees");

    return {
      status: "success",
      message: "รีเซ็ตรหัสผ่านแล้ว / Password reset",
      data: { employeeCode: employee.employeeCode, temporaryPassword },
    };
  });
}
