import { Avatar } from "@/components/employee-frame";
import { SlideRow } from "@/components/slide-row";
import { TripActions, TripEvidence, TripLocation } from "@/components/trip-card";
import type { SessionUser } from "@/lib/auth/session";
import { canRunFieldTrip } from "@/lib/auth/rbac";
import { bangkokDayKey, todayKey, tripHours } from "@/lib/calendar";
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
 * Inside each of the three, one box is one *person*, not one trip: the question
 * this panel answers is about people, and someone with two trips on the same
 * day is still one person to look for. The boxes run left to right and the row
 * scrolls (see SlideRow) — the panel is a third of the dashboard's width, so a
 * column of them buried everyone past the second or third name.
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
   * groups scroll under it — `min-h-0` is what lets the scrolling child actually
   * shrink, since a flex item defaults to min-height:auto and would otherwise
   * refuse to be smaller than its content. `scroll-bare` hides the bar itself;
   * the cards clipped against the panel's bottom edge are the cue that there is
   * more, so no gutter is reserved for one.
   *
   * `h-full`, deliberately, and not a `max-h-full` that would let a quiet week
   * draw a short panel: the two columns are meant to end on the same line, and
   * a panel that changes height with the week makes the row look broken rather
   * than empty. The space under one trip is the price of that, and it is the
   * one that was chosen — do not trade it back without asking.
   *
   * Down this axis it is the three groups that scroll, never the people inside
   * one — those run sideways instead.
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

type PersonTrips = {
  employee: FieldTripListItem["employee"];
  trips: FieldTripListItem[];
};

/**
 * One box per person, in the order their first trip appears — the list arrives
 * sorted by start date, so the soonest name stays leftmost, which is where the
 * row opens.
 */
function byPerson(trips: FieldTripListItem[]): PersonTrips[] {
  const order: PersonTrips[] = [];
  const seen = new Map<string, PersonTrips>();

  for (const trip of trips) {
    const found = seen.get(trip.employee.id);

    if (found) {
      found.trips.push(trip);
      continue;
    }

    const entry: PersonTrips = { employee: trip.employee, trips: [trip] };
    seen.set(trip.employee.id, entry);
    order.push(entry);
  }

  return order;
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
  const people = byPerson(trips);

  // The count stays a count of *trips*, not of boxes: it is the same number the
  // calendar and the summary strip put on this group, and a second meaning for
  // it here would be one more thing to keep in step.
  const heading = `${label} · ${trips.length}`;

  return (
    <SlideRow
      label={heading}
      heading={
        <div
          className="truncate text-xs font-medium uppercase tracking-wide"
          style={{ color: tone }}
        >
          {heading}
        </div>
      }
    >
      {people.map(({ employee, trips: theirs }) => (
        /* `slide-card` is the width rule: 85% of the row so the next person
           shows past the edge, floored and capped so the box stays readable.
           It lives in globals.css beside .card, with the reasoning. */
        <article
          key={employee.id}
          className="card slide-card flex flex-col gap-3 p-3"
          style={
            highlight
              ? { borderColor: "var(--warning)", background: "var(--warning-soft)" }
              : undefined
          }
        >
          <header className="flex items-center gap-2">
            <Avatar fullName={employee.fullName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{employee.fullName}</div>
              <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                {employee.employeeCode}
                {theirs.length > 1 && ` · ${theirs.length} ${t("trips.tripCount")}`}
              </div>
            </div>
          </header>

          {theirs.map((trip, index) => {
            const row = serialiseTrip(trip, locale);

            return (
              <div
                key={trip.id}
                // Same anchor TripCard uses, so a capsule line pointing at a
                // trip lands on it here too. It sits on the trip rather than on
                // the box, because the box is a person now — `.trip-anchor:target`
                // is what rings the right one.
                id={`trip-${trip.id}`}
                className={`trip-anchor scroll-mt-24 space-y-2${
                  index > 0 ? " border-t pt-3" : ""
                }`}
              >
                <div>
                  <div className="text-sm font-medium leading-snug break-words">
                    {trip.purpose}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(trip.startDate, locale)}
                    {bangkokDayKey(trip.startDate) !== bangkokDayKey(trip.endDate) &&
                      ` ${t("trips.untilDate")} ${formatDate(trip.endDate, locale)}`}
                    {` · ${tripHours(trip).start}–${tripHours(trip).end}`}
                  </div>
                </div>

                <TripLocation trip={row} />

                <TripEvidence trip={row} />

                {/* Decided here, on the server, from the session — the buttons
                    are a reflection of the rule, never the thing enforcing it. */}
                <TripActions
                  trip={row}
                  canRun={canRunFieldTrip(user, { employeeId: employee.id })}
                />
              </div>
            );
          })}
        </article>
      ))}
    </SlideRow>
  );
}
