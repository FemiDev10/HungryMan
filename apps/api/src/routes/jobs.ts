import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { analyseApplication } from '../pipeline/analyse.js';
import { ingestJob } from '../pipeline/ingest.js';
import { buildContext } from '../pipeline/orchestrator.js';
import { listSources } from '../sources/registry.js';
import { rowInclude, toRow } from './views.js';

export const jobsRouter = Router();

const ImportSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(300),
  description: z.string().min(20).max(100_000),
  location: z.string().max(300).optional().nullable(),
  salaryText: z.string().max(300).optional().nullable(),
  hoursText: z.string().max(300).optional().nullable(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'ZERO_HOURS', 'UNKNOWN']).optional(),
  closingDate: z.string().optional().nullable(),
});

async function analyseAndReturn(applicationId: string) {
  const ctx = await buildContext('user');
  await analyseApplication(applicationId, ctx);
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: rowInclude });
  const job = await prisma.job.findUniqueOrThrow({ where: { id: app.jobId }, omit: { rawData: true } });
  return { job, application: toRow(app) };
}

jobsRouter.post('/jobs/import', async (req, res) => {
  const b = ImportSchema.parse(req.body);
  const r = await ingestJob(
    {
      source: 'manual',
      sourceJobId: null,
      url: b.url,
      title: b.title,
      company: b.company,
      location: b.location ?? null,
      description: `${b.description}${b.hoursText ? `\n${b.hoursText}` : ''}`,
      salaryText: b.salaryText ?? null,
      hoursText: b.hoursText ?? null,
      employmentType: b.employmentType,
      closingDate: b.closingDate ? new Date(b.closingDate) : null,
      applicationMethod: 'EXTERNAL_URL',
    },
    'user',
  );
  res.status(201).json(await analyseAndReturn(r.applicationId));
});

jobsRouter.post('/jobs/import-url', async (req, res) => {
  const { url } = z.object({ url: z.string().url() }).parse(req.body);
  const source = listSources().find((s) => s.canHandleUrl(url) && s.available());
  if (!source) {
    return res.status(422).json({ error: 'This URL is not from a supported source (Greenhouse, Lever, or Reed with an API key). Use manual import and paste the advert text.' });
  }
  const job = await source.getJob(url);
  if (!job) return res.status(404).json({ error: 'Could not load that job from the source API.' });
  const r = await ingestJob(job, 'user');
  res.status(201).json(await analyseAndReturn(r.applicationId));
});

jobsRouter.get('/jobs/:id', async (req, res) => {
  res.json(await prisma.job.findUniqueOrThrow({ where: { id: req.params.id }, omit: { rawData: true } }));
});

jobsRouter.post('/jobs/:id/reanalyse', async (req, res) => {
  const app = await prisma.application.findUniqueOrThrow({ where: { jobId: req.params.id } });
  if (['SUBMITTED', 'SUBMISSION_ATTEMPTED', 'BROWSER_EXECUTING'].includes(app.status)) return res.status(409).json({ error: `Cannot re-analyse while ${app.status}` });
  await prisma.application.update({ where: { id: app.id }, data: { status: 'DEDUPLICATED', lastAction: 'Re-analysis requested', failureReason: null } });
  res.json(await analyseAndReturn(app.id));
});
