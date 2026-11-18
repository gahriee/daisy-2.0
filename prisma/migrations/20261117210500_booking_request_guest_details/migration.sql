-- AlterTable BookingRequest (additive nullable guest demographics and adult/child breakdown)
ALTER TABLE "BookingRequest"
  ADD COLUMN "guestAge" INTEGER,
  ADD COLUMN "guestSex" TEXT,
  ADD COLUMN "guestAddress" TEXT,
  ADD COLUMN "adultsCount" INTEGER,
  ADD COLUMN "childrenCount" INTEGER;

ALTER TABLE "BookingRequest"
  ADD CONSTRAINT "BookingRequest_guestAge_range" CHECK ("guestAge" IS NULL OR ("guestAge" >= 1 AND "guestAge" <= 120)),
  ADD CONSTRAINT "BookingRequest_guestSex_valid" CHECK ("guestSex" IS NULL OR "guestSex" IN ('MALE', 'FEMALE')),
  ADD CONSTRAINT "BookingRequest_guestAddress_length" CHECK ("guestAddress" IS NULL OR char_length("guestAddress") <= 250),
  ADD CONSTRAINT "BookingRequest_adults_children_valid" CHECK (
    ("adultsCount" IS NULL AND "childrenCount" IS NULL)
    OR ("adultsCount" IS NOT NULL AND "adultsCount" >= 1 AND "childrenCount" IS NOT NULL AND "childrenCount" >= 0 AND ("adultsCount" + "childrenCount") = "partySize")
  );

