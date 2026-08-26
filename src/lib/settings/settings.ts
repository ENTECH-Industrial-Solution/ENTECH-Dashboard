import type { TranslationKey } from "@/lib/i18n/dictionaries";

/**
 * Admin-controlled switches for the task UI.
 *
 * Defaults live here, not in the database: a fresh install behaves exactly like
 * an untouched one, and a row in AppSetting exists only where an admin has
 * deliberately overridden something. Adding a switch is a change to this file
 * plus the place that reads it — never a migration.
 *
 * Two of these are more than cosmetic and are enforced on the server as well as
 * hidden in the UI:
 *   dashboard.sharedHistory — narrows the completed archive in the query layer.
 *   dashboard.showCalendar  — skips the month query entirely when off.
 */
export const SETTING_KEYS = [
  "task.showAssigner",
  "task.showSchedule",
  "task.showDescription",
  "task.showProof",
  "dashboard.showCalendar",
  "dashboard.sharedHistory",
  "fieldTrip.enabled",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Record<SettingKey, boolean>;

export const DEFAULT_SETTINGS: Settings = {
  "task.showAssigner": true,
  "task.showSchedule": true,
  "task.showDescription": true,
  "task.showProof": true,
  "dashboard.showCalendar": true,
  "dashboard.sharedHistory": true,
  "fieldTrip.enabled": true,
};

/** Label and explanation shown on the settings page, in both languages. */
export const SETTING_LABELS: Record<
  SettingKey,
  { label: TranslationKey; hint: TranslationKey }
> = {
  "task.showAssigner": {
    label: "settings.showAssigner",
    hint: "settings.showAssignerHint",
  },
  "task.showSchedule": {
    label: "settings.showSchedule",
    hint: "settings.showScheduleHint",
  },
  "task.showDescription": {
    label: "settings.showDescription",
    hint: "settings.showDescriptionHint",
  },
  "task.showProof": {
    label: "settings.showProof",
    hint: "settings.showProofHint",
  },
  "dashboard.showCalendar": {
    label: "settings.showCalendar",
    hint: "settings.showCalendarHint",
  },
  "dashboard.sharedHistory": {
    label: "settings.sharedHistory",
    hint: "settings.sharedHistoryHint",
  },
  "fieldTrip.enabled": {
    label: "settings.fieldTrip",
    hint: "settings.fieldTripHint",
  },
};

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}
