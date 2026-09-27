import type { ApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { canTransition, InvalidTransitionError } from '../domain/stateMachine.js';
import { audit } from '../lib/audit.js';

/** The only way application status changes. Validates the transition and logs it. */
export async function transition(
  applicationId: string,
  to: ApplicationStatus,
  patch: Prisma.ApplicationUncheckedUpdateInput = {},
  opts: { message?: string; actor?: string; data?: unknown } = {},
) {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { status: true, jobId: true } });
  if (!canTransition(app.status, to)) throw new InvalidTransitionError(app.status, to);
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { ...patch, status: to, lastAction: opts.message ?? patch.lastAction ?? `${app.status} → ${to}` },
  });
  if (app.status !== to) {
    await audit('STATUS_CHANGED', opts.message ?? `${app.status} → ${to}`, {
      applicationId,
      jobId: app.jobId,
      actor: opts.actor,
      data: { from: app.status, to, ...(opts.data ? { detail: opts.data } : {}) },
    });
  }
  return updated;
}
