import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import { formatDateTime, getLocale, getTranslations } from "@/lib/i18n/server";
import { getAuditLog } from "@/server/queries";

export const metadata: Metadata = { title: "บันทึกการใช้งาน / Audit log" };

/**
 * Read-only view of the append-only audit trail. There is deliberately no
 * delete or edit affordance anywhere in the UI or the server layer.
 */
export default async function AuditPage() {
  await requireAdmin();
  const t = await getTranslations();
  const locale = await getLocale();
  const entries = await getAuditLog();

  return (
    <PageShell className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">{t("audit.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("audit.subtitle")}
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState label={t("tasks.empty")} />
      ) : (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("audit.time")}</th>
                <th>{t("audit.actor")}</th>
                <th>{t("audit.action")}</th>
                <th>{t("audit.target")}</th>
                <th>{t("audit.ip")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td
                    className="whitespace-nowrap text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatDateTime(entry.createdAt, locale)}
                  </td>
                  <td className="text-xs">{entry.actorLabel}</td>
                  <td>
                    <code
                      className="rounded px-1.5 py-0.5 font-mono text-xs"
                      style={{
                        background: entry.action.startsWith("auth.login.failed")
                          ? "var(--danger-soft)"
                          : "var(--surface-muted)",
                        color: entry.action.startsWith("auth.login.failed")
                          ? "var(--danger)"
                          : "var(--text-muted)",
                      }}
                    >
                      {entry.action}
                    </code>
                  </td>
                  <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {entry.entityType}
                    {entry.metadata != null && (
                      <div className="mt-0.5 font-mono break-all">
                        {JSON.stringify(entry.metadata)}
                      </div>
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap font-mono text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {entry.ipAddress ?? t("common.none")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
