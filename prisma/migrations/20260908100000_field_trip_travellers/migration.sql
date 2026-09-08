-- A field trip carries any number of travellers, not one.
--
-- The three steps below are ordered and the order is the whole migration: the
-- backfill has to read "FieldTrip"."employeeId" before the last step drops it.
-- Splitting them across two migrations would leave a deploy window where the
-- trips have no travellers at all.

-- CreateTable
CREATE TABLE "FieldTripTraveller" (
    "fieldTripId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "FieldTripTraveller_pkey" PRIMARY KEY ("fieldTripId","employeeId")
);

-- CreateIndex: "which trips is this person on" — the per-person dashboard, the
-- workload aggregate and travellerScopeSql all enter from this side.
CREATE INDEX "FieldTripTraveller_employeeId_idx" ON "FieldTripTraveller"("employeeId");

-- AddForeignKey: Cascade towards the trip, which owns the row.
ALTER TABLE "FieldTripTraveller" ADD CONSTRAINT "FieldTripTraveller_fieldTripId_fkey" FOREIGN KEY ("fieldTripId") REFERENCES "FieldTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Restrict towards the employee, so a trip somebody went on
-- keeps their account undeletable exactly as an assigned task does.
ALTER TABLE "FieldTripTraveller" ADD CONSTRAINT "FieldTripTraveller_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing trip had exactly one traveller, and becomes a trip
-- with a list of one. No trip loses its person.
INSERT INTO "FieldTripTraveller" ("fieldTripId", "employeeId")
SELECT "id", "employeeId" FROM "FieldTrip";

-- DropIndex / DropForeignKey / DropColumn. Postgres would take the first two
-- with the column anyway; naming them says the removal was intended.
DROP INDEX "FieldTrip_employeeId_startDate_idx";
ALTER TABLE "FieldTrip" DROP CONSTRAINT "FieldTrip_employeeId_fkey";
ALTER TABLE "FieldTrip" DROP COLUMN "employeeId";
