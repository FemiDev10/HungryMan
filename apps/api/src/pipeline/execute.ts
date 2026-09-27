import type { Prisma } from '@prisma/client';
import { getBrowserAgent } from '../browser/agents.js';
import { AGENT_RULES, type BrowserResult, type BrowserTaskPayload } from '../browser/types.js';
import { env } from '../config/env.js';
import { prisma } from '../db.js';
import type { PreparedAnswer } from '../domain/answers.js';
import { formatRef } from '../domain/stateMachine.js';
import type { LinkItem } from '../domain/types.js';
import { audit } from '../lib/audit.js';
import type { FullCandidate } from '../lib/candidate.js';
import { notify } from '../lib/notify.js';
import { transition } from './transition.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function buildTaskPayload(applicationId: string, candidate: FullCandidate, autoSubmit: boolean): Promise<BrowserTaskPayload> {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { job: true, cvProfile: true } });
  const [cv, letter, answers] = await Promise.all([
    app.cvVersionId ? prisma.document.findUnique({ where: { id: app.cvVersionId } }) : null,
    app.coverLetterVersionId ? prisma.document.findUnique({ where: { id: app.coverLetterVersionId } }) : null,
    app.answersVersionId ? prisma.answerSet.findUnique({ where: { id: app.answersVersionId } }) : null,
  ]);
  if (!cv) throw new Error('No CV version attached to application');
  const file = (d: { id: string; fileName: string }) => ({ documentId: d.id, fileName: d.fileName, downloadPath: `/api/agent-tasks/{taskId}/files/${d.id}` });
  return {
    applicationId: app.id,
    applicationRef: formatRef(app.seq),
    url: app.job.url,
    job: { title: app.job.title, company: app.job.company, location: app.job.location, source: app.job.source },
    candidateProfile: app.cvProfile?.name ?? 'unknown',
    track: app.track ?? 'unknown',
    candidate: {
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      location: [candidate.city, candidate.country].filter(Boolean).join(', ') || null,
      postcode: candidate.postcode,
      links: (Array.isArray(candidate.links) ? candidate.links : []) as unknown as LinkItem[],
    },
    cvFile: file(cv),
    coverLetterFile: letter ? file(letter) : null,
    approvedAnswers: ((answers?.answers ?? []) as unknown as PreparedAnswer[]).map(({ key, question, answer, patterns }) => ({ key, question, answer, patterns })),
    autoSubmit,
    rules: AGENT_RULES,
  };
}

/** Per-source limits: count browser dispatches for this job source in the last hour/day. */
export async function sourceAllowsDispatch(source: string, now = new Date()): Promise<{ ok: boolean; reason?: string }> {
  const cfg = await prisma.sourceConfig.findUnique({ where: { source } });
  if (!cfg) return { ok: true };
  const base = { application: { job: { source } } };
  const [hour, day, last] = await Promise.all([
    prisma.browserTask.count({ where: { ...base, createdAt: { gte: new Date(now.getTime() - 3600_000) } } }),
    prisma.browserTask.count({ where: { ...base, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
    prisma.browserTask.findFirst({ where: base, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  if (hour >= cfg.maxApplicationsPerHour) return { ok: false, reason: `${source}: hourly limit ${cfg.maxApplicationsPerHour} reached` };
  if (day >= cfg.maxApplicationsPerDay) return { ok: false, reason: `${source}: daily limit ${cfg.maxApplicationsPerDay} reached` };
  if (last && now.getTime() - last.createdAt.getTime() < cfg.cooldownSeconds * 1000) return { ok: false, reason: `${source}: cooldown` };
  return { ok: true };
}

/** READY_FOR_BROWSER → BROWSER_EXECUTING → (result) */
export async function executeApplication(applicationId: string, opts: { candidate: FullCandidate; agentId: string; autoSubmit: boolean; reviewFirstN?: number; actor?: string }) {
  const agent = getBrowserAgent(opts.agentId);
  // Warm-up: the first N applications are filled in but stopped before submit for the user to check.
  let autoSubmit = opts.autoSubmit;
  let warmUp = false;
  if ((opts.reviewFirstN ?? 0) > 0) {
    const used = await prisma.application.count({ where: { warmUp: true } });
    if (used < (opts.reviewFirstN ?? 0)) {
      warmUp = true;
      autoSubmit = false;
    }
  }
  if (warmUp) await prisma.application.update({ where: { id: applicationId }, data: { warmUp: true } });
  const payload = await buildTaskPayload(applicationId, opts.candidate, autoSubmit);
  const task = await prisma.browserTask.create({ data: { applicationId, agentType: agent.id, payload: json(payload) } });
  const finalPayload = { ...payload, cvFile: { ...payload.cvFile, downloadPath: payload.cvFile.downloadPath.replace('{taskId}', task.id) }, coverLetterFile: payload.coverLetterFile ? { ...payload.coverLetterFile, downloadPath: payload.coverLetterFile.downloadPath.replace('{taskId}', task.id) } : null };
  await prisma.browserTask.update({ where: { id: task.id }, data: { payload: json(finalPayload) } });

  await transition(
    applicationId,
    'BROWSER_EXECUTING',
    { browserAgent: agent.id, attempts: { increment: 1 }, currentStep: agent.mode === 'handoff' ? `Waiting for ${agent.label}` : 'Browser agent running', simulated: agent.simulated },
    { actor: opts.actor, message: `Dispatched to ${agent.label}` },
  );
  await audit('BROWSER_TASK_CREATED', `Task ${task.id} for ${agent.label}`, { applicationId, data: { taskId: task.id, agent: agent.id } });

  const outcome = await agent.execute(finalPayload, { browserTaskId: task.id });
  if (outcome.kind === 'pending') return { pending: true, taskId: task.id };
  await prisma.browserTask.update({ where: { id: task.id }, data: { status: 'CLAIMED', claimedAt: new Date() } });
  await audit('BROWSER_STARTED', `${agent.label} started`, { applicationId, actor: `agent:${agent.id}` });
  await applyBrowserResult(task.id, outcome.result, `agent:${agent.id}`);
  return { pending: false, taskId: task.id };
}

/** Map a structured browser result onto the application state machine. */
export async function applyBrowserResult(taskId: string, result: BrowserResult, actor: string) {
  const task = await prisma.browserTask.findUniqueOrThrow({ where: { id: taskId }, include: { application: true } });
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') throw new Error(`Task ${taskId} is already ${task.status.toLowerCase()}`);
  await prisma.browserTask.update({ where: { id: taskId }, data: { status: 'COMPLETED', completedAt: new Date(), result: json(result) } });
  const app = task.application;
  const browserState = json({ stepReached: result.stepReached ?? null, fieldsFilled: result.fieldsFilled ?? [], unansweredQuestions: result.unansweredQuestions ?? [], employerVerified: result.employerVerified ?? null, notes: result.notes ?? null, taskId });
  const simulated = task.agentType === 'mock';

  if (app.status !== 'BROWSER_EXECUTING') {
    await audit('BROWSER_STEP', `Late result ignored (application is ${app.status})`, { applicationId: app.id, actor, data: result });
    return;
  }
  for (const f of result.fieldsFilled ?? []) {
    if (f === 'cv_upload') await audit('CV_UPLOADED', `Uploaded ${app.cvVersionId}`, { applicationId: app.id, actor });
  }

  const hasEvidence = Boolean(result.confirmation && (result.confirmation.confirmationNumber || result.confirmation.message || result.confirmation.url));
  if (result.outcome === 'SUBMITTED' && hasEvidence) {
    await audit('SUBMISSION_ATTEMPTED', 'Submit clicked', { applicationId: app.id, actor });
    await transition(app.id, 'SUBMITTED', { submittedAt: new Date(), submissionEvidence: json(result.confirmation), browserState, currentStep: null, simulated }, { actor, message: `Submitted${simulated ? ' (simulated)' : ''}` });
    await audit('SUBMISSION_CONFIRMED', result.confirmation?.confirmationNumber ?? result.confirmation?.message ?? 'Confirmed', { applicationId: app.id, actor, data: result.confirmation });
    await prisma.agentStatus.updateMany({ data: { consecutiveFailures: 0 } });
    const job = await prisma.job.findUnique({ where: { id: app.jobId } });
    await notify('APPLICATION_SUBMITTED', `${simulated ? '[Simulated] ' : ''}Applied: ${job?.title}`, `${job?.company} — ${formatRef(app.seq)}`, app.id);
    return;
  }
  if (app.warmUp && result.outcome === 'SUBMISSION_ATTEMPTED') {
    const reason = 'Warm-up review: the form is filled in and waiting in your browser. Check it, press submit yourself, then click "I completed it manually".';
    await transition(app.id, 'NEEDS_HUMAN', { exceptionType: 'REVIEW_BEFORE_SUBMIT', humanInterventionReason: reason, browserState, simulated, currentStep: null }, { actor, message: 'Ready for your review' });
    await audit('HUMAN_INTERVENTION_REQUIRED', reason, { applicationId: app.id, actor, data: result });
    const job = await prisma.job.findUnique({ where: { id: app.jobId } });
    await notify('HUMAN_REQUIRED', `Review before submit: ${job?.title} — ${job?.company}`, reason, app.id);
    return;
  }
  if (result.outcome === 'SUBMITTED' || result.outcome === 'SUBMISSION_ATTEMPTED') {
    await transition(app.id, 'SUBMISSION_ATTEMPTED', { browserState, simulated, currentStep: 'Awaiting confirmation evidence' }, { actor, message: result.outcome === 'SUBMITTED' ? 'Reported submitted without evidence — awaiting confirmation' : `Stopped at ${result.stepReached ?? 'submit'}` });
    await audit('SUBMISSION_ATTEMPTED', 'Submission attempted; no confirmation evidence yet', { applicationId: app.id, actor, data: result });
    return;
  }
  if (result.outcome === 'EXCEPTION' && result.exception) {
    const blocked = ['CAPTCHA', 'AUTOMATION_BLOCKED'].includes(result.exception.type);
    if (app.warmUp) await prisma.application.update({ where: { id: app.id }, data: { warmUp: false } }); // didn't reach review; slot goes to the next one
    const reason = `${result.exception.type}: ${result.exception.detail}${result.unansweredQuestions?.length ? ` — Questions: ${result.unansweredQuestions.join(' | ')}` : ''}`;
    await transition(app.id, blocked ? 'BLOCKED' : 'NEEDS_HUMAN', { exceptionType: result.exception.type, humanInterventionReason: reason, browserState, currentStep: null }, { actor, message: blocked ? 'Automation restriction detected' : 'Human input required' });
    await audit('HUMAN_INTERVENTION_REQUIRED', reason, { applicationId: app.id, actor, data: result });
    const job = await prisma.job.findUnique({ where: { id: app.jobId } });
    await notify('HUMAN_REQUIRED', `Needs you: ${job?.title} — ${job?.company}`, reason, app.id);
    return;
  }
  const failure = result.error ?? 'Browser agent reported failure without detail';
  if (app.warmUp) await prisma.application.update({ where: { id: app.id }, data: { warmUp: false } });
  await transition(app.id, 'FAILED', { failureReason: failure, browserState, currentStep: null }, { actor, message: 'Browser execution failed' });
  await audit('APPLICATION_FAILED', failure, { applicationId: app.id, actor, data: result });
  const status = await prisma.agentStatus.upsert({ where: { id: 1 }, create: { id: 1, consecutiveFailures: 1 }, update: { consecutiveFailures: { increment: 1 } } });
  if (status.consecutiveFailures === 3) await notify('AGENT_FAILURE', 'Repeated application failures', `3 applications in a row failed. Latest: ${failure}`, app.id);
}

/** Claimed tasks whose lease ran out are treated as failed, so the queue never stalls on a lost agent. */
export async function expireStaleTasks(now = new Date()) {
  const stale = await prisma.browserTask.findMany({ where: { status: 'CLAIMED', leaseExpiresAt: { lt: now } } });
  for (const t of stale) {
    await applyBrowserResult(t.id, { outcome: 'FAILED', error: `Browser agent did not report back within ${env.BROWSER_TASK_LEASE_MINUTES} minutes (lease expired)` }, 'system').catch((e) =>
      console.error('[expire]', (e as Error).message),
    );
    await prisma.browserTask.update({ where: { id: t.id }, data: { status: 'EXPIRED' } });
  }
  return stale.length;
}
