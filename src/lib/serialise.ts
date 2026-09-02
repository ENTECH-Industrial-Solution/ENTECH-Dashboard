import type { CustomerPinRow } from "@/components/customer-form";
import type { TaskCardData } from "@/components/task-card";
import type { FieldTripRow } from "@/components/trip-form";
import type { Locale } from "@/lib/i18n/dictionaries";
import { isPinnedExactly, mapEmbedSrc, mapsHref } from "@/lib/maps";
import type {
  CustomerPinListItem,
  FieldTripListItem,
  TaskListItem,
} from "@/server/queries";

/**
 * Dates cross into client components as ISO strings — a Date instance is not
 * serialisable across the boundary, and the card formats it in the viewer's
 * locale anyway. Type-only imports, so this drags neither the client card nor
 * the server query layer into the other's bundle.
 */
export function serialiseTask(task: TaskListItem): TaskCardData {
  return {
    ...task,
    startDate: task.startDate?.toISOString() ?? null,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

/**
 * Same crossing for a field trip, plus both map URLs — resolved here so the
 * rule about which location source wins lives on the server, in one place, and
 * so the iframe src can never come from anywhere but this function.
 */
export function serialiseTrip(
  trip: FieldTripListItem,
  locale: Locale,
): FieldTripRow {
  return {
    ...trip,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    startedAt: trip.startedAt?.toISOString() ?? null,
    completedAt: trip.completedAt?.toISOString() ?? null,
    cancelledAt: trip.cancelledAt?.toISOString() ?? null,
    mapHref: mapsHref(trip),
    mapEmbedSrc: mapEmbedSrc(trip, locale),
    pinned: isPinnedExactly(trip),
  };
}

/**
 * The same crossing for a customer pin, plus the Google Maps link.
 *
 * Only `mapHref` and not an embed src, unlike a trip: the basemap on this page
 * is OpenStreetMap drawn by Leaflet, and this link is the escape hatch to the
 * app that gives directions. It is composed here, on the server, from the pin's
 * coordinates — the same rule maps.ts states, one function away from the
 * component that renders it.
 */
export function serialiseCustomerPin(pin: CustomerPinListItem): CustomerPinRow {
  return {
    ...pin,
    createdAt: pin.createdAt.toISOString(),
    updatedAt: pin.updatedAt.toISOString(),
    mapHref: mapsHref({
      locationName: pin.label ?? pin.customers[0]?.name ?? "",
      address: pin.address,
      latitude: pin.latitude,
      longitude: pin.longitude,
    }),
    customers: pin.customers.map((customer) => ({
      ...customer,
      lastContactedAt: customer.lastContactedAt?.toISOString() ?? null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    })),
  };
}
