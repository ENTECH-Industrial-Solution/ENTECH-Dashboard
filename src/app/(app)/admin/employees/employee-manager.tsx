"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useState } from "react";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import {
  createEmployeeAction,
  deactivateEmployeeAction,
  deleteEmployeeAction,
  reactivateEmployeeAction,
  resetPasswordAction,
  updateEmployeeAction,
} from "@/server/actions/employees";
import { idleState } from "@/server/actions/types";

export type EmployeeRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  department: string | null;
  position: string | null;
  role: "ADMIN" | "EMPLOYEE";
  isActive: boolean;
  lastLoginAt: string | null;
  openTasks: number;
};

export function EmployeeManager({
  employees,
  currentUserId,
}: {
  employees: EmployeeRow[];
  currentUserId: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The two expanders are exclusive: a row that is being renamed is not also
  // being deleted, and two open forms in one row read as one confused form.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [createState, createAction] = useActionState(
    createEmployeeAction,
    idleState,
  );
  const [updateState, updateAction] = useActionState(
    updateEmployeeAction,
    idleState,
  );
  const [resetState, resetAction] = useActionState(resetPasswordAction, idleState);
  const [deactivateState, deactivateAction] = useActionState(
    deactivateEmployeeAction,
    idleState,
  );
  const [reactivateState, reactivateAction] = useActionState(
    reactivateEmployeeAction,
    idleState,
  );
  const [deleteState, deleteAction] = useActionState(deleteEmployeeAction, idleState);

  // Collapse the edit form once the save lands. The state object is a new
  // reference per result, so this fires once per submission, not on re-render.
  useEffect(() => {
    if (updateState.status === "success") setEditingId(null);
  }, [updateState]);

  useEffect(() => {
    if (deleteState.status === "success") setDeletingId(null);
  }, [deleteState]);

  const createErrors =
    createState.status === "error" ? (createState.fieldErrors ?? {}) : {};
  const updateErrors =
    updateState.status === "error" ? (updateState.fieldErrors ?? {}) : {};
  const deleteErrors =
    deleteState.status === "error" ? (deleteState.fieldErrors ?? {}) : {};

  // A temporary password is surfaced exactly once, right after it is generated.
  const credential =
    createState.status === "success" && createState.data
      ? createState.data
      : resetState.status === "success" && resetState.data
        ? resetState.data
        : null;

  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Bangkok",
        }).format(new Date(iso))
      : t("employees.never");

  return (
    <div className="space-y-4">
      {credential && (
        <div
          className="card p-4 space-y-2"
          style={{ borderColor: "var(--warning)" }}
        >
          <div className="text-sm font-medium">{t("employees.tempPassword")}</div>
          <div className="flex flex-wrap items-center gap-3">
            <code
              className="rounded-md px-2 py-1 font-mono text-sm"
              style={{ background: "var(--surface-muted)" }}
            >
              {credential.employeeCode}
            </code>
            <code
              className="rounded-md px-2 py-1 font-mono text-sm select-all"
              style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
            >
              {credential.temporaryPassword}
            </code>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("employees.tempPasswordHint")}
          </p>
        </div>
      )}

      {updateState.status === "success" && updateState.message && (
        <Alert tone="success">{updateState.message}</Alert>
      )}
      {updateState.status === "error" && !updateState.fieldErrors && (
        <Alert tone="error">{updateState.message}</Alert>
      )}
      {deactivateState.status === "error" && (
        <Alert tone="error">{deactivateState.message}</Alert>
      )}
      {reactivateState.status === "error" && (
        <Alert tone="error">{reactivateState.message}</Alert>
      )}
      {resetState.status === "error" && <Alert tone="error">{resetState.message}</Alert>}
      {deleteState.status === "success" && deleteState.message && (
        <Alert tone="success">{deleteState.message}</Alert>
      )}
      {deleteState.status === "error" && !deleteState.fieldErrors && (
        <Alert tone="error">{deleteState.message}</Alert>
      )}

      {creating ? (
        <form action={createAction} className="card space-y-4 p-4">
          {createState.status === "error" && !createState.fieldErrors && (
            <Alert tone="error">{createState.message}</Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="employeeCode">
                {t("employees.code")}
              </label>
              <input
                id="employeeCode"
                name="employeeCode"
                className="input"
                required
                placeholder="ENT-0002"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <FieldError message={createErrors.employeeCode} />
            </div>

            <div>
              <label className="label" htmlFor="fullName">
                {t("employees.name")}
              </label>
              <input id="fullName" name="fullName" className="input" required />
              <FieldError message={createErrors.fullName} />
            </div>

            <div>
              <label className="label" htmlFor="email">
                {t("employees.email")}{" "}
                <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
              </label>
              <input id="email" name="email" type="email" className="input" />
              <FieldError message={createErrors.email} />
            </div>

            <div>
              <label className="label" htmlFor="department">
                {t("employees.department")}{" "}
                <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
              </label>
              <input id="department" name="department" className="input" />
            </div>

            <div>
              <label className="label" htmlFor="position">
                {t("employees.position")}{" "}
                <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
              </label>
              <input id="position" name="position" className="input" />
            </div>

            <div>
              <label className="label" htmlFor="role">
                {t("employees.role")}
              </label>
              <select id="role" name="role" className="input" defaultValue="EMPLOYEE">
                <option value="EMPLOYEE">{t("nav.employee")}</option>
                <option value="ADMIN">{t("nav.admin")}</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <SubmitButton className="btn btn-primary">
              {t("common.create")}
            </SubmitButton>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreating(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
        >
          {t("employees.new")}
        </button>
      )}

      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("employees.code")}</th>
              <th>{t("employees.name")}</th>
              <th>{t("employees.department")}</th>
              <th>{t("employees.role")}</th>
              <th>{t("employees.openTasks")}</th>
              <th>{t("employees.lastLogin")}</th>
              <th>{t("employees.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <Fragment key={employee.id}>
                <tr style={{ opacity: employee.isActive ? 1 : 0.55 }}>
                  <td className="font-mono text-xs">{employee.employeeCode}</td>
                  <td>
                    <Link
                      href={`/dashboard/employee/${employee.id}`}
                      title={t("employees.viewTasks")}
                      className="underline-offset-2 hover:underline"
                    >
                      {employee.fullName}
                    </Link>
                    {employee.id === currentUserId && (
                      <span
                        className="ms-1.5 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        ({t("common.you")})
                      </span>
                    )}
                    {employee.email && (
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {employee.email}
                      </div>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {employee.department ?? t("common.none")}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={
                        employee.role === "ADMIN"
                          ? { background: "var(--brand-soft)", color: "var(--brand)" }
                          : {
                              background: "var(--surface-muted)",
                              color: "var(--text-muted)",
                            }
                      }
                    >
                      {employee.role === "ADMIN" ? t("nav.admin") : t("nav.employee")}
                    </span>
                  </td>
                  <td className="tabular-nums">{employee.openTasks}</td>
                  <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(employee.lastLoginAt)}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={
                        employee.isActive
                          ? { background: "var(--success-soft)", color: "var(--success)" }
                          : { background: "var(--danger-soft)", color: "var(--danger)" }
                      }
                    >
                      {employee.isActive
                        ? t("employees.active")
                        : t("employees.inactive")}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        aria-expanded={editingId === employee.id}
                        onClick={() => {
                          setDeletingId(null);
                          setEditingId(
                            editingId === employee.id ? null : employee.id,
                          );
                        }}
                      >
                        {editingId === employee.id
                          ? t("common.cancel")
                          : t("employees.edit")}
                      </button>

                      <form action={resetAction}>
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <SubmitButton className="btn btn-ghost">
                          {t("employees.resetPassword")}
                        </SubmitButton>
                      </form>

                      {employee.isActive ? (
                        <form
                          action={deactivateAction}
                          onSubmit={(event) => {
                            if (!confirm(t("employees.deactivateConfirm"))) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <SubmitButton className="btn btn-danger">
                            {t("employees.deactivate")}
                          </SubmitButton>
                        </form>
                      ) : (
                        <>
                          <form action={reactivateAction}>
                            <input
                              type="hidden"
                              name="employeeId"
                              value={employee.id}
                            />
                            <SubmitButton className="btn btn-secondary">
                              {t("employees.reactivate")}
                            </SubmitButton>
                          </form>

                          {/* Only on a deactivated account, and never on your
                              own — the same two rules the action enforces on
                              the server, mirrored here so the button is not
                              offered where it would only fail. */}
                          {employee.id !== currentUserId && (
                            <button
                              type="button"
                              className="btn btn-danger"
                              aria-expanded={deletingId === employee.id}
                              onClick={() => {
                                setEditingId(null);
                                setDeletingId(
                                  deletingId === employee.id ? null : employee.id,
                                );
                              }}
                            >
                              {deletingId === employee.id
                                ? t("common.cancel")
                                : t("employees.delete")}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>

                {editingId === employee.id && (
                  <tr>
                    <td colSpan={8} style={{ background: "var(--surface-muted)" }}>
                      <EmployeeEditForm
                        employee={employee}
                        action={updateAction}
                        errors={updateErrors}
                        isSelf={employee.id === currentUserId}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}

                {deletingId === employee.id && (
                  <tr>
                    <td colSpan={8} style={{ background: "var(--surface-muted)" }}>
                      <EmployeeDeleteForm
                        employee={employee}
                        action={deleteAction}
                        errors={deleteErrors}
                        onCancel={() => setDeletingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Edits everything about an account, the employee code included.
 *
 * The code is the login identifier, which is why it sat here as a read-only
 * caption for a long time. It is a field now because the thing it was
 * protecting against — a rename nobody was told about — is handled by saying
 * so: the note under it states what changes, and the action's success message
 * repeats the new code back to the admin who has to pass it on.
 *
 * Role changes revoke the person's sessions; a code change does not, and the
 * two warnings say which is which rather than leaving it to be discovered.
 */
function EmployeeEditForm({
  employee,
  action,
  errors,
  isSelf,
  onCancel,
}: {
  employee: EmployeeRow;
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  isSelf: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <form action={action} className="space-y-4 py-2">
      <input type="hidden" name="employeeId" value={employee.id} />

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium">{t("employees.editTitle")}</span>
        <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
          {employee.employeeCode}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`edit-code-${employee.id}`}>
            {t("employees.code")}
          </label>
          <input
            id={`edit-code-${employee.id}`}
            name="employeeCode"
            className="input font-mono"
            required
            maxLength={32}
            autoCapitalize="characters"
            spellCheck={false}
            defaultValue={employee.employeeCode}
          />
          <FieldError message={errors.employeeCode} />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {t("employees.codeChangeWarning")}
          </p>
        </div>

        <div>
          <label className="label" htmlFor={`edit-name-${employee.id}`}>
            {t("employees.name")}
          </label>
          <input
            id={`edit-name-${employee.id}`}
            name="fullName"
            className="input"
            required
            maxLength={120}
            defaultValue={employee.fullName}
          />
          <FieldError message={errors.fullName} />
        </div>

        <div>
          <label className="label" htmlFor={`edit-email-${employee.id}`}>
            {t("employees.email")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`edit-email-${employee.id}`}
            name="email"
            type="email"
            className="input"
            defaultValue={employee.email ?? ""}
          />
          <FieldError message={errors.email} />
        </div>

        <div>
          <label className="label" htmlFor={`edit-dept-${employee.id}`}>
            {t("employees.department")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`edit-dept-${employee.id}`}
            name="department"
            className="input"
            defaultValue={employee.department ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor={`edit-position-${employee.id}`}>
            {t("employees.position")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`edit-position-${employee.id}`}
            name="position"
            className="input"
            defaultValue={employee.position ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor={`edit-role-${employee.id}`}>
            {t("employees.role")}
          </label>
          <select
            id={`edit-role-${employee.id}`}
            name="role"
            className="input"
            defaultValue={employee.role}
          >
            <option value="EMPLOYEE">{t("nav.employee")}</option>
            <option value="ADMIN">{t("nav.admin")}</option>
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {isSelf
              ? t("employees.cannotDemoteSelf")
              : t("employees.roleChangeWarning")}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton className="btn btn-primary">{t("common.save")}</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/**
 * The confirmation for a delete that cannot be undone.
 *
 * A typed reason instead of a reflexive OK, and for the same purpose the task
 * and trip deletes ask for one: once the row is gone, the audit entry is the
 * only place an answer to "why is this account missing" can live.
 *
 * Which accounts can actually go is decided on the server — deactivated, and
 * nothing pointing at them. The warning here says so plainly, because being
 * refused after typing a reason is a worse way to learn it.
 */
function EmployeeDeleteForm({
  employee,
  action,
  errors,
  onCancel,
}: {
  employee: EmployeeRow;
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <form action={action} className="space-y-3 py-2">
      <input type="hidden" name="employeeId" value={employee.id} />

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--danger)" }}>
          {t("employees.deleteTitle")}
        </span>
        <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
          {employee.employeeCode} — {employee.fullName}
        </span>
      </div>

      <Alert tone="warning">{t("employees.deleteWarning")}</Alert>

      <div className="max-w-xl">
        <label className="label" htmlFor={`delete-reason-${employee.id}`}>
          {t("employees.deleteReason")}
        </label>
        <input
          id={`delete-reason-${employee.id}`}
          name="reason"
          className="input"
          required
          maxLength={1000}
        />
        <FieldError message={errors.reason} />
      </div>

      <div className="flex gap-2">
        <SubmitButton className="btn btn-danger">
          {t("employees.deleteConfirm")}
        </SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
