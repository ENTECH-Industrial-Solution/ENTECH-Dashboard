-- A task carries any number of assignees, not one — on the terms a field trip
-- carries its travellers (20260908100000_field_trip_travellers).
--
-- The three steps below are ordered and the order is the whole migration: the
-- backfill has to read "Task"."assigneeId" before the last step drops it.
-- Splitting them across two migrations would leave a deploy window where the
-- tasks have nobody on them.

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","employeeId")
);

-- CreateIndex: "which tasks is this person on" — the per-person dashboard, the
-- workload aggregate and assigneeScopeSql all enter from this side.
CREATE INDEX "TaskAssignee_employeeId_idx" ON "TaskAssignee"("employeeId");

-- AddForeignKey: Cascade towards the task, which owns the row.
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Restrict towards the employee, so a task somebody was on
-- keeps their account undeletable exactly as it did through the column.
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing task had exactly one assignee, and becomes a task
-- with a list of one. No task loses its person.
INSERT INTO "TaskAssignee" ("taskId", "employeeId")
SELECT "id", "assigneeId" FROM "Task";

-- DropIndex / DropForeignKey / DropColumn. Postgres would take the first two
-- with the column anyway; naming them says the removal was intended.
DROP INDEX "Task_assigneeId_status_idx";
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";
ALTER TABLE "Task" DROP COLUMN "assigneeId";
