import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { ProjectOptionsProvider } from "@/components/project-picker";
import { requireAdmin } from "@/lib/auth/rbac";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { serialiseTask, serialiseTrip } from "@/lib/serialise";
import { getSettings } from "@/lib/settings/server";
import {
  getActiveTasks,
  getAssignableEmployees,
  getCompletedTasks,
  getCustomerPinOptions,
  getFieldTrips,
  getProjectOptions,
} from "@/server/queries";

import { TaskCreator } from "./task-creator";
import { TaskLists } from "./task-lists";
import { TripSections } from "./trip-sections";

export const metadata: Metadata = { title: "งานทั้งหมด / All tasks" };

/** How many completed tasks the page loads; TaskLists says so when it is reached. */
const COMPLETED_LIMIT = 200;

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
  // Both switches have to be on for the pin picker to mean anything: it only
  // appears on the trip form, and it can only offer places the map holds. The
  // read is skipped rather than the list hidden, which is what `reads` on
  // `customer.enabled` claims — see SETTING_IMPACT.
  const pinsEnabled = tripsEnabled && settings["customer.enabled"];

  const [assignees, active, completed, upcomingTrips, pastTrips, pins, projects] =
    await Promise.all([
      getAssignableEmployees(),
      getActiveTasks(admin),
      getCompletedTasks(admin, { limit: COMPLETED_LIMIT }),
      tripsEnabled ? getFieldTrips({ window: "upcoming" }) : Promise.resolve([]),
      tripsEnabled
        ? getFieldTrips({ window: "past", limit: 50 })
        : Promise.resolve([]),
      pinsEnabled ? getCustomerPinOptions() : Promise.resolve([]),
      getProjectOptions(),
    ]);

  return (
    <ProjectOptionsProvider options={projects}>
      <PageShell className="space-y-8">
        <header className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t("nav.allTasks")}</h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("app.tagline")}
            </p>
          </div>
          <TaskCreator
            assignees={assignees}
            tripsEnabled={tripsEnabled}
            pins={pins}
          />
        </header>

        <TaskLists
          active={active.map(serialiseTask)}
          completed={completed.map(serialiseTask)}
          completedLimit={COMPLETED_LIMIT}
          assignees={assignees}
        >
          {tripsEnabled && (
            <TripSections
              upcoming={upcomingTrips.map((trip) => serialiseTrip(trip, locale))}
              past={pastTrips.map((trip) => serialiseTrip(trip, locale))}
              people={assignees}
              pins={pins}
            />
          )}
        </TaskLists>
      </PageShell>
    </ProjectOptionsProvider>
  );
}

