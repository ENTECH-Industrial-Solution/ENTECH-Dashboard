"use client";

import { DURATION, EASE_OUT, m } from "@/components/motion";

/**
 * The page-level entrance.
 *
 * A template, not the layout, because a template is remounted on every
 * navigation while a layout persists — and a remount is what makes `initial`
 * play again, so each page arrives with the same short fade and rise instead
 * of snapping into place under a header that did not move.
 *
 * It is a flex column that takes the rest of the viewport rather than a bare
 * `div`, because the customer map renders `<main className="flex-1">` and
 * expects to be a flex item of the layout's column; a plain wrapper would cut
 * that chain and the map would collapse to nothing.
 *
 * Only the entrance is animated. An exit would hold the old page on screen
 * until it finished, and a navigation that waits for a fade reads as slow.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      className="flex flex-1 flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}
