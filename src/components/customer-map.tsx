"use client";

import type { CustomerSource, CustomerStatus } from "@prisma/client";
import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";

import {
  CustomerFields,
  FormActions,
  PinFields,
  type CustomerPerson,
  type CustomerPinRow,
  type MapTripRow,
} from "@/components/customer-form";
import { CustomerPanel } from "@/components/customer-panel";
import {
  TripStatusBadge,
  TRIP_LABEL,
  TRIP_TONE,
  tripState,
} from "@/components/trip-card";
import {
  MapCanvas,
  POPUP_HALF_WIDTH,
  POPUP_MIN_ROOM_ABOVE,
  type MapControls,
  type MapPin,
} from "@/components/map-canvas";
import { Alert } from "@/components/ui";
import {
  DEFAULT_MAP_STYLE,
  isMapStyle,
  MAP_STYLES,
  MAP_STYLE_META,
  MAP_STYLE_STORAGE_KEY,
  type MapStyle,
} from "@/lib/basemaps";
import {
  byStatusRank,
  CUSTOMER_SOURCE_META,
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_META,
  dominantStatus,
} from "@/lib/customers";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import { createCustomerPinAction } from "@/server/actions/customers";
import { searchPlacesAction, type PlaceResult } from "@/server/actions/places";
import { idleState } from "@/server/actions/types";

/**
 * The customer map: a full-height map, a toolbar over it, and a panel that
 * opens onto whichever pin is selected.
 *
 * All the state lives here, and there is not much of it — which pin is open,
 * whether the next map click is placing a pin, whether the open pin is being
 * dragged, and the two filters. Everything else is derived.
 *
 * The filters run in the browser rather than as a query. The whole board
 * arrives with the page (see getCustomerPins) precisely so that typing in the
 * search box costs nothing: a filter that re-queried would spend ~250ms of
 * pooler overhead per keystroke, and there is no filter here a server needs to
 * enforce — everyone may read every pin.
 */

type Draft = { latitude: number; longitude: number };

/** How far past the map's edge a pin may drift before its popup is hidden. */
const OFFSCREEN_MARGIN = 40;

/** Customers named in a pin's always-on label before it says "+n" instead. */
const LABEL_ROWS = 3;

/**
 * Trip marker ids are prefixed so one id space can carry both kinds.
 *
 * MapCanvas reports a click as a bare id — from the marker and from the
 * always-on label, which finds it through a `data-pin` attribute — and it has
 * no business knowing that this map draws two different things. The prefix is
 * what lets `handleSelect` tell them apart.
 */
const TRIP_MARKER_PREFIX = "trip:";

/**
 * The gaps in `.map-popup`'s two transforms, in pixels, plus the margin the
 * card keeps off the edge of the map. Duplicated from the CSS because the
 * measurement has to happen before the card is laid out — keep them in step.
 */
const POPUP_GAP_ABOVE = 44;
const POPUP_GAP_BELOW = 8;
const POPUP_EDGE = 12;

export function CustomerMap({
  pins,
  people,
  trips,
  isAdmin,
  initialPinId,
}: {
  pins: CustomerPinRow[];
  people: CustomerPerson[];
  /** Empty when field trips are switched off, which hides the layer entirely. */
  trips: MapTripRow[];
  isAdmin: boolean;
  /** From `?pin=` — the place a link elsewhere in the app is pointing at. */
  initialPinId?: string;
}) {
  const t = useTranslations();

  /*
   * The pin a link elsewhere in the app pointed at — a trip's card, or a row in
   * the lead list. Resolved once, as initial state rather than in an effect:
   * `initialPinId` is known on the server, so the first client render already
   * agrees with the HTML and there is nothing to reconcile.
   *
   * An id matching no pin resolves to null. That is a link to a place an admin
   * has since deleted, and giving up quietly is the right answer — the reader
   * did not type this URL, so there is nothing to correct them about.
   */
  const initialPin =
    initialPinId === undefined
      ? undefined
      : pins.find((pin) => pin.id === initialPinId);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialPin?.id ?? null,
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [placing, setPlacing] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Set<CustomerStatus>>(new Set());
  // A single value rather than a set, unlike the statuses: seven more chips on
  // a toolbar this size would bury the map, and "which channel" is a question
  // asked one channel at a time. Null is "every channel", which is where it
  // starts — the same meaning an empty status set carries.
  const [source, setSource] = useState<CustomerSource | null>(null);

  /*
   * Whether the off-site layer is drawn, and which trip is open.
   *
   * On by default: the layer answers "who is near this lead this week", which
   * is the question the two features have in common, and a layer nobody knows
   * is there answers nothing. It is a client toggle rather than a setting —
   * the whole board is already here, so hiding markers costs no round trip.
   */
  const [showTrips, setShowTrips] = useState(true);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  /*
   * Whether the toolbar shows more than its search row.
   *
   * Only ever consulted below `lg`: on a desktop the whole toolbar is always
   * drawn, and the extra rows are hidden by a `hidden lg:block` rather than by
   * this flag, so the desktop layout has no state to get wrong. On a phone the
   * toolbar was a 380px card over a map roughly 500px tall — the control panel
   * covered the thing it controls.
   *
   * It starts closed rather than mirroring a media query, which would have to
   * be read after mount and would flash the wrong state through hydration.
   */
  const [toolsOpen, setToolsOpen] = useState(false);
  const [controls, setControls] = useState<MapControls | null>(null);
  const [style, setStyle] = useState<MapStyle>(DEFAULT_MAP_STYLE);
  const [anchorPoint, setAnchorPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);

  // Place search: what came back, and whether anything is in flight. Null means
  // nobody has searched yet, which is different from "searched and found none".
  const [places, setPlaces] = useState<PlaceResult[] | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  const [createState, createAction] = useActionState(
    createCustomerPinAction,
    idleState,
  );

  /*
   * The basemap choice, remembered per browser.
   *
   * Read after mount rather than during render: the server has no
   * localStorage, and seeding state from it would be a hydration mismatch. The
   * first paint is therefore the default style for a moment, which costs
   * nothing — the tiles have not arrived by then either.
   */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
      if (isMapStyle(stored)) setStyle(stored);
    } catch {
      // Private mode, or site data blocked. The default is a fine answer.
    }
  }, []);

  const chooseStyle = useCallback((next: MapStyle) => {
    setStyle(next);
    try {
      window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, next);
    } catch {
      // Not worth telling anyone about: the map still changed, it just will
      // not be remembered next time.
    }
  }, []);

  // A pin survives a filter change, but not its own deletion: the panel would
  // otherwise sit open on a row the server no longer has.
  const selected = pins.find((pin) => pin.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  // Dropping a pin succeeded — the new one is already on the map, so all that
  // is left is to put the form away.
  useEffect(() => {
    if (createState.status === "success") {
      setDraft(null);
      setPlacing(false);
    }
  }, [createState]);

  /*
   * A place search has to open the panel it reports into.
   *
   * The results list, the spinner and the error all live in the collapsed half,
   * so on a phone a search run from a closed toolbar would look like the button
   * did nothing. Opening is the only honest response to "I asked it a question".
   */
  useEffect(() => {
    if (searching || places !== null || placeError !== null) setToolsOpen(true);
  }, [searching, places, placeError]);

  const visible = useMemo(
    () => filterPins(pins, query, statuses, source),
    [pins, query, statuses, source],
  );

  /*
   * The markers, and the small window each one carries.
   *
   * The label is built here rather than in MapCanvas because this is where the
   * translations are; MapCanvas takes plain strings and does the escaping. Three
   * customers and a "+n" — a label taller than its pin stops reading as attached
   * to it.
   */
  /*
   * The trips worth drawing.
   *
   * Two exclusions, and both come from rules the rest of the app already
   * follows. **Cancelled trips are dropped** — they did not happen, which is
   * why the calendar drops them too. **A trip with no coordinates is dropped**
   * — a trip may legitimately be known only by the name of a place
   * (`FieldTrip`'s latitude is nullable, unlike `CustomerPin`'s), and there is
   * nowhere on a map to put one.
   *
   * What is *not* excluded is a completed trip. It happened, and the marker
   * says so: CLAUDE.md's rule is that every view of a trip shows its state, and
   * the calendar earned that rule by announcing somebody was off-site on the
   * day they had already reported back.
   */
  const visibleTrips = useMemo(
    () => (showTrips ? trips.filter((trip) => trip.cancelledAt === null) : []),
    [trips, showTrips],
  );

  const selectedTrip =
    visibleTrips.find((trip) => trip.id === selectedTripId) ?? null;

  // The open trip does not survive the layer being switched off, or its own
  // cancellation — the popup would otherwise sit over nothing.
  useEffect(() => {
    if (selectedTripId && !selectedTrip) setSelectedTripId(null);
  }, [selectedTripId, selectedTrip]);

  const mapPins = useMemo<MapPin[]>(
    () =>
      visible.map((pin) => {
        const status = dominantStatus(pin.customers);
        const ordered = [...pin.customers].sort(byStatusRank);

        return {
          id: pin.id,
          latitude: pin.latitude,
          longitude: pin.longitude,
          tone: CUSTOMER_STATUS_META[status].tone,
          count: pin.customers.length,
          title: pin.label ?? pin.customers[0]?.name ?? "",
          label: {
            place: pin.label,
            rows: ordered.slice(0, LABEL_ROWS).map((customer) => ({
              name: customer.name,
              status: t(CUSTOMER_STATUS_META[customer.status].label),
              tone: CUSTOMER_STATUS_META[customer.status].tone,
            })),
            more: Math.max(0, ordered.length - LABEL_ROWS),
          },
          kind: "customer",
        };
      }),
    [visible, t],
  );

  /*
   * The off-site layer, in the same shape.
   *
   * `MapPinLabel` fits a trip without changing: the place is where they are,
   * and the single row is the person and what state the trip is in. One row,
   * never three — a trip is one person at one place.
   */
  const tripMarkers = useMemo<MapPin[]>(
    () =>
      visibleTrips.map((trip) => {
        const state = tripState(trip);

        return {
          id: `${TRIP_MARKER_PREFIX}${trip.id}`,
          latitude: trip.latitude,
          longitude: trip.longitude,
          tone: TRIP_TONE[state].color,
          count: 1,
          title: `${trip.employee.fullName} — ${trip.locationName}`,
          label: {
            place: trip.locationName,
            rows: [
              {
                name: trip.employee.fullName,
                status: t(TRIP_LABEL[state]),
                tone: TRIP_TONE[state].color,
              },
            ],
            more: 0,
          },
          kind: "trip",
        };
      }),
    [visibleTrips, t],
  );

  // Trips last, so a person stands on top of the place rather than under it.
  const allMarkers = useMemo(
    () => [...mapPins, ...tripMarkers],
    [mapPins, tripMarkers],
  );

  /**
   * One id space, two kinds of marker. The prefix is what separates them — see
   * TRIP_MARKER_PREFIX. Opening either closes the other, because the popup is
   * one card anchored to one point.
   */
  const handleSelect = useCallback((id: string) => {
    if (id.startsWith(TRIP_MARKER_PREFIX)) {
      setSelectedTripId(id.slice(TRIP_MARKER_PREFIX.length));
      setSelectedId(null);
    } else {
      setSelectedId(id);
      setSelectedTripId(null);
    }
    setDraft(null);
    setPlacing(false);
    setMovingId(null);
    setMovedTo(null);
  }, []);

  const handlePlace = useCallback((latitude: number, longitude: number) => {
    setDraft({ latitude, longitude });
    setSelectedId(null);
    setSelectedTripId(null);
    setPlacing(false);
  }, []);

  const handleDragEnd = useCallback(
    (id: string, latitude: number, longitude: number) => {
      // Recorded, not saved. The panel's "save position" button is what writes
      // it — a drag that committed on release would make an accidental nudge
      // permanent before anyone could see where it landed.
      if (id === movingId) setMovedTo({ latitude, longitude });
    },
    [movingId],
  );

  /*
   * The search box does two jobs, and this is the second one.
   *
   * Typing filters the pins already on the board, live and locally — that
   * happens on every keystroke and costs nothing. Pressing Enter asks the
   * basemap where a *place* is, which is a round trip to a third party and so
   * is deliberately not on every keystroke.
   */
  const runPlaceSearch = useCallback(() => {
    const q = query.trim();
    if (q.length < 2) return;

    setPlaceError(null);
    startSearch(async () => {
      const result = await searchPlacesAction({ query: q });
      if (result.status === "error") {
        setPlaces(null);
        setPlaceError(result.message);
        return;
      }
      setPlaces(result.results);
    });
  }, [query]);

  /*
   * Going to a place that was found.
   *
   * The query is cleared on the way, and that matters: the same box filters the
   * pins, so leaving "จุฬา" in it would land the map on Chulalongkorn with every
   * pin hidden because none of them is named that. Clearing it means arriving
   * at the place with the board intact, which is the whole point of going there.
   */
  const goToPlace = useCallback(
    (place: PlaceResult) => {
      controls?.focus(place);
      setPlaces(null);
      setPlaceError(null);
      setQuery("");
    },
    [controls],
  );

  /** What the crosshair is aimed at. The precise half of placing a pin. */
  const placeAtCentre = useCallback(() => {
    const at = controls?.centre();
    if (at) handlePlace(at.latitude, at.longitude);
  }, [controls, handlePlace]);

  const startMove = useCallback(() => {
    if (!selected) return;
    setMovingId(selected.id);
    setMovedTo(null);
  }, [selected]);

  const cancelMove = useCallback(() => {
    setMovingId(null);
    setMovedTo(null);
  }, []);

  // Cancelling a move puts the marker back where the server says it is; the
  // canvas does that on its own once `movingId` clears, because it stops
  // skipping the position sync.

  const closePanel = useCallback(() => {
    setSelectedId(null);
    setSelectedTripId(null);
    setDraft(null);
    cancelMove();
  }, [cancelMove]);

  const toggleStatus = useCallback((status: CustomerStatus) => {
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  // Escape backs out of whatever is open, innermost first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (placing) setPlacing(false);
      else if (movingId) cancelMove();
      else if (draft || selectedId) closePanel();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, movingId, draft, selectedId, cancelMove, closePanel]);

  /**
   * What the popup points at: the open pin, the open trip, or the point a click
   * just dropped. Only ever one of the three — the three setters above each
   * clear the other two.
   */
  const anchor = useMemo(() => {
    if (selected) {
      return { latitude: selected.latitude, longitude: selected.longitude };
    }
    if (selectedTrip) {
      return {
        latitude: selectedTrip.latitude,
        longitude: selectedTrip.longitude,
      };
    }
    return draft;
  }, [selected, selectedTrip, draft]);

  const panelOpen = anchor !== null;

  /*
   * The pin's pixel position, turned into the popup's.
   *
   * Two adjustments, and both exist so the popup stays readable rather than
   * strictly centred on its pin:
   *
   *  - **Clamped horizontally** to the map's own width, so a pin near an edge
   *    does not push half the card off screen. `--tail-x` then carries the
   *    difference, so the tail keeps pointing at the pin even though the card
   *    has moved out from over it.
   *  - **Flipped below** when there is not enough sky above the pin. The map
   *    pans to make room first (see MapCanvas), so this is the fallback for a
   *    short window rather than the usual case.
   *  - **Capped to the room it actually has**, on whichever side it ends up.
   *    The pan reserves a comfortable amount rather than the card's full
   *    height, so without this cap a pin near the top of the map opened a card
   *    that ran off the top — its own header, and its close button, above the
   *    edge of the map and behind the page header.
   *
   * And one refusal: once the pin itself is panned off the map, the popup is
   * hidden rather than clamped. The clamp exists for a pin *near* an edge; a
   * pin a thousand pixels past it would leave the card stuck to the border with
   * a tail pointing at nothing. Leaflet's own popups simply travel off screen
   * with the map, and this is the same answer — the card stays mounted, so a
   * half-typed form survives panning back.
   *
   * Ignored entirely below `lg`, where the CSS makes this a bottom sheet and
   * the custom properties go unread.
   */
  const { popupStyle, flipBelow, offscreen } = useMemo(() => {
    if (!anchorPoint) {
      return {
        popupStyle: undefined as CSSProperties | undefined,
        flipBelow: false,
        offscreen: false,
      };
    }

    const box = mapBox.current;
    const width = box?.clientWidth ?? 0;
    const height = box?.clientHeight ?? 0;

    const limit = POPUP_HALF_WIDTH + 8;
    const x =
      width > limit * 2
        ? Math.min(Math.max(anchorPoint.x, limit), width - limit)
        : anchorPoint.x;

    // What is left on each side once the tail's gap and a margin off the map's
    // edge are taken out. These two match the transforms in `.map-popup`.
    const roomAbove = anchorPoint.y - POPUP_GAP_ABOVE - POPUP_EDGE;
    const roomBelow = height - anchorPoint.y - POPUP_GAP_BELOW - POPUP_EDGE;

    // Above by default, because that is where the pin is looking. Flipped only
    // when above is genuinely cramped *and* below is roomier — a rule that
    // simply took the larger side would flip on every pan through the middle.
    const flip = roomAbove < POPUP_MIN_ROOM_ABOVE && roomBelow > roomAbove;
    const room = Math.max(0, flip ? roomBelow : roomAbove);

    return {
      popupStyle: {
        "--anchor-x": `${x}px`,
        "--anchor-y": `${anchorPoint.y}px`,
        "--tail-x": `${anchorPoint.x - x}px`,
        // Only meaningful once the map has been measured; before that the CSS
        // fallback (the full 32rem) is the right answer.
        ...(height > 0 ? { "--popup-room": `${room}px` } : {}),
      } as CSSProperties,
      flipBelow: flip,
      offscreen:
        width > 0 &&
        height > 0 &&
        (anchorPoint.x < -OFFSCREEN_MARGIN ||
          anchorPoint.y < -OFFSCREEN_MARGIN ||
          anchorPoint.x > width + OFFSCREEN_MARGIN ||
          anchorPoint.y > height + OFFSCREEN_MARGIN),
    };
  }, [anchorPoint]);

  return (
    <main className="relative min-h-0 flex-1">
      <div ref={mapBox} className="absolute inset-0">
        <MapCanvas
          pins={allMarkers}
          selectedId={
            selectedTripId
              ? `${TRIP_MARKER_PREFIX}${selectedTripId}`
              : selectedId
          }
          placing={placing}
          movingId={movingId}
          style={style}
          anchor={anchor}
          initialFocus={
            initialPin
              ? { latitude: initialPin.latitude, longitude: initialPin.longitude }
              : null
          }
          onSelect={handleSelect}
          onPlace={handlePlace}
          onDragEnd={handleDragEnd}
          onControls={setControls}
          onAnchorPoint={setAnchorPoint}
        />
      </div>

      {/* The sight. Drawn over the map, never in it, and inert — moving the map
          under it is the gesture, so it must never take a pointer event. */}
      {placing && (
        <div className="map-crosshair z-[1]" aria-hidden>
          <span />
        </div>
      )}

      {/* --- toolbar ------------------------------------------------------- */}
      {/*
        Positioned rather than in flow, because the map is the page and a bar
        above it would eat the height it is drawn in. `pointer-events-none` on
        the wrapper hands every gap between the controls back to the map, so
        panning still works in the space around them.

        `z-[1]` and not something large: `.leaflet-container` is `isolation:
        isolate; z-index: 0`, so Leaflet's own panes (which climb to 800) are
        sealed inside it and 1 is enough to sit above all of them. A big number
        here would also paint over the sticky header — whose menu drops into
        exactly this space on a phone.

        No `p-3` on the inner box: `.panel` sets padding from unlayered CSS,
        which beats any Tailwind utility (see the Conventions in CLAUDE.md).
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] p-3">
        <div
          className={`pointer-events-auto panel w-full max-w-md space-y-2 ${
            panelOpen ? "hidden lg:block" : ""
          }`}
        >
          {/* Submitting searches the basemap; typing filters the pins. Both
              live on one box because they are the same question asked of two
              places — "where is this" — and two boxes would make people pick. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              runPlaceSearch();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="search"
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // Belt and braces on top of the form's own submit. Enter in a
              // text field normally submits the form around it, but that is the
              // browser's *implicit* submission and it is easily lost — a
              // disabled submit button suppresses it, and `type="search"` has
              // its own history of swallowing the key. Enter is how most people
              // will run this, so it does not get to depend on that.
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                runPlaceSearch();
              }}
              placeholder={t("customers.searchPlaceholder")}
              aria-label={t("common.search")}
            />
            {/* Disabled only while a search is in flight, and deliberately not
                on a too-short query: a disabled submit button also stops the
                browser submitting the form on Enter, which is how most people
                will actually run this. The length check lives in the handler. */}
            <button
              type="submit"
              className="btn btn-secondary"
              aria-label={t("customers.searchPlace")}
              disabled={searching}
            >
              <SearchIcon />
            </button>
            <button
              type="button"
              className={placing ? "btn btn-danger" : "btn btn-primary"}
              onClick={() => {
                setPlacing((on) => !on);
                setDraft(null);
              }}
            >
              {placing ? t("customers.cancelPlacing") : t("customers.addPin")}
            </button>

            {/* The utility goes on a wrapper, never on the `.btn` itself:
                `.btn` is unlayered CSS and beats any Tailwind utility, so
                `className="btn lg:hidden"` would hide nothing at all. See the
                Conventions in CLAUDE.md. */}
            <div className="lg:hidden">
              <button
                type="button"
                className="btn btn-secondary"
                aria-expanded={toolsOpen}
                aria-controls="map-tools"
                aria-label={t("customers.toggleTools")}
                onClick={() => setToolsOpen((open) => !open)}
              >
                <ChevronIcon open={toolsOpen} />
              </button>
            </div>
          </form>

          {/*
            Placing stays outside the collapsible half, and has to.

            It is a mode somebody has just switched on, and its "ปักตรงนี้"
            button is the only way back out other than Escape. Hiding the exit
            behind the same toggle that hides the settings would strand anyone
            who opened the crosshair from a collapsed toolbar.
          */}
          {placing && (
            <div className="space-y-2">
              <Alert tone="warning">{t("customers.addPinHint")}</Alert>
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={placeAtCentre}
              >
                {t("customers.pinHere")}
              </button>
            </div>
          )}

          {/*
            Everything the map can be configured with, which on a phone is worth
            about six rows and is not what somebody opening the map came for.
            `hidden lg:block` keeps the desktop exactly as it was.
          */}
          <div
            id="map-tools"
            className={toolsOpen ? "space-y-2" : "hidden space-y-2 lg:block"}
          >
            {searching && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("customers.searchingPlace")}
              </p>
            )}

            {placeError && <Alert tone="error">{placeError}</Alert>}

            {places !== null && !searching && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2
                    className="flex-1 text-xs font-semibold"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("customers.placeResults")}
                  </h2>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={t("customers.clearPlaces")}
                    onClick={() => setPlaces(null)}
                  >
                    <CloseIcon />
                  </button>
                </div>

                {places.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("customers.noPlaces")}
                  </p>
                ) : (
                  <ul className="map-places">
                    {places.map((place) => (
                      <li key={place.id}>
                        <button
                          type="button"
                          className="map-place"
                          onClick={() => goToPlace(place)}
                        >
                          <span className="map-place-name">{place.name}</span>
                          {place.detail && (
                            <span className="map-place-detail">
                              {place.detail}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("customers.placeAttribution")}
                </p>
              </div>
            )}

            {!placing && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("customers.quickPinHint")}
              </p>
            )}

            {/* The basemap. Three looks, and the reason it is a control rather
              than a setting: which map reads best depends on where you are
              looking and what you are looking for, so it changes far more often
              than an admin toggle would. Kept per browser — see basemaps.ts. */}
            <fieldset
              className="flex flex-wrap items-center gap-1"
              aria-label={t("customers.mapStyle")}
            >
              <legend className="sr-only">{t("customers.mapStyle")}</legend>
              {MAP_STYLES.map((option) => {
                const on = option === style;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => chooseStyle(option)}
                    aria-pressed={on}
                    className="rounded-full px-2.5 py-1 text-[11px] leading-none"
                    style={
                      on
                        ? {
                            background: "var(--brand)",
                            color: "var(--brand-contrast)",
                          }
                        : {
                            background: "var(--surface-muted)",
                            color: "var(--text-muted)",
                          }
                    }
                  >
                    {t(MAP_STYLE_META[option].label)}
                  </button>
                );
              })}
            </fieldset>

            <fieldset
              className="flex flex-wrap gap-1"
              aria-label={t("customers.filterStatus")}
            >
              {CUSTOMER_STATUSES.map((status) => {
                const meta = CUSTOMER_STATUS_META[status];
                const on = statuses.has(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    aria-pressed={on}
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none"
                    style={
                      on
                        ? {
                            background: meta.tone,
                            color: "var(--brand-contrast)",
                          }
                        : {
                            background: "var(--surface-muted)",
                            color: "var(--text-muted)",
                          }
                    }
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: on ? "var(--brand-contrast)" : meta.tone,
                      }}
                    />
                    {t(meta.label)}
                  </button>
                );
              })}
            </fieldset>

            {/*
            The off-site layer's switch.

            A chip rather than a sixth status chip, and on its own line: the
            status chips filter *leads*, and putting "people" among them would
            read as a sixth kind of lead. It disappears when there is nothing to
            draw, because a switch for an empty layer is a switch that does
            nothing whichever way it is thrown.
          */}
          {trips.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTrips((on) => !on)}
              aria-pressed={showTrips}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none"
              style={
                showTrips
                  ? { background: "var(--brand)", color: "var(--brand-contrast)" }
                  : { background: "var(--surface-muted)", color: "var(--text-muted)" }
              }
            >
              <PersonIcon />
              {t("customers.showTrips")} ({trips.length})
            </button>
          )}

          {/* A select, not a seventh row of chips. Seven more of those would
              take more of the map than the toolbar already does, and unlike the
              statuses — which are a colour legend as much as a filter — a
              channel has no colour to show. */}
            <div className="flex items-center gap-2">
              <select
                className="input"
                value={source ?? ""}
                onChange={(event) =>
                  setSource(
                    event.target.value === ""
                      ? null
                      : (event.target.value as CustomerSource),
                  )
                }
                aria-label={t("customers.filterSource")}
              >
                <option value="">{t("customers.allSources")}</option>
                {CUSTOMER_SOURCES.map((option) => (
                  <option key={option} value={option}>
                    {t(CUSTOMER_SOURCE_META[option].label)}
                  </option>
                ))}
              </select>

              {/* The map answers "where"; the list answers "how many, from
                where, since when". Linked from here rather than from the nav,
                whose row is already full — /customers/leads keeps the customer
                entry highlighted anyway, since AppNav matches on the prefix. */}
              <Link
                href="/customers/leads"
                className="btn btn-secondary shrink-0"
              >
                {t("customers.openLeads")}
              </Link>
            </div>

            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {visible.length} {t("customers.pinCount")} ·{" "}
              {visible.reduce((sum, pin) => sum + pin.customers.length, 0)}{" "}
              {t("customers.customerCount")} · {t("customers.mapAttribution")}
            </p>

            {/* Both are about the *pins*, so neither has anything useful to say
              while a list of *places* is on screen — the box is being used to
              find somewhere, not to filter the board. */}
            {places === null && pins.length === 0 && (
              <Alert tone="warning">{t("customers.empty")}</Alert>
            )}
            {places === null && pins.length > 0 && visible.length === 0 && (
              <Alert tone="warning">{t("customers.noMatches")}</Alert>
            )}
          </div>
        </div>
      </div>

      {/* --- zoom + fit ---------------------------------------------------- */}
      {/*
        Bottom *right*, which is where map zoom controls live in every app
        people already use — and, incidentally, where Next's development
        indicator is not: that badge sits bottom-left and swallowed these
        buttons outright while developing.
      */}
      <div
        className={`absolute bottom-3 end-3 z-[1] flex flex-col gap-1 ${
          panelOpen ? "hidden lg:flex" : ""
        }`}
      >
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={t("customers.zoomIn")}
          onClick={() => controls?.zoomIn()}
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={t("customers.zoomOut")}
          onClick={() => controls?.zoomOut()}
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={t("customers.locateAll")}
          onClick={() => controls?.fit()}
        >
          <FitIcon />
        </button>
      </div>

      {/* --- the popup ----------------------------------------------------- */}
      {/*
        A popup pinned to its marker from `lg` up, and a sheet across the bottom
        below it. One element either way: the content is identical, and two
        components would drift apart on the day one of them gained a field.

        It used to be a column docked to the right edge, which worked and read
        badly — you clicked a pin here and then looked over there to find out
        what it was. Anchoring it to the thing it describes is the whole point,
        and it is why MapCanvas tracks the pin's pixel position as the map moves.
      */}
      {panelOpen && (
        <aside
          className="map-popup z-[2] flex flex-col border-t lg:border-t-0"
          style={{ background: "var(--surface)", ...popupStyle }}
          data-flip={flipBelow ? "below" : undefined}
          data-offscreen={offscreen ? "true" : undefined}
        >
          {selectedTrip ? (
            <TripPanel trip={selectedTrip} onClose={closePanel} />
          ) : selected ? (
            <CustomerPanel
              pin={selected}
              people={people}
              isAdmin={isAdmin}
              moving={movingId === selected.id}
              movedTo={movedTo}
              onStartMove={startMove}
              onCancelMove={cancelMove}
              onClose={closePanel}
            />
          ) : (
            draft && (
              <NewPinPanel
                draft={draft}
                people={people}
                action={createAction}
                errors={
                  createState.status === "error"
                    ? (createState.fieldErrors ?? {})
                    : {}
                }
                formError={
                  createState.status === "error"
                    ? createState.message
                    : undefined
                }
                onCancel={closePanel}
              />
            )
          )}
        </aside>
      )}
    </main>
  );
}

/**
 * The form a fresh pin opens onto: the place and its first customer, in one
 * submission, because `createCustomerPinAction` writes them in one transaction.
 * A pin with nobody at it would be a coloured dot that means nothing.
 */
function NewPinPanel({
  draft,
  people,
  action,
  errors,
  formError,
  onCancel,
}: {
  draft: Draft;
  people: CustomerPerson[];
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  formError?: string;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The × belongs here as much as on a pin's window: the cancel button is
          at the foot of a form that scrolls, so backing out of a pin dropped by
          mistake meant scrolling down to leave. Escape does it too, but nobody
          should have to know that. */}
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {t("customers.newPin")}
        </h2>
        <button
          type="button"
          className="btn btn-ghost shrink-0"
          aria-label={t("common.cancel")}
          onClick={onCancel}
        >
          <CloseIcon />
        </button>
      </header>

      <form action={action} className="map-scroll flex-1 space-y-3 px-4 py-4">
        {formError && <Alert tone="error">{formError}</Alert>}

        <PinFields
          errors={errors}
          latitude={draft.latitude}
          longitude={draft.longitude}
          idPrefix="draft"
        />

        <hr />

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("customers.customerOptional")}
        </p>

        <CustomerFields
          errors={errors}
          people={people}
          idPrefix="draft"
          required={false}
        />

        <FormActions submitLabel={t("common.create")} onCancel={onCancel} />
      </form>
    </div>
  );
}

/**
 * A pin survives the filter if any customer standing at it does — or, for the
 * text box alone, if the *place itself* matches.
 *
 * The customer is the right unit for most of it. Searching for a company should
 * show the building it is in, with its neighbours, because the neighbours are
 * the reason the stack exists. And an empty status set means "no filter" rather
 * than "nothing" — five chips all off is how a filter starts, not a request to
 * see an empty map.
 *
 * But the place test cannot live inside that loop, and this is worth stating
 * because it was written that way first and the bug it caused was invisible.
 * `[].some()` is always false, so **an empty pin could never match anything** —
 * including its own name. An empty pin is a state this app deliberately
 * supports ("this place, I will find out who is in it later"), and a board that
 * cannot find one by name is a board that has quietly lost it.
 *
 * So the two halves are separated by what they are questions *about*:
 *
 *   - the text box asks about a place **or** the people at it, so an empty pin
 *     answers on its name and address alone;
 *   - the status chips and the channel select ask about *people*, and an empty
 *     pin has neither a status nor a channel. It is not a match with a missing
 *     value — there is nothing there to have one — so it drops out whenever one
 *     of those is on, which is also what makes "สนใจ" mean "pins with an
 *     interested lead" rather than "pins that fail to contradict me".
 */
function filterPins(
  pins: CustomerPinRow[],
  query: string,
  statuses: Set<CustomerStatus>,
  source: CustomerSource | null,
): CustomerPinRow[] {
  const needle = query.trim().toLowerCase();
  const filteringPeople = statuses.size > 0 || source !== null;
  if (!needle && !filteringPeople) return pins;

  return pins.filter((pin) => {
    const place = `${pin.label ?? ""} ${pin.address ?? ""}`.toLowerCase();
    const placeMatches = needle !== "" && place.includes(needle);

    if (pin.customers.length === 0) return placeMatches && !filteringPeople;

    return pin.customers.some((customer) => {
      if (statuses.size > 0 && !statuses.has(customer.status)) return false;
      if (source !== null && customer.source !== source) return false;
      if (!needle) return true;

      return (
        placeMatches ||
        customer.name.toLowerCase().includes(needle) ||
        (customer.contactName?.toLowerCase().includes(needle) ?? false) ||
        (customer.phone?.toLowerCase().includes(needle) ?? false) ||
        (customer.email?.toLowerCase().includes(needle) ?? false) ||
        (customer.owner?.fullName.toLowerCase().includes(needle) ?? false)
      );
    });
  });
}

/**
 * One off-site trip, in the popup a marker opens.
 *
 * **Read-only, on the same terms as the pin panel's visit list.** A trip is
 * scheduled from `/admin/tasks` and run by the person on it; a control here
 * would be a third place trips are written from, carrying none of the guards
 * those two have. What it offers instead is the way back to the trip itself.
 */
function TripPanel({
  trip,
  onClose,
}: {
  trip: MapTripRow;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const state = tripState(trip);

  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {trip.employee.fullName}
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {trip.employee.employeeCode}
          </p>
        </div>
        <TripStatusBadge state={state} />
        <button
          type="button"
          className="btn btn-ghost shrink-0"
          aria-label={t("customers.closePanel")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="map-scroll flex-1 space-y-3 px-4 py-4">
        <div>
          <p className="text-sm font-medium">{trip.purpose}</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {trip.locationName}
          </p>
        </div>

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {day(trip.startDate)}
          {trip.endDate !== trip.startDate && ` – ${day(trip.endDate)}`}
          {` · ${trip.hours.start}–${trip.hours.end}`}
        </p>

        {/* The trip's own record, and the controls that go with it, live on the
            dashboard. `#trip-<id>` is the anchor AwayPanel puts on each one. */}
        <Link
          href={`/dashboard#trip-${trip.id}`}
          className="btn btn-secondary w-full"
        >
          {t("customers.openTrip")}
        </Link>
      </div>
    </div>
  );
}

function PersonIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0Z" />
    </svg>
  );
}

/** Points down when the extra rows are hidden, up when they are showing. */
function ChevronIcon({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function FitIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}
