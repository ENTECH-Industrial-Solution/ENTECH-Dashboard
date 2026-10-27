"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Avatar } from "@/components/avatar";
import { MiniMap } from "@/components/map-embed";
import { Reveal, Swap } from "@/components/motion";
import { LinkPending } from "@/components/nav-progress";
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

/**
 * Takes the three timestamps rather than a whole `FieldTripRow`, so every view
 * of a trip can call it however much of one it happens to carry — the card has
 * the full row, the pin panel's visit list and the map's markers have four
 * fields. There were briefly two copies of this for exactly that reason, which
 * is one more than a rule about what state something is in may have.
 */
export function tripState(trip: {
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}): TripState {
  if (trip.cancelledAt) return "CANCELLED";
  if (trip.completedAt) return "COMPLETED";
  if (trip.startedAt) return "ON_SITE";
  return "SCHEDULED";
}

export const TRIP_TONE: Record<TripState, { background: string; color: string }> = {
  SCHEDULED: { background: "var(--warning-soft)", color: "var(--warning)" },
  ON_SITE: { background: "var(--brand-soft)", color: "var(--brand)" },
  COMPLETED: { background: "var(--success-soft)", color: "var(--success)" },
  CANCELLED: { background: "var(--danger-soft)", color: "var(--danger)" },
};

export const TRIP_LABEL: Record<TripState, TranslationKey> = {
  SCHEDULED: "trips.away",
  ON_SITE: "trips.onSite",
  COMPLETED: "trips.done",
  CANCELLED: "trips.cancelled",
};

export function TripStatusBadge({ state }: { state: TripState }) {
  const t = useTranslations();
  return (
    <Swap id={state} className="shrink-0">
      <span className="badge" style={TRIP_TONE[state]}>
        {t(TRIP_LABEL[state])}
      </span>
    </Swap>
  );
}

/** Inclusive day count, the way people count "how many days am I away". */
export function dayCount(startIso: string, endIso: string): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / day) + 1;
}

/**
 * The location as the head of a trip, on the dashboard box and the card alike:
 * the map across the top, the place named on it.
 *
 * It replaced a block that put the map beside the address, which at a phone's
 * width left both halves cramped. Here the map is the header and the name rides on
 * it, top-start, because Google prints its attribution along the foot and the
 * expand cue sits top-end. The label ignores the pointer, so the whole picture
 * stays one button that opens the full map — whose dialog carries the Google
 * link, which is why this repeats only the link to our own customer map.
 */
export function TripMapHeader({ trip }: { trip: FieldTripRow }) {
  const t = useTranslations();
  const settings = useSettings();

  const customerLink = trip.pin && (
    <Link
      href={`/customers?pin=${trip.pin.id}`}
      className="mt-1.5 inline-flex items-center gap-1 text-xs underline"
      style={{ color: "var(--brand)" }}
    >
      <PinIcon />
      {t("trips.openCustomerPin")}
      <LinkPending />
    </Link>
  );

  // Switched off, the map gives way to the plain line it would have carried.
  if (!settings["fieldTrip.showMap"]) {
    return (
      <div className="flex flex-col items-start text-sm">
        <a
          href={trip.mapHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-start gap-1 font-medium underline"
          style={{ color: "var(--brand)" }}
        >
          <PinIcon />
          {trip.locationName}
        </a>
        {customerLink}
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <MiniMap
          src={trip.mapEmbedSrc}
          href={trip.mapHref}
          title={trip.locationName}
          subtitle={trip.address}
          className="h-28 w-full"
        />
        <span
          className="pointer-events-none absolute start-2 top-2 max-w-[calc(100%-3rem)] truncate rounded-md px-2 py-1 text-xs font-medium shadow-sm"
          style={{ background: "var(--surface)", color: "var(--text)" }}
        >
          {trip.locationName}
        </span>
      </div>
      {customerLink}
    </div>
  );
}

/**
 * The day as a block beside what the trip is for, shared by the dashboard box
 * and the card so the two read the same.
 *
 * "Which day" reads before anything else; the line under the purpose carries
 * only what the block cannot — the last day of a longer trip, the hours, and
 * when it actually started. The text column stretches to the block's height
 * and centres in it, so the two read as one row however long the purpose is.
 */
export function TripHeadline({
  trip,
  aside,
}: {
  trip: FieldTripRow;
  /** Drawn top-end, beside the purpose — the card's status badge. */
  aside?: React.ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const formatDay = useDayFormatter();
  const formatMoment = useMomentFormatter();

  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      ...options,
      timeZone: "Asia/Bangkok",
    }).format(new Date(trip.startDate));
  const days = dayCount(trip.startDate, trip.endDate);
  const hours = tripHours(trip);
  const cancelled = tripState(trip) === "CANCELLED";

  return (
    <div className="flex items-stretch gap-3">
      <div
        className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg py-1.5 leading-tight"
        style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
      >
        <span className="text-lg font-semibold">{part({ day: "numeric" })}</span>
        <span className="text-xs">{part({ month: "short" })}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-start gap-2">
          <div
            className="min-w-0 flex-1 text-sm font-medium leading-snug break-words"
            style={cancelled ? { textDecoration: "line-through" } : undefined}
          >
            {trip.purpose}
          </div>
          {aside}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {days > 1 &&
            `${t("trips.untilDate")} ${formatDay(trip.endDate)} · ${days} ${t("trips.days")} · `}
          <span className="tabular-nums">
            {hours.start}–{hours.end}
          </span>
          {/* Always shown, defaulted or not — "what time" is the question, and
              "nobody filled it in" is not an answer people can act on. This
              says when it is the house rule rather than a choice. */}
          {hours.assumed && ` (${t("trips.officeHours")})`}
          {/* The planned days above, what happened here — never merged, for
              the same reason Task keeps dueDate apart from completedAt. */}
          {trip.startedAt &&
            ` · ${t("trips.startedAt")} ${formatMoment(trip.startedAt)}`}
        </div>
      </div>
    </div>
  );
}

/** Beyond this the faces stop and a "+n" stands for the rest. */
const MAX_FACES = 4;

/**
 * Who is on a trip: their faces stacked, every name beside them, and a head
 * count. Shared by the dashboard box and the card.
 *
 * The faces overlap so four take the room of two and a half; each carries a
 * ring in `--face-ring` — set by the box to its own background — so the
 * overlap reads as a stack rather than a smear. The names are the full list,
 * wrapping rather than truncating: this is the line that tells four people
 * they are on the same job.
 */
export function TripPeople({ travellers }: { travellers: FieldTripRow["travellers"] }) {
  const t = useTranslations();
  const faces = travellers.slice(0, MAX_FACES);
  const more = travellers.length - faces.length;
  const ring = { "--tw-ring-color": "var(--face-ring, var(--surface))" } as React.CSSProperties;

  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 -space-x-2">
        {faces.map((person) => (
          <span
            key={person.id}
            className="rounded-full ring-2"
            style={ring}
            title={`${person.employeeCode} — ${person.fullName}`}
          >
            <Avatar fullName={person.fullName} />
          </span>
        ))}
        {more > 0 && (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2"
            style={{ ...ring, background: "var(--surface-muted)", color: "var(--text-muted)" }}
          >
            +{more}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-snug break-words">
          {travellers.map((person) => person.fullName).join(", ")}
        </div>
        <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
          {travellers.length > 1
            ? `${travellers.length} ${t("trips.peopleCount")}`
            : travellers[0]?.employeeCode}
        </div>
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
      <Reveal>
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
      </Reveal>
    );
  }

  if (open === "finishing") {
    return (
      <Reveal>
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
      </Reveal>
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
    <Reveal>
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
    </Reveal>
  );
}

/**
 * A trip as a card.
 *
 * Laid out as the dashboard's off-site box is — map, day and purpose, report,
 * then who is going under a dashed line — from the same parts, so a trip looks
 * the same on /admin/tasks as it does on the dashboard.
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

  const state = tripState(trip);
  const cancelled = state === "CANCELLED";

  return (
    <article
      id={`trip-${trip.id}`}
      className="card flex scroll-mt-24 flex-col gap-3 p-4"
      style={cancelled ? { opacity: 0.7 } : undefined}
    >
      <TripMapHeader trip={trip} />

      <TripHeadline trip={trip} aside={<TripStatusBadge state={state} />} />

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

      {/* The dashed line is the ticket's tear: what the trip is above it, who
          is on it below. */}
      <div className="border-t border-dashed pt-3" style={{ borderColor: "var(--border)" }}>
        <TripPeople travellers={trip.travellers} />
      </div>

      {/* The actions sit with the record they act on, not stranded under the
          footnote: what someone reads last on a finished trip is the report,
          and the buttons belong next to it. `mt-auto` is what lines the row
          up with the card beside it (see the task card). */}
      <div className="mt-auto">
        <TripActions
          trip={trip}
          canRun={canRun}
          canDelete={canDelete}
          isAdmin={isAdmin}
          onEdit={onEdit}
          cancelAction={cancelAction}
        />
      </div>

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
