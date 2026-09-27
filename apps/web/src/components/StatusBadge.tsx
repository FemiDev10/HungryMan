import type { AgentState, ApplicationStatus, Eligibility, Outcome } from '../api/types';
import {
  AGENT_LABELS,
  agentTone,
  ELIGIBILITY_LABELS,
  eligibilityTone,
  OUTCOME_LABELS,
  outcomeTone,
  STATUS_LABELS,
  statusTone,
  TONE_DOT,
} from '../lib/labels';
import { Badge, cx } from './ui';

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function EligibilityBadge({ value }: { value: Eligibility | null | undefined }) {
  if (!value) return <span className="text-subtle">—</span>;
  return <Badge tone={eligibilityTone(value)}>{ELIGIBILITY_LABELS[value] ?? value}</Badge>;
}

export function OutcomeBadge({ value }: { value: Outcome }) {
  if (value === 'NONE') return null;
  return <Badge tone={outcomeTone(value)}>{OUTCOME_LABELS[value]}</Badge>;
}

export function AgentStateBadge({ state, large }: { state: AgentState; large?: boolean }) {
  const tone = agentTone(state);
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 font-medium text-fg',
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs',
      )}
    >
      <span className={cx('size-2 rounded-full', TONE_DOT[tone], state === 'RUNNING' && 'animate-soft-pulse')} />
      {AGENT_LABELS[state] ?? state}
    </span>
  );
}
