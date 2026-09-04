import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerMap } from "@/components/customer-map";
import { requireUser } from "@/lib/auth/rbac";
import { tripHours } from "@/lib/calendar";
import { serialiseCustomerPin } from "@/lib/serialise";
import { getSettings } from "@/lib/settings/server";
import {
  getAssignableEmployees,
  getCustomerPins,
  getFieldTrips,
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
   * the markers hidden. `window: "upcoming"` is the same set AwayPanel asks
   * for — a trip stays in it through its final day, so "who is out" includes
   * whoever is out right now.
   */
  const tripsEnabled = settings["fieldTrip.enabled"];

  // Four reads, sent together: one round trip's latency for all of them. The
  // employee list feeds the owner select in every form on the page.
  const [pins, people, trips, params] = await Promise.all([
    getCustomerPins(),
    getAssignableEmployees(),
    tripsEnabled ? getFieldTrips({ window: "upcoming" }) : Promise.resolve([]),
    searchParams,
  ]);

  return (
    <CustomerMap
      pins={pins.map(serialiseCustomerPin)}
      people={people.map((person) => ({
        id: person.id,
        employeeCode: person.employeeCode,
        fullName: person.fullName,
      }))}
      // Draws the delete controls. It decides nothing about whether the delete
      // is allowed — assertAdmin in the action settles that.
      /*
       * Only the trips that can actually be drawn.
       *
       * A trip may be known only by the name of a place — `FieldTrip`'s
       * coordinates are nullable, deliberately, unlike `CustomerPin`'s — and
       * there is nowhere on a map to put one of those. Narrowing here rather
       * than in the component is what lets `MapTripRow` promise non-null
       * numbers instead of making every reader check.
       */
      trips={trips.flatMap((trip) =>
        trip.latitude === null || trip.longitude === null
          ? []
          : [
              {
                id: trip.id,
                purpose: trip.purpose,
                locationName: trip.locationName,
                latitude: trip.latitude,
                longitude: trip.longitude,
                startDate: trip.startDate.toISOString(),
                endDate: trip.endDate.toISOString(),
                startedAt: trip.startedAt?.toISOString() ?? null,
                completedAt: trip.completedAt?.toISOString() ?? null,
                cancelledAt: trip.cancelledAt?.toISOString() ?? null,
                // Resolved on the server, so "nobody said" becomes the office
                // hours in one place rather than in every view.
                hours: tripHours(trip),
                employee: {
                  employeeCode: trip.employee.employeeCode,
                  fullName: trip.employee.fullName,
                },
              },
            ],
      )}
      isAdmin={user.role === "ADMIN"}
      // Not validated here on purpose: the map already ignores an id that
      // matches no pin, and the board is readable by everyone signed in, so
      // there is nothing an id in a URL could widen.
      initialPinId={params.pin}
    />
  );
}
