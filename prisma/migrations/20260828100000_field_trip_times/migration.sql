-- AlterTable: what time a trip leaves and returns.
--
-- "HH:MM" in Asia/Bangkok, nullable. Null means nobody specified it and the
-- office hours in src/lib/calendar.ts apply; storing the default instead would
-- make "08:30 because that is the rule" indistinguishable from "08:30 because
-- someone chose it", and would pin the rule in every existing row.
--
-- Columns only, no new table, so prisma/supabase-02-harden.sql does not need
-- re-running.
ALTER TABLE "FieldTrip" ADD COLUMN "startTime" TEXT;
ALTER TABLE "FieldTrip" ADD COLUMN "endTime" TEXT;
