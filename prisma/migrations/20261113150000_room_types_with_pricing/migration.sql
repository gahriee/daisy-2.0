-- Rename legacy RoomType enum so the new RoomType table can claim the name cleanly
ALTER TYPE "RoomType" RENAME TO "LegacyRoomType";

-- CreateTable
CREATE TABLE "RoomType" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "monthlyRate" DECIMAL(12,2) NOT NULL,
    "dailyRate" DECIMAL(12,2),
    "description" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomType_ownerUserId_archivedAt_idx" ON "RoomType"("ownerUserId", "archivedAt");

-- CreateIndex (active room type names must be unique case-insensitively per Owner)
CREATE UNIQUE INDEX "RoomType_ownerUserId_name_active_key" ON "RoomType"("ownerUserId", lower("name")) WHERE ("archivedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_version_check" CHECK ("version" >= 1);
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_monthlyRate_check" CHECK ("monthlyRate" >= 0);
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_dailyRate_check" CHECK ("dailyRate" IS NULL OR "dailyRate" >= 0);

-- Add roomTypeId column to Room and backfill from any existing legacy enum rows
ALTER TABLE "Room" ADD COLUMN "roomTypeId" UUID;

INSERT INTO "RoomType" (
    "id",
    "ownerUserId",
    "version",
    "name",
    "monthlyRate",
    "dailyRate",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    src."ownerUserId",
    1,
    initcap(lower(src."type"::text)),
    src."monthlyRate",
    src."dailyRate",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        "ownerUserId",
        "type",
        MAX("baseMonthlyRate") AS "monthlyRate",
        MAX("transientDailyRate") AS "dailyRate"
    FROM "Room"
    GROUP BY "ownerUserId", "type"
) AS src;

UPDATE "Room" AS r
SET "roomTypeId" = rt."id"
FROM "RoomType" AS rt
WHERE rt."ownerUserId" = r."ownerUserId"
  AND lower(rt."name") = lower(r."type"::text);

ALTER TABLE "Room" ALTER COLUMN "roomTypeId" SET NOT NULL;

CREATE INDEX "Room_ownerUserId_roomTypeId_idx" ON "Room"("ownerUserId", "roomTypeId");

ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Room" DROP COLUMN "type";

DROP TYPE "LegacyRoomType";

