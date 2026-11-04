-- Sub-projects: named branches inside a project that tasks and trips can be
-- filed under, for the spider diagram on the project page. Additive only — a
-- new table and two nullable columns — so no existing row changes.
--
-- A new table: run prisma/supabase-02-harden.sql afterwards for RLS and the
-- API-role lockout.
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "partId" TEXT;

-- AlterTable
ALTER TABLE "FieldTrip" ADD COLUMN     "partId" TEXT;

-- CreateTable
CREATE TABLE "ProjectPart" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPart_projectId_idx" ON "ProjectPart"("projectId");

-- CreateIndex
CREATE INDEX "Task_partId_idx" ON "Task"("partId");

-- CreateIndex
CREATE INDEX "FieldTrip_partId_idx" ON "FieldTrip"("partId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ProjectPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldTrip" ADD CONSTRAINT "FieldTrip_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ProjectPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPart" ADD CONSTRAINT "ProjectPart_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

