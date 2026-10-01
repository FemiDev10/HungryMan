import { Router } from 'express';
import { z } from 'zod';
import { renderCvPdf } from '../cv/render.js';
import { prisma } from '../db.js';
import { validateCv } from '../domain/claimValidation.js';
import { buildCvContent } from '../domain/cvBuilder.js';
import { audit } from '../lib/audit.js';
import { getApprovedCandidate, getSettings } from '../lib/candidate.js';
import { startOfDay } from '../lib/time.js';
import { storage } from '../storage/storage.js';

/**
 * Cold / speculative emails sent from the owner's Gmail by a Claude session (see `.claude/commands/outreach.md`).
 * The API is the gatekeeper: it enforces the daily cap, never emails the same address twice, spaces out emails
 * to one company, and keeps every email as a Gmail draft for the owner to send unless they turn on auto-send.
 */
export const outreachRouter = Router();

const RECONTACT_DAYS = 180; // never email the same address twice within this window
const COMPANY_GAP_DAYS = 30; // at most one cold email per company per month
const ACTIVE = ['PLANNED', 'DRAFTED', 'SENT', 'REPLIED'] as const;

const daysAgo = (d: number, now = new Date()) => new Date(now.getTime() - d * 86_400_000);
const normEmail = (e: string) => e.trim().toLowerCase();
const normCompany = (c: string) => c.trim().toLowerCase().replace(/\b(ltd|limited|plc|llp|uk)\b\.?/g, '').replace(/\s+/g, ' ').trim();

async function quota(now = new Date()) {
  const s = await getSettings();
  const since = startOfDay(s.timezone, now);
  const [today, done] = await Promise.all([
    prisma.outreach.count({ where: { createdAt: { gte: since }, status: { in: [...ACTIVE] } } }),
    prisma.outreach.count({ where: { status: { in: ['DRAFTED', 'SENT', 'REPLIED'] } } }),
  ]);
  return {
    agentState: s.agentState,
    perDay: s.outreachEmailsPerDay,
    usedToday: today,
    leftToday: Math.max(0, s.outreachEmailsPerDay - today),
    autoSend: s.outreachAutoSend,
    reviewFirstN: s.outreachReviewFirstN,
    warmUpLeft: Math.max(0, s.outreachReviewFirstN - done),
  };
}

outreachRouter.get('/outreach/quota', async (_req, res) => {
  res.json(await quota());
});

outreachRouter.get('/outreach', async (req, res) => {
  const { status, limit } = z.object({ status: z.enum(['PLANNED', 'DRAFTED', 'SENT', 'REPLIED', 'SKIPPED', 'FAILED']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  res.json(await prisma.outreach.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: limit }));
});

/** Can this address / company be emailed? Lets the session check before writing an email. */
outreachRouter.get('/outreach/check', async (req, res) => {
  const { email, company } = z.object({ email: z.string().email(), company: z.string().min(1) }).parse(req.query);
  res.json(await blockedReason(email, company));
});

async function blockedReason(email: string, company: string, now = new Date()) {
  const prior = await prisma.outreach.findFirst({ where: { recipientEmail: normEmail(email), status: { in: [...ACTIVE] }, createdAt: { gte: daysAgo(RECONTACT_DAYS, now) } } });
  if (prior) return { ok: false, reason: `Already emailed ${normEmail(email)} on ${prior.createdAt.toISOString().slice(0, 10)}` };
  const recent = await prisma.outreach.findMany({ where: { status: { in: [...ACTIVE] }, createdAt: { gte: daysAgo(COMPANY_GAP_DAYS, now) } }, select: { company: true, createdAt: true } });
  const same = recent.find((r) => normCompany(r.company) === normCompany(company));
  if (same) return { ok: false, reason: `Already emailed someone at ${company} on ${same.createdAt.toISOString().slice(0, 10)}` };
  return { ok: true as const };
}

const PlanSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().max(200).optional().nullable(),
  recipientRole: z.string().max(200).optional().nullable(),
  company: z.string().min(1).max(300),
  /** Where the address is published. Required: guessed or scraped personal addresses are not allowed. */
  sourceUrl: z.string().url(),
  subject: z.string().min(3).max(200),
  body: z.string().min(80).max(4000),
  track: z.enum(['PROFESSIONAL', 'GENERAL']).optional().nullable(),
  jobId: z.string().optional().nullable(),
  cvProfileSlug: z.string().max(60).optional().nullable(),
});

/** Record an email before sending it. Returns `mode: DRAFT` (save as a Gmail draft) during the warm-up, else `SEND`. */
outreachRouter.post('/outreach', async (req, res) => {
  const b = PlanSchema.parse(req.body);
  const q = await quota();
  if (q.agentState !== 'RUNNING') return res.status(409).json({ error: `HungryMan is ${q.agentState.toLowerCase()}; outreach is paused too.` });
  if (q.leftToday <= 0) return res.status(429).json({ error: `Daily outreach limit reached (${q.perDay}).` });
  const blocked = await blockedReason(b.recipientEmail, b.company);
  if (!blocked.ok) return res.status(409).json({ error: blocked.reason });
  if (b.cvProfileSlug && !(await prisma.cvProfile.findUnique({ where: { slug: b.cvProfileSlug } }))) return res.status(400).json({ error: `Unknown CV profile ${b.cvProfileSlug}` });

  // Drafts only unless the owner has turned on auto-send, and even then for the first few (warm-up).
  const warmUp = !q.autoSend || q.warmUpLeft > 0;
  const row = await prisma.outreach.create({ data: { ...b, recipientEmail: normEmail(b.recipientEmail), warmUp } });
  await audit('OUTREACH_PLANNED', `${row.company} <${row.recipientEmail}>`, { actor: 'agent', data: { outreachId: row.id, warmUp } });
  res.status(201).json({
    outreach: row,
    mode: warmUp ? 'DRAFT' : 'SEND',
    cvDownloadPath: b.cvProfileSlug || b.jobId ? `/api/outreach/${row.id}/cv` : null,
  });
});

const ResultSchema = z.object({
  status: z.enum(['DRAFTED', 'SENT', 'FAILED', 'SKIPPED']),
  externalId: z.string().max(200).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

/** Report what happened to a planned email. Warm-up emails may only be drafted. */
outreachRouter.post('/outreach/:id/result', async (req, res) => {
  const b = ResultSchema.parse(req.body);
  const row = await prisma.outreach.findUniqueOrThrow({ where: { id: req.params.id } });
  if (row.status !== 'PLANNED') return res.status(409).json({ error: `Outreach is already ${row.status}` });
  if (b.status === 'SENT' && (row.warmUp || !(await getSettings()).outreachAutoSend)) {
    return res.status(409).json({ error: 'This email may only be saved as a Gmail draft (DRAFTED); the owner sends it.' });
  }
  const updated = await prisma.outreach.update({ where: { id: row.id }, data: { status: b.status, externalId: b.externalId ?? null, note: b.note ?? null, sentAt: b.status === 'SENT' ? new Date() : null } });
  await audit(`OUTREACH_${b.status}` as const, `${row.company} <${row.recipientEmail}>`, { actor: 'agent', data: { outreachId: row.id } });
  res.json(updated);
});

/** Owner updates from the dashboard: sent a draft, got a reply, or dropped it. */
outreachRouter.patch('/outreach/:id', async (req, res) => {
  const b = z.object({ status: z.enum(['SENT', 'REPLIED', 'SKIPPED']), note: z.string().max(2000).optional() }).parse(req.body);
  const row = await prisma.outreach.findUniqueOrThrow({ where: { id: req.params.id } });
  const updated = await prisma.outreach.update({
    where: { id: row.id },
    data: { status: b.status, ...(b.note !== undefined ? { note: b.note } : {}), ...(b.status === 'SENT' && !row.sentAt ? { sentAt: new Date() } : {}) },
  });
  await audit(`OUTREACH_${b.status}` as const, `${row.company} <${row.recipientEmail}>`, { actor: 'user', data: { outreachId: row.id } });
  res.json(updated);
});

/** The CV to attach: the application's own CV when the email is about a job we applied to, else a fresh one for the profile. */
outreachRouter.get('/outreach/:id/cv', async (req, res) => {
  const row = await prisma.outreach.findUniqueOrThrow({ where: { id: req.params.id } });
  const candidate = await getApprovedCandidate();
  const fileName = `${candidate.fullName.replace(/[^\w]+/g, '-')}-CV.pdf`;
  if (row.jobId) {
    const doc = await prisma.document.findFirst({ where: { kind: 'CV', application: { jobId: row.jobId } }, orderBy: { createdAt: 'desc' } });
    if (doc) {
      res.setHeader('Content-Type', 'application/pdf').setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(await storage.get(doc.storageKey));
    }
  }
  if (!row.cvProfileSlug) return res.status(404).json({ error: 'No CV for this email: set cvProfileSlug or jobId.' });
  const profile = await prisma.cvProfile.findUniqueOrThrow({ where: { slug: row.cvProfileSlug } });
  const content = buildCvContent({ candidate, profile, job: null, category: profile.categories[0] });
  const report = validateCv(content, candidate);
  if (!report.valid) return res.status(422).json({ error: 'CV failed claim validation', details: report.errors });
  res.setHeader('Content-Type', 'application/pdf').setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(await renderCvPdf(content));
});
