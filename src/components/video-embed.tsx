"use client";

import { useState } from "react";

import { useTranslations } from "@/lib/i18n/client";
import { PROVIDER_LABEL, videoEmbed } from "@/lib/video";

/**
 * An evidence link that happens to be a video, played in place.
 *
 * Click-to-load rather than the `IntersectionObserver` the MiniMap uses, and
 * the difference is the weight: a map tile is an image, a YouTube player is an
 * application. The completed archive can hold a hundred cards, and a hundred
 * players initialising as someone scrolls would cost more than every other
 * thing on the page put together. So nothing is fetched until somebody asks to
 * watch — the frame is created by the click, with `autoplay=1` in the src so
 * that one click both loads it and starts it.
 *
 * Renders nothing at all when the link is not a video this can positively
 * recognise; the caller keeps showing it as a link either way. See
 * src/lib/video.ts for why the src is composed rather than passed through.
 */
export function VideoPlayer({ url }: { url: string }) {
  const t = useTranslations();
  const [playing, setPlaying] = useState(false);

  const embed = videoEmbed(url);
  if (!embed) return null;

  const label = PROVIDER_LABEL[embed.provider];

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start transition-colors"
        style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--brand)", color: "var(--brand-contrast)" }}
        >
          <PlayIcon />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium">{t("video.play")}</span>
          <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
            {label}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      className="mt-2 overflow-hidden rounded-lg"
      style={{ border: "1px solid var(--border)", background: "var(--surface-muted)" }}
    >
      <iframe
        src={embed.src}
        title={label}
        // Delegated deliberately and narrowly. The page's own
        // Permissions-Policy header closes camera, microphone and geolocation,
        // so none of those can be handed on here even by mistake.
        // fullscreen is delegated through `allow` rather than the legacy
        // `allowFullScreen` attribute; setting both makes Chrome warn that one
        // takes precedence over the other.
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="no-referrer-when-downgrade"
        className="block w-full"
        style={{ aspectRatio: "16 / 9", border: 0 }}
      />
    </div>
  );
}

function PlayIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.8-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}
