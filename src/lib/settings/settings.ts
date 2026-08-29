import type { TranslationKey } from "@/lib/i18n/dictionaries";

/**
 * Admin-controlled switches for the task UI.
 *
 * Defaults live here, not in the database: a fresh install behaves exactly like
 * an untouched one, and a row in AppSetting exists only where an admin has
 * deliberately overridden something. Adding a switch is a change to this file
 * plus the place that reads it — never a migration. That invariant is also what
 * "คืนค่าเริ่มต้น" on the settings page means: it deletes the row rather than
 * writing the default into it, so "never touched" and "set back" stay the same
 * state.
 *
 * Three kinds of switch live here, and SETTING_IMPACT below says which is
 * which, because they are not equally serious:
 *
 *   display — draws less. Nothing else changes.
 *   reads   — skips a query as well, so turning it off makes pages cheaper.
 *   access  — decides what someone may *read*, and is enforced in the query
 *             layer rather than by hiding elements.
 *
 * Anything in the last two groups must be enforced on the server. Hiding a
 * component is a layout decision; withholding rows is a security one.
 */
export const SETTING_KEYS = [
  "task.showAssigner",
  "task.showSchedule",
  "task.showDescription",
  "task.showPriority",
  "task.showProof",
  "task.showVideo",
  "dashboard.showSummary",
  "dashboard.showCalendar",
  "dashboard.showPeople",
  "dashboard.sharedHistory",
  "fieldTrip.enabled",
  "fieldTrip.showMap",
  "fieldTrip.showHistory",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Record<SettingKey, boolean>;

/**
 * Every switch ships on. A new one must never change what an existing install
 * shows the morning after a deploy — an admin turns things off deliberately, or
 * not at all.
 */
export const DEFAULT_SETTINGS: Settings = {
  "task.showAssigner": true,
  "task.showSchedule": true,
  "task.showDescription": true,
  "task.showPriority": true,
  "task.showProof": true,
  "task.showVideo": true,
  "dashboard.showSummary": true,
  "dashboard.showCalendar": true,
  "dashboard.showPeople": true,
  "dashboard.sharedHistory": true,
  "fieldTrip.enabled": true,
  "fieldTrip.showMap": true,
  "fieldTrip.showHistory": true,
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
  "task.showPriority": {
    label: "settings.showPriority",
    hint: "settings.showPriorityHint",
  },
  "task.showProof": {
    label: "settings.showProof",
    hint: "settings.showProofHint",
  },
  "task.showVideo": {
    label: "settings.showVideo",
    hint: "settings.showVideoHint",
  },
  "dashboard.showSummary": {
    label: "settings.showSummary",
    hint: "settings.showSummaryHint",
  },
  "dashboard.showCalendar": {
    label: "settings.showCalendar",
    hint: "settings.showCalendarHint",
  },
  "dashboard.showPeople": {
    label: "settings.showPeople",
    hint: "settings.showPeopleHint",
  },
  "dashboard.sharedHistory": {
    label: "settings.sharedHistory",
    hint: "settings.sharedHistoryHint",
  },
  "fieldTrip.enabled": {
    label: "settings.fieldTrip",
    hint: "settings.fieldTripHint",
  },
  "fieldTrip.showMap": {
    label: "settings.showMap",
    hint: "settings.showMapHint",
  },
  "fieldTrip.showHistory": {
    label: "settings.showTripHistory",
    hint: "settings.showTripHistoryHint",
  },
};

/**
 * What flipping a switch actually costs — see the header for the three kinds.
 * Shown on the page as a chip, so an admin can tell "this draws less" from
 * "this changes who can read what" without opening the code.
 */
export type SettingImpact = "display" | "reads" | "access";

export const SETTING_IMPACT: Record<SettingKey, SettingImpact> = {
  "task.showAssigner": "display",
  "task.showSchedule": "display",
  "task.showDescription": "display",
  "task.showPriority": "display",
  "task.showProof": "display",
  "task.showVideo": "display",
  "dashboard.showSummary": "reads",
  "dashboard.showCalendar": "reads",
  "dashboard.showPeople": "reads",
  "dashboard.sharedHistory": "access",
  "fieldTrip.enabled": "reads",
  "fieldTrip.showMap": "display",
  "fieldTrip.showHistory": "reads",
};

/**
 * The page's sections. Thirteen switches in one column is a list nobody reads
 * to the end; three headings turn it into three decisions — what a task card
 * shows, what the dashboard carries, and how much of the off-site feature is
 * switched on at all.
 *
 * Every key must appear in exactly one group; the type below is what makes a
 * forgotten one a compile error rather than a switch that silently vanishes
 * from the page.
 */
export const SETTING_GROUPS: readonly {
  id: string;
  title: TranslationKey;
  hint: TranslationKey;
  keys: readonly SettingKey[];
}[] = [
  {
    id: "task",
    title: "settings.groupTask",
    hint: "settings.groupTaskHint",
    keys: [
      "task.showAssigner",
      "task.showSchedule",
      "task.showDescription",
      "task.showPriority",
      "task.showProof",
      "task.showVideo",
    ],
  },
  {
    id: "dashboard",
    title: "settings.groupDashboard",
    hint: "settings.groupDashboardHint",
    keys: [
      "dashboard.showSummary",
      "dashboard.showCalendar",
      "dashboard.showPeople",
      "dashboard.sharedHistory",
    ],
  },
  {
    id: "fieldTrip",
    title: "settings.groupFieldTrip",
    hint: "settings.groupFieldTripHint",
    keys: ["fieldTrip.enabled", "fieldTrip.showMap", "fieldTrip.showHistory"],
  },
];

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}
