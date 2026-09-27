import type { ApplicationStatus, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ATTENTION, IN_QUEUE, PIPELINE_ORDER } from '../domain/stateMachine.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notify.js';
import { transition } from '../pipeline/transition.js';
import { storage } from '../storage/storage.js';
import { rowInclude, toRow } from './views.js';

export const applicationsRouter = Router();

const ListQuery = z.object({
  view: z.enum(['queue', 'history', 'exceptions']).default('history'),
  status: z.string().optional(),
  track: z.enum(['PROFESSIONAL', 'GENERAL']).optional(),
  category: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  source: z.string().optional(),
  cvProfile: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

applicationsRouter.get('/applications', async (req, res) => {
  const q = ListQuery.parse(req.query);
  const where: Prisma.ApplicationWhereInput = {};
  const job: Prisma.JobWhereInput = {};
  if (q.view === 'queue') where.status = { in: IN_QUEUE };
  if (q.view === 'exceptions') where.status = { in: ATTENTION };
  if (q.status) where.status = { in: q.status.split(',') as ApplicationStatus[] };
  if (q.track) where.track = q.track;
  if (q.cvProfile) where.cvProfile = { OR: [{ slug: q.cvProfile }, { id: q.cvProfile }] };
  if (q.category) job.category = { in: q.category.split(',') as never };
  if (q.company) job.company = { contains: q.company, mode: 'insensitive' };
  if (q.role) job.title = { contains: q.role, mode: 'insensitive' };
  if (q.source) job.source = q.source;
  if (q.q) job.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { company: { contains: q.q, mode: 'insensitive' } }];
  if (Object.keys(job).length) where.job = job;
  if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(new Date(q.to).getTime() + 86_400_000) } : {}) };

  const [items, total] = await Promise.all([
    prisma.application.findMany({ where, include: rowInclude, orderBy: q.view === 'queue' ? [{ priority: 'desc' }, { updatedAt: 'desc' }] : [{ updatedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.application.count({ where }),
  ]);
  let rows = items.map(toRow);
  if (q.view === 'queue') rows = rows.sort((a, b) => PIPELINE_ORDER.indexOf(b.status) - PIPELINE_ORDER.indexOf(a.status) || b.priority - a.priority);
  res.json({ items: rows, total, page: q.page, pageSize: q.pageSize });
});

applicationsRouter.get('/applications/:id', async (req, res) => {
  const a = await prisma.application.findUniqueOrThrow({ where: { id: req.params.id }, include: rowInclude });
  const [job, documents, answerSets, browserTasks, auditLogs] = await Promise.all([
    prisma.job.findUniqueOrThrow({ where: { id: a.jobId } }),
    prisma.document.findMany({ where: { applicationId: a.id }, orderBy: { createdAt: 'desc' }, omit: { storageKey: true } }),
    prisma.answerSet.findMany({ where: { applicationId: a.id }, orderBy: { version: 'desc' } }),
    prisma.browserTask.findMany({ where: { applicationId: a.id }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findMany({ where: { OR: [{ applicationId: a.id }, { jobId: a.jobId }] }, orderBy: { at: 'asc' } }),
  ]);
  const { rawData: _raw, ...jobView } = job;
  res.json({
    application: { ...toRow(a), browserState: a.browserState, submissionEvidence: a.submissionEvidence, notes: a.notes },
    job: jobView,
    documents,
    answerSets,
    browserTasks,
    audit: auditLogs,
  });
});

applicationsRouter.post('/applications/:id/retry', async (req, res) => {
  const a = await prisma.application.findUniqueOrThrow({ where: { id: req.params.id }, include: { job: true } });
  if (a.status === 'SUBMITTED') return res.status(409).json({ error: 'Already submitted' });
  if (a.cvProfileId && a.job.category) {
    await transition(a.id, 'QUEUED', { queuedAt: new Date(), failureReason: null, exceptionType: null, humanInterventionReason: null }, { actor: 'user', message: 'Retry requested' });
  } else {
    await prisma.application.update({ where: { id: a.id }, data: { status: 'DEDUPLICATED', failureReason: null, lastAction: 'Retry: re-analyse' } });
    await audit('STATUS_CHANGED', `${a.status} → DEDUPLICATED (re-analyse)`, { applicationId: a.id, actor: 'user' });
  }
  res.json({ ok: true });
});

applicationsRouter.post('/applications/:id/skip', async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
  await transition(req.params.id, 'SKIPPED', { failureReason: reason ?? 'Skipped by user', currentStep: null }, { actor: 'user', message: 'Skipped by user' });
  res.json({ ok: true });
});

const ResolveSchema = z.object({
  action: z.enum(['MARK_SUBMITTED', 'REQUEUE', 'SKIP']),
  note: z.string().max(2000).optional(),
  confirmationNumber: z.string().max(200).optional(),
});

applicationsRouter.post('/applications/:id/resolve', async (req, res) => {
  const body = ResolveSchema.parse(req.body);
  const a = await prisma.application.findUniqueOrThrow({ where: { id: req.params.id }, include: { job: true } });
  if (body.action === 'MARK_SUBMITTED') {
    if (!['NEEDS_HUMAN', 'BLOCKED', 'SUBMISSION_ATTEMPTED'].includes(a.status)) return res.status(409).json({ error: `Cannot mark ${a.status} as submitted` });
    await transition(
      a.id,
      'SUBMITTED',
      { submittedAt: new Date(), simulated: false, submissionEvidence: { type: 'MANUAL_CONFIRMATION', confirmationNumber: body.confirmationNumber ?? null, message: body.note ?? 'Completed manually by user' }, notes: body.note ?? a.notes },
      { actor: 'user', message: 'Completed manually' },
    );
    await audit('SUBMISSION_CONFIRMED', 'Confirmed by user after manual completion', { applicationId: a.id, actor: 'user' });
  } else if (body.action === 'REQUEUE') {
    // Eligibility-review holds skip straight back to the queue; others regenerate artifacts.
    await transition(a.id, 'QUEUED', { queuedAt: new Date(), exceptionType: null, humanInterventionReason: null, notes: body.note ?? a.notes }, { actor: 'user', message: 'Requeued after human review' });
  } else {
    await transition(a.id, 'SKIPPED', { failureReason: body.note ?? 'Skipped after review', notes: body.note ?? a.notes }, { actor: 'user', message: 'Skipped after review' });
  }
  await audit('HUMAN_RESOLVED', `${body.action}${body.note ? `: ${body.note}` : ''}`, { applicationId: a.id, actor: 'user' });
  res.json({ ok: true });
});

applicationsRouter.post('/applications/:id/outcome', async (req, res) => {
  const { outcome } = z.object({ outcome: z.enum(['NONE', 'REJECTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'WITHDRAWN']) }).parse(req.body);
  const a = await prisma.application.update({ where: { id: req.params.id }, data: { outcome, outcomeAt: new Date() }, include: { job: true } });
  await audit('OUTCOME_RECORDED', outcome, { applicationId: a.id, actor: 'user' });
  if (outcome === 'INTERVIEW') await notify('INTERVIEW', `Interview: ${a.job.title}`, a.job.company, a.id);
  if (outcome === 'OFFER') await notify('OFFER', `Offer: ${a.job.title}`, a.job.company, a.id);
  res.json({ ok: true });
});

applicationsRouter.get('/documents/:id/download', async (req, res) => {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: req.params.id } });
  const data = await storage.get(doc.storageKey);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
});
