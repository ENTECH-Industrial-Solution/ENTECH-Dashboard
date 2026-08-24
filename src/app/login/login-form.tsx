"use client";

import { useActionState } from "react";

import { Alert, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import { loginAction } from "@/server/actions/auth";
import { idleState } from "@/server/actions/types";

export function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(loginAction, idleState);

  return (
    <form action={formAction} className="space-y-4">
      {passwordChanged && <Alert tone="success">{t("password.changed")}</Alert>}
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <div>
        <label className="label" htmlFor="employeeCode">
          {t("login.employeeCode")}
        </label>
        <input
          id="employeeCode"
          name="employeeCode"
          className="input"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          required
          maxLength={32}
          placeholder="ENT-0001"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          {t("login.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </div>

      <SubmitButton
        className="btn btn-primary w-full"
        pendingLabel={t("login.submitting")}
      >
        {t("login.submit")}
      </SubmitButton>
    </form>
  );
}
