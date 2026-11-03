-- A person's profile picture, in its own table so the employee row (read on
-- every request by the session lookup) never carries image bytes.
--
-- A new table: run prisma/supabase-02-harden.sql afterwards for RLS and the
-- API-role lockout.
-- CreateTable
CREATE TABLE "EmployeePhoto" (
    "employeeId" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "imageType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePhoto_pkey" PRIMARY KEY ("employeeId")
);

-- AddForeignKey
ALTER TABLE "EmployeePhoto" ADD CONSTRAINT "EmployeePhoto_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

