-- Sub-projects inside sub-projects: a nullable self-reference on ProjectPart.
-- Purely additive: one nullable column, its index and its foreign key, so every
-- existing part stays directly under its project. No new table, so
-- supabase-02-harden.sql has nothing new to cover.

-- AlterTable
ALTER TABLE "ProjectPart" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectPart_parentId_idx" ON "ProjectPart"("parentId");

-- AddForeignKey
ALTER TABLE "ProjectPart" ADD CONSTRAINT "ProjectPart_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
