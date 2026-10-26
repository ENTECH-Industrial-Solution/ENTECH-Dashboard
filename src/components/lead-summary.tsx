import type { CustomerStatus } from "@prisma/client";
import Link from "next/link";

import { CUSTOMER_STATUSES, CUSTOMER_STATUS_META } from "@/lib/customers";
import { getTranslations } from "@/lib/i18n/server";

/**
 * The customer board in five numbers, one per lead status. Each is a link to
 * the lead list already filtered to it — the list owns the detail, this only
 * says where the board stands.
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
          {t("dashboard.leadsAll")} {total}
        </Link>
      </header>

      <ul className="grid grid-cols-1 gap-1">
        {CUSTOMER_STATUSES.map((status) => {
          const meta = CUSTOMER_STATUS_META[status];

          return (
            <li key={status}>
              <Link
                href={`/customers/leads?status=${status}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: meta.tone }}
                />
                <span className="min-w-0 flex-1 truncate">{t(meta.label)}</span>
                <span className="font-semibold tabular-nums">{counts[status]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
