"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";

import { TaskForm, type AssigneeOption } from "@/components/task-form";
import { VideoPlayer } from "@/components/video-embed";
import { Alert, PriorityBadge, StatusBadge, SubmitButton } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import { useSettings } from "@/lib/settings/client";
import { idleState } from "@/server/actions/types";
import {
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
} from "@/server/actions/tasks";

export type TaskCardData = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  /** Planned start, set when the work was assigned. */
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  completionNote: string | null;
  proofUrl: string | null;
  createdAt: string;
  assignee: { id: string; employeeCode: string; fullName: string };
  /** The admin who created and assigned the task. */
  createdBy: { employeeCode: string; fullName: string };
};

function useFormatter() {
  const locale = useLocale();
  return (iso: string, withTime = false) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
}

/** One label/value pair in a card's metadata row. */
function Meta({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-1">
      <dt>{label}:</dt>
      <dd style={{ color: tone ?? "var(--text)" }}>{children}</dd>
    </div>
  );
}

/**
 * The inline editor a card swaps itself for.
 *
 * Both cards use it, and both look identical while editing: whether a task is
 * active or archived changes what the form offers (the completion pair appears
 * only where there is one), never how the edit works or what it records.
 *
 * Kept in its own component so its `useActionState` unmounts with it — a
 * cancelled edit leaves no stale error behind for the next one.
 */
function TaskEditor({
  task,
  assignees,
  setEditing,
}: {
  task: TaskCardData;
  assignees: AssigneeOption[];
  setEditing: (value: boolean) => void;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(updateTaskAction, idleState);

  useEffect(() => {
    if (state.status === "success") setEditing(false);
  }, [state, setEditing]);

  return (
    <article id={`task-${task.id}`} className="card scroll-mt-24 space-y-3 p-4">
      <div className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
        {task.code} · {t("tasks.editTitle")}
      </div>

      <TaskForm
        action={formAction}
        errors={state.status === "error" ? (state.fieldErrors ?? {}) : {}}
        formError={
          state.status === "error" && !state.fieldErrors ? state.message : undefined
        }
        assignees={assignees}
        task={task}
        submitLabel={t("common.save")}
        onCancel={() => setEditing(false)}
      />
    </article>
  );
}

/**
 * The delete confirmation, inline on the card.
 *
 * A reason field rather than a browser `confirm()`, which is what deactivating
 * an employee uses: an OK button is a reflex, and typing a sentence is not. It
 * is also the only place the reason can come from — after the delete lands
 * there is no task left to attach an explanation to, so the audit row has to
 * collect it here or never.
 *
 * On success there is nothing to close: the row is gone, the list revalidates
 * without it, and this component unmounts with the card around it.
 */
function TaskDeleter({
  task,
  setDeleting,
}: {
  task: TaskCardData;
  setDeleting: (value: boolean) => void;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(deleteTaskAction, idleState);

  return (
    <form action={formAction} className="space-y-2 pt-1">
      <Alert tone="warning">{t("tasks.deleteWarning")}</Alert>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <input type="hidden" name="taskId" value={task.id} />

      <div>
        <label className="label" htmlFor={`delete-${task.id}`}>
          {t("tasks.deleteReason")}
        </label>
        <input
          id={`delete-${task.id}`}
          name="reason"
          className="input"
          required
          maxLength={1000}
        />
      </div>

      <div className="flex gap-2">
        <SubmitButton className="btn btn-danger">
          {t("tasks.deleteConfirm")}
        </SubmitButton>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDeleting(false)}
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/** A task still in progress — the assignee can move it or complete it. */
export function ActiveTaskCard({
  task,
  canMutate,
  isAdmin = false,
  assignees = [],
}: {
  task: TaskCardData;
  canMutate: boolean;
  /** Editing the task's content is admin-only, separately from canMutate. */
  isAdmin?: boolean;
  assignees?: AssigneeOption[];
}) {
  const t = useTranslations();
  const format = useFormatter();
  const settings = useSettings();
  const [completing, setCompleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [statusState, statusAction] = useActionState(
    updateTaskStatusAction,
    idleState,
  );
  const [completeState, completeAction] = useActionState(
    completeTaskAction,
    idleState,
  );

  const overdue =
    task.dueDate !== null && new Date(task.dueDate) < new Date();

  if (isAdmin && editing) {
    return <TaskEditor task={task} assignees={assignees} setEditing={setEditing} />;
  }

  return (
    <article id={`task-${task.id}`} className="card scroll-mt-24 p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {task.code}
          </div>
          <h3 className="mt-0.5 font-medium leading-snug break-words">
            {task.title}
          </h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {settings["task.showPriority"] && <PriorityBadge priority={task.priority} />}
          <StatusBadge status={task.status} />
        </div>
      </div>

      {settings["task.showDescription"] && task.description && (
        <p
          className="whitespace-pre-wrap text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {task.description}
        </p>
      )}

      <dl
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <Meta label={t("tasks.assignee")}>
          {task.assignee.employeeCode} — {task.assignee.fullName}
        </Meta>

        {settings["task.showAssigner"] && (
          <Meta label={t("tasks.assignedBy")}>
            {task.createdBy.employeeCode} — {task.createdBy.fullName}
          </Meta>
        )}

        {settings["task.showSchedule"] && task.startDate && (
          <Meta label={t("tasks.startDate")}>{format(task.startDate)}</Meta>
        )}

        {settings["task.showSchedule"] && task.dueDate && (
          <Meta
            label={t("tasks.dueDate")}
            tone={overdue ? "var(--danger)" : undefined}
          >
            {format(task.dueDate)}
            {overdue && ` · ${t("tasks.overdue")}`}
          </Meta>
        )}
      </dl>

      {statusState.status === "error" && (
        <Alert tone="error">{statusState.message}</Alert>
      )}
      {completeState.status === "error" && (
        <Alert tone="error">{completeState.message}</Alert>
      )}

      {(canMutate || isAdmin) && !completing && !deleting && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canMutate && task.status === "TODO" && (
            <form action={statusAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value="IN_PROGRESS" />
              <SubmitButton className="btn btn-secondary">
                {t("tasks.start")}
              </SubmitButton>
            </form>
          )}

          {canMutate && task.status === "IN_PROGRESS" && (
            <form action={statusAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value="BLOCKED" />
              <SubmitButton className="btn btn-secondary">
                {t("tasks.block")}
              </SubmitButton>
            </form>
          )}

          {canMutate && task.status === "BLOCKED" && (
            <form action={statusAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value="IN_PROGRESS" />
              <SubmitButton className="btn btn-secondary">
                {t("tasks.resume")}
              </SubmitButton>
            </form>
          )}

          {canMutate && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCompleting(true)}
            >
              {t("tasks.complete")}
            </button>
          )}

          {isAdmin && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditing(true)}
              >
                {t("tasks.edit")}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--danger)" }}
                onClick={() => setDeleting(true)}
              >
                {t("tasks.delete")}
              </button>
            </>
          )}
        </div>
      )}

      {isAdmin && deleting && (
        <TaskDeleter task={task} setDeleting={setDeleting} />
      )}

      {canMutate && completing && (
        <form action={completeAction} className="space-y-3 pt-1">
          <input type="hidden" name="taskId" value={task.id} />
          <div>
            <label className="label" htmlFor={`note-${task.id}`}>
              {t("tasks.completionNote")}
            </label>
            <textarea
              id={`note-${task.id}`}
              name="completionNote"
              className="input"
              rows={3}
              required
              maxLength={5000}
            />
          </div>

          {settings["task.showProof"] && (
            <div>
              <label className="label" htmlFor={`proof-${task.id}`}>
                {t("tasks.proofUrl")}{" "}
                <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
              </label>
              <input
                id={`proof-${task.id}`}
                name="proofUrl"
                type="url"
                className="input"
                placeholder="https://"
              />
            </div>
          )}

          <div className="flex gap-2">
            <SubmitButton className="btn btn-primary">
              {t("common.confirm")}
            </SubmitButton>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCompleting(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

/**
 * A completed task. Read-only to everyone but an admin, who has two ways in:
 * reopen, which moves it back out of the archive and demands a reason, and
 * edit, which corrects the record in place. Both are written to the audit log
 * — that accounting, not immutability, is what the archive rests on.
 */
export function CompletedTaskCard({
  task,
  isAdmin,
  assignees = [],
}: {
  task: TaskCardData;
  isAdmin: boolean;
  assignees?: AssigneeOption[];
}) {
  const t = useTranslations();
  const format = useFormatter();
  const settings = useSettings();
  const [reopening, setReopening] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [state, formAction] = useActionState(reopenTaskAction, idleState);

  if (isAdmin && editing) {
    return <TaskEditor task={task} assignees={assignees} setEditing={setEditing} />;
  }

  return (
    <article
      id={`task-${task.id}`}
      className="card scroll-mt-24 p-4 space-y-3"
      style={{ background: "var(--surface-muted)" }}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            {task.code}
          </div>
          <h3 className="mt-0.5 font-medium leading-snug break-words">
            {task.title}
          </h3>
        </div>
        <StatusBadge status="COMPLETED" />
      </div>

      <dl
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <Meta label={t("tasks.assignee")}>
          {task.assignee.employeeCode} — {task.assignee.fullName}
        </Meta>

        {settings["task.showAssigner"] && (
          <Meta label={t("tasks.assignedBy")}>
            {task.createdBy.employeeCode} — {task.createdBy.fullName}
          </Meta>
        )}

        {settings["task.showSchedule"] && task.startDate && (
          <Meta label={t("tasks.startDate")}>{format(task.startDate)}</Meta>
        )}

        {task.completedAt && (
          <Meta label={t("tasks.completedAt")}>
            {format(task.completedAt, true)}
          </Meta>
        )}
      </dl>

      {task.completionNote && (
        <div
          className="rounded-lg border-s-2 px-3 py-2 text-sm"
          style={{
            borderInlineStartColor: "var(--success)",
            background: "var(--surface)",
          }}
        >
          <div
            className="mb-1 text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {t("tasks.completionNote")}
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">
            {task.completionNote}
          </p>
          {/* Not gated: a link already recorded stays visible as evidence even
              if the field has since been switched off for new completions. */}
          {task.proofUrl && (
            <>
              <a
                href={task.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block break-all text-xs underline"
                style={{ color: "var(--brand)" }}
              >
                {task.proofUrl}
              </a>
              {/* Renders nothing unless the link is a video we recognise, so
                  the link above stays the answer for everything else — and
                  nothing at all when the switch is off, which leaves exactly
                  that link behind. */}
              {settings["task.showVideo"] && <VideoPlayer url={task.proofUrl} />}
            </>
          )}
        </div>
      )}

      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      {isAdmin && deleting ? (
        <TaskDeleter task={task} setDeleting={setDeleting} />
      ) : (
        isAdmin &&
        (reopening ? (
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="taskId" value={task.id} />
            <div>
              <label className="label" htmlFor={`reason-${task.id}`}>
                {t("tasks.reopenReason")}
              </label>
              <input
                id={`reason-${task.id}`}
                name="reason"
                className="input"
                required
                maxLength={1000}
              />
            </div>
            <div className="flex gap-2">
              <SubmitButton className="btn btn-danger">
                {t("tasks.reopen")}
              </SubmitButton>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReopening(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(true)}
            >
              {t("tasks.edit")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setReopening(true)}
            >
              {t("tasks.reopen")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: "var(--danger)" }}
              onClick={() => setDeleting(true)}
            >
              {t("tasks.delete")}
            </button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("tasks.editAudited")}
            </span>
          </div>
        ))
      )}
    </article>
  );
}
