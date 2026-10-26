import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { MapTripRow, UnplacedTrip } from "@/components/customer-form";
import { CustomerMap } from "@/components/customer-map";
import { requireUser } from "@/lib/auth/rbac";
import { dayStart, todayKey, tripHours } from "@/lib/calendar";
import { serialiseCustomerPin } from "@/lib/serialise";
import { getSettings } from "@/lib/settings/server";
import {
  getAssignableEmployees,
  getCustomerPins,
  getMapTrips,
} from "@/server/queries";

export const metadata: Metadata = { title: "แผนที่ลูกค้า / Customer map" };

/**
 * The customer map, full-bleed.
 *
 * The only page in the app that does not render a `PageShell`: it renders its
 * own `<main>` (inside CustomerMap) and takes the whole viewport under the
 * header. That is why the shared `<main>` moved out of the app layout — see the
 * header of src/components/page-shell.tsx.
 *
 * `customer.enabled` is classified `reads`, and this is what makes that true
 * rather than decorative: the switch is checked before either query runs, so
 * turning the map off stops the app fetching pins at all. The nav link
 * disappears with it, but the link is not what protects anything — this guard
 * is, and `notFound()` rather than a redirect because a switched-off feature
 * genuinely has no page.
 */
export default async function CustomersPage({
  searchParams,
}: {
  /** `?pin=` — a link from a trip's card or from the lead list. */
  searchParams: Promise<{ pin?: string }>;
}) {
  const user = await requireUser();
  const settings = await getSettings();

  if (!settings["customer.enabled"]) notFound();

  /*
   * The off-site layer is `fieldTrip.enabled`'s to switch off, and this is what
   * makes that switch mean what SETTING_IMPACT says: the read is skipped, not
   * the markers hidden. Past trips come too: the map is also the record of
   * where the team has already been.
   */
  const tripsEnabled = settings["fieldTrip.enabled"];
  const isAdmin = user.role === "ADMIN";
  // The same boundary getFieldTrips splits upcoming from past on.
  const today = dayStart(todayKey());

  // Four reads, sent together: one round trip's latency for all of them. The
  // employee list feeds the owner select in every form on the page.
  const [pins, people, trips, params] = await Promise.all([
    getCustomerPins(),
    getAssignableEmployees(),
    tripsEnabled ? getMapTrips() : Promise.resolve([]),
    searchParams,
  ]);

  /*
   * Where a trip's own card is, for this viewer. An upcoming trip is in
   * AwayPanel on everyone's dashboard. A past one is only in its travellers'
   * TripHistory and the admin list, so anyone else gets no link rather than one
   * that lands nowhere.
   */
  const cardHref = (trip: (typeof trips)[number], past: boolean) =>
    !past || trip.travellers.some((person) => person.id === user.id)
      ? `/dashboard#trip-${trip.id}`
      : isAdmin
        ? `/admin/tasks#trip-${trip.id}`
        : null;

  /*
   * Only the trips that can actually be drawn go on the map.
   *
   * A trip may be known only by the name of a place — `FieldTrip`'s
   * coordinates are nullable, deliberately, unlike `CustomerPin`'s — and there
   * is nowhere on a map to put one of those, unless it is linked to a pin, in
   * which case it stands where the pin does. Narrowing here rather than in the
   * component is what lets `MapTripRow` promise non-null numbers instead of
   * making every reader check. The rest are listed rather than dropped, so a
   * trip never goes missing from the map without anybody being told.
   */
  const placed: MapTripRow[] = [];
  const unplaced: UnplacedTrip[] = [];

  for (const trip of trips) {
    const at =
      trip.latitude !== null && trip.longitude !== null
        ? { latitude: trip.latitude, longitude: trip.longitude }
        : trip.pin;
    const past = trip.endDate < today;

    if (!at) {
      unplaced.push({
        id: trip.id,
        purpose: trip.purpose,
        locationName: trip.locationName,
        startDate: trip.startDate.toISOString(),
        // An admin is sent to the card with the edit button on it.
        href: isAdmin ? `/admin/tasks#trip-${trip.id}` : cardHref(trip, past),
      });
      continue;
    }

    placed.push({
      id: trip.id,
      purpose: trip.purpose,
      locationName: trip.locationName,
      latitude: at.latitude,
      longitude: at.longitude,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate.toISOString(),
      startedAt: trip.startedAt?.toISOString() ?? null,
      completedAt: trip.completedAt?.toISOString() ?? null,
      cancelledAt: trip.cancelledAt?.toISOString() ?? null,
      // Resolved on the server, so "nobody said" becomes the office hours in
      // one place rather than in every view.
      hours: tripHours(trip),
      travellers: trip.travellers.map((person) => ({
        employeeCode: person.employeeCode,
        fullName: person.fullName,
      })),
      past,
      href: cardHref(trip, past),
    });
  }

  return (
    <CustomerMap
      pins={pins.map(serialiseCustomerPin)}
      people={people.map((person) => ({
        id: person.id,
        employeeCode: person.employeeCode,
        fullName: person.fullName,
      }))}
      trips={placed}
      unplacedTrips={unplaced}
      // Draws the delete controls. It decides nothing about whether the delete
      // is allowed — assertAdmin in the action settles that.
      isAdmin={isAdmin}
      // Not validated here on purpose: the map already ignores an id that
      // matches no pin, and the board is readable by everyone signed in, so
      // there is nothing an id in a URL could widen.
      initialPinId={params.pin}
    />
  );
}
