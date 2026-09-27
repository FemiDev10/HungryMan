import type { ApplicationStatus } from '@prisma/client';

export const PIPELINE_ORDER: ApplicationStatus[] = [
  'DISCOVERED',
  'DEDUPLICATED',
  'CLASSIFIED',
  'ELIGIBILITY_CHECKED',
  'MATCHED',
  'QUEUED',
  'CV_GENERATING',
  'CV_VALIDATED',
  'APPLICATION_PREPARING',
  'READY_FOR_BROWSER',
  'BROWSER_EXECUTING',
  'SUBMISSION_ATTEMPTED',
  'SUBMITTED',
];

export const TERMINAL: ApplicationStatus[] = ['SUBMITTED', 'SKIPPED', 'REJECTED_BY_RULE', 'EXPIRED', 'DUPLICATE'];
export const ATTENTION: ApplicationStatus[] = ['NEEDS_HUMAN', 'BLOCKED'];
export const IN_QUEUE: ApplicationStatus[] = [
  'QUEUED',
  'CV_GENERATING',
  'CV_VALIDATED',
  'APPLICATION_PREPARING',
  'READY_FOR_BROWSER',
  'BROWSER_EXECUTING',
  'SUBMISSION_ATTEMPTED',
];

const SIDE_EXITS: ApplicationStatus[] = ['SKIPPED', 'REJECTED_BY_RULE', 'NEEDS_HUMAN', 'BLOCKED', 'FAILED', 'EXPIRED', 'DUPLICATE'];

/** Allowed transitions. Forward along the pipeline one step, to any side exit, or back to QUEUED on retry. */
export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (from === to) return true;
  if (from === 'SUBMITTED') return false; // a confirmed submission is final
  if (SIDE_EXITS.includes(to)) return true;
  if (to === 'QUEUED') return from !== 'DUPLICATE'; // retry / requeue
  if (from === 'SUBMISSION_ATTEMPTED' && to === 'SUBMITTED') return true;
  if (to === 'SUBMITTED' && ATTENTION.includes(from)) return true; // human completed it manually
  if (from === 'BROWSER_EXECUTING' && to === 'SUBMITTED') return true; // agent returned confirmation evidence directly
  if (from === 'READY_FOR_BROWSER' && to === 'BROWSER_EXECUTING') return true;
  if (from === 'BROWSER_EXECUTING' && to === 'READY_FOR_BROWSER') return true; // lease expired, re-dispatch
  const i = PIPELINE_ORDER.indexOf(from);
  const j = PIPELINE_ORDER.indexOf(to);
  return i >= 0 && j === i + 1;
}

export class InvalidTransitionError extends Error {
  constructor(from: ApplicationStatus, to: ApplicationStatus) {
    super(`Invalid application transition ${from} → ${to}`);
  }
}

export function formatRef(seq: number): string {
  return `APP-${String(seq).padStart(5, '0')}`;
}
