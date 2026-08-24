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
  formDataToObject,
  reopenTaskSchema,
  updateTaskStatusSchema,
} from "@/lib/validation";

import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Task lifecycle.
 *
 * The two dashboard sections map directly onto status:
 *   active  = status != COMPLETED
 *   history = status == COMPLETED
 *
 * Once a task is COMPLETED it becomes immutable to its assignee. Only an admin
 * can reopen it, and reopening is itself recorded — so the history section is
 * defensible as evidence rather than merely a filtered view.
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
