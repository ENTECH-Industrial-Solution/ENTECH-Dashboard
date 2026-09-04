"use client";

import { useActionState, useEffect, useState } from "react";

import { CardGrid } from "@/components/card-grid";
import { Alert } from "@/components/ui";
import { TripCard } from "@/components/trip-card";
import {
  TripForm,
  type FieldTripRow,
  type TripPerson,
  type TripPinOption,
} from "@/components/trip-form";
import { useTranslations } from "@/lib/i18n/client";
import {
  cancelFieldTripAction,
  updateFieldTripAction,
} from "@/server/actions/field-trips";
import { idleState } from "@/server/actions/types";

/**
 * The off-site half of the all-tasks page: trips that are current or ahead, and
 * the ones already behind. Editing happens in place, so an admin never leaves
 * the page they were scanning.
 */
export function TripSections({
  upcoming,
  past,
  people,
  pins = [],
}: {
  upcoming: FieldTripRow[];
  past: FieldTripRow[];
  people: TripPerson[];
  pins?: TripPinOption[];
}) {
  const t = useTranslations();
  const [editingId, setEditingId] = useState<string | null>(null);

  const [updateState, updateAction] = useActionState(
    updateFieldTripAction,
    idleState,
  );
  const [cancelState, cancelAction] = useActionState(
    cancelFieldTripAction,
    idleState,
  );

  useEffect(() => {
    if (updateState.status === "success") setEditingId(null);
  }, [updateState]);

  const updateErrors =
    updateState.status === "error" ? (updateState.fieldErrors ?? {}) : {};

  /*
   * `cancellable` is the only thing that separates the two lists now.
   *
   * Editing reaches both: a trip in the past that has been closed out is
   * exactly the one whose report someone wants to fix, and the action refuses
   * a cancelled trip on its own. Cancelling does not — a trip whose days have
   * already gone by is not something to call off, and withholding the action
   * withholds the button, since TripActions reads it from the prop.
   */
  const render = (trips: FieldTripRow[], cancellable: boolean) => {
    if (trips.length === 0) {
      return (
        <div
          className="rounded-xl border border-dashed px-6 py-10 text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {t("trips.empty")}
        </div>
      );
    }

    return (
      <CardGrid>
        {trips.map((trip) =>
          editingId === trip.id ? (
            <div key={trip.id} className="card p-4 lg:col-span-2">
              <TripForm
                action={updateAction}
                errors={updateErrors}
                formError={
                  updateState.status === "error" && !updateState.fieldErrors
                    ? updateState.message
                    : undefined
                }
                people={people}
                pins={pins}
                trip={trip}
                submitLabel={t("common.save")}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <TripCard
              key={trip.id}
              trip={trip}
              /* This page is admin-only, so every trip on it is one the viewer
                 may edit, run, and delete — including a past one that was never
                 closed out, which is precisely the trip that still needs the
                 button. Cancelled and completed trips accumulate in both lists,
                 and they are the ones most worth clearing out. */
              isAdmin
              canRun
              canDelete
              onEdit={() => setEditingId(trip.id)}
              cancelAction={cancellable ? cancelAction : undefined}
            />
          ),
        )}
      </CardGrid>
    );
  };

  return (
    <>
      {updateState.status === "success" && updateState.message && (
        <Alert tone="success">{updateState.message}</Alert>
      )}
      {cancelState.status === "error" && (
        <Alert tone="error">{cancelState.message}</Alert>
      )}

      <section className="panel space-y-4">
        <header>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("trips.upcoming")}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("trips.upcomingHint")}
          </p>
        </header>
        {render(upcoming, true)}
      </section>

      <section className="panel space-y-4">
        <header>
          <h2 className="text-lg font-semibold tracking-tight">{t("trips.past")}</h2>
        </header>
        {render(past, false)}
      </section>
    </>
  );
}
