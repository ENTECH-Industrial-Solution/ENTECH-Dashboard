-- CreateEnum: what kind of work a task is.
--
-- A closed set so the calendar can filter on it. Off-site work is not a value:
-- it is a FieldTrip, a model of its own.
CREATE TYPE "TaskCategory" AS ENUM ('SOFTWARE', 'DOCUMENT', 'OTHER');

-- AlterTable: additive and safe on a live table.
--
-- NOT NULL with a default rather than nullable: every task predating the
-- column is OTHER until an admin says otherwise, which is what "nobody said"
-- means for a closed set. Code that predates the column keeps working, so this
-- can be applied before the release that reads it.
ALTER TABLE "Task" ADD COLUMN "category" "TaskCategory" NOT NULL DEFAULT 'OTHER';

-- NOTE: this migration adds no table, so prisma/supabase-02-harden.sql does not
-- need re-running. RLS and the anon/authenticated lockout already cover "Task"
-- and follow the table, not its columns.
