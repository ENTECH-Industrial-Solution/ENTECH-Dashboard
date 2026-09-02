import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { requireAdmin } from "@/lib/auth/rbac";
import { getTranslations } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings/server";
import { isSettingKey, type SettingKey } from "@/lib/settings/settings";
import { getSettingProvenance } from "@/server/queries";

import { SettingsManager, type SettingDetail } from "./settings-manager";

export const metadata: Metadata = { title: "ตั้งค่า / Settings" };

/**
 * Admin-only: which parts of the UI are switched on.
 *
 * Two reads rather than one. `getSettings()` is the cached value every page
 * uses; `getSettingProvenance()` is this page's alone — where each value came
 * from, and who put it there. Sent together, so the pair is one round trip.
 */
export default async function AdminSettingsPage() {
  await requireAdmin();

  const [t, settings, provenance] = await Promise.all([
    getTranslations(),
    getSettings(),
    getSettingProvenance(),
  ]);

  // Dates cross into the client component as ISO strings, like everywhere else.
  const detail: Partial<Record<SettingKey, SettingDetail>> = {};

  for (const row of provenance) {
    // A row left over from a switch that no longer exists is ignored rather
    // than trusted, the same way the settings reader ignores it.
    if (!isSettingKey(row.key)) continue;

    detail[row.key] = {
      overridden: row.overridden,
      changedBy: row.changedBy,
      changedAt: row.changedAt?.toISOString() ?? null,
    };
  }

  return (
    <PageShell className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("settings.subtitle")}
        </p>
      </header>

      <SettingsManager settings={settings} detail={detail} />
    </PageShell>
  );
}
