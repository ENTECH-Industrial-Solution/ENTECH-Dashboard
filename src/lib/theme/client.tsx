"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_THEME, type Theme } from "@/lib/theme/themes";

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

/** Publishes the server-resolved theme so any switch can render its active state. */
export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
