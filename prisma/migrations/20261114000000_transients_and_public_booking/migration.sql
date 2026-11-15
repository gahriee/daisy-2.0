-- CreateEnum
CREATE TYPE "TransientReservationStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterTable BusinessSettings
ALTER TABLE "BusinessSettings" ADD COLUMN "transientPolicyNote" TEXT;

-- AlterTable Room
ALTER TABLE "Room"
  ADD COLUMN "isTransientPublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transientTitle" TEXT,
  ADD COLUMN "transientDescription" TEXT,
  ADD COLUMN "transientScope" "AllocationScope" NOT NULL DEFAULT 'WHOLE_ROOM';

-- CreateTable TransientGuest
CREATE TABLE "TransientGuest" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransientGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable TransientReservation
CREATE TABLE "TransientReservation" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "guestId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "bedId" UUID,
    "scope" "AllocationScope" NOT NULL,
    "allocationGroupId" UUID,
    "checkInDateManila" TEXT NOT NULL,
    "checkOutDateManila" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "dailyRate" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "TransientReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "checkedInAt" TIMESTAMPTZ(3),
    "checkedOutAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "cancellationReason" TEXT,
    "createdByActorType" TEXT NOT NULL,
    "createdByActorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransientReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable BookingRequest
CREATE TABLE "BookingRequest" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "roomId" UUID NOT NULL,
    "scope" "AllocationScope" NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "notes" TEXT,
    "checkInDateManila" TEXT NOT NULL,
    "checkOutDateManila" TEXT NOT NULL,
    "nights" INTEGER NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "quotedDailyRate" DECIMAL(12,2) NOT NULL,
    "quotedTotalAmount" DECIMAL(12,2) NOT NULL,
    "privacyConsentAccepted" BOOLEAN NOT NULL DEFAULT true,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "approvedGuestId" UUID,
    "approvedReservationId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- AlterTable Allocation
ALTER TABLE "Allocation" ADD COLUMN "transientReservationId" UUID;

-- AlterTable Invoice
ALTER TABLE "Invoice"
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ADD COLUMN "transientGuestId" UUID,
  ADD COLUMN "transientReservationId" UUID;

-- AlterTable Payment
ALTER TABLE "Payment"
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ADD COLUMN "transientGuestId" UUID;

-- CreateIndex
CREATE INDEX "Room_ownerUserId_isTransientPublished_archivedAt_idx" ON "Room"("ownerUserId", "isTransientPublished", "archivedAt");

-- CreateIndex
CREATE INDEX "TransientGuest_ownerUserId_archivedAt_idx" ON "TransientGuest"("ownerUserId", "archivedAt");

-- CreateIndex
CREATE INDEX "TransientReservation_ownerUserId_status_startDate_idx" ON "TransientReservation"("ownerUserId", "status", "startDate");

-- CreateIndex
CREATE INDEX "TransientReservation_ownerUserId_guestId_createdAt_idx" ON "TransientReservation"("ownerUserId", "guestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_referenceCode_key" ON "BookingRequest"("referenceCode");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_approvedReservationId_key" ON "BookingRequest"("approvedReservationId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRequest_ownerUserId_idempotencyKey_key" ON "BookingRequest"("ownerUserId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BookingRequest_ownerUserId_status_createdAt_idx" ON "BookingRequest"("ownerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Allocation_ownerUserId_transientReservationId_idx" ON "Allocation"("ownerUserId", "transientReservationId");

-- CreateIndex
CREATE INDEX "Invoice_ownerUserId_transientGuestId_createdAt_idx" ON "Invoice"("ownerUserId", "transientGuestId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_ownerUserId_transientReservationId_idx" ON "Invoice"("ownerUserId", "transientReservationId");

-- CreateIndex (at most one active non-voided invoice per transient reservation)
CREATE UNIQUE INDEX "Invoice_ownerUserId_transientReservationId_active_key"
  ON "Invoice"("ownerUserId", "transientReservationId")
  WHERE ("transientReservationId" IS NOT NULL AND "status" <> 'VOID');

-- CreateIndex
CREATE INDEX "Payment_ownerUserId_transientGuestId_paidAt_idx" ON "Payment"("ownerUserId", "transientGuestId", "paidAt");

-- AddForeignKey
ALTER TABLE "TransientGuest" ADD CONSTRAINT "TransientGuest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransientReservation" ADD CONSTRAINT "TransientReservation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransientReservation" ADD CONSTRAINT "TransientReservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "TransientGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransientReservation" ADD CONSTRAINT "TransientReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransientReservation" ADD CONSTRAINT "TransientReservation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_approvedGuestId_fkey" FOREIGN KEY ("approvedGuestId") REFERENCES "TransientGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_approvedReservationId_fkey" FOREIGN KEY ("approvedReservationId") REFERENCES "TransientReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_transientReservationId_fkey" FOREIGN KEY ("transientReservationId") REFERENCES "TransientReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transientGuestId_fkey" FOREIGN KEY ("transientGuestId") REFERENCES "TransientGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transientReservationId_fkey" FOREIGN KEY ("transientReservationId") REFERENCES "TransientReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_transientGuestId_fkey" FOREIGN KEY ("transientGuestId") REFERENCES "TransientGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check constraints
ALTER TABLE "TransientGuest"
  ADD CONSTRAINT "TransientGuest_version_check" CHECK ("version" >= 1);

ALTER TABLE "TransientReservation"
  ADD CONSTRAINT "TransientReservation_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "TransientReservation_nights_check" CHECK ("nights" >= 1),
  ADD CONSTRAINT "TransientReservation_partySize_check" CHECK ("partySize" >= 1),
  ADD CONSTRAINT "TransientReservation_rate_nonneg_check" CHECK ("dailyRate" >= 0 AND "totalAmount" >= 0),
  ADD CONSTRAINT "TransientReservation_interval_check" CHECK ("endDate" > "startDate");

ALTER TABLE "BookingRequest"
  ADD CONSTRAINT "BookingRequest_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "BookingRequest_nights_check" CHECK ("nights" >= 1),
  ADD CONSTRAINT "BookingRequest_partySize_check" CHECK ("partySize" >= 1),
  ADD CONSTRAINT "BookingRequest_quote_nonneg_check" CHECK ("quotedDailyRate" >= 0 AND "quotedTotalAmount" >= 0),
  ADD CONSTRAINT "BookingRequest_consent_check" CHECK ("privacyConsentAccepted" = true);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_payer_check"
  CHECK (("tenantId" IS NOT NULL AND "transientGuestId" IS NULL) OR ("tenantId" IS NULL AND "transientGuestId" IS NOT NULL));

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_payer_check"
  CHECK (("tenantId" IS NOT NULL AND "transientGuestId" IS NULL) OR ("tenantId" IS NULL AND "transientGuestId" IS NOT NULL));

