/**
 * Calendar maths, pinned to Asia/Bangkok.
 *
 * Every date in this app is displayed in Bangkok time (see i18n/server.ts), so
 * the calendar has to bucket by the Bangkok calendar day too — otherwise a task
 * due the 1st would land on the 31st for anyone whose serverless region sits
 * west of it. Bangkok has no DST, so a fixed offset is exact.
 *
 * Pure and dependency-free: imported by both the query layer and the client
 * calendar, so the two can never disagree about which day a task falls on.
 */

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for the Bangkok calendar day containing `date`. */
export function bangkokDayKey(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayKey(): string {
  return bangkokDayKey(new Date());
}

/** The instant a Bangkok calendar day begins. */
export function dayStart(dayKey: string): Date {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) - BANGKOK_OFFSET_MS);
}

/** The UTC instants bounding a Bangkok calendar month: [from, to). */
export function monthBounds(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - BANGKOK_OFFSET_MS),
    to: new Date(Date.UTC(year, month, 1) - BANGKOK_OFFSET_MS),
  };
}

export type YearMonth = { year: number; month: number };

/** "YYYY-MM" — the value carried in the ?cal= search param. */
export function monthParam({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthOf(dayKey: string): YearMonth {
  return { year: Number(dayKey.slice(0, 4)), month: Number(dayKey.slice(5, 7)) };
}

/**
 * Reads ?cal=YYYY-MM, falling back to the month containing `fallbackDayKey`.
 * Anything malformed or out of range falls back rather than throwing — a hand
 * -edited URL should show today, not a 500.
 */
export function parseMonthParam(
  value: string | undefined,
  fallbackDayKey: string,
): YearMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  return monthOf(fallbackDayKey);
}

/** Days in a month, and which weekday (0 = Sunday) the 1st falls on. */
export function monthGrid({ year, month }: YearMonth): {
  daysInMonth: number;
  startWeekday: number;
} {
  return {
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    startWeekday: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(),
  };
}

export function dayKeyOf({ year, month }: YearMonth, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
