import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import {
  CUSTOMER_SOURCE_META,
  CUSTOMER_SOURCES,
  CUSTOMER_STATUS_META,
  CUSTOMER_STATUSES,
  isCustomerSource,
  isCustomerStatus,
  isInboundSource,
} from "@/lib/customers";
import { formatDate, getLocale, getTranslations } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings/server";
import { getCustomerPins } from "@/server/queries";

export const metadata: Metadata = { title: "รายชื่อลูกค้า / Lead list" };

/**
 * Every lead on the board as a list, newest first — the marketing view of the
 * same data the map draws.
 *
 * It exists because the map cannot answer the question it is being asked: a
 * coloured dot says *where* somebody is, and says nothing about how many came
 * in this month or through which channel. Both views read the same query, so
 * there is no second source of truth to keep in step.
 *
 * The filters are `searchParams` rather than client state, and that is not a
 * shortcut — it makes every count a **link**, which is the interaction this
 * page exists for ("11 came in by email" → click → the eleven). It costs no
 * client bundle and no extra round trip: `getCustomerPins()` already fetches
 * the whole board (see CLAUDE.md, "Round trips are the performance budget"), so
 * the narrowing happens in memory over a list that is already here.
 *
 * `customer.enabled` is classified `reads`, and this page honours it exactly as
 * the map does: the switch is checked before the query runs, and a switched-off
 * feature gets no page rather than a redirect.
 */
export default async function CustomerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; status?: string }>;
}) {
  await requireUser();
  const settings = await getSettings();

  if (!settings["customer.enabled"]) notFound();

  const [t, locale, params, pins] = await Promise.all([
    getTranslations(),
    getLocale(),
    searchParams,
    getCustomerPins(),
  ]);

  // An unrecognised value in the URL means "no filter", not an error page: this
  // is a link somebody may have kept in a chat thread.
  const source =
    params.source && isCustomerSource(params.source) ? params.source : null;
  const status =
    params.status && isCustomerStatus(params.status) ? params.status : null;

  /*
   * The pins flattened into leads, each carrying the place it stands at.
   *
   * Sorted by when the lead *arrived* rather than when the row was written —
   * `firstContactedAt` falling back to `createdAt`, the same fallback the panel
   * and the form describe. An enquiry that came in on Monday and was typed on
   * Thursday belongs under Monday, which is the whole reason that column is
   * nullable rather than backfilled.
   */
  const leads = pins
    .flatMap((pin) =>
      pin.customers.map((customer) => ({
        ...customer,
        arrivedAt: customer.firstContactedAt ?? customer.createdAt,
        /** True when the date above is inferred from the row, not typed in. */
        arrivalAssumed: customer.firstContactedAt === null,
        place: pin.label ?? pin.address ?? null,
        pinId: pin.id,
      })),
    )
    .sort((a, b) => b.arrivedAt.getTime() - a.arrivedAt.getTime());

  // Counted over every lead, not the filtered ones: a count that shrank to
  // match its own filter could never be clicked back out of.
  const bySource = countBy(leads, (lead) => lead.source);
  const byStatus = countBy(leads, (lead) => lead.status);
  const inbound = leads.filter((lead) => isInboundSource(lead.source)).length;

  const visible = leads.filter(
    (lead) =>
      (source === null || lead.source === source) &&
      (status === null || lead.status === status),
  );

  /** The facets as a query string, shared by the links and the download. */
  const queryFor = (next: { source?: string | null; status?: string | null }) => {
    const query = new URLSearchParams();
    const nextSource = next.source === undefined ? source : next.source;
    const nextStatus = next.status === undefined ? status : next.status;
    if (nextSource) query.set("source", nextSource);
    if (nextStatus) query.set("status", nextStatus);
    return query.toString();
  };

  /** The same page with one facet swapped, so a chip both filters and clears. */
  const hrefWith = (next: { source?: string | null; status?: string | null }) => {
    const qs = queryFor(next);
    return qs ? `/customers/leads?${qs}` : "/customers/leads";
  };

  // The download carries whatever is on screen, so what somebody sends to
  // marketing is the list they were looking at rather than the whole board.
  const exportQuery = queryFor({});
  const exportHref = exportQuery
    ? `/customers/leads/export?${exportQuery}`
    : "/customers/leads/export";

  return (
    <PageShell className="space-y-5">
      {/*
        The hint sits under the buttons rather than across the page, because it
        is about the button. A line of small print floating between the header
        and the numbers reads as a warning about the page.
      */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">
            {t("customers.leads")}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("customers.leadsSubtitle")}
          </p>
        </div>

        <div className="flex flex-col gap-1 sm:items-end">
          <div className="flex flex-wrap gap-2">
            {/* A plain anchor, not a Link: this is a file download rather than
                a route, and handing it to the client router would have it try
                to render a CSV as a page. */}
            <a href={exportHref} className="btn btn-primary" download>
              {t("customers.exportCsv")}
            </a>
            <Link href="/customers" className="btn btn-secondary">
              {t("customers.openMap")}
            </Link>
          </div>
          <p
            className="max-w-xs text-xs sm:text-end"
            style={{ color: "var(--text-muted)" }}
          >
            {t("customers.exportHint")}
          </p>
        </div>
      </header>

      {/*
        One card, where there were three tiles and a card.

        The page used to open with four stacked rectangles before a single lead
        appeared. The numbers and the facets are one question asked twice —
        how many, and of what kind — so they are one region now, divided by
        hairlines instead of by gaps.

        `p-4` is not optional: `.card` in globals.css sets a background, a
        border and a radius and *no padding at all*, so a card without a
        padding utility renders its content flush against its own border. Every
        other caller passes one; the two that do not (`card table-scroll`) want
        a table bled to the edge on purpose.
      */}
      <section className="card space-y-4 p-4">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Stat label={t("customers.totalLeads")} value={leads.length} />
          <Stat
            label={t("customers.inboundLeads")}
            value={inbound}
            tone="var(--brand)"
            divided
          />
          <Stat
            label={t("customers.outboundLeads")}
            value={leads.length - inbound}
            divided
          />
        </div>

        {/*
          The proportion those three numbers imply and none of them shows: the
          inbound share of the whole, which is the answer the channel column was
          added to give. Hidden from screen readers, since the numbers above
          have already said it.
        */}
        {leads.length > 0 && (
          <div
            aria-hidden
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-muted)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round((inbound / leads.length) * 100)}%`,
                background: "var(--brand)",
              }}
            />
          </div>
        )}

        {/* --- the counts, which are also the filters --------------------- */}
        <div className="space-y-2 border-t pt-4">
          <FacetRow label={t("customers.byChannel")}>
            <FacetLink href={hrefWith({ source: null })} on={source === null}>
              {t("customers.allSources")} ({leads.length})
            </FacetLink>
            {CUSTOMER_SOURCES.map((option) => (
              <Facet
                key={option}
                count={bySource[option] ?? 0}
                href={hrefWith({ source: source === option ? null : option })}
                on={source === option}
              >
                {t(CUSTOMER_SOURCE_META[option].label)}
              </Facet>
            ))}
          </FacetRow>

          <FacetRow label={t("customers.byStatus")}>
            <FacetLink href={hrefWith({ status: null })} on={status === null}>
              {t("customers.showAll")} ({leads.length})
            </FacetLink>
            {CUSTOMER_STATUSES.map((option) => {
              const meta = CUSTOMER_STATUS_META[option];
              return (
                <Facet
                  key={option}
                  count={byStatus[option] ?? 0}
                  href={hrefWith({ status: status === option ? null : option })}
                  on={status === option}
                  tone={meta.tone}
                >
                  {t(meta.label)}
                </Facet>
              );
            })}
          </FacetRow>
        </div>
      </section>

      {/* --- the leads ------------------------------------------------------ */}
      {visible.length === 0 ? (
        <EmptyState label={t("customers.noMatches")} />
      ) : (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("customers.firstContactedAt")}</th>
                <th>{t("customers.customerName")}</th>
                <th>{t("customers.source")}</th>
                <th>{t("tasks.status")}</th>
                <th>{t("customers.place")}</th>
                <th>{t("customers.contactName")}</th>
                <th>{t("customers.owner")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => {
                const meta = CUSTOMER_STATUS_META[lead.status];
                return (
                  <tr key={lead.id}>
                    <td
                      className="whitespace-nowrap text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatDate(lead.arrivedAt, locale)}
                      {/* Marked rather than hidden: a date nobody typed is a
                          weaker fact than one somebody did, and a count built
                          on the two should say which it is looking at. */}
                      {lead.arrivalAssumed && (
                        <span className="ms-1">({t("customers.recordedOn")})</span>
                      )}
                    </td>
                    <td className="text-sm font-medium">{lead.name}</td>
                    <td className="text-xs">
                      {t(CUSTOMER_SOURCE_META[lead.source].label)}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: meta.soft, color: meta.tone }}
                      >
                        {t(meta.label)}
                      </span>
                    </td>
                    <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {/* A link into the map rather than a copy of the address:
                          where a place is is a question the map answers, and
                          `?pin=` makes it answer about *this* place rather than
                          opening the whole board. */}
                      <Link
                        className="underline"
                        style={{ color: "var(--brand)" }}
                        href={`/customers?pin=${lead.pinId}`}
                      >
                        {lead.place ?? t("customers.noPlaceName")}
                      </Link>
                    </td>
                    <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {[lead.contactName, lead.phone, lead.email]
                        .filter(Boolean)
                        .join(" · ") || t("common.none")}
                    </td>
                    <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {lead.owner
                        ? `${lead.owner.employeeCode} — ${lead.owner.fullName}`
                        : t("customers.unassigned")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

function countBy<T, K extends string>(
  items: readonly T[],
  key: (item: T) => K,
): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/**
 * One of the three numbers.
 *
 * Three across at every width, including a phone: the labels are short enough
 * to fit at a third of 375px, and stacking them cost a third of the screen
 * before a single lead appeared. `divided` draws the hairline before it.
 */
function Stat({
  label,
  value,
  tone = "var(--text)",
  divided = false,
}: {
  label: string;
  value: number;
  tone?: string;
  divided?: boolean;
}) {
  return (
    <div className={divided ? "border-s ps-3 sm:ps-4" : ""}>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="text-2xl font-semibold leading-tight tabular-nums"
        style={{ color: tone }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * A label and its chips on one line.
 *
 * The label was a heading on its own row, which cost two lines per facet group
 * for two words. Inline and baseline-aligned, it reads as what it is: the
 * question the chips beside it answer.
 */
function FacetRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        className="text-xs font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * A count that filters — unless there is nothing to filter to.
 *
 * A zero chip stays visible, because "nobody has ever come in through LINE" is
 * a fact marketing wants, but it stops being a link: clicking it could only
 * ever produce an empty table. Rendered dimmer for the same reason, so the eye
 * lands on the channels that actually happened.
 */
function Facet({
  count,
  href,
  on,
  tone,
  children,
}: {
  count: number;
  href: string;
  on: boolean;
  tone?: string;
  children: React.ReactNode;
}) {
  if (count === 0) {
    return (
      <span
        className="rounded-full px-2.5 py-1 text-[11px] leading-none opacity-55"
        style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
      >
        {children} (0)
      </span>
    );
  }

  return (
    <FacetLink href={href} on={on} tone={tone}>
      {children} ({count})
    </FacetLink>
  );
}

/**
 * A count that is also a filter.
 *
 * A link rather than a button, so it survives a reload, can be pasted into a
 * chat, and needs no client component to work — the page stays a server render.
 */
function FacetLink({
  href,
  on,
  tone = "var(--brand)",
  children,
}: {
  href: string;
  on: boolean;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className="rounded-full px-2.5 py-1 text-[11px] leading-none"
      style={
        on
          ? { background: tone, color: "var(--brand-contrast)" }
          : { background: "var(--surface-muted)", color: "var(--text-muted)" }
      }
    >
      {children}
    </Link>
  );
}
