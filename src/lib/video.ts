/**
 * Turning a pasted evidence link into a player, when it is one.
 *
 * The counterpart to src/lib/maps.ts, and it follows the same rule that file
 * sets out and the CSP depends on: **an iframe src is always composed here from
 * an id this code extracted, never the URL somebody pasted.** A frame loads
 * silently, so its source has to be one we built; a link opens in a tab where
 * the person can see where it goes. That is why this returns null for anything
 * it does not recognise — an unrecognised link stays a link.
 *
 * Only two providers, matching the two hosts opened in `frame-src`:
 *
 *   YouTube — framed through youtube-nocookie.com, which serves the same player
 *             without setting tracking cookies until playback starts.
 *   Drive   — framed through its /preview view. Note that Drive enforces its
 *             own sharing rules inside the frame: a viewer without access to
 *             the file sees a request-access box, not the video.
 */

export type VideoProvider = "youtube" | "drive";

export type VideoEmbed = {
  provider: VideoProvider;
  /** Built here. Safe to put in an iframe src; never the pasted string. */
  src: string;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

const DRIVE_HOSTS = new Set(["drive.google.com"]);

/** YouTube ids are exactly 11 characters of the URL-safe alphabet. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** Drive ids vary in length but share the alphabet; 20+ in practice. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

/** The path forms YouTube hands out, each carrying the id in segment two. */
const YOUTUBE_PATH_PREFIXES = new Set(["embed", "shorts", "live", "v"]);

function youtubeId(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);

  // youtu.be/<id>
  if (url.hostname.endsWith("youtu.be")) {
    return segments[0] ?? null;
  }

  // youtube.com/watch?v=<id>
  if (segments[0] === "watch") {
    return url.searchParams.get("v");
  }

  // youtube.com/embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  if (segments[0] && YOUTUBE_PATH_PREFIXES.has(segments[0])) {
    return segments[1] ?? null;
  }

  return null;
}

function driveId(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);

  // drive.google.com/file/d/<id>/view
  if (segments[0] === "file" && segments[1] === "d") {
    return segments[2] ?? null;
  }

  // drive.google.com/open?id=<id>
  if (segments[0] === "open") {
    return url.searchParams.get("id");
  }

  return null;
}

/**
 * `null` for anything this does not positively recognise — a non-https URL, an
 * unknown host, a known host with no id in it, or an id that does not look like
 * one. Every one of those falls back to being rendered as a plain link.
 */
export function videoEmbed(url: string | null | undefined): VideoEmbed | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;

  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    const id = youtubeId(parsed);
    if (!id || !YOUTUBE_ID.test(id)) return null;

    // rel=0 keeps the end screen to this channel rather than the open web,
    // which on an internal tool is the difference between "the clip ended" and
    // "here are twelve unrelated videos".
    return {
      provider: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`,
    };
  }

  if (DRIVE_HOSTS.has(parsed.hostname)) {
    const id = driveId(parsed);
    if (!id || !DRIVE_ID.test(id)) return null;

    return { provider: "drive", src: `https://drive.google.com/file/d/${id}/preview` };
  }

  return null;
}

export const PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: "YouTube",
  drive: "Google Drive",
};
