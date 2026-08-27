"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { assertAdmin, assertUser, canMutateTask } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import {
  completeTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  formDataToObject,
  reopenTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from "@/lib/validation";

import { diffFields } from "./diff";
import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Task lifecycle.
 *
 * The two dashboard sections map directly onto status:
 *   active  = status != COMPLETED
 *   history = status == COMPLETED
 *
 * Once a task is COMPLETED its *lifecycle* is closed to its assignee: only an
 * admin can reopen it, and reopening is itself recorded.
 *
 * Its *content* is a separate question, and the answer here is that an admin
 * may correct it at any point, archived or not (updateTaskAction). That is a
 * deliberate trade. What makes the history section defensible was never that
 * nothing could touch it — a wrong record defended to the death is not
 * evidence, it is just a wrong record. What makes it defensible is that every
 * change to it is attributed, timestamped, and states what it changed from.
 * So the edit is granted and the accounting is what is made non-optional: an
 * UPDATED TaskEvent and an AuditLog row carrying a field-by-field before/after,
 * written in the same transaction as the edit itself.
 */

/** Allocates the next TSK-###### reference atomically. */
async function nextTaskCode(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { name: "task" },
    create: { name: "task", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `TSK-${String(counter.value).padStart(6, "0")}`;
}

function actorLabel(user: SessionUser): string {
  return `${user.employeeCode} — ${user.fullName}`;
}

/**
 * The fields updateTaskAction may write, and the ones it diffs. Named once so
 * the schema, the write, and the audit trail cannot disagree about what an
 * "edit" covers.
 */
const EDITABLE_FIELDS = [
  "title",
  "description",
  "assigneeId",
  "priority",
  "startDate",
  "dueDate",
  "completionNote",
  "proofUrl",
] as const;

export async function createTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    // Only admins assign work; employees complete what they are given.
    const admin = await assertAdmin();
    const parsed = createTaskSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const assignee = await db.employee.findUnique({
      where: { id: parsed.data.assigneeId },
      select: { id: true, isActive: true, employeeCode: true },
    });

    if (!assignee || !assignee.isActive) {
      return {
        status: "error",
        message: "ไม่สามารถมอบหมายงานให้บัญชีที่ถูกระงับ / Cannot assign to an inactive account",
        fieldErrors: { assigneeId: "ไม่พร้อมใช้งาน / Unavailable" },
      };
    }

    await db.$transaction(async (tx) => {
      const code = await nextTaskCode(tx);
      const task = await tx.task.create({
        data: { ...parsed.data, code, createdById: admin.id },
      });

      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: admin.id,
          actorLabel: actorLabel(admin),
          type: "CREATED",
          toStatus: task.status,
          note: `มอบหมายให้ ${assignee.employeeCode}`,
        },
      });

      await writeAudit(
        {
          actor: admin,
          action: "task.created",
          entityType: "Task",
          entityId: task.id,
          metadata: { code: task.code, title: task.title, assignee: assignee.employeeCode },
        },
        tx,
      );
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    return { status: "success", message: "สร้างงานเรียบร้อย / Task created" };
  });
}

export async function updateTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    // Admin-only, like createTaskAction: changing a task's assignee, priority,
    // or deadline is assigning work, not doing it. An employee still moves
    // their own task along its lifecycle — that is what the status and complete
    // actions are for, and they remain open to the assignee.
    const admin = await assertAdmin();
    const parsed = updateTaskSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { taskId, ...data } = parsed.data;

    const before = await db.task.findUnique({ where: { id: taskId } });
    if (!before) return { status: "error", message: "ไม่พบงาน / Task not found" };

    const assignee = await db.employee.findUnique({
      where: { id: data.assigneeId },
      select: { isActive: true, employeeCode: true },
    });

    // Reassigning onto a suspended account would strand the work somewhere
    // nobody can sign in to reach, exactly as it would at creation.
    if (!assignee || !assignee.isActive) {
      return {
        status: "error",
        message:
          "ไม่สามารถมอบหมายงานให้บัญชีที่ถูกระงับ / Cannot assign to an inactive account",
        fieldErrors: { assigneeId: "ไม่พร้อมใช้งาน / Unavailable" },
      };
    }

    const changes = diffFields(EDITABLE_FIELDS, before, data);
    if (Object.keys(changes).length === 0) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data });

      await tx.taskEvent.create({
        data: {
          taskId,
          actorId: admin.id,
          actorLabel: actorLabel(admin),
          type: "UPDATED",
          note: `แก้ไข: ${Object.keys(changes).join(", ")}`,
        },
      });

      await writeAudit(
        {
          actor: admin,
          action: "task.updated",
          entityType: "Task",
          entityId: taskId,
          // The archive flag is worth its own key rather than being inferred
          // from the status field: "this edit touched a completed task" is the
          // thing someone auditing the archive is scanning for.
          metadata: { code: before.code, archived: before.status === "COMPLETED", changes },
        },
        tx,
      );
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    return { status: "success", message: "บันทึกแล้ว / Saved" };
  });
}

export async function updateTaskStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = updateTaskStatusSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };
    }

    const task = await db.task.findUnique({ where: { id: parsed.data.taskId } });
    if (!task) return { status: "error", message: "ไม่พบงาน / Task not found" };

    if (!canMutateTask(user, task)) {
      return { status: "error", message: "ไม่มีสิทธิ์แก้ไขงานนี้ / Not authorized for this task" };
    }

    // Completed tasks are evidence. Moving one back out of the archive is a
    // deliberate admin action with a recorded reason — see reopenTaskAction.
    if (task.status === "COMPLETED") {
      return {
        status: "error",
        message:
          "งานที่เสร็จแล้วถูกล็อกไว้เป็นหลักฐาน / Completed tasks are locked as evidence",
      };
    }

    const { status, note } = parsed.data;
    if (status === task.status) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status,
          startedAt:
            status === "IN_PROGRESS" && !task.startedAt ? new Date() : task.startedAt,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          actorLabel: actorLabel(user),
          type: "STATUS_CHANGED",
          fromStatus: task.status,
          toStatus: status,
          note,
        },
      });

      await writeAudit(
        {
          actor: user,
          action: "task.status.changed",
          entityType: "Task",
          entityId: task.id,
          metadata: { code: task.code, from: task.status, to: status },
        },
        tx,
      );
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    return { status: "success" };
  });
}

export async function completeTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = completeTaskSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const task = await db.task.findUnique({ where: { id: parsed.data.taskId } });
    if (!task) return { status: "error", message: "ไม่พบงาน / Task not found" };

    if (!canMutateTask(user, task)) {
      return { status: "error", message: "ไม่มีสิทธิ์แก้ไขงานนี้ / Not authorized for this task" };
    }

    if (task.status === "COMPLETED") {
      return { status: "error", message: "งานนี้เสร็จแล้ว / Task is already complete" };
    }

    const completedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          completedAt,
          completionNote: parsed.data.completionNote,
          proofUrl: parsed.data.proofUrl,
          startedAt: task.startedAt ?? completedAt,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: user.id,
          actorLabel: actorLabel(user),
          type: "COMPLETED",
          fromStatus: task.status,
          toStatus: "COMPLETED",
          note: parsed.data.completionNote,
        },
      });

      await writeAudit(
        {
          actor: user,
          action: "task.completed",
          entityType: "Task",
          entityId: task.id,
          metadata: { code: task.code, title: task.title },
        },
        tx,
      );
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    return { status: "success", message: "บันทึกงานที่เสร็จแล้ว / Task completed" };
  });
}

export async function reopenTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    // Admin-only: this is the one path that moves a task back out of the
    // evidence archive, so it demands a reason and is always audited.
    const admin = await assertAdmin();
    const parsed = reopenTaskSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "กรุณาระบุเหตุผล / A reason is required",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const task = await db.task.findUnique({ where: { id: parsed.data.taskId } });
    if (!task) return { status: "error", message: "ไม่พบงาน / Task not found" };
    if (task.status !== "COMPLETED") {
      return { status: "error", message: "งานนี้ยังไม่เสร็จ / Task is not completed" };
    }

    await db.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        // completionNote and proofUrl are intentionally preserved: the record of
        // what was originally claimed as done must survive the reopen.
        data: { status: "IN_PROGRESS", completedAt: null },
      });

      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          actorId: admin.id,
          actorLabel: actorLabel(admin),
          type: "REOPENED",
          fromStatus: "COMPLETED",
          toStatus: "IN_PROGRESS",
          note: parsed.data.reason,
        },
      });

      await writeAudit(
        {
          actor: admin,
          action: "task.reopened",
          entityType: "Task",
          entityId: task.id,
          metadata: {
            code: task.code,
            reason: parsed.data.reason,
            originalCompletedAt: task.completedAt?.toISOString() ?? null,
          },
        },
        tx,
      );
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    return { status: "success", message: "เปิดงานใหม่แล้ว / Task reopened" };
  });
}

/**
 * Delete a task, permanently.
 *
 * The one action in this file that destroys rather than records, and the only
 * hard delete anywhere in the app — employees are deactivated, trips are
 * cancelled, and completed tasks are archived. It exists because a tracker
 * accumulates mistakes (a task raised twice, a test row, work that turned out
 * not to be work) and a record of something that never happened is not
 * evidence, it is noise in the evidence.
 *
 * What keeps it honest is that the deletion is itself a record. `TaskEvent`
 * rows cascade away with the task — the trail dies with the thing it describes
 * — so this snapshots the whole task *and* its event history into the audit row
 * before the delete runs, inside the same transaction. After this, that row is
 * the only account of the task that ever existed, which is why the reason is
 * mandatory: there is nothing left to infer it from.
 *
 * It is deliberately not offered to an assignee. Someone deleting their own
 * assigned work is the single case this affordance must not make easy.
 */
export async function deleteTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = deleteTaskSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "กรุณาระบุเหตุผลในการลบ / A reason is required to delete",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { taskId, reason } = parsed.data;

    // One read, everything the snapshot needs: the task, who it belonged to,
    // and the trail that is about to cascade away with it.
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { employeeCode: true, fullName: true } },
        createdBy: { select: { employeeCode: true, fullName: true } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!task) return { status: "error", message: "ไม่พบงาน / Task not found" };

    await db.$transaction(async (tx) => {
      // Written before the delete, and in the same transaction as it: either
      // both happen or neither does, so a task cannot vanish unaccounted for.
      await writeAudit(
        {
          actor: admin,
          action: "task.deleted",
          entityType: "Task",
          entityId: task.id,
          metadata: {
            reason,
            code: task.code,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            assignee: `${task.assignee.employeeCode} — ${task.assignee.fullName}`,
            createdBy: `${task.createdBy.employeeCode} — ${task.createdBy.fullName}`,
            startDate: task.startDate?.toISOString() ?? null,
            dueDate: task.dueDate?.toISOString() ?? null,
            startedAt: task.startedAt?.toISOString() ?? null,
            completedAt: task.completedAt?.toISOString() ?? null,
            completionNote: task.completionNote,
            proofUrl: task.proofUrl,
            createdAt: task.createdAt.toISOString(),
            // The trail dies with the task, so it travels into the snapshot
            // rather than being left to a foreign key that no longer resolves.
            events: task.events.map((event) => ({
              at: event.createdAt.toISOString(),
              type: event.type,
              actor: event.actorLabel,
              fromStatus: event.fromStatus,
              toStatus: event.toStatus,
              note: event.note,
            })),
          },
        },
        tx,
      );

      // TaskEvent.taskId is onDelete: Cascade, so this takes the trail with it.
      await tx.task.delete({ where: { id: task.id } });
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    return { status: "success", message: "ลบงานแล้ว / Task deleted" };
  });
}
