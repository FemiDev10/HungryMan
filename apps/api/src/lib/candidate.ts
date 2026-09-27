import { prisma } from '../db.js';
import { approvedOnly } from '../domain/types.js';

export const candidateInclude = {
  workAuthorisation: true,
  education: { orderBy: [{ sortOrder: 'asc' as const }, { endDate: 'desc' as const }] },
  employment: { orderBy: [{ sortOrder: 'asc' as const }, { startDate: 'desc' as const }] },
  projects: { orderBy: [{ sortOrder: 'asc' as const }] },
  skills: { orderBy: [{ name: 'asc' as const }] },
  certifications: true,
  evidence: { orderBy: [{ createdAt: 'asc' as const }] },
};

/** Single-user system: the first candidate row is the master profile (created on demand). */
export async function getCandidate() {
  const existing = await prisma.candidate.findFirst({ include: candidateInclude, orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  return prisma.candidate.create({ data: { fullName: 'Your Name' }, include: candidateInclude });
}

export type FullCandidate = Awaited<ReturnType<typeof getCandidate>>;

/** The candidate as the agent sees it: imported drafts are invisible until approved. */
export async function getApprovedCandidate(): Promise<FullCandidate> {
  return approvedOnly(await getCandidate());
}

export async function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}
