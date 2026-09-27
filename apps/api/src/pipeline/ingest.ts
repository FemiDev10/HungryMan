import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { dedupeKey } from '../domain/dedupe.js';
import { audit } from '../lib/audit.js';
import type { NormalizedJob } from '../sources/types.js';
import { transition } from './transition.js';

export interface IngestResult {
  jobId: string;
  applicationId: string;
  isNew: boolean;
  duplicate: boolean;
}

/** Normalize → store → dedupe. Every discovered job gets an Application record tracking its pipeline. */
export async function ingestJob(n: NormalizedJob, actor = 'system'): Promise<IngestResult> {
  if (n.sourceJobId) {
    const existing = await prisma.job.findUnique({
      where: { source_sourceJobId: { source: n.source, sourceJobId: n.sourceJobId } },
      include: { application: true },
    });
    if (existing?.application) return { jobId: existing.id, applicationId: existing.application.id, isNew: false, duplicate: false };
  }

  const key = dedupeKey(n.company, n.title, n.location);
  const original = await prisma.job.findFirst({
    where: { dedupeKey: key, duplicateOfId: null, application: { status: { not: 'DUPLICATE' } } },
    orderBy: { discoveredAt: 'asc' },
  });

  const job = await prisma.job.create({
    data: {
      source: n.source,
      sourceJobId: n.sourceJobId,
      url: n.url,
      title: n.title.trim(),
      company: n.company.trim(),
      location: n.location,
      description: n.description,
      remoteType: n.remoteType ?? 'UNKNOWN',
      employmentType: n.employmentType ?? 'UNKNOWN',
      salaryMin: n.salaryMin ?? null,
      salaryMax: n.salaryMax ?? null,
      salaryPeriod: n.salaryPeriod ?? null,
      salaryText: n.salaryText ?? null,
      hoursText: n.hoursText ?? null,
      postedAt: n.postedAt ?? null,
      closingDate: n.closingDate ?? null,
      applicationMethod: n.applicationMethod,
      rawData: (n.rawData ?? undefined) as Prisma.InputJsonValue | undefined,
      dedupeKey: key,
      duplicateOfId: original?.id ?? null,
      application: { create: { status: 'DISCOVERED', lastAction: `Discovered via ${n.source}` } },
    },
    include: { application: true },
  });
  const appId = job.application!.id;
  await audit('JOB_DISCOVERED', `${job.title} — ${job.company} (${n.source})`, { applicationId: appId, jobId: job.id, actor, data: { url: n.url } });

  if (original) {
    await transition(appId, 'DUPLICATE', {}, { message: `Duplicate of job ${original.id} (${original.source})`, actor });
    return { jobId: job.id, applicationId: appId, isNew: true, duplicate: true };
  }
  await transition(appId, 'DEDUPLICATED', {}, { message: 'No duplicate found', actor });
  return { jobId: job.id, applicationId: appId, isNew: true, duplicate: false };
}
