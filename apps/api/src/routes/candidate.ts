import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { getCandidate } from '../lib/candidate.js';

export const candidateRouter = Router();

const CATEGORY = z.enum(['PRODUCT_DESIGN', 'UX', 'UX_RESEARCH', 'PRODUCT_MANAGEMENT', 'FRONTEND', 'SOFTWARE', 'AI', 'TECH_GENERAL', 'HOSPITALITY', 'KITCHEN_PORTER', 'CLEANING', 'SECURITY', 'RETAIL', 'WAREHOUSE', 'GENERAL_ENTRY_LEVEL', 'OTHER']);
const date = z.union([z.string(), z.null()]).optional().transform((v) => (v ? new Date(v) : v === null ? null : undefined));
const str = (max = 500) => z.string().max(max).nullable().optional();

const PersonalSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().nullable().optional().or(z.literal('')),
  phone: str(50),
  headline: str(300),
  addressLine: str(300),
  city: str(100),
  postcode: str(20),
  country: str(100),
  willingToRelocate: z.boolean().optional(),
  maxCommuteMinutes: z.number().int().nullable().optional(),
  links: z.array(z.object({ label: z.string().max(100), url: z.string().url() })).max(20).optional(),
  availability: z.object({ startDate: z.string().optional(), noticePeriod: z.string().optional(), daysAvailable: z.array(z.string()).optional(), shiftsAvailable: z.array(z.string()).optional(), notes: z.string().optional() }).partial().optional(),
  preferences: z.object({ minSalaryProfessional: z.number().optional(), minHourlyGeneral: z.number().optional(), remoteTypes: z.array(z.string()).optional(), locations: z.array(z.string()).optional(), excludedCompanies: z.array(z.string()).optional() }).partial().optional(),
});

const WorkAuthSchema = z.object({
  visaType: z.string().min(1).max(200),
  hasRightToWork: z.boolean(),
  termTimeHoursLimit: z.number().int().min(0).max(168).nullable().optional(),
  vacationWorkAllowed: z.boolean().optional(),
  fullTimeRestrictions: str(1000),
  sponsorshipRequired: z.boolean().optional(),
  courseStart: date,
  courseEnd: date,
  visaExpiry: date,
  vacationPeriods: z.array(z.object({ start: z.string(), end: z.string(), label: z.string().optional() })).optional(),
  knownRestrictions: z.array(z.string().max(500)).optional(),
  guidanceVerifiedAt: date,
  notes: str(4000),
});

const collections = {
  education: {
    model: 'education',
    schema: z.object({ institution: z.string().min(1), qualification: z.string().min(1), field: str(), grade: str(100), startDate: date, endDate: date, inProgress: z.boolean().optional(), location: str(), highlights: z.array(z.string()).optional(), sortOrder: z.number().int().optional() }),
  },
  employment: {
    model: 'employment',
    schema: z.object({ employer: z.string().min(1), title: z.string().min(1), location: str(), startDate: date, endDate: date, current: z.boolean().optional(), employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'ZERO_HOURS', 'UNKNOWN']).optional(), description: str(4000), tags: z.array(z.string()).optional(), categories: z.array(CATEGORY).optional(), sortOrder: z.number().int().optional() }),
  },
  projects: {
    model: 'project',
    schema: z.object({ name: z.string().min(1), role: str(), url: z.string().url().nullable().optional().or(z.literal('')), description: str(4000), startDate: date, endDate: date, shipped: z.boolean().optional(), tags: z.array(z.string()).optional(), categories: z.array(CATEGORY).optional(), sortOrder: z.number().int().optional() }),
  },
  skills: {
    model: 'skill',
    schema: z.object({ name: z.string().min(1).max(100), aliases: z.array(z.string()).optional(), level: str(100), years: z.number().nullable().optional(), categories: z.array(CATEGORY).optional(), evidenceId: str(50) }),
  },
  certifications: {
    model: 'certification',
    schema: z.object({ name: z.string().min(1), issuer: str(), issuedAt: date, expiresAt: date, credentialId: str(), url: z.string().url().nullable().optional().or(z.literal('')), categories: z.array(CATEGORY).optional() }),
  },
  evidence: {
    model: 'evidence',
    schema: z.object({
      kind: z.enum(['SKILL', 'EXPERIENCE', 'ACHIEVEMENT', 'EDUCATION', 'PROJECT', 'CERTIFICATION', 'TRAIT', 'AVAILABILITY', 'OTHER']),
      claim: z.string().min(3).max(600),
      source: z.string().min(1).max(500),
      date,
      allowedForCV: z.boolean().optional(),
      allowedForApplication: z.boolean().optional(),
      categories: z.array(CATEGORY).optional(),
      tags: z.array(z.string()).optional(),
      employmentId: str(50),
      projectId: str(50),
    }),
  },
} as const;

type CollectionKey = keyof typeof collections;
// Prisma delegates share the create/update/delete shape we use here.
type Delegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  findFirst(args: { where: { id: string; candidateId: string } }): Promise<{ id: string } | null>;
};
const delegate = (k: CollectionKey) => (prisma as unknown as Record<string, Delegate>)[collections[k].model];

const blankToNull = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));

candidateRouter.get('/candidate', async (_req, res) => {
  res.json(await getCandidate());
});

candidateRouter.put('/candidate', async (req, res) => {
  const c = await getCandidate();
  const data = blankToNull(PersonalSchema.parse(req.body)) as Prisma.CandidateUpdateInput;
  await prisma.candidate.update({ where: { id: c.id }, data });
  await audit('CANDIDATE_UPDATED', 'Personal details updated', { actor: 'user' });
  res.json(await getCandidate());
});

candidateRouter.put('/candidate/work-authorisation', async (req, res) => {
  const c = await getCandidate();
  const data = WorkAuthSchema.parse(req.body);
  await prisma.workAuthorisation.upsert({ where: { candidateId: c.id }, create: { ...data, candidateId: c.id }, update: data });
  await audit('CANDIDATE_UPDATED', 'Work authorisation updated', { actor: 'user', data });
  res.json(await getCandidate());
});

for (const key of Object.keys(collections) as CollectionKey[]) {
  const { schema } = collections[key];

  candidateRouter.post(`/candidate/${key}`, async (req, res) => {
    const c = await getCandidate();
    const data = blankToNull(schema.parse(req.body));
    const created = await delegate(key).create({ data: { ...data, candidateId: c.id } });
    await audit('CANDIDATE_UPDATED', `${key} added`, { actor: 'user', data: { id: created.id } });
    res.status(201).json(created);
  });

  candidateRouter.put(`/candidate/${key}/:id`, async (req, res) => {
    const c = await getCandidate();
    const id = String(req.params.id);
    if (!(await delegate(key).findFirst({ where: { id, candidateId: c.id } }))) return res.status(404).json({ error: 'Not found' });
    const data = blankToNull(schema.partial().parse(req.body));
    const updated = await delegate(key).update({ where: { id }, data });
    await audit('CANDIDATE_UPDATED', `${key} updated`, { actor: 'user', data: { id } });
    res.json(updated);
  });

  candidateRouter.delete(`/candidate/${key}/:id`, async (req, res) => {
    const c = await getCandidate();
    const id = String(req.params.id);
    if (!(await delegate(key).findFirst({ where: { id, candidateId: c.id } }))) return res.status(404).json({ error: 'Not found' });
    await delegate(key).delete({ where: { id } });
    await audit('CANDIDATE_UPDATED', `${key} deleted`, { actor: 'user', data: { id } });
    res.json({ ok: true });
  });
}
