"use client";

import { useOptimistic, useTransition } from "react";

import { Segmented } from "@/components/ui";
import { useLocale } from "@/lib/i18n/client";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { setLocaleAction } from "@/server/actions/locale";

const LABEL: Record<Locale, string> = { th: "ไทย", en: "EN" };
const OPTIONS = LOCALES.map((code) => ({ value: code, label: LABEL[code] }));

/**
 * The pill slides on the click, not on the round trip: `useOptimistic` shows
 * the choice at once, and the page re-rendering in the new language follows
 * when the server answers.
 */
export function LocaleSwitch() {
  const saved = useLocale();
  const [locale, showLocale] = useOptimistic(saved);
  const [pending, startTransition] = useTransition();

  return (
    <Segmented
      value={locale}
      options={OPTIONS}
      size="sm"
      label="Language"
      disabled={pending}
      onChange={(code) =>
        startTransition(async () => {
          showLocale(code);
          await setLocaleAction(code);
        })
      }
    />
  );
}
