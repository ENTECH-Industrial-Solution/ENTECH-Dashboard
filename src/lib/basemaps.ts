import type { TranslationKey } from "@/lib/i18n/dictionaries";

/**
 * How the customer map is drawn.
 *
 * Three looks, **one tile source**, and the difference between them is a CSS
 * filter rather than a second provider. That is the whole design, and it came
 * out of trying the obvious thing first:
 *
 * The obvious thing was a second basemap host — CARTO's Positron and Dark
 * Matter, which are the calm grey maps this feature wanted. They are no longer
 * free: every tile came back stamped "API KEY REQUIRED". Every other
 * keyless raster basemap worth having is either licensed for one project's own
 * site (Wikimedia), grey under its terms for a commercial tool (Esri), or an
 * OSM community server running on donated hardware that a business tool has no
 * business hammering. And this app holds no API key for anything, on purpose.
 *
 * So the styles are treatments of the tiles already allowed by `img-src`. That
 * buys three things beyond the licence: no new CSP host, no third-party
 * dependency that can start demanding a key next year, and light/dark stays a
 * **token swap** in globals.css exactly as it is everywhere else in this app —
 * the filters are custom properties, and nothing here has to know which theme
 * is on.
 *
 * A filtered map is not the same as cartography drawn for the purpose, and
 * `clean` is the honest version of that: desaturated rather than fully grey, so
 * water and parks keep enough colour to be read as water and parks while the
 * five status colours stay the only saturated things on the screen.
 */

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = "© OpenStreetMap contributors";
export const TILE_MAX_ZOOM = 19;

export const MAP_STYLES = ["clean", "standard", "contrast"] as const;
export type MapStyle = (typeof MAP_STYLES)[number];

export const MAP_STYLE_META: Record<MapStyle, { label: TranslationKey }> = {
  /** Muted, so the pins are the brightest thing on the map. The default. */
  clean: { label: "customers.style.clean" },
  /** OSM as its cartographers drew it: every colour, every POI. */
  standard: { label: "customers.style.standard" },
  /** Pushed, for a phone held at arm's length in daylight. */
  contrast: { label: "customers.style.contrast" },
};

export const DEFAULT_MAP_STYLE: MapStyle = "clean";

export function isMapStyle(value: string | null): value is MapStyle {
  return !!value && (MAP_STYLES as readonly string[]).includes(value);
}

/**
 * Where the choice is kept.
 *
 * `localStorage`, and deliberately not a cookie like the theme and the locale.
 * Those two are read on the server so the first HTML response is already
 * correct; this one is never read on the server at all — it is one attribute on
 * one element on one page. A cookie would buy nothing and cost a server action.
 */
export const MAP_STYLE_STORAGE_KEY = "entech_map_style";
