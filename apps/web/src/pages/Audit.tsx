import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import type { AuditLog } from '../api/types';
import { Pagination } from '../components/Pagination';
import { Card, EmptyState, ErrorBox, JsonBlock, LoadingBlock, PageHeader, cx } from '../components/ui';
import { fmtDateTime, fmtRelative } from '../lib/format';

const COMMON_TYPES = [
  'JOB_DISCOVERED',
  'JOB_CLASSIFIED',
  'ELIGIBILITY_CHECKED',
  'JOB_MATCHED',
  'APPLICATION_QUEUED',
  'CV_GENERATED',
  'CV_VALIDATED',
  'ANSWERS_GENERATED',
  'BROWSER_TASK_CREATED',
  'BROWSER_TASK_CLAIMED',
  'APPLICATION_SUBMITTED',
  'HUMAN_REQUIRED',
  'APPLICATION_FAILED',
  'AGENT_CONTROL',
  'SETTINGS_UPDATED',
];

function tone(type: string) {
  if (/FAIL|ERROR/.test(type)) return 'bg-red-500';
  if (/HUMAN|BLOCK/.test(type)) return 'bg-amber-500';
  if (/SUBMIT/.test(type)) return 'bg-emerald-500';
  return 'bg-line-strong';
}

function Row({ a }: { a: AuditLog }) {
  const [open, setOpen] = useState(false);
  const hasData = a.data != null && !(typeof a.data === 'object' && Object.keys(a.data as object).length === 0);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', tone(a.type))} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-fg">{a.message}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-subtle">
            <span className="font-mono">{a.type}</span>
            <span>· {a.actor}</span>
            <span title={fmtDateTime(a.at)}>· {fmtDateTime(a.at)} ({fmtRelative(a.at)})</span>
            {a.applicationId && (
              <Link to={`/applications/${a.applicationId}`} className="text-accent hover:underline">
                · application
              </Link>
            )}
          </div>
        </div>
        {hasData && (
          <button className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-fg" onClick={() => setOpen((o) => !o)} aria-label="Toggle data">
            <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {open && hasData && (
        <div className="mt-2 pl-5">
          <JsonBlock value={a.data} />
        </div>
      )}
    </li>
  );
}

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const type = params.get('type') ?? '';
  const applicationId = params.get('applicationId') ?? '';
  const pageSize = 50;
  const [typeDraft, setTypeDraft] = useState(type);

  useEffect(() => {
    const t = setTimeout(() => {
      const v = typeDraft.trim().toUpperCase();
      if (v === type) return;
      const next = new URLSearchParams(params);
      if (v) next.set('type', v);
      else next.delete('type');
      next.delete('page');
      setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [typeDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useQuery({
    queryKey: ['audit', { page, type, applicationId }],
    queryFn: () => api.audit({ page, pageSize, type: type || undefined, applicationId: applicationId || undefined }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader title="Audit log" description="An immutable record of everything the agent and you have done." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs font-mono text-xs"
          list="audit-types"
          placeholder="Filter by type, e.g. CV_GENERATED"
          value={typeDraft}
          onChange={(e) => setTypeDraft(e.target.value)}
        />
        <datalist id="audit-types">
          {Array.from(new Set([...COMMON_TYPES, ...(q.data?.items.map((i) => i.type) ?? [])])).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {applicationId && (
          <button
            className="text-xs text-muted underline underline-offset-2 hover:text-fg"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('applicationId');
              setParams(next);
            }}
          >
            Clear application filter
          </button>
        )}
      </div>
      <Card bodyClassName="p-0">
        {q.isLoading ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBox error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : (q.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="No audit events" />
        ) : (
          <ul className="divide-y divide-line">
            {q.data!.items.map((a) => (
              <Row key={a.id} a={a} />
            ))}
          </ul>
        )}
      </Card>
      {q.data && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={q.data.total}
          onPage={(p) => {
            const next = new URLSearchParams(params);
            next.set('page', String(p));
            setParams(next);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
    </>
  );
}
