"use client";

import type { CustomerStatus } from "@prisma/client";

import { Alert, FieldError, SubmitButton } from "@/components/ui";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_META } from "@/lib/customers";
import { useTranslations } from "@/lib/i18n/client";

/**
 * The fields behind every write to a pin or a lead.
 *
 * Split into bare field *groups* and thin `<form>` wrappers around them,
 * because one case needs both groups in a single form: dropping a pin creates
 * the place and its first customer together, so `createCustomerPinSchema` is
 * the two field sets merged and the form has to be too. Everything else uses
 * one group at a time.
 *
 * Create and edit share a group; which it is comes from the row being present,
 * exactly as TripForm decides it.
 */

export type CustomerPerson = {
  id: string;
  employeeCode: string;
  fullName: string;
};

export type CustomerRow = {
  id: string;
  name: string;
  status: CustomerStatus;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  note: string | null;
  /** ISO strings — a Date cannot cross into a client component. */
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; employeeCode: string; fullName: string } | null;
  createdBy: { employeeCode: string; fullName: string };
};

export type CustomerPinRow = {
  id: string;
  label: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { employeeCode: string; fullName: string };
  customers: CustomerRow[];
  /**
   * Built on the server by src/lib/maps.ts, and a **link** rather than a frame
   * source — the basemap here is OpenStreetMap, and this is the "open the real
   * thing" escape hatch for someone who wants directions.
   */
  mapHref: string;
};

/** "2026-09-02T00:00:00.000Z" -> "2026-09-02", what <input type=date> wants. */
function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** One lead's fields, with no <form> of its own. */
export function CustomerFields({
  errors,
  people,
  customer,
  idPrefix,
}: {
  errors: Record<string, string>;
  people: CustomerPerson[];
  customer?: CustomerRow;
  idPrefix: string;
}) {
  const t = useTranslations();

  return (
    <>
      <div>
        <label className="label" htmlFor={`name-${idPrefix}`}>
          {t("customers.customerName")}
        </label>
        <input
          id={`name-${idPrefix}`}
          name="name"
          className="input"
          required
          maxLength={200}
          defaultValue={customer?.name ?? ""}
        />
        <FieldError message={errors.name} />
      </div>

      <div>
        <label className="label" htmlFor={`status-${idPrefix}`}>
          {t("tasks.status")}
        </label>
        <select
          id={`status-${idPrefix}`}
          name="status"
          className="input"
          defaultValue={customer?.status ?? "CONSIDERING"}
        >
          {CUSTOMER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(CUSTOMER_STATUS_META[status].label)}
            </option>
          ))}
        </select>
        <FieldError message={errors.status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`contactName-${idPrefix}`}>
            {t("customers.contactName")}
          </label>
          <input
            id={`contactName-${idPrefix}`}
            name="contactName"
            className="input"
            maxLength={120}
            defaultValue={customer?.contactName ?? ""}
          />
          <FieldError message={errors.contactName} />
        </div>

        <div>
          <label className="label" htmlFor={`phone-${idPrefix}`}>
            {t("customers.phone")}
          </label>
          <input
            id={`phone-${idPrefix}`}
            name="phone"
            type="tel"
            className="input"
            maxLength={40}
            defaultValue={customer?.phone ?? ""}
          />
          <FieldError message={errors.phone} />
        </div>

        <div>
          <label className="label" htmlFor={`email-${idPrefix}`}>
            {t("customers.email")}
          </label>
          <input
            id={`email-${idPrefix}`}
            name="email"
            type="email"
            className="input"
            defaultValue={customer?.email ?? ""}
          />
          <FieldError message={errors.email} />
        </div>

        <div>
          <label className="label" htmlFor={`lineId-${idPrefix}`}>
            {t("customers.lineId")}
          </label>
          <input
            id={`lineId-${idPrefix}`}
            name="lineId"
            className="input"
            maxLength={80}
            defaultValue={customer?.lineId ?? ""}
          />
          <FieldError message={errors.lineId} />
        </div>

        <div>
          <label className="label" htmlFor={`ownerId-${idPrefix}`}>
            {t("customers.owner")}
          </label>
          <select
            id={`ownerId-${idPrefix}`}
            name="ownerId"
            className="input"
            defaultValue={customer?.owner?.id ?? ""}
          >
            {/* Blank is a real answer, not a missing one: an unclaimed lead is
                the state most of them start in. */}
            <option value="">{t("customers.unassigned")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.employeeCode} — {person.fullName}
              </option>
            ))}
          </select>
          <FieldError message={errors.ownerId} />
        </div>

        <div>
          <label className="label" htmlFor={`lastContactedAt-${idPrefix}`}>
            {t("customers.lastContactedAt")}
          </label>
          <input
            id={`lastContactedAt-${idPrefix}`}
            name="lastContactedAt"
            type="date"
            className="input"
            defaultValue={dateInputValue(customer?.lastContactedAt ?? null)}
          />
          <FieldError message={errors.lastContactedAt} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`note-${idPrefix}`}>
          {t("customers.note")}
        </label>
        <textarea
          id={`note-${idPrefix}`}
          name="note"
          className="input"
          rows={3}
          maxLength={2000}
          defaultValue={customer?.note ?? ""}
        />
        <FieldError message={errors.note} />
      </div>
    </>
  );
}

/**
 * The place, rather than the people at it — a different question with a
 * different answer, since an address is corrected once and a lead's status
 * changes every week.
 *
 * The coordinates travel as hidden fields rather than as typed numbers. They
 * came from a click on the map or from dragging the marker, and a pair of
 * number boxes would invite someone to type a point they cannot see.
 */
export function PinFields({
  errors,
  pin,
  latitude,
  longitude,
  idPrefix,
}: {
  errors: Record<string, string>;
  pin?: CustomerPinRow;
  latitude: number;
  longitude: number;
  idPrefix: string;
}) {
  const t = useTranslations();

  return (
    <>
      <input type="hidden" name="latitude" value={latitude} />
      <input type="hidden" name="longitude" value={longitude} />

      <div>
        <label className="label" htmlFor={`label-${idPrefix}`}>
          {t("customers.pinLabel")}{" "}
          <span style={{ color: "var(--text-muted)" }}>
            ({t("common.optional")})
          </span>
        </label>
        <input
          id={`label-${idPrefix}`}
          name="label"
          className="input"
          maxLength={200}
          defaultValue={pin?.label ?? ""}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {t("customers.pinLabelHint")}
        </p>
        <FieldError message={errors.label} />
      </div>

      <div>
        <label className="label" htmlFor={`address-${idPrefix}`}>
          {t("customers.address")}
        </label>
        <textarea
          id={`address-${idPrefix}`}
          name="address"
          className="input"
          rows={2}
          maxLength={300}
          defaultValue={pin?.address ?? ""}
        />
        <FieldError message={errors.address} />
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("customers.coordinates")}: {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </p>
      <FieldError message={errors.latitude ?? errors.longitude} />
    </>
  );
}

/** The buttons every one of these forms ends with. */
export function FormActions({
  submitLabel,
  onCancel,
}: {
  submitLabel: string;
  onCancel: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap gap-2">
      <SubmitButton>{submitLabel}</SubmitButton>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        {t("common.cancel")}
      </button>
    </div>
  );
}

/** One lead, as a complete form. */
export function CustomerForm({
  action,
  errors,
  formError,
  people,
  customer,
  submitLabel,
  onCancel,
  children,
}: {
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  formError?: string;
  people: CustomerPerson[];
  customer?: CustomerRow;
  submitLabel: string;
  onCancel: () => void;
  /** The hidden key that says what this form is attached to. */
  children?: React.ReactNode;
}) {
  return (
    <form action={action} className="space-y-3">
      {children}
      {formError && <Alert tone="error">{formError}</Alert>}

      <CustomerFields
        errors={errors}
        people={people}
        customer={customer}
        idPrefix={customer?.id ?? "new"}
      />

      <FormActions submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

/** The place, as a complete form. */
export function PinForm({
  action,
  errors,
  formError,
  pin,
  latitude,
  longitude,
  submitLabel,
  onCancel,
  children,
}: {
  action: (formData: FormData) => void;
  errors: Record<string, string>;
  formError?: string;
  pin?: CustomerPinRow;
  latitude: number;
  longitude: number;
  submitLabel: string;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} className="space-y-3">
      {children}
      {formError && <Alert tone="error">{formError}</Alert>}

      <PinFields
        errors={errors}
        pin={pin}
        latitude={latitude}
        longitude={longitude}
        idPrefix={pin?.id ?? "new"}
      />

      <FormActions submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
