-- Additive Owner-configurable SMTP email settings on BusinessSettings.
ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "smtpHost" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPort" INTEGER,
  ADD COLUMN IF NOT EXISTS "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "smtpUser" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPassEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPassLast4" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpFromName" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpFromEmail" TEXT;

