-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'REVERSED', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ProofIntentStatus" AS ENUM ('PENDING_UPLOAD', 'ATTACHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "receiptNumber" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "unallocatedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "referenceNo" TEXT,
    "notes" TEXT,
    "reversalReason" TEXT,
    "reversedPaymentId" UUID,
    "reversedAt" TIMESTAMPTZ(3),
    "createdByActorType" TEXT NOT NULL,
    "createdByActorId" TEXT NOT NULL,
    "snapshotTenantName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProofIntent" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "deviceId" UUID,
    "opId" UUID,
    "clientFileId" TEXT,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "declaredByteSize" INTEGER NOT NULL,
    "verifiedByteSize" INTEGER,
    "sha256" TEXT NOT NULL,
    "status" "ProofIntentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attachedPaymentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentProofIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProof" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "paymentId" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_ownerUserId_paidAt_createdAt_idx" ON "Payment"("ownerUserId", "paidAt", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_ownerUserId_tenantId_paidAt_idx" ON "Payment"("ownerUserId", "tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_ownerUserId_status_idx" ON "Payment"("ownerUserId", "status");

-- CreateIndex (unique official receipt numbers per Owner when assigned)
CREATE UNIQUE INDEX "Payment_ownerUserId_receiptNumber_key" ON "Payment"("ownerUserId", "receiptNumber") WHERE ("receiptNumber" IS NOT NULL);

-- CreateIndex (at most one linked reversal per original payment)
CREATE UNIQUE INDEX "Payment_reversedPaymentId_key" ON "Payment"("reversedPaymentId");
CREATE UNIQUE INDEX "Payment_ownerUserId_reversedPaymentId_key" ON "Payment"("ownerUserId", "reversedPaymentId") WHERE ("reversedPaymentId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_ownerUserId_paymentId_invoiceId_key" ON "PaymentAllocation"("ownerUserId", "paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_ownerUserId_invoiceId_idx" ON "PaymentAllocation"("ownerUserId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProofIntent_objectKey_key" ON "PaymentProofIntent"("objectKey");

-- CreateIndex (idempotent upload intent reuse per sync operation attachment)
CREATE UNIQUE INDEX "PaymentProofIntent_ownerUserId_opId_clientFileId_key" ON "PaymentProofIntent"("ownerUserId", "opId", "clientFileId") WHERE ("opId" IS NOT NULL AND "clientFileId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "PaymentProofIntent_ownerUserId_status_expiresAt_idx" ON "PaymentProofIntent"("ownerUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PaymentProofIntent_ownerUserId_opId_idx" ON "PaymentProofIntent"("ownerUserId", "opId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProof_intentId_key" ON "PaymentProof"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProof_objectKey_key" ON "PaymentProof"("objectKey");

-- CreateIndex
CREATE INDEX "PaymentProof_ownerUserId_paymentId_idx" ON "PaymentProof"("ownerUserId", "paymentId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversedPaymentId_fkey" FOREIGN KEY ("reversedPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProofIntent" ADD CONSTRAINT "PaymentProofIntent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProofIntent" ADD CONSTRAINT "PaymentProofIntent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProofIntent" ADD CONSTRAINT "PaymentProofIntent_attachedPaymentId_fkey" FOREIGN KEY ("attachedPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentProofIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_version_check" CHECK ("version" >= 1);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_direction_check" CHECK (
    (
        "status" = 'REVERSAL'
        AND "amount" < 0
        AND "reversedPaymentId" IS NOT NULL
        AND "unallocatedAmount" <= 0
        AND "unallocatedAmount" >= "amount"
    )
    OR (
        "status" IN ('POSTED', 'REVERSED')
        AND "amount" > 0
        AND "reversedPaymentId" IS NULL
        AND "unallocatedAmount" >= 0
        AND "unallocatedAmount" <= "amount"
    )
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receipt_required_check" CHECK ("status" = 'REVERSAL' OR "receiptNumber" IS NOT NULL);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversed_status_check" CHECK ("status" <> 'REVERSED' OR "reversedAt" IS NOT NULL);

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_nonzero_check" CHECK ("amount" <> 0);

ALTER TABLE "PaymentProofIntent" ADD CONSTRAINT "PaymentProofIntent_byteSize_check" CHECK ("declaredByteSize" > 0 AND ("verifiedByteSize" IS NULL OR "verifiedByteSize" > 0));
ALTER TABLE "PaymentProofIntent" ADD CONSTRAINT "PaymentProofIntent_mimeType_check" CHECK (length(btrim("mimeType")) > 0);
ALTER TABLE "PaymentProofIntent" ADD CONSTRAINT "PaymentProofIntent_sha256_check" CHECK (length(btrim("sha256")) = 64);

ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_byteSize_check" CHECK ("byteSize" > 0);
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_mimeType_check" CHECK (length(btrim("mimeType")) > 0);
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_sha256_check" CHECK (length(btrim("sha256")) = 64);
