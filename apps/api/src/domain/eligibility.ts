import type { Eligibility, Track, WorkContext } from '@prisma/client';
import { annualise } from './matching.js';
import type { JobLike, WorkAuthLike } from './types.js';

export type StudyPeriod = 'TERM' | 'VACATION' | 'NOT_STUDYING';

export interface EligibilityDetails {
  status: Eligibility;
  reasons: string[];
  period: StudyPeriod;
  workContext: WorkContext;
  assumedHoursPerWeek: number | null;
  earliestStart: string | null; // ISO date when the job can start, if constrained
  sponsorship: { mention: string; evidence: string | null; note: string; potentialOpportunity: boolean; licensedSponsor: boolean | null; registerName: string | null };
}

const RANK: Record<Eligibility, number> = {
  ELIGIBLE: 0,
  POTENTIALLY_ELIGIBLE: 1,
  UNKNOWN: 2,
  REQUIRES_REVIEW: 3,
  NOT_ELIGIBLE: 4,
};

function worst(a: Eligibility, b: Eligibility): Eligibility {
  return RANK[b] > RANK[a] ? b : a;
}

interface Period {
  start: string | Date;
  end: string | Date;
  label?: string;
}

// Places outside the UK (Europe mainly). A UK marker anywhere ("London or Berlin", "Remote UK/EU") keeps it a UK job.
const NON_UK =
  /\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|stuttgart|netherlands|holland|amsterdam|rotterdam|the hague|utrecht|eindhoven|ireland|dublin|cork|galway|france|paris|lyon|toulouse|spain|madrid|barcelona|valencia|portugal|lisbon|porto|italy|milan|rome|turin|belgium|brussels|antwerp|ghent|luxembourg|switzerland|zurich|zürich|geneva|basel|austria|vienna|denmark|copenhagen|sweden|stockholm|gothenburg|malmö|norway|oslo|finland|helsinki|estonia|tallinn|latvia|riga|lithuania|vilnius|poland|warsaw|krakow|kraków|wroclaw|czech|czechia|prague|brno|hungary|budapest|romania|bucharest|greece|athens|cyprus|limassol|malta|croatia|slovenia|bulgaria|sofia|serbia|belgrade|europe|european union|emea)\b/i;
const UK_MARKER = /\b(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|britain|london|manchester|newcastle|sunderland|leeds|birmingham|edinburgh|glasgow|bristol|cardiff|belfast)\b/i;
const RELOCATION = /\b(relocation (support|package|assistance|bonus)|help(ing)? (you )?relocate|we (will |can )?(sponsor|support) (your )?(work )?visa|visa (support|assistance)|eu blue card|blue card|work permit (support|sponsorship))\b/i;

/** True when the job's location is outside the UK (e.g. Berlin, Amsterdam, Dublin, "Remote – Europe"). */
export function outsideUk(location: string | null | undefined): boolean {
  if (!location) return false;
  return NON_UK.test(location) && !UK_MARKER.test(location);
}

const IMMEDIATE_START = /\b(immediate start|start immediately|available immediately|must be able to start (immediately|asap|now))\b/i;

export function isStudent(auth: WorkAuthLike, at: Date): boolean {
  if (auth.termTimeHoursLimit == null) return false;
  return !auth.courseEnd || at <= new Date(auth.courseEnd);
}

export function studyPeriodAt(auth: WorkAuthLike, at: Date, override?: string | null): StudyPeriod {
  if (override === 'TERM') return 'TERM';
  if (override === 'VACATION') return 'VACATION';
  if (auth.termTimeHoursLimit == null) return 'NOT_STUDYING';
  if (auth.courseEnd && at > new Date(auth.courseEnd)) return 'NOT_STUDYING';
  if (auth.courseStart && at < new Date(auth.courseStart)) return 'VACATION';
  const periods = Array.isArray(auth.vacationPeriods) ? (auth.vacationPeriods as Period[]) : [];
  for (const p of periods) {
    if (!p?.start || !p?.end) continue;
    const s = new Date(p.start);
    const e = new Date(p.end);
    e.setHours(23, 59, 59, 999);
    if (at >= s && at <= e) return 'VACATION';
  }
  // Conservative default: assume term time unless a vacation period is configured.
  return 'TERM';
}

/**
 * Which set of rules applies to this job for this candidate.
 *  - A student looking at a full-time professional role (and who has opted into the
 *    Student → Skilled Worker route) is applying for a job that starts after the course.
 *  - Any other job during studies is student work, capped by the term-time hours limit.
 */
export function workContextFor(job: JobLike, auth: WorkAuthLike | null | undefined, track: Track | null, now: Date): WorkContext {
  if (!auth || !isStudent(auth, now)) return 'STANDARD';
  const hours = job.hoursPerWeek ?? (job.employmentType === 'FULL_TIME' ? 37.5 : null);
  const fullTime = job.employmentType === 'FULL_TIME' || (hours != null && auth.termTimeHoursLimit != null && hours > auth.termTimeHoursLimit);
  const sponsorable = !['INTERNSHIP', 'TEMPORARY', 'ZERO_HOURS', 'PART_TIME'].includes(job.employmentType);
  if (track === 'PROFESSIONAL' && fullTime && sponsorable && auth.seekingSponsoredRoleAfterCourse) return 'SPONSORED_AFTER_COURSE';
  return 'STUDENT_PART_TIME';
}

/**
 * Work-authorisation check. Rules are driven entirely by the user's configured
 * WorkAuthorisation record; nothing about UK immigration law is hard-coded beyond
 * "respect the configured limits". The user must verify their configuration against
 * official gov.uk guidance.
 */
export function assessEligibility(
  job: JobLike,
  auth: WorkAuthLike | null | undefined,
  track: Track | null,
  opts: { now?: Date; periodOverride?: string | null } = {},
): EligibilityDetails {
  const now = opts.now ?? new Date();
  const reasons: string[] = [];
  const mention = job.sponsorshipMention ?? 'NONE';
  const sponsorship: EligibilityDetails['sponsorship'] = {
    mention,
    evidence: job.sponsorshipEvidence ?? null,
    note:
      mention === 'OFFERED'
        ? 'The advert mentions sponsorship. This is not a guarantee — confirm with the employer.'
        : mention === 'NOT_OFFERED'
          ? 'The advert states that sponsorship is not offered.'
          : 'No reliable sponsorship information in the advert.',
    potentialOpportunity: false,
    licensedSponsor: job.sponsorLicensed ?? null,
    registerName: job.sponsorMatchName ?? null,
  };
  const assumedHours = job.hoursPerWeek ?? (job.employmentType === 'FULL_TIME' ? 37.5 : null);
  const base = { assumedHoursPerWeek: assumedHours, sponsorship, earliestStart: null as string | null };

  if (!auth) {
    return { ...base, status: 'UNKNOWN', reasons: ['Work authorisation has not been configured in the candidate profile.'], period: 'NOT_STUDYING', workContext: 'STANDARD' };
  }

  const period = studyPeriodAt(auth, now, opts.periodOverride);
  const context = workContextFor(job, auth, track, now);

  if (auth.visaExpiry && new Date(auth.visaExpiry) < now) {
    return { ...base, status: 'REQUIRES_REVIEW', reasons: ['Configured visa expiry date is in the past — update work authorisation.'], period, workContext: context };
  }

  if (outsideUk(job.location)) return abroad(job, auth, track, base, period, now);
  if (context === 'SPONSORED_AFTER_COURSE') return sponsoredAfterCourse(job, auth, base, period);

  let status: Eligibility = 'ELIGIBLE';
  const isFullTime = job.employmentType === 'FULL_TIME';
  const isPermanent = isFullTime;

  // Sponsorship needed for the job itself (not the student route)
  if (context === 'STANDARD' && (!auth.hasRightToWork || auth.sponsorshipRequired)) {
    if (mention === 'NOT_OFFERED') {
      status = worst(status, 'NOT_ELIGIBLE');
      reasons.push('Candidate requires sponsorship and the advert says sponsorship is not offered.');
    } else if (mention === 'OFFERED' || job.sponsorLicensed) {
      status = worst(status, 'POTENTIALLY_ELIGIBLE');
      sponsorship.potentialOpportunity = true;
      reasons.push(mention === 'OFFERED' ? 'Advert mentions sponsorship (not guaranteed).' : `Employer appears on the licensed sponsor register (${job.sponsorMatchName}).`);
    } else {
      status = worst(status, 'REQUIRES_REVIEW');
      reasons.push('Candidate requires sponsorship and the advert does not say whether it is available.');
    }
  }

  // Student work: term-time hours limit
  if (context === 'STUDENT_PART_TIME' && auth.termTimeHoursLimit != null && period === 'TERM') {
    const limit = auth.termTimeHoursLimit;
    if (assumedHours != null && assumedHours > limit) {
      status = worst(status, 'NOT_ELIGIBLE');
      reasons.push(`Role requires ~${assumedHours}h/week, above the configured term-time limit of ${limit}h/week.`);
    } else if (assumedHours == null) {
      status = worst(status, 'POTENTIALLY_ELIGIBLE');
      reasons.push(`Hours not stated — must not exceed ${limit}h/week during term time.`);
    } else {
      reasons.push(`~${assumedHours}h/week is within the configured term-time limit of ${limit}h/week.`);
    }
  }

  if (context === 'STUDENT_PART_TIME' && period === 'VACATION') {
    if (!auth.vacationWorkAllowed) {
      status = worst(status, 'NOT_ELIGIBLE');
      reasons.push('Vacation work is not permitted by the configured work authorisation.');
    } else if (isPermanent) {
      status = worst(status, 'NOT_ELIGIBLE');
      reasons.push('Permanent full-time role during studies; vacation work only covers temporary full-time work.');
    } else {
      reasons.push('Currently in a configured vacation period — temporary full-time work may be permitted.');
    }
  }

  if (context === 'STANDARD' && isPermanent && auth.fullTimeRestrictions) {
    status = worst(status, 'REQUIRES_REVIEW');
    reasons.push(`Permanent full-time role — configured restriction: ${auth.fullTimeRestrictions}`);
  }

  applyKnownRestrictions(job, auth, reasons, (s) => (status = worst(status, s)));

  if (reasons.length === 0) reasons.push('No conflicts with configured work authorisation.');
  return { ...base, status, reasons, period, workContext: context };
}

function applyKnownRestrictions(job: JobLike, auth: WorkAuthLike, reasons: string[], bump: (s: Eligibility) => void) {
  const text = `${job.title}\n${job.description}`.toLowerCase();
  for (const r of auth.knownRestrictions) {
    if (r.toLowerCase().includes('self-employ') && /self[- ]employ|freelance|umbrella/.test(text)) {
      bump('NOT_ELIGIBLE');
      reasons.push(`Restriction "${r}" — advert mentions self-employment/freelance.`);
    }
  }
}

/**
 * Student → Skilled Worker: the application can be made now, but the job can only start
 * after the course end date, and the employer must be able to sponsor.
 */
function sponsoredAfterCourse(
  job: JobLike,
  auth: WorkAuthLike,
  base: Pick<EligibilityDetails, 'assumedHoursPerWeek' | 'sponsorship' | 'earliestStart'>,
  period: StudyPeriod,
): EligibilityDetails {
  const reasons: string[] = [];
  const s = base.sponsorship;
  let status: Eligibility = 'POTENTIALLY_ELIGIBLE';
  const earliestStart = auth.courseEnd ? new Date(auth.courseEnd).toISOString().slice(0, 10) : null;
  reasons.push(`Full-time role: would start after the course ends${earliestStart ? ` (${earliestStart})` : ''}, with Skilled Worker sponsorship.`);

  if (s.mention === 'NOT_OFFERED') {
    status = 'NOT_ELIGIBLE';
    reasons.push('The advert says sponsorship is not offered.');
  } else if (s.mention === 'OFFERED') {
    s.potentialOpportunity = true;
    reasons.push('The advert mentions visa sponsorship (not guaranteed).');
  } else if (job.sponsorLicensed === true) {
    s.potentialOpportunity = true;
    reasons.push(`Employer appears on the register of licensed sponsors as "${job.sponsorMatchName}". Sponsorship still depends on the role.`);
  } else if (job.sponsorLicensed === false) {
    status = 'NOT_ELIGIBLE';
    reasons.push('Advert is silent on sponsorship and the employer was not found on the register of licensed sponsors.');
  } else {
    status = 'REQUIRES_REVIEW';
    reasons.push('Sponsor register not loaded — cannot tell whether this employer can sponsor. Load it in Settings.');
  }

  if (!auth.courseEnd) {
    status = worst(status, 'REQUIRES_REVIEW');
    reasons.push('Course end date is not set, so the earliest start date is unknown.');
  }
  if (IMMEDIATE_START.test(`${job.title}\n${job.description}`)) {
    status = worst(status, 'NOT_ELIGIBLE');
    reasons.push('Advert asks for an immediate start, but the role could only start after the course ends.');
  }

  const salary = job.salaryMax ?? job.salaryMin;
  if (auth.sponsoredRoleMinSalary && salary != null && job.salaryPeriod) {
    const annual = annualise(salary, job.salaryPeriod, job.hoursPerWeek ?? 37.5);
    if (annual != null && annual < auth.sponsoredRoleMinSalary) {
      status = worst(status, 'NOT_ELIGIBLE');
      reasons.push(`Salary ~£${Math.round(annual).toLocaleString('en-GB')} is below the configured sponsorship salary floor (£${auth.sponsoredRoleMinSalary.toLocaleString('en-GB')}).`);
    }
  }

  applyKnownRestrictions(job, auth, reasons, (x) => (status = worst(status, x)));
  return { ...base, status, reasons, period, workContext: 'SPONSORED_AFTER_COURSE', earliestStart };
}

/**
 * Jobs outside the UK. Only full-time professional roles count, starting after the course (if studying), and only
 * where the advert offers visa sponsorship or relocation help. The UK sponsor register doesn't apply abroad.
 */
function abroad(
  job: JobLike,
  auth: WorkAuthLike,
  track: Track | null,
  base: Pick<EligibilityDetails, 'assumedHoursPerWeek' | 'sponsorship' | 'earliestStart'>,
  period: StudyPeriod,
  now: Date,
): EligibilityDetails {
  const studying = isStudent(auth, now);
  const workContext: WorkContext = studying ? 'SPONSORED_AFTER_COURSE' : 'STANDARD';
  const earliestStart = studying && auth.courseEnd ? new Date(auth.courseEnd).toISOString().slice(0, 10) : null;
  const text = `${job.title}\n${job.description}`;
  const reasons: string[] = [`Outside the UK (${job.location}).`];
  const s = base.sponsorship;
  s.licensedSponsor = null;
  s.registerName = null;
  let status: Eligibility = 'POTENTIALLY_ELIGIBLE';

  const fullTimeish = !['PART_TIME', 'ZERO_HOURS', 'TEMPORARY', 'INTERNSHIP'].includes(job.employmentType);
  if (track !== 'PROFESSIONAL' || !fullTimeish) {
    return { ...base, status: 'NOT_ELIGIBLE', reasons: [...reasons, 'Only full-time professional roles abroad are considered; part-time and temporary work must be in the UK.'], period, workContext, earliestStart };
  }
  if (s.mention === 'NOT_OFFERED') {
    status = 'NOT_ELIGIBLE';
    reasons.push('The advert says visa sponsorship is not offered.');
  } else if (s.mention === 'OFFERED' || RELOCATION.test(text)) {
    s.potentialOpportunity = true;
    reasons.push(s.mention === 'OFFERED' ? 'The advert mentions visa sponsorship (not guaranteed).' : 'The advert offers relocation / visa support (not guaranteed).');
  } else {
    status = 'NOT_ELIGIBLE';
    reasons.push("The advert doesn't offer visa sponsorship or relocation, so a non-EU candidate can't take it.");
  }
  if (studying) {
    reasons.push(`Would start after the course ends${earliestStart ? ` (${earliestStart})` : ''}.`);
    if (IMMEDIATE_START.test(text)) {
      status = worst(status, 'NOT_ELIGIBLE');
      reasons.push('Advert asks for an immediate start, but the role could only start after the course ends.');
    }
  }
  applyKnownRestrictions(job, auth, reasons, (x) => (status = worst(status, x)));
  return { ...base, status, reasons, period, workContext, earliestStart };
}
