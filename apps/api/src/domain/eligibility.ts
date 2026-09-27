import type { Eligibility, Track } from '@prisma/client';
import type { JobLike, WorkAuthLike } from './types.js';

export type StudyPeriod = 'TERM' | 'VACATION' | 'NOT_STUDYING';

export interface EligibilityDetails {
  status: Eligibility;
  reasons: string[];
  period: StudyPeriod;
  assumedHoursPerWeek: number | null;
  sponsorship: { mention: string; evidence: string | null; note: string; potentialOpportunity: boolean };
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

export function studyPeriodAt(auth: WorkAuthLike, at: Date, override?: string | null): StudyPeriod {
  if (override === 'TERM') return 'TERM';
  if (override === 'VACATION') return 'VACATION';
  if (auth.termTimeHoursLimit == null) return 'NOT_STUDYING';
  if (auth.courseEnd && at > new Date(auth.courseEnd)) return 'VACATION';
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
 * Work-authorisation check. Rules are driven entirely by the user's configured
 * WorkAuthorisation record — nothing about UK immigration law is hard-coded here
 * beyond "respect the configured limits". The user must verify their configuration
 * against official gov.uk guidance.
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
  const sponsorship = {
    mention,
    evidence: job.sponsorshipEvidence ?? null,
    note:
      mention === 'OFFERED'
        ? 'The advert mentions sponsorship. This is not a guarantee — confirm with the employer and check the official register of licensed sponsors.'
        : mention === 'NOT_OFFERED'
          ? 'The advert states that sponsorship is not offered.'
          : 'No reliable sponsorship information in the advert.',
    potentialOpportunity: false,
  };

  if (!auth) {
    return {
      status: 'UNKNOWN',
      reasons: ['Work authorisation has not been configured in the candidate profile.'],
      period: 'NOT_STUDYING',
      assumedHoursPerWeek: job.hoursPerWeek ?? null,
      sponsorship,
    };
  }

  let status: Eligibility = 'ELIGIBLE';
  const period = studyPeriodAt(auth, now, opts.periodOverride);
  const isFullTime = job.employmentType === 'FULL_TIME';
  const assumedHours = job.hoursPerWeek ?? (isFullTime ? 37.5 : null);
  const isPermanent = isFullTime && !['TEMPORARY', 'CONTRACT', 'INTERNSHIP'].includes(job.employmentType);

  if (auth.visaExpiry && new Date(auth.visaExpiry) < now) {
    return {
      status: 'REQUIRES_REVIEW',
      reasons: ['Configured visa expiry date is in the past — update work authorisation.'],
      period,
      assumedHoursPerWeek: assumedHours,
      sponsorship,
    };
  }

  // Sponsorship
  if (!auth.hasRightToWork || auth.sponsorshipRequired) {
    if (mention === 'NOT_OFFERED') {
      status = worst(status, 'NOT_ELIGIBLE');
      reasons.push('Candidate requires sponsorship and the advert says sponsorship is not offered.');
    } else if (mention === 'OFFERED') {
      status = worst(status, 'POTENTIALLY_ELIGIBLE');
      sponsorship.potentialOpportunity = true;
      reasons.push('Candidate requires sponsorship; the advert mentions sponsorship (not guaranteed).');
    } else {
      status = worst(status, 'REQUIRES_REVIEW');
      reasons.push('Candidate requires sponsorship and the advert does not say whether it is available.');
    }
  } else if (track === 'PROFESSIONAL' && isPermanent && mention === 'OFFERED') {
    // Useful for a student who will later need sponsorship for a graduate-level role.
    sponsorship.potentialOpportunity = true;
  }

  // Hours restrictions (e.g. student visa term-time limit)
  if (auth.termTimeHoursLimit != null && period === 'TERM') {
    const limit = auth.termTimeHoursLimit;
    if (assumedHours != null && assumedHours > limit) {
      if (track === 'PROFESSIONAL' && isFullTime) {
        status = worst(status, 'REQUIRES_REVIEW');
        reasons.push(
          `Full-time role (~${assumedHours}h/week) exceeds the configured term-time limit of ${limit}h/week. Only viable if the start date falls after the course end or in vacation — review.`,
        );
      } else {
        status = worst(status, 'NOT_ELIGIBLE');
        reasons.push(`Role requires ~${assumedHours}h/week, above the configured term-time limit of ${limit}h/week.`);
      }
    } else if (assumedHours == null) {
      status = worst(status, 'POTENTIALLY_ELIGIBLE');
      reasons.push(`Hours not stated — must not exceed ${limit}h/week during term time.`);
    } else {
      reasons.push(`~${assumedHours}h/week is within the configured term-time limit of ${limit}h/week.`);
    }
  }

  if (period === 'VACATION' && auth.termTimeHoursLimit != null) {
    if (!auth.vacationWorkAllowed) {
      status = worst(status, 'REQUIRES_REVIEW');
      reasons.push('Vacation work is not permitted by the configured work authorisation.');
    } else {
      reasons.push('Currently in a configured vacation period — full-time temporary work may be permitted.');
    }
  }

  if (isPermanent && auth.fullTimeRestrictions) {
    status = worst(status, 'REQUIRES_REVIEW');
    reasons.push(`Permanent full-time role — configured restriction: ${auth.fullTimeRestrictions}`);
  }

  if (auth.knownRestrictions.length) {
    const text = `${job.title}\n${job.description}`.toLowerCase();
    for (const r of auth.knownRestrictions) {
      const rl = r.toLowerCase();
      if (rl.includes('self-employ') && /self[- ]employ|freelance|umbrella/.test(text)) {
        status = worst(status, 'NOT_ELIGIBLE');
        reasons.push(`Restriction "${r}" — advert mentions self-employment/freelance.`);
      }
    }
  }

  if (reasons.length === 0) reasons.push('No conflicts with configured work authorisation.');
  return { status, reasons, period, assumedHoursPerWeek: assumedHours, sponsorship };
}
