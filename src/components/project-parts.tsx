"use client";

import { useActionState, useEffect, useState } from "react";

import { Reveal } from "@/components/motion";
import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import type { PartRef } from "@/lib/projects";
import { createPartAction, deletePartAction, renamePartAction } from "@/server/actions/projects";
import { idleState, type ActionState } from "@/server/actions/types";

function errorsOf(state: ActionState) {
  return state.status === "error" ? (state.fieldErrors ?? {}) : {};
}

/**
 * An admin's "+ sub-project" on a project's page, opening onto a one-field
 * form in place. Hidden for everyone else by the page; the action is
 * admin-only either way. With `parentId` it adds one inside that sub-project.
 */
export function PartCreator({
  projectId,
  parentId,
}: {
  projectId: string;
  parentId?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createPartAction, idleState);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        {parentId ? t("parts.addInside") : t("parts.add")}
      </button>
    );
  }

  return (
    <Reveal className={parentId ? "w-full min-w-0" : "w-full"}>
      <form action={action} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
        <div className="min-w-0 flex-1 basis-48">
          <label className="sr-only" htmlFor={`part-new-${parentId ?? projectId}`}>
            {t("parts.name")}
          </label>
          <input
            id={`part-new-${parentId ?? projectId}`}
            name="name"
            className="input"
            required
            maxLength={120}
            placeholder={t("parts.name")}
            autoFocus
          />
          <FieldError message={errorsOf(state).name} />
          {state.status === "error" && !state.fieldErrors && (
            <Alert tone="error">{state.message}</Alert>
          )}
        </div>
        <SubmitButton className="btn btn-primary">{t("projects.create")}</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </button>
      </form>
    </Reveal>
  );
}

/**
 * Rename or delete one sub-project, opened from its node on the map. Delete
 * asks once more in place: it ungroups every task and trip under the part,
 * which is not undone by recreating a part with the same name.
 */
export function PartEditor({
  part,
  projectId,
  onDone,
}: {
  part: PartRef;
  projectId: string;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [renameState, renameAction] = useActionState(renamePartAction, idleState);
  const [deleteState, deleteAction] = useActionState(deletePartAction, idleState);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (renameState.status === "success") onDone();
  }, [renameState, onDone]);

  const failed = [renameState, deleteState].find(
    (state) => state.status === "error" && !state.fieldErrors,
  );

  const confirm = (
    <form action={deleteAction} className="space-y-2">
      <input type="hidden" name="partId" value={part.id} />
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("parts.deleteConfirm")}
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn btn-danger">{t("parts.delete")}</SubmitButton>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setConfirming(false)}
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );

  return (
    <Reveal className="card w-64 max-w-full space-y-2 p-3">
      <form action={renameAction} className="space-y-2">
        <input type="hidden" name="partId" value={part.id} />
        <label className="sr-only" htmlFor={`part-name-${part.id}`}>
          {t("parts.name")}
        </label>
        <input
          id={`part-name-${part.id}`}
          name="name"
          className="input"
          required
          maxLength={120}
          defaultValue={part.name}
          autoFocus
        />
        <FieldError message={errorsOf(renameState).name} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton className="btn btn-primary">{t("parts.rename")}</SubmitButton>
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            {t("common.cancel")}
          </button>
        </div>
      </form>

      {failed?.status === "error" && <Alert tone="error">{failed.message}</Alert>}

      <PartCreator projectId={projectId} parentId={part.id} />

      {confirming ? (
        confirm
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
          {t("parts.delete")}
        </button>
      )}
    </Reveal>
  );
}
