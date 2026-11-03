"use client";

import { useActionState, useEffect, useState } from "react";

import { Reveal } from "@/components/motion";
import { PictureField } from "@/components/picture-field";
import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import {
  createProjectAction,
  moveProjectAction,
  toggleProjectClosedAction,
  updateProjectAction,
} from "@/server/actions/projects";
import { idleState, type ActionState } from "@/server/actions/types";

/** What the edit form needs of a project, dates as ISO strings. */
export type ProjectFormData = {
  id: string;
  name: string;
  scope: string | null;
  startDate: string | null;
  endDate: string | null;
  closedAt: string | null;
  /** The current picture's URL, or null when it has none. */
  imageSrc: string | null;
};

function errorsOf(state: ActionState) {
  return state.status === "error" ? (state.fieldErrors ?? {}) : {};
}

/**
 * Create and edit share one set of fields, as TaskForm does for tasks — the
 * `project` prop switches it to edit mode.
 */
function ProjectForm({
  action,
  state,
  project,
  submitLabel,
  onCancel,
}: {
  action: (formData: FormData) => void;
  state: ActionState;
  project?: ProjectFormData;
  submitLabel: string;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const id = project?.id ?? "new";
  const errors = errorsOf(state);

  return (
    <form action={action} className="space-y-4">
      {project && <input type="hidden" name="projectId" value={project.id} />}
      {state.status === "error" && !state.fieldErrors && (
        <Alert tone="error">{state.message}</Alert>
      )}

      <div>
        <label className="label" htmlFor={`project-name-${id}`}>
          {t("projects.name")}
        </label>
        <input
          id={`project-name-${id}`}
          name="name"
          className="input"
          required
          maxLength={200}
          defaultValue={project?.name ?? ""}
        />
        <FieldError message={errors.name} />
      </div>

      <div>
        <label className="label" htmlFor={`project-scope-${id}`}>
          {t("projects.scope")}{" "}
          <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
        </label>
        <textarea
          id={`project-scope-${id}`}
          name="scope"
          className="input"
          rows={5}
          maxLength={5000}
          defaultValue={project?.scope ?? ""}
        />
        <FieldError message={errors.scope} />
      </div>

      <PictureField
        id={`project-image-${id}`}
        label={t("projects.image")}
        current={project?.imageSrc ?? null}
        error={errors.image}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`project-start-${id}`}>
            {t("projects.startDate")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`project-start-${id}`}
            name="startDate"
            type="date"
            className="input"
            defaultValue={project?.startDate?.slice(0, 10) ?? ""}
          />
          <FieldError message={errors.startDate} />
        </div>
        <div>
          <label className="label" htmlFor={`project-end-${id}`}>
            {t("projects.endDate")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`project-end-${id}`}
            name="endDate"
            type="date"
            className="input"
            defaultValue={project?.endDate?.slice(0, 10) ?? ""}
          />
          <FieldError message={errors.endDate} />
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton className="btn btn-primary">{submitLabel}</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/** The admin's "+ new project" button, opening onto the form in place. */
export function ProjectCreator() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createProjectAction, idleState);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="space-y-3">
        {state.status === "success" && <Alert tone="success">{state.message}</Alert>}
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          {t("projects.new")}
        </button>
      </div>
    );
  }

  return (
    <Reveal className="panel">
      <ProjectForm
        action={action}
        state={state}
        submitLabel={t("projects.create")}
        onCancel={() => setOpen(false)}
      />
    </Reveal>
  );
}

/**
 * An admin's controls on a project's page: edit in place, and close or reopen.
 * Hidden for everyone else by the page; enforced by the actions either way.
 */
export function ProjectAdminControls({ project }: { project: ProjectFormData }) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateProjectAction, idleState);
  const [closeState, closeAction] = useActionState(toggleProjectClosedAction, idleState);

  useEffect(() => {
    if (editState.status === "success") setEditing(false);
  }, [editState]);

  if (editing) {
    return (
      <Reveal className="panel">
        <ProjectForm
          action={editAction}
          state={editState}
          project={project}
          submitLabel={t("projects.save")}
          onCancel={() => setEditing(false)}
        />
      </Reveal>
    );
  }

  return (
    <div className="space-y-3">
      {[editState, closeState].map(
        (state, i) =>
          state.status !== "idle" &&
          state.message && (
            <Alert key={i} tone={state.status === "error" ? "error" : "success"}>
              {state.message}
            </Alert>
          ),
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          {t("projects.edit")}
        </button>
        <form action={closeAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <SubmitButton className="btn btn-secondary">
            {project.closedAt ? t("projects.reopen") : t("projects.close")}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

/**
 * An admin's ← → under a project on the list, moving it one place in the
 * order the band and the list share. One form, and the button pressed says
 * which way: the submitter's name and value ride along in the FormData.
 */
export function ProjectMoveButtons({
  projectId,
  first,
  last,
}: {
  projectId: string;
  first: boolean;
  last: boolean;
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(moveProjectAction, idleState);

  return (
    <form action={action} className="flex items-center justify-end gap-2">
      {state.status === "error" && (
        <span className="me-auto text-xs" style={{ color: "var(--danger)" }}>
          {state.message}
        </span>
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        name="direction"
        value="up"
        className="btn btn-secondary"
        disabled={first || pending}
        aria-label={t("projects.moveEarlier")}
        title={t("projects.moveEarlier")}
      >
        ←
      </button>
      <button
        type="submit"
        name="direction"
        value="down"
        className="btn btn-secondary"
        disabled={last || pending}
        aria-label={t("projects.moveLater")}
        title={t("projects.moveLater")}
      >
        →
      </button>
    </form>
  );
}
