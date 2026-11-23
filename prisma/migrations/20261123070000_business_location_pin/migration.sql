-- Additive map pin coordinates on BusinessSettings for property directions.
ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "businessLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "businessLongitude" DOUBLE PRECISION;

