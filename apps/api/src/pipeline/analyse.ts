import type { CvProfile, Prisma, Settings } from '@prisma/client';
import type { AiEngine } from '../ai/engine.js';
import { prisma } from '../db.js';
import { assessEligibility } from '../domain/eligibility.js';
import { computeMatch, estimateMonthlyPay } from '../domain/matching.js';
import { lookupSponsor } from '../sponsors/register.js';
import { selectCvProfile } from '../domain/profileSelection.js';
import { trackForCategory } from '../domain/types.js';
import { audit } from '../lib/audit.js';
import type { FullCandidate } from '../lib/candidate.js';
import { transition } from './transition.js';

export interface PipelineContext {
  candidate: FullCandidate;
  profiles: CvProfile[];
  settings: Settings;
  ai: AiEngine;
  now?: Date;
  actor?: string;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** DEDUPLICATED → CLASSIFIED → ELIGIBILITY_CHECKED → MATCHED → QUEUED (or a rule-based exit). */
export async function analyseApplication(applicationId: string, ctx: PipelineContext) {
  const actor = ctx.actor ?? 'system';
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { job: true } });
  if (app.status !== 'DEDUPLICATED') return app;
  let job = app.job;
  const now = ctx.now ?? new Date();

  if (job.closingDate && job.closingDate < now) {
    return transition(app.id, 'EXPIRED', {}, { message: 'Closing date has passed', actor });
  }

  // 1. Classify + extract facts. Source-provided structured fields win over text extraction.
  const analysis = await ctx.ai.analyseJob({ title: job.title, company: job.company, location: job.location, description: job.description });
  const f = analysis.facts;
  job = await prisma.job.update({
    where: { id: job.id },
    data: {
      category: analysis.classification.category,
      classification: json({ ...analysis.classification, engine: analysis.engine }),
      analysisVersion: analysis.promptVersion ?? `heuristic@1`,
      remoteType: job.remoteType !== 'UNKNOWN' ? job.remoteType : f.remoteType ?? 'UNKNOWN',
      employmentType: job.employmentType !== 'UNKNOWN' ? job.employmentType : f.employmentType ?? 'UNKNOWN',
      hoursPerWeek: job.hoursPerWeek ?? f.hoursPerWeek ?? null,
      hoursText: job.hoursText ?? f.hoursText ?? null,
      salaryMin: job.salaryMin ?? f.salaryMin ?? null,
      salaryMax: job.salaryMax ?? f.salaryMax ?? null,
      salaryPeriod: job.salaryPeriod ?? f.salaryPeriod ?? null,
      salaryText: job.salaryText ?? f.salaryText ?? null,
      sponsorshipMention: f.sponsorshipMention ?? 'NONE',
      sponsorshipEvidence: f.sponsorshipEvidence ?? null,
      requirements: job.requirements.length ? job.requirements : f.requirements ?? [],
      preferredRequirements: job.preferredRequirements.length ? job.preferredRequirements : f.preferredRequirements ?? [],
    },
  });
  const cls = analysis.classification;
  await transition(app.id, 'CLASSIFIED', {}, { message: `Classified ${cls.category} (${Math.round(cls.confidence * 100)}%)`, actor });
  await audit('JOB_CLASSIFIED', `${cls.category} — ${cls.reasoning}`, { applicationId: app.id, jobId: job.id, data: cls });

  const track = trackForCategory(cls.category);
  if (!track) {
    return transition(app.id, 'REJECTED_BY_RULE', { failureReason: `Category ${cls.category} is not a target category` }, { message: 'Not a target role', actor });
  }

  // 2. Work eligibility (configurable rules), using the licensed sponsor register for professional roles
  if (track === 'PROFESSIONAL') {
    const sponsor = await lookupSponsor(job.company);
    job = await prisma.job.update({ where: { id: job.id }, data: { sponsorLicensed: sponsor?.licensed ?? null, sponsorMatchName: sponsor?.name ?? null } });
  }
  const auth = ctx.candidate.workAuthorisation;
  const elig = assessEligibility(job, auth, track, { now, periodOverride: ctx.settings.termTimeOverride });
  const hoursCap = elig.workContext === 'STUDENT_PART_TIME' && elig.period === 'TERM' ? auth?.termTimeHoursLimit ?? null : null;
  const estMonthlyPay = track === 'GENERAL' || elig.workContext === 'STUDENT_PART_TIME' ? estimateMonthlyPay(job, hoursCap) : null;
  job = await prisma.job.update({ where: { id: job.id }, data: { eligibility: elig.status, eligibilityDetails: json(elig), estMonthlyPay } });
  await transition(app.id, 'ELIGIBILITY_CHECKED', { track, workContext: elig.workContext }, { message: `Eligibility: ${elig.status} (${elig.workContext})`, actor });
  await audit('ELIGIBILITY_CHECKED', `${elig.status}: ${elig.reasons.join(' ')}`, { applicationId: app.id, jobId: job.id, data: elig });

  // 3. Profile + match
  const { profile, reason } = selectCvProfile(job, cls.category, cls.alternativeCategories, ctx.profiles);
  const minScore = track === 'PROFESSIONAL' ? ctx.settings.minMatchProfessional : ctx.settings.minMatchGeneral;
  const match = computeMatch({
    job,
    category: cls.category,
    alternativeCategories: cls.alternativeCategories,
    track,
    candidate: ctx.candidate,
    profile,
    eligibility: elig.status,
    applicationMethod: job.applicationMethod,
    now,
    minScore,
  });
  await prisma.job.update({ where: { id: job.id }, data: { match: json({ ...match, profileReason: reason }), matchScore: match.score } });
  // General work is ranked towards the income goal: better-paid jobs with more (allowed) hours first.
  const priority = match.score + (estMonthlyPay ? Math.min(15, estMonthlyPay / 70) : 0);
  await transition(app.id, 'MATCHED', { cvProfileId: profile?.id ?? null, priority }, { message: `Match ${match.score} → ${match.recommendation}`, actor });
  await audit('MATCH_CALCULATED', `Score ${match.score}; ${match.recommendation}. ${reason}`, { applicationId: app.id, jobId: job.id, data: match });

  // 4. Decide
  if (match.hardBlocks.length) {
    return transition(app.id, 'REJECTED_BY_RULE', { failureReason: match.hardBlocks.join(' ') }, { message: 'Hard constraint', actor });
  }
  if (match.recommendation === 'APPLY') {
    const updated = await transition(app.id, 'QUEUED', { queuedAt: now }, { message: `Queued (${profile?.name})`, actor });
    await audit('APPLICATION_QUEUED', `Queued with CV profile ${profile?.name}`, { applicationId: app.id, jobId: job.id });
    return updated;
  }
  if (match.recommendation === 'CONSIDER' && elig.status === 'REQUIRES_REVIEW') {
    await audit('HUMAN_INTERVENTION_REQUIRED', 'Good match but work eligibility needs review', { applicationId: app.id, jobId: job.id, data: elig.reasons });
    return transition(
      app.id,
      'NEEDS_HUMAN',
      { humanInterventionReason: `Eligibility requires review: ${elig.reasons.join(' ')}`, exceptionType: null, browserState: json({ stepReached: 'eligibility_review' }) },
      { message: 'Eligibility review needed', actor },
    );
  }
  return transition(app.id, 'SKIPPED', { failureReason: `Match ${match.score} below threshold ${minScore}` }, { message: 'Below match threshold', actor });
}
