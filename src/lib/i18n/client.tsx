"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  dictionary,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n/dictionaries";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The whole dictionary is small enough (a few KB) to ship to the client, which
 * lets language switching happen without a round trip. If it ever grows past
 * ~50KB, split it per-route and pass only the needed slice.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useTranslations(): (key: TranslationKey) => string {
  const locale = useLocale();
  return useCallback((key: TranslationKey) => dictionary[key][locale], [locale]);
}
