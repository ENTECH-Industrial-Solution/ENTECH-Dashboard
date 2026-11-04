-- A project's picture, stored in the row and served same-origin. Three
-- nullable columns on an existing table: no new table, so no RLS follow-up.
ALTER TABLE "Project" ADD COLUMN     "image" BYTEA,
ADD COLUMN     "imageType" TEXT,
ADD COLUMN     "imageUpdatedAt" TIMESTAMP(3);
