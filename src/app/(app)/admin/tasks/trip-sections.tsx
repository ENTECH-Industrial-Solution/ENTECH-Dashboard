"use client";

import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui";
import { TripCard } from "@/components/trip-card";
import { TripForm, type FieldTripRow, type TripPerson } from "@/components/trip-form";
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
}: {
  upcoming: FieldTripRow[];
  past: FieldTripRow[];
  people: TripPerson[];
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

  const render = (trips: FieldTripRow[], editable: boolean) => {
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
      <div className="grid gap-3 lg:grid-cols-2">
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
                trip={trip}
                submitLabel={t("common.save")}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <TripCard
              key={trip.id}
              trip={trip}
              isAdmin={editable}
              onEdit={() => setEditingId(trip.id)}
              cancelAction={cancelAction}
            />
          ),
        )}
      </div>
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
