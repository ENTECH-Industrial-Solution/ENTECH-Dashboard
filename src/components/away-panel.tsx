import { Avatar } from "@/components/employee-frame";
import { TripActions, TripEvidence, TripLocation } from "@/components/trip-card";
import type { SessionUser } from "@/lib/auth/session";
import { canRunFieldTrip } from "@/lib/auth/rbac";
import { bangkokDayKey, todayKey } from "@/lib/calendar";
import { formatDate, getLocale, getTranslations } from "@/lib/i18n/server";
import { serialiseTrip } from "@/lib/serialise";
import { getFieldTrips, type FieldTripListItem } from "@/server/queries";

/**
 * Who is out of the office, beside the calendar.
 *
 * The calendar answers "what happens on the 14th"; this answers "where is
 * everyone right now", which is the question people actually walk over to ask.
 * Split into three, because they are three different concerns: who is out
 * today changes who you can reach, who is going next is something to plan
 * around, and who has reported back is the day's work already accounted for.
 *
 * This is also where the traveller runs their own trip. It is the only view an
 * employee has of one — /admin/tasks is admin-only — so the start and complete
 * buttons have to live here, not only on the admin page.
 *
 * Only people with a trip appear — a roster of everyone sitting at their desk
 * would bury the two names that matter.
 */
export async function AwayPanel({
  user,
  employeeId,
}: {
  user: SessionUser;
  employeeId?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const trips = await getFieldTrips({ window: "upcoming", employeeId });

  const today = todayKey();
  const live = trips.filter((trip) => trip.cancelledAt === null);

  // A finished trip stops being an answer to "who is out" the moment it is
  // closed out, even though its days are still running — that is the whole
  // point of the button. It moves to its own group rather than disappearing.
  const reportedBack = live.filter((trip) => trip.completedAt !== null);
  const running = live.filter((trip) => trip.completedAt === null);

  const outNow = running.filter(
    (trip) =>
      bangkokDayKey(trip.startDate) <= today && today <= bangkokDayKey(trip.endDate),
  );
  const comingUp = running.filter((trip) => bangkokDayKey(trip.startDate) > today);

  const empty =
    outNow.length === 0 && comingUp.length === 0 && reportedBack.length === 0;

  /*
   * The panel fills the box it is given rather than growing to fit its trips.
   *
   * Beside the calendar it is the shorter column's height that should win: a
   * busy week here used to push the row down past the calendar and leave the
   * two panels ending at different lines. So the heading stays put, and the
   * trips scroll under it — `min-h-0` is what lets the scrolling child actually
   * shrink, since a flex item defaults to min-height:auto and would otherwise
   * refuse to be smaller than its content. `scroll-bare` hides the bar itself;
   * the cards clipped against the panel's bottom edge are the cue that there is
   * more, so no gutter is reserved for one.
   *
   * Stacked on a narrow screen there is no box to fill: `h-full` against an
   * auto-height parent resolves to auto, and the list simply runs its length.
   */
  return (
    <section className="panel flex h-full flex-col gap-4">
      <header className="shrink-0">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("trips.statusTitle")}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("trips.statusHint")}
        </p>
      </header>

      {empty ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("trips.allIn")}
        </p>
      ) : (
        <div className="scroll-bare min-h-0 flex-1 space-y-4 overflow-y-auto">
          {outNow.length > 0 && (
            <Group
              label={t("trips.outToday")}
              tone="var(--warning)"
              trips={outNow}
              locale={locale}
              user={user}
              highlight
            />
          )}
          {comingUp.length > 0 && (
            <Group
              label={t("trips.comingUp")}
              tone="var(--text-muted)"
              trips={comingUp}
              locale={locale}
              user={user}
            />
          )}
          {reportedBack.length > 0 && (
            <Group
              label={t("trips.done")}
              tone="var(--success)"
              trips={reportedBack}
              locale={locale}
              user={user}
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
  user,
  highlight = false,
}: {
  label: string;
  tone: string;
  trips: FieldTripListItem[];
  locale: Awaited<ReturnType<typeof getLocale>>;
  user: SessionUser;
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

      {trips.map((trip) => {
        const row = serialiseTrip(trip, locale);

        return (
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

            <TripLocation trip={row} />

            <TripEvidence trip={row} />

            {/* Decided here, on the server, from the session — the buttons are
                a reflection of the rule, never the thing enforcing it. */}
            <TripActions
              trip={row}
              canRun={canRunFieldTrip(user, { employeeId: trip.employee.id })}
            />
          </article>
        );
      })}
    </div>
  );
}
