import type { Eligibility, JobCategory, Track } from '@prisma/client';
import { HARD_REQUIREMENT_PATTERNS, SKILL_VOCABULARY } from './skillsVocabulary.js';
import { hasPhrase, normalize, unique } from './text.js';
import type { CandidateLike, CandidatePreferences, CvProfileLike, JobLike } from './types.js';

export interface MatchResult {
  score: number;
  requiredSkillsMatched: string[];
  requiredSkillsMissing: string[];
  relevantExperience: string[];
  concerns: string[];
  eligibility: Eligibility;
  recommendation: 'APPLY' | 'CONSIDER' | 'SKIP';
  hardBlocks: string[];
  breakdown: Record<string, number>;
}

const WEIGHTS: Record<Track, Record<string, number>> = {
  PROFESSIONAL: {
    roleRelevance: 0.22,
    requiredSkills: 0.22,
    preferredSkills: 0.06,
    experience: 0.16,
    education: 0.06,
    location: 0.08,
    workMode: 0.04,
    salary: 0.05,
    employmentType: 0.03,
    eligibility: 0.06,
    complexity: 0.02,
  },
  GENERAL: {
    roleRelevance: 0.2,
    requiredSkills: 0.1,
    preferredSkills: 0.03,
    experience: 0.1,
    education: 0.02,
    location: 0.2,
    workMode: 0.02,
    salary: 0.08,
    employmentType: 0.08,
    eligibility: 0.15,
    complexity: 0.02,
  },
};

const ELIGIBILITY_SCORE: Record<Eligibility, number> = {
  ELIGIBLE: 1,
  POTENTIALLY_ELIGIBLE: 0.8,
  UNKNOWN: 0.6,
  REQUIRES_REVIEW: 0.45,
  NOT_ELIGIBLE: 0,
};

export function annualise(amount: number, period: string | null | undefined, hoursPerWeek = 37.5): number | null {
  switch (period) {
    case 'YEAR':
      return amount;
    case 'MONTH':
      return amount * 12;
    case 'WEEK':
      return amount * 52;
    case 'DAY':
      return amount * 5 * 52;
    case 'HOUR':
      return amount * hoursPerWeek * 52;
    default:
      return null;
  }
}

function hourly(amount: number, period: string | null | undefined, hoursPerWeek = 37.5): number | null {
  const a = annualise(amount, period, hoursPerWeek);
  return a == null ? null : a / 52 / hoursPerWeek;
}

function candidateSkillNames(c: CandidateLike): { name: string; terms: string[] }[] {
  return c.skills.map((s) => ({ name: s.name, terms: unique([s.name, ...s.aliases].map((t) => t.trim()).filter(Boolean)) }));
}

export interface MatchInput {
  job: JobLike;
  category: JobCategory;
  alternativeCategories: JobCategory[];
  track: Track;
  candidate: CandidateLike;
  profile: CvProfileLike | null;
  eligibility: Eligibility;
  applicationMethod?: string | null;
  now?: Date;
  minScore: number;
}

export function computeMatch(input: MatchInput): MatchResult {
  const { job, category, candidate, profile, track } = input;
  const now = input.now ?? new Date();
  const prefs = (candidate.preferences ?? {}) as CandidatePreferences;
  const concerns: string[] = [];
  const hardBlocks: string[] = [];
  const text = `${job.title}\n${job.description}\n${job.requirements.join('\n')}`;
  const reqText = job.requirements.length ? job.requirements.join('\n') : job.description;
  const prefText = job.preferredRequirements.join('\n');
  const b: Record<string, number> = {};

  // Role relevance
  if (!profile) {
    b.roleRelevance = 0;
    concerns.push(`No active CV profile covers category ${category}.`);
  } else {
    const titleHit = profile.targetJobTitles.some((t) => hasPhrase(job.title, t));
    const inCategory = profile.categories.includes(category);
    b.roleRelevance = titleHit ? 1 : inCategory ? 0.8 : input.alternativeCategories.some((c) => profile.categories.includes(c)) ? 0.5 : 0.2;
  }

  // Skills — only skills the candidate has recorded count as matched.
  const mine = candidateSkillNames(candidate);
  const matched = mine.filter((s) => s.terms.some((t) => hasPhrase(reqText, t) || hasPhrase(text, t))).map((s) => s.name);
  const vocab = unique([...(SKILL_VOCABULARY[category] ?? []), ...(profile?.preferredSkills ?? [])]);
  const asked = vocab.filter((v) => hasPhrase(reqText, v));
  const missing = asked.filter((v) => !mine.some((s) => s.terms.some((t) => normalize(t) === normalize(v))));
  const covered = asked.length - missing.length;
  b.requiredSkills = asked.length === 0 ? (matched.length ? 0.8 : 0.55) : Math.min(1, (covered + 0.5 * Math.min(matched.length, 3)) / (asked.length + 0.5 * Math.min(matched.length, 3)));

  const prefAsked = vocab.filter((v) => prefText && hasPhrase(prefText, v));
  const prefMissing = prefAsked.filter((v) => !mine.some((s) => s.terms.some((t) => normalize(t) === normalize(v))));
  b.preferredSkills = prefAsked.length === 0 ? 0.7 : (prefAsked.length - prefMissing.length) / prefAsked.length;

  // Hard requirements (licences) the candidate cannot evidence
  for (const hr of HARD_REQUIREMENT_PATTERNS) {
    if (hr.pattern.test(text)) {
      const has = candidate.certifications.some((c) => hasPhrase(c.name, hr.label.split(' ')[0])) ||
        candidate.skills.some((s) => hasPhrase(s.name, hr.label.split(' ')[0]) && /licen|check|clear/i.test(s.name)) ||
        candidate.evidence.some((e) => e.allowedForApplication && hasPhrase(e.claim, hr.label));
      if (!has) hardBlocks.push(`Advert requires ${hr.label}; none recorded in candidate profile.`);
    }
  }

  // Experience relevance
  const relevantExperience: string[] = [];
  for (const e of candidate.employment) {
    const excluded = profile?.excludedExperience.some((t) => e.tags.includes(t));
    if (excluded) continue;
    const rel = e.categories.includes(category) || e.tags.some((t) => profile?.preferredExperience.includes(t)) || hasPhrase(text, e.title);
    if (rel) relevantExperience.push(`${e.title} at ${e.employer}`);
  }
  for (const p of candidate.projects) {
    if (p.categories.includes(category) || p.tags.some((t) => profile?.preferredExperience.includes(t))) relevantExperience.push(`Project: ${p.name}`);
  }
  const evidenceHits = candidate.evidence.filter(
    (e) => e.allowedForApplication && (e.categories.length === 0 || e.categories.includes(category)) && e.kind !== 'OTHER',
  ).length;
  b.experience = Math.min(1, relevantExperience.length / (track === 'PROFESSIONAL' ? 3 : 1.5) * 0.8 + Math.min(evidenceHits, 5) * 0.04);
  if (track === 'GENERAL' && relevantExperience.length === 0) {
    b.experience = Math.max(b.experience, 0.45); // entry-level roles; transferable skills
    concerns.push('No direct experience in this field — CV will rely on honest transferable skills.');
  }
  if (track === 'PROFESSIONAL' && relevantExperience.length === 0) concerns.push('No directly relevant experience or projects recorded.');

  // Seniority mismatch
  if (track === 'PROFESSIONAL' && /\b(senior|lead|principal|staff|head of|director)\b/i.test(job.title)) {
    const years = candidate.employment.filter((e) => e.categories.includes(category)).reduce((sum, e) => {
      const start = e.startDate ? new Date(e.startDate).getTime() : null;
      const end = e.current ? now.getTime() : e.endDate ? new Date(e.endDate).getTime() : null;
      return start && end ? sum + (end - start) / (365 * 24 * 3600 * 1000) : sum;
    }, 0);
    if (years < 4) {
      concerns.push(`Senior-level title; ~${years.toFixed(1)} years of directly relevant recorded experience.`);
      b.roleRelevance *= 0.6;
    }
  }

  // Education
  if (track === 'PROFESSIONAL') {
    const hasDegree = candidate.education.some((e) => /(bsc|ba|msc|ma|meng|beng|phd|degree|bachelor|master)/i.test(e.qualification));
    const fieldHit = candidate.education.some((e) => (profile?.targetKeywords ?? []).some((k) => hasPhrase(`${e.field ?? ''} ${e.qualification}`, k)));
    b.education = fieldHit ? 1 : hasDegree ? 0.75 : 0.4;
  } else b.education = 1;

  // Location
  const locs = (prefs.locations ?? []).concat(candidate.city ? [candidate.city] : []);
  if (job.remoteType === 'REMOTE') b.location = 1;
  else if (!job.location) b.location = 0.5;
  else if (locs.some((l) => hasPhrase(job.location ?? '', l))) b.location = 1;
  else if (candidate.willingToRelocate && track === 'PROFESSIONAL') b.location = 0.6;
  else {
    b.location = 0.15;
    concerns.push(`Location "${job.location}" is outside preferred locations.`);
  }

  // Work mode
  const modes = prefs.remoteTypes ?? [];
  b.workMode = modes.length === 0 || job.remoteType === 'UNKNOWN' ? 0.7 : modes.includes(job.remoteType) ? 1 : 0.3;

  // Salary
  b.salary = 0.6;
  const salary = job.salaryMax ?? job.salaryMin;
  if (salary != null && job.salaryPeriod) {
    if (track === 'PROFESSIONAL' && prefs.minSalaryProfessional) {
      const annual = annualise(salary, job.salaryPeriod);
      if (annual != null) {
        b.salary = annual >= prefs.minSalaryProfessional ? 1 : 0.25;
        if (annual < prefs.minSalaryProfessional) concerns.push(`Salary ~£${Math.round(annual)} below preferred minimum £${prefs.minSalaryProfessional}.`);
      }
    } else if (track === 'GENERAL' && prefs.minHourlyGeneral) {
      const hr = hourly(salary, job.salaryPeriod, job.hoursPerWeek ?? 37.5);
      if (hr != null) {
        b.salary = hr >= prefs.minHourlyGeneral ? 1 : 0.25;
        if (hr < prefs.minHourlyGeneral) concerns.push(`Pay ~£${hr.toFixed(2)}/h below preferred minimum £${prefs.minHourlyGeneral}/h.`);
      }
    } else b.salary = 0.8;
  }

  // Employment type / hours
  b.employmentType = job.employmentType === 'UNKNOWN' ? 0.7 : 1;
  if (input.eligibility === 'NOT_ELIGIBLE') b.employmentType = 0;

  b.eligibility = ELIGIBILITY_SCORE[input.eligibility];
  b.complexity = input.applicationMethod === 'EMAIL' ? 0.6 : input.applicationMethod === 'UNKNOWN' || !input.applicationMethod ? 0.8 : 1;

  const weights = WEIGHTS[track];
  let score = 0;
  for (const [k, w] of Object.entries(weights)) score += (b[k] ?? 0) * w;
  score = Math.round(score * 1000) / 10;

  // Hard constraints override any score
  if (input.eligibility === 'NOT_ELIGIBLE') hardBlocks.push('Not eligible under configured work authorisation.');
  if (prefs.excludedCompanies?.some((c) => normalize(c) === normalize(job.company))) hardBlocks.push(`${job.company} is on the excluded companies list.`);
  if (job.closingDate && new Date(job.closingDate) < now) hardBlocks.push('Closing date has passed.');
  if (!profile) hardBlocks.push('No suitable CV profile.');

  let recommendation: MatchResult['recommendation'];
  if (hardBlocks.length) recommendation = 'SKIP';
  else if (input.eligibility === 'REQUIRES_REVIEW') recommendation = score >= input.minScore ? 'CONSIDER' : 'SKIP';
  else recommendation = score >= input.minScore ? 'APPLY' : score >= input.minScore - 10 ? 'CONSIDER' : 'SKIP';

  for (const k of Object.keys(b)) b[k] = Math.round(b[k] * 100) / 100;

  return {
    score,
    requiredSkillsMatched: unique(matched),
    requiredSkillsMissing: unique(missing),
    relevantExperience: unique(relevantExperience),
    concerns: [...concerns, ...hardBlocks],
    eligibility: input.eligibility,
    recommendation,
    hardBlocks,
    breakdown: b,
  };
}
