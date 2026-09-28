-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobCategory" ADD VALUE 'ADMIN_RECEPTION';
ALTER TYPE "JobCategory" ADD VALUE 'CUSTOMER_SERVICE';
ALTER TYPE "JobCategory" ADD VALUE 'TEACHING_SUPPORT';

-- AlterTable
ALTER TABLE "Education" ADD COLUMN     "datesText" TEXT;

-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "datesText" TEXT,
ADD COLUMN     "titleVariants" JSONB NOT NULL DEFAULT '{}';
