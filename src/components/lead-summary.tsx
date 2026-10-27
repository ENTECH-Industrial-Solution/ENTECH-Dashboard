import type { CustomerStatus } from "@prisma/client";
import Link from "next/link";

import { CUSTOMER_STATUSES, CUSTOMER_STATUS_META } from "@/lib/customers";
import { getTranslations } from "@/lib/i18n/server";
import { LinkPending } from "@/components/nav-progress";

/**
 * The customer board in five numbers, one per lead status. Each is a link to
 * the lead list already filtered to it — the list owns the detail, this only
 * says where the board stands.
 *
 * Drawn the way the summary tiles are: the total, one bar split by status, and
 * the statuses as small boxes two to a row. A status nobody is in stays listed
 * — "nobody has signed yet" is an answer — but fades, so the eye lands on the
 * ones that have leads.
 */
export async function LeadSummary({ counts }: { counts: Record<CustomerStatus, number> }) {
  const t = await getTranslations();
  const total = CUSTOMER_STATUSES.reduce((sum, status) => sum + counts[status], 0);

  return (
    <section className="panel space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("dashboard.leads")}</h2>
        <Link
          href="/customers/leads"
          className="shrink-0 text-sm underline"
          style={{ color: "var(--text-muted)" }}
        >
          {t("dashboard.leadsAll")}
          <LinkPending />
        </Link>
      </header>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{total}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("dashboard.leadsTotal")}
        </span>
      </div>

      {/* The boxes below say it in words, so the bar is decoration to a
          screen reader. An empty board draws no bar rather than an empty one. */}
      {total > 0 && (
        <div className="share-bar" aria-hidden>
          {CUSTOMER_STATUSES.filter((status) => counts[status] > 0).map((status) => (
            <span
              key={status}
              style={{
                flexGrow: counts[status],
                background: CUSTOMER_STATUS_META[status].tone,
              }}
            />
          ))}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-1.5">
        {CUSTOMER_STATUSES.map((status) => {
          const meta = CUSTOMER_STATUS_META[status];
          const empty = counts[status] === 0;

          return (
            <li key={status}>
              <Link
                href={`/customers/leads?status=${status}`}
                // The border is a class, not inline, so hover can still move it
                // on a box whose background the inline style already owns.
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2 text-sm transition-colors hover:border-[var(--brand)]"
                style={{
                  background: empty ? undefined : "var(--surface-muted)",
                  color: empty ? "var(--text-muted)" : undefined,
                }}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: meta.tone, opacity: empty ? 0.45 : 1 }}
                />
                <span className="min-w-0 flex-1 truncate">{t(meta.label)}</span>
                <span className="font-semibold tabular-nums">{counts[status]}</span>
                <LinkPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
