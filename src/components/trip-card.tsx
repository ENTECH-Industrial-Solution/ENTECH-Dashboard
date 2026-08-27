"use client";

import { useState } from "react";

import { MiniMap } from "@/components/map-embed";
import { SubmitButton } from "@/components/ui";
import { useLocale, useTranslations } from "@/lib/i18n/client";
import type { FieldTripRow } from "@/components/trip-form";

export function useDayFormatter() {
  const locale = useLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
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

        <MiniMap
          src={trip.mapEmbedSrc}
          href={trip.mapHref}
          title={trip.locationName}
          subtitle={trip.address}
          className="aspect-[4/3] w-full @min-[14rem]:w-28 @2xs:w-32 @sm:w-40 @lg:w-52"
        />
      </div>
    </div>
  );
}

export function TripCard({
  trip,
  isAdmin,
  onEdit,
  cancelAction,
}: {
  trip: FieldTripRow;
  isAdmin: boolean;
  onEdit: () => void;
  cancelAction: (formData: FormData) => void;
}) {
  const t = useTranslations();
  const formatDay = useDayFormatter();
  const [cancelling, setCancelling] = useState(false);

  const days = dayCount(trip.startDate, trip.endDate);
  const cancelled = trip.cancelledAt !== null;

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

        <span
          className="badge shrink-0"
          style={
            cancelled
              ? { background: "var(--danger-soft)", color: "var(--danger)" }
              : { background: "var(--warning-soft)", color: "var(--warning)" }
          }
        >
          {cancelled ? t("trips.cancelled") : t("trips.away")}
        </span>
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

      {isAdmin && !cancelled && (
        <div className="flex flex-wrap gap-2 pt-1">
          {cancelling ? (
            <form action={cancelAction} className="w-full space-y-2">
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
                <SubmitButton className="btn btn-danger">
                  {t("common.confirm")}
                </SubmitButton>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCancelling(false)}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onEdit}>
                {t("trips.edit")}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCancelling(true)}
              >
                {t("trips.cancelTrip")}
              </button>
            </>
          )}
        </div>
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
