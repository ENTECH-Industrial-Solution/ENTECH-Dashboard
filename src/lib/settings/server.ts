import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { db } from "@/lib/db";

import {
  DEFAULT_SETTINGS,
  GITHUB_REPO_KEY_PREFIX,
  isSettingKey,
  type Settings,
} from "./settings";

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
const loadAppSettings = unstable_cache(
  async (): Promise<{ settings: Settings; hiddenRepos: string[] }> => {
    const rows = await db.appSetting.findMany();
    const settings: Settings = { ...DEFAULT_SETTINGS };
    const hiddenRepos: string[] = [];

    for (const row of rows) {
      if (isSettingKey(row.key)) settings[row.key] = row.enabled;
      else if (row.key.startsWith(GITHUB_REPO_KEY_PREFIX) && !row.enabled) {
        hiddenRepos.push(row.key.slice(GITHUB_REPO_KEY_PREFIX.length));
      }
    }

    return { settings, hiddenRepos };
  },
  ["app-settings"],
  { tags: [SETTINGS_CACHE_TAG], revalidate: 60 },
);

/** One read per request, shared by both accessors below. */
const readAppSettings = cache(loadAppSettings);

/**
 * Effective settings: the code defaults with any admin overrides applied.
 *
 * Also wrapped in React cache() so a page, its layout, and every query that
 * consults a setting share one call even on a cache miss. Unknown keys left
 * over from a removed toggle are ignored rather than trusted.
 */
export const getSettings = cache(async () => (await readAppSettings()).settings);

/**
 * Repositories an admin has hidden from the dashboard's GitHub section.
 *
 * They ride in the same AppSetting rows, under `github.repo.<name>`, because
 * they are the same kind of thing — an override of a default (shown) that
 * exists only where somebody changed it — and reading them costs nothing: the
 * read above already fetches every row.
 */
export const getHiddenRepos = cache(
  async () => new Set((await readAppSettings()).hiddenRepos),
);
