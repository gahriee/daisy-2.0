-- Additive migration: Configurable overdue SMS repeat frequency (days) and daily send time (Asia/Manila HH:MM).
-- Application-owned public-schema objects only; provider auth tables untouched.

ALTER TABLE "BusinessSettings"
  ADD COLUMN "smsOverdueFrequencyDays" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "smsOverdueSendTimeManila" TEXT NOT NULL DEFAULT '09:00';

ALTER TABLE "BusinessSettings"
  ADD CONSTRAINT "BusinessSettings_smsOverdueFrequencyDays_check"
  CHECK ("smsOverdueFrequencyDays" >= 1 AND "smsOverdueFrequencyDays" <= 30);

