"use client";

import { useActionState, useState } from "react";

import { Alert, PriorityBadge, StatusBadge, SubmitButton } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import { idleState } from "@/server/actions/types";
import {
  completeTaskAction,
  reopenTaskAction,
  updateTaskStatusAction,
} from "@/server/actions/tasks";

export type TaskCardData = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string | null;
  completedAt: string | null;
  completionNote: string | null;
  proofUrl: string | null;
  createdAt: string;
  assignee: { id: string; employeeCode: string; fullName: string };
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

/** A task still in progress — the assignee can move it or complete it. */
export function ActiveTaskCard({
  task,
  canMutate,
}: {
  task: TaskCardData;
  canMutate: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const [completing, setCompleting] = useState(false);

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

  return (
    <article className="card p-4 space-y-3">
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
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
      </div>

      {task.description && (
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
        <div className="flex gap-1">
          <dt>{t("tasks.assignee")}:</dt>
          <dd style={{ color: "var(--text)" }}>
            {task.assignee.employeeCode} — {task.assignee.fullName}
          </dd>
        </div>
        {task.dueDate && (
          <div className="flex gap-1">
            <dt>{t("tasks.dueDate")}:</dt>
            <dd style={{ color: overdue ? "var(--danger)" : "var(--text)" }}>
              {format(task.dueDate)}
              {overdue && ` · ${t("tasks.overdue")}`}
            </dd>
          </div>
        )}
      </dl>

      {statusState.status === "error" && (
        <Alert tone="error">{statusState.message}</Alert>
      )}
      {completeState.status === "error" && (
        <Alert tone="error">{completeState.message}</Alert>
      )}

      {canMutate && !completing && (
        <div className="flex flex-wrap gap-2 pt-1">
          {task.status === "TODO" && (
            <form action={statusAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value="IN_PROGRESS" />
              <SubmitButton className="btn btn-secondary">
                {t("tasks.start")}
              </SubmitButton>
            </form>
          )}

          {task.status === "IN_PROGRESS" && (
            <form action={statusAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value="BLOCKED" />
              <SubmitButton className="btn btn-secondary">
                {t("tasks.block")}
              </SubmitButton>
            </form>
          )}

          {task.status === "BLOCKED" && (
            <form action={statusAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="status" value="IN_PROGRESS" />
              <SubmitButton className="btn btn-secondary">
                {t("tasks.resume")}
              </SubmitButton>
            </form>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCompleting(true)}
          >
            {t("tasks.complete")}
          </button>
        </div>
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
 * A completed task. Read-only by design — the only affordance is an admin
 * reopen, which demands a reason and is written to the audit log.
 */
export function CompletedTaskCard({
  task,
  isAdmin,
}: {
  task: TaskCardData;
  isAdmin: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const [reopening, setReopening] = useState(false);
  const [state, formAction] = useActionState(reopenTaskAction, idleState);

  return (
    <article
      className="card p-4 space-y-3"
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
        <div className="flex gap-1">
          <dt>{t("tasks.assignee")}:</dt>
          <dd style={{ color: "var(--text)" }}>
            {task.assignee.employeeCode} — {task.assignee.fullName}
          </dd>
        </div>
        {task.completedAt && (
          <div className="flex gap-1">
            <dt>{t("tasks.completedAt")}:</dt>
            <dd style={{ color: "var(--text)" }}>{format(task.completedAt, true)}</dd>
          </div>
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
          {task.proofUrl && (
            <a
              href={task.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs underline"
              style={{ color: "var(--brand)" }}
            >
              {task.proofUrl}
            </a>
          )}
        </div>
      )}

      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      {isAdmin &&
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setReopening(true)}
          >
            {t("tasks.reopen")}
          </button>
        ))}
    </article>
  );
}
