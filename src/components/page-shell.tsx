/**
 * The column every ordinary page is drawn in.
 *
 * This used to be the `<main>` in `(app)/layout.tsx`, and it moved out here for
 * one page: the customer map is full-bleed, and a max-width with padding around
 * it is exactly what a map must not have. Rather than have the map fight its
 * way back out with negative margins and `100vw` — which overshoots by the
 * width of the scrollbar and reintroduces the horizontal scroll the layout
 * spends effort avoiding — the layout now contributes no box at all, and each
 * page says what shape it wants.
 *
 * So: every page renders exactly one of these, or its own `<main>` if it wants
 * the whole viewport. A page that renders neither has no landmark element and
 * no padding, which is a bug rather than a style.
 */
export function PageShell({
  children,
  className = "",
  aside,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * A column for the empty gutter left of the content on a wide screen. The
   * content column keeps exactly the width it has without one — 72rem less
   * padding is 69rem — so nothing in it (the calendar, above all) gets
   * narrower; the shell grows into the space the nav already spans instead.
   * Below that width there is no gutter to use and the aside stacks on top.
   */
  aside?: React.ReactNode;
}) {
  if (!aside) {
    return (
      <main
        className={`mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 ${className}`}
      >
        {children}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 min-[90rem]:grid min-[90rem]:max-w-[89.5rem] min-[90rem]:grid-cols-[16rem_minmax(0,1fr)] min-[90rem]:items-start min-[90rem]:gap-6 min-[90rem]:space-y-0">
      {/* Sticky in the gutter, so the counts stay in view down a long page.
          Capped to the viewport below the nav (top-24 is the offset every
          `scroll-mt-24` anchor already uses) and scrolls inside once an
          opened capsule makes it taller; p-1/-m-1 keeps focus rings unclipped.
          No bar, as in the off-site panel: a tile cut off at the bottom edge
          is the cue that there is more. */}
      <aside className="scroll-bare min-w-0 min-[90rem]:sticky min-[90rem]:top-24 min-[90rem]:-m-1 min-[90rem]:max-h-[calc(100dvh-7rem)] min-[90rem]:overflow-y-auto min-[90rem]:p-1">
        {aside}
      </aside>
      <div className={`min-w-0 ${className}`}>{children}</div>
    </main>
  );
}
