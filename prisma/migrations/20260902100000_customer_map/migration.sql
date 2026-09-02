-- CreateEnum: how warm a lead is. Ordered warmest to coldest — the pin colour
-- for a stack is derived from this order in src/lib/customers.ts.
CREATE TYPE "CustomerStatus" AS ENUM ('INTERESTED', 'CONSIDERING', 'NOT_INTERESTED', 'WON', 'UNREACHABLE');

-- CreateTable: a point on the map. Coordinates are NOT NULL — the row exists
-- because somebody clicked a spot, so there is no "known only by name" case.
CREATE TABLE "CustomerPin" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable: one prospect at a pin. Several may share a point — a floor of
-- an office block is one place and many companies.
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'CONSIDERING',
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "lineId" TEXT,
    "note" TEXT,
    "ownerId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPin_latitude_longitude_idx" ON "CustomerPin"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Customer_pinId_idx" ON "Customer"("pinId");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_ownerId_idx" ON "Customer"("ownerId");

-- AddForeignKey: RESTRICT, like Task.createdById. deleteEmployeeAction counts
-- these so the refusal names what to move rather than surfacing a raw FK error.
ALTER TABLE "CustomerPin" ADD CONSTRAINT "CustomerPin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: CASCADE, and the only parent-deletes-children edge in this
-- schema. A customer with no point cannot be drawn; deleteCustomerPinAction
-- snapshots every one of them into its audit row first, in the same transaction.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "CustomerPin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SET NULL. An unclaimed lead is a real state, and a departing
-- account should not be pinned in place by one.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOTE: this migration adds two tables, so prisma/supabase-02-harden.sql MUST
-- be re-run in the Supabase SQL Editor afterwards to re-assert RLS and the
-- anon/authenticated lockout on them.
