"use client";

import { animate } from "motion";
import { useEffect, useState } from "react";

import { useReducedMotion } from "@/components/motion";

/**
 * A number that counts up to its value when it first appears.
 *
 * The one client leaf inside `SummaryTiles`, which stays a server component:
 * the tile's markup and its query are server work, and the only thing that
 * needs a browser is the ticking. The server renders the final value, so the
 * page is correct before hydration and correct without JavaScript; the count
 * is a flourish laid over a number that was already there.
 *
 * `motion`'s bare `animate()` rather than a component, because the thing
 * animating is a number in state, not an element's style. It honours the OS
 * reduced-motion setting by not counting at all.
 */
export function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value, reduced]);

  return <>{shown}</>;
}
