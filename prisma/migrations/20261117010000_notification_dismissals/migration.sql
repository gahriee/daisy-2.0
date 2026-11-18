-- CreateTable
CREATE TABLE "NotificationDismissal" (
    "ownerUserId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDismissal_pkey" PRIMARY KEY ("ownerUserId","notificationKey")
);

-- AddForeignKey
ALTER TABLE "NotificationDismissal" ADD CONSTRAINT "NotificationDismissal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

