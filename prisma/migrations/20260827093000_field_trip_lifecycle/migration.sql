-- AlterTable: a trip is now run, not only scheduled.
--
-- startedAt/completedAt record what actually happened, against the planned
-- startDate/endDate that were already there. completionNote and proofUrl are
-- the report filed when the trip is closed out; both are optional.
--
-- Columns only, no new table, so prisma/supabase-02-harden.sql does not need
-- re-running — the RLS and role lockout on "FieldTrip" already stand.
ALTER TABLE "FieldTrip" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "FieldTrip" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "FieldTrip" ADD COLUMN "completionNote" TEXT;
ALTER TABLE "FieldTrip" ADD COLUMN "proofUrl" TEXT;
