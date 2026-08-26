"use client";

import { useActionState, useEffect, useState } from "react";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { TripForm, type TripPerson } from "@/components/trip-form";
import { useTranslations } from "@/lib/i18n/client";
import { createFieldTripAction } from "@/server/actions/field-trips";
import { createTaskAction } from "@/server/actions/tasks";
import { idleState } from "@/server/actions/types";

export type AssigneeOption = TripPerson;

type Kind = "task" | "trip";

/**
 * One entry point for assigning work, whichever kind it is.
 *
 * A trip is work with a place attached, so it starts the same way a task does —
 * the type switch swaps the fields rather than sending people to a different
 * page. Each kind keeps its own action and its own field errors; switching
 * kinds does not carry one form's complaints into the other.
 */
export function TaskCreator({
  assignees,
  tripsEnabled,
}: {
  assignees: AssigneeOption[];
  tripsEnabled: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [kindState, setKind] = useState<Kind>("task");

  // With trips switched off there is only one kind of thing to create, so the
  // switch disappears rather than offering a choice that leads nowhere.
  const kind: Kind = tripsEnabled ? kindState : "task";

  const [taskState, taskAction] = useActionState(createTaskAction, idleState);
  const [tripState, tripAction] = useActionState(createFieldTripAction, idleState);

  useEffect(() => {
    if (taskState.status === "success") setOpen(false);
  }, [taskState]);

  useEffect(() => {
    if (tripState.status === "success") setOpen(false);
  }, [tripState]);

  const taskErrors =
    taskState.status === "error" ? (taskState.fieldErrors ?? {}) : {};
  const tripErrors =
    tripState.status === "error" ? (tripState.fieldErrors ?? {}) : {};

  if (!open) {
    return (
      <div className="space-y-3">
        {taskState.status === "success" && (
          <Alert tone="success">{taskState.message}</Alert>
        )}
        {tripState.status === "success" && (
          <Alert tone="success">{tripState.message}</Alert>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen(true)}
        >
          {t("tasks.new")}
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-4">
      {tripsEnabled && (
      <div>
        <span className="label">{t("tasks.kind")}</span>
        <div
          className="inline-flex rounded-lg border p-0.5"
          role="group"
          aria-label={t("tasks.kind")}
        >
          {(["task", "trip"] as const).map((option) => {
            const active = option === kind;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                aria-pressed={active}
                className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                style={
                  active
                    ? { background: "var(--brand)", color: "var(--brand-contrast)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {option === "task" ? t("tasks.kindTask") : t("tasks.kindTrip")}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {kind === "trip" ? (
        <TripForm
          action={tripAction}
          errors={tripErrors}
          formError={
            tripState.status === "error" && !tripState.fieldErrors
              ? tripState.message
              : undefined
          }
          people={assignees}
          submitLabel={t("common.create")}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <form action={taskAction} className="space-y-4">
          {taskState.status === "error" && !taskState.fieldErrors && (
            <Alert tone="error">{taskState.message}</Alert>
          )}

          <div>
            <label className="label" htmlFor="title">
              {t("tasks.title")}
            </label>
            <input id="title" name="title" className="input" required maxLength={200} />
            <FieldError message={taskErrors.title} />
          </div>

          <div>
            <label className="label" htmlFor="description">
              {t("tasks.description")}{" "}
              <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
            </label>
            <textarea
              id="description"
              name="description"
              className="input"
              rows={3}
              maxLength={5000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="assigneeId">
                {t("tasks.assignee")}
              </label>
              <select
                id="assigneeId"
                name="assigneeId"
                className="input"
                required
                defaultValue=""
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
              <FieldError message={taskErrors.assigneeId} />
            </div>

            <div>
              <label className="label" htmlFor="priority">
                {t("tasks.priority")}
              </label>
              <select
                id="priority"
                name="priority"
                className="input"
                defaultValue="MEDIUM"
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
              <label className="label" htmlFor="startDate">
                {t("tasks.startDate")}{" "}
                <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
              </label>
              <input id="startDate" name="startDate" type="date" className="input" />
              <FieldError message={taskErrors.startDate} />
            </div>

            <div>
              <label className="label" htmlFor="dueDate">
                {t("tasks.dueDate")}{" "}
                <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
              </label>
              <input id="dueDate" name="dueDate" type="date" className="input" />
              <FieldError message={taskErrors.dueDate} />
            </div>
          </div>

          <div className="flex gap-2">
            <SubmitButton className="btn btn-primary">
              {t("common.create")}
            </SubmitButton>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
