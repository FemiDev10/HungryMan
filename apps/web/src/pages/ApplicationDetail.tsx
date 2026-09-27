import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SkipForward,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  AnswerSet,
  ApplicationDetail,
  ApplicationStatus,
  AuditLog,
  BrowserTask,
  DocumentItem,
  EligibilityDetails,
  Job,
  MatchResult,
  Outcome,
} from '../api/types';
import { Modal } from '../components/Modal';
import { ValidationReportView } from '../components/ValidationReport';
import { CvContent } from '../components/CvContent';
import { EligibilityBadge, OutcomeBadge, StatusBadge } from '../components/StatusBadge';
import { Table } from '../components/Table';
import {
  Badge,
  Button,
  buttonClass,
  Callout,
  Card,
  Chips,
  cx,
  EmptyState,
  ErrorBox,
  Field,
  JsonBlock,
  KeyValue,
  LoadingBlock,
  MatchPill,
  ScoreBar,
  Select,
  SimulatedBadge,
} from '../components/ui';
import { useAction } from '../lib/hooks';
import { CATEGORY_LABELS, EXCEPTION_LABELS, humanize, OUTCOME_LABELS, OUTCOMES, TRACK_LABELS } from '../lib/labels';
import { fmtBytes, fmtDate, fmtDateTime, fmtRelative } from '../lib/format';

// ───────────── Status timeline ─────────────

const STAGES = ['Discovered', 'Analysed', 'Queued', 'CV ready', 'Prepared', 'Browser', 'Submitted'] as const;

function stageOf(s: ApplicationStatus): number {
  switch (s) {
    case 'DISCOVERED':
    case 'DEDUPLICATED':
      return 0;
    case 'CLASSIFIED':
    case 'ELIGIBILITY_CHECKED':
    case 'MATCHED':
      return 1;
    case 'QUEUED':
    case 'CV_GENERATING':
      return 2;
    case 'CV_VALIDATED':
    case 'APPLICATION_PREPARING':
      return 3;
    case 'READY_FOR_BROWSER':
      return 4;
    case 'BROWSER_EXECUTING':
    case 'SUBMISSION_ATTEMPTED':
      return 5;
    case 'SUBMITTED':
      return 6;
    default:
      return -1;
  }
}

function StatusTimeline({ d }: { d: ApplicationDetail }) {
  const s = d.application.status;
  let reached = stageOf(s);
  const halted = reached === -1;
  if (halted) {
    // Infer how far it got before stopping.
    if (d.browserTasks.length) reached = 5;
    else if (d.answerSets.length) reached = 4;
    else if (d.documents.length) reached = 3;
    else if (d.job.match) reached = 1;
    else reached = 0;
  }
  const done = s === 'SUBMITTED';
  const haltTone = s === 'FAILED' ? 'red' : s === 'NEEDS_HUMAN' || s === 'BLOCKED' ? 'amber' : 'grey';
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[36rem] items-start">
        {STAGES.map((label, i) => {
          const isDone = i < reached || (done && i === reached);
          const isCurrent = i === reached && !done;
          const isHalt = halted && isCurrent;
          return (
            <li key={label} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div className={cx('h-0.5 flex-1', i === 0 ? 'bg-transparent' : i <= reached ? 'bg-accent' : 'bg-surface-3')} />
                <div
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-4 ring-surface',
                    isDone && 'bg-accent text-accent-fg',
                    isCurrent && !isHalt && 'bg-sky-500 text-white',
                    isHalt && haltTone === 'red' && 'bg-red-500 text-white',
                    isHalt && haltTone === 'amber' && 'bg-amber-500 text-white',
                    isHalt && haltTone === 'grey' && 'bg-zinc-400 text-white',
                    !isDone && !isCurrent && 'bg-surface-3 text-subtle',
                  )}
                >
                  {isDone ? '✓' : isHalt ? (haltTone === 'red' ? '✕' : '!') : i + 1}
                </div>
                <div className={cx('h-0.5 flex-1', i === STAGES.length - 1 ? 'bg-transparent' : i < reached ? 'bg-accent' : 'bg-surface-3')} />
              </div>
              <div className={cx('mt-1.5 text-[11px]', isCurrent || isDone ? 'text-fg' : 'text-subtle')}>{label}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────── Sections ─────────────

function ClassificationCard({ job }: { job: Job }) {
  const c = job.classification;
  return (
    <Card title="Classification">
      {!c ? (
        <p className="text-sm text-muted">{job.category ? CATEGORY_LABELS[job.category] : 'Not classified yet.'}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{CATEGORY_LABELS[c.category] ?? c.category}</Badge>
            <span className="text-muted">{Math.round((c.confidence <= 1 ? c.confidence * 100 : c.confidence))}% confidence</span>
          </div>
          {c.alternativeCategories?.length > 0 && (
            <div>
              <div className="label">Alternatives</div>
              <Chips items={c.alternativeCategories.map((a) => CATEGORY_LABELS[a] ?? a)} />
            </div>
          )}
          {c.reasoning && <p className="leading-relaxed text-muted">{c.reasoning}</p>}
        </div>
      )}
    </Card>
  );
}

function EligibilityCard({ job }: { job: Job }) {
  const e = job.eligibilityDetails as EligibilityDetails | null;
  const status = e?.status ?? job.eligibility;
  return (
    <Card title="Eligibility" actions={<EligibilityBadge value={status} />}>
      <div className="space-y-3 text-sm">
        {e?.reasons?.length ? (
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {e.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No eligibility reasoning recorded.</p>
        )}
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted">
            Sponsorship: <Badge tone="slate">{humanize(e?.sponsorship?.mention ?? job.sponsorshipMention ?? 'UNCLEAR')}</Badge>
          </div>
          {(e?.sponsorship?.evidence ?? job.sponsorshipEvidence) && (
            <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-xs italic text-muted">
              “{e?.sponsorship?.evidence ?? job.sponsorshipEvidence}”
            </blockquote>
          )}
          {e?.sponsorship?.note && <p className="mt-2 text-xs text-muted">{e.sponsorship.note}</p>}
        </div>
        <Callout tone="amber" icon={<ShieldAlert className="size-4" />}>
          Visa sponsorship is <b>never guaranteed</b>, even when a listing mentions it. This assessment is advisory — always confirm with
          the employer and check official gov.uk guidance.
        </Callout>
      </div>
    </Card>
  );
}

function MatchCard({ match, score }: { match: MatchResult | null; score: number | null }) {
  if (!match) {
    return (
      <Card title="Match">
        <p className="text-sm text-muted">{score != null ? `Score ${Math.round(score)}` : 'Not matched yet.'}</p>
      </Card>
    );
  }
  const recTone = match.recommendation === 'APPLY' ? 'green' : match.recommendation === 'CONSIDER' ? 'amber' : 'red';
  return (
    <Card
      title="Match"
      actions={
        <div className="flex items-center gap-2">
          <Badge tone={recTone}>{humanize(match.recommendation)}</Badge>
          <MatchPill score={match.score} />
        </div>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-semibold tabular-nums">{Math.round(match.score)}</span>
              <span className="text-xs text-subtle">/ 100</span>
            </div>
            <ScoreBar value={match.score} className="mt-2 h-2" />
          </div>
          <div className="space-y-2.5">
            {Object.entries(match.breakdown ?? {}).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">{humanize(k.replace(/([a-z])([A-Z])/g, '$1_$2'))}</span>
                  <span className="tabular-nums text-fg">{Math.round((v <= 1 ? v * 100 : v))}%</span>
                </div>
                <ScoreBar value={v <= 1 ? v * 100 : v} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <div className="label">Matched skills</div>
            <Chips items={match.requiredSkillsMatched} tone="green" empty="None" />
          </div>
          <div>
            <div className="label">Missing skills</div>
            <Chips items={match.requiredSkillsMissing} tone="red" empty="None" />
          </div>
          {match.relevantExperience?.length > 0 && (
            <div>
              <div className="label">Relevant experience</div>
              <ul className="list-disc space-y-0.5 pl-5 text-muted">
                {match.relevantExperience.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {match.concerns?.length > 0 && (
            <div>
              <div className="label">Concerns</div>
              <ul className="space-y-1 text-muted">
                {match.concerns.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DocumentsCard({ docs }: { docs: DocumentItem[] }) {
  const [shown, setShown] = useState<string | null>(null);
  return (
    <Card title="Documents" subtitle="Immutable, versioned files generated for this application" bodyClassName="p-0">
      {docs.length === 0 ? (
        <EmptyState title="No documents generated yet" />
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="space-y-3 px-4 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-surface-2 p-2 text-muted">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fg">{d.fileName}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-subtle">
                      <span>{humanize(d.kind)}</span>
                      <span>· {fmtBytes(d.sizeBytes)}</span>
                      <span>· {fmtDateTime(d.createdAt)}</span>
                      <span>
                        · {d.generator}
                        {d.promptVersion ? ` (${d.promptVersion})` : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-subtle" title={d.sha256}>
                      sha256 {d.sha256?.slice(0, 16)}…
                    </div>
                  </div>
                </div>
                <a href={api.documentUrl(d.id)} className={buttonClass('secondary', 'sm')}>
                  <Download className="size-3.5" /> Download
                </a>
              </div>
              {(d.kind === 'CV' || d.validation) && <ValidationReportView v={d.validation} />}
              {d.content != null && (
                <div>
                  <button className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg" onClick={() => setShown(shown === d.id ? null : d.id)}>
                    <ChevronDown className={cx('size-3.5 transition', shown === d.id && 'rotate-180')} />
                    {shown === d.id ? 'Hide' : 'Show'} structured content & evidence
                  </button>
                  {shown === d.id && (
                    <div className="mt-2">
                      <CvContent content={d.content} />
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function sourceTone(s: string) {
  return s === 'LIBRARY' ? 'green' : s === 'CANDIDATE_DATA' ? 'blue' : s === 'AI' ? 'violet' : 'amber';
}

function AnswersCard({ sets }: { sets: AnswerSet[] }) {
  const sorted = [...sets].sort((a, b) => b.version - a.version);
  const [version, setVersion] = useState<number | null>(null);
  const current = sorted.find((s) => s.version === version) ?? sorted[0];
  return (
    <Card
      title="Application answers"
      actions={
        sorted.length > 1 ? (
          <Select className="h-8 w-auto py-1 text-xs" value={current?.version} onChange={(e) => setVersion(Number(e.target.value))}>
            {sorted.map((s) => (
              <option key={s.id} value={s.version}>
                Version {s.version} · {fmtDate(s.createdAt)}
              </option>
            ))}
          </Select>
        ) : current ? (
          <span className="text-xs text-subtle">Version {current.version}</span>
        ) : null
      }
      bodyClassName="p-0"
    >
      {!current || current.answers.length === 0 ? (
        <EmptyState title="No answers prepared yet" />
      ) : (
        <Table
          rows={current.answers}
          rowKey={(a) => a.key}
          rowClassName={(a) => (a.answer === 'UNKNOWN' ? 'bg-amber-500/5' : undefined)}
          columns={[
            {
              key: 'q',
              header: 'Question',
              cell: (a) => (
                <div className="min-w-[12rem]">
                  <div className="text-fg">{a.question}</div>
                  <div className="font-mono text-[10px] text-subtle">{a.key}</div>
                </div>
              ),
            },
            {
              key: 'a',
              header: 'Answer',
              cell: (a) =>
                a.answer === 'UNKNOWN' ? <Badge tone="amber">UNKNOWN</Badge> : <div className="min-w-[12rem] whitespace-pre-wrap text-muted">{a.answer}</div>,
            },
            { key: 's', header: 'Source', cell: (a) => <Badge tone={sourceTone(a.source)}>{humanize(a.source)}</Badge> },
            {
              key: 'e',
              header: 'Evidence',
              cell: (a) => (a.evidenceIds?.length ? <span className="font-mono text-[11px] text-subtle">{a.evidenceIds.join(', ')}</span> : <span className="text-subtle">—</span>),
            },
          ]}
        />
      )}
    </Card>
  );
}

function BrowserTasksCard({ tasks }: { tasks: BrowserTask[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card title="Browser tasks" bodyClassName="p-0">
      {tasks.length === 0 ? (
        <EmptyState title="No browser tasks yet" />
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <Bot className="size-4 shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-fg">{t.agentType}</span>
                    <Badge tone={t.status === 'COMPLETED' ? 'green' : t.status === 'CLAIMED' ? 'blue' : t.status === 'PENDING' ? 'violet' : 'grey'}>
                      {humanize(t.status)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-subtle">
                    Created {fmtDateTime(t.createdAt)}
                    {t.claimedAt && ` · claimed ${fmtRelative(t.claimedAt)}`}
                    {t.completedAt && ` · completed ${fmtRelative(t.completedAt)}`}
                    {t.leaseExpiresAt && !t.completedAt && ` · lease until ${fmtDateTime(t.leaseExpiresAt)}`}
                  </div>
                </div>
                <ChevronDown className={cx('size-4 text-subtle transition', open === t.id && 'rotate-180')} />
              </button>
              {open === t.id && (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="label">Result</div>
                    <JsonBlock value={t.result ?? null} />
                  </div>
                  <div>
                    <div className="label">Payload</div>
                    <JsonBlock value={t.payload} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AuditTimeline({ items }: { items: AuditLog[] }) {
  const sorted = [...items].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  if (sorted.length === 0) return <EmptyState title="No audit events" />;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {sorted.map((a) => (
        <li key={a.id} className="relative">
          <span
            className={cx(
              'absolute -left-[1.4rem] top-1.5 size-2 rounded-full ring-4 ring-surface',
              /FAIL|ERROR/.test(a.type) ? 'bg-red-500' : /HUMAN|BLOCK/.test(a.type) ? 'bg-amber-500' : /SUBMIT/.test(a.type) ? 'bg-emerald-500' : 'bg-line-strong',
            )}
          />
          <div className="text-sm text-fg">{a.message}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-subtle">
            <span className="font-mono">{a.type}</span>
            <span>· {a.actor}</span>
            <span title={fmtDateTime(a.at)}>· {fmtRelative(a.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function JobDetailsCard({ job }: { job: Job }) {
  const [expanded, setExpanded] = useState(false);
  const long = (job.description?.length ?? 0) > 900;
  return (
    <Card title="Job details">
      <div className="space-y-5">
        <KeyValue
          items={[
            ['Location', [job.location, job.remoteType && job.remoteType !== 'UNKNOWN' ? humanize(job.remoteType) : null].filter(Boolean).join(' · ') || '—'],
            ['Employment', humanize(job.employmentType)],
            ['Salary', job.salaryText ?? (job.salaryMin ? `${job.currency ?? ''} ${job.salaryMin}${job.salaryMax ? `–${job.salaryMax}` : ''} ${job.salaryPeriod ?? ''}` : '—')],
            ['Hours', job.hoursText ?? (job.hoursPerWeek ? `${job.hoursPerWeek} h/week` : '—')],
            ['Posted', fmtDate(job.postedAt)],
            ['Closing date', fmtDate(job.closingDate)],
            ['Discovered', fmtDateTime(job.discoveredAt)],
            ['Application method', job.applicationMethod ? humanize(job.applicationMethod) : '—'],
            ['Source', `${job.source}${job.sourceJobId ? ` · ${job.sourceJobId}` : ''}`],
          ]}
        />
        {job.requirements?.length > 0 && (
          <div>
            <div className="label">Requirements</div>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
              {job.requirements.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {job.preferredRequirements?.length > 0 && (
          <div>
            <div className="label">Nice to have</div>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
              {job.preferredRequirements.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {job.description && (
          <div>
            <div className="label">Description</div>
            <div className={cx('whitespace-pre-wrap text-sm leading-relaxed text-muted', !expanded && long && 'max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]')}>
              {job.description}
            </div>
            {long && (
              <button className="mt-2 text-xs font-medium text-accent" onClick={() => setExpanded((e) => !e)}>
                {expanded ? 'Show less' : 'Show full description'}
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function SkipModal({ open, onClose, onSkip, busy }: { open: boolean; onClose: () => void; onSkip: (reason?: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Skip this application"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onSkip(reason.trim() || undefined)}>
            Skip
          </Button>
        </>
      }
    >
      <Field label="Reason (optional)">
        <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not interested in this company" />
      </Field>
    </Modal>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

// ───────────── Page ─────────────

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const [skipOpen, setSkipOpen] = useState(false);
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['application', id],
    queryFn: () => api.application(id),
    refetchInterval: (query) => {
      const s = query.state.data?.application.status;
      return s && ['SUBMITTED', 'SKIPPED', 'FAILED', 'EXPIRED', 'DUPLICATE', 'REJECTED_BY_RULE', 'NEEDS_HUMAN', 'BLOCKED'].includes(s) ? false : 5000;
    },
  });
  const invalidate = [['application', id], ['applications'], ['overview']];
  const retry = useAction(() => api.retryApplication(id), { invalidate, success: 'Application requeued' });
  const skip = useAction((reason?: string) => api.skipApplication(id, reason), {
    invalidate,
    success: 'Application skipped',
    onSuccess: () => setSkipOpen(false),
  });
  const outcome = useAction((o: Outcome) => api.setOutcome(id, o), { invalidate, success: 'Outcome saved' });
  const reanalyse = useAction((jobId: string) => api.reanalyseJob(jobId), { invalidate, success: 'Job re-analysed' });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  const a = d.application;
  const job = d.job;
  const exceptional = a.status === 'NEEDS_HUMAN' || a.status === 'BLOCKED' || a.status === 'FAILED';

  return (
    <>
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/history'))}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
            <span className="font-mono">{a.ref}</span>
            {a.track && <Badge tone="slate">{TRACK_LABELS[a.track]}</Badge>}
            {job.category && <Badge tone="slate">{CATEGORY_LABELS[job.category]}</Badge>}
            {a.cvProfile && <Badge tone="slate">CV: {a.cvProfile.name}</Badge>}
            {a.browserAgent && <Badge tone="slate">Agent: {a.browserAgent}</Badge>}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">{job.title}</h1>
          <div className="mt-1 text-sm text-muted">
            {job.company}
            {job.location ? ` · ${job.location}` : ''} · via {job.source}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            {a.simulated && <SimulatedBadge />}
            <OutcomeBadge value={a.outcome} />
            <MatchPill score={job.matchScore} />
            <EligibilityBadge value={job.eligibility} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={job.url} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary')}>
            <ExternalLink className="size-4" /> Job posting
          </a>
          <Button icon={<RefreshCw className="size-4" />} loading={reanalyse.isPending} onClick={() => reanalyse.mutate(job.id)}>
            Re-analyse
          </Button>
          <Button icon={<RotateCcw className="size-4" />} loading={retry.isPending} onClick={() => retry.mutate(undefined)} disabled={a.status === 'SUBMITTED'}>
            Retry
          </Button>
          <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => setSkipOpen(true)} disabled={a.status === 'SKIPPED' || a.status === 'SUBMITTED'}>
            Skip
          </Button>
        </div>
      </div>

      {exceptional && (
        <Callout tone={a.status === 'FAILED' ? 'red' : 'amber'} className="mb-6" icon={<AlertTriangle className="size-4" />}>
          <div className="font-medium">
            {a.exceptionType ? EXCEPTION_LABELS[a.exceptionType] : a.status === 'FAILED' ? 'Application failed' : 'Needs your attention'}
          </div>
          <div className="mt-0.5">{a.humanInterventionReason ?? a.failureReason ?? 'No reason recorded.'}</div>
          {a.status !== 'FAILED' && (
            <Link to="/exceptions" className="mt-1 inline-block text-xs font-medium underline underline-offset-2">
              Resolve from the Exceptions page →
            </Link>
          )}
        </Callout>
      )}

      <Card className="mb-6">
        <StatusTimeline d={d} />
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-subtle">Current step</div>
            <div className="text-fg">{a.currentStep ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-subtle">Last action</div>
            <div className="text-fg">{a.lastAction ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-subtle">Updated</div>
            <div className="text-fg">{fmtDateTime(a.updatedAt)}</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Section>
          <MatchCard match={job.match} score={job.matchScore} />
          <DocumentsCard docs={d.documents} />
          <AnswersCard sets={d.answerSets} />
          <BrowserTasksCard tasks={d.browserTasks} />
          <JobDetailsCard job={job} />
        </Section>
        <Section>
          <Card title="Outcome" subtitle="Track what happened after submission">
            <div className="space-y-3">
              <Select value={a.outcome} disabled={outcome.isPending} onChange={(e) => outcome.mutate(e.target.value as Outcome)}>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABELS[o]}
                  </option>
                ))}
              </Select>
              {a.submittedAt && <p className="text-xs text-muted">Submitted {fmtDateTime(a.submittedAt)}</p>}
            </div>
          </Card>
          {a.submissionEvidence && (
            <Card title="Submission evidence" actions={a.simulated ? <SimulatedBadge /> : undefined}>
              <KeyValue
                items={[
                  ['Type', a.submissionEvidence.type ? humanize(a.submissionEvidence.type) : '—'],
                  ['Confirmation #', a.submissionEvidence.confirmationNumber ?? '—'],
                  ['Message', a.submissionEvidence.message ?? '—'],
                  [
                    'URL',
                    a.submissionEvidence.url ? (
                      <a className="text-accent underline underline-offset-2" href={a.submissionEvidence.url} target="_blank" rel="noopener noreferrer">
                        Open
                      </a>
                    ) : (
                      '—'
                    ),
                  ],
                  [
                    'Screenshot',
                    a.submissionEvidence.screenshotDocId ? (
                      <a className="text-accent underline underline-offset-2" href={api.documentUrl(a.submissionEvidence.screenshotDocId)}>
                        Download
                      </a>
                    ) : (
                      '—'
                    ),
                  ],
                ]}
              />
            </Card>
          )}
          <ClassificationCard job={job} />
          <EligibilityCard job={job} />
          {a.browserState && Object.keys(a.browserState).length > 0 && (
            <Card title="Browser state" subtitle="Last step reached and fields filled">
              <JsonBlock value={a.browserState} />
            </Card>
          )}
          {a.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm text-muted">{a.notes}</p>
            </Card>
          )}
          <Card title="Audit trail">
            <div className="max-h-[32rem] overflow-y-auto pr-1">
              <AuditTimeline items={d.audit} />
            </div>
          </Card>
        </Section>
      </div>

      <SkipModal open={skipOpen} onClose={() => setSkipOpen(false)} busy={skip.isPending} onSkip={(r) => skip.mutate(r)} />
    </>
  );
}
