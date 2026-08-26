import { cookies } from "next/headers";
import { cache } from "react";

import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "@/lib/theme/themes";

/** Reads the theme cookie. Cached so nested layouts share one lookup. */
export const getTheme = cache(async (): Promise<Theme> => {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
});
