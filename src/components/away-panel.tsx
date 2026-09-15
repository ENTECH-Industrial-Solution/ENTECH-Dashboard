import type { CSSProperties } from "react";

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
 * Inside each of the three, one box is one *trip*, wearing the faces of
 * everyone on it — a team going somewhere is one thing to see, not one box per
 * name (see Group). The boxes run left to right and the row scrolls (see
 * SlideRow) — the panel is a third of the dashboard's width, so a column of
 * them buried everyone past the second or third name.
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

/**
 * How many faces a box draws before it says "+n" instead. Four fills the
 * header's width at the box's floor without pushing the names off it.
 */
const MAX_FACES = 4;

/**
 * The parts of a box, top to bottom, as the rows of the rail's grid. Every
 * part places itself on its own row (`row-start-N`) so the five sit at the
 * same five heights in every box on the row — a part that renders nothing
 * (a trip with no evidence yet) leaves its row empty rather than pulling
 * the buttons up into it. Spacing is each part's own `pt-3`, not the grid's
 * row gap, for the same reason: an empty row must take no room at all.
 */
const BOX_ROWS = 5;

/**
 * One box per trip, in the order the trips arrive — sorted by start date, so
 * the soonest stays leftmost, which is where the row opens.
 *
 * A trip several people are on is *one* box, wearing all of their faces. It was
 * one box per person once, on the grounds that the panel asks about people;
 * but that drew the same job three times over with a different name on each,
 * and reading three boxes to learn that three colleagues went to Rayong
 * together is the wrong way round. A team going somewhere is one thing to see,
 * and the header is where the whole team is named. Someone on two trips the
 * same day appears in two boxes, which is also true: they have two places to
 * be. The count on the group heading counts the same trips as the boxes now,
 * and it is still the number the calendar and the summary strip put on the
 * same group.
 */
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
  const heading = `${label} · ${trips.length}`;

  return (
    <SlideRow
      label={heading}
      rows={BOX_ROWS}
      heading={
        <div
          className="truncate text-xs font-medium uppercase tracking-wide"
          style={{ color: tone }}
        >
          {heading}
        </div>
      }
    >
      {trips.map((trip) => {
        const row = serialiseTrip(trip, locale);
        const faces = trip.travellers.slice(0, MAX_FACES);
        const more = trip.travellers.length - faces.length;

        return (
          /* `slide-card` is the width rule: 85% of the row so the next trip
             shows past the edge, floored and capped so the box stays readable.
             It lives in globals.css beside .card, with the reasoning.

             Same anchor TripCard uses, so a capsule line or a map popup
             pointing at a trip lands on it here too — `.trip-anchor:target`
             is what rings it. */
          <article
            key={trip.id}
            id={`trip-${trip.id}`}
            className="card slide-card trip-anchor grid row-span-full grid-rows-subgrid scroll-mt-24 p-3"
            style={
              {
                // The faces below ring themselves in the box's own colour, so
                // the box says what that colour is.
                "--face-ring": highlight ? "var(--warning-soft)" : "var(--surface)",
                ...(highlight
                  ? { borderColor: "var(--warning)", background: "var(--warning-soft)" }
                  : undefined),
              } as CSSProperties
            }
          >
            <header className="row-start-1 flex items-center gap-3">
              {/* The faces overlap so four of them take the room of two and a
                  half; each carries a ring in the box's colour so the overlap
                  reads as a stack rather than a smear. */}
              <div className="flex shrink-0 -space-x-2">
                {faces.map((person) => (
                  <span
                    key={person.id}
                    className="rounded-full ring-2"
                    style={{ "--tw-ring-color": "var(--face-ring)" } as CSSProperties}
                    title={`${person.employeeCode} — ${person.fullName}`}
                  >
                    <Avatar fullName={person.fullName} />
                  </span>
                ))}
                {more > 0 && (
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2"
                    style={
                      {
                        background: "var(--surface-muted)",
                        color: "var(--text-muted)",
                        "--tw-ring-color": "var(--face-ring)",
                      } as CSSProperties
                    }
                  >
                    +{more}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {/* Every name, wrapping — this is the line that tells four
                    people they are on the same job, and the full list is what
                    a box with room for it owes them. */}
                <div className="text-sm font-medium leading-snug break-words">
                  {trip.travellers.map((person) => person.fullName).join(", ")}
                </div>
                <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                  {trip.travellers.length > 1
                    ? `${trip.travellers.length} ${t("trips.peopleCount")}`
                    : trip.travellers[0]?.employeeCode}
                </div>
              </div>
            </header>

            <div className="row-start-2 pt-3">
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

            {/* These two render nothing on some trips, so their rows are
                wrappers that always exist and take no height when empty:
                the `pt-3` lives on the content, not on the wrapper. */}
            <div className="row-start-3 [&>*]:mt-3">
              <TripLocation trip={row} />
            </div>

            <div className="row-start-4 [&>*]:mt-3">
              <TripEvidence trip={row} />
            </div>

            {/* Decided here, on the server, from the session — the buttons are
                a reflection of the rule, never the thing enforcing it. Asked of
                the trip's travellers: anyone on it may run it. */}
            <div className="row-start-5 pt-3">
              <TripActions
                trip={row}
                canRun={canRunFieldTrip(user, {
                  travellerIds: trip.travellers.map((person) => person.id),
                })}
              />
            </div>
          </article>
        );
      })}
    </SlideRow>
  );
}
