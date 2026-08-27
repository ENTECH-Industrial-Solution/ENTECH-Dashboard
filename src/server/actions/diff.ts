import "server-only";

/**
 * Field-by-field before/after for an edit's audit row.
 *
 * Tasks and trips both allow an admin to correct a record after it has been
 * closed out, and in both cases what makes that acceptable is not the edit
 * being reversible — it is the edit being *accounted for*. A row saying "an
 * admin updated this" is worth very little; a row saying the due date moved
 * from the 3rd to the 14th, and who moved it, is worth the immutability it
 * replaces. That rule lives here so the two cannot drift apart on it.
 *
 * An empty result means nothing actually changed, and the callers use it to
 * skip writing history at all: a trail full of no-ops is a trail nobody reads.
 */

/** What a diffable column can hold, flattened to something JSON can carry. */
type Plain = string | number | Date | null;

export type FieldDiff = Record<string, { from: string | null; to: string | null }>;

function plain(value: Plain | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function diffFields<K extends string>(
  fields: readonly K[],
  before: Record<K, Plain>,
  after: Partial<Record<K, Plain>>,
): FieldDiff {
  const changes: FieldDiff = {};

  for (const field of fields) {
    const next = after[field];
    // Absent, not blank: the form never rendered this field, so it was not
    // touched. See untouchedOrText in lib/validation.ts.
    if (next === undefined) continue;

    const from = plain(before[field]);
    const to = plain(next);
    if (from !== to) changes[field] = { from, to };
  }

  return changes;
}
