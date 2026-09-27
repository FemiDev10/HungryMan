import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { storage } from '../storage/storage.js';

export const miscRouter = Router();

miscRouter.get('/audit', async (req, res) => {
  const q = z
    .object({ applicationId: z.string().optional(), type: z.string().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) })
    .parse(req.query);
  const where = { ...(q.applicationId ? { applicationId: q.applicationId } : {}), ...(q.type ? { type: q.type } : {}) };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

miscRouter.get('/notifications', async (req, res) => {
  const unread = req.query.unread === 'true';
  res.json(await prisma.notification.findMany({ where: unread ? { read: false } : {}, orderBy: { createdAt: 'desc' }, take: 50 }));
});
miscRouter.post('/notifications/read-all', async (_req, res) => {
  await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  res.json({ ok: true });
});
miscRouter.post('/notifications/:id/read', async (req, res) => {
  await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
  res.json({ ok: true });
});

// ─────────────────────────────── Privacy ─────────────────────────────────

miscRouter.get('/privacy/export', async (_req, res) => {
  const [candidate, cvProfiles, jobs, applications, documents, answerSets, answerTemplates, auditLogs, settings, sources] = await Promise.all([
    prisma.candidate.findMany({ include: { workAuthorisation: true, education: true, employment: true, projects: true, skills: true, certifications: true, evidence: true } }),
    prisma.cvProfile.findMany(),
    prisma.job.findMany(),
    prisma.application.findMany({ include: { browserTasks: true } }),
    prisma.document.findMany({ omit: { storageKey: true } }),
    prisma.answerSet.findMany(),
    prisma.answerTemplate.findMany(),
    prisma.auditLog.findMany({ orderBy: { at: 'asc' } }),
    prisma.settings.findMany(),
    prisma.sourceConfig.findMany(),
  ]);
  await audit('DATA_EXPORTED', 'Full data export downloaded', { actor: 'user' });
  res.setHeader('Content-Disposition', `attachment; filename="hungryman-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ exportedAt: new Date(), candidate, cvProfiles, jobs, applications, documents, answerSets, answerTemplates, auditLogs, settings, sources });
});

miscRouter.post('/privacy/delete', async (req, res) => {
  z.object({ confirm: z.literal('DELETE ALL MY DATA') }).parse(req.body);
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.browserTask.deleteMany(),
    prisma.answerSet.deleteMany(),
    prisma.document.deleteMany(),
    prisma.application.deleteMany(),
    prisma.job.deleteMany(),
    prisma.answerTemplate.deleteMany(),
    prisma.candidate.deleteMany(),
    prisma.agentStatus.deleteMany(),
  ]);
  await storage.deleteAll();
  await audit('DATA_DELETED', 'All candidate, job, application data and stored files deleted', { actor: 'user' });
  res.json({ ok: true });
});
