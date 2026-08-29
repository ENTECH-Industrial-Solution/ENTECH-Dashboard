"use client";

import { useActionState } from "react";

import { Alert, SubmitButton } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import {
  DEFAULT_SETTINGS,
  SETTING_GROUPS,
  SETTING_IMPACT,
  SETTING_KEYS,
  SETTING_LABELS,
  type SettingImpact,
  type SettingKey,
  type Settings,
} from "@/lib/settings/settings";
import { resetSettingAction, setSettingAction } from "@/server/actions/settings";
import { idleState } from "@/server/actions/types";

/** Where a switch's current value came from, and who put it there. */
export type SettingDetail = {
  /** A row exists in AppSetting — the value is an admin's, not the default. */
  overridden: boolean;
  changedBy: string | null;
  /** ISO; serialised by the page, formatted here in the viewer's locale. */
  changedAt: string | null;
};

/**
 * How each kind of switch is announced. The chip is the short version; the
 * warning line under an `access` switch is the long one, because that is the
 * only kind where being wrong costs more than a redraw.
 */
const IMPACT_TONE: Record<SettingImpact, { label: TranslationKey; color: string }> = {
  display: { label: "settings.impactDisplay", color: "var(--text-muted)" },
  reads: { label: "settings.impactReads", color: "var(--brand)" },
  access: { label: "settings.impactAccess", color: "var(--warning)" },
};

/**
 * The switchboard, in three sections.
 *
 * Thirteen switches in one flat column is a list an admin scrolls past. Grouped
 * by what they govern — the card, the dashboard, the off-site feature — each
 * section is a single question with its own heading and its own count.
 *
 * Each row carries what the old page left implicit and someone had to read the
 * source to learn: what the default is, whether this value differs from it, who
 * changed it and when, and what flipping it actually costs. That last one is
 * the reason the detail is worth the space — "แค่การแสดงผล" and "มีผลกับสิทธิ์
 * การอ่าน" are not the same decision, and a switch list that draws them the
 * same way invites the second to be flipped like the first.
 */
export function SettingsManager({
  settings,
  detail,
}: {
  settings: Settings;
  detail: Partial<Record<SettingKey, SettingDetail>>;
}) {
  const t = useTranslations();
  const [setState, setAction] = useActionState(setSettingAction, idleState);
  const [resetState, resetAction] = useActionState(resetSettingAction, idleState);

  const enabledCount = SETTING_KEYS.filter((key) => settings[key]).length;
  const changedCount = SETTING_KEYS.filter(
    (key) => settings[key] !== DEFAULT_SETTINGS[key],
  ).length;

  return (
    <div className="space-y-4">
      {setState.status === "success" && setState.message && (
        <Alert tone="success">{setState.message}</Alert>
      )}
      {setState.status === "error" && <Alert tone="error">{setState.message}</Alert>}
      {resetState.status === "success" && resetState.message && (
        <Alert tone="success">{resetState.message}</Alert>
      )}
      {resetState.status === "error" && (
        <Alert tone="error">{resetState.message}</Alert>
      )}

      <div className="panel space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="badge" style={{ background: "var(--surface-muted)" }}>
            {t("settings.enabledCount")}: {enabledCount}/{SETTING_KEYS.length}
          </span>
          <span
            className="badge"
            style={
              changedCount > 0
                ? { background: "var(--brand-soft)", color: "var(--brand)" }
                : { background: "var(--surface-muted)", color: "var(--text-muted)" }
            }
          >
            {t("settings.changed")}: {changedCount}
          </span>
        </div>

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("settings.defaultsNote")}
        </p>
      </div>

      {SETTING_GROUPS.map((group) => {
        const on = group.keys.filter((key) => settings[key]).length;

        return (
          <section key={group.id} className="panel space-y-3">
            <header className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold tracking-tight">{t(group.title)}</h2>
                <span
                  className="badge"
                  style={{
                    background: "var(--surface-muted)",
                    color: "var(--text-muted)",
                  }}
                >
                  {on}/{group.keys.length}
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t(group.hint)}
              </p>
            </header>

            {group.keys.map((key) => (
              <SettingRow
                key={key}
                settingKey={key}
                enabled={settings[key]}
                detail={detail[key]}
                setAction={setAction}
                resetAction={resetAction}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function SettingRow({
  settingKey,
  enabled,
  detail,
  setAction,
  resetAction,
}: {
  settingKey: SettingKey;
  enabled: boolean;
  detail: SettingDetail | undefined;
  setAction: (formData: FormData) => void;
  resetAction: (formData: FormData) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const labels = SETTING_LABELS[settingKey];
  const impact = IMPACT_TONE[SETTING_IMPACT[settingKey]];
  const fallback = DEFAULT_SETTINGS[settingKey];
  const differs = enabled !== fallback;

  const changedAt = detail?.changedAt
    ? new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(new Date(detail.changedAt))
    : null;

  return (
    <div className="card flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
      <div className="min-w-0 flex-1 space-y-2">
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

          {differs && (
            <span
              className="badge"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              {t("settings.changed")}
            </span>
          )}
        </div>

        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t(labels.hint)}
        </p>

        {SETTING_IMPACT[settingKey] === "access" && (
          <p className="text-xs" style={{ color: "var(--warning)" }}>
            {t("settings.affectsAccess")}
          </p>
        )}

        {/* The provenance line: what this switch is by default, and the last
            hand that moved it. Both come from records — the default from code,
            the change from the audit log — so neither can drift from the truth
            the way a hand-maintained note would. */}
        <dl
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <div className="flex gap-1">
            <dt>{t("settings.default")}:</dt>
            <dd>{fallback ? t("settings.on") : t("settings.off")}</dd>
          </div>

          <div className="flex gap-1">
            <dt>{t("settings.lastChanged")}:</dt>
            <dd>
              {detail?.changedBy && changedAt
                ? `${detail.changedBy} · ${changedAt}`
                : t("settings.neverChanged")}
            </dd>
          </div>

          <div className="flex gap-1">
            <dt aria-hidden>·</dt>
            <dd style={{ color: impact.color }}>{t(impact.label)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <form action={setAction}>
          <input type="hidden" name="key" value={settingKey} />
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <SubmitButton className={enabled ? "btn btn-secondary" : "btn btn-primary"}>
            {enabled ? t("settings.disable") : t("settings.enable")}
          </SubmitButton>
        </form>

        {/* Offered only where there is a row to delete. A switch nobody has
            touched has nothing to put back. */}
        {detail?.overridden && (
          <form action={resetAction}>
            <input type="hidden" name="key" value={settingKey} />
            <SubmitButton className="btn btn-ghost">{t("settings.reset")}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
