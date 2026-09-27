# HungryMan REST API

Base path: `/api`. JSON in/out. All dashboard endpoints require the session cookie
(`hm_session`, httpOnly) obtained from `POST /api/auth/login`. The browser-agent
endpoints (`/api/agent-tasks/*`) instead require `Authorization: Bearer <AGENT_API_TOKEN>`.

Errors: `{ "error": string, "details"?: unknown }` with a 4xx/5xx status.
Dates are ISO strings.

## Shared types

```ts
type Track = 'PROFESSIONAL' | 'GENERAL';
type JobCategory = 'PRODUCT_DESIGN'|'UX'|'UX_RESEARCH'|'PRODUCT_MANAGEMENT'|'FRONTEND'|'SOFTWARE'|'AI'|'TECH_GENERAL'
  |'HOSPITALITY'|'KITCHEN_PORTER'|'CLEANING'|'SECURITY'|'RETAIL'|'WAREHOUSE'|'GENERAL_ENTRY_LEVEL'|'OTHER';
type Eligibility = 'ELIGIBLE'|'POTENTIALLY_ELIGIBLE'|'REQUIRES_REVIEW'|'NOT_ELIGIBLE'|'UNKNOWN';
type ApplicationStatus = 'DISCOVERED'|'DEDUPLICATED'|'CLASSIFIED'|'ELIGIBILITY_CHECKED'|'MATCHED'|'QUEUED'
  |'CV_GENERATING'|'CV_VALIDATED'|'APPLICATION_PREPARING'|'READY_FOR_BROWSER'|'BROWSER_EXECUTING'
  |'SUBMISSION_ATTEMPTED'|'SUBMITTED'|'SKIPPED'|'REJECTED_BY_RULE'|'NEEDS_HUMAN'|'BLOCKED'|'FAILED'|'EXPIRED'|'DUPLICATE';
type ExceptionType = 'CAPTCHA'|'VIDEO_QUESTION'|'LIVE_INTERVIEW'|'UNSUPPORTED_FIELD'|'MISSING_CANDIDATE_DATA'
  |'IDENTITY_VERIFICATION'|'APPLICATION_REQUIRES_SIGNATURE'|'AUTOMATION_BLOCKED'|'UNEXPECTED_QUESTION'
  |'PAYMENT_REQUIRED'|'DUPLICATE_APPLICATION'|'SITE_ERROR'|'LOGIN_REQUIRED'|'CV_VALIDATION_FAILED';
type Outcome = 'NONE'|'REJECTED'|'ASSESSMENT'|'INTERVIEW'|'OFFER'|'WITHDRAWN';
type EvidenceKind = 'SKILL'|'EXPERIENCE'|'ACHIEVEMENT'|'EDUCATION'|'PROJECT'|'CERTIFICATION'|'TRAIT'|'AVAILABILITY'|'OTHER';
type AgentState = 'RUNNING'|'PAUSED'|'STOPPED';

interface ApplicationRow {
  id: string; ref: string;               // ref = "APP-00182"
  status: ApplicationStatus; track: Track | null;
  currentStep: string | null; lastAction: string | null;
  createdAt: string; updatedAt: string; submittedAt: string | null;
  simulated: boolean;                    // produced by the mock browser agent, not a real submission
  exceptionType: ExceptionType | null; humanInterventionReason: string | null; failureReason: string | null;
  outcome: Outcome; browserAgent: string | null; priority: number;
  job: { id: string; title: string; company: string; location: string | null; source: string; url: string;
         category: JobCategory | null; matchScore: number | null; eligibility: Eligibility | null };
  cvProfile: { id: string; name: string; slug: string } | null;
  cvFileName: string | null;
  browserState: { stepReached?: string; fieldsFilled?: string[]; unansweredQuestions?: string[] } | null; // exception cards show stepReached
}

interface MatchResult {
  score: number;                         // 0-100
  requiredSkillsMatched: string[]; requiredSkillsMissing: string[];
  relevantExperience: string[]; concerns: string[];
  eligibility: Eligibility;
  recommendation: 'APPLY' | 'CONSIDER' | 'SKIP';
  breakdown: Record<string, number>;     // per-dimension scores 0-1
}
interface JobClassification { category: JobCategory; confidence: number; alternativeCategories: JobCategory[]; reasoning: string }
interface EligibilityDetails { status: Eligibility; reasons: string[]; sponsorship: { mention: string; evidence: string | null; note: string } }

interface AgentStatusView {
  state: AgentState; running: boolean;
  currentTask: string | null; currentSource: string | null; currentStep: string | null;
  currentApplication: ApplicationRow | null;
  startedAt: string | null; elapsedSeconds: number | null;
  queuePosition: number | null; queueTotal: number | null;
  lastHeartbeat: string | null; nextScheduled: { time: string; action: string } | null;
}
```

## Auth
- `POST /auth/login` `{password}` → `{ok:true}` (sets cookie)
- `POST /auth/logout` → `{ok:true}`
- `GET /auth/me` → `{authenticated:true}` or 401

## Meta
- `GET /meta` → `{ enums: {categories, statuses, exceptionTypes, outcomes, evidenceKinds, tracks}, integrations: {claude:boolean, reed:boolean, adzuna:boolean, browserAgents:string[]}, version }`

## Dashboard / agent
- `GET /dashboard/overview` →
  ```ts
  { today: {discovered, relevant, queued, submitted, needsAttention, failed},
    totals: {submitted, interviews, offers, applications},
    agent: AgentStatusView,
    queuePreview: ApplicationRow[],          // up to 12: in-flight first, then queued
    recentNotifications: Notification[] }
  ```
- `GET /agent/status` → `AgentStatusView`
- `POST /agent/control` `{action: 'RUN_NOW'|'DISCOVER_NOW'|'PAUSE'|'RESUME'|'STOP'|'RETRY_FAILED'|'RETRY_BLOCKED'}` → `{ok:true, message}`

## Applications
- `GET /applications?view=queue|history|exceptions&status=&track=&category=&company=&role=&source=&cvProfile=&from=&to=&q=&page=1&pageSize=25`
  → `{items: ApplicationRow[], total, page, pageSize}`
  - `queue` = QUEUED..SUBMISSION_ATTEMPTED (ordered by status progress, priority)
  - `exceptions` = NEEDS_HUMAN | BLOCKED
  - `history` = everything (filters apply); `from`/`to` are dates (YYYY-MM-DD) on createdAt
- `GET /applications/:id` → `{ application: ApplicationRow & {browserState, submissionEvidence, notes},
    job: Job (all fields incl. description, requirements[], classification, match, eligibilityDetails, salaryText, hoursText, sponsorshipMention),
    documents: Document[], answerSets: AnswerSet[], browserTasks: BrowserTask[], audit: AuditLog[] }`
- `POST /applications/:id/retry` → requeues (status QUEUED, regenerates artifacts)
- `POST /applications/:id/skip` `{reason?}` → SKIPPED
- `POST /applications/:id/resolve` `{action:'MARK_SUBMITTED'|'REQUEUE'|'SKIP', note?, confirmationNumber?}` — used from the Exceptions page after the human finishes the step manually
- `POST /applications/:id/outcome` `{outcome: Outcome}`
- `GET /documents/:id/download` → file stream (auth required; never public)

`Document = {id, kind:'CV'|'COVER_LETTER'|'SUPPORTING', fileName, sha256, sizeBytes, generator, promptVersion, createdAt, content, validation:{valid:boolean, checkedClaims:number, errors:string[], warnings:string[]}}`
`AnswerSet = {id, version, createdAt, answers: {key, question, answer, evidenceIds:string[], source:'LIBRARY'|'CANDIDATE_DATA'|'AI'|'UNKNOWN'}[]}`

## Jobs
- `POST /jobs/import` — manual import. Body: `{url, title, company, description, location?, salaryText?, employmentType?, hoursText?, closingDate?}`
  → `{job, application}` (runs dedupe + classification + eligibility + matching; queues if it qualifies)
- `POST /jobs/import-url` `{url}` — imports from a supported ATS URL (Greenhouse / Lever public job pages) → `{job, application}`
- `GET /jobs/:id` → Job
- `POST /jobs/:id/reanalyse` → `{job, application}`

## Candidate (master profile)
- `GET /candidate` → Candidate with `workAuthorisation, education[], employment[], projects[], skills[], certifications[], evidence[]`
- `PUT /candidate` — personal fields: `fullName, email, phone, headline, addressLine, city, postcode, country, willingToRelocate, maxCommuteMinutes, links:[{label,url}], availability:{startDate?, noticePeriod?, daysAvailable?:string[], shiftsAvailable?:string[], notes?}, preferences:{minSalaryProfessional?, minHourlyGeneral?, remoteTypes?:string[], locations?:string[], excludedCompanies?:string[]}`
- `PUT /candidate/work-authorisation` — `visaType, hasRightToWork, termTimeHoursLimit, vacationWorkAllowed, fullTimeRestrictions, sponsorshipRequired, courseStart, courseEnd, visaExpiry, vacationPeriods:[{start,end,label}], knownRestrictions:string[], guidanceVerifiedAt, notes`
- Collections, each supporting `POST /candidate/<col>`, `PUT /candidate/<col>/:id`, `DELETE /candidate/<col>/:id`:
  - `education`: `institution, qualification, field?, grade?, startDate?, endDate?, inProgress, location?, highlights[]`
  - `employment`: `employer, title, location?, startDate?, endDate?, current, employmentType, description?, tags[], categories[]`
  - `projects`: `name, role?, url?, description?, startDate?, endDate?, shipped, tags[], categories[]`
  - `skills`: `name, aliases[], level?, years?, categories[]`
  - `certifications`: `name, issuer?, issuedAt?, expiresAt?, credentialId?, url?, categories[]`
  - `evidence`: `kind, claim, source, date?, allowedForCV, allowedForApplication, categories[], tags[], employmentId?, projectId?`

## CV profiles
- `GET /cv-profiles` → CvProfile[]
- `POST /cv-profiles`, `PUT /cv-profiles/:id`, `DELETE /cv-profiles/:id` (deactivates if used)
  Fields: `slug, name, track, categories[], targetJobTitles[], targetKeywords[], preferredSkills[], preferredExperience[], excludedExperience[], summaryTemplate, skillOrdering[], experienceOrdering:'RELEVANCE'|'CHRONOLOGICAL', projectSelectionRules:{maxProjects?, requireShipped?, requiredTags?}, maximumPages, template:'classic'|'compact', includeCoverLetter:'ALWAYS'|'WHEN_REQUIRED'|'NEVER', active`
- `POST /cv-profiles/:id/preview` `{jobId?}` → `{content, validation}` — dry-run, nothing saved

## Answer library
- `GET /answers`, `POST /answers`, `PUT /answers/:id`, `DELETE /answers/:id`
  Fields: `key, category, question, patterns[], answer ('UNKNOWN' if not known), track|null, evidenceIds[], verified`

## Settings / sources
- `GET /settings`, `PUT /settings` — `agentState, professionalPerDay, generalPerDay, maxPerDay, minMatchProfessional, minMatchGeneral, autoSubmit, defaultBrowserAgent, schedule:[{time:'HH:MM', action:'DISCOVER'|'ANALYSE'|'PREPARE'|'EXECUTE'|'FULL_CYCLE'}], timezone, searchCriteria:{professional:{keywords[],locations[],remoteOnly?}, general:{keywords[],locations[]}}, termTimeOverride:null|'TERM'|'VACATION'`
- `GET /sources` → `SourceConfig[]` each with `{source, label, enabled, available (credentials present), supportsApplication, maxApplicationsPerHour, maxApplicationsPerDay, cooldownSeconds, maxResultsPerSearch, config, lastRunAt, lastError}`
- `PUT /sources/:source` — update the above (not `available`)

## Audit / notifications / privacy
- `GET /audit?applicationId=&type=&page=&pageSize=` → `{items: AuditLog[], total}` (`AuditLog = {id, at, type, actor, applicationId, jobId, message, data}`)
- `GET /notifications?unread=true` → `Notification[]`; `POST /notifications/:id/read`; `POST /notifications/read-all`
- `GET /privacy/export` → JSON attachment of all data
- `POST /privacy/delete` `{confirm:'DELETE ALL MY DATA'}` → wipes candidate data, jobs, applications and stored files

## Browser-agent handoff API (Bearer AGENT_API_TOKEN)
Used by Claude Cowork / Claude in Chrome sessions. See `docs/BROWSER_AGENTS.md`.
- `GET /agent-tasks/next?agent=cowork|claude-chrome` → `204` or `{taskId, leaseExpiresAt, task: BrowserTaskPayload}`
- `GET /agent-tasks/:taskId/files/:documentId` → the CV / cover letter file for that task only
- `POST /agent-tasks/:taskId/events` `{type:'STEP'|'FIELD_FILLED'|'CV_UPLOADED'|'DOCUMENT_UPLOADED', step?, field?, detail?}`
- `POST /agent-tasks/:taskId/result` → `BrowserResult` (see BROWSER_AGENTS.md)

## Additions (student sponsorship route, CV import, warm-up)
- `ApplicationRow` also has `workContext: 'STANDARD'|'STUDENT_PART_TIME'|'SPONSORED_AFTER_COURSE'|null`, `warmUp: boolean`, and `job.estMonthlyPay`, `job.sponsorLicensed`.
- Candidate collections carry `status: 'DRAFT'|'APPROVED'`; only APPROVED records are used by the agent.
- `POST /candidate/import-cv` `{fileName, contentBase64}` (PDF/DOCX; needs ANTHROPIC_API_KEY) → `{counts, candidate}`; everything is created as DRAFT.
- `POST /candidate/review` `{items?: [{collection, id, action:'APPROVE'|'REJECT'}], approveAll?: boolean}` → `{approved, rejected, candidate}`
- `PUT /candidate/work-authorisation` also takes `seekingSponsoredRoleAfterCourse`, `sponsoredRoleMinSalary`.
- `GET /sponsors/status`, `POST /sponsors/refresh` (download from gov.uk), `POST /sponsors/upload {csvBase64}`, `GET /sponsors/check?company=`
- `GET /dashboard/checklist` → `{items: [{key,label,done,detail,link,required}], ready}`; overview adds `income: {goal, secured, appliedPotential, appliedCount}`.
- Settings add `reviewFirstN`, `monthlyIncomeGoal`. Exception type `REVIEW_BEFORE_SUBMIT` = warm-up application waiting for the user to submit.
