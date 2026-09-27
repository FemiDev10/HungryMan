import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

export type AuditType =
  | 'JOB_DISCOVERED'
  | 'JOB_DUPLICATE'
  | 'JOB_CLASSIFIED'
  | 'ELIGIBILITY_CHECKED'
  | 'MATCH_CALCULATED'
  | 'APPLICATION_CREATED'
  | 'APPLICATION_QUEUED'
  | 'APPLICATION_SKIPPED'
  | 'STATUS_CHANGED'
  | 'CV_GENERATED'
  | 'CV_VALIDATED'
  | 'CV_VALIDATION_FAILED'
  | 'COVER_LETTER_GENERATED'
  | 'ANSWERS_PREPARED'
  | 'BROWSER_TASK_CREATED'
  | 'BROWSER_STARTED'
  | 'BROWSER_STEP'
  | 'FIELD_FILLED'
  | 'CV_UPLOADED'
  | 'DOCUMENT_UPLOADED'
  | 'SUBMISSION_ATTEMPTED'
  | 'SUBMISSION_CONFIRMED'
  | 'APPLICATION_FAILED'
  | 'HUMAN_INTERVENTION_REQUIRED'
  | 'HUMAN_RESOLVED'
  | 'OUTCOME_RECORDED'
  | 'SOURCE_SEARCH'
  | 'SOURCE_ERROR'
  | 'AGENT_CONTROL'
  | 'AGENT_CYCLE_STARTED'
  | 'AGENT_CYCLE_FINISHED'
  | 'SETTINGS_CHANGED'
  | 'CANDIDATE_UPDATED'
  | 'DATA_EXPORTED'
  | 'DATA_DELETED'
  | 'LOGIN';

export async function audit(
  type: AuditType,
  message: string,
  opts: { applicationId?: string | null; jobId?: string | null; data?: unknown; actor?: string } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        type,
        message,
        actor: opts.actor ?? 'system',
        applicationId: opts.applicationId ?? null,
        jobId: opts.jobId ?? null,
        data: (opts.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Audit failures must never break the pipeline, but should be visible.
    console.error('[audit] failed to write', type, (err as Error).message);
  }
}
