"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

import { useTranslations } from "@/lib/i18n/client";

/**
 * The grid every section of cards is drawn on: two columns from `lg`, one
 * below it, and — this is the point — **one row to begin with**.
 *
 * A section is a pile: the completed archive alone runs to a couple of hundred
 * cards, and a page that opens with all of them makes the reader scroll past
 * work they were not looking for to reach the next heading. The first row is
 * enough to say what a section holds; the button says how much more there is
 * and hands it over on one press.
 *
 * The rest are not merely hidden — they are not rendered at all until the
 * button is pressed. These are client components with their own form state, so
 * a hundred of them cost a hundred hydrations for cards nobody has looked at.
 *
 * Which is exactly why the hash has to be handled here. A card that is not
 * rendered cannot be jumped to, and both the summary strip's capsules and the
 * calendar link at `#task-<id>` / `#trip-<id>`. So a grid that cannot find the
 * anchor opens itself to look for it, and the ones it does not belong to close
 * again — the link keeps working, and the collapse survives everywhere else.
 */
export function CardGrid({
  preview = 2,
  children,
}: {
  /** Cards shown before the button — one row at `lg`. */
  preview?: number;
  children: ReactNode;
}) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);

  const items = Children.toArray(children);
  const rest = items.length - preview;
  const collapsed = !expanded && rest > 0;

  useEffect(() => {
    const reveal = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));

      // Already on the page: either it was never collapsed over, or another
      // grid holds it. Either way this one has nothing to do.
      if (!id || document.getElementById(id)) return;

      pending.current = id;
      setExpanded(true);
    };

    reveal();

    // A capsule in the summary strip changes the hash without a navigation.
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  useEffect(() => {
    const id = pending.current;
    if (!expanded || id === null) return;

    pending.current = null;
    const target = document.getElementById(id);
    if (!target) return;

    if (!grid.current?.contains(target)) {
      setExpanded(false);
      return;
    }

    // The browser did its jump before this grid had the card; this is that
    // jump, repeated now that the card exists. `scroll-mt-24` still applies.
    target.scrollIntoView({ block: "start" });
  }, [expanded]);

  return (
    <div className="space-y-3">
      {/* grid-cols-1 for the reason ScheduleRow states: an implicit track is
          `auto`, and `auto` lets a wide card inflate the whole page. */}
      <div ref={grid} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {collapsed ? items.slice(0, preview) : items}
      </div>

      {rest > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            className="btn btn-secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {collapsed ? `${t("common.showMore")} (+${rest})` : t("common.showLess")}
          </button>
        </div>
      )}
    </div>
  );
}
