"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useSyncExternalStore } from "react";

/**
 * The header's loading bar, and the links that drive it.
 *
 * `useLinkStatus` only answers inside the `<Link>` it describes, but the bar
 * belongs in one place — the header's bottom edge — whichever link was
 * pressed: a card's own span would draw against the card. So each link carries
 * a `LinkPending` that reports into this module, and `NavProgressBar`, drawn
 * once by `AppNav`, reads the total. A round trip through the pooler is one to
 * three seconds, and a page that does nothing for that long reads as a click
 * that missed.
 *
 * A count rather than a flag because a second click starts a new navigation
 * before the first link's pending has cleared; each reporter takes back
 * exactly what it added, in its effect cleanup, so an unmounting link can
 * never strand the bar on.
 */
let pending = 0;
const listeners = new Set<() => void>();

function report(delta: number) {
  pending += delta;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Put inside any `<Link>` whose page takes a round trip to arrive. */
export function LinkPending() {
  const { pending: linkPending } = useLinkStatus();

  useEffect(() => {
    if (!linkPending) return;
    report(1);
    return () => report(-1);
  }, [linkPending]);

  return null;
}

/** The bar itself; the look and the 120ms grace live in `.nav-progress`. */
export function NavProgressBar() {
  const active = useSyncExternalStore(
    subscribe,
    () => pending > 0,
    () => false,
  );
  return <span aria-hidden className="nav-progress" data-pending={active} />;
}
