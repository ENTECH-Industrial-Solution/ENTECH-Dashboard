import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/rbac";
import { getTranslations } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings/server";

import { SettingsManager } from "./settings-manager";

export const metadata: Metadata = { title: "ตั้งค่า / Settings" };

/** Admin-only: which parts of the task UI are switched on. */
export default async function AdminSettingsPage() {
  await requireAdmin();
  const [t, settings] = await Promise.all([getTranslations(), getSettings()]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("settings.subtitle")}
        </p>
      </header>

      <SettingsManager settings={settings} />
    </div>
  );
}
