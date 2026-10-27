"use client";

import Link from "next/link";
import { useState } from "react";

import { Collapse } from "@/components/motion";
import { LinkPending } from "@/components/nav-progress";
import { PinIcon } from "@/components/trip-card";
import { StatusBadge } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import { loadWorkloadTasksAction } from "@/server/actions/summary";

/**
 * One line in an opened capsule — a task or a trip. Dates are ISO strings;
 * they cross from the server. Shaped by `WorkloadEntry` in server/queries.ts.
 */
export type WorkloadTaskRow = {
  id: string;
  kind: "task" | "trip";
  /** null for a trip, which carries no reference of its own. */
  code: string | null;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  dueDate: string | null;
  completedAt: string | null;
};

export type WorkloadPillRow = { id: string; name: string; value: number };

/**
 * A segment's colour: the tone itself for the largest share, then paler steps
 * of it. Rows arrive sorted largest first, so the shade also says the rank.
 */
function shade(color: string, index: number): string {
  if (index === 0) return color;
  return `color-mix(in oklab, ${color} ${Math.max(30, 100 - index * 20)}%, var(--surface-muted))`;
}

/**
 * The breakdown under a summary number: one bar split by person, and a legend
 * under it whose entries open.
 *
 * The bar answers "who is carrying the most" at a glance; opening an entry
 * answers "carrying *what*" — the question people were clicking through to
 * someone's page to ask. It expands in place rather than opening a dialog: the
 * answer is a few lines of context for the number directly above it, and a
 * dialog would make it feel like a destination.
 *
 * The bar carries everyone; the legend names the first `limit` and counts the
 * rest, so the tile stays the same few lines however many people are in view.
 *
 * The list is fetched when an entry is opened, not with the page. The strip
 * carries up to twelve entries and almost nobody opens more than one, so
 * loading every list up front would put a round trip and the whole company's
 * task rows onto a page that currently makes three. Each answer is kept, so
 * closing and reopening the same entry costs nothing.
 *
 * Only the first few tasks are listed — the entry already states the total,
 * so the list says how many it left out rather than growing without bound.
 */
export function WorkloadShare({
  rows,
  metric,
  color,
  limit,
  morePeople,
  moreLabel,
}: {
  rows: WorkloadPillRow[];
  metric: "active" | "overdue" | "completed";
  color: string;
  limit: number;
  morePeople: string;
  moreLabel: string;
}) {
  const t = useTranslations();
  const [openId, setOpenId] = useState<string | null>(null);
  // What the panel shows. Kept after closing, so the list stays put while the
  // panel collapses instead of emptying first.
  const [shownId, setShownId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [tasksBy, setTasksBy] = useState<Record<string, WorkloadTaskRow[]>>({});
  const [errorBy, setErrorBy] = useState<Record<string, string>>({});

  const named = rows.slice(0, limit);
  const unnamed = rows.length - named.length;
  const panelId = `workload-${metric}`;
  const shown = rows.find((row) => row.id === shownId);
  const tasks = shownId ? tasksBy[shownId] : undefined;
  const error = shownId ? errorBy[shownId] : undefined;

  const toggle = async (assigneeId: string) => {
    if (openId === assigneeId) {
      setOpenId(null);
      return;
    }

    setOpenId(assigneeId);
    setShownId(assigneeId);
    if (tasksBy[assigneeId]) return;

    setLoadingId(assigneeId);
    const result = await loadWorkloadTasksAction({ assigneeId, metric });
    setLoadingId((current) => (current === assigneeId ? null : current));

    if (result.status === "ok") {
      setTasksBy((prev) => ({ ...prev, [assigneeId]: result.tasks }));
      setErrorBy((prev) => dropKey(prev, assigneeId));
    } else {
      setErrorBy((prev) => ({ ...prev, [assigneeId]: result.message }));
    }
  };

  return (
    <div>
      {/* The legend says everything the bar does, in words, so the bar is
          decoration to a screen reader. */}
      <div className="share-bar" data-open={openId ? "" : undefined} aria-hidden>
        {rows.map((row, index) => (
          <span
            key={row.id}
            data-open={row.id === openId ? "" : undefined}
            style={{ flexGrow: row.value, background: shade(color, index) }}
          />
        ))}
      </div>

      {/* Pulled out by the entries' own padding, so their swatches line up
          with the bar's edge rather than sitting a step inside it. */}
      <div className="-mx-1.5 mt-2 flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
        {named.map((row, index) => (
          <button
            key={row.id}
            type="button"
            className="share-key"
            aria-expanded={openId === row.id}
            aria-controls={panelId}
            onClick={() => void toggle(row.id)}
          >
            <i style={{ background: shade(color, index) }} />
            <span>{row.name}</span>
            <b>{row.value}</b>
            <Chevron open={openId === row.id} />
          </button>
        ))}
        {unnamed > 0 && (
          <span className="px-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            +{unnamed} {morePeople}
          </span>
        )}
      </div>

      <Collapse open={openId !== null} id={panelId}>
        <div className="mt-1.5" aria-live="polite">
          {!shown ? null : error ? (
            <p className="px-2 text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : !tasks ? (
            <Skeleton label={t("common.loading")} />
          ) : tasks.length === 0 ? (
            <p className="px-2 text-xs" style={{ color: "var(--text-muted)" }}>
              {t("tasks.empty")}
            </p>
          ) : (
            <TaskLines
              tasks={tasks}
              assigneeId={shown.id}
              hidden={shown.value - tasks.length}
              moreLabel={moreLabel}
            />
          )}
        </div>
      </Collapse>

      {/* Referenced so a stale spinner can never outlive its request. */}
      <span className="sr-only">{loadingId ? t("common.loading") : ""}</span>
    </div>
  );
}

function TaskLines({
  tasks,
  assigneeId,
  hidden,
  moreLabel,
}: {
  tasks: WorkloadTaskRow[];
  assigneeId: string;
  hidden: number;
  moreLabel: string;
}) {
  const t = useTranslations();
  const formatDay = useDayFormatter();

  return (
    <ul className="space-y-0.5">
      {tasks.map((task) => (
        <li key={task.id}>
          {/*
            The person's own page, anchored at the task — the same destination
            the calendar sends people to, so a task is reached the same way
            whichever end of the dashboard you start from.
          */}
          <Link
            href={`/dashboard/employee/${assigneeId}#${task.kind}-${task.id}`}
            className="pill-task"
          >
            <div className="flex items-start gap-1.5">
              {/* A trip has no code to sit in this slot, so the pin takes it —
                  the same mark it wears on the calendar and in the panel. */}
              <span
                className="shrink-0 text-[11px] leading-5 tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {task.kind === "trip" ? <PinIcon /> : task.code}
              </span>
              <span className="min-w-0 flex-1 text-xs leading-5">{task.title}</span>
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge status={task.status} />
              {(task.completedAt ?? task.dueDate) && (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {task.completedAt
                    ? `${t("tasks.completedAt")} ${formatDay(task.completedAt)}`
                    : `${task.kind === "trip" ? t("trips.endDate") : t("tasks.dueDate")} ${formatDay(task.dueDate!)}`}
                </span>
              )}
            </div>
            <LinkPending />
          </Link>
        </li>
      ))}

      {hidden > 0 && (
        <li className="px-2 pt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          +{hidden} {moreLabel}
        </li>
      )}
    </ul>
  );
}

function dropKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

/** Dates are pinned to Bangkok, like everywhere else in the app. */
function useDayFormatter() {
  const locale = useLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
}

/**
 * Two paths rather than one rotated 180°: a CSS transform on an <svg> does not
 * resolve inside the capsule (it computes to the identity matrix), and swapping
 * the path is both simpler and immune to that.
 */
/**
 * What a capsule shows while its list is on the wire: two lines the shape of
 * the answer, pulsing. A word saying "loading" made the capsule open onto
 * nothing and then jump; these hold the height the answer will take.
 */
function Skeleton({ label }: { label: string }) {
  return (
    <div className="space-y-1.5 px-2 py-1" role="status" aria-label={label}>
      {[0.85, 0.6].map((width) => (
        <span
          key={width}
          className="skeleton block h-3 rounded"
          style={{ width: `${width * 100}%` }}
        />
      ))}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        color: "var(--text-muted)",
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform var(--dur-base) var(--ease-out)",
      }}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
