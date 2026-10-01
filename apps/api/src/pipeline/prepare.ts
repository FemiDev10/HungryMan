import crypto from 'node:crypto';
import type { CvProfile, Prisma } from '@prisma/client';
import { renderCoverLetterPdf, renderCvPdf } from '../cv/render.js';
import { atsReport } from '../domain/ats.js';
import { prisma } from '../db.js';
import { prepareAnswers } from '../domain/answers.js';
import { validateCv, validateSentence, type ClaimValidationReport } from '../domain/claimValidation.js';
import { buildCvContent, type CvContent, type CvSentence } from '../domain/cvBuilder.js';
import { hasPhrase } from '../domain/text.js';
import { audit } from '../lib/audit.js';
import { storage } from '../storage/storage.js';
import type { PipelineContext } from './analyse.js';
import { transition } from './transition.js';

const json = (v: unknown) => v as Prisma.InputJsonValue;

function datePart(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function uniqueFileName(base: string, ext: string) {
  let name = `${base}.${ext}`;
  for (let v = 2; await prisma.document.findUnique({ where: { fileName: name }, select: { id: true } }); v++) name = `${base}-v${v}.${ext}`;
  return name;
}

/** Generate and validate a tailored CV. Falls back to the deterministic plan if an AI plan fails validation. */
export async function generateCv(ctx: PipelineContext, job: Parameters<typeof buildCvContent>[0]['job'] & object, category: Parameters<typeof buildCvContent>[0]['category'], profile: CvProfile) {
  let generator = 'deterministic';
  let promptVersion: string | null = null;
  let content: CvContent | null = null;
  let report: ClaimValidationReport | null = null;
  const rejected: string[] = [];

  if (ctx.ai.name !== 'deterministic') {
    try {
      const { plan, promptVersion: pv } = await ctx.ai.planCv({ job, category, profile, candidate: ctx.candidate });
      if (plan) {
        const candidateContent = buildCvContent({ candidate: ctx.candidate, profile, job, category, plan });
        const r = validateCv(candidateContent, ctx.candidate);
        if (r.valid) {
          content = candidateContent;
          report = r;
          generator = ctx.ai.name;
          promptVersion = pv;
        } else rejected.push(...r.errors);
      }
    } catch (err) {
      rejected.push(`AI plan failed: ${(err as Error).message}`);
    }
  }
  if (!content) {
    content = buildCvContent({ candidate: ctx.candidate, profile, job, category });
    report = validateCv(content, ctx.candidate);
  }
  if (rejected.length) report!.warnings.push(`AI-generated summary rejected by validator; used evidence-only version. (${rejected.slice(0, 3).join('; ')})`);
  return { content, report: report!, generator, promptVersion };
}

/** QUEUED → CV_GENERATING → CV_VALIDATED → APPLICATION_PREPARING → READY_FOR_BROWSER */
export async function prepareApplication(applicationId: string, ctx: PipelineContext) {
  const actor = ctx.actor ?? 'system';
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { job: true, cvProfile: true } });
  if (app.status !== 'QUEUED') return app;
  const { job } = app;
  const profile = app.cvProfile ?? ctx.profiles.find((p) => p.id === app.cvProfileId);
  if (!profile || !job.category || !app.track) {
    return transition(app.id, 'FAILED', { failureReason: 'Application has no CV profile/category — re-analyse the job.' }, { actor });
  }
  const now = ctx.now ?? new Date();
  const ref = String(app.seq).padStart(4, '0');

  // CV
  await transition(app.id, 'CV_GENERATING', { currentStep: 'Generating tailored CV' }, { actor });
  const cv = await generateCv(ctx, job, job.category, profile);
  if (!cv.report.valid) {
    await audit('CV_VALIDATION_FAILED', cv.report.errors.join(' | '), { applicationId: app.id, jobId: job.id, data: cv.report });
    return transition(
      app.id,
      'NEEDS_HUMAN',
      { exceptionType: 'CV_VALIDATION_FAILED', humanInterventionReason: `CV failed claim validation: ${cv.report.errors.slice(0, 3).join('; ')}`, browserState: json({ stepReached: 'cv_validation' }) },
      { message: 'CV validation failed', actor },
    );
  }
  // ATS check: which advert keywords the CV already shows as plain text; gaps are flagged, never filled.
  const ats = atsReport(cv.content, job, job.category);
  if (ats.missing.length) cv.report.warnings.push(`ATS: ${ats.present.length}/${ats.keywords.length} advert keywords on the CV. Not on it (add evidence if you genuinely have them): ${ats.missing.join(', ')}.`);
  (cv.report as typeof cv.report & { ats?: typeof ats }).ats = ats;
  const pdf = await renderCvPdf(cv.content);
  const fileName = await uniqueFileName(`CV-${datePart(now)}-${profile.slug.toUpperCase()}-${ref}`, 'pdf');
  const storageKey = `cv/${datePart(now)}/${crypto.randomUUID()}.pdf`;
  await storage.put(storageKey, pdf);
  const cvDoc = await prisma.document.create({
    data: {
      kind: 'CV',
      applicationId: app.id,
      cvProfileId: profile.id,
      fileName,
      storageKey,
      sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
      sizeBytes: pdf.length,
      content: json(cv.content),
      validation: json(cv.report),
      generator: cv.generator,
      promptVersion: cv.promptVersion,
    },
  });
  await audit('CV_GENERATED', `${fileName} (${cv.generator})`, { applicationId: app.id, jobId: job.id, data: { documentId: cvDoc.id, sha256: cvDoc.sha256 } });
  await transition(app.id, 'CV_VALIDATED', { cvVersionId: cvDoc.id, currentStep: 'CV validated' }, { actor });
  await audit('CV_VALIDATED', `${cv.report.checkedClaims} claims checked; ${cv.report.warnings.length} warnings`, { applicationId: app.id, jobId: job.id, data: cv.report });

  // Cover letter + answers
  await transition(app.id, 'APPLICATION_PREPARING', { currentStep: 'Preparing answers' }, { actor });
  let coverLetterVersionId: string | null = null;
  const wantsLetter =
    profile.includeCoverLetter === 'ALWAYS' ||
    (profile.includeCoverLetter === 'WHEN_REQUIRED' && (hasPhrase(job.description, 'cover letter') || hasPhrase(job.description, 'covering letter')));
  if (wantsLetter) {
    const letter = await ctx.ai.writeCoverLetter({ job, category: job.category, profile, candidate: ctx.candidate });
    // Drop any sentence that is not supported by candidate data.
    const dropped: string[] = [];
    const paragraphs = letter.paragraphs
      .map((p) =>
        p.filter((s: CvSentence) => {
          const errs = validateSentence(s.text, s.refs, ctx.candidate, job.title, 'application');
          if (errs.length) dropped.push(...errs);
          return errs.length === 0;
        }),
      )
      .filter((p) => p.length);
    const letterPdf = await renderCoverLetterPdf({ name: ctx.candidate.fullName, email: ctx.candidate.email, phone: ctx.candidate.phone, company: job.company, jobTitle: job.title, paragraphs });
    const letterName = await uniqueFileName(`COVER-${datePart(now)}-${profile.slug.toUpperCase()}-${ref}`, 'pdf');
    const letterKey = `cover/${datePart(now)}/${crypto.randomUUID()}.pdf`;
    await storage.put(letterKey, letterPdf);
    const doc = await prisma.document.create({
      data: {
        kind: 'COVER_LETTER',
        applicationId: app.id,
        cvProfileId: profile.id,
        fileName: letterName,
        storageKey: letterKey,
        sha256: crypto.createHash('sha256').update(letterPdf).digest('hex'),
        sizeBytes: letterPdf.length,
        content: json({ paragraphs }),
        validation: json({ valid: true, checkedClaims: paragraphs.flat().length, errors: [], warnings: dropped.map((d) => `Removed: ${d}`) }),
        generator: letter.engine,
        promptVersion: letter.promptVersion,
      },
    });
    coverLetterVersionId = doc.id;
    await audit('COVER_LETTER_GENERATED', `${letterName}${dropped.length ? ` (${dropped.length} unsupported sentences removed)` : ''}`, { applicationId: app.id, jobId: job.id, data: { documentId: doc.id } });
  }

  const library = await prisma.answerTemplate.findMany();
  const answers = prepareAnswers(ctx.candidate, app.track, library, app.workContext ?? 'STANDARD', job.location);
  const version = (await prisma.answerSet.count({ where: { applicationId: app.id } })) + 1;
  const answerSet = await prisma.answerSet.create({ data: { applicationId: app.id, version, answers: json(answers) } });
  const unknown = answers.filter((a) => a.answer === 'UNKNOWN').map((a) => a.key);
  await audit('ANSWERS_PREPARED', `${answers.length} answers (v${version}); unknown: ${unknown.join(', ') || 'none'}`, { applicationId: app.id, jobId: job.id });

  return transition(
    app.id,
    'READY_FOR_BROWSER',
    { coverLetterVersionId, answersVersionId: answerSet.id, currentStep: 'Ready for browser agent' },
    { message: 'Application prepared', actor },
  );
}
