import type { Track, WorkContext } from '@prisma/client';
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

/**
 * Answers that depend on how the candidate would be working in this job. They are owned
 * by the work context and can never be overridden by the library — otherwise a single
 * "No" to "need sponsorship?" would be sent to full-time roles that do need it.
 */
export const CONTEXT_OWNED_KEYS = new Set(['right_to_work_uk', 'requires_sponsorship', 'visa_type', 'term_time_hours', 'earliest_start']);

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Questions every application form tends to ask; answered straight from candidate data. */
export function deriveStandardAnswers(c: CandidateLike, track: Track, context: WorkContext = 'STANDARD'): PreparedAnswer[] {
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
    ...workAuthAnswers(c, context),
    { key: 'notice_period', question: 'What is your notice period?', answer: avail.noticePeriod ?? UNKNOWN, patterns: ['notice period', 'notice'] },
    {
      key: 'earliest_start',
      question: 'When can you start?',
      answer: context === 'SPONSORED_AFTER_COURSE' ? (auth?.courseEnd ? `From ${fmtDate(auth.courseEnd)}, after my course ends` : UNKNOWN) : avail.startDate ?? UNKNOWN,
      patterns: ['start date', 'when can you start', 'earliest start', 'available to start'],
    },
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

  if (track === 'PROFESSIONAL' || context === 'SPONSORED_AFTER_COURSE') {
    const drop = new Set(['availability_days', 'shift_availability', 'postcode']);
    return out.filter((a) => !drop.has(a.key));
  }
  return out;
}

/**
 * Merge candidate-data answers with the verified library. A *verified* library answer
 * overrides derived data; unverified library answers are only used where data is unknown.
 */
export function prepareAnswers(c: CandidateLike, track: Track, library: AnswerTemplateLike[], context: WorkContext = 'STANDARD'): PreparedAnswer[] {
  const byKey = new Map(deriveStandardAnswers(c, track, context).map((a) => [a.key, a]));
  for (const t of library) {
    if (t.track && t.track !== track) continue;
    if (CONTEXT_OWNED_KEYS.has(t.key)) continue;
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

type RawAnswer = Omit<PreparedAnswer, 'evidenceIds' | 'source'>;

function workAuthAnswers(c: CandidateLike, context: WorkContext): RawAnswer[] {
  const auth = c.workAuthorisation;
  const q = {
    rtw: { key: 'right_to_work_uk', question: 'Do you have the right to work in the UK?', patterns: ['right to work', 'eligible to work in the uk', 'legally entitled to work', 'authorised to work', 'authorized to work'] },
    sponsor: { key: 'requires_sponsorship', question: 'Will you now or in the future require visa sponsorship?', patterns: ['sponsorship', 'require a visa', 'need a visa'] },
    visa: { key: 'visa_type', question: 'What is your immigration / visa status?', patterns: ['visa status', 'immigration status', 'visa type'] },
    hours: { key: 'term_time_hours', question: 'Are there any restrictions on the hours you can work?', patterns: ['restrictions on the hours', 'hours restriction', 'how many hours can you work', 'working hours restrictions'] },
  };
  if (!auth) return Object.values(q).map((x) => ({ ...x, answer: UNKNOWN }));

  if (context === 'SPONSORED_AFTER_COURSE') {
    const end = auth.courseEnd ? fmtDate(auth.courseEnd) : null;
    return [
      { ...q.rtw, answer: `Yes, I currently hold a UK ${auth.visaType} visa. For this role I would need Skilled Worker visa sponsorship${end ? `, starting after my course ends on ${end}` : ''}.` },
      { ...q.sponsor, answer: 'Yes' },
      { ...q.visa, answer: `${auth.visaType} visa; I would switch to a Skilled Worker visa with sponsorship for this role` },
      { ...q.hours, answer: end ? `No restrictions once the role starts after my course ends on ${end} (Skilled Worker visa).` : UNKNOWN },
    ];
  }
  if (context === 'STUDENT_PART_TIME') {
    const limit = auth.termTimeHoursLimit;
    return [
      { ...q.rtw, answer: auth.hasRightToWork ? `Yes, ${auth.visaType} visa${limit != null ? ` (up to ${limit} hours per week during term time${auth.vacationWorkAllowed ? ', full-time during official vacations' : ''})` : ''}` : 'No' },
      { ...q.sponsor, answer: auth.sponsorshipRequired ? 'Yes' : 'No' },
      { ...q.visa, answer: auth.visaType },
      { ...q.hours, answer: limit != null ? `During university term time I can work up to ${limit} hours per week${auth.vacationWorkAllowed ? '; full-time during official vacations' : ''}.` : 'No' },
    ];
  }
  return [
    { ...q.rtw, answer: auth.hasRightToWork ? 'Yes' : 'No' },
    { ...q.sponsor, answer: auth.sponsorshipRequired ? 'Yes' : 'No' },
    { ...q.visa, answer: auth.visaType },
    { ...q.hours, answer: 'No' },
  ];
}
