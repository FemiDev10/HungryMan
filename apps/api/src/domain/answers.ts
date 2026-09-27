import type { Track } from '@prisma/client';
import { hasPhrase, normalize } from './text.js';
import type { CandidateAvailability, CandidateLike, CandidatePreferences, LinkItem } from './types.js';

export const UNKNOWN = 'UNKNOWN';

export interface AnswerTemplateLike {
  key: string;
  category: string;
  question: string;
  patterns: string[];
  answer: string;
  track: Track | null;
  evidenceIds: string[];
  verified: boolean;
}

export interface PreparedAnswer {
  key: string;
  question: string;
  answer: string;
  evidenceIds: string[];
  source: 'LIBRARY' | 'CANDIDATE_DATA' | 'AI' | 'UNKNOWN';
  patterns: string[];
}

/** Questions every application form tends to ask; answered straight from candidate data. */
export function deriveStandardAnswers(c: CandidateLike, track: Track): PreparedAnswer[] {
  const auth = c.workAuthorisation;
  const avail = (c.availability ?? {}) as CandidateAvailability;
  const prefs = (c.preferences ?? {}) as CandidatePreferences;
  const links = (Array.isArray(c.links) ? c.links : []) as LinkItem[];
  const link = (re: RegExp) => links.find((l) => re.test(l.label) || re.test(l.url))?.url ?? UNKNOWN;
  const highestEd = [...c.education].sort((a, b) => new Date(b.endDate ?? 0).getTime() - new Date(a.endDate ?? 0).getTime())[0];

  const out: PreparedAnswer[] = [
    { key: 'full_name', question: 'Full name', answer: c.fullName, patterns: ['full name', 'name'] },
    { key: 'email', question: 'Email address', answer: c.email ?? UNKNOWN, patterns: ['email'] },
    { key: 'phone', question: 'Phone number', answer: c.phone ?? UNKNOWN, patterns: ['phone', 'mobile', 'telephone'] },
    { key: 'location', question: 'Current location', answer: [c.city, c.country].filter(Boolean).join(', ') || UNKNOWN, patterns: ['location', 'where are you based', 'city'] },
    { key: 'postcode', question: 'Postcode', answer: c.postcode ?? UNKNOWN, patterns: ['postcode', 'post code', 'zip'] },
    {
      key: 'right_to_work_uk',
      question: 'Do you have the right to work in the UK?',
      answer: auth ? (auth.hasRightToWork ? 'Yes' : 'No') : UNKNOWN,
      patterns: ['right to work', 'eligible to work in the uk', 'legally entitled to work', 'authorised to work', 'authorized to work'],
    },
    {
      key: 'requires_sponsorship',
      question: 'Will you now or in the future require visa sponsorship?',
      answer: auth ? (auth.sponsorshipRequired ? 'Yes' : 'No') : UNKNOWN,
      patterns: ['sponsorship', 'require a visa', 'need a visa'],
    },
    { key: 'visa_type', question: 'What is your immigration / visa status?', answer: auth?.visaType ?? UNKNOWN, patterns: ['visa status', 'immigration status', 'visa type'] },
    {
      key: 'term_time_hours',
      question: 'Are there any restrictions on the hours you can work?',
      answer: auth ? (auth.termTimeHoursLimit != null ? `During university term time I can work up to ${auth.termTimeHoursLimit} hours per week${auth.vacationWorkAllowed ? '; full-time during official vacations' : ''}.` : 'No') : UNKNOWN,
      patterns: ['restrictions on the hours', 'hours restriction', 'how many hours can you work', 'working hours restrictions'],
    },
    { key: 'notice_period', question: 'What is your notice period?', answer: avail.noticePeriod ?? UNKNOWN, patterns: ['notice period', 'notice'] },
    { key: 'earliest_start', question: 'When can you start?', answer: avail.startDate ?? UNKNOWN, patterns: ['start date', 'when can you start', 'earliest start', 'available to start'] },
    { key: 'availability_days', question: 'Which days are you available?', answer: avail.daysAvailable?.length ? avail.daysAvailable.join(', ') : UNKNOWN, patterns: ['days available', 'availability', 'which days'] },
    { key: 'shift_availability', question: 'Which shifts can you work?', answer: avail.shiftsAvailable?.length ? avail.shiftsAvailable.join(', ') : UNKNOWN, patterns: ['shifts', 'evenings', 'weekends', 'nights'] },
    {
      key: 'salary_expectation',
      question: 'What are your salary expectations?',
      answer: track === 'PROFESSIONAL' ? (prefs.minSalaryProfessional ? `£${prefs.minSalaryProfessional.toLocaleString('en-GB')} per year` : UNKNOWN) : prefs.minHourlyGeneral ? `£${prefs.minHourlyGeneral.toFixed(2)} per hour` : UNKNOWN,
      patterns: ['salary expectation', 'expected salary', 'desired salary', 'desired pay', 'salary requirements'],
    },
    { key: 'portfolio_url', question: 'Portfolio URL', answer: link(/portfolio|behance|dribbble|website/i), patterns: ['portfolio', 'website', 'personal site'] },
    { key: 'linkedin_url', question: 'LinkedIn profile', answer: link(/linkedin/i), patterns: ['linkedin'] },
    { key: 'github_url', question: 'GitHub profile', answer: link(/github/i), patterns: ['github'] },
    {
      key: 'highest_education',
      question: 'Highest level of education',
      answer: highestEd ? `${highestEd.qualification}${highestEd.field ? ` in ${highestEd.field}` : ''}, ${highestEd.institution}${highestEd.inProgress ? ' (in progress)' : ''}` : UNKNOWN,
      patterns: ['highest level of education', 'education level', 'qualification'],
    },
  ].map((a) => ({ ...a, evidenceIds: [], source: a.answer === UNKNOWN ? ('UNKNOWN' as const) : ('CANDIDATE_DATA' as const) }));

  if (track === 'PROFESSIONAL') {
    const drop = new Set(['availability_days', 'shift_availability', 'postcode']);
    return out.filter((a) => !drop.has(a.key));
  }
  return out;
}

/**
 * Merge candidate-data answers with the verified library. A *verified* library answer
 * overrides derived data; unverified library answers are only used where data is unknown.
 */
export function prepareAnswers(c: CandidateLike, track: Track, library: AnswerTemplateLike[]): PreparedAnswer[] {
  const byKey = new Map(deriveStandardAnswers(c, track).map((a) => [a.key, a]));
  for (const t of library) {
    if (t.track && t.track !== track) continue;
    const existing = byKey.get(t.key);
    const libAnswer: PreparedAnswer = {
      key: t.key,
      question: t.question,
      answer: t.answer?.trim() ? t.answer : UNKNOWN,
      evidenceIds: t.evidenceIds,
      source: t.answer?.trim() && t.answer !== UNKNOWN ? 'LIBRARY' : 'UNKNOWN',
      patterns: t.patterns.length ? t.patterns : existing?.patterns ?? [normalize(t.question)],
    };
    if (!existing) {
      // Unverified library answers are exposed as UNKNOWN so the agent never submits a guess.
      byKey.set(t.key, t.verified ? libAnswer : { ...libAnswer, answer: UNKNOWN, source: 'UNKNOWN' });
    } else if (t.verified && libAnswer.source === 'LIBRARY') byKey.set(t.key, libAnswer);
    else if (existing.answer === UNKNOWN && t.verified) byKey.set(t.key, libAnswer);
  }
  return [...byKey.values()];
}

/** Find the prepared answer for a free-text form question. */
export function findAnswer(question: string, answers: PreparedAnswer[]): PreparedAnswer | null {
  let best: { a: PreparedAnswer; len: number } | null = null;
  for (const a of answers) {
    for (const p of a.patterns) {
      if (hasPhrase(question, p) && (!best || p.length > best.len)) best = { a, len: p.length };
    }
  }
  return best?.a ?? null;
}
