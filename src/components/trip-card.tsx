"use client";

import { useActionState, useState } from "react";

import { MiniMap } from "@/components/map-embed";
import { VideoPlayer } from "@/components/video-embed";
import { tripHours } from "@/lib/calendar";
import { Alert, SubmitButton } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import { useSettings } from "@/lib/settings/client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { FieldTripRow } from "@/components/trip-form";
import {
  completeFieldTripAction,
  deleteFieldTripAction,
  startFieldTripAction,
} from "@/server/actions/field-trips";
import { idleState } from "@/server/actions/types";

export function useDayFormatter() {
  const locale = useLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
}

/** The same, with a time — what actually happened is recorded to the minute. */
export function useMomentFormatter() {
  const locale = useLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
}

/**
 * Where a trip stands. Four states, read off the three nullable timestamps in
 * the order they can only ever happen in — cancelled and completed are both
 * terminal, and a trip cannot reach one from the other.
 */
export type TripState = "SCHEDULED" | "ON_SITE" | "COMPLETED" | "CANCELLED";

export function tripState(trip: FieldTripRow): TripState {
  if (trip.cancelledAt) return "CANCELLED";
  if (trip.completedAt) return "COMPLETED";
  if (trip.startedAt) return "ON_SITE";
  return "SCHEDULED";
}

const TRIP_TONE: Record<TripState, { background: string; color: string }> = {
  SCHEDULED: { background: "var(--warning-soft)", color: "var(--warning)" },
  ON_SITE: { background: "var(--brand-soft)", color: "var(--brand)" },
  COMPLETED: { background: "var(--success-soft)", color: "var(--success)" },
  CANCELLED: { background: "var(--danger-soft)", color: "var(--danger)" },
};

const TRIP_LABEL: Record<TripState, TranslationKey> = {
  SCHEDULED: "trips.away",
  ON_SITE: "trips.onSite",
  COMPLETED: "trips.done",
  CANCELLED: "trips.cancelled",
};

export function TripStatusBadge({ state }: { state: TripState }) {
  const t = useTranslations();
  return (
    <span className="badge shrink-0" style={TRIP_TONE[state]}>
      {t(TRIP_LABEL[state])}
    </span>
  );
}

/** Inclusive day count, the way people count "how many days am I away". */
export function dayCount(startIso: string, endIso: string): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / day) + 1;
}

/**
 * Renders the location block shared by the trip card and the dashboard panel.
 *
 * The mini map sits beside the details rather than under them, and its size is
 * a container query, not a viewport one: the same block is a third-width panel
 * on the dashboard and a full-width card on the admin page, and only the block
 * itself knows which. Below 224px there is no "beside" left, so it stacks.
 */
export function TripLocation({ trip }: { trip: FieldTripRow }) {
  const t = useTranslations();
  const settings = useSettings();

  return (
    <div
      className="@container rounded-lg border-s-2 px-3 py-2 text-sm"
      style={{
        borderInlineStartColor: "var(--brand)",
        background: "var(--surface-muted)",
      }}
    >
      <div className="flex flex-col gap-2 @min-[14rem]:flex-row @min-[14rem]:items-start @min-[14rem]:gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div>
            <div className="font-medium">{trip.locationName}</div>
            {trip.address && (
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {trip.address}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={trip.mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs underline"
              style={{ color: "var(--brand)" }}
            >
              <PinIcon />
              {t("trips.openMap")}
            </a>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {trip.pinned ? t("trips.pinned") : t("trips.searchOnly")}
              {trip.latitude !== null &&
                trip.longitude !== null &&
                ` · ${trip.latitude}, ${trip.longitude}`}
            </span>
          </div>
        </div>

        {/* The link above is the part that always stays; the thumbnail is the
            part an admin can switch off, and switching it off is what stops a
            page of twelve trips creating twelve Google frames. */}
        {settings["fieldTrip.showMap"] && (
          <MiniMap
            src={trip.mapEmbedSrc}
            href={trip.mapHref}
            title={trip.locationName}
            subtitle={trip.address}
            className="aspect-[4/3] w-full @min-[14rem]:w-28 @2xs:w-32 @sm:w-40 @lg:w-52"
          />
        )}
      </div>
    </div>
  );
}

/**
 * What was reported when the trip was closed out.
 *
 * Renders for a completed trip wherever one appears, including in the lists an
 * employee cannot act on: the report is the durable half of the record, and a
 * card that showed the badge but not what was said would be worse than no card.
 */
export function TripEvidence({ trip }: { trip: FieldTripRow }) {
  const t = useTranslations();
  const settings = useSettings();
  const formatMoment = useMomentFormatter();

  if (!trip.completedAt) return null;

  return (
    <div
      className="rounded-lg border-s-2 px-3 py-2 text-sm"
      style={{
        borderInlineStartColor: "var(--success)",
        background: "var(--surface)",
      }}
    >
      <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {t("trips.completedAt")}: {formatMoment(trip.completedAt)}
      </div>

      {trip.completionNote && (
        <p className="mt-1 whitespace-pre-wrap leading-relaxed">
          {trip.completionNote}
        </p>
      )}

      {trip.proofUrl && (
        <>
          <a
            href={trip.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block break-all text-xs underline"
            style={{ color: "var(--brand)" }}
          >
            {trip.proofUrl}
          </a>
          {settings["task.showVideo"] && <VideoPlayer url={trip.proofUrl} />}
        </>
      )}
    </div>
  );
}

/**
 * Every action a trip offers, in one row.
 *
 * One row rather than two, because they are one decision: a person looking at a
 * trip is choosing what to do with it, and splitting "what the traveller does"
 * from "what the admin does" across two rows only made the card look like it
 * had two unrelated toolbars.
 *
 * The buttons are laid out on an auto-filling grid of equal tracks, so every
 * button on a card is exactly the same width whether the card carries one or
 * five, and the row reflows by the *card's* width rather than the viewport's —
 * the same block is a third-width panel on the dashboard and a half-width card
 * on /admin/tasks. `auto-fill` rather than `auto-fit` on purpose: empty tracks
 * are kept, so two buttons stay button-sized instead of stretching to half the
 * card each.
 *
 * Which buttons appear is decided on the server and passed in; the guards here
 * only mirror it. The real enforcement is in src/server/actions/field-trips.ts.
 */
export function TripActions({
  trip,
  canRun = false,
  canDelete = false,
  isAdmin = false,
  onEdit,
  cancelAction,
}: {
  trip: FieldTripRow;
  canRun?: boolean;
  canDelete?: boolean;
  isAdmin?: boolean;
  onEdit?: () => void;
  cancelAction?: (formData: FormData) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState<"none" | "finishing" | "cancelling" | "deleting">(
    "none",
  );

  const [startState, startAction] = useActionState(startFieldTripAction, idleState);
  const [completeState, completeAction] = useActionState(
    completeFieldTripAction,
    idleState,
  );

  const state = tripState(trip);
  const running = state === "SCHEDULED" || state === "ON_SITE";

  // Completing closes the lifecycle; correcting the record is a separate
  // question, and the answer is that an admin still may — see
  // updateFieldTripAction. Cancelling stays shut: a trip that was seen through
  // to the end cannot be made to look as though it never happened.
  const showStart = canRun && running && !trip.startedAt;
  const showComplete = canRun && running;
  const showEdit = isAdmin && onEdit !== undefined && state !== "CANCELLED";
  const showCancel = isAdmin && cancelAction !== undefined && running;

  const anyButton = showStart || showComplete || showEdit || showCancel || canDelete;

  if (open === "deleting") {
    return <TripDeleter trip={trip} setDeleting={() => setOpen("none")} />;
  }

  if (open === "cancelling" && cancelAction) {
    return (
      <form action={cancelAction} className="space-y-2 pt-1">
        <input type="hidden" name="fieldTripId" value={trip.id} />
        <div>
          <label className="label" htmlFor={`cancel-${trip.id}`}>
            {t("trips.cancelReason")}
          </label>
          <input
            id={`cancel-${trip.id}`}
            name="reason"
            className="input"
            required
            maxLength={500}
          />
        </div>
        <div className="flex gap-2">
          <SubmitButton className="btn btn-danger">{t("common.confirm")}</SubmitButton>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOpen("none")}
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    );
  }

  if (open === "finishing") {
    return (
      <form action={completeAction} className="space-y-3 pt-1">
        {completeState.status === "error" && (
          <Alert tone="error">{completeState.message}</Alert>
        )}

        <input type="hidden" name="fieldTripId" value={trip.id} />

        <div>
          <label className="label" htmlFor={`tripDone-${trip.id}`}>
            {t("trips.completionNote")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <textarea
            id={`tripDone-${trip.id}`}
            name="completionNote"
            className="input"
            rows={3}
            maxLength={5000}
          />
        </div>

        <div>
          <label className="label" htmlFor={`tripProof-${trip.id}`}>
            {t("trips.proofUrl")}{" "}
            <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
          </label>
          <input
            id={`tripProof-${trip.id}`}
            name="proofUrl"
            type="url"
            className="input"
            placeholder="https://"
          />
        </div>

        <div className="flex gap-2">
          <SubmitButton className="btn btn-primary">{t("common.confirm")}</SubmitButton>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOpen("none")}
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    );
  }

  if (!anyButton) return null;

  return (
    <div className="space-y-2 pt-1">
      {startState.status === "error" && (
        <Alert tone="error">{startState.message}</Alert>
      )}
      {completeState.status === "error" && (
        <Alert tone="error">{completeState.message}</Alert>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
        {showStart && (
          <form action={startAction} className="contents">
            <input type="hidden" name="fieldTripId" value={trip.id} />
            <SubmitButton className="btn btn-secondary w-full">
              {t("trips.start")}
            </SubmitButton>
          </form>
        )}

        {showComplete && (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => setOpen("finishing")}
          >
            {t("trips.complete")}
          </button>
        )}

        {showEdit && (
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={onEdit}
          >
            {t("trips.edit")}
          </button>
        )}

        {showCancel && (
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => setOpen("cancelling")}
          >
            {t("trips.cancelTrip")}
          </button>
        )}

        {canDelete && (
          <button
            type="button"
            className="btn btn-secondary w-full"
            style={{ color: "var(--danger)" }}
            onClick={() => setOpen("deleting")}
          >
            {t("trips.delete")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The delete confirmation, inline on the trip card. The same bargain the task
 * one strikes: a typed reason instead of a reflexive OK, collected here because
 * once the row is gone the audit entry is the only place it can live.
 */
function TripDeleter({
  trip,
  setDeleting,
}: {
  trip: FieldTripRow;
  setDeleting: (value: boolean) => void;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(deleteFieldTripAction, idleState);

  return (
    <form action={formAction} className="space-y-2 pt-1">
      <Alert tone="warning">{t("trips.deleteWarning")}</Alert>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      <input type="hidden" name="fieldTripId" value={trip.id} />

      <div>
        <label className="label" htmlFor={`deleteTrip-${trip.id}`}>
          {t("trips.deleteReason")}
        </label>
        <input
          id={`deleteTrip-${trip.id}`}
          name="reason"
          className="input"
          required
          maxLength={1000}
        />
      </div>

      <div className="flex gap-2">
        <SubmitButton className="btn btn-danger">
          {t("trips.deleteConfirm")}
        </SubmitButton>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDeleting(false)}
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/**
 * A trip as a card.
 *
 * The admin controls are optional so a server component can render the same
 * card read-only — that is what the off-site history sections do.
 */
export function TripCard({
  trip,
  isAdmin = false,
  canRun = false,
  canDelete = false,
  onEdit,
  cancelAction,
}: {
  trip: FieldTripRow;
  isAdmin?: boolean;
  canRun?: boolean;
  /**
   * Separate from `isAdmin`, and deliberately so: editing is offered only on a
   * trip that is still ahead, while deleting has to reach the cancelled and
   * completed ones too — those are exactly the rows that pile up.
   */
  canDelete?: boolean;
  onEdit?: () => void;
  cancelAction?: (formData: FormData) => void;
}) {
  const t = useTranslations();
  const formatDay = useDayFormatter();
  const formatMoment = useMomentFormatter();

  const days = dayCount(trip.startDate, trip.endDate);
  const hours = tripHours(trip);
  const state = tripState(trip);
  const cancelled = state === "CANCELLED";

  return (
    <article
      id={`trip-${trip.id}`}
      className="card scroll-mt-24 space-y-3 p-4"
      style={cancelled ? { opacity: 0.7 } : undefined}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3
            className="font-medium leading-snug break-words"
            style={cancelled ? { textDecoration: "line-through" } : undefined}
          >
            {trip.purpose}
          </h3>
          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {trip.employee.employeeCode} — {trip.employee.fullName}
          </div>
        </div>

        <TripStatusBadge state={state} />
      </div>

      <dl
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <div className="flex gap-1">
          <dt>{t("trips.startDate")}:</dt>
          <dd style={{ color: "var(--text)" }}>
            {formatDay(trip.startDate)}
            {trip.endDate !== trip.startDate && ` – ${formatDay(trip.endDate)}`}
            {` · ${days} ${t("trips.days")}`}
          </dd>
        </div>

        {/* Always shown, defaulted or not — "what time" is the question, and
            "nobody filled it in" is not an answer people can act on. The
            marker below says when it is the house rule rather than a choice. */}
        <div className="flex gap-1">
          <dt>{t("trips.startTime")}:</dt>
          <dd className="tabular-nums" style={{ color: "var(--text)" }}>
            {hours.start}–{hours.end}
            {hours.assumed && (
              <span style={{ color: "var(--text-muted)" }}>
                {" "}
                ({t("trips.officeHours")})
              </span>
            )}
          </dd>
        </div>

        {/* The planned days above, what happened below — never merged, for the
            same reason Task keeps dueDate apart from completedAt. */}
        {trip.startedAt && (
          <div className="flex gap-1">
            <dt>{t("trips.startedAt")}:</dt>
            <dd style={{ color: "var(--text)" }}>{formatMoment(trip.startedAt)}</dd>
          </div>
        )}
      </dl>

      <TripLocation trip={trip} />

      {trip.note && (
        <p
          className="whitespace-pre-wrap text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {trip.note}
        </p>
      )}

      {cancelled && trip.cancelledReason && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {t("trips.cancelReason")}: {trip.cancelledReason}
        </p>
      )}

      <TripEvidence trip={trip} />

      {/* The actions sit with the record they act on, not stranded under the
          footnote: what someone reads last on a finished trip is the report,
          and the buttons belong next to it. */}
      <TripActions
        trip={trip}
        canRun={canRun}
        canDelete={canDelete}
        isAdmin={isAdmin}
        onEdit={onEdit}
        cancelAction={cancelAction}
      />

      {isAdmin && state === "COMPLETED" && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("trips.completedLocked")}
        </p>
      )}

    </article>
  );
}

export function PinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
