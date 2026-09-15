"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type DragEvent } from "react";

import { Reveal } from "@/components/motion";
import { Alert, PriorityBadge, StatusBadge, SubmitButton } from "@/components/ui";
import { dayKeyOf, monthGrid } from "@/lib/calendar";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import type { Locale, TranslationKey } from "@/lib/i18n/dictionaries";
import { rescheduleTaskAction } from "@/server/actions/tasks";
import { idleState } from "@/server/actions/types";

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
  /** Who is going, summarised — see travellerSummary in trip-card.tsx. */
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
  canReschedule = false,
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
  /**
   * Whether a task in the day's note can be moved to another day — by
   * dragging it onto the grid, or by pressing "ย้ายวัน" and tapping the day.
   * Set by the server for admins; the action refuses anyone else regardless.
   */
  canReschedule?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();

  // Moving a day happens in three steps that are each visible: pick up (a
  // drag, or the button), point at a day (drop, or tap), then confirm. Nothing
  // is written until the confirm — a drop that committed on release would
  // make a slip of one column a deadline change nobody meant, which is the
  // reason the map's marker asks before saving a drag too.
  const [moving, setMoving] = useState<CalendarTask | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    task: CalendarTask;
    toDay: string;
  } | null>(null);
  const [moveState, moveAction] = useActionState(rescheduleTaskAction, idleState);

  useEffect(() => {
    if (moveState.status === "success") setPendingMove(null);
  }, [moveState]);

  useEffect(() => {
    if (!moving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoving(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moving]);

  const pointAt = (task: CalendarTask, toDay: string) => {
    setMoving(null);
    setDragOver(null);
    if (toDay !== task.dayKey) setPendingMove({ task, toDay });
  };

  const dropHandlers = (key: string) =>
    canReschedule && moving
      ? {
          onDragOver: (event: DragEvent) => {
            event.preventDefault();
            if (dragOver !== key) setDragOver(key);
          },
          onDragLeave: () => {
            if (dragOver === key) setDragOver(null);
          },
          onDrop: (event: DragEvent) => {
            event.preventDefault();
            pointAt(moving, key);
          },
        }
      : {};
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

        {/* Remounted per month by the parent's key, so this entrance is the
            cross-fade between one month and the next. */}
        <Reveal className="grid grid-cols-7 gap-1">
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
                // While a task is being moved, a day is a destination rather
                // than a selection.
                onClick={() =>
                  moving ? pointAt(moving, key) : setSelected(isSelected ? null : key)
                }
                aria-pressed={isSelected}
                data-target={moving ? (dragOver === key ? "over" : "open") : undefined}
                className="day-cell relative flex min-h-14 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs transition-colors"
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
                {...dropHandlers(key)}
              >
                {isSelected && <Pushpin />}
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
        </Reveal>
      </div>

      <div className="space-y-2 border-t pt-3">
        {selected === null ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {nothingThisMonth
              ? t("calendar.emptyMonth")
              : t("calendar.pickDay")}
          </p>
        ) : (
          /* Keyed on the day, so picking another one hangs a fresh note
             rather than swapping the text on the old one. */
          <div key={selected} className="pinned-note space-y-2">
            <Pushpin />

            {pendingMove && (
              <MoveConfirm
                move={pendingMove}
                locale={locale}
                state={moveState}
                action={moveAction}
                onCancel={() => setPendingMove(null)}
              />
            )}

            {moving && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                role="status"
              >
                <span className="font-mono">{moving.code}</span>
                <span>{t("calendar.moveHint")}</span>
                <button
                  type="button"
                  className="btn btn-ghost ms-auto"
                  onClick={() => setMoving(null)}
                >
                  {t("common.cancel")}
                </button>
              </div>
            )}
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
                  <li
                    key={task.id}
                    className={canReschedule ? "flex items-stretch gap-1.5" : undefined}
                    // HTML5 drag, desktop only in practice — a phone gets the
                    // button beside it. The li is the draggable rather than the
                    // link, so dragging does not start a navigation.
                    draggable={canReschedule || undefined}
                    onDragStart={
                      canReschedule
                        ? (event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", task.code);
                            setMoving(task);
                          }
                        : undefined
                    }
                    // A drop has already been handled by the time this fires;
                    // what is left is a drag let go somewhere that was not a
                    // day, which should not leave the grid waiting for a tap.
                    onDragEnd={
                      canReschedule
                        ? () => {
                            setDragOver(null);
                            setMoving(null);
                          }
                        : undefined
                    }
                  >
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
                    {canReschedule && (
                      <button
                        type="button"
                        className="btn btn-secondary shrink-0"
                        aria-pressed={moving?.id === task.id}
                        title={t("calendar.move")}
                        onClick={() => setMoving(moving?.id === task.id ? null : task)}
                      >
                        <MoveIcon />
                        <span className="sr-only">{t("calendar.move")}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The question a drop asks before anything is written: which day of which
 * task, from where to where. The answer goes through `rescheduleTaskAction`
 * with the same accounting as any other edit.
 */
function MoveConfirm({
  move,
  locale,
  state,
  action,
  onCancel,
}: {
  move: { task: CalendarTask; toDay: string };
  locale: Locale;
  state: { status: string; message?: string };
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const { task, toDay } = move;

  return (
    <form
      action={action}
      className="space-y-2 rounded-lg border p-3"
      style={{ borderColor: "var(--brand)", background: "var(--surface)" }}
    >
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="field" value={task.kind} />
      <input type="hidden" name="day" value={toDay} />

      <div className="text-sm">
        <span className="font-medium">
          {task.kind === "due" ? t("calendar.moveDue") : t("calendar.moveStart")}
        </span>{" "}
        <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
          {task.code}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span style={{ color: "var(--text-muted)" }}>
          {formatDayKey(task.dayKey, locale, "medium")}
        </span>
        <span aria-hidden>→</span>
        <span className="font-medium">{formatDayKey(toDay, locale, "medium")}</span>
      </div>

      <div className="flex gap-2">
        <SubmitButton>{t("common.confirm")}</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function MoveIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
    </svg>
  );
}

/** The pin the selected day and its note both wear; `.day-pin` places it. */
function Pushpin() {
  return (
    <span className="day-pin" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        {/* needle */}
        <path d="M12 13v9" stroke="oklch(0.45 0.01 260)" strokeWidth="1.6" strokeLinecap="round" />
        {/* collar and head */}
        <path d="M8 13h8l-1.2-3H9.2L8 13Z" fill="currentColor" opacity="0.85" />
        <circle cx="12" cy="6.5" r="4.5" fill="currentColor" />
        <circle cx="10.5" cy="5" r="1.2" fill="oklch(1 0 0 / 0.55)" />
      </svg>
    </span>
  );
}

/** The key is a plain calendar day, so it is read back in UTC to stay that day. */
function formatDayKey(
  dayKey: string,
  locale: Locale,
  dateStyle: "full" | "medium" = "full",
): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle,
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
