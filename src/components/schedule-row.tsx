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
    /*
     * `grid-cols-1` is load-bearing, not a tidy-up.
     *
     * A grid with no column template puts its items in an *implicit* track,
     * and an implicit track is `auto` — whose minimum is the content's
     * min-content width. The calendar's seven columns have a min-content width
     * of about 480px, so on a phone that track grew to 480 and took the whole
     * page with it: 375px of viewport scrolling 530px sideways. `grid-cols-1`
     * is `repeat(1, minmax(0, 1fr))`, and that 0 floor is what stops a wide
     * child from inflating the page.
     */
    <div className={`grid grid-cols-1 gap-4 ${both ? "lg:grid-cols-3" : ""}`}>
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

      {/*
        * Side by side, the calendar decides how tall the row is.
        *
        * Grid items stretch to the tallest, and the off-site panel was the
        * tallest — so a week with several trips dragged the row down and left
        * the two panels ending at different lines. Lifting it out of flow
        * (absolute inside a relative item) means it contributes no height at
        * all: the row is the calendar's, the panel stretches to exactly that,
        * and anything past it scrolls inside the panel.
        *
        * Only from `lg`, and only when both are shown — stacked, each takes its
        * natural height and there is nothing to align to.
        */}
      {showAway &&
        (both ? (
          <div className="relative">
            <div className="lg:absolute lg:inset-0">
              <AwayPanel user={user} employeeId={assigneeId} />
            </div>
          </div>
        ) : (
          <AwayPanel user={user} employeeId={assigneeId} />
        ))}
    </div>
  );
}
