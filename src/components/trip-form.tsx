"use client";

import { useState } from "react";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";

/**
 * One place on the customer map, as the trip form offers it.
 *
 * Deliberately not the whole `CustomerPinRow`: this form needs a label to show
 * and the four location values to copy, and taking the full row would drag the
 * leads standing at the pin into a page that has no use for them.
 */
export type TripPinOption = {
  id: string;
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type TripPerson = {
  id: string;
  employeeCode: string;
  fullName: string;
  department?: string | null;
};

export type FieldTripRow = {
  id: string;
  purpose: string;
  locationName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapUrl: string | null;
  /** ISO strings — Dates cannot cross into a client component. */
  startDate: string;
  endDate: string;
  /** "HH:MM", or null for the office hours — see tripHours in lib/calendar.ts. */
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  /** What actually happened, against the planned startDate/endDate above. */
  startedAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  proofUrl: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  /**
   * Everyone going, ordered by staff code, and never empty — the schema refuses
   * a trip with no one on it. They are equals: any of them may start and
   * complete the trip, and it counts toward each of their workloads.
   */
  travellers: TripPerson[];
  createdBy: { employeeCode: string; fullName: string };
  /** The customer pin this trip goes to, when it goes to one. */
  pin: { id: string; label: string | null } | null;
  /** Built on the server by src/lib/maps.ts. */
  mapHref: string;
  mapEmbedSrc: string;
  pinned: boolean;
};

/** "2026-08-26T00:00:00.000Z" -> "2026-08-26", the value an <input type=date> wants. */
export function dateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Create and edit share one form; the `trip` prop switches it to edit mode.
 *
 * Renders a bare <form> with no card of its own so the caller decides the
 * surrounding chrome — it appears both inside the task creator (as the other
 * half of a type switch) and as an inline editor in the trip list.
 */
export function TripForm({
  action,
  errors,
  formError,
  people,
  pins = [],
  trip,
  submitLabel,
  onCancel,
}: {
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  formError?: string;
  people: TripPerson[];
  /** Empty when the customer map is switched off, which hides the picker. */
  pins?: TripPinOption[];
  trip?: FieldTripRow;
  submitLabel: string;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const id = trip?.id ?? "new";

  /*
   * Who is going. Any number of them, and they are equals, so this is a plain
   * list with no first entry that means anything.
   *
   * Picking from the select adds immediately rather than arming a separate
   * "add" button. A button would leave a state where somebody has chosen the
   * third person, not pressed it, and saved a trip that looks right on screen
   * and is missing a traveller in the database. There is no such half-step
   * here, and a mis-tap costs one × on the chip that appears.
   */
  const [travellerIds, setTravellerIds] = useState<string[]>(
    () => trip?.travellers.map((person) => person.id) ?? [],
  );

  /*
   * Names for the chips, from the picker's list *and* the trip's own.
   *
   * The two differ on exactly one case and it is a real one: `people` holds
   * active accounts, so a traveller deactivated since the trip was scheduled is
   * absent from it. Falling back to the trip's own copy keeps them on screen
   * with a name instead of silently thinning the list an admin is looking at.
   */
  const byId = new Map<string, TripPerson>();
  for (const person of trip?.travellers ?? []) byId.set(person.id, person);
  for (const person of people) byId.set(person.id, person);

  const unchosen = people.filter((person) => !travellerIds.includes(person.id));

  /*
   * The four location fields are controlled from here, and only because of the
   * pin picker: choosing a place has to be able to fill them in. They stay
   * editable afterwards — the pin says which prospect this visit is for, and
   * the trip's own location is still what it is displayed from, so correcting
   * "Building A, 3rd floor" on top of a pinned address is a normal thing to do
   * rather than a contradiction.
   */
  const [place, setPlace] = useState({
    locationName: trip?.locationName ?? "",
    address: trip?.address ?? "",
    latitude: trip?.latitude === null ? "" : String(trip?.latitude ?? ""),
    longitude: trip?.longitude === null ? "" : String(trip?.longitude ?? ""),
  });

  const fillFromPin = (pinId: string) => {
    const pin = pins.find((option) => option.id === pinId);
    if (!pin) return;
    setPlace({
      locationName: pin.label,
      address: pin.address ?? "",
      latitude: String(pin.latitude),
      longitude: String(pin.longitude),
    });
  };

  /*
   * The report is offered only on a trip that has filed one. Not rendering it
   * is safe precisely because the schema reads an absent key as "unchanged"
   * rather than "cleared" — see untouchedOrText in lib/validation.ts.
   */
  const hasReport =
    trip !== undefined &&
    (trip.completedAt !== null ||
      trip.completionNote !== null ||
      trip.proofUrl !== null);

  return (
    <form action={action} className="space-y-4">
      {trip && <input type="hidden" name="fieldTripId" value={trip.id} />}
      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Spans both columns: the chips below it wrap onto their own lines, so
            a half-width box would leave the list crushed against the purpose
            field beside it. */}
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`travellers-${id}`}>
            {t("trips.people")}
          </label>

          <select
            id={`travellers-${id}`}
            className="input"
            /* Controlled at "" so the box returns to its prompt after each pick
               — it is an add control, not a field holding a value. */
            value=""
            disabled={unchosen.length === 0}
            onChange={(event) => {
              const picked = event.target.value;
              if (picked === "") return;
              setTravellerIds((current) => [...current, picked]);
            }}
          >
            <option value="">
              {unchosen.length === 0 ? t("trips.everyoneAdded") : t("trips.addPerson")}
            </option>
            {unchosen.map((person) => (
              <option key={person.id} value={person.id}>
                {person.employeeCode} — {person.fullName}
                {person.department ? ` (${person.department})` : ""}
              </option>
            ))}
          </select>

          {/* What the form actually submits: one field holding the whole list.
              A repeated `employeeIds` input would collapse to its last value in
              formDataToObject — see travellerIds in lib/validation.ts. */}
          <input type="hidden" name="employeeIds" value={travellerIds.join(",")} />

          {travellerIds.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {travellerIds.map((personId) => {
                const person = byId.get(personId);
                return (
                  <li
                    key={personId}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm"
                    style={{
                      background: "var(--surface-muted)",
                      color: "var(--text)",
                    }}
                  >
                    <span>
                      {person
                        ? `${person.employeeCode} — ${person.fullName}`
                        : personId}
                    </span>
                    <button
                      type="button"
                      aria-label={t("trips.removePerson")}
                      onClick={() =>
                        setTravellerIds((current) =>
                          current.filter((value) => value !== personId),
                        )
                      }
                      className="leading-none"
                      style={{ color: "var(--text-muted)" }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <FieldError message={errors.employeeIds} />
        </div>

        <div>
          <label className="label" htmlFor={`purpose-${id}`}>
            {t("trips.purpose")}
          </label>
          <input
            id={`purpose-${id}`}
            name="purpose"
            className="input"
            required
            maxLength={200}
            defaultValue={trip?.purpose ?? ""}
          />
          <FieldError message={errors.purpose} />
        </div>

        <div>
          <label className="label" htmlFor={`tripStart-${id}`}>
            {t("trips.startDate")}
          </label>
          <input
            id={`tripStart-${id}`}
            name="startDate"
            type="date"
            className="input"
            required
            defaultValue={trip ? dateInputValue(trip.startDate) : ""}
          />
          <FieldError message={errors.startDate} />
        </div>

        <div>
          <label className="label" htmlFor={`tripEnd-${id}`}>
            {t("trips.endDate")}
          </label>
          <input
            id={`tripEnd-${id}`}
            name="endDate"
            type="date"
            className="input"
            required
            defaultValue={trip ? dateInputValue(trip.endDate) : ""}
          />
          <FieldError message={errors.endDate} />
        </div>

        <div>
          <label className="label" htmlFor={`tripStartTime-${id}`}>
            {t("trips.startTime")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`tripStartTime-${id}`}
            name="startTime"
            type="time"
            className="input"
            defaultValue={trip?.startTime ?? ""}
          />
          <FieldError message={errors.startTime} />
        </div>

        <div>
          <label className="label" htmlFor={`tripEndTime-${id}`}>
            {t("trips.endTime2")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`tripEndTime-${id}`}
            name="endTime"
            type="time"
            className="input"
            defaultValue={trip?.endTime ?? ""}
          />
          <FieldError message={errors.endTime} />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {t("trips.hoursHint")}
          </p>
        </div>

        {/* The picker spans both columns: it fills the four fields under it,
            so it has to read as sitting above them rather than beside one. */}
        {pins.length > 0 && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`pinId-${id}`}>
              {t("trips.customerPin")}{" "}
              <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
            </label>
            <select
              id={`pinId-${id}`}
              name="pinId"
              className="input"
              defaultValue={trip?.pin?.id ?? ""}
              onChange={(event) => fillFromPin(event.target.value)}
            >
              {/* Blank is the common case, not a missing answer: most trips do
                  not go to a prospect at all. */}
              <option value="">{t("trips.noCustomerPin")}</option>
              {pins.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {t("trips.customerPinHint")}
            </p>
            <FieldError message={errors.pinId} />
          </div>
        )}

        <div>
          <label className="label" htmlFor={`locationName-${id}`}>
            {t("trips.location")}
          </label>
          <input
            id={`locationName-${id}`}
            name="locationName"
            className="input"
            required
            maxLength={200}
            value={place.locationName}
            onChange={(event) =>
              setPlace((p) => ({ ...p, locationName: event.target.value }))
            }
          />
          <FieldError message={errors.locationName} />
        </div>

        <div>
          <label className="label" htmlFor={`address-${id}`}>
            {t("trips.address")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`address-${id}`}
            name="address"
            className="input"
            maxLength={300}
            value={place.address}
            onChange={(event) =>
              setPlace((p) => ({ ...p, address: event.target.value }))
            }
          />
        </div>

        <div>
          <label className="label" htmlFor={`latitude-${id}`}>
            {t("trips.latitude")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`latitude-${id}`}
            name="latitude"
            className="input"
            inputMode="decimal"
            placeholder="13.7563"
            value={place.latitude}
            onChange={(event) =>
              setPlace((p) => ({ ...p, latitude: event.target.value }))
            }
          />
          <FieldError message={errors.latitude} />
        </div>

        <div>
          <label className="label" htmlFor={`longitude-${id}`}>
            {t("trips.longitude")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`longitude-${id}`}
            name="longitude"
            className="input"
            inputMode="decimal"
            placeholder="100.5018"
            value={place.longitude}
            onChange={(event) =>
              setPlace((p) => ({ ...p, longitude: event.target.value }))
            }
          />
          <FieldError message={errors.longitude} />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {t("trips.coordHint")}
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`mapUrl-${id}`}>
          {t("trips.mapUrl")}{" "}
          <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
        </label>
        <input
          id={`mapUrl-${id}`}
          name="mapUrl"
          type="url"
          className="input"
          placeholder="https://maps.app.goo.gl/..."
          defaultValue={trip?.mapUrl ?? ""}
        />
        <FieldError message={errors.mapUrl} />
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {t("trips.mapUrlHint")}
        </p>
      </div>

      <div>
        <label className="label" htmlFor={`tripNote-${id}`}>
          {t("trips.note")}{" "}
          <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
        </label>
        <textarea
          id={`tripNote-${id}`}
          name="note"
          className="input"
          rows={2}
          maxLength={2000}
          defaultValue={trip?.note ?? ""}
        />
      </div>

      {hasReport && (
        <div
          className="space-y-4 rounded-lg border-s-2 px-3 py-3"
          style={{
            borderInlineStartColor: "var(--success)",
            background: "var(--surface-muted)",
          }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("trips.editArchivedHint")}
          </p>

          <div>
            <label className="label" htmlFor={`tripReport-${id}`}>
              {t("trips.completionNote")}{" "}
              <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
            </label>
            <textarea
              id={`tripReport-${id}`}
              name="completionNote"
              className="input"
              rows={3}
              maxLength={5000}
              defaultValue={trip?.completionNote ?? ""}
            />
          </div>

          <div>
            <label className="label" htmlFor={`tripReportProof-${id}`}>
              {t("trips.proofUrl")}{" "}
              <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
            </label>
            <input
              id={`tripReportProof-${id}`}
              name="proofUrl"
              type="url"
              className="input"
              placeholder="https://"
              defaultValue={trip?.proofUrl ?? ""}
            />
            <FieldError message={errors.proofUrl} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <SubmitButton className="btn btn-primary">{submitLabel}</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
