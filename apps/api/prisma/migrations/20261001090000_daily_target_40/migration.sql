-- Daily target: about 40 applications (15 professional + 25 general).
ALTER TABLE "Settings" ALTER COLUMN "professionalPerDay" SET DEFAULT 15,
  ALTER COLUMN "generalPerDay" SET DEFAULT 25,
  ALTER COLUMN "maxPerDay" SET DEFAULT 40;

-- Existing installs still on the old defaults move to the new ones; edited values are kept.
UPDATE "Settings" SET "professionalPerDay" = 15, "generalPerDay" = 25, "maxPerDay" = 40
WHERE "professionalPerDay" = 10 AND "generalPerDay" = 10 AND "maxPerDay" = 20;
