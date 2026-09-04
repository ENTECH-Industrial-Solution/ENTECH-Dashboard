-- AlterTable: which pin on the customer map a trip goes to, when it goes to one.
--
-- Nullable and always will be — plenty of trips go somewhere that is not a
-- prospect. Additive and safe on a live table.
ALTER TABLE "FieldTrip" ADD COLUMN "pinId" TEXT;

-- CreateIndex
CREATE INDEX "FieldTrip_pinId_idx" ON "FieldTrip"("pinId");

-- AddForeignKey: SET NULL, and both of the alternatives would be wrong here.
-- A trip is never deleted, so CASCADE would let a pin delete history; RESTRICT
-- would make a pin undeletable because somebody once drove there. The trip
-- keeps its own locationName and coordinates either way, so unlinking costs it
-- nothing but the cross-reference.
ALTER TABLE "FieldTrip" ADD CONSTRAINT "FieldTrip_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "CustomerPin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: this migration adds no table, so prisma/supabase-02-harden.sql does not
-- need re-running. RLS and the anon/authenticated lockout already cover
-- "FieldTrip" and follow the table, not its columns.
