"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  TILE_URL,
  type MapStyle,
} from "@/lib/basemaps";
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MAX_BOUNDS,
} from "@/lib/customers";

/**
 * The Leaflet map itself, and the only file in the app that touches it.
 *
 * Five things decide how this is written:
 *
 *  - **Leaflet is imported at run time, not at module scope.** Its module body
 *    reads `document` while evaluating, and a `"use client"` component is still
 *    rendered on the server first — a top-level `import L from "leaflet"` throws
 *    during SSR. The CSS import above is safe (Next extracts it) and stays.
 *  - **`ready` is state, not a ref.** The import resolves *after* the first
 *    render, so the effect that draws markers has already run and returned
 *    empty-handed; nothing else would make it run again, because `pins` has not
 *    changed. Without a re-render when the map appears, the markers are never
 *    drawn at all — which is what happened, and it looked like pins were not
 *    being saved rather than not being painted. Every effect below that needs
 *    the map therefore depends on `ready`.
 *  - **Markers are updated in place, never rebuilt.** Rebuilding on every render
 *    would drop a marker mid-drag and lose keyboard focus on every status
 *    change. A `Map<id, Marker>` is diffed against the incoming list instead.
 *  - **Callbacks and props read by listeners live in refs.** The map is created
 *    once; a handler that closed over the first render's props would go stale,
 *    and re-creating the map to refresh it would reset the view on every
 *    keystroke in the search box.
 *  - **Zoom is handed back out** through `onControls` rather than drawn by
 *    Leaflet, so the buttons are the app's `.btn`, in the app's tab order.
 *
 * The tiles are plain images from one host named in `img-src`
 * (next.config.ts). No script, no API key, no connection. `style` changes how
 * they are *drawn*, not where they come from — see src/lib/basemaps.ts.
 */

export type MapPin = {
  id: string;
  latitude: number;
  longitude: number;
  /** A CSS colour — a `var(--…)` token from CUSTOMER_STATUS_META. */
  tone: string;
  /** How many customers stand here; the badge appears from two upwards. */
  count: number;
  /** Read out by a screen reader, and shown as the native tooltip. */
  title: string;
  /** The little always-on window above the pin. Text only — see `labelHtml`. */
  label: MapPinLabel;
};

/**
 * What the permanent label says.
 *
 * Plain strings rather than markup, and assembled into HTML down in
 * `labelHtml` where it is escaped. Customer names are typed by people; building
 * this string anywhere near the data would be one careless interpolation away
 * from script in the map.
 */
export type MapPinLabel = {
  /** The place, when it has a name of its own. */
  place: string | null;
  rows: { name: string; status: string; tone: string }[];
  /** How many customers the label had to leave out. */
  more: number;
};

export type MapControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Frame every pin currently drawn. No-op when there are none. */
  fit: () => void;
  /** Centre on one pin without changing the zoom the person chose. */
  panTo: (latitude: number, longitude: number) => void;
  /** Where the crosshair is pointing — what "ปักตรงนี้" pins. */
  centre: () => { latitude: number; longitude: number };
  /**
   * Go to a place the search found. Frames its bounding box where it has one,
   * so a province zooms out and a shophouse zooms in; falls back to a fixed
   * street-level zoom for a point with no extent.
   */
  focus: (place: {
    latitude: number;
    longitude: number;
    bounds: [number, number, number, number] | null;
  }) => void;
};

const FIT_OPTIONS: Leaflet.FitBoundsOptions = { padding: [64, 64], maxZoom: 16 };

/**
 * What the popup needs, in pixels, so the map can make room for it.
 *
 * Duplicated from the CSS rather than measured, because the pan has to happen
 * *before* the popup is drawn — there is nothing to measure yet. Keep the two
 * in step: `--popup-width` in globals.css is the same 22rem.
 */
export const POPUP_HALF_WIDTH = 176;
const POPUP_ROOM_ABOVE = 380;
/** Below this much space above the pin, the popup hangs under it instead. */
export const POPUP_MIN_ROOM_ABOVE = 260;
/** Below this the popup is a bottom sheet, and the pin's position is moot. */
const POPUP_DOCK_WIDTH = 1024;


/**
 * Loaded once per page rather than once per mount, so a remount — React Strict
 * Mode's double effect in development, a navigation back to this page — does
 * not re-parse the library.
 */
let leafletPromise: Promise<typeof Leaflet> | null = null;

function loadLeaflet(): Promise<typeof Leaflet> {
  leafletPromise ??= import("leaflet");
  return leafletPromise;
}

/** The pin a click inside an always-on label belongs to, if it was one. */
function pinIdFrom(target: Element): string | null {
  return (
    target.closest("[data-pin]")?.getAttribute("data-pin") ??
    target.closest(".map-label")?.querySelector("[data-pin]")?.getAttribute("data-pin") ??
    null
  );
}

/**
 * Whether a click started on a pin that is already there.
 *
 * Leaflet stops a marker's click before the map sees it, so this should never
 * be true — it is here because the cost of being wrong is dropping a second pin
 * on top of the one somebody was trying to open. `.leaflet-marker-icon` is the
 * class Leaflet puts on every marker's element.
 */
function startedOnMarker(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".leaflet-marker-icon") !== null;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Every value below comes from a person typing into a form. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * The small window that hangs over every pin, always.
 *
 * A Leaflet tooltip rather than React, and that is the point: a permanent
 * tooltip lives in the map's own pane, so it moves and zooms with the map for
 * free. Tracking N of them from React would mean N anchors recomputed on every
 * frame of a pan, to draw something nobody interacts with beyond clicking it.
 *
 * Kept to three customers and a "+n". The label has to stay smaller than the
 * thing it labels — a card taller than the pin stops reading as attached to it,
 * and a map of them stops being a map.
 */
function labelHtml(id: string, label: MapPinLabel): string {
  const place = label.place
    ? `<b class="map-label-place">${escapeHtml(label.place)}</b>`
    : "";

  const rows = label.rows
    .map(
      (row) =>
        `<span class="map-label-row">
           <i style="background:${row.tone}"></i>
           <span class="map-label-name">${escapeHtml(row.name)}</span>
           <span class="map-label-status">${escapeHtml(row.status)}</span>
         </span>`,
    )
    .join("");

  const more =
    label.more > 0 ? `<em class="map-label-more">+${label.more}</em>` : "";

  // The id rides along so a click on the label can be traced back to its pin
  // without Leaflet's event routing — see the map's click handler.
  return `<span class="map-label-body" data-pin="${escapeHtml(id)}">${place}${rows}${more}</span>`;
}

/** The marker's markup. One element, coloured entirely by `--pin`. */
function pinHtml(pin: MapPin): string {
  const badge = pin.count > 1 ? `<b class="map-pin-count">${pin.count}</b>` : "";

  return `<span class="map-pin" style="--pin:${pin.tone}">
    <svg viewBox="0 0 24 32" aria-hidden="true">
      <path d="M12 31s11-11.5 11-19a11 11 0 1 0-22 0c0 7.5 11 19 11 19Z"
            fill="currentColor" stroke="var(--surface)" stroke-width="1.6"
            stroke-linejoin="round" />
      <circle cx="12" cy="12" r="4.2" fill="var(--surface)" />
    </svg>${badge}</span>`;
}

export function MapCanvas({
  pins,
  selectedId,
  placing,
  movingId,
  style,
  anchor,
  onSelect,
  onPlace,
  onDragEnd,
  onControls,
  onAnchorPoint,
}: {
  pins: readonly MapPin[];
  selectedId: string | null;
  /** Aiming mode: the crosshair is on screen, and a plain click also places. */
  placing: boolean;
  /** The one pin that may currently be dragged, if any. */
  movingId: string | null;
  style: MapStyle;
  /** The point the open popup is pointing at, or null when nothing is open. */
  anchor: { latitude: number; longitude: number } | null;
  onSelect: (id: string) => void;
  onPlace: (latitude: number, longitude: number) => void;
  onDragEnd: (id: string, latitude: number, longitude: number) => void;
  /** Called with the controls once the map exists, and with null on teardown. */
  onControls: (controls: MapControls | null) => void;
  /** Where `anchor` currently sits in container pixels — tracked live. */
  onAnchorPoint: (point: { x: number; y: number } | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const [ready, setReady] = useState(false);

  // Split out so the effect below can depend on the numbers rather than on an
  // object identity that changes on every render.
  const anchorLat = anchor?.latitude ?? null;
  const anchorLng = anchor?.longitude ?? null;

  // Everything a once-bound listener needs to read at the time it fires.
  const latest = useRef({
    pins,
    placing,
    onSelect,
    onPlace,
    onDragEnd,
    onControls,
    onAnchorPoint,
  });
  latest.current = {
    pins,
    placing,
    onSelect,
    onPlace,
    onDragEnd,
    onControls,
    onAnchorPoint,
  };

  const fit = useCallback(() => {
    const L = lib.current;
    const instance = map.current;
    const current = latest.current.pins;
    if (!L || !instance || current.length === 0) return;

    instance.fitBounds(
      L.latLngBounds(
        current.map((pin) => [pin.latitude, pin.longitude] as [number, number]),
      ),
      FIT_OPTIONS,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Captured here rather than read in the cleanup: the identity is stable —
    // this ref holds one Map for the component's whole life and is only ever
    // mutated in place.
    const live = markers.current;

    void loadLeaflet().then((L) => {
      if (cancelled || !container.current || map.current) return;

      lib.current = L;
      const instance = L.map(container.current, {
        center: MAP_DEFAULT_CENTER,
        zoom: MAP_DEFAULT_ZOOM,
        maxBounds: MAP_MAX_BOUNDS,
        // Both replaced by buttons in the toolbar — see the header.
        zoomControl: false,
        attributionControl: false,
        // A click already places, so a double click places and then zooms —
        // which is the standard map gesture and harmless here, because the
        // second click lands on the same point as the first.
        doubleClickZoom: true,
      });

      L.tileLayer(TILE_URL, {
        maxZoom: TILE_MAX_ZOOM,
        // The licence asks for credit wherever the tiles are shown. The toolbar
        // prints the same line visibly; this is the copy the map itself carries.
        attribution: TILE_ATTRIBUTION,
      }).addTo(instance);

      /*
       * **One click on the map is a pin.** No mode to enter, no modifier, no
       * gesture to know about — and the same single tap on a phone.
       *
       * This went through two rounds of being too clever. First a mode: press a
       * button, then click the spot, which is two steps for something people do
       * standing in front of the place. Then right-click, double-click and
       * long-press stacked on top of the mode — three gestures nobody would
       * guess at, and a long press on a phone is a *wait*. All of it is gone.
       * A click opens the form for that point, and nothing is written until the
       * form is submitted, so a stray click costs one Escape.
       *
       * The crosshair mode survives for one job: aiming when the exact point
       * matters, by moving the map under a fixed sight rather than hitting a
       * pixel with a thumb.
       *
       * Leaflet does not fire this for a click on a marker, and does not fire
       * it after a drag. `startedOnMarker` is belt and braces on the first.
       */
      instance.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const target = event.originalEvent.target;
        if (startedOnMarker(target)) return;

        // A click on a pin's always-on label opens that pin instead of dropping
        // a new one. Handled here rather than left to Leaflet: marking the
        // tooltip `interactive` gives it pointer events and the right cursor,
        // but its clicks still arrive at the map, so without this the label was
        // a button that placed a pin on top of the pin it described.
        //
        // Two lookups, because the id sits on a span *inside* Leaflet's own
        // tooltip element: `closest` finds it from a click on the text, and the
        // fallback catches a click on the padding around it, where walking up
        // never reaches the id at all.
        const id = target instanceof Element ? pinIdFrom(target) : null;
        if (id) {
          latest.current.onSelect(id);
          return;
        }

        latest.current.onPlace(event.latlng.lat, event.latlng.lng);
      });

      map.current = instance;
      setReady(true);

      // Leaflet measures its container on creation, and the flex parent has
      // often not settled by then — without this the first paint is a quarter
      // of a map with grey where the rest should be. The fit rides along,
      // because the pins are in place by now even though they were not when the
      // import started.
      requestAnimationFrame(() => {
        instance.invalidateSize();
        fit();
      });

      latest.current.onControls({
        zoomIn: () => instance.zoomIn(),
        zoomOut: () => instance.zoomOut(),
        fit,
        panTo: (latitude, longitude) => instance.panTo([latitude, longitude]),
        centre: () => {
          const at = instance.getCenter();
          return { latitude: at.lat, longitude: at.lng };
        },
        focus: (place) => {
          if (place.bounds) {
            const [south, north, west, east] = place.bounds;
            instance.fitBounds(
              L.latLngBounds([south, west], [north, east]),
              { padding: [72, 72], maxZoom: 17 },
            );
            return;
          }

          instance.setView([place.latitude, place.longitude], 16);
        },
      });
    });

    return () => {
      cancelled = true;
      latest.current.onControls(null);
      map.current?.remove();
      map.current = null;
      live.clear();
      setReady(false);
    };
  }, [fit]);

  /*
   * Where the popup has to point, in container pixels, kept true while the map
   * moves under it.
   *
   * Reported rather than rendered here: this file owns Leaflet and nothing
   * else, so it answers "where is that spot on screen" and CustomerMap decides
   * what to draw there. `move` fires continuously through a pan, which is what
   * keeps the popup stuck to its pin instead of sliding off it.
   *
   * The pan is the other half. A popup that opens half off the top of the map
   * is a popup nobody can read, so selecting a pin nudges the view until there
   * is room above it — Leaflet's own popups do the same thing, for the same
   * reason. Only on a wide container: below `lg` the popup is a sheet at the
   * bottom of the screen and has no relationship to where the pin is.
   */
  useEffect(() => {
    const instance = map.current;
    const report = latest.current.onAnchorPoint;

    if (!instance || !ready || anchorLat === null || anchorLng === null) {
      report(null);
      return;
    }

    const at: [number, number] = [anchorLat, anchorLng];

    if (instance.getSize().x >= POPUP_DOCK_WIDTH) {
      instance.panInside(at, {
        paddingTopLeft: [POPUP_HALF_WIDTH, POPUP_ROOM_ABOVE],
        paddingBottomRight: [POPUP_HALF_WIDTH, 48],
      });
    }

    const track = () => {
      const point = instance.latLngToContainerPoint(at);
      report({ x: point.x, y: point.y });
    };

    track();
    instance.on("move zoom zoomanim resize", track);
    return () => {
      instance.off("move zoom zoomanim resize", track);
    };
  }, [ready, anchorLat, anchorLng]);

  /*
   * The look. One attribute, and the CSS does the rest.
   *
   * Nothing here reloads a tile or touches the map's state, so switching style
   * keeps the centre, the zoom and every marker exactly where they were — and
   * light/dark never appears in this file at all, because the filter behind the
   * attribute is a token that swaps with the theme (see globals.css).
   */
  useEffect(() => {
    map.current?.getContainer().setAttribute("data-map-style", style);
  }, [ready, style]);

  // Markers: add what is new, update what moved or changed colour, remove what
  // the filter took away.
  useEffect(() => {
    const L = lib.current;
    const instance = map.current;
    if (!L || !instance) return;

    const live = new Set<string>();

    for (const pin of pins) {
      live.add(pin.id);
      const icon = L.divIcon({
        className: `map-marker${pin.id === selectedId ? " is-selected" : ""}`,
        html: pinHtml(pin),
        iconSize: [30, 40],
        iconAnchor: [15, 40],
        // The label hangs off the *top* of the pin, not off its tip.
        tooltipAnchor: [0, -40],
      });

      const existing = markers.current.get(pin.id);

      if (existing) {
        existing.setIcon(icon);
        existing.setTooltipContent(labelHtml(pin.id, pin.label));
        // The open popup already says all this, directly above the same pin.
        if (pin.id === selectedId) existing.closeTooltip();
        else existing.openTooltip();

        const at = existing.getLatLng();
        // Skipped while this marker is the one being dragged: writing the
        // server's coordinates back mid-gesture would yank it out from under
        // the pointer.
        if (
          pin.id !== movingId &&
          (at.lat !== pin.latitude || at.lng !== pin.longitude)
        ) {
          existing.setLatLng([pin.latitude, pin.longitude]);
        }
        continue;
      }

      const marker = L.marker([pin.latitude, pin.longitude], {
        icon,
        title: pin.title,
        alt: pin.title,
        riseOnHover: true,
      });

      marker.bindTooltip(labelHtml(pin.id, pin.label), {
        permanent: true,
        direction: "top",
        offset: [0, -6],
        opacity: 1,
        className: "map-label",
        // A far bigger tap target than a 30px pin, and it opens the same thing.
        // Interactive also means Leaflet stops the click here, so clicking a
        // label never falls through to the map and drops a new pin.
        interactive: true,
      });

      if (pin.id === selectedId) marker.closeTooltip();

      // The other half of the same fix. Leaflet registers an interactive
      // tooltip as an event target, so in principle its clicks land here and
      // never reach the map; in practice they reach the map, which is what the
      // handler up there is for. Both are kept because they cost two lines and
      // select the same pin — whichever path a Leaflet version takes, the label
      // opens its pin and never places a new one.
      marker.getTooltip()?.on("click", () => latest.current.onSelect(pin.id));

      marker.on("click", () => latest.current.onSelect(pin.id));
      marker.on("keypress", (event: Leaflet.LeafletKeyboardEvent) => {
        if (event.originalEvent.key === "Enter") {
          latest.current.onSelect(pin.id);
        }
      });
      marker.on("dragend", () => {
        const at = marker.getLatLng();
        latest.current.onDragEnd(pin.id, at.lat, at.lng);
      });

      marker.addTo(instance);
      markers.current.set(pin.id, marker);
    }

    for (const [id, marker] of markers.current) {
      if (live.has(id)) continue;
      marker.remove();
      markers.current.delete(id);
    }
  }, [ready, pins, selectedId, movingId]);

  // Exactly one marker is draggable at a time, and only after someone asked for
  // it: on a shared board a stray thumb moving somebody else's pin is worse
  // than a deliberate second step.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      if (id === movingId) marker.dragging?.enable();
      else marker.dragging?.disable();
    }
  }, [ready, movingId, pins]);

  useEffect(() => {
    container.current?.classList.toggle("map-placing", placing);
  }, [placing]);

  return <div ref={container} className="h-full w-full" />;
}
