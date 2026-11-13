-- CreateEnum
CREATE TYPE "ProrationPolicy" AS ENUM ('DAILY_EXACT', 'DAILY_30', 'HALF_MONTH', 'NONE');

-- CreateEnum
CREATE TYPE "DepositPolicy" AS ENUM ('HOLD_SEPARATE', 'APPLY_ON_MOVE_OUT', 'APPLY_TO_LAST_MONTH');

-- CreateEnum
CREATE TYPE "OverpaymentPolicy" AS ENUM ('REJECT_OVERPAYMENT', 'CREDIT_NEXT_INVOICE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityAction" ADD VALUE 'LOGIN_SUCCEEDED';
ALTER TYPE "SecurityAction" ADD VALUE 'LOGIN_FAILED';
ALTER TYPE "SecurityAction" ADD VALUE 'LOGOUT';
ALTER TYPE "SecurityAction" ADD VALUE 'DEVICE_REGISTERED';
ALTER TYPE "SecurityAction" ADD VALUE 'DEVICE_REVOKED';

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "businessName" TEXT NOT NULL,
    "businessPhone" TEXT,
    "businessAddress" TEXT,
    "tin" TEXT,
    "billingDayOfMonth" INTEGER,
    "gracePeriodDays" INTEGER,
    "prorationPolicy" "ProrationPolicy",
    "depositPolicy" "DepositPolicy",
    "overpaymentPolicy" "OverpaymentPolicy",
    "invoicePrefix" TEXT,
    "receiptPrefix" TEXT,
    "checkInTimeManila" TEXT,
    "checkOutTimeManila" TEXT,
    "offlineUnlockMaxDays" INTEGER NOT NULL DEFAULT 7,
    "proofMaxBytes" INTEGER NOT NULL DEFAULT 5242880,
    "proofMaxFilesPerRecord" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncHead" (
    "ownerUserId" TEXT NOT NULL,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SyncHead_pkey" PRIMARY KEY ("ownerUserId")
);

-- CreateTable
CREATE TABLE "ChangeFeed" (
    "ownerUserId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeFeed_pkey" PRIMARY KEY ("ownerUserId","sequence")
);

-- CreateTable
CREATE TABLE "SyncOperationOutcome" (
    "ownerUserId" TEXT NOT NULL,
    "opId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "protocolVersion" INTEGER NOT NULL,
    "operationType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "resultingVersion" INTEGER,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncOperationOutcome_pkey" PRIMARY KEY ("ownerUserId","opId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "sequence" BIGINT,
    "area" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operationId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "ownerUserId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("ownerUserId","notificationKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSettings_ownerUserId_key" ON "BusinessSettings"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE INDEX "Device_ownerUserId_revokedAt_idx" ON "Device"("ownerUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "ChangeFeed_ownerUserId_entityType_entityId_idx" ON "ChangeFeed"("ownerUserId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_ownerUserId_area_createdAt_idx" ON "AuditLog"("ownerUserId", "area", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_ownerUserId_createdAt_idx" ON "AuditLog"("ownerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncHead" ADD CONSTRAINT "SyncHead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeFeed" ADD CONSTRAINT "ChangeFeed_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperationOutcome" ADD CONSTRAINT "SyncOperationOutcome_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_version_check" CHECK ("version" >= 1);
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_billingDay_check" CHECK ("billingDayOfMonth" IS NULL OR ("billingDayOfMonth" >= 1 AND "billingDayOfMonth" <= 28));
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_graceDays_check" CHECK ("gracePeriodDays" IS NULL OR ("gracePeriodDays" >= 0 AND "gracePeriodDays" <= 60));
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_offlineUnlockMaxDays_check" CHECK ("offlineUnlockMaxDays" >= 1 AND "offlineUnlockMaxDays" <= 30);
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_proofMaxBytes_check" CHECK ("proofMaxBytes" >= 102400 AND "proofMaxBytes" <= 20971520);
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_proofMaxFiles_check" CHECK ("proofMaxFilesPerRecord" >= 1 AND "proofMaxFilesPerRecord" <= 20);
ALTER TABLE "SyncHead" ADD CONSTRAINT "SyncHead_lastSequence_check" CHECK ("lastSequence" >= 0);
ALTER TABLE "ChangeFeed" ADD CONSTRAINT "ChangeFeed_operation_check" CHECK ("operation" IN ('upsert', 'tombstone'));
ALTER TABLE "SyncOperationOutcome" ADD CONSTRAINT "SyncOperationOutcome_status_check" CHECK ("status" IN ('applied', 'conflict', 'rejected', 'blocked'));
