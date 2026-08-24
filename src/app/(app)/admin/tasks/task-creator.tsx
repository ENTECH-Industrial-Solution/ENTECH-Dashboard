"use client";

import { useActionState, useState } from "react";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import { createTaskAction } from "@/server/actions/tasks";
import { idleState } from "@/server/actions/types";

export type AssigneeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string | null;
};

export function TaskCreator({ assignees }: { assignees: AssigneeOption[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createTaskAction, idleState);

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (!open) {
    return (
      <div className="space-y-3">
        {state.status === "success" && <Alert tone="success">{state.message}</Alert>}
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          {t("tasks.new")}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 p-4">
      {state.status === "error" && !state.fieldErrors && (
        <Alert tone="error">{state.message}</Alert>
      )}

      <div>
        <label className="label" htmlFor="title">
          {t("tasks.title")}
        </label>
        <input id="title" name="title" className="input" required maxLength={200} />
        <FieldError message={errors.title} />
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="assigneeId">
            {t("tasks.assignee")}
          </label>
          <select id="assigneeId" name="assigneeId" className="input" required defaultValue="">
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
          <label className="label" htmlFor="priority">
            {t("tasks.priority")}
          </label>
          <select id="priority" name="priority" className="input" defaultValue="MEDIUM">
            <option value="LOW">{t("priority.LOW")}</option>
            <option value="MEDIUM">{t("priority.MEDIUM")}</option>
            <option value="HIGH">{t("priority.HIGH")}</option>
            <option value="URGENT">{t("priority.URGENT")}</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dueDate">
            {t("tasks.dueDate")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input id="dueDate" name="dueDate" type="date" className="input" />
          <FieldError message={errors.dueDate} />
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton className="btn btn-primary">{t("common.create")}</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
