import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { env } from '../config/env.js';
import type { CvSentence } from '../domain/cvBuilder.js';
import type { AiEngine, CoverLetter, JobAnalysis } from './engine.js';
import { COVER_LETTER_PROMPT, CV_IMPORT_PROMPT, CV_PLAN_PROMPT, JOB_ANALYSIS_PROMPT } from './prompts.js';

const CATEGORIES = [
  'PRODUCT_DESIGN', 'UX', 'UX_RESEARCH', 'PRODUCT_MANAGEMENT', 'FRONTEND', 'SOFTWARE', 'AI', 'TECH_GENERAL',
  'HOSPITALITY', 'KITCHEN_PORTER', 'CLEANING', 'SECURITY', 'RETAIL', 'WAREHOUSE', 'GENERAL_ENTRY_LEVEL', 'OTHER',
] as const;

const JobAnalysisSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence: z.number(),
  alternativeCategories: z.array(z.enum(CATEGORIES)),
  reasoning: z.string(),
  remoteType: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN']),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'ZERO_HOURS', 'UNKNOWN']),
  hoursPerWeek: z.number().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryPeriod: z.enum(['YEAR', 'MONTH', 'WEEK', 'DAY', 'HOUR']).nullable(),
  sponsorshipMention: z.enum(['NONE', 'OFFERED', 'NOT_OFFERED', 'UNCLEAR']),
  sponsorshipEvidence: z.string().nullable(),
  requirements: z.array(z.string()),
  preferredRequirements: z.array(z.string()),
});

const SentenceSchema = z.object({ text: z.string(), refs: z.array(z.string()) });

const CvPlanSchema = z.object({
  evidencePriority: z.array(z.string()),
  skillPriority: z.array(z.string()),
  summary: z.array(SentenceSchema),
});

const CoverLetterSchema = z.object({ paragraphs: z.array(z.array(SentenceSchema)) });

const CAT = z.enum(CATEGORIES);
export const CvImportSchema = z.object({
  personal: z.object({ fullName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), city: z.string().nullable(), headline: z.string().nullable(), links: z.array(z.object({ label: z.string(), url: z.string() })) }),
  employment: z.array(z.object({ ref: z.string(), employer: z.string(), title: z.string(), location: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(), current: z.boolean(), description: z.string().nullable(), tags: z.array(z.string()), categories: z.array(CAT) })),
  education: z.array(z.object({ institution: z.string(), qualification: z.string(), field: z.string().nullable(), grade: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(), inProgress: z.boolean() })),
  projects: z.array(z.object({ ref: z.string(), name: z.string(), role: z.string().nullable(), url: z.string().nullable(), description: z.string().nullable(), shipped: z.boolean(), tags: z.array(z.string()), categories: z.array(CAT) })),
  skills: z.array(z.object({ name: z.string(), categories: z.array(CAT) })),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string().nullable(), issuedAt: z.string().nullable() })),
  evidence: z.array(z.object({ kind: z.enum(['EXPERIENCE', 'ACHIEVEMENT', 'SKILL', 'PROJECT', 'EDUCATION', 'CERTIFICATION', 'TRAIT', 'OTHER']), claim: z.string(), employmentRef: z.string().nullable(), projectRef: z.string().nullable(), categories: z.array(CAT), tags: z.array(z.string()) })),
});
export type CvImport = z.infer<typeof CvImportSchema>;

/**
 * Claude-backed engine. Uses structured outputs so responses are schema-valid, and
 * server-side refusal fallbacks. Everything it produces is re-validated against the
 * candidate database before use (see domain/claimValidation.ts).
 */
export class ClaudeAiEngine implements AiEngine {
  readonly name = 'claude';
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 3 });

  private async call<T>(system: string, user: string | Anthropic.Beta.Messages.BetaContentBlockParam[], schema: z.ZodType<T>, effort: 'low' | 'medium' | 'high'): Promise<T> {
    const response = await this.client.beta.messages.parse({
      model: env.CLAUDE_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      thinking: { type: 'adaptive' },
      output_config: { effort, format: betaZodOutputFormat(schema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') throw new Error('Claude declined the request');
    if (response.stop_reason === 'max_tokens') throw new Error('Claude response truncated');
    if (!response.parsed_output) throw new Error('Claude returned no parseable output');
    return response.parsed_output as T;
  }

  async analyseJob(job: { title: string; company: string; location: string | null; description: string }): Promise<JobAnalysis> {
    const r = await this.call(JOB_ANALYSIS_PROMPT.system, JOB_ANALYSIS_PROMPT.user(job), JobAnalysisSchema, 'low');
    return {
      classification: {
        category: r.category,
        confidence: Math.max(0, Math.min(1, r.confidence)),
        alternativeCategories: r.alternativeCategories.filter((c) => c !== r.category).slice(0, 3),
        reasoning: r.reasoning,
      },
      facts: {
        remoteType: r.remoteType,
        employmentType: r.employmentType,
        hoursPerWeek: r.hoursPerWeek,
        salaryMin: r.salaryMin,
        salaryMax: r.salaryMax,
        salaryPeriod: r.salaryPeriod,
        sponsorshipMention: r.sponsorshipMention,
        sponsorshipEvidence: r.sponsorshipEvidence,
        requirements: r.requirements.slice(0, 25),
        preferredRequirements: r.preferredRequirements.slice(0, 15),
      },
      engine: this.name,
      promptVersion: JOB_ANALYSIS_PROMPT.version,
    };
  }

  private candidateContext(candidate: Parameters<AiEngine['planCv']>[0]['candidate'], purpose: 'cv' | 'application') {
    return {
      evidence: candidate.evidence
        .filter((e) => (purpose === 'cv' ? e.allowedForCV : e.allowedForApplication))
        .map((e) => ({ id: e.id, kind: e.kind, claim: e.claim, categories: e.categories, tags: e.tags, employmentId: e.employmentId, projectId: e.projectId })),
      skills: candidate.skills.map((s) => ({ id: s.id, name: s.name, level: s.level, years: s.years })),
      employment: candidate.employment.map((e) => ({ id: e.id, title: e.title, employer: e.employer, current: e.current, tags: e.tags })),
      education: candidate.education.map((e) => ({ id: e.id, qualification: e.qualification, field: e.field, institution: e.institution, inProgress: e.inProgress })),
      projects: candidate.projects.map((p) => ({ id: p.id, name: p.name, role: p.role, shipped: p.shipped })),
    };
  }

  async planCv({ job, profile, candidate }: Parameters<AiEngine['planCv']>[0]) {
    const ctx = this.candidateContext(candidate, 'cv');
    const plan = await this.call(
      CV_PLAN_PROMPT.system,
      CV_PLAN_PROMPT.user({
        jobTitle: job.title,
        company: job.company,
        jobText: `${job.description}\n${job.requirements.join('\n')}`,
        profileName: profile.name,
        track: profile.track,
        headline: profile.track === 'PROFESSIONAL' ? candidate.headline ?? null : null,
        ...ctx,
      }),
      CvPlanSchema,
      'medium',
    );
    return { plan, promptVersion: CV_PLAN_PROMPT.version };
  }

  async writeCoverLetter({ job, candidate }: Parameters<AiEngine['writeCoverLetter']>[0]): Promise<CoverLetter> {
    const ctx = this.candidateContext(candidate, 'application');
    const r = await this.call(
      COVER_LETTER_PROMPT.system,
      COVER_LETTER_PROMPT.user({
        jobTitle: job.title,
        company: job.company,
        jobText: `${job.description}\n${job.requirements.join('\n')}`,
        headline: candidate.headline ?? null,
        evidence: ctx.evidence,
        skills: ctx.skills,
        employment: ctx.employment,
        education: ctx.education,
      }),
      CoverLetterSchema,
      'medium',
    );
    return { paragraphs: r.paragraphs as CvSentence[][], engine: this.name, promptVersion: COVER_LETTER_PROMPT.version };
  }

  /** Extract draft profile records from an uploaded CV (PDF as a document block, DOCX as text). */
  async importCv(file: { pdfBase64?: string; text?: string; fileName: string }): Promise<{ data: CvImport; promptVersion: string }> {
    const instruction = `Extract draft records from this CV (${file.fileName}).`;
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = file.pdfBase64
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.pdfBase64 } }, { type: 'text', text: instruction }]
      : [{ type: 'text', text: `<cv>\n${(file.text ?? '').slice(0, 60000)}\n</cv>\n\n${instruction}` }];
    const data = await this.call(CV_IMPORT_PROMPT.system, content, CvImportSchema, 'medium');
    return { data, promptVersion: CV_IMPORT_PROMPT.version };
  }
}
