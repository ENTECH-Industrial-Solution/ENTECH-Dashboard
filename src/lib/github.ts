import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { z } from "zod";

/** The organisation whose public repositories the dashboard lists. */
export const GITHUB_ORG = "ENTECH-Industrial-Solution";

/**
 * How long one answer from GitHub is kept, in seconds.
 *
 * Unauthenticated, GitHub allows 60 requests an hour per IP, and Vercel's
 * outbound IPs are shared with everybody else on them. Two requests per hour
 * through the cache below is what keeps this free without a token — and a
 * token is something this app deliberately does not hold, because the repo is
 * public and every signed-in employee would read whatever it could see.
 */
const REVALIDATE_SECONDS = 3600;

// Parsed rather than cast: this is somebody else's JSON, and only these
// fields cross into the page.
const orgSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  blog: z.string().nullable(),
  location: z.string().nullable(),
  html_url: z.string().url(),
  public_repos: z.number(),
});

const repoSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  stargazers_count: z.number(),
  html_url: z.string().url(),
  pushed_at: z.string().nullable(),
  archived: z.boolean(),
  fork: z.boolean(),
});

export type GithubOrg = z.infer<typeof orgSchema>;
export type GithubRepo = z.infer<typeof repoSchema>;

/** Throws on anything but a well-formed answer, so a failure is never cached. */
async function fetchGithub<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub refuses requests without one.
      "User-Agent": "ENTECH-Dashboard",
    },
    // The dashboard renders with this, so a hung GitHub costs at most this
    // long, and only on the request that refills the cache below.
    signal: AbortSignal.timeout(3000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);

  return schema.parse(await res.json());
}

/**
 * Cached with unstable_cache rather than fetch's own `next.revalidate`: a
 * fetch carrying an abort signal is not stored by Next's data cache, which
 * would have sent every page view to GitHub.
 */
const loadOverview = unstable_cache(
  async () => {
    const [org, repos] = await Promise.all([
      fetchGithub(`/orgs/${GITHUB_ORG}`, orgSchema),
      // shortcut: first 100 repos only, add Link-header paging if the org outgrows it.
      fetchGithub(
        `/orgs/${GITHUB_ORG}/repos?type=public&sort=pushed&per_page=100`,
        z.array(repoSchema),
      ),
    ]);
    return { org, repos };
  },
  ["github-overview"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * The organisation's profile and its public repositories, most recently pushed
 * first. Null when GitHub could not be reached or answered with something
 * unexpected — the dashboard says so rather than failing the page.
 */
export const getGithubOverview = cache(async () => {
  try {
    return await loadOverview();
  } catch {
    return null;
  }
});
