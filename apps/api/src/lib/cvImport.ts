import type { CvImport } from '../ai/claude.js';
import { prisma } from '../db.js';
import { audit } from './audit.js';

const toDate = (s: string | null | undefined) => {
  if (!s) return null;
  const m = s.match(/^(\d{4})(?:-(\d{2}))?/);
  return m ? new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1)) : null;
};

/**
 * Store an extracted CV as DRAFT records. Nothing here is used by the agent until the
 * candidate approves it. Personal details only fill fields that are currently empty.
 */
type ImportData = Omit<CvImport, 'employment' | 'education'> & {
  employment: (CvImport['employment'][number] & { datesText?: string | null; titleVariants?: Record<string, string> })[];
  education: (CvImport['education'][number] & { datesText?: string | null; highlights?: string[] })[];
};

/** When the source only gave years, show years — never invent months. */
const yearsOnly = (start: string | null | undefined, end: string | null | undefined, ongoing: boolean) => {
  const y = /^\d{4}$/;
  if (!start || !y.test(start) || (end && !y.test(end))) return null;
  return `${start} – ${ongoing ? 'Present' : end ?? start}`;
};

export async function saveCvImport(candidateId: string, data: ImportData, fileName: string) {
  const source = `Imported from CV (${fileName})`;
  const counts = { employment: 0, education: 0, projects: 0, skills: 0, certifications: 0, evidence: 0 };

  const c = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
  const p = data.personal;
  const existingLinks = Array.isArray(c.links) ? (c.links as { label: string; url: string }[]) : [];
  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      fullName: c.fullName === 'Your Name' && p.fullName ? p.fullName : undefined,
      email: c.email ?? p.email ?? undefined,
      phone: c.phone ?? p.phone ?? undefined,
      city: c.city ?? p.city ?? undefined,
      headline: c.headline ?? p.headline ?? undefined,
      links: existingLinks.length ? undefined : p.links.filter((l) => /^https?:\/\//.test(l.url)),
    },
  });

  const employmentIds = new Map<string, string>();
  for (const [i, e] of data.employment.entries()) {
    const row = await prisma.employment.create({
      data: { candidateId, employer: e.employer, title: e.title, location: e.location, startDate: toDate(e.startDate), endDate: e.current ? null : toDate(e.endDate), current: e.current, description: e.description, tags: e.tags, categories: e.categories, datesText: e.datesText ?? yearsOnly(e.startDate, e.endDate, e.current), titleVariants: e.titleVariants ?? {}, sortOrder: i, status: 'DRAFT' },
    });
    employmentIds.set(e.ref, row.id);
    counts.employment++;
  }
  const projectIds = new Map<string, string>();
  for (const [i, pr] of data.projects.entries()) {
    const row = await prisma.project.create({
      data: { candidateId, name: pr.name, role: pr.role, url: pr.url && /^https?:\/\//.test(pr.url) ? pr.url : null, description: pr.description, shipped: pr.shipped, tags: pr.tags, categories: pr.categories, sortOrder: i, status: 'DRAFT' },
    });
    projectIds.set(pr.ref, row.id);
    counts.projects++;
  }
  for (const ed of data.education) {
    await prisma.education.create({ data: { candidateId, institution: ed.institution, qualification: ed.qualification, field: ed.field, grade: ed.grade, startDate: toDate(ed.startDate), endDate: toDate(ed.endDate), inProgress: ed.inProgress, highlights: ed.highlights ?? [], datesText: ed.datesText ?? yearsOnly(ed.startDate, ed.endDate, false), status: 'DRAFT' } });
    counts.education++;
  }
  const existingSkills = new Set((await prisma.skill.findMany({ where: { candidateId }, select: { name: true } })).map((s) => s.name.toLowerCase()));
  for (const sk of data.skills) {
    if (existingSkills.has(sk.name.toLowerCase())) continue;
    existingSkills.add(sk.name.toLowerCase());
    await prisma.skill.create({ data: { candidateId, name: sk.name, categories: sk.categories, status: 'DRAFT' } });
    counts.skills++;
  }
  for (const ce of data.certifications) {
    await prisma.certification.create({ data: { candidateId, name: ce.name, issuer: ce.issuer, issuedAt: toDate(ce.issuedAt), status: 'DRAFT' } });
    counts.certifications++;
  }
  for (const ev of data.evidence) {
    if (ev.claim.trim().length < 3) continue;
    await prisma.evidence.create({
      data: {
        candidateId,
        kind: ev.kind,
        claim: ev.claim.trim().slice(0, 2000),
        source,
        categories: ev.categories,
        tags: ev.tags,
        employmentId: ev.employmentRef ? employmentIds.get(ev.employmentRef) ?? null : null,
        projectId: ev.projectRef ? projectIds.get(ev.projectRef) ?? null : null,
        status: 'DRAFT',
      },
    });
    counts.evidence++;
  }
  await audit('CANDIDATE_UPDATED', `CV imported as drafts: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`, { actor: 'user', data: { fileName, counts } });
  return counts;
}
