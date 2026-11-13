-- Enable btree_gist for exclusion constraints combining UUID equality and tstzrange overlap
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('SINGLE', 'DOUBLE', 'DORMITORY', 'SUITE', 'DELUXE');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('TENANT_ASSIGNMENT', 'TRANSIENT_RESERVATION', 'MAINTENANCE_HOLD');

-- CreateEnum
CREATE TYPE "AllocationScope" AS ENUM ('BED', 'WHOLE_ROOM');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenantAssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "number" TEXT NOT NULL,
    "floor" TEXT,
    "type" "RoomType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "baseMonthlyRate" DECIMAL(12,2) NOT NULL,
    "transientDailyRate" DECIMAL(12,2),
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "roomId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "monthlyRate" DECIMAL(12,2) NOT NULL,
    "dailyRate" DECIMAL(12,2),
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "roomId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "allocationGroupId" UUID,
    "scope" "AllocationScope" NOT NULL DEFAULT 'BED',
    "type" "AllocationType" NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emergencyContact" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAssignment" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "allocationId" UUID NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3) NOT NULL,
    "actualMoveOutDate" TIMESTAMPTZ(3),
    "monthlyRate" DECIMAL(12,2) NOT NULL,
    "securityDeposit" DECIMAL(12,2) NOT NULL,
    "status" "TenantAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TenantAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Room_ownerUserId_archivedAt_idx" ON "Room"("ownerUserId", "archivedAt");

-- CreateIndex (active room numbers must be unique case-insensitively per Owner)
CREATE UNIQUE INDEX "Room_ownerUserId_number_active_key" ON "Room"("ownerUserId", lower("number")) WHERE ("archivedAt" IS NULL);

-- CreateIndex
CREATE INDEX "Bed_ownerUserId_roomId_archivedAt_idx" ON "Bed"("ownerUserId", "roomId", "archivedAt");

-- CreateIndex
CREATE INDEX "Bed_ownerUserId_status_idx" ON "Bed"("ownerUserId", "status");

-- CreateIndex (active bed numbers must be unique case-insensitively per Room)
CREATE UNIQUE INDEX "Bed_roomId_number_active_key" ON "Bed"("roomId", lower("number")) WHERE ("archivedAt" IS NULL);

-- CreateIndex
CREATE INDEX "Allocation_ownerUserId_bedId_status_idx" ON "Allocation"("ownerUserId", "bedId", "status");

-- CreateIndex
CREATE INDEX "Allocation_ownerUserId_roomId_status_idx" ON "Allocation"("ownerUserId", "roomId", "status");

-- CreateIndex
CREATE INDEX "Allocation_ownerUserId_type_status_idx" ON "Allocation"("ownerUserId", "type", "status");

-- CreateIndex
CREATE INDEX "Tenant_ownerUserId_archivedAt_idx" ON "Tenant"("ownerUserId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAssignment_allocationId_key" ON "TenantAssignment"("allocationId");

-- CreateIndex
CREATE INDEX "TenantAssignment_ownerUserId_status_endDate_idx" ON "TenantAssignment"("ownerUserId", "status", "endDate");

-- CreateIndex
CREATE INDEX "TenantAssignment_ownerUserId_bedId_status_idx" ON "TenantAssignment"("ownerUserId", "bedId", "status");

-- CreateIndex (at most one active assignment per tenant per Owner)
CREATE UNIQUE INDEX "TenantAssignment_one_active_per_tenant_key" ON "TenantAssignment"("ownerUserId", "tenantId") WHERE ("status" = 'ACTIVE');

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "Room" ADD CONSTRAINT "Room_version_check" CHECK ("version" >= 1);
ALTER TABLE "Room" ADD CONSTRAINT "Room_number_check" CHECK (length(btrim("number")) > 0);
ALTER TABLE "Room" ADD CONSTRAINT "Room_capacity_check" CHECK ("capacity" >= 1 AND "capacity" <= 50);
ALTER TABLE "Room" ADD CONSTRAINT "Room_baseMonthlyRate_check" CHECK ("baseMonthlyRate" >= 0);
ALTER TABLE "Room" ADD CONSTRAINT "Room_transientDailyRate_check" CHECK ("transientDailyRate" IS NULL OR "transientDailyRate" >= 0);

ALTER TABLE "Bed" ADD CONSTRAINT "Bed_version_check" CHECK ("version" >= 1);
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_number_check" CHECK (length(btrim("number")) > 0);
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_monthlyRate_check" CHECK ("monthlyRate" >= 0);
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_dailyRate_check" CHECK ("dailyRate" IS NULL OR "dailyRate" >= 0);

ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_version_check" CHECK ("version" >= 1);
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_interval_check" CHECK ("endDate" > "startDate");

-- ExclusionConstraint: a bed has at most one active allocation for any overlapping instant in [startDate, endDate)
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_active_bed_interval_excl" EXCLUDE USING gist ("bedId" WITH =, tstzrange("startDate", "endDate", '[)') WITH &&) WHERE ("status" = 'ACTIVE');

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_version_check" CHECK ("version" >= 1);
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_fullName_check" CHECK (length(btrim("fullName")) > 0);

ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_version_check" CHECK ("version" >= 1);
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_interval_check" CHECK ("endDate" > "startDate");
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_monthlyRate_check" CHECK ("monthlyRate" >= 0);
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_securityDeposit_check" CHECK ("securityDeposit" >= 0);
ALTER TABLE "TenantAssignment" ADD CONSTRAINT "TenantAssignment_actualMoveOut_check" CHECK ("actualMoveOutDate" IS NULL OR "actualMoveOutDate" > "startDate");

