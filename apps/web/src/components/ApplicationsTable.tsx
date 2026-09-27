import { Link, useNavigate } from 'react-router';
import { FileText } from 'lucide-react';
import type { ApplicationRow } from '../api/types';
import { CATEGORY_LABELS } from '../lib/labels';
import { fmtRelative, fmtDateTime } from '../lib/format';
import { EligibilityBadge, OutcomeBadge, StatusBadge } from './StatusBadge';
import { Table, type Column } from './Table';
import { Badge, EmptyState, MatchPill, SimulatedBadge } from './ui';

function JobCell({ r }: { r: ApplicationRow }) {
  return (
    <div className="min-w-[12rem] max-w-[22rem]">
      <Link to={`/applications/${r.id}`} className="font-medium text-fg hover:underline" onClick={(e) => e.stopPropagation()}>
        {r.job.title}
      </Link>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
        <span className="font-mono">{r.ref}</span>
        <span>·</span>
        <span>{r.job.source}</span>
        {r.job.location && (
          <>
            <span>·</span>
            <span className="truncate">{r.job.location}</span>
          </>
        )}
        {r.simulated && <SimulatedBadge />}
        <OutcomeBadge value={r.outcome} />
      </div>
    </div>
  );
}

export function ApplicationsTable({ rows, emptyTitle = 'Nothing here yet', emptyHint }: { rows: ApplicationRow[]; emptyTitle?: string; emptyHint?: string }) {
  const navigate = useNavigate();
  const columns: Column<ApplicationRow>[] = [
    { key: 'job', header: 'Job', cell: (r) => <JobCell r={r} /> },
    { key: 'company', header: 'Company', cell: (r) => <span className="whitespace-nowrap text-fg">{r.job.company}</span> },
    {
      key: 'category',
      header: 'Category',
      cell: (r) => <span className="whitespace-nowrap text-muted">{r.job.category ? CATEGORY_LABELS[r.job.category] : '—'}</span>,
    },
    { key: 'match', header: 'Match', cell: (r) => <MatchPill score={r.job.matchScore} /> },
    { key: 'elig', header: 'Eligibility', cell: (r) => <EligibilityBadge value={r.job.eligibility} /> },
    {
      key: 'cv',
      header: 'CV',
      cell: (r) =>
        r.cvProfile ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted" title={r.cvFileName ?? undefined}>
            <FileText className="size-3.5" /> {r.cvProfile.name}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'last',
      header: 'Last action',
      cell: (r) => (
        <div className="min-w-[10rem] max-w-[18rem]">
          <div className="line-clamp-2 text-muted">{r.lastAction ?? r.currentStep ?? '—'}</div>
          <div className="mt-0.5 text-xs text-subtle" title={fmtDateTime(r.updatedAt)}>
            {fmtRelative(r.updatedAt)}
          </div>
        </div>
      ),
    },
  ];

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>;
  }

  return (
    <>
      <div className="hidden md:block">
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/applications/${r.id}`)} />
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/applications/${r.id}`} className="block px-4 py-3 active:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-fg">{r.job.title}</div>
                  <div className="truncate text-sm text-muted">{r.job.company}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {r.job.category && <Badge tone="slate">{CATEGORY_LABELS[r.job.category]}</Badge>}
                <MatchPill score={r.job.matchScore} />
                <EligibilityBadge value={r.job.eligibility} />
                {r.simulated && <SimulatedBadge />}
                <OutcomeBadge value={r.outcome} />
              </div>
              <div className="mt-1.5 line-clamp-1 text-xs text-subtle">
                {r.lastAction ?? r.currentStep ?? '—'} · {fmtRelative(r.updatedAt)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
