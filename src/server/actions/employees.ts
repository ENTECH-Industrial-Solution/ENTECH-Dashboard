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
  deleteEmployeeSchema,
  employeeIdSchema,
  formDataToObject,
  updateEmployeeSchema,
} from "@/lib/validation";

import { diffFields } from "./diff";
import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Admin-only employee provisioning.
 *
 * Deactivating is still the ordinary way an account ends: it blocks sign-in and
 * kills live sessions, while every task and audit row the person touched stays
 * intact — which is the whole point of the completed-task archive.
 *
 * `deleteEmployeeAction` is the exception, and it is deliberately hard to
 * reach: the account must already be deactivated, nothing may still point at
 * it, and a reason has to be typed. What that combination means is that the
 * only accounts it can remove are ones that left no history — a code entered
 * wrong, a duplicate, someone who never started. An account with work behind
 * it is refused, so no archive can lose the person it names.
 */

/** Everything an admin may edit, and the shape of the audit diff. */
const EDITABLE_FIELDS = [
  "employeeCode",
  "fullName",
  "email",
  "department",
  "position",
  "role",
] as const;

/**
 * Both unique columns raise the same Prisma error, so the field it names
 * decides which message the form gets.
 */
function duplicateField(error: unknown): "employeeCode" | "email" | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }

  const target = (error.meta?.target as string[] | undefined)?.[0];
  return target === "email" ? "email" : "employeeCode";
}

function duplicateState(field: "employeeCode" | "email"): ActionState {
  return {
    status: "error",
    message:
      field === "email"
        ? "อีเมลนี้ถูกใช้แล้ว / That email is already in use"
        : "รหัสพนักงานนี้ถูกใช้แล้ว / That employee code is already in use",
    fieldErrors: { [field]: "ถูกใช้แล้ว / Already in use" },
  };
}

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
      const field = duplicateField(error);
      if (field) return duplicateState(field);
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

    const changes = diffFields(EDITABLE_FIELDS, before, data);
    if (Object.keys(changes).length === 0) return { status: "success" };

    const roleChanged = changes.role !== undefined;
    const codeChanged = changes.employeeCode !== undefined;

    try {
      await db.$transaction(async (tx) => {
        await tx.employee.update({ where: { id: employeeId }, data });

        await writeAudit(
          {
            actor: admin,
            // The most consequential change names the row: a rename of the
            // login identifier is not the same event as a department being
            // corrected, and someone reading the trail should not have to open
            // the metadata to tell them apart.
            action: roleChanged
              ? "employee.role.changed"
              : codeChanged
                ? "employee.code.changed"
                : "employee.updated",
            entityType: "Employee",
            entityId: employeeId,
            // The code as it was, so a row about ENT-0002 can still be found
            // under that name after ENT-0002 has become something else.
            metadata: { employeeCode: before.employeeCode, changes },
          },
          tx,
        );
      });
    } catch (error) {
      const field = duplicateField(error);
      if (field) return duplicateState(field);
      throw error;
    }

    // A role change must take effect immediately, not at the next login. A code
    // change deliberately does not: the session is bound to the row's id, the
    // person keeps exactly the access they had, and only what they type at the
    // login form has moved. Signing them out would be a punishment for an
    // admin's correction.
    if (roleChanged) await revokeAllSessions(employeeId);

    revalidatePath("/admin/employees");

    return {
      status: "success",
      message: codeChanged
        ? `บันทึกแล้ว — เข้าสู่ระบบด้วยรหัส ${data.employeeCode} จากนี้ไป / Saved — they sign in as ${data.employeeCode} from now on`
        : "บันทึกแล้ว / Saved",
    };
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

/**
 * The one hard delete an account has, and the third in the application.
 *
 * Everything about it is a gate, because "employees are never hard-deleted" was
 * the right rule for the case it was written for — an account with work behind
 * it — and the wrong rule for the case it also caught: a code typed wrong, a
 * duplicate, a person who never signed in. Those leave a permanently
 * deactivated row that nobody can act on and everybody has to read past.
 *
 * So the gates keep the first case and let the second through:
 *
 *  - the account must already be deactivated, so deleting is the second half of
 *    a decision rather than the whole of one, and no live session is cut off
 *    mid-request (deactivation revoked them);
 *  - nothing may still reference it — a task assigned or created, a trip
 *    travelled or scheduled. Those foreign keys are `onDelete: Restrict` and
 *    would refuse anyway; checking first turns a database error into a sentence
 *    saying which work to move;
 *  - a reason has to be typed, and it goes into the audit row with a snapshot
 *    of the account, because afterwards that row is the only record it existed.
 *
 * The snapshot names its fields one at a time rather than spreading the row.
 * That is not style: `passwordHash` is on that row, the audit page renders
 * metadata, and this repository is public. A hash must never be copied into a
 * record that outlives the account it belonged to.
 *
 * What the person leaves behind survives them: TaskEvent.actorId and
 * AuditLog.actorId are `onDelete: SetNull`, and both carry a denormalised
 * `actorLabel`, so the trail keeps reading "ENT-0002 — สมหญิง" with nothing
 * left to point at.
 */
export async function deleteEmployeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = deleteEmployeeSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "กรุณาระบุเหตุผลในการลบ / A reason is required to delete",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { employeeId, reason } = parsed.data;

    if (employeeId === admin.id) {
      return {
        status: "error",
        message: "ไม่สามารถลบบัญชีของตนเองได้ / You cannot delete your own account",
      };
    }

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      include: {
        _count: {
          select: {
            assignedTasks: true,
            createdTasks: true,
            fieldTrips: true,
            createdFieldTrips: true,
            createdCustomerPins: true,
            createdCustomers: true,
            ownedCustomers: true,
            taskEvents: true,
            auditLogs: true,
          },
        },
      },
    });

    if (!employee) {
      return { status: "error", message: "ไม่พบพนักงาน / Employee not found" };
    }

    if (employee.isActive) {
      return {
        status: "error",
        message:
          "ต้องระงับบัญชีก่อนจึงจะลบถาวรได้ / Deactivate the account before deleting it",
      };
    }

    // Completed work counts here exactly as open work does. The archive is
    // evidence, and evidence whose author has been deleted is worth less than
    // an inactive row in a list.
    const held =
      employee._count.assignedTasks +
      employee._count.createdTasks +
      employee._count.fieldTrips +
      employee._count.createdFieldTrips +
      // Pins and leads this person filed. Counted here for the same reason
      // tasks are: both foreign keys are Restrict, so the delete would be
      // refused by the database anyway — counting first turns that into a
      // sentence naming what has to move. Customer.ownerId is deliberately
      // absent: it is SetNull, so an unclaimed lead cannot pin an account.
      employee._count.createdCustomerPins +
      employee._count.createdCustomers;

    if (held > 0) {
      return {
        status: "error",
        message: `ยังมีงาน การเดินทาง หรือหมุดลูกค้า ${held} รายการที่อ้างถึงบัญชีนี้ ต้องย้ายหรือลบก่อน / ${held} task(s), trip(s), or customer record(s) still reference this account`,
      };
    }

    await db.$transaction(async (tx) => {
      // Written before the delete and inside the same transaction: either both
      // happen or neither does, so an account cannot vanish unaccounted for.
      await writeAudit(
        {
          actor: admin,
          action: "employee.deleted",
          entityType: "Employee",
          entityId: employee.id,
          metadata: {
            reason,
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            email: employee.email,
            department: employee.department,
            position: employee.position,
            role: employee.role,
            createdAt: employee.createdAt.toISOString(),
            deactivatedAt: employee.deactivatedAt?.toISOString() ?? null,
            lastLoginAt: employee.lastLoginAt?.toISOString() ?? null,
            // Rows that keep their text and lose their link, counted so the
            // trail says how much of it just became authorless.
            orphanedTaskEvents: employee._count.taskEvents,
            orphanedAuditLogs: employee._count.auditLogs,
            orphanedCustomers: employee._count.ownedCustomers,
          },
        },
        tx,
      );

      // Session.employeeId is onDelete: Cascade; TaskEvent and AuditLog are
      // SetNull. Nothing else may point here — the check above is what makes
      // that true rather than a hope.
      await tx.employee.delete({ where: { id: employee.id } });
    });

    revalidatePath("/admin/employees");

    return {
      status: "success",
      message: `ลบบัญชี ${employee.employeeCode} ถาวรแล้ว / Account permanently deleted`,
    };
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
