import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ATTENTION, IN_QUEUE } from '../domain/stateMachine.js';
import { audit } from '../lib/audit.js';
import { env, integrations } from '../config/env.js';
import { getCandidate, getSettings } from '../lib/candidate.js';
import { registerStatus } from '../sponsors/register.js';
import { lastAgentPoll } from './agentTasks.js';
import { startOfDay } from '../lib/time.js';
import { runCycle } from '../pipeline/orchestrator.js';
import { nextScheduled, type ScheduleEntry } from '../pipeline/scheduler.js';
import { transition } from '../pipeline/transition.js';
import { rowInclude, toRow } from './views.js';

export const dashboardRouter = Router();

export async function agentStatusView() {
  const [status, settings] = await Promise.all([prisma.agentStatus.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }), getSettings()]);
  const current = status.currentApplicationId ? await prisma.application.findUnique({ where: { id: status.currentApplicationId }, include: rowInclude }) : null;
  return {
    state: settings.agentState,
    running: status.running,
    currentTask: status.currentTask,
    currentSource: status.currentSource,
    currentStep: status.currentStep,
    currentApplication: current ? toRow(current) : null,
    startedAt: status.startedAt,
    elapsedSeconds: status.running && status.startedAt ? Math.round((Date.now() - status.startedAt.getTime()) / 1000) : null,
    queuePosition: status.queuePosition,
    queueTotal: status.queueTotal,
    lastHeartbeat: status.lastHeartbeat,
    lastRunSummary: status.lastRunSummary,
    nextScheduled: settings.agentState === 'RUNNING' ? nextScheduled((settings.schedule ?? []) as unknown as ScheduleEntry[], settings.timezone) : null,
  };
}

dashboardRouter.get('/dashboard/overview', async (_req, res) => {
  const settings = await getSettings();
  const since = startOfDay(settings.timezone);
  const today = { createdAt: { gte: since } };
  const [discovered, relevant, queued, submitted, needsAttention, failed, totalSubmitted, interviews, offers, applications, queuePreview, recentNotifications] = await Promise.all([
    prisma.job.count({ where: { discoveredAt: { gte: since } } }),
    prisma.application.count({ where: { ...today, status: { notIn: ['DISCOVERED', 'DEDUPLICATED', 'CLASSIFIED', 'ELIGIBILITY_CHECKED', 'SKIPPED', 'REJECTED_BY_RULE', 'DUPLICATE', 'EXPIRED'] } } }),
    prisma.application.count({ where: { status: { in: IN_QUEUE } } }),
    prisma.application.count({ where: { submittedAt: { gte: since } } }),
    prisma.application.count({ where: { status: { in: ATTENTION } } }),
    prisma.application.count({ where: { status: 'FAILED', updatedAt: { gte: since } } }),
    prisma.application.count({ where: { status: 'SUBMITTED', simulated: false } }),
    prisma.application.count({ where: { outcome: 'INTERVIEW' } }),
    prisma.application.count({ where: { outcome: 'OFFER' } }),
    prisma.application.count({ where: { status: { in: ['SUBMITTED', 'SUBMISSION_ATTEMPTED'] } } }),
    prisma.application.findMany({
      where: { OR: [{ status: { in: IN_QUEUE } }, { status: 'SUBMITTED', submittedAt: { gte: since } }] },
      include: rowInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 40,
    }),
    prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);
  const order = (s: string) => (s === 'SUBMITTED' ? 0 : ['BROWSER_EXECUTING', 'SUBMISSION_ATTEMPTED'].includes(s) ? 1 : s === 'QUEUED' ? 3 : 2);
  res.json({
    today: { discovered, relevant, queued, submitted, needsAttention, failed },
    totals: { submitted: totalSubmitted, interviews, offers, applications },
    agent: await agentStatusView(),
    queuePreview: queuePreview.sort((a, b) => order(a.status) - order(b.status) || b.priority - a.priority).slice(0, 12).map(toRow),
    recentNotifications,
    income: await incomeSummary(settings.monthlyIncomeGoal),
  });
});

dashboardRouter.get('/agent/status', async (_req, res) => {
  res.json(await agentStatusView());
});

const ControlSchema = z.object({ action: z.enum(['RUN_NOW', 'DISCOVER_NOW', 'PAUSE', 'RESUME', 'STOP', 'RETRY_FAILED', 'RETRY_BLOCKED']) });

dashboardRouter.post('/agent/control', async (req, res) => {
  const { action } = ControlSchema.parse(req.body);
  await audit('AGENT_CONTROL', action, { actor: 'user' });
  let message = '';
  switch (action) {
    case 'RUN_NOW':
    case 'DISCOVER_NOW': {
      const s = await getSettings();
      if (s.agentState === 'STOPPED') await prisma.settings.update({ where: { id: 1 }, data: { agentState: 'PAUSED' } });
      // Fire and forget; progress is visible via /agent/status.
      runCycle(action === 'RUN_NOW' ? 'FULL_CYCLE' : 'DISCOVER', { manual: true })
        .then((r) => r === null && console.log('[control] a cycle is already running'))
        .catch((e) => console.error('[control] cycle failed', e));
      message = action === 'RUN_NOW' ? 'Full cycle started' : 'Discovery started';
      break;
    }
    case 'PAUSE':
      await prisma.settings.update({ where: { id: 1 }, data: { agentState: 'PAUSED' } });
      message = 'Agent paused after the current step';
      break;
    case 'RESUME':
      await prisma.settings.update({ where: { id: 1 }, data: { agentState: 'RUNNING' } });
      message = 'Agent running on schedule';
      break;
    case 'STOP': {
      await prisma.settings.update({ where: { id: 1 }, data: { agentState: 'STOPPED' } });
      // Withdraw tasks no agent has claimed yet; those applications go back to READY_FOR_BROWSER.
      const pending = await prisma.browserTask.findMany({ where: { status: 'PENDING' } });
      for (const t of pending) {
        await prisma.browserTask.update({ where: { id: t.id }, data: { status: 'CANCELLED' } });
        await transition(t.applicationId, 'READY_FOR_BROWSER', { currentStep: 'Queue stopped' }, { actor: 'user', message: 'Queue stopped; task withdrawn' }).catch(() => undefined);
      }
      message = `Queue stopped; ${pending.length} pending browser task(s) withdrawn`;
      break;
    }
    case 'RETRY_FAILED':
    case 'RETRY_BLOCKED': {
      const statuses = action === 'RETRY_FAILED' ? (['FAILED'] as const) : (['BLOCKED'] as const);
      const apps = await prisma.application.findMany({ where: { status: { in: [...statuses] } }, select: { id: true, cvProfileId: true, job: { select: { category: true } } } });
      for (const a of apps) {
        // Failed before analysis finished → re-analyse; otherwise regenerate from the queue.
        const target = a.cvProfileId && a.job.category ? 'QUEUED' : 'DEDUPLICATED';
        if (target === 'QUEUED') await transition(a.id, 'QUEUED', { queuedAt: new Date(), failureReason: null, exceptionType: null, humanInterventionReason: null }, { actor: 'user', message: 'Retry requested' });
        else await prisma.application.update({ where: { id: a.id }, data: { status: 'DEDUPLICATED', failureReason: null, lastAction: 'Retry: re-analyse' } });
      }
      message = `${apps.length} application(s) requeued`;
      break;
    }
  }
  res.json({ ok: true, message });
});

/** Estimated monthly pay (general-work jobs) against the income goal. */
async function incomeSummary(goal: number) {
  const [offers, applied] = await Promise.all([
    prisma.job.aggregate({ _sum: { estMonthlyPay: true }, where: { application: { outcome: 'OFFER' } } }),
    prisma.job.aggregate({ _sum: { estMonthlyPay: true }, _count: { _all: true }, where: { estMonthlyPay: { not: null }, application: { status: { in: ['SUBMITTED', 'SUBMISSION_ATTEMPTED'] }, outcome: { notIn: ['REJECTED', 'WITHDRAWN'] } } } }),
  ]);
  return { goal, secured: offers._sum.estMonthlyPay ?? 0, appliedPotential: applied._sum.estMonthlyPay ?? 0, appliedCount: applied._count._all };
}

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  link: string;
  required: boolean;
}

dashboardRouter.get('/dashboard/checklist', async (_req, res) => {
  const [c, settings, sponsors, unknownAnswers] = await Promise.all([
    getCandidate(),
    getSettings(),
    registerStatus(),
    prisma.answerTemplate.count({ where: { OR: [{ answer: 'UNKNOWN' }, { verified: false }] } }),
  ]);
  const auth = c.workAuthorisation;
  const approvedEvidence = c.evidence.filter((e) => e.status === 'APPROVED').length;
  const drafts = [c.evidence, c.employment, c.education, c.projects, c.skills, c.certifications].reduce((n, list) => n + list.filter((x) => x.status === 'DRAFT').length, 0);
  const criteria = (settings.searchCriteria ?? {}) as Record<string, { keywords?: string[] }>;
  const polls = [...lastAgentPoll.entries()].sort((a, b) => b[1].getTime() - a[1].getTime());
  const lastPoll = polls[0];
  const items: ChecklistItem[] = [
    { key: 'profile', label: 'Personal details', done: c.fullName !== 'Your Name' && Boolean(c.email && c.phone && c.city), detail: 'Name, email, phone and city are used on every CV and form.', link: '/profile', required: true },
    { key: 'cv_review', label: 'Review imported CV drafts', done: drafts === 0, detail: drafts ? `${drafts} draft item(s) waiting — the agent can't use them until you approve.` : 'No drafts waiting.', link: '/profile', required: false },
    { key: 'evidence', label: 'Approved evidence', done: approvedEvidence >= 8, detail: `${approvedEvidence} approved claim(s). Aim for 8+ covering both design/tech work and general-work strengths.`, link: '/profile', required: true },
    { key: 'work_auth', label: 'Work authorisation', done: Boolean(auth), detail: auth ? `${auth.visaType}${auth.termTimeHoursLimit != null ? `, ${auth.termTimeHoursLimit}h/week in term` : ''}` : 'Not set — eligibility checks will return UNKNOWN.', link: '/profile', required: true },
    { key: 'course_end', label: 'Course end date', done: !auth || auth.termTimeHoursLimit == null || Boolean(auth.courseEnd), detail: 'Needed to state your earliest start date on full-time applications.', link: '/profile', required: true },
    { key: 'sponsors', label: 'Licensed sponsor register', done: !auth?.seekingSponsoredRoleAfterCourse || sponsors.loaded, detail: sponsors.loaded ? `${sponsors.rows.toLocaleString('en-GB')} entries, imported ${sponsors.importedAt?.toISOString().slice(0, 10)}` : sponsors.lastError ?? 'Not loaded — full-time roles will wait for review.', link: '/settings', required: Boolean(auth?.seekingSponsoredRoleAfterCourse) },
    { key: 'answers', label: 'Answer library', done: unknownAnswers === 0, detail: unknownAnswers ? `${unknownAnswers} answer(s) unknown or unverified — forms asking these will come to you.` : 'All answers verified.', link: '/answers', required: false },
    { key: 'search', label: 'Search keywords & locations', done: Boolean(criteria.professional?.keywords?.length || criteria.general?.keywords?.length), detail: 'What the agent searches for on each track.', link: '/settings', required: true },
    { key: 'claude', label: 'Claude API key', done: integrations.claude(), detail: integrations.claude() ? 'Connected.' : 'Optional, but needed for CV import and better tailoring.', link: '/settings', required: false },
    { key: 'agent_token', label: 'Browser agent token', done: Boolean(env.AGENT_API_TOKEN), detail: 'AGENT_API_TOKEN in apps/api/.env — Claude in Chrome / Cowork uses it to fetch tasks.', link: '/settings', required: true },
    { key: 'agent_connected', label: 'Browser agent connected', done: Boolean(lastPoll && Date.now() - lastPoll[1].getTime() < 24 * 3600_000), detail: lastPoll ? `${lastPoll[0]} last checked in ${lastPoll[1].toISOString()}` : 'No agent has checked in yet — see docs/BROWSER_AGENTS.md.', link: '/settings', required: true },
    { key: 'running', label: 'Agent switched on', done: settings.agentState === 'RUNNING', detail: `Currently ${settings.agentState.toLowerCase()}. Press Resume on the Overview when the rest is ready.`, link: '/', required: true },
  ];
  res.json({ items, ready: items.filter((i) => i.required).every((i) => i.done) });
});
