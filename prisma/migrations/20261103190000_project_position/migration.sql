-- AlterTable: an admin-set order for projects, smallest first.
--
-- Additive, with a default, so it is safe on the live table. Existing
-- projects are numbered in the order they were created, which is the order a
-- new project now joins at the end of.
ALTER TABLE "Project" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "Project" p
SET "position" = o.rn
FROM (
  SELECT "id", row_number() OVER (ORDER BY "createdAt") - 1 AS rn
  FROM "Project"
) o
WHERE p."id" = o."id";
