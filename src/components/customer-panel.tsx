"use client";

import type { CustomerStatus } from "@prisma/client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  CustomerForm,
  PinForm,
  type CustomerPerson,
  type CustomerPinRow,
  type CustomerRow,
  type PinTripRow,
} from "@/components/customer-form";
import { TripStatusBadge, tripState } from "@/components/trip-card";
import { Alert, SubmitButton } from "@/components/ui";
import {
  CUSTOMER_SOURCE_META,
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_META,
  byStatusRank,
} from "@/lib/customers";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import {
  createCustomerAction,
  deleteCustomerAction,
  deleteCustomerPinAction,
  moveCustomerPinAction,
  setCustomerStatusAction,
  updateCustomerAction,
  updateCustomerPinAction,
} from "@/server/actions/customers";
import { idleState } from "@/server/actions/types";

/**
 * Everything about one pin, in the popup hanging off it.
 *
 * This is where the "stack" in this feature actually lives: the marker is a
 * single dot whatever is behind it, and this is the list that says a dot at one
 * address is four companies with four different answers. So the list is the
 * point, and each entry carries its own status chips rather than the popup
 * carrying one control that applies to whichever row was last touched.
 *
 * It was a column docked to the right edge first, which worked and read badly —
 * you clicked a pin here and looked over there to find out what it was. The
 * positioning lives in `.map-popup` (globals.css) and the tracking in
 * MapCanvas; this component only fills the box, which is why it grows with
 * `flex-1 min-h-0` and never sets a height of its own.
 *
 * Deleting is admin-only and every other write is not — see the header of
 * src/server/actions/customers.ts for why. `isAdmin` here decides whether a
 * control is *drawn*; it decides nothing about whether the write is allowed,
 * which the action settles on the server.
 */

/** Local, like workload-pills' copy: a six-line hook is cheaper than importing
 *  a card and everything it drags with it. Bangkok, like every date in the app. */
function useDayFormatter() {
  const locale = useLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
}

export function CustomerPanel({
  pin,
  people,
  isAdmin,
  moving,
  movedTo,
  onStartMove,
  onCancelMove,
  onClose,
}: {
  pin: CustomerPinRow;
  people: CustomerPerson[];
  isAdmin: boolean;
  /** True while this pin's marker is draggable. */
  moving: boolean;
  /** Where the marker has been dragged to, if it has moved yet. */
  movedTo: { latitude: number; longitude: number } | null;
  onStartMove: () => void;
  onCancelMove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [editingPlace, setEditingPlace] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [placeState, placeAction] = useActionState(
    updateCustomerPinAction,
    idleState,
  );
  const [addState, addAction] = useActionState(createCustomerAction, idleState);

  const customers = [...pin.customers].sort(byStatusRank);
  const heading = pin.label ?? customers[0]?.name ?? t("customers.newPin");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{heading}</h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {pin.customers.length} {t("customers.customerCount")}
            {pin.address ? ` · ${pin.address}` : ""}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost shrink-0"
          aria-label={t("customers.closePanel")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="map-scroll flex-1 space-y-4 px-4 py-4">
        {/* --- the place ---------------------------------------------------- */}
        <section className="space-y-2">
          {editingPlace ? (
            <PinForm
              action={placeAction}
              errors={
                placeState.status === "error" ? (placeState.fieldErrors ?? {}) : {}
              }
              formError={
                placeState.status === "error" ? placeState.message : undefined
              }
              pin={pin}
              latitude={pin.latitude}
              longitude={pin.longitude}
              submitLabel={t("common.save")}
              onCancel={() => setEditingPlace(false)}
            >
              <input type="hidden" name="pinId" value={pin.id} />
            </PinForm>
          ) : (
            <>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("customers.coordinates")}: {pin.latitude.toFixed(5)},{" "}
                {pin.longitude.toFixed(5)}
              </p>

              {moving ? (
                <MovePinControls
                  pin={pin}
                  movedTo={movedTo}
                  onCancel={onCancelMove}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={pin.mapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                  >
                    {t("customers.openInMaps")}
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditingPlace(true)}
                  >
                    {t("customers.editCustomer")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onStartMove}
                  >
                    {t("customers.movePin")}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* --- the stack ---------------------------------------------------- */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {t("customers.stackCount")} ({customers.length})
          </h3>

          {customers.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("customers.noCustomersYet")}
            </p>
          ) : (
            customers.map((customer) => (
              <CustomerEntry
                key={customer.id}
                customer={customer}
                people={people}
                isAdmin={isAdmin}
              />
            ))
          )}
        </section>

        {/* --- who has been here ------------------------------------------- */}
        {pin.fieldTrips.length > 0 && <VisitList trips={pin.fieldTrips} />}

        {/* --- adding another --------------------------------------------- */}
        {adding ? (
          <section className="card space-y-3 p-3">
            <CustomerForm
              action={addAction}
              errors={addState.status === "error" ? (addState.fieldErrors ?? {}) : {}}
              formError={addState.status === "error" ? addState.message : undefined}
              people={people}
              submitLabel={t("common.create")}
              onCancel={() => setAdding(false)}
            >
              <input type="hidden" name="pinId" value={pin.id} />
            </CustomerForm>
          </section>
        ) : (
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => setAdding(true)}
          >
            {t("customers.addCustomer")}
          </button>
        )}

        {/* --- destroying the place ---------------------------------------- */}
        {isAdmin && (
          <section className="border-t pt-3">
            {confirmingDelete ? (
              <DeletePinForm pin={pin} onCancel={() => setConfirmingDelete(false)} />
            ) : (
              <button
                type="button"
                className="btn btn-danger w-full"
                onClick={() => setConfirmingDelete(true)}
              >
                {t("customers.deletePin")}
              </button>
            )}
          </section>
        )}

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {pin.createdBy.employeeCode} — {pin.createdBy.fullName}
        </p>
      </div>
    </div>
  );
}

/**
 * The trips that went to this place.
 *
 * The other end of the link a trip's own card draws back to the map, and the
 * reason the link is worth having at all: standing on a pin, "we have been
 * here three times and the last one was cancelled" is the thing you want to
 * know before knocking again.
 *
 * Read-only, deliberately. A trip is scheduled from /admin/tasks and run by
 * the person on it; putting either control here would be a third place trips
 * are written from, with none of the guards that page's controls carry.
 */
function VisitList({ trips }: { trips: PinTripRow[] }) {
  const t = useTranslations();
  const formatDay = useDayFormatter();

  return (
    <section className="space-y-2">
      <h3
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {t("customers.visits")} ({trips.length})
      </h3>

      {trips.map((trip) => (
        <div key={trip.id} className="card space-y-1 p-3">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {trip.purpose}
            </p>
            <TripStatusBadge state={tripState(trip)} />
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {formatDay(trip.startDate)}
            {trip.endDate !== trip.startDate && ` – ${formatDay(trip.endDate)}`}
            {" · "}
            {trip.employee.employeeCode} — {trip.employee.fullName}
          </p>
        </div>
      ))}
    </section>
  );
}

/** One lead, with its own status chips. */
function CustomerEntry({
  customer,
  people,
  isAdmin,
}: {
  customer: CustomerRow;
  people: CustomerPerson[];
  isAdmin: boolean;
}) {
  const t = useTranslations();
  const formatDay = useDayFormatter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [state, formAction] = useActionState(updateCustomerAction, idleState);

  const meta = CUSTOMER_STATUS_META[customer.status];

  if (editing) {
    return (
      <div className="card space-y-3 p-3">
        <CustomerForm
          action={formAction}
          errors={state.status === "error" ? (state.fieldErrors ?? {}) : {}}
          formError={state.status === "error" ? state.message : undefined}
          people={people}
          customer={customer}
          submitLabel={t("common.save")}
          onCancel={() => setEditing(false)}
        >
          <input type="hidden" name="customerId" value={customer.id} />
        </CustomerForm>
      </div>
    );
  }

  return (
    <div className="card space-y-2 p-3">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: meta.tone }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{customer.name}</p>
          <div className="flex flex-wrap items-center gap-1">
            <span className="badge" style={{ background: meta.soft, color: meta.tone }}>
              {t(meta.label)}
            </span>
            {/* Uncoloured, deliberately: the five status colours are the only
                saturated things on this map and a second palette here would
                compete with them. The channel is a fact about the lead, not a
                call to action. */}
            <span
              className="badge"
              style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
            >
              {t(CUSTOMER_SOURCE_META[customer.source].label)}
            </span>
          </div>
        </div>
      </div>

      <StatusChips customer={customer} />

      <dl className="grid gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {customer.contactName && (
          <Row label={t("customers.contactName")} value={customer.contactName} />
        )}
        {customer.phone && (
          <Row
            label={t("customers.phone")}
            value={
              <a className="card-link" href={`tel:${customer.phone}`}>
                {customer.phone}
              </a>
            }
          />
        )}
        {customer.email && (
          <Row
            label={t("customers.email")}
            value={
              <a className="card-link" href={`mailto:${customer.email}`}>
                {customer.email}
              </a>
            }
          />
        )}
        {customer.lineId && (
          <Row label={t("customers.lineId")} value={customer.lineId} />
        )}
        <Row
          label={t("customers.owner")}
          value={
            customer.owner
              ? `${customer.owner.employeeCode} — ${customer.owner.fullName}`
              : t("customers.unassigned")
          }
        />
        <Row
          label={t("customers.firstContactedAt")}
          value={
            customer.firstContactedAt
              ? formatDay(customer.firstContactedAt)
              : `${formatDay(customer.createdAt)} (${t("customers.recordedOn")})`
          }
        />
        <Row
          label={t("customers.lastContactedAt")}
          value={
            customer.lastContactedAt
              ? formatDay(customer.lastContactedAt)
              : t("customers.neverContacted")
          }
        />
      </dl>

      {customer.note && (
        <p className="whitespace-pre-wrap text-xs" style={{ color: "var(--text)" }}>
          {customer.note}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setEditing(true)}
        >
          {t("customers.editCustomer")}
        </button>
        {isAdmin &&
          (confirmingDelete ? null : (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: "var(--danger)" }}
              onClick={() => setConfirmingDelete(true)}
            >
              {t("customers.deleteCustomer")}
            </button>
          ))}
      </div>

      {isAdmin && confirmingDelete && (
        <DeleteCustomerForm
          customer={customer}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

/**
 * The five chips, and the reason this feature exists: a status changed from a
 * phone, in a car park, without opening a form.
 *
 * One form with five submit buttons rather than five forms — a submit button
 * contributes its own name and value, so the whole row is a single action and a
 * single pending state.
 */
function StatusChips({ customer }: { customer: CustomerRow }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(setCustomerStatusAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="customerId" value={customer.id} />

      <fieldset className="flex flex-wrap gap-1" aria-label={t("customers.changeStatus")}>
        {CUSTOMER_STATUSES.map((status) => (
          <StatusChip
            key={status}
            status={status}
            current={customer.status === status}
          />
        ))}
      </fieldset>

      {state.status === "error" && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

function StatusChip({
  status,
  current,
}: {
  status: CustomerStatus;
  current: boolean;
}) {
  const t = useTranslations();
  const { pending } = useFormStatus();
  const meta = CUSTOMER_STATUS_META[status];

  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending || current}
      aria-pressed={current}
      className="rounded-full px-2 py-1 text-[11px] leading-none transition-opacity disabled:cursor-default"
      style={
        current
          ? { background: meta.tone, color: "var(--brand-contrast)" }
          : {
              background: "var(--surface-muted)",
              color: "var(--text-muted)",
              opacity: pending ? 0.5 : 1,
            }
      }
    >
      {t(meta.label)}
    </button>
  );
}

/** Save the dragged position. Rendered only while this pin is being moved. */
function MovePinControls({
  pin,
  movedTo,
  onCancel,
}: {
  pin: CustomerPinRow;
  movedTo: { latitude: number; longitude: number } | null;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(moveCustomerPinAction, idleState);

  // Before the marker is dragged there is nothing new to save, so the form
  // posts the point it already has — which the action recognises as a no-op.
  const at = movedTo ?? { latitude: pin.latitude, longitude: pin.longitude };

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="pinId" value={pin.id} />
      <input type="hidden" name="latitude" value={at.latitude} />
      <input type="hidden" name="longitude" value={at.longitude} />

      <Alert tone="warning">{t("customers.movePinHint")}</Alert>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("customers.coordinates")}: {at.latitude.toFixed(6)},{" "}
        {at.longitude.toFixed(6)}
      </p>

      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn btn-primary">
          {t("customers.savePosition")}
        </SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function DeletePinForm({
  pin,
  onCancel,
}: {
  pin: CustomerPinRow;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(deleteCustomerPinAction, idleState);

  return (
    <form action={formAction} className="space-y-2">
      <Alert tone="warning">{t("customers.deletePinWarning")}</Alert>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <input type="hidden" name="pinId" value={pin.id} />

      <label className="label" htmlFor={`deletePin-${pin.id}`}>
        {t("customers.reason")}
      </label>
      <textarea
        id={`deletePin-${pin.id}`}
        name="reason"
        className="input"
        rows={2}
        required
        maxLength={1000}
        placeholder={t("customers.reasonRequired")}
      />

      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn btn-danger">
          {t("tasks.deleteConfirm")}
        </SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function DeleteCustomerForm({
  customer,
  onCancel,
}: {
  customer: CustomerRow;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(deleteCustomerAction, idleState);

  return (
    <form action={formAction} className="space-y-2 border-t pt-2">
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <input type="hidden" name="customerId" value={customer.id} />

      <label className="label" htmlFor={`deleteCustomer-${customer.id}`}>
        {t("customers.reason")}
      </label>
      <textarea
        id={`deleteCustomer-${customer.id}`}
        name="reason"
        className="input"
        rows={2}
        required
        maxLength={1000}
        placeholder={t("customers.reasonRequired")}
      />

      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn btn-danger">
          {t("tasks.deleteConfirm")}
        </SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 break-words" style={{ color: "var(--text)" }}>
        {value}
      </dd>
    </div>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
