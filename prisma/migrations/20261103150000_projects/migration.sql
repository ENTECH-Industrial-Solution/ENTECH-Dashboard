-- CreateTable: a job bigger than one task, grouping tasks and trips.
--
-- No status column beyond closedAt: progress is derived from the work in it.
-- No delete path exists in the application; closing is how a project ends.
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");
CREATE INDEX "Project_closedAt_idx" ON "Project"("closedAt");

-- Restrict: an account that created a project cannot be deleted, and
-- deleteEmployeeAction counts it first so the refusal is a sentence.
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: additive and nullable, safe on live tables. Every existing task
-- and trip is in no project, which is what they honestly are.
ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;
ALTER TABLE "FieldTrip" ADD COLUMN "projectId" TEXT;

CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "FieldTrip_projectId_idx" ON "FieldTrip"("projectId");

-- SetNull: a task or trip is history in its own right and never goes because
-- its grouping did (the rule FieldTrip.pinId already follows).
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldTrip" ADD CONSTRAINT "FieldTrip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NOTE: this migration ADDS A TABLE. After `npm run db:deploy`, re-run
-- prisma/supabase-02-harden.sql in the Supabase SQL Editor so "Project" gets
-- deny-all RLS and the anon/authenticated lockout like every other table.
