import { Avatar } from "@/components/employee-frame";
import { TripLocation } from "@/components/trip-card";
import { bangkokDayKey, todayKey } from "@/lib/calendar";
import { formatDate, getLocale, getTranslations } from "@/lib/i18n/server";
import { serialiseTrip } from "@/lib/serialise";
import { getFieldTrips, type FieldTripListItem } from "@/server/queries";

/**
 * Who is out of the office, beside the calendar.
 *
 * The calendar answers "what happens on the 14th"; this answers "where is
 * everyone right now", which is the question people actually walk over to ask.
 * Split into out-now and coming-up, because those are two different concerns:
 * one changes who you can reach today, the other is something to plan around.
 *
 * Only people with a trip appear — a roster of everyone sitting at their desk
 * would bury the two names that matter.
 */
export async function AwayPanel({ employeeId }: { employeeId?: string }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const trips = await getFieldTrips({ window: "upcoming", employeeId });

  const today = todayKey();
  const live = trips.filter((trip) => trip.cancelledAt === null);

  const outNow = live.filter(
    (trip) =>
      bangkokDayKey(trip.startDate) <= today && today <= bangkokDayKey(trip.endDate),
  );
  const comingUp = live.filter((trip) => bangkokDayKey(trip.startDate) > today);

  return (
    <section className="panel space-y-4">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("trips.statusTitle")}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("trips.statusHint")}
        </p>
      </header>

      {outNow.length === 0 && comingUp.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("trips.allIn")}
        </p>
      ) : (
        <div className="space-y-4">
          {outNow.length > 0 && (
            <Group
              label={t("trips.outToday")}
              tone="var(--warning)"
              trips={outNow}
              locale={locale}
              highlight
            />
          )}
          {comingUp.length > 0 && (
            <Group
              label={t("trips.comingUp")}
              tone="var(--text-muted)"
              trips={comingUp}
              locale={locale}
            />
          )}
        </div>
      )}
    </section>
  );
}

async function Group({
  label,
  tone,
  trips,
  locale,
  highlight = false,
}: {
  label: string;
  tone: string;
  trips: FieldTripListItem[];
  locale: Awaited<ReturnType<typeof getLocale>>;
  highlight?: boolean;
}) {
  const t = await getTranslations();

  return (
    <div className="space-y-2">
      <div
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: tone }}
      >
        {label} · {trips.length}
      </div>

      {trips.map((trip) => (
        <article
          key={trip.id}
          className="card space-y-2 p-3"
          style={
            highlight
              ? { borderColor: "var(--warning)", background: "var(--warning-soft)" }
              : undefined
          }
        >
          <div className="flex items-start gap-2">
            <Avatar fullName={trip.employee.fullName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {trip.employee.fullName}
              </div>
              <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                {trip.employee.employeeCode} · {trip.purpose}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {formatDate(trip.startDate, locale)}
                {bangkokDayKey(trip.startDate) !== bangkokDayKey(trip.endDate) &&
                  ` ${t("trips.untilDate")} ${formatDate(trip.endDate, locale)}`}
              </div>
            </div>
          </div>

          <TripLocation trip={serialiseTrip(trip, locale)} />
        </article>
      ))}
    </div>
  );
}
