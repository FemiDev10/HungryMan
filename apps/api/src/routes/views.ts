import type { Prisma } from '@prisma/client';
import { formatRef } from '../domain/stateMachine.js';

export const rowInclude = {
  job: { select: { id: true, title: true, company: true, location: true, source: true, url: true, category: true, matchScore: true, eligibility: true, estMonthlyPay: true, sponsorLicensed: true, sponsorMatchName: true } },
  cvProfile: { select: { id: true, name: true, slug: true } },
  documents: { where: { kind: 'CV' as const }, orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, fileName: true } },
} satisfies Prisma.ApplicationInclude;

export type RowApp = Prisma.ApplicationGetPayload<{ include: typeof rowInclude }>;

export function toRow(a: RowApp) {
  return {
    id: a.id,
    ref: formatRef(a.seq),
    status: a.status,
    track: a.track,
    workContext: a.workContext,
    warmUp: a.warmUp,
    currentStep: a.currentStep,
    lastAction: a.lastAction,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    submittedAt: a.submittedAt,
    simulated: a.simulated,
    exceptionType: a.exceptionType,
    humanInterventionReason: a.humanInterventionReason,
    failureReason: a.failureReason,
    outcome: a.outcome,
    browserAgent: a.browserAgent,
    priority: a.priority,
    job: a.job,
    cvProfile: a.cvProfile,
    cvFileName: a.documents[0]?.fileName ?? null,
    browserState: a.browserState,
  };
}
