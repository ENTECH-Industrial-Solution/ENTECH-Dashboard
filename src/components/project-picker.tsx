"use client";

import { createContext, useContext, type ReactNode } from "react";

import { FieldError } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import type { ProjectRef } from "@/lib/projects";

/**
 * The open projects, for every task and trip form on a page.
 *
 * Published once by the page rather than drilled through each card and
 * section down to the form: a page carries a dozen cards that can each open an
 * editor, and every one of them would otherwise need the prop. Outside a
 * provider the list is empty and the picker does not render.
 */
const ProjectOptions = createContext<ProjectRef[]>([]);

export function ProjectOptionsProvider({
  options,
  children,
}: {
  options: ProjectRef[];
  children: ReactNode;
}) {
  return <ProjectOptions.Provider value={options}>{children}</ProjectOptions.Provider>;
}

/**
 * Which project a task or trip is part of.
 *
 * `current` is the project the record is already in. It is offered even when
 * it has since closed — the actions accept leaving work where it is — so an
 * edit form never shows a blank picker over a task that is in a project.
 *
 * Rendered only when there is something to choose. When it is absent the key
 * is not sent, which the edit schemas read as "leave it alone".
 */
export function ProjectPicker({
  id,
  current,
  error,
}: {
  id: string;
  current?: ProjectRef | null;
  error?: string;
}) {
  const t = useTranslations();
  const open = useContext(ProjectOptions);
  const options =
    current && !open.some((p) => p.id === current.id) ? [current, ...open] : open;

  if (options.length === 0) return null;

  return (
    <div>
      <label className="label" htmlFor={`projectId-${id}`}>
        {t("projects.field")}{" "}
        <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
      </label>
      <select
        id={`projectId-${id}`}
        name="projectId"
        className="input"
        defaultValue={current?.id ?? ""}
      >
        <option value="">{t("projects.none")}</option>
        {options.map((project) => (
          <option key={project.id} value={project.id}>
            {project.code} · {project.name}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}
