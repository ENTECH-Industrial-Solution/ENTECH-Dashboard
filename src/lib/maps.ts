/**
 * Google Maps links for a field trip.
 *
 * A link, never an embed: the CSP blocks third-party frames (`default-src
 * 'self'`) and the app holds no Google API key, so an <iframe> map would render
 * as an empty box. The Maps URL API needs neither — it opens the real app with
 * the place already pinned.
 *
 * Three sources, most precise first:
 *   1. a pasted Google Maps place link, when someone found the exact spot,
 *   2. coordinates, which drop a pin at that exact point,
 *   3. the location name, which lands on a search for it.
 */
export type MapTarget = {
  locationName: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapUrl?: string | null;
};

export function mapsHref(target: MapTarget): string {
  if (target.mapUrl) return target.mapUrl;

  const query = hasCoordinates(target)
    ? `${target.latitude},${target.longitude}`
    : [target.locationName, target.address].filter(Boolean).join(" ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * A frameable Google Map centred on the target.
 *
 * `output=embed` needs no API key, which matters because this app holds none.
 * Deliberately built from coordinates or a name and never from `mapUrl`: a
 * pasted link is opened in a new tab where the user can see where they are
 * going, while an <iframe> src is loaded silently — and a shortened place link
 * does not frame correctly anyway.
 */
export function mapEmbedSrc(
  target: MapTarget,
  locale: "th" | "en" = "th",
): string {
  const query = hasCoordinates(target)
    ? `${target.latitude},${target.longitude}`
    : [target.locationName, target.address].filter(Boolean).join(" ");

  const params = new URLSearchParams({
    q: query,
    hl: locale,
    z: hasCoordinates(target) ? "16" : "13",
    output: "embed",
  });

  return `https://www.google.com/maps?${params.toString()}`;
}

function hasCoordinates(target: MapTarget): boolean {
  return (
    target.latitude !== null &&
    target.latitude !== undefined &&
    target.longitude !== null &&
    target.longitude !== undefined
  );
}

/** True when the pin is an exact point rather than a name search. */
export function isPinnedExactly(target: MapTarget): boolean {
  return !!target.mapUrl || hasCoordinates(target);
}

/**
 * The point a pasted Google Maps link is about, when the link says.
 *
 * Most precise first: `!3d…!4d…` is the place's own pin, `@lat,lng` is where
 * the view was centred, and `q=` / `query=` / `ll=` carry a point only when
 * someone searched for coordinates. A short `maps.app.goo.gl` link carries
 * none of these until it is followed, which is the server's job
 * (`resolveMapLinkAction`). Null rather than a guess when nothing matches.
 */
export function coordinatesFromMapUrl(
  link: string,
): { latitude: number; longitude: number } | null {
  let text: string;
  let url: URL;
  try {
    url = new URL(link);
    text = decodeURIComponent(link);
  } catch {
    return null;
  }

  const NUMBER = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const candidates = [
    text.match(new RegExp(String.raw`!3d${NUMBER}!4d${NUMBER}`)),
    text.match(new RegExp(String.raw`@${NUMBER},${NUMBER}`)),
    ...["q", "query", "ll", "center", "destination"].map((key) =>
      (url.searchParams.get(key) ?? "").match(
        new RegExp(String.raw`^\s*${NUMBER},\s*${NUMBER}\s*$`),
      ),
    ),
  ];

  for (const match of candidates) {
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }

  return null;
}

/** A shortened share link, which has to be followed to learn where it goes. */
export function isShortMapUrl(link: string): boolean {
  try {
    const url = new URL(link);
    return (
      url.protocol === "https:" &&
      (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl") &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}
