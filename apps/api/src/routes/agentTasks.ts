import { Router } from 'express';
import { z } from 'zod';
import { BrowserResultSchema } from '../browser/types.js';
import { env } from '../config/env.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { applyBrowserResult } from '../pipeline/execute.js';
import { storage } from '../storage/storage.js';

/**
 * Handoff API for external browser agents (Claude Cowork / Claude in Chrome).
 * Authenticated with the AGENT_API_TOKEN bearer token, never the dashboard session.
 */
export const agentTasksRouter = Router();

/** When each browser agent last asked for work — shown on the setup checklist. */
export const lastAgentPoll = new Map<string, Date>();

const AgentQuery = z.object({ agent: z.enum(['cowork', 'claude-chrome']) });

agentTasksRouter.get('/agent-tasks/next', async (req, res) => {
  const { agent } = AgentQuery.parse(req.query);
  lastAgentPoll.set(agent, new Date());
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.agentState === 'STOPPED') return res.status(204).end();

  // Claim atomically so two agent sessions never take the same task.
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + env.BROWSER_TASK_LEASE_MINUTES * 60_000);
  const claimed = await prisma.$transaction(async (tx) => {
    const next = await tx.browserTask.findFirst({ where: { status: 'PENDING', agentType: agent }, orderBy: { createdAt: 'asc' } });
    if (!next) return null;
    const r = await tx.browserTask.updateMany({ where: { id: next.id, status: 'PENDING' }, data: { status: 'CLAIMED', claimedAt: now, leaseExpiresAt } });
    return r.count ? next : null;
  });
  if (!claimed) return res.status(204).end();
  await prisma.application.update({ where: { id: claimed.applicationId }, data: { currentStep: 'Browser agent opening application', lastAction: `Claimed by ${agent}` } });
  await audit('BROWSER_STARTED', `Task claimed by ${agent}`, { applicationId: claimed.applicationId, actor: `agent:${agent}` });
  res.json({ taskId: claimed.id, leaseExpiresAt, task: claimed.payload });
});

async function claimedTask(taskId: string) {
  const task = await prisma.browserTask.findUnique({ where: { id: taskId } });
  if (!task || task.status !== 'CLAIMED') return null;
  return task;
}

agentTasksRouter.get('/agent-tasks/:taskId/files/:documentId', async (req, res) => {
  const task = await claimedTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found or not claimed' });
  const app = await prisma.application.findUniqueOrThrow({ where: { id: task.applicationId } });
  // Only the exact documents attached to this application may be fetched.
  if (![app.cvVersionId, app.coverLetterVersionId].includes(req.params.documentId)) return res.status(403).json({ error: 'Document not part of this task' });
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: req.params.documentId } });
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(await storage.get(doc.storageKey));
});

const EventSchema = z.object({
  type: z.enum(['STEP', 'FIELD_FILLED', 'CV_UPLOADED', 'DOCUMENT_UPLOADED']),
  step: z.string().max(300).optional(),
  field: z.string().max(200).optional(),
  detail: z.string().max(1000).optional(),
});

agentTasksRouter.post('/agent-tasks/:taskId/events', async (req, res) => {
  const task = await claimedTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found or not claimed' });
  const e = EventSchema.parse(req.body);
  const type = e.type === 'STEP' ? 'BROWSER_STEP' : e.type;
  await audit(type, e.step ?? e.field ?? e.detail ?? e.type, { applicationId: task.applicationId, actor: `agent:${task.agentType}`, data: e });
  // Extend the lease while the agent is making progress.
  await prisma.browserTask.update({ where: { id: task.id }, data: { leaseExpiresAt: new Date(Date.now() + env.BROWSER_TASK_LEASE_MINUTES * 60_000) } });
  if (e.step) await prisma.application.update({ where: { id: task.applicationId }, data: { currentStep: e.step } });
  if (e.step) await prisma.agentStatus.updateMany({ where: { currentApplicationId: task.applicationId }, data: { currentStep: e.step, stepStartedAt: new Date(), lastHeartbeat: new Date() } });
  res.json({ ok: true });
});

agentTasksRouter.post('/agent-tasks/:taskId/result', async (req, res) => {
  const task = await claimedTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found or not claimed' });
  const result = BrowserResultSchema.parse(req.body);
  await applyBrowserResult(task.id, result, `agent:${task.agentType}`);
  const app = await prisma.application.findUniqueOrThrow({ where: { id: task.applicationId }, select: { status: true } });
  res.json({ ok: true, applicationStatus: app.status });
});
