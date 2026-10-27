"use client";

import { animate } from "motion";
import { useEffect, useState } from "react";

import { AnimatePresence, m, useReducedMotion } from "@/components/motion";

/**
 * A number that counts up to its value the first time the app shows it, and
 * pops its changed digits in when the value moves after that.
 *
 * The one client leaf inside `SummaryTiles`, which stays a server component:
 * the tile's markup and its query are server work, and the only thing that
 * needs a browser is the motion. The server renders the final value, so the
 * page is correct before hydration and correct without JavaScript; the count
 * is a flourish laid over a number that was already there.
 *
 * `motion`'s bare `animate()` for the count, because the thing animating is a
 * number in state, not an element's style. It honours the OS reduced-motion
 * setting by not moving at all.
 */
// Set once a count has finished, and module scope on purpose: it survives
// client navigation and resets on a reload. So the numbers count when the app
// is opened and sit still on every return to the dashboard after that — a
// flourish that plays on every visit to a page opened all day stops being one.
// Set on *completion*, so the three tiles that mount together all count.
let hasCounted = false;

export function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const [counted, setCounted] = useState(false);

  // Counts at most once, on mount. A later value — a task closed out, the page
  // revalidated — is drawn by `PopDigits` rather than counted again from 0.
  useEffect(() => {
    if (reduced || hasCounted) {
      setCounted(true);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setShown(Math.round(latest)),
      onComplete: () => {
        hasCounted = true;
        setCounted(true);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the count is a mount flourish only
  }, [reduced]);

  if (reduced) return <>{value}</>;
  return counted ? <PopDigits value={value} /> : <>{shown}</>;
}

/**
 * Each digit is keyed by its place and its value, so only the digits that
 * actually changed remount — and only those rise in, blurred and with a little
 * overshoot. `initial={false}` keeps the hand-over from the count still.
 */
function PopDigits({ value }: { value: number }) {
  const digits = String(value).split("");
  return (
    <span className="inline-flex">
      <AnimatePresence initial={false}>
        {digits.map((digit, i) => (
          <m.span
            key={`${digits.length - i}:${digit}`}
            className="inline-block"
            initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
            transition={{ duration: 0.5, ease: [0.34, 1.45, 0.64, 1], delay: i * 0.07 }}
          >
            {digit}
          </m.span>
        ))}
      </AnimatePresence>
    </span>
  );
}
