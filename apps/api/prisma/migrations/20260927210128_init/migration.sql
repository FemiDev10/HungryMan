-- CreateEnum
CREATE TYPE "Track" AS ENUM ('PROFESSIONAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('PRODUCT_DESIGN', 'UX', 'UX_RESEARCH', 'PRODUCT_MANAGEMENT', 'FRONTEND', 'SOFTWARE', 'AI', 'TECH_GENERAL', 'HOSPITALITY', 'KITCHEN_PORTER', 'CLEANING', 'SECURITY', 'RETAIL', 'WAREHOUSE', 'GENERAL_ENTRY_LEVEL', 'OTHER');

-- CreateEnum
CREATE TYPE "Eligibility" AS ENUM ('ELIGIBLE', 'POTENTIALLY_ELIGIBLE', 'REQUIRES_REVIEW', 'NOT_ELIGIBLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemoteType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'ZERO_HOURS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DISCOVERED', 'DEDUPLICATED', 'CLASSIFIED', 'ELIGIBILITY_CHECKED', 'MATCHED', 'QUEUED', 'CV_GENERATING', 'CV_VALIDATED', 'APPLICATION_PREPARING', 'READY_FOR_BROWSER', 'BROWSER_EXECUTING', 'SUBMISSION_ATTEMPTED', 'SUBMITTED', 'SKIPPED', 'REJECTED_BY_RULE', 'NEEDS_HUMAN', 'BLOCKED', 'FAILED', 'EXPIRED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('CAPTCHA', 'VIDEO_QUESTION', 'LIVE_INTERVIEW', 'UNSUPPORTED_FIELD', 'MISSING_CANDIDATE_DATA', 'IDENTITY_VERIFICATION', 'APPLICATION_REQUIRES_SIGNATURE', 'AUTOMATION_BLOCKED', 'UNEXPECTED_QUESTION', 'PAYMENT_REQUIRED', 'DUPLICATE_APPLICATION', 'SITE_ERROR', 'LOGIN_REQUIRED', 'CV_VALIDATION_FAILED');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('NONE', 'REJECTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('SKILL', 'EXPERIENCE', 'ACHIEVEMENT', 'EDUCATION', 'PROJECT', 'CERTIFICATION', 'TRAIT', 'AVAILABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CV', 'COVER_LETTER', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "BrowserTaskStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentState" AS ENUM ('RUNNING', 'PAUSED', 'STOPPED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "headline" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT DEFAULT 'United Kingdom',
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "maxCommuteMinutes" INTEGER,
    "links" JSONB NOT NULL DEFAULT '[]',
    "availability" JSONB NOT NULL DEFAULT '{}',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAuthorisation" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "visaType" TEXT NOT NULL,
    "hasRightToWork" BOOLEAN NOT NULL DEFAULT true,
    "termTimeHoursLimit" INTEGER,
    "vacationWorkAllowed" BOOLEAN NOT NULL DEFAULT true,
    "fullTimeRestrictions" TEXT,
    "sponsorshipRequired" BOOLEAN NOT NULL DEFAULT false,
    "courseStart" TIMESTAMP(3),
    "courseEnd" TIMESTAMP(3),
    "visaExpiry" TIMESTAMP(3),
    "vacationPeriods" JSONB NOT NULL DEFAULT '[]',
    "knownRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "guidanceVerifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkAuthorisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "field" TEXT,
    "grade" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "inProgress" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employment" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "current" BOOLEAN NOT NULL DEFAULT false,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'UNKNOWN',
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" "JobCategory"[] DEFAULT ARRAY[]::"JobCategory"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "url" TEXT,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "shipped" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" "JobCategory"[] DEFAULT ARRAY[]::"JobCategory"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "level" TEXT,
    "years" DOUBLE PRECISION,
    "categories" "JobCategory"[] DEFAULT ARRAY[]::"JobCategory"[],
    "evidenceId" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "credentialId" TEXT,
    "url" TEXT,
    "categories" "JobCategory"[] DEFAULT ARRAY[]::"JobCategory"[],

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "claim" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "allowedForCV" BOOLEAN NOT NULL DEFAULT true,
    "allowedForApplication" BOOLEAN NOT NULL DEFAULT true,
    "categories" "JobCategory"[] DEFAULT ARRAY[]::"JobCategory"[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employmentId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "track" "Track" NOT NULL,
    "categories" "JobCategory"[],
    "targetJobTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredExperience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedExperience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summaryTemplate" TEXT NOT NULL,
    "skillOrdering" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experienceOrdering" TEXT NOT NULL DEFAULT 'RELEVANCE',
    "projectSelectionRules" JSONB NOT NULL DEFAULT '{}',
    "maximumPages" INTEGER NOT NULL DEFAULT 2,
    "template" TEXT NOT NULL DEFAULT 'classic',
    "includeCoverLetter" TEXT NOT NULL DEFAULT 'WHEN_REQUIRED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceJobId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "remoteType" "RemoteType" NOT NULL DEFAULT 'UNKNOWN',
    "description" TEXT NOT NULL,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryText" TEXT,
    "salaryPeriod" TEXT,
    "currency" TEXT DEFAULT 'GBP',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'UNKNOWN',
    "hoursPerWeek" DOUBLE PRECISION,
    "hoursText" TEXT,
    "sponsorshipMention" TEXT,
    "sponsorshipEvidence" TEXT,
    "postedAt" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "applicationMethod" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "category" "JobCategory",
    "classification" JSONB,
    "eligibility" "Eligibility",
    "eligibilityDetails" JSONB,
    "match" JSONB,
    "matchScore" DOUBLE PRECISION,
    "analysisVersion" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "track" "Track",
    "cvProfileId" TEXT,
    "cvVersionId" TEXT,
    "coverLetterVersionId" TEXT,
    "answersVersionId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DISCOVERED',
    "currentStep" TEXT,
    "lastAction" TEXT,
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3),
    "submissionEvidence" JSONB,
    "submittedAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "exceptionType" "ExceptionType",
    "humanInterventionReason" TEXT,
    "browserAgent" TEXT,
    "browserState" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "outcome" "Outcome" NOT NULL DEFAULT 'NONE',
    "outcomeAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "applicationId" TEXT,
    "cvProfileId" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "validation" JSONB NOT NULL,
    "generator" TEXT NOT NULL,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerSet" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "patterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer" TEXT NOT NULL,
    "track" "Track",
    "evidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserTask" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BrowserTaskStatus" NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrowserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "agentState" "AgentState" NOT NULL DEFAULT 'PAUSED',
    "professionalPerDay" INTEGER NOT NULL DEFAULT 10,
    "generalPerDay" INTEGER NOT NULL DEFAULT 10,
    "maxPerDay" INTEGER NOT NULL DEFAULT 20,
    "minMatchProfessional" DOUBLE PRECISION NOT NULL DEFAULT 55,
    "minMatchGeneral" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "autoSubmit" BOOLEAN NOT NULL DEFAULT true,
    "defaultBrowserAgent" TEXT NOT NULL DEFAULT 'cowork',
    "schedule" JSONB NOT NULL DEFAULT '[]',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "searchCriteria" JSONB NOT NULL DEFAULT '{}',
    "termTimeOverride" TEXT,
    "notifyChannels" JSONB NOT NULL DEFAULT '{"inApp":true}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceConfig" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxApplicationsPerHour" INTEGER NOT NULL DEFAULT 5,
    "maxApplicationsPerDay" INTEGER NOT NULL DEFAULT 20,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "maxResultsPerSearch" INTEGER NOT NULL DEFAULT 50,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStatus" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "currentTask" TEXT,
    "currentApplicationId" TEXT,
    "currentSource" TEXT,
    "currentStep" TEXT,
    "startedAt" TIMESTAMP(3),
    "stepStartedAt" TIMESTAMP(3),
    "queuePosition" INTEGER,
    "queueTotal" INTEGER,
    "lastRunSummary" JSONB,
    "lastHeartbeat" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgentStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "applicationId" TEXT,
    "jobId" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "applicationId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkAuthorisation_candidateId_key" ON "WorkAuthorisation"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_candidateId_name_key" ON "Skill"("candidateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CvProfile_slug_key" ON "CvProfile"("slug");

-- CreateIndex
CREATE INDEX "Job_dedupeKey_idx" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_discoveredAt_idx" ON "Job"("discoveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_source_sourceJobId_key" ON "Job"("source", "sourceJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_seq_key" ON "Application"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_key" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_updatedAt_idx" ON "Application"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_fileName_key" ON "Document"("fileName");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerSet_applicationId_version_key" ON "AnswerSet"("applicationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerTemplate_key_key" ON "AnswerTemplate"("key");

-- CreateIndex
CREATE INDEX "BrowserTask_status_agentType_idx" ON "BrowserTask"("status", "agentType");

-- CreateIndex
CREATE UNIQUE INDEX "SourceConfig_source_key" ON "SourceConfig"("source");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_applicationId_idx" ON "AuditLog"("applicationId");

-- CreateIndex
CREATE INDEX "AuditLog_type_idx" ON "AuditLog"("type");

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkAuthorisation" ADD CONSTRAINT "WorkAuthorisation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSet" ADD CONSTRAINT "AnswerSet_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserTask" ADD CONSTRAINT "BrowserTask_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
