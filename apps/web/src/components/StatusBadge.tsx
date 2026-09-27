import { BadgeCheck, CalendarClock, Eye } from 'lucide-react';
import type { AgentState, ApplicationStatus, Eligibility, Outcome, WorkContext } from '../api/types';
import { fmtGBP } from '../lib/format';
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
  WORK_CONTEXT_LABELS,
  workContextTone,
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

/** Licensed-sponsor register result. Renders nothing when the register wasn't consulted (null). */
export function SponsorBadge({ licensed, registerName }: { licensed: boolean | null | undefined; registerName?: string | null }) {
  if (licensed == null) return null;
  if (licensed)
    return (
      <span title={registerName ? `On the register of licensed sponsors as “${registerName}”` : 'On the register of licensed sponsors'}>
        <Badge tone="green">
          <BadgeCheck className="size-3" />
          Licensed sponsor
        </Badge>
      </span>
    );
  return (
    <span title="Employer not found on the register of licensed sponsors">
      <Badge tone="grey">Not on register</Badge>
    </span>
  );
}

export function WorkContextBadge({ value }: { value: WorkContext | null | undefined }) {
  if (!value || value === 'STANDARD') return null;
  return (
    <Badge tone={workContextTone(value)}>
      {value === 'SPONSORED_AFTER_COURSE' && <CalendarClock className="size-3" />}
      {WORK_CONTEXT_LABELS[value]}
    </Badge>
  );
}

export function WarmUpBadge() {
  return (
    <span title="One of your first applications — the agent fills it in but stops before submit so you can check it">
      <Badge tone="amber">
        <Eye className="size-3" />
        Warm-up
      </Badge>
    </span>
  );
}

export function MonthlyPay({ value }: { value: number | null | undefined }) {
  if (value == null || !(value > 0)) return null;
  return (
    <span title="Estimated monthly pay before tax (hourly rate × hours, capped at your term-time limit)">
      <Badge tone="slate">~{fmtGBP(value)}/mo</Badge>
    </span>
  );
}

/** Row-level chips for a job/application: work context, warm-up, sponsor, pay. */
export function ApplicationChips({ workContext, warmUp, track, sponsorLicensed, registerName, estMonthlyPay }: {
  workContext: WorkContext | null | undefined;
  warmUp?: boolean;
  track?: string | null;
  sponsorLicensed: boolean | null | undefined;
  registerName?: string | null;
  estMonthlyPay: number | null | undefined;
}) {
  return (
    <>
      <WorkContextBadge value={workContext} />
      {warmUp && <WarmUpBadge />}
      {track === 'PROFESSIONAL' && <SponsorBadge licensed={sponsorLicensed} registerName={registerName} />}
      <MonthlyPay value={estMonthlyPay} />
    </>
  );
}
