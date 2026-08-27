"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTranslations } from "@/lib/i18n/client";

/**
 * The map for a field trip: a live thumbnail beside the location, and the same
 * map full size once it is clicked.
 *
 * Three things this has to get right:
 *
 *  - The frame is created only once the thumbnail is near the viewport. A
 *    schedule page can carry a dozen trips, and a dozen eagerly loaded Google
 *    frames cost far more than the page itself — below the fold they cost
 *    nothing at all. A map that is visible by default is the one concession:
 *    whatever is on screen does load, which is the price of not making people
 *    click to find out where a place is.
 *  - The thumbnail is a button, not a map. `pointer-events: none` on the frame
 *    hands every click and every scroll to the button, so a 112px square can
 *    never swallow a page scroll or strand someone panning inside it. It is a
 *    picture of the place that opens the real thing.
 *  - The `src` is always built on the server by src/lib/maps.ts from
 *    coordinates or a place name. The CSP permits frames from www.google.com,
 *    so nothing else can be framed here — and a pasted link is opened in a new
 *    tab, where the user can see where it goes, rather than loaded silently.
 */
export function MiniMap({
  src,
  href,
  title,
  subtitle,
  className = "",
}: {
  src: string;
  href: string;
  title: string;
  subtitle?: string | null;
  className?: string;
}) {
  const t = useTranslations();
  const button = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const el = button.current;
    if (!el || near) return;

    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      // Start a little before it scrolls in, so it is rarely seen empty.
      { rootMargin: "300px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("trips.expandMap")} — ${title}`}
        className={`group relative block shrink-0 cursor-pointer overflow-hidden rounded-lg ${className}`}
        style={{ border: "1px solid var(--border)", background: "var(--surface-muted)" }}
      >
        {near ? (
          <iframe
            src={src}
            title={title}
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            referrerPolicy="no-referrer-when-downgrade"
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ border: 0 }}
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            <PinGlyph />
          </span>
        )}

        {/* A faint corner cue at rest — hover does not exist on a touch screen. */}
        <span
          aria-hidden
          className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-md opacity-85 transition-opacity group-hover:opacity-0"
          style={{ background: "var(--surface)", color: "var(--text-muted)" }}
        >
          <ExpandIcon />
        </span>

        {/*
          …and the whole invitation once the pointer is on it. A scrim over the
          entire tile rather than a gradient at the foot: Google prints its own
          attribution strip along the bottom, and a label sitting on top of that
          is unreadable at 112px.
        */}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ background: "color-mix(in oklab, black 38%, transparent)" }}
        >
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium leading-none text-white"
            style={{ background: "color-mix(in oklab, black 72%, transparent)" }}
          >
            <ExpandIcon />
            {t("trips.expandMap")}
          </span>
        </span>
      </button>

      {open && (
        <MapDialog
          src={src}
          href={href}
          title={title}
          subtitle={subtitle}
          onClose={close}
        />
      )}
    </>
  );
}

/**
 * The same map, full size, over the page.
 *
 * Rendered into <body> rather than in place: the thumbnail sits inside a card
 * inside a panel, and any one of those clipping or stacking contexts would trap
 * a fixed overlay. Escape closes it, so does the backdrop, and focus moves to
 * the close button and back to the thumbnail afterwards.
 */
function MapDialog({
  src,
  href,
  title,
  subtitle,
  onClose,
}: {
  src: string;
  href: string;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = bodyOverflow;
      if (returnFocusTo instanceof HTMLElement) returnFocusTo.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "color-mix(in oklab, black 62%, transparent)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="card flex w-full max-w-4xl flex-col overflow-hidden"
        style={{ boxShadow: "0 24px 60px oklch(0 0 0 / 0.35)" }}
      >
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {subtitle && (
              <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>

          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary shrink-0"
          >
            {t("trips.openMap")}
          </a>
          <button
            ref={closeButton}
            type="button"
            className="btn btn-ghost shrink-0"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <iframe
          src={src}
          title={title}
          referrerPolicy="no-referrer-when-downgrade"
          className="w-full"
          style={{ height: "min(70vh, 40rem)", border: 0 }}
        />
      </div>
    </div>,
    document.body,
  );
}

function ExpandIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Stands in for the map until the frame is worth loading. */
function PinGlyph() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
