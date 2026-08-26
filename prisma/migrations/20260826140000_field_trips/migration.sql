-- CreateTable: off-site trips, linked to the calendar and to Google Maps
CREATE TABLE "FieldTrip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mapUrl" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldTrip_employeeId_startDate_idx" ON "FieldTrip"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "FieldTrip_startDate_endDate_idx" ON "FieldTrip"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "FieldTrip" ADD CONSTRAINT "FieldTrip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldTrip" ADD CONSTRAINT "FieldTrip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
