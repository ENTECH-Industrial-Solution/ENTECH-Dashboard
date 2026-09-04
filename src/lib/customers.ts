import type { CustomerSource, CustomerStatus } from "@prisma/client";

import type { TranslationKey } from "@/lib/i18n/dictionaries";

/**
 * The five lead statuses, and the one place their colour and their ranking are
 * decided.
 *
 * Imported by both server and client code, so it must stay free of anything
 * server-only — the type import from @prisma/client is erased at compile time
 * and drags no engine into the browser bundle.
 */

export const CUSTOMER_STATUSES = [
  "INTERESTED",
  "CONSIDERING",
  "NOT_INTERESTED",
  "WON",
  "UNREACHABLE",
] as const satisfies readonly CustomerStatus[];

/**
 * Colour and label for one status.
 *
 * `tone` names a CSS custom property from globals.css rather than a literal
 * colour, so light and dark stay a token swap exactly as they are everywhere
 * else — a marker drawn with a hard-coded hex would be the one thing on the
 * page that does not follow the theme.
 */
export const CUSTOMER_STATUS_META: Record<
  CustomerStatus,
  { label: TranslationKey; tone: string; soft: string }
> = {
  INTERESTED: {
    label: "customers.status.interested",
    tone: "var(--brand)",
    soft: "var(--brand-soft)",
  },
  CONSIDERING: {
    label: "customers.status.considering",
    tone: "var(--warning)",
    soft: "var(--warning-soft)",
  },
  NOT_INTERESTED: {
    label: "customers.status.notInterested",
    tone: "var(--danger)",
    soft: "var(--danger-soft)",
  },
  WON: {
    label: "customers.status.won",
    tone: "var(--success)",
    soft: "var(--success-soft)",
  },
  UNREACHABLE: {
    label: "customers.status.unreachable",
    tone: "var(--text-muted)",
    soft: "var(--surface-muted)",
  },
};

/**
 * The seven channels a lead can arrive through, in the order they are offered.
 *
 * FIELD_VISIT leads because it is the default and the commonest, and the
 * inbound ones follow in rough order of how often they happen. Marketing reads
 * counts off this order, so it is a display order rather than a ranking —
 * nothing derives a colour or a precedence from it, unlike CUSTOMER_STATUSES.
 */
export const CUSTOMER_SOURCES = [
  "FIELD_VISIT",
  "ENQUIRY_EMAIL",
  "ENQUIRY_PHONE",
  "ENQUIRY_LINE",
  "ENQUIRY_WEB",
  "EVENT",
  "REFERRAL",
] as const satisfies readonly CustomerSource[];

export const CUSTOMER_SOURCE_META: Record<
  CustomerSource,
  { label: TranslationKey }
> = {
  FIELD_VISIT: { label: "customers.source.fieldVisit" },
  ENQUIRY_EMAIL: { label: "customers.source.enquiryEmail" },
  ENQUIRY_PHONE: { label: "customers.source.enquiryPhone" },
  ENQUIRY_LINE: { label: "customers.source.enquiryLine" },
  ENQUIRY_WEB: { label: "customers.source.enquiryWeb" },
  EVENT: { label: "customers.source.event" },
  REFERRAL: { label: "customers.source.referral" },
};

/**
 * Whether the lead came to us, rather than us going to it.
 *
 * The one place that split is expressed, and it is the question the whole
 * column was added for: "which of these walked in the door". Written as a
 * negation of the single outbound value on purpose — a new channel is almost
 * certainly another way of being contacted, so the default for anything added
 * later is inbound, and forgetting to update a list cannot silently drop it out
 * of the count.
 */
export function isInboundSource(source: CustomerSource): boolean {
  return source !== "FIELD_VISIT";
}

export function isCustomerSource(value: string): value is CustomerSource {
  return (CUSTOMER_SOURCES as readonly string[]).includes(value);
}

/**
 * Which status a pin holding several customers wears.
 *
 * Lower number wins, and the ordering is by *how much the place still wants a
 * visit* rather than by how close it is to a sale. That is why INTERESTED
 * outranks WON: an office block with one signed customer and one asking
 * questions is somewhere to go back to, and colouring it "done" would hide the
 * only reason to drive there. The count badge on the marker and the list in the
 * panel are what say the rest.
 */
const STATUS_RANK: Record<CustomerStatus, number> = {
  INTERESTED: 0,
  CONSIDERING: 1,
  WON: 2,
  NOT_INTERESTED: 3,
  UNREACHABLE: 4,
};

/**
 * The status a stack of customers is drawn as.
 *
 * An empty stack is a real case, not a defensive fallback: a pin can be dropped
 * before anyone knows who is in the building, and deleting the last customer at
 * a pin leaves it standing. Grey is the right answer for both — nothing here
 * has been assessed yet.
 */
export function dominantStatus(
  customers: readonly { status: CustomerStatus }[],
): CustomerStatus {
  let best: CustomerStatus = "UNREACHABLE";
  let bestRank = Number.POSITIVE_INFINITY;

  for (const customer of customers) {
    const rank = STATUS_RANK[customer.status];
    if (rank < bestRank) {
      bestRank = rank;
      best = customer.status;
    }
  }

  return best;
}

/** Sort order inside a pin's panel: the same ranking, so the colour the marker
 *  wears belongs to the customer at the top of the list. */
export function byStatusRank(
  a: { status: CustomerStatus },
  b: { status: CustomerStatus },
): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status];
}

export function isCustomerStatus(value: string): value is CustomerStatus {
  return (CUSTOMER_STATUSES as readonly string[]).includes(value);
}

/**
 * Where the map opens when there is nothing to centre on.
 *
 * Bangkok, at a zoom that shows the metropolitan area. A fresh install has no
 * pins, and a world map at zoom 2 gives someone dropping their first pin
 * nothing to aim at.
 */
export const MAP_DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];
export const MAP_DEFAULT_ZOOM = 11;

/** Thailand and a margin, so panning cannot lose the pins off the edge of the
 *  world. Not a hard business rule — a pin outside it still renders — just the
 *  bounds the initial view is clamped to. */
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-85, 60],
  [85, 150],
];
