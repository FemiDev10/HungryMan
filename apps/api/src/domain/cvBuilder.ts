import type { JobCategory } from '@prisma/client';
import { hasPhrase, normalize } from './text.js';
import type {
  CandidateAvailability,
  CandidateLike,
  CvProfileLike,
  EvidenceLike,
  JobLike,
  LinkItem,
} from './types.js';

/**
 * A "ref" points a piece of CV text at the candidate data that supports it:
 *   evidence:<id> | skill:<id> | employment:<id> | education:<id> | project:<id>
 *   certification:<id> | candidate:headline | candidate:availability | job:title
 */
export type Ref = string;

export interface CvSentence {
  text: string;
  refs: Ref[];
}

export interface CvBullet {
  text: string;
  evidenceId: string;
}

export interface CvContent {
  schemaVersion: 1;
  profile: { id: string; slug: string; name: string; track: string; template: string; maximumPages: number };
  targetJob: { title: string; company: string } | null;
  header: { name: string; headline: string | null; email: string | null; phone: string | null; location: string | null; links: LinkItem[] };
  summary: CvSentence[];
  strengths: CvBullet[];
  skills: { skillId: string; name: string }[];
  experience: {
    employmentId: string;
    title: string;
    employer: string;
    location: string | null;
    start: string | null;
    end: string | null;
    current: boolean;
    bullets: CvBullet[];
  }[];
  projects: { projectId: string; name: string; role: string | null; url: string | null; bullets: CvBullet[] }[];
  education: {
    educationId: string;
    institution: string;
    qualification: string;
    field: string | null;
    grade: string | null;
    start: string | null;
    end: string | null;
    inProgress: boolean;
  }[];
  certifications: { certificationId: string; name: string; issuer: string | null; issuedAt: string | null }[];
}

/** Optional plan produced by the AI engine. Only selects/orders evidence and writes a cited summary. */
export interface CvAiPlan {
  summary: CvSentence[];
  evidencePriority: string[]; // evidence ids, most relevant first
  skillPriority: string[]; // skill names, most relevant first
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function relevance(e: EvidenceLike, category: JobCategory, profile: CvProfileLike, jobText: string): number {
  if (profile.excludedExperience.some((t) => e.tags.includes(t))) return -100;
  let s = 0;
  if (e.categories.includes(category)) s += 4;
  else if (e.categories.some((c) => profile.categories.includes(c))) s += 3;
  else if (e.categories.length === 0) s += 1; // generic/transferable
  else s -= 3; // relevant to a different field entirely
  s += 2 * e.tags.filter((t) => profile.preferredExperience.includes(t)).length;
  s += Math.min(3, profile.targetKeywords.filter((k) => hasPhrase(e.claim, k) && hasPhrase(jobText, k)).length);
  if (e.kind === 'ACHIEVEMENT') s += 1;
  return s;
}

export interface BuildCvInput {
  candidate: CandidateLike;
  profile: CvProfileLike;
  job: JobLike | null;
  category: JobCategory;
  plan?: CvAiPlan | null;
}

export function buildCvContent({ candidate, profile, job, category, plan }: BuildCvInput): CvContent {
  const jobText = job ? `${job.title}\n${job.description}\n${job.requirements.join('\n')}` : profile.targetKeywords.join(' ');
  const cvEvidence = candidate.evidence.filter((e) => e.allowedForCV);
  const priority = new Map((plan?.evidencePriority ?? []).map((id, i) => [id, 1000 - i]));
  const rank = (e: EvidenceLike) => (priority.get(e.id) ?? 0) + relevance(e, category, profile, jobText);
  const pages = Math.max(1, profile.maximumPages);
  const bulletsPerRole = profile.track === 'PROFESSIONAL' ? (pages >= 2 ? 5 : 3) : pages >= 2 ? 3 : 2;

  // Experience
  const employment = candidate.employment
    .map((emp) => {
      const bullets = cvEvidence
        // Negative rank = evidence about a different field (e.g. design work on a kitchen porter CV).
        .filter((e) => e.employmentId === emp.id && rank(e) >= 0)
        .sort((a, b) => rank(b) - rank(a))
        .slice(0, bulletsPerRole)
        .map((e) => ({ text: e.claim, evidenceId: e.id }));
      const relevant =
        emp.categories.includes(category) ||
        emp.categories.some((c) => profile.categories.includes(c)) ||
        emp.tags.some((t) => profile.preferredExperience.includes(t));
      const excluded = profile.excludedExperience.some((t) => emp.tags.includes(t));
      return { emp, bullets, relevant, excluded };
    })
    // Keep the role in history (gaps look worse than an unrelated job), but drop explicitly excluded ones.
    .filter((x) => !x.excluded);

  const byDate = (a: (typeof employment)[number], b: (typeof employment)[number]) =>
    (b.emp.current ? 1 : 0) - (a.emp.current ? 1 : 0) ||
    new Date(b.emp.startDate ?? 0).getTime() - new Date(a.emp.startDate ?? 0).getTime();
  if (profile.experienceOrdering === 'RELEVANCE') employment.sort((a, b) => Number(b.relevant) - Number(a.relevant) || byDate(a, b));
  else employment.sort(byDate);

  // Projects
  const rules = (profile.projectSelectionRules ?? {}) as { maxProjects?: number; requireShipped?: boolean; requiredTags?: string[] };
  const maxProjects = rules.maxProjects ?? (profile.track === 'PROFESSIONAL' ? 3 : 0);
  const projects = candidate.projects
    .filter((p) => (!rules.requireShipped || p.shipped) && (!rules.requiredTags?.length || rules.requiredTags.some((t) => p.tags.includes(t))))
    .filter((p) => !profile.excludedExperience.some((t) => p.tags.includes(t)))
    .map((p) => ({
      p,
      s: (p.categories.includes(category) ? 5 : 0) + (p.categories.some((c) => profile.categories.includes(c)) ? 3 : 0) + (p.shipped ? 1 : 0) + p.tags.filter((t) => profile.preferredExperience.includes(t)).length,
    }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, maxProjects)
    .map(({ p }) => ({
      projectId: p.id,
      name: p.name,
      role: p.role ?? null,
      url: p.url ?? null,
      bullets: cvEvidence
        .filter((e) => e.projectId === p.id && rank(e) > -50)
        .sort((a, b) => rank(b) - rank(a))
        .slice(0, 3)
        .map((e) => ({ text: e.claim, evidenceId: e.id })),
    }));

  // Strengths: standalone traits / availability / achievements relevant to this category.
  const strengths = cvEvidence
    .filter((e) => !e.employmentId && !e.projectId && ['TRAIT', 'AVAILABILITY', 'ACHIEVEMENT', 'OTHER'].includes(e.kind))
    .filter((e) => rank(e) >= 1)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, profile.track === 'GENERAL' ? 6 : 4)
    .map((e) => ({ text: e.claim, evidenceId: e.id }));

  // Skills
  const skillPriority = new Map((plan?.skillPriority ?? []).map((n, i) => [normalize(n), 100 - i]));
  const ordering = new Map(profile.skillOrdering.map((n, i) => [normalize(n), 50 - i]));
  const skills = candidate.skills
    .filter((s) => s.categories.length === 0 || s.categories.includes(category) || s.categories.some((c) => profile.categories.includes(c)))
    .map((s) => ({
      s,
      score:
        (skillPriority.get(normalize(s.name)) ?? 0) +
        (ordering.get(normalize(s.name)) ?? 0) +
        ([s.name, ...s.aliases].some((t) => hasPhrase(jobText, t)) ? 30 : 0) +
        (profile.preferredSkills.some((p) => normalize(p) === normalize(s.name)) ? 20 : 0) +
        (s.categories.includes(category) ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, profile.track === 'PROFESSIONAL' ? 14 : 8)
    .map(({ s }) => ({ skillId: s.id, name: s.name }));

  const summary = plan?.summary?.length
    ? plan.summary
    : deterministicSummary(candidate, profile, job, skills, strengths, employment.flatMap((e) => e.bullets));

  const content: CvContent = {
    schemaVersion: 1,
    profile: { id: profile.id, slug: profile.slug, name: profile.name, track: profile.track, template: profile.template, maximumPages: pages },
    targetJob: job ? { title: job.title, company: job.company } : null,
    header: {
      name: candidate.fullName,
      headline: profile.track === 'PROFESSIONAL' ? candidate.headline ?? null : null,
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
      location: [candidate.city, candidate.postcode && profile.track === 'GENERAL' ? candidate.postcode : null].filter(Boolean).join(', ') || null,
      links: profile.track === 'PROFESSIONAL' ? ((candidate.links as LinkItem[]) ?? []).slice(0, 4) : [],
    },
    summary,
    strengths,
    skills,
    // General-work CVs list only roles with relevant points (max 3), so a steward CV doesn't read
    // like a design CV. Omitting roles is fine; nothing is added that isn't in the profile.
    experience: (profile.track === 'GENERAL' ? employment.filter((e) => e.bullets.length > 0).slice(0, 3) : employment).map(({ emp, bullets }) => ({
      employmentId: emp.id,
      title: emp.title,
      employer: emp.employer,
      location: emp.location ?? null,
      start: iso(emp.startDate),
      end: iso(emp.endDate),
      current: emp.current,
      bullets,
    })),
    projects,
    education: candidate.education.map((ed) => ({
      educationId: ed.id,
      institution: ed.institution,
      qualification: ed.qualification,
      field: ed.field ?? null,
      grade: ed.grade ?? null,
      start: iso(ed.startDate),
      end: iso(ed.endDate),
      inProgress: ed.inProgress,
    })),
    certifications: candidate.certifications
      .filter((c) => c.categories.length === 0 || c.categories.includes(category) || c.categories.some((x) => profile.categories.includes(x)))
      .map((c) => ({ certificationId: c.id, name: c.name, issuer: c.issuer ?? null, issuedAt: iso(c.issuedAt) })),
  };

  return fitToPages(content);
}

function deterministicSummary(
  candidate: CandidateLike,
  profile: CvProfileLike,
  job: JobLike | null,
  skills: { skillId: string; name: string }[],
  strengths: CvBullet[],
  bullets: CvBullet[],
): CvSentence[] {
  const topSkills = skills.slice(0, 4);
  const availability = (candidate.availability ?? {}) as CandidateAvailability;
  const availabilityText = [
    availability.daysAvailable?.length ? `Available ${availability.daysAvailable.join(', ')}` : null,
    availability.shiftsAvailable?.length ? `for ${availability.shiftsAvailable.join(', ').toLowerCase()} shifts` : null,
  ]
    .filter(Boolean)
    .join(' ');
  // Professional CVs lead with the strongest measurable result; general-work CVs with a transferable strength.
  const achievement = bullets.find((b) => /\d/.test(b.text)) ?? bullets[0];
  const highlight = profile.track === 'PROFESSIONAL' ? achievement ?? strengths[0] : strengths[0] ?? bullets[0];

  const values: Record<string, { text: string; refs: Ref[] } | null> = {
    headline: candidate.headline ? { text: candidate.headline, refs: ['candidate:headline'] } : null,
    topSkills: topSkills.length ? { text: joinList(topSkills.map((s) => s.name)), refs: topSkills.map((s) => `skill:${s.skillId}`) } : null,
    highlight: highlight ? { text: highlight.text.replace(/\.?$/, '.'), refs: [`evidence:${highlight.evidenceId}`] } : null,
    targetTitle: { text: job?.title ?? profile.targetJobTitles[0] ?? profile.name, refs: job ? ['job:title'] : [] },
    availability: availabilityText ? { text: `${availabilityText}.`, refs: ['candidate:availability'] } : null,
    traits: strengths.length > 1 ? { text: strengths.slice(1, 3).map((s) => s.text.replace(/\.?$/, '.')).join(' '), refs: strengths.slice(1, 3).map((s) => `evidence:${s.evidenceId}`) } : null,
  };

  // Template sentences are split on ". " so each sentence carries only its own refs;
  // a sentence whose placeholder has no data is dropped rather than left half-filled.
  const sentences: CvSentence[] = [];
  for (const raw of profile.summaryTemplate.split(/(?<=[.!?])\s+/)) {
    let ok = true;
    const refs: Ref[] = [];
    const text = raw.replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = values[key];
      if (!v) {
        ok = false;
        return '';
      }
      refs.push(...v.refs);
      return v.text;
    });
    if (ok && text.trim()) sentences.push({ text: text.replace(/\.\./g, '.').trim(), refs });
  }
  return sentences;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Rough line-count model so the document respects maximumPages. */
export function estimateLines(c: CvContent): number {
  const wrap = (t: string) => Math.ceil(t.length / 95);
  let n = 6; // header
  n += 2 + c.summary.reduce((s, x) => s + wrap(x.text), 0);
  if (c.strengths.length) n += 2 + c.strengths.reduce((s, x) => s + wrap(x.text), 0);
  if (c.skills.length) n += 2 + Math.ceil(c.skills.map((s) => s.name).join(' · ').length / 95);
  for (const e of c.experience) n += 2 + e.bullets.reduce((s, b) => s + wrap(b.text), 0);
  for (const p of c.projects) n += 2 + p.bullets.reduce((s, b) => s + wrap(b.text), 0);
  n += 2 + c.education.length * 2 + (c.certifications.length ? 2 + c.certifications.length : 0);
  return n;
}

const LINES_PER_PAGE = 52;

function fitToPages(c: CvContent): CvContent {
  const max = c.profile.maximumPages * LINES_PER_PAGE;
  let guard = 200;
  while (estimateLines(c) > max && guard-- > 0) {
    // Trim the last bullet of the longest trailing section first.
    const withBullets = [...c.experience].reverse().find((e) => e.bullets.length > 1);
    const proj = [...c.projects].reverse().find((p) => p.bullets.length > 1);
    if (c.projects.length > 1 && !proj) c.projects.pop();
    else if (proj) proj.bullets.pop();
    else if (withBullets) withBullets.bullets.pop();
    else if (c.strengths.length > 2) c.strengths.pop();
    else if (c.skills.length > 6) c.skills.pop();
    else break;
  }
  return c;
}
