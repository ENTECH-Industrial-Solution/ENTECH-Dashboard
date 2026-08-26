-- AlterTable: planned start date, alongside the existing planned end (dueDate)
ALTER TABLE "Task" ADD COLUMN "startDate" TIMESTAMP(3);

-- CreateTable: admin-controlled UI switches, key-value so new toggles need no migration
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
