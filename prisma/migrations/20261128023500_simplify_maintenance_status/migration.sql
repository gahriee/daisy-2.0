-- Simplify MaintenanceStatus to OPEN, IN_PROGRESS, RESOLVED and drop MaintenanceRequest.cancelledAt.
ALTER TABLE "MaintenanceRequest"
  DROP CONSTRAINT IF EXISTS "MaintenanceRequest_status_timestamps_check";

UPDATE "MaintenanceRequest"
SET "status" = 'IN_PROGRESS'
WHERE "status" = 'WAITING_PARTS';

UPDATE "MaintenanceRequest"
SET
  "status" = 'RESOLVED',
  "resolvedAt" = COALESCE("resolvedAt", "cancelledAt", CURRENT_TIMESTAMP),
  "archivedAt" = COALESCE("archivedAt", "cancelledAt", CURRENT_TIMESTAMP)
WHERE "status" = 'CANCELLED';

UPDATE "MaintenanceUpdate"
SET "statusFrom" = 'IN_PROGRESS'
WHERE "statusFrom" = 'WAITING_PARTS';

UPDATE "MaintenanceUpdate"
SET "statusTo" = 'IN_PROGRESS'
WHERE "statusTo" = 'WAITING_PARTS';

UPDATE "MaintenanceUpdate"
SET "statusFrom" = 'RESOLVED'
WHERE "statusFrom" = 'CANCELLED';

UPDATE "MaintenanceUpdate"
SET "statusTo" = 'RESOLVED'
WHERE "statusTo" = 'CANCELLED';

DROP TYPE IF EXISTS "MaintenanceStatus_new";
CREATE TYPE "MaintenanceStatus_new" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

ALTER TABLE "MaintenanceRequest" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "MaintenanceRequest"
  ALTER COLUMN "status" TYPE "MaintenanceStatus_new"
  USING ("status"::text::"MaintenanceStatus_new");

ALTER TABLE "MaintenanceUpdate"
  ALTER COLUMN "statusFrom" TYPE "MaintenanceStatus_new"
  USING ("statusFrom"::text::"MaintenanceStatus_new");

ALTER TABLE "MaintenanceUpdate"
  ALTER COLUMN "statusTo" TYPE "MaintenanceStatus_new"
  USING ("statusTo"::text::"MaintenanceStatus_new");

ALTER TYPE "MaintenanceStatus" RENAME TO "MaintenanceStatus_old";
ALTER TYPE "MaintenanceStatus_new" RENAME TO "MaintenanceStatus";
DROP TYPE "MaintenanceStatus_old";

ALTER TABLE "MaintenanceRequest" ALTER COLUMN "status" SET DEFAULT 'OPEN';

ALTER TABLE "MaintenanceRequest" DROP COLUMN IF EXISTS "cancelledAt";

ALTER TABLE "MaintenanceRequest"
  ADD CONSTRAINT "MaintenanceRequest_status_timestamps_check" CHECK (
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL) OR
    ("status" IN ('OPEN', 'IN_PROGRESS') AND "resolvedAt" IS NULL)
  );
