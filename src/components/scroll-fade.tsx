"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Which edges of a scroller cut one of its children in two. Not "is there
 * more beyond": a list at rest with its items whole has more beyond it too,
 * and softening the edge of an item that fits only blurs the item. `SlideRow`
 * asks it of its cards sideways, `ScrollFade` of its groups downwards.
 */
export function edgesCut(el: HTMLElement, axis: "x" | "y") {
  const box = el.getBoundingClientRect();
  const [start, end] = axis === "x" ? [box.left, box.right] : [box.top, box.bottom];
  let back = false;
  let forward = false;
  for (const child of el.children) {
    const r = child.getBoundingClientRect();
    const [from, to] = axis === "x" ? [r.left, r.right] : [r.top, r.bottom];
    if (from < start - 1 && to > start + 1) back = true;
    if (from < end - 1 && to > end + 1) forward = true;
  }
  return { back, forward };
}

/**
 * A scroller, with no bar, whose top and bottom edges fade out where they cut
 * something — the vertical twin of the soft edge on a `SlideRow`. The off-site
 * panel scrolls inside a box the calendar sizes, and without the fade the box
 * below the fold ended on a hard line through the middle of a map.
 */
export function ScrollFade({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState({ back: false, forward: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = edgesCut(el, "y");
    // Same object unless something moved, or running after every render loops.
    setCut((prev) =>
      prev.back === next.back && prev.forward === next.forward ? prev : next,
    );
  }, []);

  // After every render: a trip completed in place moves between the groups.
  useEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    // The box is sized by the calendar beside it, and the groups grow as their
    // maps load, so both the box and what is in it are watched.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  return (
    <div
      ref={ref}
      data-back={cut.back}
      data-forward={cut.forward}
      className={`scroll-bare scroll-fade overflow-y-auto ${className}`}
    >
      {children}
    </div>
  );
}
