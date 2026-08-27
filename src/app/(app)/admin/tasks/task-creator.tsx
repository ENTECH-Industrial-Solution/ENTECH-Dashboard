"use client";

import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui";
import { TaskForm, type AssigneeOption } from "@/components/task-form";
import { TripForm } from "@/components/trip-form";
import { useTranslations } from "@/lib/i18n/client";
import { createFieldTripAction } from "@/server/actions/field-trips";
import { createTaskAction } from "@/server/actions/tasks";
import { idleState } from "@/server/actions/types";

export type { AssigneeOption };

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
        <TaskForm
          action={taskAction}
          errors={taskErrors}
          formError={
            taskState.status === "error" && !taskState.fieldErrors
              ? taskState.message
              : undefined
          }
          assignees={assignees}
          submitLabel={t("common.create")}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
