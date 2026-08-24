import { cookies } from "next/headers";
import { cache } from "react";

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  dictionary,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n/dictionaries";

function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Reads the locale cookie. Cached so nested layouts share one lookup. */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export type Translate = (key: TranslationKey) => string;

/** Server-component translator. */
export async function getTranslations(): Promise<Translate> {
  const locale = await getLocale();
  return (key) => dictionary[key][locale];
}

/**
 * Formats a date in the active locale. Timezone is pinned to Asia/Bangkok so a
 * task completed at 23:00 local time never renders as the next day for a viewer
 * whose serverless region sits in another zone.
 */
export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
