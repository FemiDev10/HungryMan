import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { AnswerTemplate, Track } from '../api/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { Modal } from '../components/Modal';
import { Table } from '../components/Table';
import { TagInput } from '../components/TagInput';
import { Badge, Button, Callout, Card, EmptyState, ErrorBox, Field, LoadingBlock, PageHeader, Select, Toggle, cx } from '../components/ui';
import { useAction, useCandidate } from '../lib/hooks';
import { ANSWER_CATEGORIES, humanize, TRACK_LABELS } from '../lib/labels';

type Draft = Omit<AnswerTemplate, 'id' | 'updatedAt'> & { id?: string };
const EMPTY: Draft = { key: '', category: 'WORK_AUTHORISATION', question: '', patterns: [], answer: 'UNKNOWN', track: null, evidenceIds: [], verified: false };

type Filter = 'all' | 'unknown' | 'unverified';

export function AnswersPage() {
  const q = useQuery({ queryKey: ['answers'], queryFn: api.answers });
  const candidate = useCandidate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const inv = [['answers']];
  const create = useAction((d: Omit<Draft, 'id'>) => api.createAnswer(d), { invalidate: inv, success: 'Answer added', onSuccess: () => setDraft(null) });
  const update = useAction(({ id, body }: { id: string; body: Omit<Draft, 'id'> }) => api.updateAnswer(id, body), {
    invalidate: inv,
    success: 'Answer saved',
    onSuccess: () => setDraft(null),
  });
  const remove = useAction((id: string) => api.deleteAnswer(id), { invalidate: inv, success: 'Answer deleted' });

  const items = q.data ?? [];
  const unknownCount = items.filter((a) => a.answer.trim() === 'UNKNOWN').length;
  const unverifiedCount = items.filter((a) => !a.verified).length;
  const categories = Array.from(new Set([...ANSWER_CATEGORIES, ...items.map((a) => a.category)]));
  const evidenceIds = (candidate.data?.evidence ?? []).map((e) => ({ value: e.id, label: e.claim.slice(0, 80) }));

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((a) => (filter === 'unknown' ? a.answer.trim() === 'UNKNOWN' : filter === 'unverified' ? !a.verified : true))
      .filter((a) => !category || a.category === category)
      .filter((a) => !s || [a.key, a.question, a.answer, ...a.patterns].join(' ').toLowerCase().includes(s))
      .sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
  }, [items, filter, category, search]);

  const save = () => {
    if (!draft) return;
    const { id, ...rest } = draft;
    const body = { ...rest, answer: rest.answer.trim() || 'UNKNOWN', key: rest.key.trim() };
    if (id) update.mutate({ id, body });
    else create.mutate(body);
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <PageHeader
        title="Answer library"
        description="Verified answers the agent reuses on application forms. Anything unknown stays “UNKNOWN” — the agent never guesses."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ ...EMPTY })}>
            New answer
          </Button>
        }
      />

      {(unknownCount > 0 || unverifiedCount > 0) && (
        <Callout tone="amber" className="mb-4" icon={<AlertTriangle className="size-4" />}>
          {unknownCount > 0 && (
            <>
              <button className="font-medium underline underline-offset-2" onClick={() => setFilter('unknown')}>
                {unknownCount} unknown
              </button>{' '}
              answer{unknownCount === 1 ? '' : 's'} will force a human hand-off when asked.{' '}
            </>
          )}
          {unverifiedCount > 0 && (
            <>
              <button className="font-medium underline underline-offset-2" onClick={() => setFilter('unverified')}>
                {unverifiedCount} unverified
              </button>{' '}
              answer{unverifiedCount === 1 ? '' : 's'} should be reviewed.
            </>
          )}
        </Callout>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input className="input pl-9" placeholder="Search questions, answers, patterns…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">All answers</option>
          <option value="unknown">Unknown only</option>
          <option value="unverified">Unverified only</option>
        </Select>
      </div>

      <Card bodyClassName="p-0">
        {q.isLoading ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBox error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : (
          <Table<AnswerTemplate>
            rows={shown}
            rowKey={(a) => a.id}
            onRowClick={(a) => setDraft({ ...a })}
            empty={<EmptyState title={items.length ? 'No answers match' : 'No answers yet'} />}
            rowClassName={(a) => cx(a.answer.trim() === 'UNKNOWN' ? 'bg-amber-500/6' : !a.verified ? 'bg-sky-500/4' : undefined)}
            columns={[
              {
                key: 'q',
                header: 'Question',
                cell: (a) => (
                  <div className="min-w-[14rem] max-w-md">
                    <div className="text-fg">{a.question}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-subtle">{a.key}</div>
                  </div>
                ),
              },
              {
                key: 'a',
                header: 'Answer',
                cell: (a) =>
                  a.answer.trim() === 'UNKNOWN' ? (
                    <Badge tone="amber">UNKNOWN</Badge>
                  ) : (
                    <div className="line-clamp-3 min-w-[12rem] max-w-md whitespace-pre-wrap text-muted">{a.answer}</div>
                  ),
              },
              { key: 'c', header: 'Category', cell: (a) => <span className="whitespace-nowrap text-muted">{humanize(a.category)}</span> },
              { key: 't', header: 'Track', cell: (a) => <span className="whitespace-nowrap text-muted">{a.track ? TRACK_LABELS[a.track] : 'Both'}</span> },
              {
                key: 'v',
                header: 'Verified',
                cell: (a) =>
                  a.verified ? (
                    <Badge tone="green">
                      <BadgeCheck className="size-3" /> Verified
                    </Badge>
                  ) : (
                    <Badge tone="blue">Unverified</Badge>
                  ),
              },
              {
                key: 'x',
                header: '',
                cell: (a) => (
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setDraft({ ...a })}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      aria-label="Delete"
                      title="Delete answer?"
                      message={`“${a.question}” will be removed from the library.`}
                      confirmLabel="Delete"
                      danger
                      onConfirm={() => remove.mutateAsync(a.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </ConfirmButton>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit answer' : 'New answer'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending || update.isPending} disabled={!draft?.key.trim() || !draft?.question.trim()} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Key *" hint="Stable identifier, e.g. right_to_work_uk">
              <input className="input font-mono" value={draft.key} onChange={(e) => set('key', e.target.value.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, ''))} />
            </Field>
            <Field label="Category">
              <Select value={draft.category} onChange={(e) => set('category', e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Question *" className="sm:col-span-2">
              <input className="input" value={draft.question} onChange={(e) => set('question', e.target.value)} />
            </Field>
            <Field
              label="Answer"
              className="sm:col-span-2"
              hint={
                <>
                  Use exactly <span className="kbd">UNKNOWN</span> if you don't know yet — the agent will hand off to you instead of guessing.
                </>
              }
            >
              <textarea
                className={cx('input min-h-28', draft.answer.trim() === 'UNKNOWN' && 'border-amber-500/60')}
                value={draft.answer}
                onChange={(e) => set('answer', e.target.value)}
              />
              <button type="button" className="mt-1 text-xs text-muted underline underline-offset-2 hover:text-fg" onClick={() => set('answer', 'UNKNOWN')}>
                Set to UNKNOWN
              </button>
            </Field>
            <Field label="Match patterns" className="sm:col-span-2" hint="Lowercase phrases used to recognise this question on forms.">
              <TagInput value={draft.patterns} onChange={(v) => set('patterns', v.map((p) => p.toLowerCase()))} placeholder="right to work, eligible to work in the uk…" />
            </Field>
            <Field label="Track">
              <Select value={draft.track ?? ''} onChange={(e) => set('track', (e.target.value || null) as Track | null)}>
                <option value="">Both tracks</option>
                <option value="PROFESSIONAL">{TRACK_LABELS.PROFESSIONAL}</option>
                <option value="GENERAL">{TRACK_LABELS.GENERAL}</option>
              </Select>
            </Field>
            <div className="sm:pt-5">
              <Toggle checked={draft.verified} onChange={(v) => set('verified', v)} label="Verified" description="I've checked this answer is true and current." />
            </div>
            <Field label="Evidence ids" className="sm:col-span-2" hint="Evidence items that back this answer.">
              <TagInput value={draft.evidenceIds} onChange={(v) => set('evidenceIds', v)} suggestions={evidenceIds} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
