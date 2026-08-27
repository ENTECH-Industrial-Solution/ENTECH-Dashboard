"use client";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";

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
  note: string | null;
  /** What actually happened, against the planned startDate/endDate above. */
  startedAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  proofUrl: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  employee: { id: string; employeeCode: string; fullName: string };
  createdBy: { employeeCode: string; fullName: string };
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
  trip,
  submitLabel,
  onCancel,
}: {
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  formError?: string;
  people: TripPerson[];
  trip?: FieldTripRow;
  submitLabel: string;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const id = trip?.id ?? "new";

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`employeeId-${id}`}>
            {t("trips.person")}
          </label>
          <select
            id={`employeeId-${id}`}
            name="employeeId"
            className="input"
            required
            defaultValue={trip?.employee.id ?? ""}
          >
            <option value="" disabled>
              —
            </option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.employeeCode} — {person.fullName}
                {person.department ? ` (${person.department})` : ""}
              </option>
            ))}
          </select>
          <FieldError message={errors.employeeId} />
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
          <label className="label" htmlFor={`locationName-${id}`}>
            {t("trips.location")}
          </label>
          <input
            id={`locationName-${id}`}
            name="locationName"
            className="input"
            required
            maxLength={200}
            defaultValue={trip?.locationName ?? ""}
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
            defaultValue={trip?.address ?? ""}
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
            defaultValue={trip?.latitude ?? ""}
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
            defaultValue={trip?.longitude ?? ""}
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
