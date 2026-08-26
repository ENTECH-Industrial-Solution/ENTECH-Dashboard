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
export function mapEmbedSrc(target: MapTarget, locale: "th" | "en" = "th"): string {
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
