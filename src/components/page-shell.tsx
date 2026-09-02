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
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 ${className}`}
    >
      {children}
    </main>
  );
}
