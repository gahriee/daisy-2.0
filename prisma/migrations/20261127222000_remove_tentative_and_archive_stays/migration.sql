-- Remove TENTATIVE from TransientReservationStatus and add archivedAt to TransientReservation.

UPDATE "TransientReservation"
SET "status" = 'CONFIRMED'
WHERE "status" = 'TENTATIVE';

ALTER TABLE "TransientReservation"
  ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "TransientReservationStatus_new" AS ENUM (
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW'
);

ALTER TABLE "TransientReservation"
  ALTER COLUMN "status" TYPE "TransientReservationStatus_new"
  USING ("status"::text::"TransientReservationStatus_new");

DROP TYPE "TransientReservationStatus";

ALTER TYPE "TransientReservationStatus_new" RENAME TO "TransientReservationStatus";

ALTER TABLE "TransientReservation"
  ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

ALTER TABLE "TransientReservation"
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3);

CREATE INDEX "TransientReservation_ownerUserId_archivedAt_idx"
  ON "TransientReservation"("ownerUserId", "archivedAt");

