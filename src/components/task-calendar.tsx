"use client";

import Link from "next/link";
import { useState } from "react";

import { PriorityBadge, StatusBadge } from "@/components/ui";
import { dayKeyOf, monthGrid } from "@/lib/calendar";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import type { Locale, TranslationKey } from "@/lib/i18n/dictionaries";

/**
 * A month of deadlines and off-site days, wired to the lists on the same screen.
 *
 * Clicking a day shows what falls on it: who is away, and what is due. A trip
 * row carries its own Google Maps link; a task row goes to that task's card —
 * an anchor on this page when the task is listed below, or the assignee's page
 * when it is not. Every href is built on the server, because a function prop
 * cannot cross into a client component.
 *
 * Month paging is a real navigation (?cal=YYYY-MM), not client state, so every
 * month is a fresh query and no deadline can hide outside a cached window. The
 * parent remounts this per month with a key, which resets the selected day.
 */

export type CalendarTask = {
  id: string;
  /**
   * Which of the task's two dates put it on this day. One task can produce two
   * entries in a month — the day it is planned to start and the day it falls
   * due — and they are not the same claim, so the calendar draws them apart.
   */
  kind: "due" | "start";
  code: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  /** "YYYY-MM-DD" in Asia/Bangkok, bucketed server-side. */
  dayKey: string;
  assigneeCode: string;
  assigneeName: string;
  href: string;
};

/**
 * One day of one trip: a trip spanning three days arrives as three of these,
 * expanded server-side so the calendar never has to reason about ranges.
 */
export type CalendarTrip = {
  id: string;
  purpose: string;
  dayKey: string;
  personCode: string;
  personName: string;
  locationName: string;
  /**
   * Where the trip stands. Without it every entry read "ออกนอกสถานที่" in
   * warning orange, so a trip closed out hours ago still announced that the
   * person was off-site — on the very day they had just reported back.
   * Cancelled trips never reach here; they are dropped from the calendar.
   */
  state: "SCHEDULED" | "ON_SITE" | "COMPLETED";
  /** "HH:MM"–"HH:MM", already resolved against the office hours. */
  hours: string;
  /** Opens Google Maps at the pin — see src/lib/maps.ts. */
  mapHref: string;
};

/** Hard-coded rather than derived from Intl: identical on server and client. */
const WEEKDAYS: Record<Locale, readonly string[]> = {
  th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

type Tone = "overdue" | "open" | "done" | "start";

const TONE_COLOR: Record<Tone, string> = {
  overdue: "var(--danger)",
  open: "var(--brand)",
  done: "var(--success)",
  // Muted on purpose: a start date that has passed is not a problem, it is a
  // fact. Only a missed *deadline* earns the red dot.
  start: "var(--text-muted)",
};

const TRIP_TONE: Record<
  CalendarTrip["state"],
  { color: string; background: string; label: TranslationKey }
> = {
  SCHEDULED: {
    color: "var(--warning)",
    background: "var(--warning-soft)",
    label: "trips.away",
  },
  ON_SITE: {
    color: "var(--brand)",
    background: "var(--brand-soft)",
    label: "trips.onSite",
  },
  COMPLETED: {
    color: "var(--success)",
    background: "var(--success-soft)",
    label: "trips.done",
  },
};

function toneOf(task: CalendarTask, todayKey: string): Tone {
  if (task.kind === "start") return "start";
  if (task.status === "COMPLETED") return "done";
  return task.dayKey < todayKey ? "overdue" : "open";
}

function groupByDay<T extends { dayKey: string }>(
  items: T[],
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const bucket = byDay.get(item.dayKey);
    if (bucket) bucket.push(item);
    else byDay.set(item.dayKey, [item]);
  }
  return byDay;
}

export function TaskCalendar({
  year,
  month,
  monthLabel,
  todayKey,
  tasks,
  trips,
  prevHref,
  nextHref,
  todayHref,
  showAssignee,
}: {
  year: number;
  month: number;
  /** Formatted on the server so the month name cannot differ across runtimes. */
  monthLabel: string;
  todayKey: string;
  tasks: CalendarTask[];
  trips: CalendarTrip[];
  prevHref: string;
  nextHref: string;
  todayHref: string;
  showAssignee: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { daysInMonth, startWeekday } = monthGrid({ year, month });

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const [selected, setSelected] = useState<string | null>(
    todayKey.startsWith(monthPrefix) ? todayKey : null,
  );

  const tasksByDay = groupByDay(tasks);
  const tripsByDay = groupByDay(trips);

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedTasks = selected ? (tasksByDay.get(selected) ?? []) : [];
  const dueCount = selectedTasks.filter((task) => task.kind === "due").length;
  const startCount = selectedTasks.length - dueCount;
  const selectedTrips = selected ? (tripsByDay.get(selected) ?? []) : [];
  const nothingThisMonth = tasks.length === 0 && trips.length === 0;

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="me-auto text-base font-semibold tracking-tight">
          {monthLabel}
        </h3>
        <Link href={todayHref} scroll={false} className="btn btn-ghost">
          {t("calendar.today")}
        </Link>
        <Link
          href={prevHref}
          scroll={false}
          className="btn btn-secondary"
          aria-label={t("calendar.prevMonth")}
          title={t("calendar.prevMonth")}
        >
          <Chevron direction="prev" />
        </Link>
        <Link
          href={nextHref}
          scroll={false}
          className="btn btn-secondary"
          aria-label={t("calendar.nextMonth")}
          title={t("calendar.nextMonth")}
        >
          <Chevron direction="next" />
        </Link>
      </div>

      <div>
        <div
          className="grid grid-cols-7 gap-1 pb-1 text-center text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {WEEKDAYS[locale].map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, index) => {
            if (day === null) return <div key={`blank-${index}`} />;

            const key = dayKeyOf({ year, month }, day);
            const dayTasks = tasksByDay.get(key) ?? [];
            const dayTrips = tripsByDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;

            // Trips first: where someone is affects everything else that day.
            const dots = [
              ...dayTrips.map((trip) => TRIP_TONE[trip.state].color),
              ...dayTasks.map((task) => TONE_COLOR[toneOf(task, todayKey)]),
            ];

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(isSelected ? null : key)}
                aria-pressed={isSelected}
                className="flex min-h-14 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs transition-colors"
                style={{
                  background: isSelected
                    ? "var(--brand)"
                    : dots.length > 0
                      ? "var(--surface-muted)"
                      : "transparent",
                  color: isSelected ? "var(--brand-contrast)" : "var(--text)",
                  border: `1px solid ${
                    isToday && !isSelected ? "var(--brand)" : "transparent"
                  }`,
                }}
              >
                <span className={isToday ? "font-semibold" : undefined}>
                  {day}
                </span>

                {dots.length > 0 && (
                  <span className="flex flex-wrap items-center justify-center gap-0.5">
                    {dots.slice(0, 3).map((color, dotIndex) => (
                      <span
                        key={dotIndex}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: isSelected
                            ? "var(--brand-contrast)"
                            : color,
                        }}
                      />
                    ))}
                    {dots.length > 3 && (
                      <span
                        className="text-[0.625rem] leading-none"
                        style={{
                          color: isSelected
                            ? "var(--brand-contrast)"
                            : "var(--text-muted)",
                        }}
                      >
                        +{dots.length - 3}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        {selected === null ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {nothingThisMonth
              ? t("calendar.emptyMonth")
              : t("calendar.pickDay")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">
                {formatDayKey(selected, locale)}
              </span>
              {dueCount > 0 && (
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {dueCount} {t("calendar.dueCount")}
                </span>
              )}
              {startCount > 0 && (
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {startCount} {t("calendar.startCount")}
                </span>
              )}
            </div>

            {selectedTrips.length === 0 && selectedTasks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("calendar.emptyDay")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {selectedTrips.map((trip) => {
                  const tone = TRIP_TONE[trip.state];

                  return (
                    <li key={trip.id}>
                      <div
                        className="card flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
                        style={{ background: tone.background }}
                      >
                        <span
                          className="inline-flex items-center gap-1 text-xs"
                          style={{ color: tone.color }}
                        >
                          <PinIcon />
                          {t(tone.label)}
                        </span>

                        <span className="min-w-0 flex-1 truncate text-sm">
                          {trip.purpose}
                        </span>

                        <span
                          className="shrink-0 text-xs tabular-nums"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {trip.hours}
                        </span>

                        {showAssignee && (
                          <span
                            className="min-w-0 truncate text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {trip.personName}
                          </span>
                        )}

                        <a
                          href={trip.mapHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-xs underline"
                          style={{ color: "var(--brand)" }}
                        >
                          {trip.locationName}
                        </a>
                      </div>
                    </li>
                  );
                })}

                {selectedTasks.map((task) => (
                  <li key={task.id}>
                    {/*
                      The row is laid out on a wrapper *inside* the link, not on
                      the link itself, and that is the Conventions rule in
                      CLAUDE.md rather than a preference: `.card-link` sets
                      `display: block` from unlayered CSS, which beats any
                      Tailwind utility, so a `flex` on this anchor was silently
                      dead. The children stayed inline, `truncate` does nothing
                      to an inline box, and a long task title ran 125px past the
                      right edge of a phone — taking the whole page's horizontal
                      scroll with it.
                    */}
                    <Link
                      href={task.href}
                      className="card card-link px-3 py-2"
                      style={{ background: "var(--surface-muted)" }}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span
                          className="font-mono text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {task.code}
                        </span>
                        <span
                          className="badge shrink-0"
                          style={
                            task.kind === "start"
                              ? {
                                  background: "var(--surface)",
                                  color: "var(--text-muted)",
                                }
                              : {
                                  background: "var(--brand-soft)",
                                  color: "var(--brand)",
                                }
                          }
                        >
                          {task.kind === "start"
                            ? t("calendar.marksStart")
                            : t("calendar.marksDue")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {task.title}
                        </span>
                        {showAssignee && (
                          <span
                            className="min-w-0 truncate text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {task.assigneeName}
                          </span>
                        )}
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The key is a plain calendar day, so it is read back in UTC to stay that day. */
function formatDayKey(dayKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T00:00:00Z`));
}

function Chevron({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direction === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
