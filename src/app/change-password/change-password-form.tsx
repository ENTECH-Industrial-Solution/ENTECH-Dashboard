"use client";

import { useActionState } from "react";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import { changePasswordAction } from "@/server/actions/auth";
import { idleState } from "@/server/actions/types";

export function ChangePasswordForm() {
  const t = useTranslations();
  const [state, formAction] = useActionState(changePasswordAction, idleState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && !state.fieldErrors && (
        <Alert tone="error">{state.message}</Alert>
      )}

      <div>
        <label className="label" htmlFor="currentPassword">
          {t("password.current")}
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
        <FieldError message={errors.currentPassword} />
      </div>

      <div>
        <label className="label" htmlFor="newPassword">
          {t("password.new")}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={12}
        />
        <FieldError message={errors.newPassword} />
      </div>

      <div>
        <label className="label" htmlFor="confirmPassword">
          {t("password.confirm")}
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={12}
        />
        <FieldError message={errors.confirmPassword} />
      </div>

      <SubmitButton className="btn btn-primary w-full">
        {t("common.save")}
      </SubmitButton>
    </form>
  );
}
