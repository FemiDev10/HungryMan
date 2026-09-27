import { Link } from 'react-router';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Inbox,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Trophy,
  XCircle,
  Zap,
  Handshake,
} from 'lucide-react';
import { api } from '../api/client';
import type { AgentAction, AgentStatusView, ApplicationRow, Overview } from '../api/types';
import { useAction, useCandidate, useNow, useOverview } from '../lib/hooks';
import { fmtDuration, fmtRelative, greeting } from '../lib/format';
import { IN_FLIGHT, humanize, STATUS_LABELS } from '../lib/labels';
import { StatCard } from '../components/StatCard';
import { AgentStateBadge, StatusBadge } from '../components/StatusBadge';
import { NotificationItem } from '../components/NotificationBell';
import { Button, Card, cx, EmptyState, ErrorBox, LoadingBlock, SimulatedBadge } from '../components/ui';

function Elapsed({ agent, fetchedAt }: { agent: AgentStatusView; fetchedAt: number }) {
  const now = useNow(1000);
  if (!agent.running) return <span>—</span>;
  let secs: number | null = null;
  if (agent.startedAt) secs = (now - new Date(agent.startedAt).getTime()) / 1000;
  else if (agent.elapsedSeconds != null) secs = agent.elapsedSeconds + (now - fetchedAt) / 1000;
  return <span className="font-mono tabular-nums">{fmtDuration(secs)}</span>;
}

const CONTROLS: { action: AgentAction; label: string; icon: typeof Play; variant?: 'primary' | 'secondary' | 'danger' }[] = [
  { action: 'RUN_NOW', label: 'Run now', icon: Zap, variant: 'primary' },
  { action: 'DISCOVER_NOW', label: 'Discover now', icon: Search },
  { action: 'PAUSE', label: 'Pause', icon: Pause },
  { action: 'RESUME', label: 'Resume', icon: Play },
  { action: 'STOP', label: 'Stop', icon: Square },
  { action: 'RETRY_FAILED', label: 'Retry failed', icon: RotateCcw },
  { action: 'RETRY_BLOCKED', label: 'Retry blocked', icon: RotateCcw },
];

function AgentControls({ agent }: { agent: AgentStatusView }) {
  const control = useAction((a: AgentAction) => api.agentControl(a), {
    success: (r) => r?.message ?? 'Done',
    invalidate: [['overview'], ['applications'], ['notifications']],
  });
  const disabled = (a: AgentAction) =>
    (a === 'PAUSE' && agent.state !== 'RUNNING') || (a === 'RESUME' && agent.state === 'RUNNING') || (a === 'STOP' && agent.state === 'STOPPED');
  return (
    <div className="flex flex-wrap gap-2">
      {CONTROLS.map((c) => (
        <Button
          key={c.action}
          size="sm"
          variant={c.variant ?? 'secondary'}
          icon={<c.icon className="size-3.5" />}
          disabled={disabled(c.action) || (control.isPending && control.variables !== c.action)}
          loading={control.isPending && control.variables === c.action}
          onClick={() => control.mutate(c.action)}
        >
          {c.label}
        </Button>
      ))}
    </div>
  );
}

function LiveAgentCard({ agent, fetchedAt }: { agent: AgentStatusView; fetchedAt: number }) {
  const app = agent.currentApplication;
  const pos = agent.queuePosition != null && agent.queueTotal ? `${agent.queuePosition} / ${agent.queueTotal}` : '—';
  const progress = agent.queuePosition != null && agent.queueTotal ? agent.queuePosition / agent.queueTotal : 0;
  return (
    <Card
      title="Live agent"
      actions={<AgentStateBadge state={agent.state} large />}
      bodyClassName="space-y-5"
    >
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-subtle">{agent.running ? 'Working on' : 'Idle'}</div>
          {app ? (
            <Link to={`/applications/${app.id}`} className="group mt-1 block">
              <div className="truncate text-lg font-semibold text-fg group-hover:underline">{app.job.title}</div>
              <div className="truncate text-sm text-muted">
                {app.job.company}
                {app.job.location ? ` · ${app.job.location}` : ''}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={app.status} />
                {app.simulated && <SimulatedBadge />}
              </div>
            </Link>
          ) : (
            <div className="mt-1 text-sm text-muted">{agent.currentTask ?? 'No application in progress.'}</div>
          )}
          {agent.currentStep && (
            <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">Step</div>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-fg">
                {agent.running && <span className="size-1.5 shrink-0 rounded-full bg-sky-500 animate-soft-pulse" />}
                {agent.currentStep}
              </div>
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-subtle">Current task</dt>
            <dd className="mt-0.5 truncate text-fg">{agent.currentTask ? humanize(agent.currentTask) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Source</dt>
            <dd className="mt-0.5 truncate text-fg">{agent.currentSource ?? app?.job.source ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Elapsed</dt>
            <dd className="mt-0.5 text-fg">
              <Elapsed agent={agent} fetchedAt={fetchedAt} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Queue position</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-fg">{pos}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-subtle">Next scheduled run</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-fg">
              <CalendarClock className="size-3.5 text-subtle" />
              {agent.nextScheduled ? `${agent.nextScheduled.time} · ${humanize(agent.nextScheduled.action)}` : 'Nothing scheduled'}
            </dd>
          </div>
          {agent.lastHeartbeat && (
            <div className="col-span-2 text-xs text-subtle">Last heartbeat {fmtRelative(agent.lastHeartbeat)}</div>
          )}
        </dl>
      </div>
      {agent.queueTotal ? (
        <div className="h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      ) : null}
      <div className="border-t border-line pt-4">
        <AgentControls agent={agent} />
      </div>
    </Card>
  );
}

function queueMarker(r: ApplicationRow, currentId: string | undefined) {
  if (r.status === 'SUBMITTED') return { char: '✓', cls: 'text-emerald-500', title: 'Submitted' };
  if (r.status === 'FAILED') return { char: '✕', cls: 'text-red-500', title: 'Failed' };
  if (r.status === 'NEEDS_HUMAN' || r.status === 'BLOCKED') return { char: '!', cls: 'text-amber-500', title: STATUS_LABELS[r.status] };
  if (r.id === currentId || IN_FLIGHT.includes(r.status)) return { char: '●', cls: 'text-sky-500 animate-soft-pulse', title: 'In progress' };
  return { char: '○', cls: 'text-subtle', title: 'Waiting' };
}

function QueuePreview({ rows, currentId }: { rows: ApplicationRow[]; currentId?: string }) {
  return (
    <Card
      title="Queue"
      actions={
        <Link to="/queue" className="text-xs font-medium text-muted hover:text-fg">
          View all →
        </Link>
      }
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <EmptyState icon={<Inbox className="size-6" />} title="Queue is empty">
          Discovery runs on schedule, or press “Discover now”.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const m = queueMarker(r, currentId);
            return (
              <li key={r.id}>
                <Link to={`/applications/${r.id}`} className={cx('flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2', r.id === currentId && 'bg-sky-500/5')}>
                  <span className={cx('w-4 shrink-0 text-center font-mono text-sm', m.cls)} title={m.title}>
                    {m.char}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="text-fg">{r.job.title}</span>
                    <span className="text-muted"> — {r.job.company}</span>
                  </span>
                  <span className="hidden sm:block">
                    <StatusBadge status={r.status} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Summary({ data, name }: { data: Overview; name?: string }) {
  const { today, agent } = data;
  const first = name?.split(' ')[0];
  return (
    <div className="mb-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {greeting()}
        {first ? `, ${first}` : ''}.
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        {agent.state === 'RUNNING' ? 'Your agent has been running.' : agent.state === 'PAUSED' ? 'Your agent is paused.' : 'Your agent is stopped.'}{' '}
        Today it discovered <b className="text-fg">{today.discovered}</b> jobs, matched <b className="text-fg">{today.relevant}</b>, queued{' '}
        <b className="text-fg">{today.queued}</b> and submitted <b className="text-fg">{today.submitted}</b> applications.{' '}
        {today.needsAttention > 0 ? (
          <Link to="/exceptions" className="font-medium text-amber-600 underline-offset-2 hover:underline dark:text-amber-400">
            {today.needsAttention} {today.needsAttention === 1 ? 'application needs' : 'applications need'} your attention.
          </Link>
        ) : (
          <span>Nothing needs your attention.</span>
        )}
      </p>
    </div>
  );
}

export function OverviewPage() {
  const q = useOverview();
  const candidate = useCandidate();

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  return (
    <>
      <Summary data={d} name={candidate.data?.fullName} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Discovered today" value={d.today.discovered} icon={<Search className="size-4" />} to="/history" />
        <StatCard label="Relevant" value={d.today.relevant} icon={<Sparkles className="size-4" />} to="/history" />
        <StatCard label="Queued" value={d.today.queued} icon={<ListChecks className="size-4" />} tone="blue" to="/queue" />
        <StatCard label="Submitted" value={d.today.submitted} icon={<Send className="size-4" />} tone="green" to="/history?status=SUBMITTED" />
        <StatCard
          label="Needs attention"
          value={d.today.needsAttention}
          icon={<AlertTriangle className="size-4" />}
          tone={d.today.needsAttention ? 'amber' : 'default'}
          to="/exceptions"
        />
        <StatCard label="Failed" value={d.today.failed} icon={<XCircle className="size-4" />} tone={d.today.failed ? 'red' : 'default'} to="/history?status=FAILED" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total submitted" value={d.totals.submitted} icon={<CheckCircle2 className="size-4" />} hint="Real submissions only" />
        <StatCard label="Interviews" value={d.totals.interviews} icon={<Handshake className="size-4" />} tone={d.totals.interviews ? 'blue' : 'default'} />
        <StatCard label="Offers" value={d.totals.offers} icon={<Trophy className="size-4" />} tone={d.totals.offers ? 'green' : 'default'} />
        <StatCard label="Applications made" value={d.totals.applications} icon={<Inbox className="size-4" />} to="/history?status=SUBMITTED" hint="Submitted or attempted" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
        <div className="space-y-6">
          <LiveAgentCard agent={d.agent} fetchedAt={q.dataUpdatedAt} />
        </div>
        <QueuePreview rows={d.queuePreview} currentId={d.agent.currentApplication?.id} />
      </div>

      <div className="mt-6">
        <Card title="Recent notifications" bodyClassName="p-0">
          {d.recentNotifications.length === 0 ? (
            <EmptyState title="No notifications yet" />
          ) : (
            <div className="divide-y divide-line">
              {d.recentNotifications.map((n) =>
                n.applicationId ? (
                  <Link key={n.id} to={`/applications/${n.applicationId}`} className="block">
                    <NotificationItem n={n} />
                  </Link>
                ) : (
                  <NotificationItem key={n.id} n={n} />
                ),
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
