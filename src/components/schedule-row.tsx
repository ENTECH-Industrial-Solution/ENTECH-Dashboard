import { AwayPanel } from "@/components/away-panel";
import { CalendarSection } from "@/components/calendar-section";
import type { SessionUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings/server";

/**
 * The calendar and the off-site panel, side by side.
 *
 * Kept together because they answer the same question from two angles — the
 * calendar by date, the panel by person — and because either can be switched
 * off independently. When only one is on it takes the full width rather than
 * leaving a two-thirds gap.
 */
export async function ScheduleRow({
  user,
  cal,
  basePath,
  assigneeId,
  linkTasksTo,
}: {
  user: SessionUser;
  cal?: string;
  basePath: string;
  assigneeId?: string;
  linkTasksTo: "anchor" | "person";
}) {
  const settings = await getSettings();
  const showCalendar = settings["dashboard.showCalendar"];
  const showAway = settings["fieldTrip.enabled"];

  if (!showCalendar && !showAway) return null;

  const both = showCalendar && showAway;

  return (
    <div className={`grid gap-4 ${both ? "lg:grid-cols-3" : ""}`}>
      {showCalendar && (
        <div className={both ? "lg:col-span-2" : undefined}>
          <CalendarSection
            user={user}
            cal={cal}
            basePath={basePath}
            assigneeId={assigneeId}
            linkTasksTo={linkTasksTo}
          />
        </div>
      )}

      {showAway && <AwayPanel employeeId={assigneeId} />}
    </div>
  );
}
