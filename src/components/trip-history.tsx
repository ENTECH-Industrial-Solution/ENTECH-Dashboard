import { TaskSection } from "@/components/task-section";
import { TripCard } from "@/components/trip-card";
import { EmptyState } from "@/components/ui";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { serialiseTrip } from "@/lib/serialise";
import { getSettings } from "@/lib/settings/server";
import { getFieldTrips } from "@/server/queries";

/**
 * One person's off-site record, after the days have passed.
 *
 * The counterpart to the completed-task archive, and there for the same reason:
 * a trip that has been run is evidence of work done, and evidence nobody can
 * find is not evidence. The off-site panel above answers "where is everyone
 * this week" and lets go of a trip once its days are over; this keeps it.
 *
 * Read-only by construction — TripCard is handed neither an edit handler nor a
 * cancel action, and the server refuses both on a completed trip regardless.
 *
 * Gates itself on `fieldTrip.enabled` rather than making every caller check,
 * the way ScheduleRow does. getSettings() is cached across the request, so the
 * check costs nothing.
 */
export async function TripHistory({ employeeId }: { employeeId: string }) {
  const settings = await getSettings();
  if (!settings["fieldTrip.enabled"]) return null;

  const [t, locale, trips] = await Promise.all([
    getTranslations(),
    getLocale(),
    getFieldTrips({ window: "past", employeeId, limit: 100 }),
  ]);

  return (
    <TaskSection title={t("trips.history")} hint={t("trips.historyHint")}>
      {trips.length === 0 ? (
        <EmptyState label={t("trips.historyEmpty")} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={serialiseTrip(trip, locale)} />
          ))}
        </div>
      )}
    </TaskSection>
  );
}
