import type { Metadata } from "next";

import { CardGrid } from "@/components/card-grid";
import { EmployeeFrame } from "@/components/employee-frame";
import { PageShell } from "@/components/page-shell";
import { ScheduleRow } from "@/components/schedule-row";
import { SummaryTiles } from "@/components/summary-tiles";
import { ActiveTaskCard, CompletedTaskCard } from "@/components/task-card";
import { TaskSection } from "@/components/task-section";
import { TripHistory } from "@/components/trip-history";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";
import { getTranslations } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings/server";
import { serialiseTask } from "@/lib/serialise";
import {
  getActiveTasks,
  getCompletedTasks,
  getEmployeeWorkloads,
  getTaskSummary,
} from "@/server/queries";

export const metadata: Metadata = { title: "หน้าหลัก / Dashboard" };

/**
 * The main screen. What it shows depends on how many people the viewer can see:
 *
 *   Admin    — one frame per employee, each a link into that person's own page.
 *              The two sections (active / history) live there, per person,
 *              rather than as one undifferentiated pile of everyone's work.
 *   Employee — their own two sections directly, since they are the only person
 *              they can see and a one-frame grid would just be a detour.
 *
 * The narrowing is done by the query layer, not here.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cal?: string }>;
}) {
  const user = await requireUser();
  const { cal } = await searchParams;

  return user.role === "ADMIN" ? (
    <PeopleOverview user={user} cal={cal} />
  ) : (
    <PersonalBoard user={user} cal={cal} />
  );
}

/** Admin view: the workforce, one frame per person. */
async function PeopleOverview({ user, cal }: { user: SessionUser; cal?: string }) {
  const [t, settings] = await Promise.all([getTranslations(), getSettings()]);

  // Both switches are skipped reads, not hidden elements: an admin who turns
  // the strip off should stop paying for the aggregate that fills it. The
  // per-person read covers the frames *and* the capsules inside the strip,
  // which is why one switch governs both — they are the same data.
  const showSummary = settings["dashboard.showSummary"];
  const showPeople = settings["dashboard.showPeople"];

  const [summary, workloads] = await Promise.all([
    showSummary ? getTaskSummary(user) : Promise.resolve(null),
    showPeople ? getEmployeeWorkloads(user) : Promise.resolve([]),
  ]);

  return (
    <PageShell className="space-y-8">
      {summary && (
        <SummaryTiles summary={summary} people={showPeople ? workloads : undefined} />
      )}

      <ScheduleRow user={user} cal={cal} basePath="/dashboard" linkTasksTo="person" />

      {showPeople && (
      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("dashboard.byPerson")}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("dashboard.byPersonHint")}
          </p>
        </header>

        {workloads.length === 0 ? (
          <EmptyState label={t("dashboard.noEmployees")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {workloads.map((workload) => (
              <EmployeeFrame
                key={workload.id}
                workload={workload}
                isSelf={workload.id === user.id}
              />
            ))}
          </div>
        )}
      </section>
      )}
    </PageShell>
  );
}

/** Employee view: their own work, in the two sections the system exists for. */
async function PersonalBoard({ user, cal }: { user: SessionUser; cal?: string }) {
  const [t, settings] = await Promise.all([getTranslations(), getSettings()]);

  const [active, completed, summary] = await Promise.all([
    getActiveTasks(user),
    getCompletedTasks(user, { limit: 200 }),
    // Not fetched at all when the strip is off — see PeopleOverview.
    settings["dashboard.showSummary"] ? getTaskSummary(user) : Promise.resolve(null),
  ]);

  return (
    <PageShell className="space-y-8">
      {summary && <SummaryTiles summary={summary} />}

      <ScheduleRow user={user} cal={cal} basePath="/dashboard" linkTasksTo="anchor" />

      <TaskSection title={t("tasks.active")} hint={t("tasks.activeHint")}>
        {active.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <CardGrid>
            {active.map((task) => (
              <ActiveTaskCard
                key={task.id}
                task={serialiseTask(task)}
                canMutate={user.role === "ADMIN" || task.assignee.id === user.id}
              />
            ))}
          </CardGrid>
        )}
      </TaskSection>

      <TaskSection
        title={t("tasks.history")}
        hint={
          settings["dashboard.sharedHistory"]
            ? t("tasks.historySharedHint")
            : t("tasks.historyHint")
        }
        footnote={completed.length > 0 ? t("tasks.historyLocked") : undefined}
      >
        {completed.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <CardGrid>
            {completed.map((task) => (
              <CompletedTaskCard
                key={task.id}
                task={serialiseTask(task)}
                isAdmin={false}
              />
            ))}
          </CardGrid>
        )}
      </TaskSection>

      <TripHistory employeeId={user.id} />
    </PageShell>
  );
}
