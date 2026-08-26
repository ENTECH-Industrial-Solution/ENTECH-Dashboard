"use client";

import { useTransition } from "react";

import { useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { useTheme } from "@/lib/theme/client";
import { THEMES, type Theme } from "@/lib/theme/themes";
import { setThemeAction } from "@/server/actions/theme";

/**
 * Light / dark / follow-the-device, in the same segmented shape as LocaleSwitch.
 *
 * The choice is a cookie set by a server action rather than localStorage, so
 * the server already knows the theme when it renders the first byte of HTML —
 * no flash of the wrong palette, and no inline script in the document head.
 */
export function ThemeSwitch() {
  const t = useTranslations();
  const theme = useTheme();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="inline-flex rounded-lg border p-0.5"
      role="group"
      aria-label={t("theme.label")}
    >
      {THEMES.map((option) => {
        const active = option === theme;
        return (
          <button
            key={option}
            type="button"
            disabled={pending || active}
            onClick={() => startTransition(() => setThemeAction(option))}
            className="rounded-md p-1.5 transition-colors"
            style={
              active
                ? { background: "var(--brand)", color: "var(--brand-contrast)" }
                : { color: "var(--text-muted)" }
            }
            aria-pressed={active}
            title={t(`theme.${option}` as TranslationKey)}
          >
            <ThemeIcon theme={option} />
            <span className="sr-only">{t(`theme.${option}` as TranslationKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 16px line icons, inherited colour, no icon dependency. */
function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (theme === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }

  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
