/**
 * Theme preference: light, dark, or follow the device.
 *
 * Modelled on the locale: a plain cookie read on the server, so the correct
 * palette is in the very first HTML response and there is no flash of the wrong
 * theme, and no blocking inline script to work around it.
 *
 * "system" is the absence of a choice — it writes no `data-theme` attribute and
 * lets the CSS `prefers-color-scheme` default decide.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "system";
export const THEME_COOKIE = "entech_theme";

export function isTheme(value: string | undefined): value is Theme {
  return !!value && (THEMES as readonly string[]).includes(value);
}
