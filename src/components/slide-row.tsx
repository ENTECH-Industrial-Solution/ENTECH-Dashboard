"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useTranslations } from "@/lib/i18n/client";

/**
 * A row of cards that runs sideways instead of down, and draws no scrollbar.
 *
 * The off-site panel is a third of the dashboard's width and as tall as the
 * calendar beside it. Stacked, three trips filled it and the fourth was a
 * scroll away with nothing to say it existed. Laid out left to right, one
 * trip's box is what the panel is sized for and the rest wait beside it.
 *
 * The row is a grid rather than a flex row so the cards can line up *inside*
 * as well as at their edges — see `rows`. A flex row stretched every card to
 * the tallest, but the parts within drifted: a two-line address put one
 * card's buttons halfway down and the next card's at the bottom, and a row
 * of the same controls at three different heights read as three different
 * cards.
 *
 * With the bar hidden (`scroll-bare`) the row needs its own cues, and it has
 * two. The cards are sized so the next one is *part visible* at the edge — see
 * `.slide-card` in globals.css — which is the cue that costs nothing and works
 * on a phone. And the arrows here, which are what a mouse has: a trackpad can
 * swipe sideways, a wheel cannot, so a desktop with no bar and no arrows would
 * be a row nobody could move. They appear only when there is somewhere to go,
 * and each one greys out at its end of the row.
 *
 * `heading` is rendered by the caller — a server component, in the panel's
 * case — and only the controls are client-side.
 */
export function SlideRow({
  heading,
  label,
  rows,
  autoColumns,
  padding = "p-1 scroll-p-1",
  children,
}: {
  heading: ReactNode;
  /** Names the scrolling region for a screen reader; the heading is visual. */
  label: string;
  /**
   * How many rows a card is made of. The rail is a grid and every card is a
   * subgrid of it, so a card's parts — its header, its text, its buttons —
   * are tracks the whole row shares, and each sits at one height in every
   * card. The rail has to be told how many there are: a subgrid can only
   * span tracks that exist. Each child places itself with `row-start-N`, so a
   * part that renders nothing leaves its track empty rather than shifting
   * the parts below it up.
   */
  rows: number;
  /**
   * The width of one card, as a `grid-auto-columns` value. The default in
   * `.slide-rail` is sized for a trip's box; the calendar's notes are
   * narrower so three fit across the calendar.
   */
  autoColumns?: string;
  /**
   * The rail's padding utilities. The default leaves a pixel for the focus
   * ring; a row of tilted notes needs more, or the overflow clips their
   * corners and their shadows.
   */
  padding?: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const rail = useRef<HTMLDivElement>(null);
  const [reach, setReach] = useState({ back: false, forward: false });
  const motion = useRef({ left: 0, settle: 0 });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;
    const back = el.scrollLeft > 1;
    const forward = el.scrollLeft < max - 1;

    // Same object unless something moved: this runs after every render, and a
    // fresh object every time would re-render forever.
    setReach((prev) =>
      prev.back === back && prev.forward === forward ? prev : { back, forward },
    );
  }, []);

  // After every render, because the cards themselves change under us — a trip
  // completed in place moves to another group, and nothing else would say so.
  useEffect(measure);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;

    el.addEventListener("scroll", measure, { passive: true });

    // The sway. Paper on a pin lags when the board moves, so the rail reports
    // how fast it is scrolling as `--sway`, an angle the cards may lean by,
    // and settles it back to zero once the scrolling stops. What leans is up
    // to the card — the notes do, the trip boxes do not.
    const m = motion.current;
    const sway = () => {
      const dx = el.scrollLeft - m.left;
      m.left = el.scrollLeft;
      const angle = Math.max(-9, Math.min(9, dx * 0.35));
      el.style.setProperty("--sway", `${angle.toFixed(2)}deg`);
      window.clearTimeout(m.settle);
      m.settle = window.setTimeout(() => el.style.setProperty("--sway", "0deg"), 90);
    };
    m.left = el.scrollLeft;
    el.addEventListener("scroll", sway, { passive: true });

    // The panel is a grid column: its width changes without the window's.
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("scroll", sway);
      window.clearTimeout(m.settle);
      observer.disconnect();
    };
  }, [measure]);

  /** One card along, measured from the cards rather than assumed. */
  const slide = (direction: -1 | 1) => {
    const el = rail.current;
    if (!el) return;

    const first = el.children[0];
    const second = el.children[1];
    const step =
      first instanceof HTMLElement && second instanceof HTMLElement
        ? second.offsetLeft - first.offsetLeft
        : el.clientWidth;

    // The page asks for smooth scrolling only where it is welcome; an arrow
    // press is exactly the animation someone who turned motion off meant.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    el.scrollBy({ left: direction * step, behavior: still ? "auto" : "smooth" });
  };

  const scrollable = reach.back || reach.forward;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{heading}</div>

        {scrollable && (
          <div className="flex shrink-0 gap-1">
            <RailButton
              back
              label={t("common.slidePrev")}
              disabled={!reach.back}
              onClick={() => slide(-1)}
            />
            <RailButton
              label={t("common.slideNext")}
              disabled={!reach.forward}
              onClick={() => slide(1)}
            />
          </div>
        )}
      </div>

      {/*
        * `p-1` leaves room for the focus ring and the ring a linked-to card
        * wears — an overflow container clips both axes once one of them
        * scrolls — and `scroll-p-1` puts the snap line back on the card edge.
        * Focusable, since arrow keys are the other way to move a row whose bar
        * is hidden.
        */}
      <div
        ref={rail}
        tabIndex={0}
        role="group"
        aria-label={label}
        className={`scroll-bare slide-rail grid snap-x snap-mandatory gap-x-3 overflow-x-auto ${padding}`}
        style={{ gridTemplateRows: `repeat(${rows}, auto)`, gridAutoColumns: autoColumns }}
      >
        {children}
      </div>
    </div>
  );
}

function RailButton({
  back = false,
  label,
  disabled,
  onClick,
}: {
  back?: boolean;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full border transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--text-muted)",
      }}
    >
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={back ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
