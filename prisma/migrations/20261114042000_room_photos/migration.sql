-- CreateEnum
CREATE TYPE "RoomPhotoRole" AS ENUM ('PREVIEW', 'GALLERY');

-- CreateTable
CREATE TABLE "RoomPhotoIntent" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "roomId" UUID,
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

    CONSTRAINT "RoomPhotoIntent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoomPhotoIntent_byteSize_positive" CHECK ("byteSize" > 0 AND "byteSize" <= 26214400),
    CONSTRAINT "RoomPhotoIntent_sha256_format" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "RoomPhotoIntent_mimeType_valid" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp'))
);

-- CreateTable
CREATE TABLE "RoomPhoto" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "roomId" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "role" "RoomPhotoRole" NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoomPhoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoomPhoto_byteSize_positive" CHECK ("byteSize" > 0 AND "byteSize" <= 26214400),
    CONSTRAINT "RoomPhoto_sha256_format" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "RoomPhoto_mimeType_valid" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT "RoomPhoto_caption_length" CHECK ("caption" IS NULL OR char_length("caption") <= 160),
    CONSTRAINT "RoomPhoto_sortOrder_nonneg" CHECK ("sortOrder" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomPhotoIntent_objectKey_key" ON "RoomPhotoIntent"("objectKey");

-- CreateIndex
CREATE INDEX "RoomPhotoIntent_ownerUserId_status_expiresAt_idx" ON "RoomPhotoIntent"("ownerUserId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPhoto_intentId_key" ON "RoomPhoto"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPhoto_objectKey_key" ON "RoomPhoto"("objectKey");

-- CreateIndex
CREATE INDEX "RoomPhoto_ownerUserId_roomId_role_sortOrder_idx" ON "RoomPhoto"("ownerUserId", "roomId", "role", "sortOrder");

-- CreateIndex (at most one active preview image per room)
CREATE UNIQUE INDEX "RoomPhoto_room_preview_unique" ON "RoomPhoto"("ownerUserId", "roomId") WHERE "role" = 'PREVIEW';

-- AddForeignKey
ALTER TABLE "RoomPhotoIntent" ADD CONSTRAINT "RoomPhotoIntent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPhoto" ADD CONSTRAINT "RoomPhoto_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPhoto" ADD CONSTRAINT "RoomPhoto_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPhoto" ADD CONSTRAINT "RoomPhoto_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "RoomPhotoIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

