"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { SlideRow } from "@/components/slide-row";
import { Alert, PriorityBadge, StatusBadge, SubmitButton } from "@/components/ui";
import { dayKeyOf, monthGrid, monthOf, monthParam, shiftMonth, type YearMonth } from "@/lib/calendar";
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
  /** The entry's own id — a task appears once per date it has in the month. */
  id: string;
  /** The task behind the entry, which is what a move is written against. */
  taskId: string;
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
  /** Who it belongs to, summarised — see peopleSummary in lib/trips.ts. */
  assigneeNames: string;
  href: string;
};

/**
 * A task's planned run, from its start date to its due date, drawn as a bar
 * across the days between. The two ends keep their own `CalendarTask` entries;
 * this is only the stretch joining them. `from` and `to` are the task's real
 * dates, not clipped to the month, so a bar can tell an end from a page edge.
 */
export type CalendarSpan = {
  /** The task's id: a task has one span. */
  id: string;
  code: string;
  title: string;
  status: CalendarTask["status"];
  from: string;
  to: string;
  assigneeNames: string;
  href: string;
};

/** Bars stacked under a day; more than this and the day's "+n" counts them. */
const SPAN_LANES = 3;

/**
 * A lane for every span, so a task keeps one height across every week it
 * crosses. Open work is placed first, so when the lanes run out it is the
 * finished work that gives way. A lane is taken when nothing already in it
 * overlaps; the day keys compare as strings.
 */
function laneSpans(spans: CalendarSpan[]): Map<string, number> {
  const ordered = [...spans].sort(
    (a, b) =>
      Number(a.status === "COMPLETED") - Number(b.status === "COMPLETED") ||
      a.from.localeCompare(b.from) ||
      b.to.localeCompare(a.to),
  );
  const lanes: CalendarSpan[][] = [];
  const laneOf = new Map<string, number>();

  for (const span of ordered) {
    let lane = lanes.findIndex((taken) =>
      taken.every((other) => other.to < span.from || other.from > span.to),
    );
    if (lane === -1) lane = lanes.push([]) - 1;
    lanes[lane]?.push(span);
    laneOf.set(span.id, lane);
  }

  return laneOf;
}

function spanTone(span: CalendarSpan, todayKey: string): Tone {
  if (span.status === "COMPLETED") return "done";
  return span.to < todayKey ? "overdue" : "open";
}

/**
 * One day of one trip: a trip spanning three days arrives as three of these,
 * expanded server-side so the calendar never has to reason about ranges.
 */
export type CalendarTrip = {
  id: string;
  purpose: string;
  dayKey: string;
  /** Who is going, summarised — see peopleSummary in lib/trips.ts. */
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
  spans,
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
  spans: CalendarSpan[];
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

  // Changing month slides: forward, the current page goes out to the left
  // and the next month comes in from the right; back, the other way. Both
  // start the moment the arrow is pressed, before the server has answered:
  // the page coming in is drawn from the calendar alone — which days the
  // month has is arithmetic — and the marks arrive when the data does. That
  // is what `preview` holds.
  //
  // The new month arrives by remount. If it is the month that was previewed,
  // it settles in without a slide and only its marks appear; otherwise (a
  // browser back, a link) it slides itself in. Decided in a layout effect so
  // the server-rendered page carries no motion and hydration has nothing to
  // disagree with; `lastMonthShown` and `previewedMonth` live at module
  // scope because the instance that decided them is gone.
  const [turn, setTurn] = useState<"in-first" | "in-left" | "in-right" | "settle" | null>(null);
  const [preview, setPreview] = useState<{
    year: number;
    month: number;
    dir: "next" | "prev";
    /** The old page has finished leaving and need not be drawn any more. */
    done: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const from = lastMonthShown;
    // Seen already: development runs effects twice, and the second pass must
    // not read the month it just recorded as "no change" and turn the wrong
    // way.
    if (from === monthPrefix) return;
    lastMonthShown = monthPrefix;
    if (previewedMonth === monthPrefix) {
      previewedMonth = null;
      setTurn("settle");
    } else {
      setTurn(from === null ? "in-first" : monthPrefix > from ? "in-right" : "in-left");
    }
  }, [monthPrefix]);

  // The old page is gone once its turn is over; the preview is what remains
  // until the real month replaces this whole instance.
  useEffect(() => {
    if (!preview || preview.done) return;
    const id = window.setTimeout(
      () => setPreview((p) => (p ? { ...p, done: true } : p)),
      PAGE_TURN_MS,
    );
    return () => window.clearTimeout(id);
  }, [preview]);

  /** Start turning toward a month; the link's own navigation fetches it. */
  const beginTurn = (target: YearMonth) => {
    const key = monthParam(target);
    if (key === monthPrefix) return;
    previewedMonth = key;
    setPreview({ ...target, dir: key > monthPrefix ? "next" : "prev", done: false });
  };

  const shownLabel = preview ? formatMonth(preview, locale) : monthLabel;

  const cells = monthCells({ daysInMonth, startWeekday });

  // Each span is cut into one bar per week row it crosses, clipped to the
  // month. A bar is rounded only at a real end, so one running off the edge
  // of a row or a page reads as carrying on.
  const monthFirst = dayKeyOf({ year, month }, 1);
  const monthLast = dayKeyOf({ year, month }, daysInMonth);
  const laneOf = laneSpans(spans);
  const bars: {
    span: CalendarSpan;
    lane: number;
    row: number;
    col: number;
    length: number;
    opens: boolean;
    closes: boolean;
  }[] = [];
  const hiddenByDay = new Map<string, number>();

  for (const span of spans) {
    if (span.to < monthFirst || span.from > monthLast) continue;
    const lane = laneOf.get(span.id) ?? 0;
    const first = span.from < monthFirst ? 1 : Number(span.from.slice(8));
    const last = span.to > monthLast ? daysInMonth : Number(span.to.slice(8));

    if (lane >= SPAN_LANES) {
      for (let day = first; day <= last; day += 1) {
        const key = dayKeyOf({ year, month }, day);
        hiddenByDay.set(key, (hiddenByDay.get(key) ?? 0) + 1);
      }
      continue;
    }

    for (let start = first; start <= last; ) {
      const cell = startWeekday + start - 1;
      const col = cell % 7;
      const end = Math.min(last, start + 6 - col);
      bars.push({
        span,
        lane,
        row: Math.floor(cell / 7),
        col,
        length: end - start + 1,
        opens: start === first && span.from >= monthFirst,
        closes: end === last && span.to <= monthLast,
      });
      start = end + 1;
    }
  }

  const selectedTasks = selected ? (tasksByDay.get(selected) ?? []) : [];
  const dueCount = selectedTasks.filter((task) => task.kind === "due").length;
  const startCount = selectedTasks.length - dueCount;
  const selectedTrips = selected ? (tripsByDay.get(selected) ?? []) : [];
  // Strictly between the ends: the start and due days already carry a note.
  const selectedSpans = selected
    ? spans.filter((span) => span.from < selected && span.to > selected)
    : [];
  const nothingThisMonth =
    tasks.length === 0 && trips.length === 0 && spans.length === 0;
  const shortDay = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const spanRange = (span: CalendarSpan) =>
    `${shortDay.format(new Date(`${span.from}T00:00:00Z`))} – ${shortDay.format(
      new Date(`${span.to}T00:00:00Z`),
    )}`;

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="me-auto text-base font-semibold tracking-tight">
          {shownLabel}
        </h3>
        <Link
          href={todayHref}
          scroll={false}
          className="btn btn-ghost"
          onClick={() => beginTurn(monthOf(todayKey))}
        >
          {t("calendar.today")}
        </Link>
        <Link
          href={prevHref}
          scroll={false}
          className="btn btn-secondary"
          aria-label={t("calendar.prevMonth")}
          title={t("calendar.prevMonth")}
          onClick={() => beginTurn(shiftMonth({ year, month }, -1))}
        >
          <Chevron direction="prev" />
        </Link>
        <Link
          href={nextHref}
          scroll={false}
          className="btn btn-secondary"
          aria-label={t("calendar.nextMonth")}
          title={t("calendar.nextMonth")}
          onClick={() => beginTurn(shiftMonth({ year, month }, 1))}
        >
          <Chevron direction="next" />
        </Link>
      </div>

      {/* One page in flow and, while a month changes, the old one sliding
          out on top of it, absolutely positioned and inert. */}
      <div className="calendar-stack">
          {preview && (
            <PreviewPage
              year={preview.year}
              month={preview.month}
              todayKey={todayKey}
              locale={locale}
              turn={preview.dir === "next" ? "in-right" : "in-left"}
            />
          )}

          {!(preview?.done) && (
            <div
              className={preview ? "calendar-page calendar-page--leaving" : "calendar-page"}
              data-turn={
                preview ? (preview.dir === "next" ? "out-left" : "out-right") : (turn ?? undefined)
              }
              aria-hidden={preview ? true : undefined}
            >
          <WeekdayRow locale={locale} />

          <div className="relative">
          <div className="grid grid-cols-7 gap-1">
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`blank-${index}`} className="min-h-14" />;
            }

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
            // What the cell cannot show: dots past three, and spans past the
            // lanes drawn under it.
            const extra = Math.max(dots.length - 3, 0) + (hiddenByDay.get(key) ?? 0);

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
                data-day={key}
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

                {(dots.length > 0 || extra > 0) && (
                  // One line, never wrapped: a second line of marks on a
                  // phone-width cell would land on the span bars below.
                  <span className="day-marks flex items-center justify-center gap-0.5 whitespace-nowrap">
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
                    {extra > 0 && (
                      <span
                        className="text-[0.625rem] leading-none"
                        style={{
                          color: isSelected
                            ? "var(--brand-contrast)"
                            : "var(--text-muted)",
                        }}
                      >
                        +{extra}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
          </div>

          {/* The spans, laid over the cells on a grid of the same shape: six
              equal rows, because every cell is the same fixed height. Lane
              one sits lowest; three lanes fit under a cell's dots without
              making it taller, so a month with bars is the same height as the
              preview page that came before it. Decorative to a pointer and a
              screen reader: the day's list below names the same tasks. */}
          {bars.length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-1"
              style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}
            >
              {bars.map((bar) => (
                <span
                  key={`${bar.span.id}-${bar.row}`}
                  className={`h-1 self-end ${bar.opens ? "ms-1.5 rounded-s-full" : ""} ${
                    bar.closes ? "me-1.5 rounded-e-full" : ""
                  }`}
                  style={{
                    gridRow: bar.row + 1,
                    gridColumn: `${bar.col + 1} / span ${bar.length}`,
                    marginBottom: `${4 + bar.lane * 6}px`,
                    background: TONE_COLOR[spanTone(bar.span, todayKey)],
                    opacity: 0.75,
                  }}
                />
              ))}
            </div>
          )}
          </div>
            </div>
          )}
      </div>

      <div className="space-y-2 border-t pt-3">
        {/* A turn in progress: the notes belong to the month leaving, and a
            day of October under a heading that says November is a lie. */}
        {selected === null || preview ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {nothingThisMonth
              ? t("calendar.emptyMonth")
              : t("calendar.pickDay")}
          </p>
        ) : (
          /* Keyed on the day, so picking another one hangs fresh notes
             rather than swapping the text on the old ones. */
          <div key={selected} className="space-y-2">
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

            {selectedTrips.length === 0 && selectedTasks.length === 0 ? (
              <>
                <DayHeading
                  label={formatDayKey(selected, locale)}
                  dueCount={dueCount}
                  startCount={startCount}
                />
                {selectedSpans.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {t("calendar.emptyDay")}
                  </p>
                )}
              </>
            ) : (
              /*
               * One note per entry, pinned side by side, the rest waiting past
               * the edge — the same rail the off-site panel uses. The width
               * puts three across the calendar on a desktop and one on a
               * phone, and the row is what says "there is more": the next note
               * shows past the edge, and the arrows appear when it does.
               */
              <SlideRow
                heading={
                  <DayHeading
                    label={formatDayKey(selected, locale)}
                    dueCount={dueCount}
                    startCount={startCount}
                  />
                }
                label={formatDayKey(selected, locale)}
                rows={1}
                // A fixed width, not `1fr`: one note on a quiet day must be the
                // same size as one of five on a busy one.
                autoColumns="min(100%, 12.5rem)"
                padding="px-2 pt-1 pb-5 scroll-p-2"
              >
                {selectedTrips.map((trip, index) => {
                  const tone = TRIP_TONE[trip.state];

                  return (
                    <StickyNote key={trip.id} index={index}>
                      <span
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: tone.color }}
                      >
                        <PinIcon />
                        {t(tone.label)}
                      </span>
                      <span className="line-clamp-3 text-sm leading-snug">
                        {trip.purpose}
                      </span>
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {trip.hours}
                        {showAssignee && ` · ${trip.personName}`}
                      </span>
                      <a
                        href={trip.mapHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-xs underline"
                        style={{ color: "var(--brand)" }}
                      >
                        {trip.locationName}
                      </a>
                    </StickyNote>
                  );
                })}

                {selectedTasks.map((task, index) => (
                  <StickyNote
                    key={task.id}
                    index={selectedTrips.length + index}
                    lifted={moving?.id === task.id}
                    drag={
                      canReschedule
                        ? {
                            code: task.code,
                            onLift: () => setMoving(task),
                            onHover: setDragOver,
                            onDrop: (day) => pointAt(task, day),
                            onCancel: () => {
                              setDragOver(null);
                              setMoving(null);
                            },
                          }
                        : undefined
                    }
                  >
                    <span className="flex items-center gap-2">
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
                            ? { background: "var(--surface-muted)", color: "var(--text-muted)" }
                            : { background: "var(--brand-soft)", color: "var(--brand)" }
                        }
                      >
                        {task.kind === "start"
                          ? t("calendar.marksStart")
                          : t("calendar.marksDue")}
                      </span>
                    </span>

                    <Link
                      href={task.href}
                      className="line-clamp-3 text-sm font-medium leading-snug hover:underline"
                    >
                      {task.title}
                    </Link>

                    {showAssignee && (
                      <span
                        className="truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {task.assigneeNames}
                      </span>
                    )}

                    <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                      {canReschedule && (
                        <button
                          type="button"
                          className="btn btn-ghost ms-auto"
                          aria-pressed={moving?.id === task.id}
                          title={t("calendar.move")}
                          onClick={() =>
                            setMoving(moving?.id === task.id ? null : task)
                          }
                        >
                          <MoveIcon />
                          <span className="sr-only">{t("calendar.move")}</span>
                        </button>
                      )}
                    </span>
                  </StickyNote>
                ))}
              </SlideRow>
            )}

            {/* Work running through the day rather than starting or ending
                on it: a plain list, not notes, since there is no date here
                to move. */}
            {selectedSpans.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {t("calendar.spans")} · {selectedSpans.length}
                </p>
                <ul className="space-y-0.5">
                  {selectedSpans.map((span) => (
                    <li key={span.id}>
                      <Link
                        href={span.href}
                        className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1 text-sm hover:underline"
                      >
                        <span
                          className="mt-2 h-1 w-3 shrink-0 rounded-full"
                          style={{ background: TONE_COLOR[spanTone(span, todayKey)] }}
                        />
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span
                              className="shrink-0 font-mono text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {span.code}
                            </span>
                            <span className="truncate">{span.title}</span>
                          </span>
                          <span
                            className="block truncate text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {spanRange(span)}
                            {showAssignee && ` · ${span.assigneeNames}`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DayHeading({
  label,
  dueCount,
  startCount,
}: {
  label: string;
  dueCount: number;
  startCount: number;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-sm font-medium">{label}</span>
      {dueCount > 0 && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {dueCount} {t("calendar.dueCount")}
        </span>
      )}
      {startCount > 0 && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {startCount} {t("calendar.startCount")}
        </span>
      )}
    </div>
  );
}

/** How long a finger holds still on a note before it comes off the board. */
const HOLD_MS = 350;
/** How far it may wander during the hold before it is a scroll instead. */
const HOLD_SLOP = 8;

/** The day cell under a point on screen, if any. */
function dayUnder(x: number, y: number): string | null {
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>(".day-cell");
  return cell?.dataset.day ?? null;
}

/**
 * One note on the board: a card with a pin through the top, hung a fraction
 * off square, that can be picked up and carried to a day.
 *
 * Two ways to pick it up, because the two kinds of pointer are nothing alike.
 * A mouse gets the browser's own drag — `draggable`, with the day cells as
 * drop targets — which starts the moment it moves and draws its own ghost. A
 * finger gets press-and-hold: hold still for a beat and the note lifts off
 * and follows, with a fixed-position copy standing in for it because the rail
 * clips anything that leaves it. Move too soon and it is a scroll, exactly as
 * it always was — the wait is what tells the two apart, and it is short.
 *
 * Where a lifted note is over a day is asked of the page (`elementFromPoint`)
 * rather than tracked by the cells, since the finger is captured by the note.
 */
function StickyNote({
  index,
  lifted = false,
  drag,
  children,
}: {
  index: number;
  lifted?: boolean;
  drag?: {
    code: string;
    onLift: () => void;
    onHover: (day: string | null) => void;
    onDrop: (day: string) => void;
    onCancel: () => void;
  };
  children: ReactNode;
}) {
  const note = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const hold = useRef<{
    timer: number;
    start: { x: number; y: number };
    grip: { dx: number; dy: number; w: number; h: number } | null;
  } | null>(null);

  const release = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
    setGhost(null);
  };

  // Registered from the start rather than on lift: a browser decides at
  // touchstart whether a scroll may begin without asking, and it only asks
  // if something is already listening. Passive elsewhere; cancelled only
  // while a note is in the air.
  useEffect(() => {
    const el = note.current;
    if (!el || !drag) return;
    const block = (event: TouchEvent) => {
      if (hold.current?.grip) event.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, [drag]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerType === "mouse") return;
    const el = note.current;
    if (!el) return;
    const start = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;

    hold.current = {
      start,
      grip: null,
      timer: window.setTimeout(() => {
        const current = hold.current;
        if (!current) return;
        const r = el.getBoundingClientRect();
        current.grip = { dx: start.x - r.left, dy: start.y - r.top, w: r.width, h: r.height };
        // Keeps the moves coming to the note once the finger leaves it.
        // Throws if the pointer is already gone, in which case there is
        // nothing to follow anyway.
        try {
          el.setPointerCapture(pointerId);
        } catch {}
        setGhost({ x: r.left, y: r.top, w: r.width, h: r.height });
        navigator.vibrate?.(10);
        drag.onLift();
      }, HOLD_MS),
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = hold.current;
    if (!current || !drag) return;

    if (!current.grip) {
      const moved = Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y);
      if (moved > HOLD_SLOP) release();
      return;
    }

    const { dx, dy, w, h } = current.grip;
    setGhost({ x: event.clientX - dx, y: event.clientY - dy, w, h });
    drag.onHover(dayUnder(event.clientX, event.clientY));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = hold.current;
    if (!current || !drag) return;

    if (current.grip) {
      const day = dayUnder(event.clientX, event.clientY);
      if (day) drag.onDrop(day);
      else drag.onCancel();
    }
    release();
  };

  return (
    <>
      <div
        ref={note}
        className="sticky-note slide-card"
        style={{ "--i": index, "--tilt": `${index % 2 ? 0.9 : -1.1}deg` } as React.CSSProperties}
        data-lifted={lifted || undefined}
        draggable={drag ? true : undefined}
        onDragStart={
          drag
            ? (event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", drag.code);
                drag.onLift();
              }
            : undefined
        }
        // A drop has already been handled by the time this fires; what is
        // left is a drag let go somewhere that was not a day.
        onDragEnd={drag ? () => drag.onCancel() : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={release}
        onContextMenu={drag ? (event) => { if (hold.current) event.preventDefault(); } : undefined}
      >
        <Pushpin />
        {children}
      </div>

      {ghost &&
        createPortal(
          <div
            className="sticky-note sticky-ghost"
            style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}
            aria-hidden
          >
            <Pushpin />
            {children}
          </div>,
          document.body,
        )}
    </>
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

      <input type="hidden" name="taskId" value={task.taskId} />
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

/**
 * The month the calendar showed last, kept across remounts so the next one
 * knows which way to turn. Module scope on purpose: the component is keyed
 * on the month and so is a fresh instance each time, and this is the only
 * thing that outlives it. Read and written only on the client — the server
 * renders every month as the first, which is also what hydration expects.
 */
let lastMonthShown: string | null = null;

/** The month a turn was started toward, so its arrival settles rather than turns. */
let previewedMonth: string | null = null;

/** How long a page takes to slide — matches `.calendar-page` in globals.css. */
const PAGE_TURN_MS = 400;

function formatMonth({ year, month }: YearMonth, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Six weeks of cells, always. A month is five rows or six, and a page that
 * grew a row every other month would make the calendar change height as it
 * turned — the blank sixth row is what keeps every page the same size.
 */
function monthCells({
  daysInMonth,
  startWeekday,
}: {
  daysInMonth: number;
  startWeekday: number;
}): (number | null)[] {
  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length < 42) cells.push(null);
  return cells;
}

function WeekdayRow({ locale }: { locale: Locale }) {
  return (
    <div
      className="grid grid-cols-7 gap-1 pb-1 text-center text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      {WEEKDAYS[locale].map((label) => (
        <div key={label}>{label}</div>
      ))}
    </div>
  );
}

/**
 * The page sliding in: the month's days, laid out from the calendar alone,
 * with a placeholder where each day's marks will go. It is what the reader
 * sees while the server is asked for the month — and the real page then
 * settles in over it with the marks filled in.
 */
function PreviewPage({
  year,
  month,
  todayKey,
  locale,
  turn,
}: {
  year: number;
  month: number;
  todayKey: string;
  locale: Locale;
  turn: "in-left" | "in-right";
}) {
  const cells = monthCells(monthGrid({ year, month }));

  return (
    <div className="calendar-page" data-turn={turn} aria-busy>
      <WeekdayRow locale={locale} />
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`blank-${index}`} className="min-h-14" />;
          }
          const isToday = dayKeyOf({ year, month }, day) === todayKey;
          return (
            <div
              key={day}
              className="flex min-h-14 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs"
              style={{
                border: `1px solid ${isToday ? "var(--brand)" : "transparent"}`,
              }}
            >
              <span className={isToday ? "font-semibold" : undefined}>{day}</span>
              <span className="skeleton h-1.5 w-5 rounded-full" />
            </div>
          );
        })}
      </div>
    </div>
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
