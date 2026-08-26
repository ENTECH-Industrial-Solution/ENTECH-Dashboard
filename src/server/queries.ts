import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { dayStart, monthBounds, todayKey, type YearMonth } from "@/lib/calendar";
import { getSettings } from "@/lib/settings/server";
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
  startDate: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  completionNote: true,
  proofUrl: true,
  createdAt: true,
  assignee: { select: { id: true, employeeCode: true, fullName: true } },
  createdBy: { select: { employeeCode: true, fullName: true } },
} as const;

/**
 * Assignee narrowing for the per-person views.
 *
 * The `assigneeId` argument can only ever *narrow*: for a non-admin the scope
 * is pinned to their own id and the argument is discarded outright, never
 * merged over the scope. So a person id typed into the URL cannot widen a
 * result set — the worst an employee can do is ask for their own rows.
 */
function scopedAssigneeId(
  user: SessionUser,
  assigneeId?: string,
): string | undefined {
  if (user.role !== "ADMIN") return user.id;
  return assigneeId;
}

function assigneeScope(user: SessionUser, assigneeId?: string) {
  const id = scopedAssigneeId(user, assigneeId);
  return id ? { assigneeId: id } : {};
}

/**
 * The same narrowing as a SQL fragment, for the two aggregate reads below.
 *
 * Derived from scopedAssigneeId rather than restating the rule, so the "an
 * employee is pinned to their own id" invariant still lives in exactly one
 * place. The id is a bound parameter, never interpolated.
 */
function assigneeScopeSql(user: SessionUser, assigneeId?: string): Prisma.Sql {
  const id = scopedAssigneeId(user, assigneeId);
  return id ? Prisma.sql`WHERE "assigneeId" = ${id}` : Prisma.empty;
}

/**
 * Tables are addressed schema-qualified in raw SQL.
 *
 * The `app` schema is a security requirement (see CLAUDE.md — `public` is
 * exposed over PostgREST to Supabase's anon key), and it normally arrives via
 * `?schema=app` on the connection URL. Leaning on search_path here would make a
 * raw query silently read a different table if that ever changed; naming the
 * schema makes it fail loudly instead.
 */
const TASK_TABLE = Prisma.sql`app."Task"`;

/** Section 1 of the dashboard: work still in progress. */
export async function getActiveTasks(user: SessionUser, assigneeId?: string) {
  return db.task.findMany({
    where: {
      status: { not: "COMPLETED" },
      ...assigneeScope(user, assigneeId),
    },
    select: taskSelect,
    orderBy: [
      { priority: "desc" },
      { dueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });
}

/**
 * Section 2 of the dashboard: the completed archive, newest first.
 *
 * By default this is NOT narrowed to the caller — finished work is a shared
 * record every signed-in employee may read, which is the point of keeping it as
 * evidence. Reading is all it grants: cards render read-only for anyone who is
 * not the assignee, and reopening is still admin-only.
 *
 * An admin can revoke that with the `dashboard.sharedHistory` switch, and it is
 * enforced *here* rather than by hiding cards, so turning it off actually stops
 * the rows being selected. `assigneeId` only ever narrows further.
 */
export async function getCompletedTasks(
  user: SessionUser,
  { limit = 100, assigneeId }: { limit?: number; assigneeId?: string } = {},
) {
  const settings = await getSettings();
  const scope = settings["dashboard.sharedHistory"]
    ? assigneeId
      ? { assigneeId }
      : {}
    : assigneeScope(user, assigneeId);

  return db.task.findMany({
    where: {
      status: "COMPLETED",
      ...scope,
    },
    select: taskSelect,
    orderBy: { completedAt: "desc" },
    take: limit,
  });
}

/**
 * Everything due inside one Bangkok calendar month, for the dashboard calendar.
 *
 * Scoped per month rather than "all tasks with a due date" so the payload stays
 * the same size in year three as in week one; paging back and forward is a
 * fresh query, not a truncated cache that would quietly hide deadlines.
 */
export async function getTasksDueInMonth(
  user: SessionUser,
  { year, month, assigneeId }: YearMonth & { assigneeId?: string },
) {
  const { from, to } = monthBounds(year, month);

  return db.task.findMany({
    where: {
      ...assigneeScope(user, assigneeId),
      dueDate: { gte: from, lt: to },
    },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignee: { select: { id: true, employeeCode: true, fullName: true } },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { code: "asc" }],
  });
}

export async function getTaskTimeline(taskId: string) {
  return db.taskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

const fieldTripSelect = {
  id: true,
  purpose: true,
  locationName: true,
  address: true,
  latitude: true,
  longitude: true,
  mapUrl: true,
  startDate: true,
  endDate: true,
  note: true,
  cancelledAt: true,
  cancelledReason: true,
  employee: { select: { id: true, employeeCode: true, fullName: true } },
  createdBy: { select: { employeeCode: true, fullName: true } },
} as const;

export type FieldTripListItem = Awaited<ReturnType<typeof getFieldTrips>>[number];

/**
 * Who is off-site, and when.
 *
 * Takes no SessionUser, unlike the task reads: this is a shared schedule that
 * exists so people can see who is out of the office, so there is nothing to
 * narrow by caller. The page guard is what keeps it behind a login, and
 * `employeeId` narrows it to one person for the per-person view.
 *
 * "upcoming" keeps a trip visible through its final day rather than dropping it
 * the moment it starts — someone away today is exactly who you are looking for.
 */
export async function getFieldTrips({
  window,
  employeeId,
  limit = 100,
}: {
  window: "upcoming" | "past";
  employeeId?: string;
  limit?: number;
}) {
  const boundary = dayStart(todayKey());

  return db.fieldTrip.findMany({
    where: {
      ...(employeeId ? { employeeId } : {}),
      endDate: window === "upcoming" ? { gte: boundary } : { lt: boundary },
    },
    select: fieldTripSelect,
    orderBy: { startDate: window === "upcoming" ? "asc" : "desc" },
    take: limit,
  });
}

/**
 * Trips that touch a Bangkok calendar month, for the calendar. A trip counts if
 * any of its days fall inside the month, not only its first — a trip spanning a
 * month boundary belongs to both.
 */
export async function getFieldTripsInMonth({
  year,
  month,
  employeeId,
}: YearMonth & { employeeId?: string }) {
  const { from, to } = monthBounds(year, month);

  return db.fieldTrip.findMany({
    where: {
      ...(employeeId ? { employeeId } : {}),
      startDate: { lt: to },
      endDate: { gte: from },
    },
    select: fieldTripSelect,
    orderBy: { startDate: "asc" },
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

/**
 * Headline counts for the dashboard summary strip.
 *
 * One pass with FILTER clauses rather than three `count()` calls. The three
 * scan the same rows under the same scope and differ only in their predicate,
 * so three round trips bought nothing — and on the production pooler a round
 * trip is ~300ms, which the summary strip alone was spending twice over.
 */
export async function getTaskSummary(user: SessionUser, assigneeId?: string) {
  const scope = assigneeScopeSql(user, assigneeId);

  const rows = await db.$queryRaw<
    { active: bigint; completed: bigint; overdue: bigint }[]
  >`
    SELECT
      count(*) FILTER (WHERE status <> 'COMPLETED')                       AS active,
      count(*) FILTER (WHERE status =  'COMPLETED')                       AS completed,
      count(*) FILTER (WHERE status <> 'COMPLETED' AND "dueDate" < now()) AS overdue
    FROM ${TASK_TABLE}
    ${scope}
  `;

  // count() returns bigint, which does not survive the client boundary.
  const row = rows[0];
  return {
    active: Number(row?.active ?? 0),
    completed: Number(row?.completed ?? 0),
    overdue: Number(row?.overdue ?? 0),
  };
}

/** One person's frame on the dashboard: who they are plus their workload. */
export type EmployeeWorkload = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string | null;
  position: string | null;
  role: "ADMIN" | "EMPLOYEE";
  isActive: boolean;
  todo: number;
  inProgress: number;
  blocked: number;
  active: number;
  completed: number;
  overdue: number;
  nextDueDate: Date | null;
};

/**
 * The dashboard's per-person frames.
 *
 * Aggregated in the database rather than a query per employee, so the page cost
 * stays flat as headcount grows. This used to be three groupBy passes — one per
 * predicate — which is one scan of the same rows each. They collapse into a
 * single grouped pass with FILTER clauses, leaving two round trips: who the
 * people are, and what they are carrying.
 *
 * A non-admin only ever gets their own row.
 */
export async function getEmployeeWorkloads(
  user: SessionUser,
): Promise<EmployeeWorkload[]> {
  const employees = await db.employee.findMany({
    where: user.role === "ADMIN" ? {} : { id: user.id },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      department: true,
      position: true,
      role: true,
      isActive: true,
    },
    orderBy: [{ isActive: "desc" }, { employeeCode: "asc" }],
  });

  const ids = employees.map((e) => e.id);
  if (ids.length === 0) return [];

  const rows = await db.$queryRaw<
    {
      assigneeId: string;
      todo: bigint;
      inProgress: bigint;
      blocked: bigint;
      completed: bigint;
      overdue: bigint;
      nextDueDate: Date | null;
    }[]
  >`
    SELECT
      "assigneeId",
      count(*) FILTER (WHERE status = 'TODO')                              AS "todo",
      count(*) FILTER (WHERE status = 'IN_PROGRESS')                       AS "inProgress",
      count(*) FILTER (WHERE status = 'BLOCKED')                           AS "blocked",
      count(*) FILTER (WHERE status = 'COMPLETED')                         AS "completed",
      count(*) FILTER (WHERE status <> 'COMPLETED' AND "dueDate" < now())  AS "overdue",
      min("dueDate") FILTER (WHERE status <> 'COMPLETED')                  AS "nextDueDate"
    FROM ${TASK_TABLE}
    WHERE "assigneeId" = ANY(${ids})
    GROUP BY "assigneeId"
  `;

  // min() already ignores NULLs, so the old `dueDate: { not: null }` filter on
  // the next-due pass was redundant — a person with no dated work gets NULL
  // either way.
  const workloadBy = new Map(rows.map((row) => [row.assigneeId, row]));

  return employees.map((e) => {
    const w = workloadBy.get(e.id);
    const todo = Number(w?.todo ?? 0);
    const inProgress = Number(w?.inProgress ?? 0);
    const blocked = Number(w?.blocked ?? 0);

    return {
      ...e,
      todo,
      inProgress,
      blocked,
      active: todo + inProgress + blocked,
      completed: Number(w?.completed ?? 0),
      overdue: Number(w?.overdue ?? 0),
      nextDueDate: w?.nextDueDate ?? null,
    };
  });
}

/**
 * The header of a single person's page. Returns null — not a throw — when the
 * caller may not see this person, so the page can answer with notFound() and
 * avoid confirming whether the id exists at all.
 */
export async function getEmployeeProfile(user: SessionUser, employeeId: string) {
  if (user.role !== "ADMIN" && user.id !== employeeId) return null;

  return db.employee.findUnique({
    where: { id: employeeId },
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
    },
  });
}
