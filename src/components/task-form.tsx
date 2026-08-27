"use client";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import type { TaskCardData } from "@/components/task-card";
import type { TripPerson } from "@/components/trip-form";
import { useTranslations } from "@/lib/i18n/client";

/** Same shape a trip's traveller list has — one query feeds both forms. */
export type AssigneeOption = TripPerson;

/** "2026-08-26T00:00:00.000Z" -> "2026-08-26", the value an <input type=date> wants. */
function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Create and edit share one form; the `task` prop switches it to edit mode.
 *
 * The same arrangement TripForm uses, and for the same reason: two forms over
 * one set of fields drift, and the pair that drifts is always create-vs-edit.
 *
 * Renders a bare <form> with no card of its own so the caller owns the
 * surrounding chrome — it appears inside the "new task" panel and as an inline
 * editor on a task card.
 */
export function TaskForm({
  action,
  errors,
  formError,
  assignees,
  task,
  submitLabel,
  onCancel,
}: {
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  formError?: string;
  assignees: AssigneeOption[];
  task?: TaskCardData;
  submitLabel: string;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const id = task?.id ?? "new";

  /*
   * The completion pair is offered only for a task that has one — a task that
   * is completed now, or one that was completed and has since been reopened
   * (reopenTaskAction deliberately keeps the note and the link).
   *
   * Not rendering it is safe precisely because the schema treats an absent key
   * as "unchanged" rather than "cleared"; see untouchedOrText in
   * lib/validation.ts. Offering it on a task that has never been finished would
   * invite writing a completion note that nothing displays.
   */
  const hasCompletionRecord =
    task !== undefined &&
    (task.completedAt !== null ||
      task.completionNote !== null ||
      task.proofUrl !== null);

  return (
    <form action={action} className="space-y-4">
      {task && <input type="hidden" name="taskId" value={task.id} />}
      {formError && <Alert tone="error">{formError}</Alert>}

      <div>
        <label className="label" htmlFor={`title-${id}`}>
          {t("tasks.title")}
        </label>
        <input
          id={`title-${id}`}
          name="title"
          className="input"
          required
          maxLength={200}
          defaultValue={task?.title ?? ""}
        />
        <FieldError message={errors.title} />
      </div>

      <div>
        <label className="label" htmlFor={`description-${id}`}>
          {t("tasks.description")}{" "}
          <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
        </label>
        <textarea
          id={`description-${id}`}
          name="description"
          className="input"
          rows={3}
          maxLength={5000}
          defaultValue={task?.description ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`assigneeId-${id}`}>
            {t("tasks.assignee")}
          </label>
          <select
            id={`assigneeId-${id}`}
            name="assigneeId"
            className="input"
            required
            defaultValue={task?.assignee.id ?? ""}
          >
            <option value="" disabled>
              —
            </option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.employeeCode} — {a.fullName}
                {a.department ? ` (${a.department})` : ""}
              </option>
            ))}
          </select>
          <FieldError message={errors.assigneeId} />
        </div>

        <div>
          <label className="label" htmlFor={`priority-${id}`}>
            {t("tasks.priority")}
          </label>
          <select
            id={`priority-${id}`}
            name="priority"
            className="input"
            defaultValue={task?.priority ?? "MEDIUM"}
          >
            <option value="LOW">{t("priority.LOW")}</option>
            <option value="MEDIUM">{t("priority.MEDIUM")}</option>
            <option value="HIGH">{t("priority.HIGH")}</option>
            <option value="URGENT">{t("priority.URGENT")}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`startDate-${id}`}>
            {t("tasks.startDate")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`startDate-${id}`}
            name="startDate"
            type="date"
            className="input"
            defaultValue={dateInputValue(task?.startDate ?? null)}
          />
          <FieldError message={errors.startDate} />
        </div>

        <div>
          <label className="label" htmlFor={`dueDate-${id}`}>
            {t("tasks.dueDate")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`dueDate-${id}`}
            name="dueDate"
            type="date"
            className="input"
            defaultValue={dateInputValue(task?.dueDate ?? null)}
          />
          <FieldError message={errors.dueDate} />
        </div>
      </div>

      {hasCompletionRecord && (
        <div
          className="space-y-4 rounded-lg border-s-2 px-3 py-3"
          style={{
            borderInlineStartColor: "var(--success)",
            background: "var(--surface-muted)",
          }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("tasks.editArchivedHint")}
          </p>

          <div>
            <label className="label" htmlFor={`editNote-${id}`}>
              {t("tasks.completionNote")}
            </label>
            <textarea
              id={`editNote-${id}`}
              name="completionNote"
              className="input"
              rows={3}
              maxLength={5000}
              defaultValue={task?.completionNote ?? ""}
            />
          </div>

          <div>
            <label className="label" htmlFor={`editProof-${id}`}>
              {t("tasks.proofUrl")}{" "}
              <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
            </label>
            <input
              id={`editProof-${id}`}
              name="proofUrl"
              type="url"
              className="input"
              placeholder="https://"
              defaultValue={task?.proofUrl ?? ""}
            />
            <FieldError message={errors.proofUrl} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <SubmitButton className="btn btn-primary">{submitLabel}</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
