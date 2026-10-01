-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('PLANNED', 'DRAFTED', 'SENT', 'REPLIED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "outreachEmailsPerDay" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "outreachReviewFirstN" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "Outreach" (
    "id" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'PLANNED',
    "track" "Track",
    "recipientName" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientRole" TEXT,
    "company" TEXT NOT NULL,
    "jobId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cvProfileSlug" TEXT,
    "warmUp" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "note" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outreach_createdAt_idx" ON "Outreach"("createdAt");

-- CreateIndex
CREATE INDEX "Outreach_recipientEmail_idx" ON "Outreach"("recipientEmail");

