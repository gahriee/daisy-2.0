-- Consolidate Room.number + Room.transientTitle into Room.title
-- and Room.notes + Room.transientDescription into Room.summary for both buildings.

ALTER TABLE "Room"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "summary" TEXT;

UPDATE "Room"
SET
  "title" = COALESCE(NULLIF(BTRIM("transientTitle"), ''), "number"),
  "summary" = COALESCE(NULLIF(BTRIM("transientDescription"), ''), "notes");

ALTER TABLE "Room"
  ALTER COLUMN "title" SET NOT NULL;

DROP INDEX IF EXISTS "Room_ownerUserId_building_number_active_key";

CREATE UNIQUE INDEX "Room_ownerUserId_building_title_active_key"
  ON "Room"("ownerUserId", "building", "title")
  WHERE "archivedAt" IS NULL;

ALTER TABLE "Room"
  DROP COLUMN "number",
  DROP COLUMN "notes",
  DROP COLUMN "transientTitle",
  DROP COLUMN "transientDescription";

