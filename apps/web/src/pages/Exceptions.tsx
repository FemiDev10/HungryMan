import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Eye, PartyPopper, RotateCcw, SkipForward } from 'lucide-react';
import { api } from '../api/client';
import type { ApplicationRow } from '../api/types';
import { Modal } from '../components/Modal';
import { ApplicationChips, StatusBadge } from '../components/StatusBadge';
import { Badge, Button, buttonClass, Card, EmptyState, ErrorBox, Field, LoadingBlock, MatchPill, PageHeader, SimulatedBadge } from '../components/ui';
import { POLL_MS, useAction } from '../lib/hooks';
import { CATEGORY_LABELS, EXCEPTION_LABELS } from '../lib/labels';
import { fmtRelative } from '../lib/format';

type Resolve = { id: string; action: 'MARK_SUBMITTED' | 'REQUEUE' | 'SKIP'; note?: string; confirmationNumber?: string };

function stepReached(r: ApplicationRow & { browserState?: Record<string, unknown> | null }): string | null {
  const bs = r.browserState;
  if (bs && typeof bs === 'object') {
    for (const k of ['step', 'lastStep', 'currentStep', 'stepReached']) {
      const v = bs[k];
      if (typeof v === 'string' && v) return v;
    }
  }
  return r.currentStep;
}

function MarkSubmittedModal({ app, onClose, onSubmit, busy }: {
  app: ApplicationRow | null;
  onClose: () => void;
  onSubmit: (b: { confirmationNumber?: string; note?: string }) => void;
  busy: boolean;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal
      open={!!app}
      onClose={onClose}
      title={app?.exceptionType === 'REVIEW_BEFORE_SUBMIT' ? 'I submitted it' : 'Mark as submitted manually'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onSubmit({ confirmationNumber: confirmation.trim() || undefined, note: note.trim() || undefined })}
          >
            Confirm submitted
          </Button>
        </>
      }
    >
      {app && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {app.exceptionType === 'REVIEW_BEFORE_SUBMIT' ? 'Confirm you checked and submitted' : 'Confirm you completed'}{' '}
            <b className="text-fg">{app.job.title}</b> at <b className="text-fg">{app.job.company}</b> yourself.
          </p>
          <Field label="Confirmation number (optional)">
            <input className="input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="e.g. REF-123456" />
          </Field>
          <Field label="Note (optional)">
            <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function ExceptionCard({ r, onResolve, onMark, pending }: {
  r: ApplicationRow & { browserState?: Record<string, unknown> | null };
  onResolve: (b: Resolve) => void;
  onMark: () => void;
  pending: string | null;
}) {
  const step = stepReached(r);
  const review = r.exceptionType === 'REVIEW_BEFORE_SUBMIT';
  return (
    <Card className="flex flex-col" bodyClassName="flex flex-1 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/applications/${r.id}`} className="block truncate font-semibold text-fg hover:underline">
            {r.job.title}
          </Link>
          <div className="truncate text-sm text-muted">
            {r.job.company}
            {r.job.location ? ` · ${r.job.location}` : ''}
          </div>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {r.exceptionType && (
          <Badge tone={review ? 'blue' : 'amber'}>
            {review && <Eye className="size-3" />}
            {EXCEPTION_LABELS[r.exceptionType] ?? r.exceptionType}
          </Badge>
        )}
        {r.job.category && <Badge tone="slate">{CATEGORY_LABELS[r.job.category]}</Badge>}
        <MatchPill score={r.job.matchScore} />
        {r.simulated && <SimulatedBadge />}
        <ApplicationChips
          workContext={r.workContext}
          warmUp={r.warmUp}
          track={r.track}
          sponsorLicensed={r.job.sponsorLicensed}
          estMonthlyPay={r.job.estMonthlyPay}
        />
        <span className="font-mono text-[11px] text-subtle">{r.ref}</span>
      </div>

      {review ? (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/6 p-3 text-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">Ready for your review</div>
          <p className="mt-1 text-fg">The form is filled in, in your Chrome. Check it and press submit yourself.</p>
          {r.humanInterventionReason && <p className="mt-1 text-xs text-muted">{r.humanInterventionReason}</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/6 p-3 text-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">What's needed</div>
          <p className="mt-1 text-fg">{r.humanInterventionReason ?? r.failureReason ?? 'The agent could not continue on this application.'}</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-subtle">Step reached</dt>
          <dd className="mt-0.5 text-fg">{step ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Updated</dt>
          <dd className="mt-0.5 text-fg">{fmtRelative(r.updatedAt)}</dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
        {review ? (
          <>
            <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-3.5" />} onClick={onMark}>
              I submitted it
            </Button>
            <a href={r.job.url} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
              <ExternalLink className="size-3.5" /> Open job
            </a>
          </>
        ) : (
          <>
            <a href={r.job.url} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'sm')}>
              <ExternalLink className="size-3.5" /> Open job
            </a>
            <Button size="sm" icon={<CheckCircle2 className="size-3.5" />} onClick={onMark}>
              I completed it manually
            </Button>
          </>
        )}
        <Button
          size="sm"
          icon={<RotateCcw className="size-3.5" />}
          loading={pending === `${r.id}:REQUEUE`}
          onClick={() => onResolve({ id: r.id, action: 'REQUEUE' })}
        >
          Requeue
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<SkipForward className="size-3.5" />}
          loading={pending === `${r.id}:SKIP`}
          onClick={() => onResolve({ id: r.id, action: 'SKIP' })}
        >
          Skip
        </Button>
      </div>
    </Card>
  );
}

export function ExceptionsPage() {
  const [marking, setMarking] = useState<ApplicationRow | null>(null);
  const q = useQuery({
    queryKey: ['applications', 'exceptions'],
    queryFn: () => api.applications({ view: 'exceptions', page: 1, pageSize: 100 }),
    refetchInterval: POLL_MS,
  });
  const resolve = useAction(({ id, ...body }: Resolve) => api.resolveApplication(id, body), {
    invalidate: [['applications'], ['overview']],
    success: 'Updated',
    onSuccess: () => setMarking(null),
  });
  const pending = resolve.isPending && resolve.variables ? `${resolve.variables.id}:${resolve.variables.action}` : null;

  return (
    <>
      <PageHeader
        title="Exceptions"
        description="Applications the agent paused because they need something only you can provide — a CAPTCHA, a video answer, a login, or missing data. Warm-up applications also stop here so you can check them before submitting."
      />
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : (q.data?.items.length ?? 0) === 0 ? (
        <Card>
          <EmptyState icon={<PartyPopper className="size-7" />} title="Nothing needs you right now">
            The agent will notify you when an application genuinely requires your input.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data!.items.map((r) => (
            <ExceptionCard key={r.id} r={r} pending={pending} onResolve={(b) => resolve.mutate(b)} onMark={() => setMarking(r)} />
          ))}
        </div>
      )}
      <MarkSubmittedModal
        key={marking?.id ?? 'none'}
        app={marking}
        busy={resolve.isPending}
        onClose={() => setMarking(null)}
        onSubmit={(b) => marking && resolve.mutate({ id: marking.id, action: 'MARK_SUBMITTED', ...b })}
      />
    </>
  );
}
