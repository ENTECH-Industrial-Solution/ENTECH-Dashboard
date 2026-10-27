"use client";

import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
  useReducedMotion,
  type Variants,
} from "motion/react";
import type { ReactNode } from "react";

/**
 * The one place the app talks to the motion library.
 *
 * `LazyMotion` with `domAnimation` and the `m` component, not `motion.div`
 * directly: the full `motion` export carries every feature (layout, drag,
 * gestures) and ~30kB with it, while `m` renders nothing until the feature
 * bundle arrives and `domAnimation` is the ~15kB that animates and exits.
 * `strict` makes a stray `motion.div` throw in development rather than
 * silently pulling the whole library back in.
 *
 * `reducedMotion="user"` honours the OS setting: every transform animation
 * collapses to an instant, and only opacity still fades. That is why the
 * variants below always carry an opacity — a reduced-motion viewer should
 * still see something *appear* rather than flicker into place.
 *
 * Timings are shared with `globals.css` (`--dur-base`, `--ease-out`), so a
 * CSS hover and a React entrance feel like the same hand drew them.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** The `--ease-out` curve in `globals.css`. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.3,
} as const;

/**
 * The entrance everything that appears uses: a fade, a short rise and a 2px
 * blur that clears as it lands. The exit is quicker and shorter — leaving
 * should never feel like the page is waiting for something to finish.
 *
 * The blur ends on `filter: none`, not `blur(0px)`: any filter value makes the
 * element a containing block for `position: fixed` descendants, and a card
 * left wearing one would trap every overlay drawn inside it.
 */
export const fadeUp = {
  initial: { opacity: 0, y: 6, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } },
  exit: { opacity: 0, y: -4, filter: "blur(2px)", transition: { duration: DURATION.fast } },
} as const;

/**
 * A block that fades and rises into place when it mounts.
 *
 * `delay` is what a list uses to stagger — the caller caps it, because a
 * stagger that keeps growing makes the two-hundredth card wait ten seconds
 * for its turn.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={{ duration: DURATION.base, ease: EASE_OUT, delay }}
    >
      {children}
    </Tag>
  );
}

/**
 * A region that opens and closes in place — the list under a capsule, the
 * menu under the header. Animates `height` between 0 and `auto`, which is the
 * one thing CSS transitions still cannot do, and clips while doing it.
 * Closing runs on the fast clock, about 60% of opening, as every exit here
 * does: something put away should be gone before the hand has moved on.
 *
 * The child is unmounted once closed, exactly as an `open && ...` would, so a
 * closed region costs nothing and carries no hidden form state.
 */
export function Collapse({
  open,
  children,
  className,
  id,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          id={id}
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A value that changes in place — a status badge, a button's label. The old
 * one lifts out and blurs while the new one rises in, both in the same grid
 * cell, so the row does not collapse and jump for the length of the swap.
 *
 * `id` is what decides that something changed; `initial={false}` keeps the
 * first render still, so server-rendered content gets no entrance.
 */
export function Swap({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-grid ${className}`}>
      <AnimatePresence initial={false}>
        <m.span
          key={id}
          className="inline-flex [grid-area:1/1]"
          initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
          exit={{ opacity: 0, y: -4, filter: "blur(2px)", transition: { duration: 0.1, ease: "easeIn" } }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {children}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

const PANEL = {
  enter: (direction: number) => ({ opacity: 0, x: 12 * direction, filter: "blur(2px)" }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transitionEnd: { filter: "none" },
    transition: { duration: DURATION.base, ease: EASE_OUT },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: -12 * direction,
    filter: "blur(2px)",
    transition: { duration: DURATION.fast, ease: EASE_OUT },
  }),
} satisfies Variants;

/**
 * A block that is replaced rather than changed — the task form giving way to
 * the trip form under the switch above it. The new block comes in from the
 * side its option sits on (`direction`: 1 from the right, -1 from the left)
 * and the old one leaves the other way, on the fast clock. Adapted from
 * Transition Panel in motion-primitives by ibelick (MIT).
 *
 * `popLayout` lifts the outgoing block out of flow the moment it starts to
 * leave, so the box takes the new block's height at once rather than
 * stacking both for the length of the exit. Server-rendered content gets no
 * entrance (`initial={false}`).
 */
export function SwapPanel({
  id,
  direction,
  children,
}: {
  id: string;
  direction: 1 | -1;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <m.div
          key={id}
          custom={direction}
          variants={PANEL}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {children}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

export { AnimatePresence, m, useReducedMotion };
