import {
  TaskCalendar,
  type CalendarTask,
  type CalendarTrip,
} from "@/components/task-calendar";
import type { SessionUser } from "@/lib/auth/session";
import {
  bangkokDayKey,
  dayKeyOf,
  monthGrid,
  monthOf,
  monthParam,
  parseMonthParam,
  shiftMonth,
  todayKey as currentDayKey,
} from "@/lib/calendar";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { mapsHref } from "@/lib/maps";
import { getSettings } from "@/lib/settings/server";
import { getFieldTripsInMonth, getTasksDueInMonth } from "@/server/queries";

/**
 * The calendar as it appears on a page: resolves which month to show from
 * ?cal=, fetches that month's deadlines and off-site days, and decides where
 * each entry links to.
 *
 * `linkTasksTo` is the join between the calendar and the task lists:
 *   "anchor" — the tasks are on this same page, so link to the card's id.
 *   "person" — they are not (an admin's dashboard shows people, not tasks), so
 *              link to the assignee's page, still anchored to the card.
 */
export async function CalendarSection({
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
  const [t, locale, settings] = await Promise.all([
    getTranslations(),
    getLocale(),
    getSettings(),
  ]);

  const today = currentDayKey();
  const { year, month } = parseMonthParam(cal, today);

  const [tasks, trips] = await Promise.all([
    getTasksDueInMonth(user, { year, month, assigneeId }),
    settings["fieldTrip.enabled"]
      ? getFieldTripsInMonth({ year, month, employeeId: assigneeId })
      : Promise.resolve([]),
  ]);

  const monthLabel = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const monthHref = (delta: number) =>
    `${basePath}?cal=${monthParam(shiftMonth({ year, month }, delta))}`;

  const taskEntries: CalendarTask[] = tasks.map((task) => ({
    id: task.id,
    code: task.code,
    title: task.title,
    status: task.status,
    priority: task.priority,
    // dueDate is non-null here: the query filters on a date range.
    dayKey: bangkokDayKey(task.dueDate!),
    assigneeCode: task.assignee.employeeCode,
    assigneeName: task.assignee.fullName,
    href:
      linkTasksTo === "anchor"
        ? `#task-${task.id}`
        : `/dashboard/employee/${task.assignee.id}#task-${task.id}`,
  }));

  /*
   * A trip covers a range; the calendar works in single days. Expanding here
   * keeps that difference out of the component — a trip from the 3rd to the 5th
   * becomes three entries, clipped to the month on show, so a trip crossing a
   * month boundary appears correctly in both. Cancelled trips are dropped: the
   * calendar answers "what is happening", and the schedule page is where a
   * cancellation and its reason are recorded.
   */
  const { daysInMonth } = monthGrid({ year, month });
  const tripEntries: CalendarTrip[] = [];

  for (const trip of trips) {
    if (trip.cancelledAt) continue;

    const from = bangkokDayKey(trip.startDate);
    const to = bangkokDayKey(trip.endDate);

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dayKeyOf({ year, month }, day);
      if (key < from || key > to) continue;

      tripEntries.push({
        id: `${trip.id}-${key}`,
        purpose: trip.purpose,
        dayKey: key,
        personCode: trip.employee.employeeCode,
        personName: trip.employee.fullName,
        locationName: trip.locationName,
        mapHref: mapsHref(trip),
      });
    }
  }

  return (
    <section className="space-y-3" id="calendar">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{t("calendar.title")}</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("calendar.hint")}
        </p>
      </header>

      <TaskCalendar
        // Remounting per month resets the selected day to that month's default.
        key={monthParam({ year, month })}
        year={year}
        month={month}
        monthLabel={monthLabel}
        todayKey={today}
        tasks={taskEntries}
        trips={tripEntries}
        prevHref={monthHref(-1)}
        nextHref={monthHref(1)}
        todayHref={`${basePath}?cal=${monthParam(monthOf(today))}`}
        showAssignee={user.role === "ADMIN"}
      />
    </section>
  );
}
