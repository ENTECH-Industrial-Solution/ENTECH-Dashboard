"use client";

import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui";
import { TaskForm, type AssigneeOption } from "@/components/task-form";
import { TripForm, type TripPinOption } from "@/components/trip-form";
import { useTranslations } from "@/lib/i18n/client";
import { createFieldTripAction } from "@/server/actions/field-trips";
import { createTaskAction } from "@/server/actions/tasks";
import { idleState } from "@/server/actions/types";

type Kind = "task" | "trip";

/**
 * "Add my work" on a person's own dashboard.
 *
 * The employee's copy of TaskCreator: the same two kinds behind the same type
 * switch, the same two forms — and one thing less, which is anyone to choose.
 * The only person an employee may create a task for, or put on a trip, is
 * themselves, so both forms arrive with that decided. Two forms over one set
 * of fields is how create-vs-edit drift starts, so these are the admin's
 * forms with the assignee and the traveller list locked, not copies.
 *
 * The locks in the forms are a courtesy; the rule is in the two create
 * actions, which pin a non-admin's work to the caller whatever the request
 * said.
 */
export function SelfWorkCreator({
  self,
  tripsEnabled,
  pins = [],
}: {
  self: AssigneeOption;
  tripsEnabled: boolean;
  /** Empty when the customer map is switched off — the picker then hides. */
  pins?: TripPinOption[];
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
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          {t("tasks.newSelf")}
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-4">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {t("tasks.newSelfHint")}
      </p>

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
          people={[self]}
          lockedTravellers={[self]}
          pins={pins}
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
          assignees={[self]}
          lockedAssignee={self}
          submitLabel={t("common.create")}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
