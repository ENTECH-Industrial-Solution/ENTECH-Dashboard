import type { Metadata } from "next";

import { CardGrid } from "@/components/card-grid";
import { ActiveTaskCard, CompletedTaskCard } from "@/components/task-card";
import { TaskSection } from "@/components/task-section";
import { EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { serialiseTask, serialiseTrip } from "@/lib/serialise";
import { getSettings } from "@/lib/settings/server";
import {
  getActiveTasks,
  getAssignableEmployees,
  getCompletedTasks,
  getFieldTrips,
} from "@/server/queries";

import { TaskCreator } from "./task-creator";
import { TripSections } from "./trip-sections";

export const metadata: Metadata = { title: "งานทั้งหมด / All tasks" };

/**
 * Admin view: assign work of either kind, and see every employee's tasks and
 * off-site days in one place. Trips have no page of their own — assigning one
 * is assigning work, so it starts from the same button as a task.
 */
export default async function AdminTasksPage() {
  const admin = await requireAdmin();
  const [t, locale, settings] = await Promise.all([
    getTranslations(),
    getLocale(),
    getSettings(),
  ]);

  const tripsEnabled = settings["fieldTrip.enabled"];

  const [assignees, active, completed, upcomingTrips, pastTrips] =
    await Promise.all([
      getAssignableEmployees(),
      getActiveTasks(admin),
      getCompletedTasks(admin, { limit: 200 }),
      tripsEnabled ? getFieldTrips({ window: "upcoming" }) : Promise.resolve([]),
      tripsEnabled
        ? getFieldTrips({ window: "past", limit: 50 })
        : Promise.resolve([]),
    ]);

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("nav.allTasks")}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("app.tagline")}
          </p>
        </div>
        <TaskCreator assignees={assignees} tripsEnabled={tripsEnabled} />
      </header>

      <TaskSection title={t("tasks.active")} hint={t("tasks.activeHint")}>
        {active.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <CardGrid>
            {active.map((task) => (
              <ActiveTaskCard
                key={task.id}
                task={serialiseTask(task)}
                canMutate
                isAdmin
                assignees={assignees}
              />
            ))}
          </CardGrid>
        )}
      </TaskSection>

      {tripsEnabled && (
        <TripSections
          upcoming={upcomingTrips.map((trip) => serialiseTrip(trip, locale))}
          past={pastTrips.map((trip) => serialiseTrip(trip, locale))}
          people={assignees}
        />
      )}

      <TaskSection
        title={t("tasks.history")}
        hint={t("tasks.historyHint")}
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
                isAdmin
                assignees={assignees}
              />
            ))}
          </CardGrid>
        )}
      </TaskSection>
    </div>
  );
}

