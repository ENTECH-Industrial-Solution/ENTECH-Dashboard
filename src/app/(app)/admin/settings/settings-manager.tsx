"use client";

import { useActionState } from "react";

import { Alert, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import {
  SETTING_KEYS,
  SETTING_LABELS,
  type SettingKey,
  type Settings,
} from "@/lib/settings/settings";
import { setSettingAction } from "@/server/actions/settings";
import { idleState } from "@/server/actions/types";

/** Switches that change what people may read, not just what is drawn. */
const AFFECTS_ACCESS: readonly SettingKey[] = ["dashboard.sharedHistory"];

export function SettingsManager({ settings }: { settings: Settings }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(setSettingAction, idleState);

  return (
    <div className="space-y-4">
      {state.status === "success" && state.message && (
        <Alert tone="success">{state.message}</Alert>
      )}
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <div className="panel space-y-3">
        {SETTING_KEYS.map((key) => {
          const enabled = settings[key];
          const labels = SETTING_LABELS[key];

          return (
            <div
              key={key}
              className="card flex flex-wrap items-start gap-x-4 gap-y-3 p-4"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t(labels.label)}</span>
                  <span
                    className="badge"
                    style={
                      enabled
                        ? { background: "var(--success-soft)", color: "var(--success)" }
                        : { background: "var(--surface-muted)", color: "var(--text-muted)" }
                    }
                  >
                    {enabled ? t("settings.on") : t("settings.off")}
                  </span>
                </div>

                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {t(labels.hint)}
                </p>

                {AFFECTS_ACCESS.includes(key) && (
                  <p className="text-xs" style={{ color: "var(--warning)" }}>
                    {t("settings.affectsAccess")}
                  </p>
                )}
              </div>

              <form action={formAction} className="shrink-0">
                <input type="hidden" name="key" value={key} />
                <input
                  type="hidden"
                  name="enabled"
                  value={enabled ? "false" : "true"}
                />
                <SubmitButton
                  className={enabled ? "btn btn-secondary" : "btn btn-primary"}
                >
                  {enabled ? t("settings.disable") : t("settings.enable")}
                </SubmitButton>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
