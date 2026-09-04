-- CreateEnum: how a lead reached us.
--
-- A closed set for the same reason CustomerStatus is one — marketing counts
-- these, and free text counts as forty spellings of "อีเมล". Every value but
-- FIELD_VISIT is inbound; the split lives in src/lib/customers.ts.
CREATE TYPE "CustomerSource" AS ENUM ('FIELD_VISIT', 'ENQUIRY_EMAIL', 'ENQUIRY_PHONE', 'ENQUIRY_LINE', 'ENQUIRY_WEB', 'EVENT', 'REFERRAL');

-- AlterTable: both columns are additive and safe on a live table.
--
-- `source` is NOT NULL with a default rather than nullable, because every row
-- that predates it genuinely was a field visit — a pin dropped by somebody
-- standing in the street. There is no "unknown" to model.
--
-- `firstContactedAt` is nullable on purpose: null means nobody said, which the
-- UI fills in from createdAt at display time. Backfilling createdAt into it
-- would make "the day it arrived" indistinguishable from "the day it was typed".
ALTER TABLE "Customer" ADD COLUMN "source" "CustomerSource" NOT NULL DEFAULT 'FIELD_VISIT',
ADD COLUMN "firstContactedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_source_idx" ON "Customer"("source");

-- NOTE: this migration adds no table, so prisma/supabase-02-harden.sql does not
-- need re-running. RLS and the anon/authenticated lockout already cover
-- "Customer" and follow the table, not its columns.
