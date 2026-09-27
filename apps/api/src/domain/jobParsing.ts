import type { EmploymentType, RemoteType } from '@prisma/client';
import { hasPhrase, normalize } from './text.js';

export interface ParsedJobFacts {
  remoteType: RemoteType;
  employmentType: EmploymentType;
  hoursPerWeek: number | null;
  hoursText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  sponsorshipMention: 'NONE' | 'OFFERED' | 'NOT_OFFERED' | 'UNCLEAR';
  sponsorshipEvidence: string | null;
  requirements: string[];
  preferredRequirements: string[];
}

export function detectRemoteType(text: string): RemoteType {
  const t = normalize(text);
  if (/\bhybrid\b/.test(t)) return 'HYBRID';
  if (/\b(fully remote|remote first|remote-first|100% remote|work from home|remote role|remote \(uk\)|remote uk)\b/.test(t) || /^remote\b/.test(t)) return 'REMOTE';
  if (/\b(on-site|onsite|on site|in office|office based|office-based)\b/.test(t)) return 'ONSITE';
  return 'UNKNOWN';
}

export function detectEmploymentType(text: string): EmploymentType {
  const t = normalize(text);
  if (/\bzero[- ]hours?\b/.test(t)) return 'ZERO_HOURS';
  if (/\b(internship|intern)\b/.test(t)) return 'INTERNSHIP';
  if (/\bpart[- ]time\b/.test(t)) return 'PART_TIME';
  if (/\b(temporary|temp role|seasonal)\b/.test(t)) return 'TEMPORARY';
  if (/\b(contract|contractor|freelance|fixed[- ]term)\b/.test(t)) return 'CONTRACT';
  if (/\b(full[- ]time|permanent)\b/.test(t)) return 'FULL_TIME';
  return 'UNKNOWN';
}

export function detectHours(text: string): { hoursPerWeek: number | null; hoursText: string | null } {
  const re = /(\d{1,2}(?:\.\d)?)\s*(?:-|to|–)?\s*(\d{1,2}(?:\.\d)?)?\s*(?:hours|hrs)\s*(?:per|a|each|\/)\s*week/i;
  const m = text.match(re);
  if (m) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    return { hoursPerWeek: Math.max(a, b), hoursText: m[0] };
  }
  const m2 = text.match(/(\d{1,2})\s*(?:hours|hrs)\s*(?:weekly|pw|p\/w)/i);
  if (m2) return { hoursPerWeek: Number(m2[1]), hoursText: m2[0] };
  return { hoursPerWeek: null, hoursText: null };
}

function parseMoney(s: string): number {
  const cleaned = s.replace(/[£$€,\s]/g, '');
  const k = /k$/i.test(cleaned);
  const n = Number(cleaned.replace(/k$/i, ''));
  return k ? n * 1000 : n;
}

export function detectSalary(text: string): Pick<ParsedJobFacts, 'salaryMin' | 'salaryMax' | 'salaryPeriod' | 'salaryText'> {
  const re = /£\s?(\d[\d,.]*k?)\s*(?:-|to|–)?\s*(?:£\s?(\d[\d,.]*k?))?\s*(?:per|an|a|\/|p\.?)?\s*(hour|hr|annum|year|yr|pa|day|week|month)?/i;
  const m = text.match(re);
  if (!m) return { salaryMin: null, salaryMax: null, salaryPeriod: null, salaryText: null };
  const min = parseMoney(m[1]);
  const max = m[2] ? parseMoney(m[2]) : min;
  const unit = (m[3] ?? '').toLowerCase();
  let period: string | null = null;
  if (['hour', 'hr'].includes(unit)) period = 'HOUR';
  else if (['annum', 'year', 'yr', 'pa'].includes(unit)) period = 'YEAR';
  else if (unit === 'day') period = 'DAY';
  else if (unit === 'week') period = 'WEEK';
  else if (unit === 'month') period = 'MONTH';
  else period = max < 100 ? 'HOUR' : max > 5000 ? 'YEAR' : null;
  return { salaryMin: min, salaryMax: max, salaryPeriod: period, salaryText: m[0].trim() };
}

const SPONSOR_NEGATIVE = [
  'unable to offer sponsorship',
  'unable to sponsor',
  'cannot offer sponsorship',
  'cannot sponsor',
  'can not sponsor',
  'do not offer sponsorship',
  'does not offer sponsorship',
  'not able to sponsor',
  'no sponsorship',
  'sponsorship is not available',
  'sponsorship not available',
  'must have the right to work in the uk without sponsorship',
  'without the need for sponsorship',
  'without requiring sponsorship',
  'will not sponsor',
  'we do not sponsor',
];
const SPONSOR_POSITIVE = [
  'visa sponsorship available',
  'sponsorship available',
  'we can sponsor',
  'we offer visa sponsorship',
  'visa sponsorship is available',
  'able to sponsor',
  'skilled worker visa sponsorship',
  'sponsorship can be provided',
  'licensed sponsor',
  'will sponsor',
];

export function detectSponsorship(text: string): { mention: ParsedJobFacts['sponsorshipMention']; evidence: string | null } {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const s of sentences) {
    if (SPONSOR_NEGATIVE.some((p) => hasPhrase(s, p))) return { mention: 'NOT_OFFERED', evidence: s.trim().slice(0, 300) };
  }
  for (const s of sentences) {
    if (SPONSOR_POSITIVE.some((p) => hasPhrase(s, p))) return { mention: 'OFFERED', evidence: s.trim().slice(0, 300) };
  }
  for (const s of sentences) {
    if (/sponsor|visa|right to work/i.test(s)) return { mention: 'UNCLEAR', evidence: s.trim().slice(0, 300) };
  }
  return { mention: 'NONE', evidence: null };
}

/** Pull bullet-ish lines from requirement sections. Heuristic, deliberately conservative. */
export function extractRequirements(text: string): { requirements: string[]; preferred: string[] } {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const requirements: string[] = [];
  const preferred: string[] = [];
  let mode: 'none' | 'req' | 'pref' = 'none';
  for (const line of lines) {
    const l = line.toLowerCase();
    const isHeading = line.length < 80 && !/^[-*•·]/.test(line) && /:$|^(requirements|what you|you have|you will have|about you|skills|qualifications|essential|desirable|nice to have|bonus|preferred|who you are|what we.re looking for)/i.test(line);
    if (isHeading) {
      if (/(desirable|nice to have|bonus|preferred|plus)/.test(l)) mode = 'pref';
      else if (/(requirement|you have|you.ll have|you will have|about you|skills|qualification|essential|looking for|who you are|experience)/.test(l)) mode = 'req';
      else mode = 'none';
      continue;
    }
    const bullet = line.replace(/^[-*•·]\s*/, '');
    if (mode !== 'none' && bullet.length > 3 && bullet.length < 300) {
      (mode === 'req' ? requirements : preferred).push(bullet);
    }
  }
  return { requirements: requirements.slice(0, 25), preferred: preferred.slice(0, 15) };
}

export function parseJobFacts(title: string, description: string, extra: { location?: string | null; salaryText?: string | null; hoursText?: string | null } = {}): ParsedJobFacts {
  const all = [title, extra.location ?? '', extra.salaryText ?? '', extra.hoursText ?? '', description].join('\n');
  const hours = detectHours(all);
  const salary = detectSalary(extra.salaryText ? `${extra.salaryText}\n${description}` : description);
  const sponsorship = detectSponsorship(description);
  const reqs = extractRequirements(description);
  return {
    remoteType: detectRemoteType(all),
    employmentType: detectEmploymentType(all),
    ...hours,
    ...salary,
    sponsorshipMention: sponsorship.mention,
    sponsorshipEvidence: sponsorship.evidence,
    requirements: reqs.requirements,
    preferredRequirements: reqs.preferred,
  };
}
