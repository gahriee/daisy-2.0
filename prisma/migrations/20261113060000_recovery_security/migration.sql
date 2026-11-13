-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SecurityAction" AS ENUM ('RESET_REQUESTED', 'RESET_ATTEMPTED', 'RESET_COMPLETED', 'RESET_REJECTED');

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "action" "SecurityAction" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SecurityEvent_ownerUserId_createdAt_idx" ON "SecurityEvent"("ownerUserId", "createdAt");
