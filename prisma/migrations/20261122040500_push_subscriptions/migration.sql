-- Additive migration: Owner PWA Web Push subscriptions for mobile/desktop notifications.
-- Application-owned public-schema objects only; provider auth tables untouched.

CREATE TABLE "PushSubscription" (
  "id" UUID NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "deviceLabel" TEXT,
  "lastUsedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_ownerUserId_createdAt_idx" ON "PushSubscription"("ownerUserId", "createdAt");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

