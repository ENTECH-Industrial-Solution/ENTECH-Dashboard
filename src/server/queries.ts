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
 * The same narrowing for FieldTrip, whose owner column is `employeeId`.
 *
 * A column name cannot be a bound parameter, so the two are written out rather
 * than interpolated — the id stays bound either way.
 *
 * Note this is *stricter* than `getFieldTrips()`, which narrows by nobody
 * because the schedule is shared. That is the right direction: the summary
 * strip answers "what am I carrying", and one person's number has no business
 * counting another person's trip.
 */
function travellerScopeSql(user: SessionUser, assigneeId?: string): Prisma.Sql {
  const id = scopedAssigneeId(user, assigneeId);
  return id ? Prisma.sql`WHERE "employeeId" = ${id}` : Prisma.empty;
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
const TRIP_TABLE = Prisma.sql`app."FieldTrip"`;

/**
 * A trip's three states, as SQL, matching what the cards and the actions mean
 * by them. Cancelled trips count as nothing at all — they did not happen.
 *
 * "Overdue" is measured against the start of today in Bangkok rather than
 * `now()`, because a trip's `endDate` is the *inclusive* last day: a trip
 * ending today is still running today, and `endDate < now()` would call it late
 * from one minute past midnight. That boundary is the same one `getFieldTrips`
 * splits upcoming from past on.
 */
const TRIP_ACTIVE = Prisma.sql`"cancelledAt" IS NULL AND "completedAt" IS NULL`;
const TRIP_COMPLETED = Prisma.sql`"completedAt" IS NOT NULL`;
const tripOverdue = (boundary: Date) =>
  Prisma.sql`${TRIP_ACTIVE} AND "endDate" < ${boundary}`;

/** count() returns bigint, which does not survive the client boundary. */
function total(rows: Record<string, bigint>[], column: string): number {
  return rows.reduce((sum, row) => sum + Number(row[column] ?? 0), 0);
}

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
 * Everything that lands inside one Bangkok calendar month, for the dashboard
 * calendar: work that *starts* in it as well as work that *falls due* in it.
 *
 * Either date qualifies, hence the OR — a task planned to start on the 3rd and
 * finish on the 40th belongs to both months, and a task with only a start date
 * belongs to the calendar as much as one with only a deadline. Which of the two
 * dates put a task in the result is not decided here: `CalendarSection` expands
 * each row into one entry per date it owns in the month.
 *
 * Scoped per month rather than "every task with a date" so the payload stays
 * the same size in year three as in week one; paging back and forward is a
 * fresh query, not a truncated cache that would quietly hide a deadline.
 */
export async function getTasksInMonth(
  user: SessionUser,
  { year, month, assigneeId }: YearMonth & { assigneeId?: string },
) {
  const { from, to } = monthBounds(year, month);
  const inMonth = { gte: from, lt: to };

  return db.task.findMany({
    where: {
      ...assigneeScope(user, assigneeId),
      OR: [{ dueDate: inMonth }, { startDate: inMonth }],
    },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      priority: true,
      startDate: true,
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
  startedAt: true,
  completedAt: true,
  completionNote: true,
  proofUrl: true,
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
 *
 * The split is by date alone. Completing a trip does not move it out of the
 * current window, exactly as cancelling one does not: both stay in the list
 * they were in, wearing the badge that says what became of them, and roll into
 * the past when their days are over. Nothing is ever deleted, so "past" is the
 * permanent record — an employee's own copy of it is on their page, and the
 * whole company's is on /admin/tasks.
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
 *
 * Field trips are counted alongside tasks, in all three numbers rather than
 * only the finished one. Counting a trip when it is done but not while it is
 * pending would make "completed" climb without "active" ever falling, and the
 * three would stop describing one pool of work. A `UNION ALL` keeps that second
 * table inside the same single round trip; the two rows are added up here.
 */
export async function getTaskSummary(user: SessionUser, assigneeId?: string) {
  const taskScope = assigneeScopeSql(user, assigneeId);
  const tripScope = travellerScopeSql(user, assigneeId);
  const boundary = dayStart(todayKey());

  const rows = await db.$queryRaw<
    { active: bigint; completed: bigint; overdue: bigint }[]
  >`
    SELECT
      count(*) FILTER (WHERE status <> 'COMPLETED')                       AS active,
      count(*) FILTER (WHERE status =  'COMPLETED')                       AS completed,
      count(*) FILTER (WHERE status <> 'COMPLETED' AND "dueDate" < now()) AS overdue
    FROM ${TASK_TABLE}
    ${taskScope}
    UNION ALL
    SELECT
      count(*) FILTER (WHERE ${TRIP_ACTIVE}),
      count(*) FILTER (WHERE ${TRIP_COMPLETED}),
      count(*) FILTER (WHERE ${tripOverdue(boundary)})
    FROM ${TRIP_TABLE}
    ${tripScope}
  `;

  return {
    active: total(rows, "active"),
    completed: total(rows, "completed"),
    overdue: total(rows, "overdue"),
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
  /**
   * Task statuses, and task-only: a field trip has no TODO or BLOCKED to be in.
   */
  todo: number;
  inProgress: number;
  blocked: number;
  /**
   * All unfinished work, tasks *and* trips — so this is deliberately not
   * `todo + inProgress + blocked`. Same for the two below. They line up with
   * `getTaskSummary()`, which is the number these break down.
   */
  active: number;
  completed: number;
  overdue: number;
  /** Task deadlines only; a trip is a span, not a due date. */
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

  const boundary = dayStart(todayKey());

  /*
   * Two grouped passes, run together rather than one UNION.
   *
   * The round-trip count is what matters and it is unchanged at two — these
   * two go out concurrently on separate connections, which is exactly what
   * `connection_limit` above 1 is for. Unioning them would have meant padding
   * the trip side with three zero columns and a NULL timestamp to match the
   * task side's shape, for no saving.
   */
  const [taskRows, tripRows] = await Promise.all([
    db.$queryRaw<
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
    `,
    db.$queryRaw<
      {
        employeeId: string;
        active: bigint;
        completed: bigint;
        overdue: bigint;
      }[]
    >`
      SELECT
        "employeeId",
        count(*) FILTER (WHERE ${TRIP_ACTIVE})              AS "active",
        count(*) FILTER (WHERE ${TRIP_COMPLETED})           AS "completed",
        count(*) FILTER (WHERE ${tripOverdue(boundary)})    AS "overdue"
      FROM ${TRIP_TABLE}
      WHERE "employeeId" = ANY(${ids})
      GROUP BY "employeeId"
    `,
  ]);

  // min() already ignores NULLs, so the old `dueDate: { not: null }` filter on
  // the next-due pass was redundant — a person with no dated work gets NULL
  // either way.
  const workloadBy = new Map(taskRows.map((row) => [row.assigneeId, row]));
  const tripsBy = new Map(tripRows.map((row) => [row.employeeId, row]));

  return employees.map((e) => {
    const w = workloadBy.get(e.id);
    const trips = tripsBy.get(e.id);

    const todo = Number(w?.todo ?? 0);
    const inProgress = Number(w?.inProgress ?? 0);
    const blocked = Number(w?.blocked ?? 0);

    return {
      ...e,
      // The three status counts stay task-only: they name TaskStatus values,
      // and a trip has no TODO/BLOCKED to be in. `active` is the total, so it
      // is no longer their sum — see EmployeeWorkload.
      todo,
      inProgress,
      blocked,
      active: todo + inProgress + blocked + Number(trips?.active ?? 0),
      completed: Number(w?.completed ?? 0) + Number(trips?.completed ?? 0),
      overdue: Number(w?.overdue ?? 0) + Number(trips?.overdue ?? 0),
      nextDueDate: w?.nextDueDate ?? null,
    };
  });
}

/** Which of the summary strip's three numbers a breakdown is drilling into. */
export type WorkloadMetric = "active" | "overdue" | "completed";

/**
 * One line in an opened capsule. Tasks and trips are flattened onto one shape
 * here rather than in the component: a capsule is drilling into a *number*, and
 * that number does not distinguish them either.
 *
 * `status` reuses TaskStatus so both kinds wear the same badge — a trip maps
 * scheduled -> TODO, on-site -> IN_PROGRESS, closed out -> COMPLETED. A
 * cancelled trip has no mapping because it is never counted.
 */
export type WorkloadEntry = {
  id: string;
  kind: "task" | "trip";
  /** TSK-000123 for a task. A trip has no reference of its own. */
  code: string | null;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  /** A task's deadline, or a trip's inclusive last day. */
  dueDate: Date | null;
  completedAt: Date | null;
  /** Sorts tasks among themselves; null for a trip, which has no priority. */
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
};

const PRIORITY_RANK = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 } as const;

/**
 * The work behind one person's number in the summary strip.
 *
 * Read on demand — when someone opens a capsule — rather than with the page.
 * The strip carries up to twelve capsules and almost nobody opens more than
 * one, so loading every list up front would add round trips (and the whole
 * company's rows) to a page that currently makes three. See "Round trips are
 * the performance budget" in CLAUDE.md.
 *
 * The predicates are the ones `getTaskSummary()` counts with, on both tables,
 * so a list can never disagree with the number that opened it. `limit` is what
 * makes this cheap: the capsule already states the total, so the list only has
 * to show the first few and say how many it left out. Each side is capped at
 * `limit` before the merge, so the merge can never be larger than 2 x limit.
 *
 * Ordering is by date rather than by priority, which is a change from when this
 * listed tasks alone: merging two kinds of work needs one key both of them
 * have, and the date is the only one. Priority survives as a tiebreaker among
 * tasks, so equal-dated work still leads with the most pressing.
 *
 * `assigneeId` is passed through the same scoping helpers, so for a non-admin
 * it is discarded and the scope stays pinned to their own rows — someone else's
 * id in the payload cannot widen anything.
 */
export async function getWorkloadTasks(
  user: SessionUser,
  {
    assigneeId,
    metric,
    limit = 5,
  }: { assigneeId: string; metric: WorkloadMetric; limit?: number },
): Promise<WorkloadEntry[]> {
  const taskPredicate =
    metric === "completed"
      ? { status: "COMPLETED" as const }
      : metric === "overdue"
        ? { status: { not: "COMPLETED" as const }, dueDate: { lt: new Date() } }
        : { status: { not: "COMPLETED" as const } };

  const boundary = dayStart(todayKey());
  const tripPredicate =
    metric === "completed"
      ? { completedAt: { not: null } }
      : metric === "overdue"
        ? { cancelledAt: null, completedAt: null, endDate: { lt: boundary } }
        : { cancelledAt: null, completedAt: null };

  const tripScope = scopedAssigneeId(user, assigneeId);

  const [tasks, trips] = await Promise.all([
    db.task.findMany({
      where: { ...assigneeScope(user, assigneeId), ...taskPredicate },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
      },
      orderBy:
        metric === "completed"
          ? [{ completedAt: "desc" as const }]
          : [{ dueDate: { sort: "asc" as const, nulls: "last" as const } }],
      take: limit,
    }),
    db.fieldTrip.findMany({
      // scopedAssigneeId, not the raw argument: for a non-admin it answers with
      // their own id whatever was asked for.
      where: { ...(tripScope ? { employeeId: tripScope } : {}), ...tripPredicate },
      select: {
        id: true,
        purpose: true,
        startedAt: true,
        endDate: true,
        completedAt: true,
      },
      orderBy:
        metric === "completed"
          ? [{ completedAt: "desc" as const }]
          : [{ endDate: "asc" as const }],
      take: limit,
    }),
  ]);

  const entries: WorkloadEntry[] = [
    ...tasks.map((task) => ({
      id: task.id,
      kind: "task" as const,
      code: task.code,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      priority: task.priority,
    })),
    ...trips.map((trip) => ({
      id: trip.id,
      kind: "trip" as const,
      code: null,
      title: trip.purpose,
      status: (trip.completedAt
        ? "COMPLETED"
        : trip.startedAt
          ? "IN_PROGRESS"
          : "TODO") as WorkloadEntry["status"],
      dueDate: trip.endDate,
      completedAt: trip.completedAt,
      priority: null,
    })),
  ];

  const time = (date: Date | null) => date?.getTime() ?? null;

  entries.sort((a, b) => {
    if (metric === "completed") {
      // Most recently finished first. Both kinds always have the timestamp.
      return (time(b.completedAt) ?? 0) - (time(a.completedAt) ?? 0);
    }

    // Soonest first, undated last — the same "nulls last" the task list used.
    const left = time(a.dueDate);
    const right = time(b.dueDate);
    if (left !== right) {
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    }

    const rank = (entry: WorkloadEntry) =>
      entry.priority === null ? -1 : PRIORITY_RANK[entry.priority];
    return rank(b) - rank(a);
  });

  return entries.slice(0, limit);
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
