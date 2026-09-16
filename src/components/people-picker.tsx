"use client";

import { useState } from "react";

import { FieldError } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

/** One person as a form offers them — the shape both pickers' callers share. */
export type Person = {
  id: string;
  employeeCode: string;
  fullName: string;
  department?: string | null;
};

/**
 * A list of people on a record — the assignees of a task, the travellers of a
 * trip — chosen one at a time and shown as chips.
 *
 * Any number of them, and they are equals, so this is a plain list with no
 * first entry that means anything. Lifted out of TripForm when tasks gained
 * the same list: two pickers over one rule drift, and the rule ("a select
 * that adds on pick, a chip with a ×, one hidden field") is the whole thing.
 *
 * Picking from the select adds immediately rather than arming a separate
 * "add" button. A button would leave a state where somebody has chosen the
 * third person, not pressed it, and saved a record that looks right on screen
 * and is missing a person in the database. There is no such half-step here,
 * and a mis-tap costs one × on the chip that appears.
 *
 * What the form actually submits is **one hidden field holding the whole
 * list**, comma-separated. A repeated input would collapse to its last value
 * in formDataToObject — see peopleIds in lib/validation.ts.
 *
 * `locked` states the list rather than offering it: no select, no × — this is
 * an employee creating work for themselves, and the server pins the list to
 * the caller regardless. The form is agreeing with the rule, not enforcing it.
 */
export function PeoplePicker({
  id,
  name,
  people,
  initial = [],
  locked = false,
  error,
  labels,
}: {
  /** Prefix for the control's DOM id, unique on the page. */
  id: string;
  /** The hidden field's name — `assigneeIds` or `employeeIds`. */
  name: string;
  /** Who may be chosen: the active accounts. */
  people: Person[];
  /**
   * Who is already on the record. Kept as the source of names too: `people`
   * holds active accounts, so somebody deactivated since the record was made
   * is absent from it, and falling back to this copy keeps them on screen with
   * a name instead of silently thinning the list an admin is looking at.
   */
  initial?: Person[];
  locked?: boolean;
  error?: string;
  labels: { field: TranslationKey; add: TranslationKey; full: TranslationKey; remove: TranslationKey };
}) {
  const t = useTranslations();
  const [ids, setIds] = useState<string[]>(() => initial.map((person) => person.id));

  const byId = new Map<string, Person>();
  for (const person of initial) byId.set(person.id, person);
  for (const person of people) byId.set(person.id, person);

  const unchosen = people.filter((person) => !ids.includes(person.id));

  return (
    <div>
      <label className="label" htmlFor={`${id}-people`}>
        {t(labels.field)}
      </label>

      {!locked && (
        <select
          id={`${id}-people`}
          className="input"
          /* Controlled at "" so the box returns to its prompt after each pick
             — it is an add control, not a field holding a value. */
          value=""
          disabled={unchosen.length === 0}
          onChange={(event) => {
            const picked = event.target.value;
            if (picked === "") return;
            setIds((current) => [...current, picked]);
          }}
        >
          <option value="">{unchosen.length === 0 ? t(labels.full) : t(labels.add)}</option>
          {unchosen.map((person) => (
            <option key={person.id} value={person.id}>
              {person.employeeCode} — {person.fullName}
              {person.department ? ` (${person.department})` : ""}
            </option>
          ))}
        </select>
      )}

      <input type="hidden" name={name} value={ids.join(",")} />

      {ids.length > 0 && (
        <ul className={`flex flex-wrap gap-2${locked ? "" : " mt-2"}`}>
          {ids.map((personId) => {
            const person = byId.get(personId);
            return (
              <li
                key={personId}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm"
                style={{ background: "var(--surface-muted)", color: "var(--text)" }}
              >
                <span>{person ? `${person.employeeCode} — ${person.fullName}` : personId}</span>
                {!locked && (
                  <button
                    type="button"
                    aria-label={t(labels.remove)}
                    onClick={() => setIds((current) => current.filter((v) => v !== personId))}
                    className="leading-none"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <FieldError message={error} />
    </div>
  );
}
