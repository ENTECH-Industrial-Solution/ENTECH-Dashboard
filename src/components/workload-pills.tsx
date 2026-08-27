"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import { loadWorkloadTasksAction } from "@/server/actions/summary";

/** One task in an opened capsule. Dates are ISO — they cross from the server. */
export type WorkloadTaskRow = {
  id: string;
  code: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  dueDate: string | null;
  completedAt: string | null;
};

export type WorkloadPillRow = { id: string; name: string; value: number };

/**
 * The per-person capsules under a summary number, each one openable.
 *
 * A capsule answers "who is carrying the most"; opening it answers "carrying
 * *what*" — the question people were clicking through to someone's page to ask.
 * It expands in place rather than opening a dialog: the answer is a few lines
 * of context for the number directly above it, and a dialog would make it feel
 * like a destination.
 *
 * The list is fetched when a capsule is opened, not with the page. The strip
 * carries up to twelve capsules and almost nobody opens more than one, so
 * loading every list up front would put a round trip and the whole company's
 * task rows onto a page that currently makes three. Each answer is kept, so
 * closing and reopening the same capsule costs nothing.
 *
 * Only the first few tasks are listed — the capsule already states the total,
 * so the list says how many it left out rather than growing without bound.
 */
export function WorkloadPills({
  rows,
  metric,
  color,
  moreLabel,
}: {
  rows: WorkloadPillRow[];
  metric: "active" | "overdue" | "completed";
  color: string;
  moreLabel: string;
}) {
  const t = useTranslations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [tasksBy, setTasksBy] = useState<Record<string, WorkloadTaskRow[]>>({});
  const [errorBy, setErrorBy] = useState<Record<string, string>>({});

  const max = rows[0]?.value ?? 0;

  const toggle = async (assigneeId: string) => {
    if (openId === assigneeId) {
      setOpenId(null);
      return;
    }

    setOpenId(assigneeId);
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
    <div className="space-y-1.5">
      {rows.map((row) => {
        const open = openId === row.id;
        const tasks = tasksBy[row.id];
        const error = errorBy[row.id];
        const panelId = `workload-${metric}-${row.id}`;

        return (
          <div key={row.id}>
            <button
              type="button"
              className="pill"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => void toggle(row.id)}
            >
              <span
                className="pill-fill"
                style={{
                  width: `${max === 0 ? 0 : Math.round((row.value / max) * 100)}%`,
                  background: `color-mix(in oklab, ${color} 32%, var(--surface-muted))`,
                }}
              />
              <span className="pill-label">{row.name}</span>
              {/* Plain text, not the tone: the number sits on the fill whenever
                  a bar is near full, and tinted text on a tinted fill measured
                  below 4.5:1. The tone is already carried by the fill itself. */}
              <span className="pill-value inline-flex items-center gap-1">
                {row.value}
                <Chevron open={open} />
              </span>
            </button>

            {open && (
              <div id={panelId} className="mt-1.5" aria-live="polite">
                {error ? (
                  <p className="px-2 text-xs" style={{ color: "var(--danger)" }}>
                    {error}
                  </p>
                ) : !tasks ? (
                  <p className="px-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("common.loading")}
                  </p>
                ) : tasks.length === 0 ? (
                  <p className="px-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("tasks.empty")}
                  </p>
                ) : (
                  <TaskLines
                    tasks={tasks}
                    assigneeId={row.id}
                    hidden={row.value - tasks.length}
                    moreLabel={moreLabel}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

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
            href={`/dashboard/employee/${assigneeId}#task-${task.id}`}
            className="pill-task"
          >
            <div className="flex items-start gap-1.5">
              <span
                className="shrink-0 text-[11px] leading-5 tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {task.code}
              </span>
              <span className="min-w-0 flex-1 text-xs leading-5">{task.title}</span>
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge status={task.status} />
              {(task.completedAt ?? task.dueDate) && (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {task.completedAt
                    ? `${t("tasks.completedAt")} ${formatDay(task.completedAt)}`
                    : `${t("tasks.dueDate")} ${formatDay(task.dueDate!)}`}
                </span>
              )}
            </div>
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
      style={{ color: "var(--text-muted)" }}
      aria-hidden
    >
      <path d={open ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}
