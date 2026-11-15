-- CreateTable
CREATE TABLE "TenantNote" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TenantNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenantNote_content_length_check" CHECK (char_length(btrim("content")) BETWEEN 1 AND 1000)
);

-- CreateIndex
CREATE INDEX "TenantNote_ownerUserId_tenantId_createdAt_idx" ON "TenantNote"("ownerUserId", "tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantNote" ADD CONSTRAINT "TenantNote_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantNote" ADD CONSTRAINT "TenantNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve any non-empty profile notes already stored on Tenant rows as individual TenantNote entries.
INSERT INTO "TenantNote" ("id", "ownerUserId", "tenantId", "content", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    "ownerUserId",
    "id",
    left(btrim("notes"), 1000),
    COALESCE("updatedAt", CURRENT_TIMESTAMP),
    COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "Tenant"
WHERE "notes" IS NOT NULL AND char_length(btrim("notes")) > 0;

