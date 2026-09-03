"use server";

import { assertUser } from "@/lib/auth/rbac";
import { AuthorizationError } from "@/lib/errors";
import { getLocale } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { placeSearchSchema } from "@/lib/validation";

/**
 * Finding a place on the basemap by name.
 *
 * A read action, in the shape `loadWorkloadTasksAction` set: no FormData, no
 * `runAction`, nothing to revalidate — but it still calls a guard, still parses
 * its argument with Zod, and still never throws across the boundary.
 *
 * **The lookup happens here, on the server, and that is the point.** Nominatim
 * is OpenStreetMap's geocoder; calling it from the browser would mean opening
 * `connect-src` to a third-party host, which this app's CSP does not do for
 * anything. Going through a server action keeps `connect-src 'self'` untouched,
 * and buys three things a browser call could not have:
 *
 *  - a **User-Agent that identifies this app**, which Nominatim's usage policy
 *    requires and a browser will not let JavaScript set;
 *  - a **rate limit** of our own, because that policy also asks for at most one
 *    request a second and a search box will happily send ten;
 *  - a **cache**, so the same query typed twice costs one request.
 *
 * If this ever outgrows Nominatim's fair use — it is a volunteer-run service —
 * the thing to change is the endpoint below, not the shape of this function.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * Identifies the caller, as Nominatim's policy requires. A generic agent string
 * gets requests blocked, and rightly so.
 */
const USER_AGENT =
  "ENTECH-Dashboard/1.2 (internal sales tool; +https://entech-dashboard.vercel.app)";

/**
 * Results are biased towards Thailand rather than restricted to it: `bounded=0`
 * means a place outside the box still comes back, it just ranks lower. Everyone
 * using this is working in Thailand, and "โรงงาน" should not return a factory
 * in Ohio first.
 */
const VIEWBOX = "97.3,5.6,105.7,20.5";

/** Per-person, and deliberately tight — see the header. */
const SEARCHES_PER_MINUTE = 20;

export type PlaceResult = {
  id: string;
  /** The short name, for the first line of the row. */
  name: string;
  /** The rest of the address, for the second. */
  detail: string;
  latitude: number;
  longitude: number;
  /** south, north, west, east — what the map should frame. Null when absent. */
  bounds: [number, number, number, number] | null;
};

export type PlaceSearchResult =
  | { status: "ok"; results: PlaceResult[] }
  | { status: "error"; message: string };

type NominatimRow = {
  place_id?: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
};

/** Nominatim's `display_name` is "the place, then everything around it". */
function splitName(row: NominatimRow): { name: string; detail: string } {
  const full = row.display_name ?? "";
  const parts = full.split(",").map((part) => part.trim());
  const name = row.name?.trim() || parts[0] || full;

  const detail = full.startsWith(name)
    ? full.slice(name.length).replace(/^\s*,\s*/, "")
    : parts.slice(1).join(", ");

  return { name, detail };
}

function toBounds(box: string[] | undefined): PlaceResult["bounds"] {
  if (!box || box.length !== 4) return null;

  const numbers = box.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) return null;

  const [south, north, west, east] = numbers as [number, number, number, number];
  return [south, north, west, east];
}

export async function searchPlacesAction(
  input: unknown,
): Promise<PlaceSearchResult> {
  try {
    const user = await assertUser();
    const parsed = placeSearchSchema.safeParse(input);

    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง / Invalid input",
      };
    }

    // Keyed on the person rather than the IP: everyone here is signed in, and
    // an office behind one address should not share one budget.
    const limit = rateLimit(`places:${user.id}`, SEARCHES_PER_MINUTE, 60_000);
    if (!limit.allowed) {
      return {
        status: "error",
        message: "ค้นหาบ่อยเกินไป กรุณารอสักครู่ / Too many searches, please wait",
      };
    }

    const locale = await getLocale();
    const params = new URLSearchParams({
      q: parsed.data.query,
      format: "jsonv2",
      limit: "6",
      addressdetails: "0",
      viewbox: VIEWBOX,
      bounded: "0",
      "accept-language": locale === "th" ? "th,en" : "en,th",
    });

    const response = await fetch(`${NOMINATIM}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // A day is a long time for a map and no time at all for a place name:
      // "อาคารจามจุรีสแควร์" will not move. This is the other half of being a
      // good citizen of a volunteer-run service.
      next: { revalidate: 86_400 },
    });

    if (!response.ok) {
      console.error("[action] searchPlaces upstream", response.status);
      return {
        status: "error",
        message: "ค้นหาสถานที่ไม่สำเร็จ / Place search failed",
      };
    }

    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return { status: "ok", results: [] };

    const results = rows.flatMap((entry, index): PlaceResult[] => {
      const row = entry as NominatimRow;
      const latitude = Number(row.lat);
      const longitude = Number(row.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

      const { name, detail } = splitName(row);
      return [
        {
          id: String(row.place_id ?? `${latitude},${longitude},${index}`),
          name,
          detail,
          latitude,
          longitude,
          bounds: toBounds(row.boundingbox),
        },
      ];
    });

    return { status: "ok", results };
  } catch (error) {
    // Same split as runAction: an authorization failure is an answer, not a
    // fault, so it reports its own message and does not pollute the log.
    if (error instanceof AuthorizationError) {
      return { status: "error", message: error.message };
    }

    console.error("[action] searchPlaces failed", error);
    return {
      status: "error",
      message: "ค้นหาสถานที่ไม่สำเร็จ / Place search failed",
    };
  }
}
