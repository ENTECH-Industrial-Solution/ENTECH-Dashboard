"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { FieldError } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import { partTree, type PartNode, type PartRef, type ProjectOption, type ProjectRef } from "@/lib/projects";

/**
 * The open projects, for every task and trip form on a page.
 *
 * Published once by the page rather than drilled through each card and
 * section down to the form: a page carries a dozen cards that can each open an
 * editor, and every one of them would otherwise need the prop. Outside a
 * provider the list is empty and the picker does not render.
 */
const ProjectOptions = createContext<ProjectOption[]>([]);

export function ProjectOptionsProvider({
  options,
  children,
}: {
  options: ProjectOption[];
  children: ReactNode;
}) {
  return <ProjectOptions.Provider value={options}>{children}</ProjectOptions.Provider>;
}

/**
 * Which project a task or trip is part of, and which of its sub-projects.
 *
 * `current` is the project the record is already in. It is offered even when
 * it has since closed — the actions accept leaving work where it is — so an
 * edit form never shows a blank picker over a task that is in a project. Its
 * `currentPart` is offered the same way.
 *
 * Rendered only when there is something to choose. When it is absent the key
 * is not sent, which the edit schemas read as "leave it alone". The
 * sub-project select appears only under a project that has sub-projects, so a
 * form that switches to a project without any sends no `partId`, and the
 * action drops the old part because the project moved (see checkPart).
 */
export function ProjectPicker({
  id,
  current,
  currentPart,
  error,
  partError,
}: {
  id: string;
  current?: ProjectRef | null;
  currentPart?: PartRef | null;
  error?: string;
  partError?: string;
}) {
  const t = useTranslations();
  const open = useContext(ProjectOptions);
  // A part the record already has but the options no longer list (its project
  // closed) is still offered, at the top, so an edit does not silently drop it.
  const kept: PartNode | null = currentPart ? { ...currentPart, parentId: null } : null;
  const options: ProjectOption[] =
    current && !open.some((p) => p.id === current.id)
      ? [{ ...current, parts: kept ? [kept] : [] }, ...open]
      : open;
  const [selected, setSelected] = useState(current?.id ?? "");

  if (options.length === 0) return null;

  const listed = options.find((p) => p.id === selected)?.parts ?? [];
  const parts = partTree(
    kept && selected === current?.id && !listed.some((p) => p.id === kept.id)
      ? [kept, ...listed]
      : listed,
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor={`projectId-${id}`}>
          {t("projects.field")}{" "}
          <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
        </label>
        <select
          id={`projectId-${id}`}
          name="projectId"
          className="input"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
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

      {parts.length > 0 && (
        <div>
          <label className="label" htmlFor={`partId-${id}`}>
            {t("parts.field")} <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <select
            // Keyed by project so switching project starts the part over
            // rather than carrying an id that belongs to the old one.
            key={selected}
            id={`partId-${id}`}
            name="partId"
            className="input"
            defaultValue={selected === current?.id ? (currentPart?.id ?? "") : ""}
          >
            <option value="">{t("parts.none")}</option>
            {parts.map(({ part, depth }) => (
              <option key={part.id} value={part.id}>
                {/* A <select> keeps no indentation of its own, so the tree is
                    drawn with non-breaking spaces and a corner. */}
                {"   ".repeat(depth)}
                {depth > 0 && "└ "}
                {part.name}
              </option>
            ))}
          </select>
          <FieldError message={partError} />
        </div>
      )}
    </div>
  );
}
