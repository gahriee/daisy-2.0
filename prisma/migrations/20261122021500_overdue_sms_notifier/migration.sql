-- Additive migration: Boarding house overdue SMS notifier settings (Semaphore) and daily delivery log.
-- Application-owned public-schema objects only; provider auth tables untouched.

ALTER TABLE "BusinessSettings"
  ADD COLUMN "smsOverdueEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smsApiKeyEncrypted" TEXT,
  ADD COLUMN "smsApiKeyLast4" TEXT,
  ADD COLUMN "smsSenderName" TEXT,
  ADD COLUMN "smsOverdueTemplate" TEXT;

CREATE TABLE "OverdueSmsLog" (
  "id" UUID NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "invoiceId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "notifiedDateManila" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OverdueSmsLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OverdueSmsLog_status_check" CHECK ("status" IN ('SENT', 'FAILED'))
);

CREATE UNIQUE INDEX "OverdueSmsLog_ownerUserId_invoiceId_notifiedDateManila_key"
  ON "OverdueSmsLog"("ownerUserId", "invoiceId", "notifiedDateManila");

CREATE INDEX "OverdueSmsLog_ownerUserId_notifiedDateManila_createdAt_idx"
  ON "OverdueSmsLog"("ownerUserId", "notifiedDateManila", "createdAt");

CREATE INDEX "OverdueSmsLog_ownerUserId_invoiceId_createdAt_idx"
  ON "OverdueSmsLog"("ownerUserId", "invoiceId", "createdAt");

ALTER TABLE "OverdueSmsLog"
  ADD CONSTRAINT "OverdueSmsLog_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OverdueSmsLog"
  ADD CONSTRAINT "OverdueSmsLog_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

