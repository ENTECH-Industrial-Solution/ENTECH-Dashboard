"use client";

import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
  useReducedMotion,
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
 * The entrance everything that appears uses: a fade and a short rise. The
 * exit is quicker and shorter — leaving should never feel like the page is
 * waiting for something to finish.
 */
export const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast } },
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
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

export { AnimatePresence, m, useReducedMotion };
