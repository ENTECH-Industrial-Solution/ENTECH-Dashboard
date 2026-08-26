"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_SETTINGS, type Settings } from "./settings";

const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);

/**
 * Publishes the server-resolved settings to the task cards, which are client
 * components. Provided once in the app layout rather than drilled through every
 * page that renders a card.
 */
export function SettingsProvider({
  settings,
  children,
}: {
  settings: Settings;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  return useContext(SettingsContext);
}
