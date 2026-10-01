import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { listBrowserAgents } from '../browser/agents.js';
import { integrations } from '../config/env.js';
import { prisma } from '../db.js';
import { validateCv } from '../domain/claimValidation.js';
import { buildCvContent } from '../domain/cvBuilder.js';
import { audit } from '../lib/audit.js';
import { getApprovedCandidate, getSettings } from '../lib/candidate.js';
import { listSources } from '../sources/registry.js';
import { importRegisterCsv, lookupSponsor, refreshRegisterFromGovUk, registerStatus } from '../sponsors/register.js';

export const configRouter = Router();

const CATEGORY = z.enum(['PRODUCT_DESIGN', 'UX', 'UX_RESEARCH', 'PRODUCT_MANAGEMENT', 'FRONTEND', 'SOFTWARE', 'AI', 'TECH_GENERAL', 'HOSPITALITY', 'KITCHEN_PORTER', 'CLEANING', 'SECURITY', 'RETAIL', 'WAREHOUSE', 'GENERAL_ENTRY_LEVEL', 'ADMIN_RECEPTION', 'CUSTOMER_SERVICE', 'TEACHING_SUPPORT', 'OTHER']);

// ─────────────────────────────── CV profiles ─────────────────────────────

const ProfileSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(60),
  name: z.string().min(1).max(100),
  track: z.enum(['PROFESSIONAL', 'GENERAL']),
  categories: z.array(CATEGORY).min(1),
  targetJobTitles: z.array(z.string()).default([]),
  targetKeywords: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  preferredExperience: z.array(z.string()).default([]),
  excludedExperience: z.array(z.string()).default([]),
  summaryTemplate: z.string().min(1).max(1000),
  skillOrdering: z.array(z.string()).default([]),
  experienceOrdering: z.enum(['RELEVANCE', 'CHRONOLOGICAL']).default('RELEVANCE'),
  projectSelectionRules: z.object({ maxProjects: z.number().int().min(0).max(10).optional(), requireShipped: z.boolean().optional(), requiredTags: z.array(z.string()).optional() }).default({}),
  maximumPages: z.number().int().min(1).max(3).default(2),
  template: z.enum(['classic', 'compact']).default('classic'),
  includeCoverLetter: z.enum(['ALWAYS', 'WHEN_REQUIRED', 'NEVER']).default('WHEN_REQUIRED'),
  active: z.boolean().default(true),
});

configRouter.get('/cv-profiles', async (_req, res) => {
  res.json(await prisma.cvProfile.findMany({ orderBy: [{ track: 'asc' }, { name: 'asc' }] }));
});
configRouter.post('/cv-profiles', async (req, res) => {
  res.status(201).json(await prisma.cvProfile.create({ data: ProfileSchema.parse(req.body) }));
});
configRouter.put('/cv-profiles/:id', async (req, res) => {
  res.json(await prisma.cvProfile.update({ where: { id: req.params.id }, data: ProfileSchema.partial().parse(req.body) }));
});
configRouter.delete('/cv-profiles/:id', async (req, res) => {
  const used = await prisma.application.count({ where: { cvProfileId: req.params.id } });
  if (used) {
    await prisma.cvProfile.update({ where: { id: req.params.id }, data: { active: false } });
    return res.json({ ok: true, deactivated: true, message: 'Profile is referenced by applications, so it was deactivated instead of deleted.' });
  }
  await prisma.cvProfile.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
configRouter.post('/cv-profiles/:id/preview', async (req, res) => {
  const { jobId } = z.object({ jobId: z.string().optional() }).parse(req.body ?? {});
  const [profile, candidate] = await Promise.all([prisma.cvProfile.findUniqueOrThrow({ where: { id: req.params.id } }), getApprovedCandidate()]);
  const job = jobId ? await prisma.job.findUniqueOrThrow({ where: { id: jobId } }) : null;
  const content = buildCvContent({ candidate, profile, job, category: job?.category ?? profile.categories[0] });
  res.json({ content, validation: validateCv(content, candidate) });
});

// ─────────────────────────────── Answers ─────────────────────────────────

const AnswerSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/).max(80),
  category: z.string().min(1).max(40),
  question: z.string().min(1).max(1000),
  patterns: z.array(z.string().max(200)).default([]),
  answer: z.string().max(5000).default('UNKNOWN'),
  track: z.enum(['PROFESSIONAL', 'GENERAL']).nullable().default(null),
  evidenceIds: z.array(z.string()).default([]),
  verified: z.boolean().default(false),
});
const normalizePatterns = <T extends { patterns?: string[] }>(d: T) => ({ ...d, ...(d.patterns ? { patterns: d.patterns.map((p) => p.toLowerCase().trim()).filter(Boolean) } : {}) });

configRouter.get('/answers', async (_req, res) => {
  res.json(await prisma.answerTemplate.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] }));
});
configRouter.post('/answers', async (req, res) => {
  res.status(201).json(await prisma.answerTemplate.create({ data: normalizePatterns(AnswerSchema.parse(req.body)) }));
});
configRouter.put('/answers/:id', async (req, res) => {
  res.json(await prisma.answerTemplate.update({ where: { id: req.params.id }, data: normalizePatterns(AnswerSchema.partial().parse(req.body)) }));
});
configRouter.delete('/answers/:id', async (req, res) => {
  await prisma.answerTemplate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─────────────────────────────── Settings ────────────────────────────────

const SettingsSchema = z
  .object({
    agentState: z.enum(['RUNNING', 'PAUSED', 'STOPPED']),
    professionalPerDay: z.number().int().min(0).max(200),
    generalPerDay: z.number().int().min(0).max(200),
    maxPerDay: z.number().int().min(0).max(400),
    minMatchProfessional: z.number().min(0).max(100),
    minMatchGeneral: z.number().min(0).max(100),
    autoSubmit: z.boolean(),
    defaultBrowserAgent: z.string(),
    schedule: z.array(z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), action: z.enum(['DISCOVER', 'ANALYSE', 'PREPARE', 'EXECUTE', 'FULL_CYCLE']) })),
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown timezone'),
    searchCriteria: z.object({
      professional: z.object({ keywords: z.array(z.string()), locations: z.array(z.string()), remoteOnly: z.boolean().optional() }).partial(),
      general: z.object({ keywords: z.array(z.string()), locations: z.array(z.string()) }).partial(),
    }).partial(),
    termTimeOverride: z.enum(['TERM', 'VACATION']).nullable(),
    reviewFirstN: z.number().int().min(0).max(50),
    monthlyIncomeGoal: z.number().min(0).max(100_000),
    outreachEmailsPerDay: z.number().int().min(0).max(30),
    outreachReviewFirstN: z.number().int().min(0).max(20),
  })
  .partial();

configRouter.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});
configRouter.put('/settings', async (req, res) => {
  const data = SettingsSchema.parse(req.body);
  if (data.defaultBrowserAgent && !listBrowserAgents().some((a) => a.id === data.defaultBrowserAgent)) return res.status(400).json({ error: 'Unknown browser agent' });
  await getSettings();
  const updated = await prisma.settings.update({ where: { id: 1 }, data: data as Prisma.SettingsUpdateInput });
  await audit('SETTINGS_CHANGED', Object.keys(data).join(', '), { actor: 'user', data });
  res.json(updated);
});

// ─────────────────────────────── Sources ─────────────────────────────────

configRouter.get('/sources', async (_req, res) => {
  const configs = await prisma.sourceConfig.findMany();
  res.json(
    listSources().map((s) => {
      const c = configs.find((x) => x.source === s.id);
      return {
        source: s.id,
        label: s.label,
        available: s.available(),
        supportsApplication: s.supportsApplication(),
        enabled: c?.enabled ?? false,
        maxApplicationsPerHour: c?.maxApplicationsPerHour ?? 5,
        maxApplicationsPerDay: c?.maxApplicationsPerDay ?? 20,
        cooldownSeconds: c?.cooldownSeconds ?? 60,
        maxResultsPerSearch: c?.maxResultsPerSearch ?? 50,
        config: c?.config ?? {},
        lastRunAt: c?.lastRunAt ?? null,
        lastError: c?.lastError ?? null,
      };
    }),
  );
});

const SourceSchema = z
  .object({
    enabled: z.boolean(),
    maxApplicationsPerHour: z.number().int().min(0).max(100),
    maxApplicationsPerDay: z.number().int().min(0).max(500),
    cooldownSeconds: z.number().int().min(0).max(86_400),
    maxResultsPerSearch: z.number().int().min(1).max(500),
    config: z.record(z.string(), z.unknown()),
  })
  .partial();

configRouter.put('/sources/:source', async (req, res) => {
  if (!listSources().some((s) => s.id === req.params.source)) return res.status(404).json({ error: 'Unknown source' });
  const data = SourceSchema.parse(req.body) as Prisma.SourceConfigUpdateInput;
  const updated = await prisma.sourceConfig.upsert({ where: { source: req.params.source }, create: { ...(data as Prisma.SourceConfigCreateInput), source: req.params.source }, update: data });
  await audit('SETTINGS_CHANGED', `Source ${req.params.source} updated`, { actor: 'user', data });
  res.json(updated);
});

// ─────────────────────────────── Meta ────────────────────────────────────

configRouter.get('/meta', (_req, res) => {
  res.json({
    version: '0.1.0',
    enums: {
      categories: CATEGORY.options,
      statuses: ['DISCOVERED', 'DEDUPLICATED', 'CLASSIFIED', 'ELIGIBILITY_CHECKED', 'MATCHED', 'QUEUED', 'CV_GENERATING', 'CV_VALIDATED', 'APPLICATION_PREPARING', 'READY_FOR_BROWSER', 'BROWSER_EXECUTING', 'SUBMISSION_ATTEMPTED', 'SUBMITTED', 'SKIPPED', 'REJECTED_BY_RULE', 'NEEDS_HUMAN', 'BLOCKED', 'FAILED', 'EXPIRED', 'DUPLICATE'],
      exceptionTypes: ['REVIEW_BEFORE_SUBMIT', 'CAPTCHA', 'VIDEO_QUESTION', 'LIVE_INTERVIEW', 'UNSUPPORTED_FIELD', 'MISSING_CANDIDATE_DATA', 'IDENTITY_VERIFICATION', 'APPLICATION_REQUIRES_SIGNATURE', 'AUTOMATION_BLOCKED', 'UNEXPECTED_QUESTION', 'PAYMENT_REQUIRED', 'DUPLICATE_APPLICATION', 'SITE_ERROR', 'LOGIN_REQUIRED', 'CV_VALIDATION_FAILED'],
      outcomes: ['NONE', 'REJECTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'WITHDRAWN'],
      evidenceKinds: ['SKILL', 'EXPERIENCE', 'ACHIEVEMENT', 'EDUCATION', 'PROJECT', 'CERTIFICATION', 'TRAIT', 'AVAILABILITY', 'OTHER'],
      tracks: ['PROFESSIONAL', 'GENERAL'],
      workContexts: ['STANDARD', 'STUDENT_PART_TIME', 'SPONSORED_AFTER_COURSE'],
    },
    integrations: {
      claude: integrations.claude(),
      reed: integrations.reed(),
      adzuna: integrations.adzuna(),
      browserAgents: listBrowserAgents().map((a) => a.id),
      browserAgentDetails: listBrowserAgents().map((a) => ({ id: a.id, label: a.label, mode: a.mode, simulated: a.simulated })),
    },
  });
});

// ─────────────────────────────── Sponsor register ────────────────────────

configRouter.get('/sponsors/status', async (_req, res) => {
  res.json(await registerStatus());
});
configRouter.post('/sponsors/refresh', async (_req, res) => {
  try {
    const rows = await refreshRegisterFromGovUk();
    res.json({ ok: true, rows, status: await registerStatus() });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
configRouter.post('/sponsors/upload', async (req, res) => {
  const { csvBase64 } = z.object({ csvBase64: z.string().min(10) }).parse(req.body);
  const rows = await importRegisterCsv(Buffer.from(csvBase64, 'base64').toString('utf8'), 'manual upload');
  res.json({ ok: true, rows, status: await registerStatus() });
});
configRouter.get('/sponsors/check', async (req, res) => {
  const { company } = z.object({ company: z.string().min(1) }).parse(req.query);
  res.json({ company, result: await lookupSponsor(company) });
});
