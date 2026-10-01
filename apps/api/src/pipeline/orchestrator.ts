import type { Prisma, Track } from '@prisma/client';
import { getAiEngine } from '../ai/engine.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { getApprovedCandidate, getCandidate, getSettings } from '../lib/candidate.js';
import { notify } from '../lib/notify.js';
import { startOfDay } from '../lib/time.js';
import { getSource, listSources } from '../sources/registry.js';
import { ReedSource } from '../sources/reed.js';
import type { SearchCriteria } from '../sources/types.js';
import { analyseApplication, type PipelineContext } from './analyse.js';
import { executeApplication, expireStaleTasks, sourceAllowsDispatch } from './execute.js';
import { ingestJob } from './ingest.js';
import { prepareApplication } from './prepare.js';
import { transition } from './transition.js';

export type CycleAction = 'DISCOVER' | 'ANALYSE' | 'PREPARE' | 'EXECUTE' | 'FULL_CYCLE';

const LEASE_MS = 15 * 60_000; // a cycle whose heartbeat is older than this is considered dead

async function setStatus(data: Prisma.AgentStatusUpdateInput) {
  await prisma.agentStatus.upsert({ where: { id: 1 }, create: { id: 1 }, update: { ...data, lastHeartbeat: new Date() } });
}

async function shouldStop(manual: boolean) {
  const s = await getSettings();
  return s.agentState === 'STOPPED' || (s.agentState === 'PAUSED' && !manual);
}

export async function buildContext(actor = 'system'): Promise<PipelineContext> {
  const [candidate, profiles, settings] = await Promise.all([getApprovedCandidate(), prisma.cvProfile.findMany({ where: { active: true } }), getSettings()]);
  return { candidate, profiles, settings, ai: getAiEngine(), actor };
}

// ─────────────────────────────── Discovery ───────────────────────────────

export async function runDiscovery(opts: { manual?: boolean } = {}) {
  const settings = await getSettings();
  const criteria = (settings.searchCriteria ?? {}) as Record<string, { keywords?: string[]; locations?: string[]; remoteOnly?: boolean }>;
  const configs = await prisma.sourceConfig.findMany({ where: { enabled: true } });
  const summary: Record<string, { found: number; new: number; error?: string }> = {};

  for (const cfg of configs) {
    const source = getSource(cfg.source);
    if (!source || 'importOnly' in source || !source.available()) continue;
    if (cfg.lastRunAt && Date.now() - cfg.lastRunAt.getTime() < cfg.cooldownSeconds * 1000 && !opts.manual) continue;
    if (await shouldStop(Boolean(opts.manual))) break;
    await setStatus({ currentTask: 'Discovering jobs', currentSource: source.label, currentStep: 'Searching', stepStartedAt: new Date() });
    summary[source.id] = { found: 0, new: 0 };
    try {
      for (const track of ['PROFESSIONAL', 'GENERAL'] as Track[]) {
        const c = criteria[track.toLowerCase()] ?? {};
        if (!c.keywords?.length && !['greenhouse', 'lever'].includes(source.id)) continue;
        const search: SearchCriteria = { track, keywords: c.keywords ?? [], locations: c.locations ?? [], remoteOnly: c.remoteOnly, maxResults: cfg.maxResultsPerSearch };
        let jobs = await source.search(search, (cfg.config ?? {}) as Record<string, unknown>);
        if (source instanceof ReedSource) {
          // Reed search results carry truncated descriptions; hydrate the ones we haven't seen.
          const hydrated = [];
          for (const j of jobs) {
            const seen = await prisma.job.findUnique({ where: { source_sourceJobId: { source: j.source, sourceJobId: j.sourceJobId ?? '' } }, select: { id: true } });
            hydrated.push(seen ? j : await source.hydrate(j).catch(() => j));
          }
          jobs = hydrated;
        }
        summary[source.id].found += jobs.length;
        for (const j of jobs) {
          try {
            const r = await ingestJob(j);
            if (r.isNew) summary[source.id].new++;
          } catch (err) {
            console.error('[discover] ingest failed', j.url, (err as Error).message);
          }
        }
      }
      await prisma.sourceConfig.update({ where: { id: cfg.id }, data: { lastRunAt: new Date(), lastError: null } });
      await audit('SOURCE_SEARCH', `${source.label}: ${summary[source.id].found} found, ${summary[source.id].new} new`, { data: summary[source.id] });
    } catch (err) {
      const msg = (err as Error).message;
      summary[source.id].error = msg;
      await prisma.sourceConfig.update({ where: { id: cfg.id }, data: { lastRunAt: new Date(), lastError: msg } });
      await audit('SOURCE_ERROR', `${source.label}: ${msg}`);
    }
  }
  return summary;
}

// ─────────────────────────────── Analysis ────────────────────────────────

export async function runAnalysis(opts: { manual?: boolean; limit?: number } = {}) {
  const ctx = await buildContext();
  const apps = await prisma.application.findMany({ where: { status: 'DEDUPLICATED' }, orderBy: { createdAt: 'asc' }, take: opts.limit ?? 200, select: { id: true, job: { select: { title: true, company: true, source: true } } } });
  let done = 0;
  for (const [i, a] of apps.entries()) {
    if (await shouldStop(Boolean(opts.manual))) break;
    await setStatus({ currentTask: 'Analysing jobs', currentApplicationId: a.id, currentSource: a.job.source, currentStep: `Classifying ${a.job.title} — ${a.job.company}`, queuePosition: i + 1, queueTotal: apps.length, stepStartedAt: new Date() });
    try {
      await analyseApplication(a.id, ctx);
      done++;
    } catch (err) {
      await failSafely(a.id, `Analysis error: ${(err as Error).message}`);
    }
  }
  return { analysed: done, pending: apps.length - done };
}

async function failSafely(applicationId: string, reason: string) {
  console.error('[pipeline]', applicationId, reason);
  try {
    await transition(applicationId, 'FAILED', { failureReason: reason.slice(0, 1000), currentStep: null }, { message: 'Pipeline error' });
    await audit('APPLICATION_FAILED', reason, { applicationId });
  } catch (e) {
    console.error('[pipeline] could not mark failed', (e as Error).message);
  }
}

// ──────────────────────────── Daily capacity ─────────────────────────────

/** Applications dispatched to a browser agent today, per track. */
export async function dispatchedToday(timezone: string) {
  const since = startOfDay(timezone);
  const rows = await prisma.application.groupBy({
    by: ['track'],
    where: { browserTasks: { some: { createdAt: { gte: since } } } },
    _count: { _all: true },
  });
  const byTrack = { PROFESSIONAL: 0, GENERAL: 0 } as Record<Track, number>;
  for (const r of rows) if (r.track) byTrack[r.track] = r._count._all;
  return byTrack;
}

async function remainingCapacity() {
  const s = await getSettings();
  const used = await dispatchedToday(s.timezone);
  const inFlight = await prisma.application.groupBy({ by: ['track'], where: { status: { in: ['CV_GENERATING', 'CV_VALIDATED', 'APPLICATION_PREPARING', 'READY_FOR_BROWSER'] } }, _count: { _all: true } });
  const flight = { PROFESSIONAL: 0, GENERAL: 0 } as Record<Track, number>;
  for (const r of inFlight) if (r.track) flight[r.track] = r._count._all;
  const totalUsed = used.PROFESSIONAL + used.GENERAL;
  const globalLeft = Math.max(0, s.maxPerDay - totalUsed);
  return {
    settings: s,
    used,
    dispatch: {
      PROFESSIONAL: Math.min(globalLeft, Math.max(0, s.professionalPerDay - used.PROFESSIONAL)),
      GENERAL: Math.min(globalLeft, Math.max(0, s.generalPerDay - used.GENERAL)),
      total: globalLeft,
    },
    prepare: {
      PROFESSIONAL: Math.max(0, s.professionalPerDay - used.PROFESSIONAL - flight.PROFESSIONAL),
      GENERAL: Math.max(0, s.generalPerDay - used.GENERAL - flight.GENERAL),
    },
  };
}

// ─────────────────────────────── Preparation ─────────────────────────────

export async function runPreparation(opts: { manual?: boolean } = {}) {
  const ctx = await buildContext();
  const cap = await remainingCapacity();
  let prepared = 0;
  for (const track of ['PROFESSIONAL', 'GENERAL'] as Track[]) {
    const apps = await prisma.application.findMany({ where: { status: 'QUEUED', track }, orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }], take: cap.prepare[track], include: { job: true } });
    for (const a of apps) {
      if (await shouldStop(Boolean(opts.manual))) return { prepared };
      await setStatus({ currentTask: 'Preparing applications', currentApplicationId: a.id, currentSource: a.job.source, currentStep: `Tailoring CV for ${a.job.title} — ${a.job.company}`, stepStartedAt: new Date() });
      try {
        await prepareApplication(a.id, ctx);
        prepared++;
      } catch (err) {
        await failSafely(a.id, `Preparation error: ${(err as Error).message}`);
      }
    }
  }
  return { prepared };
}

// ─────────────────────────────── Execution ───────────────────────────────

export async function runExecution(opts: { manual?: boolean } = {}) {
  const cap = await remainingCapacity();
  const s = cap.settings;
  const candidate = await getCandidate();
  const ready = await prisma.application.findMany({ where: { status: 'READY_FOR_BROWSER' }, orderBy: [{ priority: 'desc' }, { updatedAt: 'asc' }], include: { job: true } });
  const left = { ...cap.dispatch };
  let dispatched = 0;
  const deferred: string[] = [];
  for (const [i, a] of ready.entries()) {
    if (await shouldStop(Boolean(opts.manual))) break;
    const track = a.track ?? 'GENERAL';
    if (left[track] <= 0 || left.total <= 0) continue;
    const limit = await sourceAllowsDispatch(a.job.source);
    if (!limit.ok) {
      deferred.push(limit.reason!);
      await prisma.application.update({ where: { id: a.id }, data: { lastAction: `Deferred — ${limit.reason}` } });
      continue;
    }
    await setStatus({ currentTask: 'Applying', currentApplicationId: a.id, currentSource: a.job.source, currentStep: `Opening application — ${a.job.title} at ${a.job.company}`, queuePosition: i + 1, queueTotal: ready.length, stepStartedAt: new Date() });
    try {
      await executeApplication(a.id, { candidate, agentId: s.defaultBrowserAgent, autoSubmit: s.autoSubmit, reviewFirstN: s.reviewFirstN });
      dispatched++;
      left[track]--;
      left.total--;
    } catch (err) {
      await failSafely(a.id, `Execution error: ${(err as Error).message}`);
    }
  }
  return { dispatched, deferred };
}

// ─────────────────────────────── Full cycle ──────────────────────────────

let localRunning = false;

/** Run one cycle. Returns null if another cycle holds the lock. */
export async function runCycle(action: CycleAction, opts: { manual?: boolean } = {}) {
  if (localRunning) return null;
  // Atomic lease on the AgentStatus row: one cycle at a time across API + worker processes.
  await prisma.agentStatus.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const lease = await prisma.agentStatus.updateMany({
    where: { id: 1, OR: [{ running: false }, { lastHeartbeat: null }, { lastHeartbeat: { lt: new Date(Date.now() - LEASE_MS) } }] },
    data: { running: true, lastHeartbeat: new Date() },
  });
  if (lease.count === 0) return null;
  localRunning = true;
  const startedAt = new Date();
  try {
    if (!opts.manual && (await getSettings()).agentState !== 'RUNNING') {
      await setStatus({ running: false });
      return { skipped: 'agent not running' };
    }
    await setStatus({ running: true, startedAt, currentTask: action, currentStep: 'Starting', currentApplicationId: null, currentSource: null, queuePosition: null, queueTotal: null });
    await audit('AGENT_CYCLE_STARTED', `${action}${opts.manual ? ' (manual)' : ''}`);
    await expireStaleTasks();
    const result: Record<string, unknown> = {};
    if (action === 'DISCOVER' || action === 'FULL_CYCLE') result.discovery = await runDiscovery(opts);
    if (action === 'ANALYSE' || action === 'FULL_CYCLE' || action === 'DISCOVER') result.analysis = await runAnalysis(opts);
    if (action === 'PREPARE' || action === 'FULL_CYCLE') result.preparation = await runPreparation(opts);
    if (action === 'EXECUTE' || action === 'FULL_CYCLE') result.execution = await runExecution(opts);
    const summary = { action, startedAt, finishedAt: new Date(), ...result };
    await setStatus({ running: false, currentTask: null, currentStep: null, currentApplicationId: null, currentSource: null, queuePosition: null, queueTotal: null, lastRunSummary: summary as Prisma.InputJsonValue });
    await audit('AGENT_CYCLE_FINISHED', `${action} finished`, { data: summary });
    if (action === 'FULL_CYCLE' || action === 'EXECUTE') await notifyRunSummary(startedAt);
    return summary;
  } catch (err) {
    await setStatus({ running: false, currentStep: `Error: ${(err as Error).message}` });
    await notify('AGENT_FAILURE', 'Agent cycle failed', (err as Error).message);
    throw err;
  } finally {
    localRunning = false;
    await prisma.agentStatus.update({ where: { id: 1 }, data: { running: false } }).catch(() => undefined);
  }
}

async function notifyRunSummary(since: Date) {
  const rows = await prisma.auditLog.groupBy({ by: ['type'], where: { at: { gte: since }, type: { in: ['JOB_DISCOVERED', 'SUBMISSION_CONFIRMED', 'HUMAN_INTERVENTION_REQUIRED', 'APPLICATION_FAILED'] } }, _count: { _all: true } });
  const n = (t: string) => rows.find((r) => r.type === t)?._count._all ?? 0;
  if (!rows.length) return;
  await notify('DAILY_SUMMARY', 'Agent run complete', `${n('JOB_DISCOVERED')} discovered · ${n('SUBMISSION_CONFIRMED')} submitted · ${n('HUMAN_INTERVENTION_REQUIRED')} need you · ${n('APPLICATION_FAILED')} failed`);
}

export function isCycleRunning() {
  return localRunning;
}

export { listSources };
