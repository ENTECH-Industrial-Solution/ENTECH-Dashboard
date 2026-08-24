"use client";

import { useTransition } from "react";

import { useLocale } from "@/lib/i18n/client";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { setLocaleAction } from "@/server/actions/locale";

const LABEL: Record<Locale, string> = { th: "ไทย", en: "EN" };

export function LocaleSwitch() {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="inline-flex rounded-lg border p-0.5"
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            disabled={pending || active}
            onClick={() => startTransition(() => setLocaleAction(code))}
            className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
            style={
              active
                ? { background: "var(--brand)", color: "var(--brand-contrast)" }
                : { color: "var(--text-muted)" }
            }
            aria-pressed={active}
          >
            {LABEL[code]}
          </button>
        );
      })}
    </div>
  );
}
