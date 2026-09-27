import type { CvBullet, CvContent, Ref } from './cvBuilder.js';
import { SKILL_VOCABULARY } from './skillsVocabulary.js';
import { extractNumbers, hasPhrase, normalize, unique } from './text.js';
import type { CandidateLike } from './types.js';

export interface ClaimValidationReport {
  valid: boolean;
  checkedClaims: number;
  errors: string[];
  warnings: string[];
}

const ALL_SKILL_TERMS = unique(Object.values(SKILL_VOCABULARY).flat());

/** Resolve a ref to the candidate text that supports it, or null if it doesn't exist / isn't allowed. */
function resolveRef(ref: Ref, c: CandidateLike, jobTitle: string | null, purpose: 'cv' | 'application'): string | null {
  const [kind, id] = ref.split(/:(.*)/s);
  switch (kind) {
    case 'evidence': {
      const e = c.evidence.find((x) => x.id === id);
      if (!e) return null;
      if (purpose === 'cv' ? !e.allowedForCV : !e.allowedForApplication) return null;
      return e.claim;
    }
    case 'skill': {
      const s = c.skills.find((x) => x.id === id);
      return s ? [s.name, ...s.aliases, s.level ?? '', s.years != null ? `${s.years} years` : ''].join(' ') : null;
    }
    case 'employment': {
      const e = c.employment.find((x) => x.id === id);
      return e ? `${e.title} ${e.employer} ${e.location ?? ''} ${e.description ?? ''}` : null;
    }
    case 'project': {
      const p = c.projects.find((x) => x.id === id);
      return p ? `${p.name} ${p.role ?? ''} ${p.description ?? ''}` : null;
    }
    case 'education': {
      const e = c.education.find((x) => x.id === id);
      return e ? `${e.qualification} ${e.field ?? ''} ${e.institution} ${e.grade ?? ''}` : null;
    }
    case 'certification': {
      const e = c.certifications.find((x) => x.id === id);
      return e ? `${e.name} ${e.issuer ?? ''}` : null;
    }
    case 'candidate':
      if (id === 'headline') return c.headline ?? null;
      if (id === 'availability') return JSON.stringify(c.availability ?? {});
      if (id === 'location') return `${c.city ?? ''} ${c.postcode ?? ''} ${c.country ?? ''}`;
      return null;
    case 'job':
      return id === 'title' && jobTitle ? jobTitle : null;
    default:
      return null;
  }
}

/**
 * Check a generated sentence against the candidate data it cites.
 *  - every ref must exist and be allowed for this purpose
 *  - every number must appear in the supporting text (no invented metrics)
 *  - every recognised skill/tool term must be supported by the refs or the skills table
 */
export function validateSentence(
  text: string,
  refs: Ref[],
  c: CandidateLike,
  jobTitle: string | null,
  purpose: 'cv' | 'application',
): string[] {
  const errors: string[] = [];
  if (!text.trim()) return errors;
  const support: string[] = [];
  for (const r of refs) {
    const t = resolveRef(r, c, jobTitle, purpose);
    if (t == null) errors.push(`Unknown or disallowed reference "${r}" in: "${text.slice(0, 80)}"`);
    else support.push(t);
  }
  // A sentence citing only the job title ("Applying for Kitchen Porter roles.") states intent,
  // not a fact about the candidate; the number and skill checks below still apply to it.
  if (refs.length === 0) errors.push(`Unsupported claim (no candidate evidence cited): "${text.slice(0, 80)}"`);

  const supportText = support.join('\n');
  const supportNumbers = new Set(extractNumbers(supportText));
  for (const n of extractNumbers(text)) {
    if (!supportNumbers.has(n)) errors.push(`Number "${n}" is not in the cited evidence: "${text.slice(0, 80)}"`);
  }

  const skillText = c.skills.map((s) => [s.name, ...s.aliases].join(' ')).join('\n');
  for (const term of ALL_SKILL_TERMS) {
    if (term.length < 3) continue;
    if (hasPhrase(text, term) && !hasPhrase(supportText, term) && !hasPhrase(skillText, term) && !(jobTitle && hasPhrase(jobTitle, term))) {
      errors.push(`Skill/tool "${term}" is not supported by candidate data: "${text.slice(0, 80)}"`);
    }
  }
  return errors;
}

function checkBullet(b: CvBullet, c: CandidateLike, where: string, errors: string[]) {
  const e = c.evidence.find((x) => x.id === b.evidenceId);
  if (!e) errors.push(`${where}: bullet cites missing evidence ${b.evidenceId}`);
  else if (!e.allowedForCV) errors.push(`${where}: evidence ${e.id} is not allowed on CVs`);
  else if (normalize(e.claim) !== normalize(b.text)) errors.push(`${where}: bullet text differs from evidence ${e.id}`);
}

export function validateCv(content: CvContent, c: CandidateLike): ClaimValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  let checked = 0;
  const jobTitle = content.targetJob?.title ?? null;

  if (content.header.name !== c.fullName) errors.push('Header name does not match candidate profile.');
  if (content.header.headline && content.header.headline !== c.headline) errors.push('Headline does not match candidate profile.');

  for (const s of content.summary) {
    checked++;
    errors.push(...validateSentence(s.text, s.refs, c, jobTitle, 'cv'));
  }
  for (const b of content.strengths) {
    checked++;
    checkBullet(b, c, 'Strengths', errors);
  }
  for (const s of content.skills) {
    checked++;
    const skill = c.skills.find((x) => x.id === s.skillId);
    if (!skill || skill.name !== s.name) errors.push(`Skill "${s.name}" is not in the candidate skills table.`);
  }
  for (const x of content.experience) {
    checked++;
    const e = c.employment.find((y) => y.id === x.employmentId);
    if (!e) {
      errors.push(`Employment ${x.employmentId} does not exist.`);
      continue;
    }
    if (e.title !== x.title || e.employer !== x.employer) errors.push(`Employment ${x.employmentId}: title/employer altered.`);
    for (const b of x.bullets) {
      checked++;
      checkBullet(b, c, `${x.title} at ${x.employer}`, errors);
      const ev = c.evidence.find((y) => y.id === b.evidenceId);
      if (ev && ev.employmentId && ev.employmentId !== x.employmentId) errors.push(`Evidence ${ev.id} attributed to the wrong employer.`);
    }
  }
  for (const p of content.projects) {
    checked++;
    const proj = c.projects.find((y) => y.id === p.projectId);
    if (!proj || proj.name !== p.name) errors.push(`Project ${p.projectId} does not match candidate data.`);
    for (const b of p.bullets) {
      checked++;
      checkBullet(b, c, `Project ${p.name}`, errors);
    }
  }
  for (const ed of content.education) {
    checked++;
    const e = c.education.find((y) => y.id === ed.educationId);
    if (!e || e.institution !== ed.institution || e.qualification !== ed.qualification || (e.grade ?? null) !== ed.grade) {
      errors.push(`Education ${ed.educationId} does not match candidate data.`);
    }
  }
  for (const cert of content.certifications) {
    checked++;
    const e = c.certifications.find((y) => y.id === cert.certificationId);
    if (!e || e.name !== cert.name) errors.push(`Certification ${cert.certificationId} does not match candidate data.`);
    else if (e.expiresAt && new Date(e.expiresAt) < new Date()) warnings.push(`Certification "${e.name}" has expired.`);
  }

  if (content.summary.length === 0) warnings.push('No summary could be produced from evidence.');
  if (content.experience.every((e) => e.bullets.length === 0) && content.strengths.length === 0) {
    warnings.push('CV has no evidence-backed bullets — add evidence to the candidate profile.');
  }

  return { valid: errors.length === 0, checkedClaims: checked, errors, warnings };
}
