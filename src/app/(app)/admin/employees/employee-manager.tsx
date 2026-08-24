"use client";

import { useActionState, useState } from "react";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import {
  createEmployeeAction,
  deactivateEmployeeAction,
  reactivateEmployeeAction,
  resetPasswordAction,
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

  const [createState, createAction] = useActionState(
    createEmployeeAction,
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

  const createErrors =
    createState.status === "error" ? (createState.fieldErrors ?? {}) : {};

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

      {deactivateState.status === "error" && (
        <Alert tone="error">{deactivateState.message}</Alert>
      )}
      {reactivateState.status === "error" && (
        <Alert tone="error">{reactivateState.message}</Alert>
      )}
      {resetState.status === "error" && <Alert tone="error">{resetState.message}</Alert>}

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
              <tr key={employee.id} style={{ opacity: employee.isActive ? 1 : 0.55 }}>
                <td className="font-mono text-xs">{employee.employeeCode}</td>
                <td>
                  {employee.fullName}
                  {employee.id === currentUserId && (
                    <span className="ms-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
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
                        : { background: "var(--surface-muted)", color: "var(--text-muted)" }
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
                    {employee.isActive ? t("employees.active") : t("employees.inactive")}
                  </span>
                </td>
                <td>
                  <div className="flex justify-end gap-1.5">
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
                      <form action={reactivateAction}>
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <SubmitButton className="btn btn-secondary">
                          {t("employees.reactivate")}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
