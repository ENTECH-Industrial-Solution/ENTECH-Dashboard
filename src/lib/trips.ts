/**
 * Display rules for a field trip that both sides of the boundary need.
 *
 * The counterpart of `lib/customers.ts`, and it exists for a boundary reason
 * rather than a tidiness one. `tripState()` and `TRIP_TONE` can live in
 * `trip-card.tsx` because only client components ask for them; the summary
 * below is called by `CalendarSection`, which is a **server** component, and a
 * function exported from a `"use client"` module is a client reference the
 * server may render but never call. Putting it here is what lets the calendar
 * and the map share one copy of the rule.
 */

/**
 * A list of people as one short line: the first name, and how many more.
 *
 * The views that draw a record small — a calendar cell, a sticky note, a map
 * marker's label and the title on it — have room for one name. A list
 * truncated mid-name says less than a count does, and "+2" is the part that
 * tells you this is a team rather than a person. The full list belongs on the
 * card and in the map popup, which have the room to draw it.
 *
 * Trips' travellers first, and tasks' assignees since they became a list
 * too. One copy, for the reason `tripState` has one: three views summarising
 * the same list three slightly different ways is three chances to disagree
 * about who is on something.
 *
 * Takes the least it can — anything with a `fullName` — so a caller passes
 * whatever shape of person it happens to be holding.
 */
export function peopleSummary(
  travellers: readonly { fullName: string }[],
): string {
  const [first, ...rest] = travellers;
  if (!first) return "";
  return rest.length > 0 ? `${first.fullName} +${rest.length}` : first.fullName;
}
