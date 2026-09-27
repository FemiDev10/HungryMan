import { prisma } from '../db.js';

export type NotificationType =
  | 'APPLICATION_SUBMITTED'
  | 'HUMAN_REQUIRED'
  | 'INTERVIEW'
  | 'OFFER'
  | 'AGENT_FAILURE'
  | 'DAILY_SUMMARY';

/**
 * In-app notifications. Deliberately coarse: submissions, human-needed, outcomes,
 * repeated failures and run summaries — never individual browser actions.
 * Add push/email channels by extending `deliver`.
 */
export async function notify(type: NotificationType, title: string, body: string, applicationId?: string | null) {
  const n = await prisma.notification.create({ data: { type, title, body, applicationId: applicationId ?? null } });
  await deliver(n);
  return n;
}

async function deliver(_n: { type: string; title: string; body: string }) {
  // Placeholder for external channels (email / push). In-app is always on.
}
