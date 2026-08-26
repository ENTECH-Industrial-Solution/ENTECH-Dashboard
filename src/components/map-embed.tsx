"use client";

import { useState } from "react";

import { useTranslations } from "@/lib/i18n/client";

/**
 * A Google Map, embedded rather than only linked.
 *
 * Two deliberate choices:
 *
 *  - The iframe is created only once someone opens it. A schedule page can
 *    carry a dozen trips, and a dozen eagerly-loaded map frames would cost far
 *    more than the page itself.
 *  - The `src` is always built on the server by src/lib/maps.ts from
 *    coordinates or a place name. The CSP permits frames from www.google.com,
 *    so nothing else can be framed here — and a pasted link is opened in a new
 *    tab, where the user can see where it goes, rather than loaded silently.
 */
export function MapEmbed({
  src,
  title,
  height = 220,
}: {
  src: string;
  title: string;
  height?: number;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? t("trips.hideMap") : t("trips.showMap")}
      </button>

      {open && (
        <iframe
          src={src}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="w-full rounded-lg border"
          style={{ height, border: "1px solid var(--border)" }}
        />
      )}
    </div>
  );
}
