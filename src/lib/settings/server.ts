import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { db } from "@/lib/db";

import { DEFAULT_SETTINGS, isSettingKey, type Settings } from "./settings";

/** Invalidated by setSettingAction the moment an admin flips a switch. */
export const SETTINGS_CACHE_TAG = "app-settings";

/**
 * The AppSetting table read, cached across requests.
 *
 * This is a handful of rows that change when an admin deliberately flips a
 * switch — perhaps a few times a year — yet it was being fetched on every
 * single request, in the layout and again inside the query layer. On the
 * production pooler that is ~300ms of a page's budget spent re-reading seven
 * booleans.
 *
 * The 60-second ceiling is deliberate and is not the invalidation mechanism:
 * setSettingAction calls revalidateTag, so a change lands immediately. It is
 * there because `dashboard.sharedHistory` governs what an employee may *read*
 * — if a tag revalidation is ever missed, turning the shared archive off must
 * still take effect on its own, not wait for a deploy.
 */
const loadSettings = unstable_cache(
  async (): Promise<Settings> => {
    const rows = await db.appSetting.findMany();
    const settings: Settings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      if (isSettingKey(row.key)) settings[row.key] = row.enabled;
    }

    return settings;
  },
  ["app-settings"],
  { tags: [SETTINGS_CACHE_TAG], revalidate: 60 },
);

/**
 * Effective settings: the code defaults with any admin overrides applied.
 *
 * Also wrapped in React cache() so a page, its layout, and every query that
 * consults a setting share one call even on a cache miss. Unknown keys left
 * over from a removed toggle are ignored rather than trusted.
 */
export const getSettings = cache(loadSettings);
