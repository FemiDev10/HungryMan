import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Filter, Search, X } from 'lucide-react';
import { api } from '../api/client';
import type { ApplicationFilters } from '../api/types';
import { ApplicationsTable } from '../components/ApplicationsTable';
import { Pagination } from '../components/Pagination';
import { Button, Card, ErrorBox, Field, LoadingBlock, PageHeader, Select } from '../components/ui';
import { CATEGORIES, CATEGORY_LABELS, STATUSES, STATUS_LABELS, TRACK_LABELS } from '../lib/labels';

const FILTER_KEYS = ['q', 'from', 'to', 'company', 'role', 'category', 'status', 'source', 'cvProfile', 'track'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((k) => k !== 'q' && params.get(k)));
  const page = Number(params.get('page') ?? '1') || 1;
  const pageSize = 25;

  const filters: ApplicationFilters = { view: 'history', page, pageSize };
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) (filters as Record<string, unknown>)[k] = v;
  }

  // Debounced text inputs
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    q: params.get('q') ?? '',
    company: params.get('company') ?? '',
    role: params.get('role') ?? '',
  }));

  const setFilter = (k: FilterKey, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      let changed = false;
      for (const k of ['q', 'company', 'role'] as const) {
        const v = (draft[k] ?? '').trim();
        if ((params.get(k) ?? '') !== v) {
          changed = true;
          if (v) next.set(k, v);
          else next.delete(k);
        }
      }
      if (changed) {
        next.delete('page');
        setParams(next, { replace: true });
      }
    }, 350);
    return () => clearTimeout(t);
    // Only re-run when the typed text changes; `params` is read fresh inside.
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useQuery({
    queryKey: ['applications', 'history', filters],
    queryFn: () => api.applications(filters),
    placeholderData: (prev) => prev,
  });
  const cvProfiles = useQuery({ queryKey: ['cv-profiles'], queryFn: api.cvProfiles });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources });

  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length;

  return (
    <>
      <PageHeader title="History" description="Every job the agent has seen, and what happened to it." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            className="input pl-9"
            placeholder="Search title, company, reference…"
            value={draft.q ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          />
        </div>
        <Button variant={showFilters ? 'subtle' : 'secondary'} icon={<Filter className="size-4" />} onClick={() => setShowFilters((s) => !s)}>
          Filters{activeCount ? ` (${activeCount})` : ''}
        </Button>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            icon={<X className="size-4" />}
            onClick={() => {
              setDraft({ q: '', company: '', role: '' });
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="From">
              <input type="date" className="input" value={params.get('from') ?? ''} onChange={(e) => setFilter('from', e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className="input" value={params.get('to') ?? ''} onChange={(e) => setFilter('to', e.target.value)} />
            </Field>
            <Field label="Company">
              <input className="input" value={draft.company ?? ''} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))} placeholder="Any" />
            </Field>
            <Field label="Role">
              <input className="input" value={draft.role ?? ''} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} placeholder="Any" />
            </Field>
            <Field label="Category">
              <Select value={params.get('category') ?? ''} onChange={(e) => setFilter('category', e.target.value)}>
                <option value="">Any category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={params.get('status') ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source">
              <Select value={params.get('source') ?? ''} onChange={(e) => setFilter('source', e.target.value)}>
                <option value="">Any source</option>
                {(sources.data ?? []).map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.label || s.source}
                  </option>
                ))}
                <option value="manual">Manual import</option>
              </Select>
            </Field>
            <Field label="CV profile">
              <Select value={params.get('cvProfile') ?? ''} onChange={(e) => setFilter('cvProfile', e.target.value)}>
                <option value="">Any CV profile</option>
                {(cvProfiles.data ?? []).map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Track">
              <Select value={params.get('track') ?? ''} onChange={(e) => setFilter('track', e.target.value)}>
                <option value="">Both tracks</option>
                <option value="PROFESSIONAL">{TRACK_LABELS.PROFESSIONAL}</option>
                <option value="GENERAL">{TRACK_LABELS.GENERAL}</option>
              </Select>
            </Field>
          </div>
        </Card>
      )}

      <Card bodyClassName="p-0">
        {q.isLoading ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBox error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : (
          <ApplicationsTable rows={q.data?.items ?? []} emptyTitle="No applications match these filters" />
        )}
      </Card>
      {q.data && (
        <Pagination
          page={q.data.page ?? page}
          pageSize={q.data.pageSize ?? pageSize}
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
