import type {
  AgentState,
  ApplicationStatus,
  Eligibility,
  EvidenceKind,
  ExceptionType,
  JobCategory,
  Outcome,
  Track,
  WorkContext,
} from '../api/types';

const ACRONYMS: Record<string, string> = { UX: 'UX', AI: 'AI', UK: 'UK', CV: 'CV', URL: 'URL', ATS: 'ATS' };

/** Generic SCREAMING_SNAKE → "Sentence case" with acronyms preserved. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const words = value.split(/[_\s]+/).filter(Boolean);
  return words
    .map((w, i) => {
      const up = w.toUpperCase();
      if (ACRONYMS[up]) return ACRONYMS[up];
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

export const CATEGORIES: JobCategory[] = [
  'PRODUCT_DESIGN', 'UX', 'UX_RESEARCH', 'PRODUCT_MANAGEMENT', 'FRONTEND', 'SOFTWARE', 'AI', 'TECH_GENERAL',
  'HOSPITALITY', 'KITCHEN_PORTER', 'CLEANING', 'SECURITY', 'RETAIL', 'WAREHOUSE', 'GENERAL_ENTRY_LEVEL', 'OTHER',
];

export const CATEGORY_LABELS: Record<JobCategory, string> = {
  PRODUCT_DESIGN: 'Product design',
  UX: 'UX design',
  UX_RESEARCH: 'UX research',
  PRODUCT_MANAGEMENT: 'Product management',
  FRONTEND: 'Frontend',
  SOFTWARE: 'Software',
  AI: 'AI',
  TECH_GENERAL: 'Tech (general)',
  HOSPITALITY: 'Hospitality',
  KITCHEN_PORTER: 'Kitchen porter',
  CLEANING: 'Cleaning',
  SECURITY: 'Security',
  RETAIL: 'Retail',
  WAREHOUSE: 'Warehouse',
  GENERAL_ENTRY_LEVEL: 'General entry-level',
  OTHER: 'Other',
};

export const STATUSES: ApplicationStatus[] = [
  'DISCOVERED', 'DEDUPLICATED', 'CLASSIFIED', 'ELIGIBILITY_CHECKED', 'MATCHED', 'QUEUED', 'CV_GENERATING',
  'CV_VALIDATED', 'APPLICATION_PREPARING', 'READY_FOR_BROWSER', 'BROWSER_EXECUTING', 'SUBMISSION_ATTEMPTED',
  'SUBMITTED', 'SKIPPED', 'REJECTED_BY_RULE', 'NEEDS_HUMAN', 'BLOCKED', 'FAILED', 'EXPIRED', 'DUPLICATE',
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DISCOVERED: 'Discovered',
  DEDUPLICATED: 'Deduplicated',
  CLASSIFIED: 'Classified',
  ELIGIBILITY_CHECKED: 'Eligibility checked',
  MATCHED: 'Matched',
  QUEUED: 'Queued',
  CV_GENERATING: 'Generating CV',
  CV_VALIDATED: 'CV validated',
  APPLICATION_PREPARING: 'Preparing application',
  READY_FOR_BROWSER: 'Ready for browser',
  BROWSER_EXECUTING: 'Applying in browser',
  SUBMISSION_ATTEMPTED: 'Submission attempted',
  SUBMITTED: 'Submitted',
  SKIPPED: 'Skipped',
  REJECTED_BY_RULE: 'Rejected by rule',
  NEEDS_HUMAN: 'Needs you',
  BLOCKED: 'Blocked',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
  DUPLICATE: 'Duplicate',
};

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'grey' | 'slate';

export const IN_FLIGHT: ApplicationStatus[] = [
  'CV_GENERATING', 'CV_VALIDATED', 'APPLICATION_PREPARING', 'READY_FOR_BROWSER', 'BROWSER_EXECUTING', 'SUBMISSION_ATTEMPTED',
];

export function statusTone(s: ApplicationStatus): Tone {
  switch (s) {
    case 'SUBMITTED':
      return 'green';
    case 'NEEDS_HUMAN':
    case 'BLOCKED':
      return 'amber';
    case 'FAILED':
      return 'red';
    case 'QUEUED':
      return 'violet';
    case 'SKIPPED':
    case 'REJECTED_BY_RULE':
    case 'EXPIRED':
    case 'DUPLICATE':
      return 'grey';
    case 'DISCOVERED':
    case 'DEDUPLICATED':
    case 'CLASSIFIED':
    case 'ELIGIBILITY_CHECKED':
    case 'MATCHED':
      return 'slate';
    default:
      return 'blue';
  }
}

export const ELIGIBILITY_LABELS: Record<Eligibility, string> = {
  ELIGIBLE: 'Eligible',
  POTENTIALLY_ELIGIBLE: 'Potentially eligible',
  REQUIRES_REVIEW: 'Requires review',
  NOT_ELIGIBLE: 'Not eligible',
  UNKNOWN: 'Unknown',
};
export function eligibilityTone(e: Eligibility): Tone {
  return e === 'ELIGIBLE' ? 'green' : e === 'POTENTIALLY_ELIGIBLE' ? 'blue' : e === 'REQUIRES_REVIEW' ? 'amber' : e === 'NOT_ELIGIBLE' ? 'red' : 'grey';
}

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  REVIEW_BEFORE_SUBMIT: 'Review before submit',
  CAPTCHA: 'CAPTCHA',
  VIDEO_QUESTION: 'Video question',
  LIVE_INTERVIEW: 'Live interview',
  UNSUPPORTED_FIELD: 'Unsupported field',
  MISSING_CANDIDATE_DATA: 'Missing candidate data',
  IDENTITY_VERIFICATION: 'Identity verification',
  APPLICATION_REQUIRES_SIGNATURE: 'Signature required',
  AUTOMATION_BLOCKED: 'Automation blocked',
  UNEXPECTED_QUESTION: 'Unexpected question',
  PAYMENT_REQUIRED: 'Payment required',
  DUPLICATE_APPLICATION: 'Duplicate application',
  SITE_ERROR: 'Site error',
  LOGIN_REQUIRED: 'Login required',
  CV_VALIDATION_FAILED: 'CV validation failed',
};

export const OUTCOMES: Outcome[] = ['NONE', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'];
export const OUTCOME_LABELS: Record<Outcome, string> = {
  NONE: 'No outcome yet',
  REJECTED: 'Rejected',
  ASSESSMENT: 'Assessment',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  WITHDRAWN: 'Withdrawn',
};
export function outcomeTone(o: Outcome): Tone {
  return o === 'OFFER' ? 'green' : o === 'INTERVIEW' || o === 'ASSESSMENT' ? 'blue' : o === 'REJECTED' ? 'red' : 'grey';
}

export const EVIDENCE_KINDS: EvidenceKind[] = [
  'SKILL', 'EXPERIENCE', 'ACHIEVEMENT', 'EDUCATION', 'PROJECT', 'CERTIFICATION', 'TRAIT', 'AVAILABILITY', 'OTHER',
];

export const WORK_CONTEXT_LABELS: Record<WorkContext, string> = {
  STANDARD: 'Standard',
  STUDENT_PART_TIME: 'Part-time while studying',
  SPONSORED_AFTER_COURSE: 'Sponsored · starts after course',
};
export function workContextTone(w: WorkContext): Tone {
  return w === 'SPONSORED_AFTER_COURSE' ? 'violet' : w === 'STUDENT_PART_TIME' ? 'blue' : 'slate';
}

export const TRACK_LABELS: Record<Track, string> = { PROFESSIONAL: 'Professional', GENERAL: 'General work' };

export function agentTone(s: AgentState): Tone {
  return s === 'RUNNING' ? 'green' : s === 'PAUSED' ? 'amber' : 'grey';
}
export const AGENT_LABELS: Record<AgentState, string> = { RUNNING: 'Running', PAUSED: 'Paused', STOPPED: 'Stopped' };

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'ZERO_HOURS', 'UNKNOWN'] as const;

export const SCHEDULE_ACTIONS = ['DISCOVER', 'ANALYSE', 'PREPARE', 'EXECUTE', 'FULL_CYCLE'] as const;

export const ANSWER_CATEGORIES = [
  'WORK_AUTHORISATION', 'LOCATION', 'AVAILABILITY', 'EDUCATION', 'EXPERIENCE', 'SKILLS', 'SALARY', 'NOTICE',
  'PORTFOLIO', 'MOTIVATION', 'BEHAVIOURAL', 'TECHNICAL',
];

export const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/25',
  amber: 'bg-amber-500/14 text-amber-800 ring-amber-600/30 dark:text-amber-300 dark:ring-amber-400/25',
  red: 'bg-red-500/12 text-red-700 ring-red-600/25 dark:text-red-300 dark:ring-red-400/25',
  blue: 'bg-sky-500/12 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-400/25',
  violet: 'bg-violet-500/12 text-violet-700 ring-violet-600/25 dark:text-violet-300 dark:ring-violet-400/25',
  slate: 'bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300 dark:ring-slate-400/20',
  grey: 'bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400 dark:ring-zinc-400/15',
};

export const TONE_DOT: Record<Tone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
  grey: 'bg-zinc-400',
};
