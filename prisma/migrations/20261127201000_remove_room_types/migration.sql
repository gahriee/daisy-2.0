-- Remove RoomType table and Room.roomTypeId foreign key so each Room owns its
-- monthly (BOARDING) or daily (TRANSIENT) rate directly without room type presets.

-- 1. Backfill any Room rates still relying on RoomType before dropping the relation.
UPDATE "Room" AS r
SET "baseMonthlyRate" = COALESCE(r."baseMonthlyRate", rt."monthlyRate", 0.00)
FROM "RoomType" AS rt
WHERE r."roomTypeId" = rt."id"
  AND r."building" = 'BOARDING'
  AND r."baseMonthlyRate" IS NULL;

UPDATE "Room" AS r
SET "transientDailyRate" = COALESCE(r."transientDailyRate", rt."dailyRate", 0.00)
FROM "RoomType" AS rt
WHERE r."roomTypeId" = rt."id"
  AND r."building" = 'TRANSIENT'
  AND r."transientDailyRate" IS NULL;

-- Ensure no orphaned NULL rates exist before tightening the CHECK constraint.
UPDATE "Room"
SET "baseMonthlyRate" = 0.00
WHERE "building" = 'BOARDING'
  AND "baseMonthlyRate" IS NULL;

UPDATE "Room"
SET "transientDailyRate" = 0.00
WHERE "building" = 'TRANSIENT'
  AND "transientDailyRate" IS NULL;

-- 2. Tighten Room_building_rates_check so TRANSIENT rooms always carry a non-null daily rate directly.
ALTER TABLE "Room" DROP CONSTRAINT IF EXISTS "Room_building_rates_check";
ALTER TABLE "Room"
  ADD CONSTRAINT "Room_building_rates_check" CHECK (
    ("building" = 'BOARDING' AND "baseMonthlyRate" IS NOT NULL AND "baseMonthlyRate" >= 0 AND "transientDailyRate" IS NULL AND "isTransientPublished" = false)
    OR
    ("building" = 'TRANSIENT' AND "baseMonthlyRate" IS NULL AND "transientDailyRate" IS NOT NULL AND "transientDailyRate" >= 0)
  );

-- 3. Drop Room -> RoomType foreign key, index, column, and the RoomType table.
ALTER TABLE "Room" DROP CONSTRAINT IF EXISTS "Room_roomTypeId_fkey";
DROP INDEX IF EXISTS "Room_ownerUserId_roomTypeId_idx";
ALTER TABLE "Room" DROP COLUMN IF EXISTS "roomTypeId";

DROP INDEX IF EXISTS "RoomType_ownerUserId_building_name_active_key";
DROP INDEX IF EXISTS "RoomType_ownerUserId_building_archivedAt_idx";
DROP INDEX IF EXISTS "RoomType_ownerUserId_archivedAt_idx";
DROP TABLE IF EXISTS "RoomType";

