ALTER TABLE "Notice"
  ADD COLUMN "smsSentAt" TIMESTAMPTZ(3),
  ADD COLUMN "smsSentCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Notice_ownerUserId_archivedAt_smsSentAt_startDateManila_idx"
  ON "Notice"("ownerUserId", "archivedAt", "smsSentAt", "startDateManila");

