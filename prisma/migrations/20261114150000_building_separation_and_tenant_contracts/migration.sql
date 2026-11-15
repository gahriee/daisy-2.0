-- Building separation for RoomType / Room / Bed and digital signed TenantContract storage.

CREATE TYPE "RoomBuilding" AS ENUM ('BOARDING', 'TRANSIENT');
CREATE TYPE "ContractScanMode" AS ENUM ('ORIGINAL', 'MAGIC_WHITE', 'BW_SCAN');

-- 1. Drop previous rate CHECKs and building-agnostic unique active indexes before backfill.
ALTER TABLE "RoomType" DROP CONSTRAINT IF EXISTS "RoomType_monthlyRate_check";
ALTER TABLE "RoomType" DROP CONSTRAINT IF EXISTS "RoomType_dailyRate_check";
ALTER TABLE "Room" DROP CONSTRAINT IF EXISTS "Room_baseMonthlyRate_check";
ALTER TABLE "Room" DROP CONSTRAINT IF EXISTS "Room_transientDailyRate_check";
ALTER TABLE "Bed" DROP CONSTRAINT IF EXISTS "Bed_monthlyRate_check";
ALTER TABLE "Bed" DROP CONSTRAINT IF EXISTS "Bed_dailyRate_check";

DROP INDEX IF EXISTS "RoomType_ownerUserId_name_active_key";
DROP INDEX IF EXISTS "Room_ownerUserId_number_active_key";

-- 2. Add building columns and relax rate nullability so BOARDING uses monthly and TRANSIENT uses daily.
ALTER TABLE "RoomType"
  ADD COLUMN "building" "RoomBuilding" NOT NULL DEFAULT 'BOARDING',
  ALTER COLUMN "monthlyRate" DROP NOT NULL;

ALTER TABLE "Room"
  ADD COLUMN "building" "RoomBuilding" NOT NULL DEFAULT 'BOARDING',
  ALTER COLUMN "baseMonthlyRate" DROP NOT NULL;

ALTER TABLE "Bed"
  ALTER COLUMN "monthlyRate" DROP NOT NULL;

-- 3. Backfill existing transient rooms and split shared room types cleanly without losing data.
UPDATE "Room" AS r
SET "building" = 'TRANSIENT'::"RoomBuilding"
WHERE r."isTransientPublished" = true
   OR (
     (
       EXISTS (SELECT 1 FROM "TransientReservation" tr WHERE tr."roomId" = r."id")
       OR EXISTS (SELECT 1 FROM "BookingRequest" br WHERE br."roomId" = r."id")
     )
     AND NOT EXISTS (
       SELECT 1 FROM "TenantAssignment" ta
       WHERE ta."roomId" = r."id" AND ta."status" = 'ACTIVE'
     )
   );

CREATE TEMP TABLE "_shared_transient_rt" AS
SELECT rt."id" AS old_id, gen_random_uuid() AS new_id
FROM "RoomType" rt
WHERE EXISTS (SELECT 1 FROM "Room" r WHERE r."roomTypeId" = rt."id" AND r."building" = 'TRANSIENT')
  AND EXISTS (SELECT 1 FROM "Room" r WHERE r."roomTypeId" = rt."id" AND r."building" = 'BOARDING');

INSERT INTO "RoomType" (
  "id",
  "ownerUserId",
  "version",
  "building",
  "name",
  "monthlyRate",
  "dailyRate",
  "description",
  "archivedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  m.new_id,
  rt."ownerUserId",
  1,
  'TRANSIENT'::"RoomBuilding",
  rt."name",
  NULL,
  COALESCE(NULLIF(rt."dailyRate", 0), NULLIF(rt."monthlyRate", 0), 500.00),
  rt."description",
  rt."archivedAt",
  rt."createdAt",
  CURRENT_TIMESTAMP
FROM "_shared_transient_rt" m
JOIN "RoomType" rt ON rt."id" = m.old_id;

UPDATE "Room" r
SET "roomTypeId" = m.new_id
FROM "_shared_transient_rt" m
WHERE r."roomTypeId" = m.old_id
  AND r."building" = 'TRANSIENT';

DROP TABLE "_shared_transient_rt";

UPDATE "RoomType" rt
SET
  "building" = 'TRANSIENT'::"RoomBuilding",
  "monthlyRate" = NULL,
  "dailyRate" = COALESCE(NULLIF(rt."dailyRate", 0), NULLIF(rt."monthlyRate", 0), 500.00)
WHERE EXISTS (SELECT 1 FROM "Room" r WHERE r."roomTypeId" = rt."id" AND r."building" = 'TRANSIENT')
  AND NOT EXISTS (SELECT 1 FROM "Room" r WHERE r."roomTypeId" = rt."id" AND r."building" = 'BOARDING');

UPDATE "RoomType"
SET "dailyRate" = NULL
WHERE "building" = 'BOARDING';

UPDATE "Room" r
SET
  "isTransientPublished" = false,
  "transientDailyRate" = NULL
WHERE r."building" = 'BOARDING';

UPDATE "Room" r
SET
  "baseMonthlyRate" = NULL,
  "transientDailyRate" = COALESCE(
    r."transientDailyRate",
    (SELECT rt."dailyRate" FROM "RoomType" rt WHERE rt."id" = r."roomTypeId")
  )
WHERE r."building" = 'TRANSIENT';

UPDATE "Bed" b
SET "dailyRate" = NULL
FROM "Room" r
WHERE b."roomId" = r."id" AND r."building" = 'BOARDING';

UPDATE "Bed" b
SET
  "monthlyRate" = NULL,
  "dailyRate" = COALESCE(b."dailyRate", r."transientDailyRate", rt."dailyRate", 500.00)
FROM "Room" r
JOIN "RoomType" rt ON rt."id" = r."roomTypeId"
WHERE b."roomId" = r."id" AND r."building" = 'TRANSIENT';

-- 4. Building-scoped indexes and strict rate CHECKs.
CREATE INDEX "RoomType_ownerUserId_building_archivedAt_idx"
  ON "RoomType"("ownerUserId", "building", "archivedAt");

CREATE INDEX "Room_ownerUserId_building_archivedAt_idx"
  ON "Room"("ownerUserId", "building", "archivedAt");

CREATE UNIQUE INDEX "RoomType_ownerUserId_building_name_active_key"
  ON "RoomType"("ownerUserId", "building", lower("name"))
  WHERE ("archivedAt" IS NULL);

CREATE UNIQUE INDEX "Room_ownerUserId_building_number_active_key"
  ON "Room"("ownerUserId", "building", lower("number"))
  WHERE ("archivedAt" IS NULL);

ALTER TABLE "RoomType"
  ADD CONSTRAINT "RoomType_building_rates_check" CHECK (
    ("building" = 'BOARDING' AND "monthlyRate" IS NOT NULL AND "monthlyRate" >= 0 AND "dailyRate" IS NULL)
    OR
    ("building" = 'TRANSIENT' AND "monthlyRate" IS NULL AND "dailyRate" IS NOT NULL AND "dailyRate" >= 0)
  );

ALTER TABLE "Room"
  ADD CONSTRAINT "Room_building_rates_check" CHECK (
    ("building" = 'BOARDING' AND "baseMonthlyRate" IS NOT NULL AND "baseMonthlyRate" >= 0 AND "transientDailyRate" IS NULL AND "isTransientPublished" = false)
    OR
    ("building" = 'TRANSIENT' AND "baseMonthlyRate" IS NULL AND ("transientDailyRate" IS NULL OR "transientDailyRate" >= 0))
  );

ALTER TABLE "Bed"
  ADD CONSTRAINT "Bed_rates_check" CHECK (
    ("monthlyRate" IS NULL OR "monthlyRate" >= 0)
    AND ("dailyRate" IS NULL OR "dailyRate" >= 0)
    AND ("monthlyRate" IS NOT NULL OR "dailyRate" IS NOT NULL)
  );

-- 5. Digital signed tenant contract storage tables.
CREATE TABLE "TenantContractIntent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerUserId" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
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
  CONSTRAINT "TenantContractIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantContractIntent_byteSize_positive" CHECK ("byteSize" > 0 AND "byteSize" <= 26214400),
  CONSTRAINT "TenantContractIntent_sha256_format" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "TenantContractIntent_mimeType_valid" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
);

CREATE TABLE "TenantContract" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerUserId" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
  "assignmentId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "signedDateManila" TEXT,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TenantContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantContract_version_check" CHECK ("version" >= 1),
  CONSTRAINT "TenantContract_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "TenantContract_signedDate_check" CHECK ("signedDateManila" IS NULL OR "signedDateManila" ~ '^\d{4}-\d{2}-\d{2}$')
);

CREATE TABLE "TenantContractPage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerUserId" TEXT NOT NULL,
  "contractId" UUID NOT NULL,
  "intentId" UUID NOT NULL,
  "objectKey" TEXT NOT NULL,
  "pageOrder" INTEGER NOT NULL,
  "filterMode" "ContractScanMode" NOT NULL DEFAULT 'MAGIC_WHITE',
  "label" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantContractPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantContractPage_pageOrder_check" CHECK ("pageOrder" >= 1 AND "pageOrder" <= 50),
  CONSTRAINT "TenantContractPage_byteSize_positive" CHECK ("byteSize" > 0 AND "byteSize" <= 26214400),
  CONSTRAINT "TenantContractPage_sha256_format" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "TenantContractPage_mimeType_valid" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
);

CREATE UNIQUE INDEX "TenantContractIntent_objectKey_key" ON "TenantContractIntent"("objectKey");
CREATE INDEX "TenantContractIntent_ownerUserId_status_expiresAt_idx" ON "TenantContractIntent"("ownerUserId", "status", "expiresAt");
CREATE INDEX "TenantContractIntent_ownerUserId_tenantId_createdAt_idx" ON "TenantContractIntent"("ownerUserId", "tenantId", "createdAt");

CREATE INDEX "TenantContract_ownerUserId_tenantId_archivedAt_createdAt_idx"
  ON "TenantContract"("ownerUserId", "tenantId", "archivedAt", "createdAt");

CREATE UNIQUE INDEX "TenantContractPage_intentId_key" ON "TenantContractPage"("intentId");
CREATE UNIQUE INDEX "TenantContractPage_objectKey_key" ON "TenantContractPage"("objectKey");
CREATE UNIQUE INDEX "TenantContractPage_contractId_pageOrder_key" ON "TenantContractPage"("contractId", "pageOrder");
CREATE INDEX "TenantContractPage_ownerUserId_contractId_pageOrder_idx"
  ON "TenantContractPage"("ownerUserId", "contractId", "pageOrder");

ALTER TABLE "TenantContractIntent"
  ADD CONSTRAINT "TenantContractIntent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantContractIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TenantContract"
  ADD CONSTRAINT "TenantContract_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantContract_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TenantAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TenantContractPage"
  ADD CONSTRAINT "TenantContractPage_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantContractPage_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "TenantContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantContractPage_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "TenantContractIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
