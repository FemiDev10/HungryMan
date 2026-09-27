// Types mirroring docs/API.md and apps/api/prisma/schema.prisma.

export type Track = 'PROFESSIONAL' | 'GENERAL';
export type JobCategory =
  | 'PRODUCT_DESIGN' | 'UX' | 'UX_RESEARCH' | 'PRODUCT_MANAGEMENT' | 'FRONTEND' | 'SOFTWARE' | 'AI' | 'TECH_GENERAL'
  | 'HOSPITALITY' | 'KITCHEN_PORTER' | 'CLEANING' | 'SECURITY' | 'RETAIL' | 'WAREHOUSE' | 'GENERAL_ENTRY_LEVEL' | 'OTHER';
export type Eligibility = 'ELIGIBLE' | 'POTENTIALLY_ELIGIBLE' | 'REQUIRES_REVIEW' | 'NOT_ELIGIBLE' | 'UNKNOWN';
export type ApplicationStatus =
  | 'DISCOVERED' | 'DEDUPLICATED' | 'CLASSIFIED' | 'ELIGIBILITY_CHECKED' | 'MATCHED' | 'QUEUED'
  | 'CV_GENERATING' | 'CV_VALIDATED' | 'APPLICATION_PREPARING' | 'READY_FOR_BROWSER' | 'BROWSER_EXECUTING'
  | 'SUBMISSION_ATTEMPTED' | 'SUBMITTED' | 'SKIPPED' | 'REJECTED_BY_RULE' | 'NEEDS_HUMAN' | 'BLOCKED' | 'FAILED'
  | 'EXPIRED' | 'DUPLICATE';
export type ReviewStatus = 'DRAFT' | 'APPROVED';
export type WorkContext = 'STANDARD' | 'STUDENT_PART_TIME' | 'SPONSORED_AFTER_COURSE';
export type ExceptionType =
  | 'REVIEW_BEFORE_SUBMIT' | 'CAPTCHA' | 'VIDEO_QUESTION' | 'LIVE_INTERVIEW' | 'UNSUPPORTED_FIELD' | 'MISSING_CANDIDATE_DATA'
  | 'IDENTITY_VERIFICATION' | 'APPLICATION_REQUIRES_SIGNATURE' | 'AUTOMATION_BLOCKED' | 'UNEXPECTED_QUESTION'
  | 'PAYMENT_REQUIRED' | 'DUPLICATE_APPLICATION' | 'SITE_ERROR' | 'LOGIN_REQUIRED' | 'CV_VALIDATION_FAILED';
export type Outcome = 'NONE' | 'REJECTED' | 'ASSESSMENT' | 'INTERVIEW' | 'OFFER' | 'WITHDRAWN';
export type EvidenceKind =
  | 'SKILL' | 'EXPERIENCE' | 'ACHIEVEMENT' | 'EDUCATION' | 'PROJECT' | 'CERTIFICATION' | 'TRAIT' | 'AVAILABILITY' | 'OTHER';
export type AgentState = 'RUNNING' | 'PAUSED' | 'STOPPED';
export type RemoteType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
export type EmploymentType =
  | 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY' | 'INTERNSHIP' | 'ZERO_HOURS' | 'UNKNOWN';
export type DocumentKind = 'CV' | 'COVER_LETTER' | 'SUPPORTING';
export type BrowserTaskStatus = 'PENDING' | 'CLAIMED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface ApplicationRow {
  id: string;
  ref: string;
  status: ApplicationStatus;
  track: Track | null;
  workContext: WorkContext | null;
  /** One of the first N applications — held before submit for the user to review. */
  warmUp: boolean;
  currentStep: string | null;
  lastAction: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  simulated: boolean;
  exceptionType: ExceptionType | null;
  humanInterventionReason: string | null;
  failureReason: string | null;
  outcome: Outcome;
  browserAgent: string | null;
  priority: number;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    source: string;
    url: string;
    category: JobCategory | null;
    matchScore: number | null;
    eligibility: Eligibility | null;
    estMonthlyPay: number | null;
    sponsorLicensed: boolean | null;
    sponsorMatchName?: string | null;
  };
  cvProfile: { id: string; name: string; slug: string } | null;
  cvFileName: string | null;
  browserState?: Record<string, unknown> | null;
}

export interface SubmissionEvidence {
  type?: string;
  confirmationNumber?: string | null;
  message?: string | null;
  screenshotDocId?: string | null;
  url?: string | null;
  [k: string]: unknown;
}

export interface ApplicationDetailRow extends ApplicationRow {
  browserState: Record<string, unknown> | null;
  submissionEvidence: SubmissionEvidence | null;
  notes: string | null;
}

export interface MatchResult {
  score: number;
  requiredSkillsMatched: string[];
  requiredSkillsMissing: string[];
  relevantExperience: string[];
  concerns: string[];
  eligibility: Eligibility;
  recommendation: 'APPLY' | 'CONSIDER' | 'SKIP';
  breakdown: Record<string, number>;
}

export interface JobClassification {
  category: JobCategory;
  confidence: number;
  alternativeCategories: JobCategory[];
  reasoning: string;
}

export interface EligibilityDetails {
  status: Eligibility;
  reasons: string[];
  period?: 'TERM' | 'VACATION' | 'NOT_STUDYING';
  workContext?: WorkContext;
  assumedHoursPerWeek?: number | null;
  /** ISO date the job could start, when constrained (e.g. after the course ends). */
  earliestStart?: string | null;
  sponsorship: {
    mention: string;
    evidence: string | null;
    note: string;
    potentialOpportunity?: boolean;
    /** true = on the register, false = not found, null = register not loaded. */
    licensedSponsor?: boolean | null;
    registerName?: string | null;
  };
  checks?: unknown[];
}

export interface Job {
  id: string;
  source: string;
  sourceJobId: string | null;
  url: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: RemoteType;
  description: string;
  requirements: string[];
  preferredRequirements: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  salaryPeriod: string | null;
  currency: string | null;
  employmentType: EmploymentType;
  hoursPerWeek: number | null;
  hoursText: string | null;
  sponsorshipMention: string | null;
  sponsorshipEvidence: string | null;
  postedAt: string | null;
  closingDate: string | null;
  applicationMethod: string | null;
  discoveredAt: string;
  dedupeKey: string;
  duplicateOfId: string | null;
  category: JobCategory | null;
  classification: JobClassification | null;
  eligibility: Eligibility | null;
  eligibilityDetails: EligibilityDetails | null;
  match: MatchResult | null;
  matchScore: number | null;
  analysisVersion: string | null;
  sponsorLicensed: boolean | null;
  sponsorMatchName: string | null;
  estMonthlyPay: number | null;
}

export interface ValidationReport {
  valid: boolean;
  checkedClaims: number;
  errors: string[];
  warnings: string[];
}

export interface DocumentItem {
  id: string;
  kind: DocumentKind;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  generator: string;
  promptVersion: string | null;
  createdAt: string;
  content: unknown;
  validation: ValidationReport | null;
}

export type AnswerSource = 'LIBRARY' | 'CANDIDATE_DATA' | 'AI' | 'UNKNOWN';
export interface AnswerSet {
  id: string;
  version: number;
  createdAt: string;
  answers: { key: string; question: string; answer: string; evidenceIds: string[]; source: AnswerSource }[];
}

export interface BrowserTask {
  id: string;
  applicationId: string;
  agentType: string;
  payload: unknown;
  status: BrowserTaskStatus;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  completedAt: string | null;
  result: unknown;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  at: string;
  type: string;
  actor: string;
  applicationId: string | null;
  jobId: string | null;
  message: string;
  data: unknown;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  applicationId: string | null;
  read: boolean;
  createdAt: string;
}

export interface AgentStatusView {
  state: AgentState;
  running: boolean;
  currentTask: string | null;
  currentSource: string | null;
  currentStep: string | null;
  currentApplication: ApplicationRow | null;
  startedAt: string | null;
  elapsedSeconds: number | null;
  queuePosition: number | null;
  queueTotal: number | null;
  lastHeartbeat: string | null;
  nextScheduled: { time: string; action: string } | null;
}

export interface Overview {
  today: { discovered: number; relevant: number; queued: number; submitted: number; needsAttention: number; failed: number };
  totals: { submitted: number; interviews: number; offers: number; applications: number };
  agent: AgentStatusView;
  queuePreview: ApplicationRow[];
  recentNotifications: Notification[];
  income?: IncomeSummary;
}

/** Estimated monthly pay (before tax) from general-work jobs, against the income goal. */
export interface IncomeSummary {
  goal: number;
  /** Sum of est. monthly pay from jobs with an OFFER. */
  secured: number;
  /** Sum of est. monthly pay across active submitted general-work applications. */
  appliedPotential: number;
  appliedCount: number;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  link: string;
  required: boolean;
}
export interface Checklist {
  items: ChecklistItem[];
  ready: boolean;
}

export type AgentAction = 'RUN_NOW' | 'DISCOVER_NOW' | 'PAUSE' | 'RESUME' | 'STOP' | 'RETRY_FAILED' | 'RETRY_BLOCKED';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApplicationDetail {
  application: ApplicationDetailRow;
  job: Job;
  documents: DocumentItem[];
  answerSets: AnswerSet[];
  browserTasks: BrowserTask[];
  audit: AuditLog[];
}

export interface Meta {
  enums: {
    categories: JobCategory[];
    statuses: ApplicationStatus[];
    exceptionTypes: ExceptionType[];
    outcomes: Outcome[];
    evidenceKinds: EvidenceKind[];
    tracks: Track[];
    workContexts?: WorkContext[];
  };
  integrations: { claude: boolean; reed: boolean; adzuna: boolean; browserAgents: string[] };
  version: string;
}

// ───────────── Candidate ─────────────

export interface CandidateLink { label: string; url: string }
export interface Availability {
  startDate?: string | null;
  noticePeriod?: string | null;
  daysAvailable?: string[];
  shiftsAvailable?: string[];
  notes?: string | null;
}
export interface Preferences {
  minSalaryProfessional?: number | null;
  minHourlyGeneral?: number | null;
  remoteTypes?: string[];
  locations?: string[];
  excludedCompanies?: string[];
}

export interface VacationPeriod { start: string; end: string; label: string }

export interface WorkAuthorisation {
  id?: string;
  visaType: string;
  hasRightToWork: boolean;
  termTimeHoursLimit: number | null;
  vacationWorkAllowed: boolean;
  fullTimeRestrictions: string | null;
  sponsorshipRequired: boolean;
  courseStart: string | null;
  courseEnd: string | null;
  visaExpiry: string | null;
  vacationPeriods: VacationPeriod[];
  knownRestrictions: string[];
  seekingSponsoredRoleAfterCourse: boolean;
  sponsoredRoleMinSalary: number | null;
  guidanceVerifiedAt: string | null;
  notes: string | null;
  updatedAt?: string;
}

export interface Education {
  id: string;
  status: ReviewStatus;
  institution: string;
  qualification: string;
  field: string | null;
  grade: string | null;
  startDate: string | null;
  endDate: string | null;
  inProgress: boolean;
  location: string | null;
  highlights: string[];
}

export interface Employment {
  id: string;
  status: ReviewStatus;
  employer: string;
  title: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  employmentType: EmploymentType;
  description: string | null;
  tags: string[];
  categories: JobCategory[];
}

export interface Project {
  id: string;
  status: ReviewStatus;
  name: string;
  role: string | null;
  url: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  shipped: boolean;
  tags: string[];
  categories: JobCategory[];
}

export interface Skill {
  id: string;
  status: ReviewStatus;
  name: string;
  aliases: string[];
  level: string | null;
  years: number | null;
  categories: JobCategory[];
}

export interface Certification {
  id: string;
  status: ReviewStatus;
  name: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialId: string | null;
  url: string | null;
  categories: JobCategory[];
}

export interface Evidence {
  id: string;
  status: ReviewStatus;
  kind: EvidenceKind;
  claim: string;
  source: string;
  date: string | null;
  allowedForCV: boolean;
  allowedForApplication: boolean;
  categories: JobCategory[];
  tags: string[];
  employmentId: string | null;
  projectId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Candidate {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  addressLine: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  willingToRelocate: boolean;
  maxCommuteMinutes: number | null;
  links: CandidateLink[];
  availability: Availability;
  preferences: Preferences;
  workAuthorisation: WorkAuthorisation | null;
  education: Education[];
  employment: Employment[];
  projects: Project[];
  skills: Skill[];
  certifications: Certification[];
  evidence: Evidence[];
}

export interface CvImportResult {
  counts: Record<string, number>;
  promptVersion?: string;
  candidate: Candidate;
}

export interface ReviewItem {
  collection: CandidateCollection;
  id: string;
  action: 'APPROVE' | 'REJECT';
}

export type CandidateCollection = 'education' | 'employment' | 'projects' | 'skills' | 'certifications' | 'evidence';

// ───────────── CV profiles ─────────────

export interface ProjectSelectionRules { maxProjects?: number | null; requireShipped?: boolean; requiredTags?: string[] }

export interface CvProfile {
  id: string;
  slug: string;
  name: string;
  track: Track;
  categories: JobCategory[];
  targetJobTitles: string[];
  targetKeywords: string[];
  preferredSkills: string[];
  preferredExperience: string[];
  excludedExperience: string[];
  summaryTemplate: string;
  skillOrdering: string[];
  experienceOrdering: 'RELEVANCE' | 'CHRONOLOGICAL';
  projectSelectionRules: ProjectSelectionRules;
  maximumPages: number;
  template: 'classic' | 'compact';
  includeCoverLetter: 'ALWAYS' | 'WHEN_REQUIRED' | 'NEVER';
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CvPreview { content: unknown; validation: ValidationReport | null }

// ───────────── Answers ─────────────

export interface AnswerTemplate {
  id: string;
  key: string;
  category: string;
  question: string;
  patterns: string[];
  answer: string;
  track: Track | null;
  evidenceIds: string[];
  verified: boolean;
  updatedAt?: string;
}

// ───────────── Settings / sources ─────────────

export type ScheduleAction = 'DISCOVER' | 'ANALYSE' | 'PREPARE' | 'EXECUTE' | 'FULL_CYCLE';
export interface ScheduleEntry { time: string; action: ScheduleAction }
export interface SearchCriteriaTrack { keywords: string[]; locations: string[]; remoteOnly?: boolean }

export interface Settings {
  agentState: AgentState;
  professionalPerDay: number;
  generalPerDay: number;
  maxPerDay: number;
  minMatchProfessional: number;
  minMatchGeneral: number;
  autoSubmit: boolean;
  defaultBrowserAgent: string;
  schedule: ScheduleEntry[];
  timezone: string;
  searchCriteria: { professional?: SearchCriteriaTrack; general?: SearchCriteriaTrack };
  termTimeOverride: null | 'TERM' | 'VACATION';
  reviewFirstN: number;
  monthlyIncomeGoal: number;
  updatedAt?: string;
}

export interface SourceConfig {
  source: string;
  label: string;
  enabled: boolean;
  available: boolean;
  supportsApplication: boolean;
  maxApplicationsPerHour: number;
  maxApplicationsPerDay: number;
  cooldownSeconds: number;
  maxResultsPerSearch: number;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface ApplicationFilters {
  view?: 'queue' | 'history' | 'exceptions';
  status?: string;
  track?: string;
  category?: string;
  company?: string;
  role?: string;
  source?: string;
  cvProfile?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ImportJobBody {
  url: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  salaryText?: string;
  employmentType?: string;
  hoursText?: string;
  closingDate?: string;
}

// ───────────── Sponsor register ─────────────

export interface SponsorRegisterStatus {
  loaded: boolean;
  rows: number;
  importedAt: string | null;
  sourceUrl: string | null;
  lastError: string | null;
}

export interface SponsorCheck {
  company: string;
  /** null = register not loaded. */
  result: { licensed: boolean; name: string | null } | null;
}
