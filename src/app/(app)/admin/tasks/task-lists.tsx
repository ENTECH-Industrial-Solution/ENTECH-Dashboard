"use client";

import { useMemo, useState, type ReactNode } from "react";

import { CardGrid } from "@/components/card-grid";
import {
  ActiveTaskCard,
  CompletedTaskCard,
  type TaskCardData,
} from "@/components/task-card";
import type { AssigneeOption } from "@/components/task-form";
import { TaskSection } from "@/components/task-section";
import { EmptyState } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";

/**
 * Cards drawn before the "see more" button while a filter is on. A filter that
 * matches a hundred completed tasks should not mount a hundred forms at once;
 * the unfiltered preview of two would hide the very thing that was searched for.
 */
const FILTERED_PREVIEW = 12;

/**
 * The page's two task sections with a way to find something in them.
 *
 * Everything is filtered in the browser, over the rows the page already holds:
 * a search is a keystroke and a round trip through the pooler is ~250ms (see
 * "Round trips are the performance budget"), and an admin may read every task
 * anyway, so there is nothing for the server to enforce. That is also its limit
 * — the archive is fetched up to `completedLimit` rows, and past it a search
 * cannot see older work. The footnote says so rather than letting a missing
 * result read as "never existed".
 *
 * The trips sit between the two sections on this page, so they arrive as
 * `children` and are drawn there, unfiltered: the filter is about tasks.
 */
export function TaskLists({
  active,
  completed,
  completedLimit,
  assignees,
  children,
}: {
  active: TaskCardData[];
  completed: TaskCardData[];
  /** How many archive rows the page asked for; a full list means there may be more. */
  completedLimit: number;
  assignees: AssigneeOption[];
  children?: ReactNode;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("ALL");
  const [project, setProject] = useState("ALL");

  // Offered from the tasks themselves rather than from the assignable people
  // and the open projects: someone since deactivated and a project since closed
  // are still on the work they did, and should still be findable by it.
  const { people, projects } = useMemo(() => {
    const people = new Map<string, string>();
    const projects = new Map<string, string>();
    for (const task of [...active, ...completed]) {
      for (const assignee of task.assignees) people.set(assignee.id, assignee.fullName);
      if (task.project) projects.set(task.project.id, `${task.project.code} · ${task.project.name}`);
    }
    // Plain code-point order, not `localeCompare`: this renders on the server
    // and again in the browser, and a locale-aware sort puts Latin and Thai
    // names in a different order in each, which fails hydration.
    const byName = (a: [string, string], b: [string, string]) => {
      const [x, y] = [a[1].toLowerCase(), b[1].toLowerCase()];
      return x < y ? -1 : x > y ? 1 : 0;
    };
    return { people: [...people].sort(byName), projects: [...projects].sort(byName) };
  }, [active, completed]);

  const needle = query.trim().toLowerCase();
  const filtering = needle !== "" || person !== "ALL" || project !== "ALL";

  const matches = (task: TaskCardData) => {
    if (person !== "ALL" && !task.assignees.some((assignee) => assignee.id === person)) return false;
    if (project !== "ALL" && task.project?.id !== project) return false;
    if (needle === "") return true;
    return [
      task.code,
      task.title,
      task.description,
      task.project?.name,
      task.part?.name,
      ...task.assignees.flatMap((assignee) => [assignee.fullName, assignee.employeeCode]),
    ]
      .join("\n")
      .toLowerCase()
      .includes(needle);
  };

  const shownActive = active.filter(matches);
  const shownCompleted = completed.filter(matches);

  const clear = () => {
    setQuery("");
    setPerson("ALL");
    setProject("ALL");
  };

  const list = (
    shown: TaskCardData[],
    total: number,
    card: (task: TaskCardData) => ReactNode,
  ) =>
    total === 0 ? (
      <EmptyState label={t("tasks.empty")} />
    ) : shown.length === 0 ? (
      <EmptyState label={t("tasks.noMatch")} />
    ) : (
      <CardGrid preview={filtering ? FILTERED_PREVIEW : 2}>{shown.map(card)}</CardGrid>
    );

  const historyNotes = [
    completed.length > 0 ? t("tasks.historyLocked") : null,
    completed.length >= completedLimit
      ? t("tasks.historyCapped").replace("{n}", String(completedLimit))
      : null,
  ].filter(Boolean);

  return (
    <>
      <div className="card space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* The widths sit on wrappers: `.input` is unlayered and sets its own. */}
          <div className="w-full sm:w-auto sm:min-w-64 sm:flex-1">
            <input
              type="search"
              className="input"
              aria-label={t("tasks.search")}
              placeholder={t("tasks.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
            <select
              className="input"
              aria-label={t("tasks.filterPerson")}
              value={person}
              onChange={(event) => setPerson(event.target.value)}
            >
              <option value="ALL">{t("tasks.filterEveryone")}</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {projects.length > 0 && (
            <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
              <select
                className="input"
                aria-label={t("projects.field")}
                value={project}
                onChange={(event) => setProject(event.target.value)}
              >
                <option value="ALL">{t("projects.allProjects")}</option>
                {projects.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {filtering && (
            <button type="button" className="btn btn-ghost" onClick={clear}>
              {t("tasks.filterClear")}
            </button>
          )}
        </div>

        {filtering && (
          <p role="status" className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("tasks.filterCount")} {shownActive.length + shownCompleted.length} /{" "}
            {active.length + completed.length}
          </p>
        )}
      </div>

      <TaskSection title={t("tasks.active")} hint={t("tasks.activeHint")}>
        {list(shownActive, active.length, (task) => (
          <ActiveTaskCard key={task.id} task={task} canMutate isAdmin assignees={assignees} />
        ))}
      </TaskSection>

      {children}

      <TaskSection
        title={t("tasks.history")}
        hint={t("tasks.historyHint")}
        footnote={historyNotes.length > 0 ? historyNotes.join(" ") : undefined}
      >
        {list(shownCompleted, completed.length, (task) => (
          <CompletedTaskCard key={task.id} task={task} isAdmin assignees={assignees} />
        ))}
      </TaskSection>
    </>
  );
}
