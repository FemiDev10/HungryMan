-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "WorkContext" AS ENUM ('STANDARD', 'STUDENT_PART_TIME', 'SPONSORED_AFTER_COURSE');

-- AlterEnum
ALTER TYPE "ExceptionType" ADD VALUE 'REVIEW_BEFORE_SUBMIT';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "warmUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workContext" "WorkContext";

-- AlterTable
ALTER TABLE "Certification" ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "Education" ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "estMonthlyPay" DOUBLE PRECISION,
ADD COLUMN     "sponsorLicensed" BOOLEAN,
ADD COLUMN     "sponsorMatchName" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "monthlyIncomeGoal" DOUBLE PRECISION NOT NULL DEFAULT 1000,
ADD COLUMN     "reviewFirstN" INTEGER NOT NULL DEFAULT 3,
ALTER COLUMN "defaultBrowserAgent" SET DEFAULT 'claude-chrome';

-- AlterTable
ALTER TABLE "Skill" ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "WorkAuthorisation" ADD COLUMN     "seekingSponsoredRoleAfterCourse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sponsoredRoleMinSalary" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SponsorRegister" (
    "id" TEXT NOT NULL,
    "organisationName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "townCity" TEXT,
    "county" TEXT,
    "typeRating" TEXT,
    "route" TEXT,

    CONSTRAINT "SponsorRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorRegisterMeta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "importedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "SponsorRegisterMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SponsorRegister_normalizedName_idx" ON "SponsorRegister"("normalizedName");
