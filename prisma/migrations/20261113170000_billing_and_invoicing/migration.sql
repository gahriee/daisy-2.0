-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceItemType" AS ENUM ('RENT', 'DEPOSIT', 'UTILITY', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceAdjustmentType" AS ENUM ('CREDIT', 'CHARGE');

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "ownerUserId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "lastNumber" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("ownerUserId","docType")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "assignmentId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumber" TEXT,
    "billingPeriod" TEXT,
    "periodStartDate" TIMESTAMPTZ(3) NOT NULL,
    "periodEndDate" TIMESTAMPTZ(3) NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalAmount" DECIMAL(12,2) NOT NULL,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "snapshotTenantName" TEXT,
    "snapshotRoomNumber" TEXT,
    "snapshotBedNumber" TEXT,
    "snapshotMonthlyRate" DECIMAL(12,2),
    "snapshotProrationPolicy" "ProrationPolicy",
    "snapshotDepositPolicy" "DepositPolicy",
    "notes" TEXT,
    "voidReason" TEXT,
    "issuedAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "invoiceId" UUID NOT NULL,
    "itemType" "InvoiceItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAdjustment" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "invoiceId" UUID NOT NULL,
    "type" "InvoiceAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByActorType" TEXT NOT NULL,
    "createdByActorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_ownerUserId_status_dueDate_idx" ON "Invoice"("ownerUserId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_ownerUserId_tenantId_createdAt_idx" ON "Invoice"("ownerUserId", "tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_ownerUserId_billingPeriod_idx" ON "Invoice"("ownerUserId", "billingPeriod");

-- CreateIndex (unique official invoice numbers per Owner when assigned)
CREATE UNIQUE INDEX "Invoice_ownerUserId_invoiceNumber_key" ON "Invoice"("ownerUserId", "invoiceNumber") WHERE ("invoiceNumber" IS NOT NULL);

-- CreateIndex (idempotent billing generation per tenant and billing period for non-voided invoices)
CREATE UNIQUE INDEX "Invoice_ownerUserId_tenantId_billingPeriod_active_key" ON "Invoice"("ownerUserId", "tenantId", "billingPeriod") WHERE ("billingPeriod" IS NOT NULL AND "status" <> 'VOID');

-- CreateIndex
CREATE INDEX "InvoiceItem_ownerUserId_invoiceId_sortOrder_idx" ON "InvoiceItem"("ownerUserId", "invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_ownerUserId_invoiceId_createdAt_idx" ON "InvoiceAdjustment"("ownerUserId", "invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TenantAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_lastNumber_check" CHECK ("lastNumber" >= 0);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_version_check" CHECK ("version" >= 1);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subtotalAmount_check" CHECK ("subtotalAmount" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_totalAmount_check" CHECK ("totalAmount" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidAmount_check" CHECK ("paidAmount" >= 0 AND "paidAmount" <= "totalAmount");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_period_order_check" CHECK ("periodEndDate" > "periodStartDate");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issued_number_check" CHECK ("status" = 'DRAFT' OR "invoiceNumber" IS NOT NULL);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_void_timestamp_check" CHECK ("status" <> 'VOID' OR "voidedAt" IS NOT NULL);

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_description_check" CHECK (length(btrim("description")) > 0);
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_unitAmount_check" CHECK ("unitAmount" >= 0);
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_lineTotal_check" CHECK ("lineTotal" >= 0);

ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_reason_check" CHECK (length(btrim("reason")) > 0);

