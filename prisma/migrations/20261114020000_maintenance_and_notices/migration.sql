-- CreateEnum
CREATE TYPE "MaintenanceCategory" AS ENUM (
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'STRUCTURAL',
  'PEST_CONTROL',
  'CLEANING',
  'SECURITY',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
);

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'RESOLVED',
  'CANCELLED'
);

-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM (
  'EVERYONE',
  'ROOM',
  'TENANT'
);

-- AlterTable
ALTER TABLE "Allocation"
  ADD COLUMN "maintenanceRequestId" UUID;

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
  "id" UUID NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "roomId" UUID NOT NULL,
  "bedId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "MaintenanceCategory" NOT NULL,
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "archivedAt" TIMESTAMPTZ(3),
  "createdByActorType" TEXT NOT NULL,
  "createdByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceRequest_title_nonempty_check" CHECK (char_length(btrim("title")) >= 2),
  CONSTRAINT "MaintenanceRequest_status_timestamps_check" CHECK (
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "resolvedAt" IS NULL) OR
    ("status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS') AND "resolvedAt" IS NULL AND "cancelledAt" IS NULL)
  )
);

-- CreateTable
CREATE TABLE "MaintenanceUpdate" (
  "id" UUID NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "maintenanceRequestId" UUID NOT NULL,
  "statusFrom" "MaintenanceStatus",
  "statusTo" "MaintenanceStatus",
  "note" TEXT NOT NULL,
  "createdByActorType" TEXT NOT NULL,
  "createdByActorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MaintenanceUpdate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceUpdate_note_or_transition_check" CHECK (
    char_length(btrim("note")) >= 1 OR "statusTo" IS NOT NULL
  )
);

-- CreateTable
CREATE TABLE "MaintenanceAttachmentIntent" (
  "id" UUID NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "deviceId" UUID,
  "opId" UUID,
  "clientFileId" TEXT,
  "maintenanceRequestId" UUID,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "status" "ProofIntentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "uploadedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "MaintenanceAttachmentIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceAttachmentIntent_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 26214400),
  CONSTRAINT "MaintenanceAttachmentIntent_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MaintenanceAttachmentIntent_mime_check" CHECK (
    "mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')
  )
);

-- CreateTable
CREATE TABLE "MaintenanceAttachment" (
  "id" UUID NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "maintenanceRequestId" UUID NOT NULL,
  "maintenanceUpdateId" UUID,
  "intentId" UUID NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MaintenanceAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceAttachment_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 26214400),
  CONSTRAINT "MaintenanceAttachment_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MaintenanceAttachment_mime_check" CHECK (
    "mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')
  )
);

-- CreateTable
CREATE TABLE "Notice" (
  "id" UUID NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "audience" "NoticeAudience" NOT NULL,
  "roomId" UUID,
  "tenantId" UUID,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "startDateManila" TEXT NOT NULL,
  "endDateManila" TEXT NOT NULL,
  "startDate" TIMESTAMPTZ(3) NOT NULL,
  "endDate" TIMESTAMPTZ(3) NOT NULL,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "Notice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notice_title_nonempty_check" CHECK (char_length(btrim("title")) >= 2),
  CONSTRAINT "Notice_body_nonempty_check" CHECK (char_length(btrim("body")) >= 1),
  CONSTRAINT "Notice_audience_target_check" CHECK (
    ("audience" = 'EVERYONE' AND "roomId" IS NULL AND "tenantId" IS NULL) OR
    ("audience" = 'ROOM' AND "roomId" IS NOT NULL AND "tenantId" IS NULL) OR
    ("audience" = 'TENANT' AND "tenantId" IS NOT NULL AND "roomId" IS NULL)
  ),
  CONSTRAINT "Notice_dates_check" CHECK (
    "endDate" > "startDate" AND "endDateManila" >= "startDateManila"
  )
);

-- CreateIndex
CREATE INDEX "Allocation_ownerUserId_maintenanceRequestId_idx" ON "Allocation"("ownerUserId", "maintenanceRequestId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_ownerUserId_status_priority_createdAt_idx" ON "MaintenanceRequest"("ownerUserId", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_ownerUserId_roomId_archivedAt_idx" ON "MaintenanceRequest"("ownerUserId", "roomId", "archivedAt");

-- CreateIndex
CREATE INDEX "MaintenanceUpdate_ownerUserId_maintenanceRequestId_createdAt_idx" ON "MaintenanceUpdate"("ownerUserId", "maintenanceRequestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceAttachmentIntent_objectKey_key" ON "MaintenanceAttachmentIntent"("objectKey");

-- CreateIndex
CREATE INDEX "MaintenanceAttachmentIntent_ownerUserId_status_expiresAt_idx" ON "MaintenanceAttachmentIntent"("ownerUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "MaintenanceAttachmentIntent_ownerUserId_opId_idx" ON "MaintenanceAttachmentIntent"("ownerUserId", "opId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceAttachmentIntent_ownerUserId_opId_clientFileId_key"
  ON "MaintenanceAttachmentIntent"("ownerUserId", "opId", "clientFileId")
  WHERE "opId" IS NOT NULL AND "clientFileId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceAttachment_intentId_key" ON "MaintenanceAttachment"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceAttachment_objectKey_key" ON "MaintenanceAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "MaintenanceAttachment_ownerUserId_maintenanceRequestId_createdAt_idx" ON "MaintenanceAttachment"("ownerUserId", "maintenanceRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "Notice_ownerUserId_archivedAt_endDate_idx" ON "Notice"("ownerUserId", "archivedAt", "endDate");

-- CreateIndex
CREATE INDEX "Notice_ownerUserId_audience_archivedAt_idx" ON "Notice"("ownerUserId", "audience", "archivedAt");

-- AddForeignKey
ALTER TABLE "Allocation"
  ADD CONSTRAINT "Allocation_maintenanceRequestId_fkey"
  FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest"
  ADD CONSTRAINT "MaintenanceRequest_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest"
  ADD CONSTRAINT "MaintenanceRequest_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest"
  ADD CONSTRAINT "MaintenanceRequest_bedId_fkey"
  FOREIGN KEY ("bedId") REFERENCES "Bed"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUpdate"
  ADD CONSTRAINT "MaintenanceUpdate_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUpdate"
  ADD CONSTRAINT "MaintenanceUpdate_maintenanceRequestId_fkey"
  FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceAttachmentIntent"
  ADD CONSTRAINT "MaintenanceAttachmentIntent_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceAttachment"
  ADD CONSTRAINT "MaintenanceAttachment_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceAttachment"
  ADD CONSTRAINT "MaintenanceAttachment_maintenanceRequestId_fkey"
  FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceAttachment"
  ADD CONSTRAINT "MaintenanceAttachment_maintenanceUpdateId_fkey"
  FOREIGN KEY ("maintenanceUpdateId") REFERENCES "MaintenanceUpdate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceAttachment"
  ADD CONSTRAINT "MaintenanceAttachment_intentId_fkey"
  FOREIGN KEY ("intentId") REFERENCES "MaintenanceAttachmentIntent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice"
  ADD CONSTRAINT "Notice_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice"
  ADD CONSTRAINT "Notice_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice"
  ADD CONSTRAINT "Notice_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

