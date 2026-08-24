import "server-only";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Read paths. Every function takes the caller's SessionUser and narrows the
 * query by it — an employee's dashboard can only ever select their own rows,
 * so there is no filter the client could tamper with to widen the result.
 */

export type TaskListItem = Awaited<ReturnType<typeof getActiveTasks>>[number];

const taskSelect = {
  id: true,
  code: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  completionNote: true,
  proofUrl: true,
  createdAt: true,
  assignee: { select: { id: true, employeeCode: true, fullName: true } },
  createdBy: { select: { employeeCode: true, fullName: true } },
} as const;

/** Section 1 of the dashboard: work still in progress. */
export async function getActiveTasks(user: SessionUser) {
  return db.task.findMany({
    where: {
      status: { not: "COMPLETED" },
      ...(user.role === "ADMIN" ? {} : { assigneeId: user.id }),
    },
    select: taskSelect,
    orderBy: [
      { priority: "desc" },
      { dueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });
}

/** Section 2 of the dashboard: the completed archive, newest first. */
export async function getCompletedTasks(user: SessionUser, limit = 100) {
  return db.task.findMany({
    where: {
      status: "COMPLETED",
      ...(user.role === "ADMIN" ? {} : { assigneeId: user.id }),
    },
    select: taskSelect,
    orderBy: { completedAt: "desc" },
    take: limit,
  });
}

export async function getTaskTimeline(taskId: string) {
  return db.taskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

/** Assignable employees for the task form — active accounts only. */
export async function getAssignableEmployees() {
  return db.employee.findMany({
    where: { isActive: true },
    select: { id: true, employeeCode: true, fullName: true, department: true },
    orderBy: { employeeCode: "asc" },
  });
}

export async function getEmployeesWithCounts() {
  return db.employee.findMany({
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      department: true,
      position: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      _count: {
        select: { assignedTasks: { where: { status: { not: "COMPLETED" } } } },
      },
    },
    orderBy: [{ isActive: "desc" }, { employeeCode: "asc" }],
  });
}

export async function getAuditLog(limit = 200) {
  return db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Headline counts for the dashboard summary strip. */
export async function getTaskSummary(user: SessionUser) {
  const scope = user.role === "ADMIN" ? {} : { assigneeId: user.id };
  const now = new Date();

  const [active, completed, overdue] = await Promise.all([
    db.task.count({ where: { ...scope, status: { not: "COMPLETED" } } }),
    db.task.count({ where: { ...scope, status: "COMPLETED" } }),
    db.task.count({
      where: { ...scope, status: { not: "COMPLETED" }, dueDate: { lt: now } },
    }),
  ]);

  return { active, completed, overdue };
}
