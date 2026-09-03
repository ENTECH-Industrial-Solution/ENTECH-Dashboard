import type { CustomerStatus } from "@prisma/client";

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
