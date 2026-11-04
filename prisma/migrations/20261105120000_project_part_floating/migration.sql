-- A sub-project can sit on the project map unconnected ("floating") until
-- somebody draws its line. Existing parts are all connected, so the default
-- false keeps every one where it is. No new table: supabase-02-harden.sql
-- does not need re-running.

-- AlterTable
ALTER TABLE "ProjectPart" ADD COLUMN     "floating" BOOLEAN NOT NULL DEFAULT false;

-- Only a part with no parent can float: one inside another is connected by
-- definition. Prisma does not model CHECK constraints, so it lives here only.
ALTER TABLE "ProjectPart" ADD CONSTRAINT "ProjectPart_floating_top_level"
  CHECK (NOT "floating" OR "parentId" IS NULL);
