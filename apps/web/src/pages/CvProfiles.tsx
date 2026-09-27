import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { CvPreview, CvProfile, Track } from '../api/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { CvContent } from '../components/CvContent';
import { Modal } from '../components/Modal';
import { MultiSelect } from '../components/MultiSelect';
import { TagInput } from '../components/TagInput';
import { ValidationReportView } from '../components/ValidationReport';
import { Badge, Button, Callout, Card, Chips, EmptyState, ErrorBox, Field, LoadingBlock, PageHeader, Select, Toggle } from '../components/ui';
import { useAction } from '../lib/hooks';
import { CATEGORIES, CATEGORY_LABELS, TRACK_LABELS } from '../lib/labels';

type Draft = Omit<CvProfile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const EMPTY: Draft = {
  slug: '',
  name: '',
  track: 'PROFESSIONAL',
  categories: [],
  targetJobTitles: [],
  targetKeywords: [],
  preferredSkills: [],
  preferredExperience: [],
  excludedExperience: [],
  summaryTemplate: '',
  skillOrdering: [],
  experienceOrdering: 'RELEVANCE',
  projectSelectionRules: { maxProjects: 3, requireShipped: false, requiredTags: [] },
  maximumPages: 2,
  template: 'classic',
  includeCoverLetter: 'WHEN_REQUIRED',
  active: true,
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toDraft(p: CvProfile): Draft {
  return {
    ...EMPTY,
    ...p,
    projectSelectionRules: { maxProjects: null, requireShipped: false, requiredTags: [], ...(p.projectSelectionRules ?? {}) },
  };
}

function ProfileEditor({ draft, setDraft }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const rules = draft.projectSelectionRules ?? {};
  const setRule = (patch: Partial<Draft['projectSelectionRules']>) => set('projectSelectionRules', { ...rules, ...patch });
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *">
          <input
            className="input"
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => ({ ...d, name, slug: !d.id && (d.slug === '' || d.slug === slugify(d.name)) ? slugify(name) : d.slug }));
            }}
            placeholder="Product Designer"
          />
        </Field>
        <Field label="Slug *" hint="Used in generated file names.">
          <input className="input font-mono" value={draft.slug} onChange={(e) => set('slug', slugify(e.target.value))} />
        </Field>
        <Field label="Track">
          <Select value={draft.track} onChange={(e) => set('track', e.target.value as Track)}>
            <option value="PROFESSIONAL">{TRACK_LABELS.PROFESSIONAL}</option>
            <option value="GENERAL">{TRACK_LABELS.GENERAL}</option>
          </Select>
        </Field>
        <div className="sm:pt-5">
          <Toggle checked={draft.active} onChange={(v) => set('active', v)} label="Active" description="Inactive profiles are never selected." />
        </div>
        <Field label="Job categories served *" className="sm:col-span-2" hint="At least one.">
          <MultiSelect options={CATEGORIES} labels={CATEGORY_LABELS} value={draft.categories} onChange={(v) => set('categories', v)} />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle sm:col-span-2">Targeting</h3>
        <Field label="Target job titles" className="sm:col-span-2">
          <TagInput value={draft.targetJobTitles} onChange={(v) => set('targetJobTitles', v)} />
        </Field>
        <Field label="Target keywords" className="sm:col-span-2">
          <TagInput value={draft.targetKeywords} onChange={(v) => set('targetKeywords', v)} />
        </Field>
        <Field label="Preferred skills" className="sm:col-span-2">
          <TagInput value={draft.preferredSkills} onChange={(v) => set('preferredSkills', v)} />
        </Field>
        <Field label="Skill ordering" className="sm:col-span-2" hint="Skills listed first appear first on the CV.">
          <TagInput value={draft.skillOrdering} onChange={(v) => set('skillOrdering', v)} />
        </Field>
        <Field label="Preferred experience tags">
          <TagInput value={draft.preferredExperience} onChange={(v) => set('preferredExperience', v)} />
        </Field>
        <Field label="Excluded experience tags">
          <TagInput value={draft.excludedExperience} onChange={(v) => set('excludedExperience', v)} />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle sm:col-span-2">Content</h3>
        <Field
          label="Summary template *"
          className="sm:col-span-2"
          hint="May only reference {placeholders} that are filled from evidence — never free-standing claims."
        >
          <textarea className="input min-h-28 font-mono text-xs" value={draft.summaryTemplate} onChange={(e) => set('summaryTemplate', e.target.value)} />
        </Field>
        <Field label="Experience ordering">
          <Select value={draft.experienceOrdering} onChange={(e) => set('experienceOrdering', e.target.value as Draft['experienceOrdering'])}>
            <option value="RELEVANCE">By relevance</option>
            <option value="CHRONOLOGICAL">Chronological</option>
          </Select>
        </Field>
        <Field label="Maximum pages">
          <input className="input" type="number" min={1} max={3} value={draft.maximumPages} onChange={(e) => set('maximumPages', Math.min(3, Number(e.target.value) || 1))} />
        </Field>
        <Field label="Template">
          <Select value={draft.template} onChange={(e) => set('template', e.target.value as Draft['template'])}>
            <option value="classic">Classic</option>
            <option value="compact">Compact</option>
          </Select>
        </Field>
        <Field label="Cover letter">
          <Select value={draft.includeCoverLetter} onChange={(e) => set('includeCoverLetter', e.target.value as Draft['includeCoverLetter'])}>
            <option value="ALWAYS">Always</option>
            <option value="WHEN_REQUIRED">Only when required</option>
            <option value="NEVER">Never</option>
          </Select>
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle sm:col-span-2">Project selection</h3>
        <Field label="Max projects">
          <input
            className="input"
            type="number"
            min={0}
            max={10}
            value={rules.maxProjects ?? ''}
            onChange={(e) => setRule({ maxProjects: e.target.value === '' ? null : Math.min(10, Number(e.target.value)) })}
          />
        </Field>
        <div className="sm:pt-5">
          <Toggle checked={!!rules.requireShipped} onChange={(v) => setRule({ requireShipped: v })} label="Only shipped projects" />
        </div>
        <Field label="Required project tags" className="sm:col-span-2">
          <TagInput value={rules.requiredTags ?? []} onChange={(v) => setRule({ requiredTags: v })} />
        </Field>
      </section>
    </div>
  );
}

function PreviewModal({ profile, onClose }: { profile: CvProfile | null; onClose: () => void }) {
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<CvPreview | null>(null);
  const preview = useAction((args: { id: string; jobId?: string }) => api.previewCvProfile(args.id, args.jobId), {
    onSuccess: (r) => setResult(r),
  });
  const run = () => profile && preview.mutate({ id: profile.id, jobId: jobId.trim() || undefined });

  return (
    <Modal open={!!profile} onClose={onClose} title={`Preview — ${profile?.name ?? ''}`} size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Tailor to job id (optional)" className="min-w-[14rem] flex-1">
            <input className="input font-mono" value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="Leave empty for a generic preview" />
          </Field>
          <Button variant="primary" icon={<Eye className="size-4" />} loading={preview.isPending} onClick={run}>
            {result ? 'Regenerate' : 'Generate preview'}
          </Button>
        </div>
        <p className="text-xs text-subtle">Dry run — nothing is saved. Evidence ids are shown next to every claim.</p>
        {preview.error && <ErrorBox error={preview.error} />}
        {result && (
          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <CvContent content={result.content} />
            <Card title="Validation">
              <ValidationReportView v={result.validation} />
            </Card>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function CvProfilesPage() {
  const q = useQuery({ queryKey: ['cv-profiles'], queryFn: api.cvProfiles });
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [previewing, setPreviewing] = useState<CvProfile | null>(null);
  const setDraft = (fn: (d: Draft) => Draft) => setDraftState((d) => (d ? fn(d) : d));

  const inv = [['cv-profiles']];
  const create = useAction((d: Draft) => api.createCvProfile(d), { invalidate: inv, success: 'CV profile created', onSuccess: () => setDraftState(null) });
  const update = useAction(({ id, body }: { id: string; body: Omit<Draft, 'id'> }) => api.updateCvProfile(id, body), { invalidate: inv, success: 'CV profile saved', onSuccess: () => setDraftState(null) });
  const remove = useAction((id: string) => api.deleteCvProfile(id), { invalidate: inv, success: 'CV profile removed (or deactivated if in use)' });

  const save = () => {
    if (!draft) return;
    // Strip server-managed fields before sending.
    const { id, createdAt: _c, updatedAt: _u, ...rest } = draft as Draft & { createdAt?: string; updatedAt?: string };
    void _c;
    void _u;
    const r = rest.projectSelectionRules ?? {};
    const body = {
      ...rest,
      projectSelectionRules: {
        ...(r.maxProjects != null ? { maxProjects: r.maxProjects } : {}),
        requireShipped: !!r.requireShipped,
        requiredTags: r.requiredTags ?? [],
      },
    };
    if (id) update.mutate({ id, body });
    else create.mutate(body);
  };

  const groups: { track: Track; items: CvProfile[] }[] = (['PROFESSIONAL', 'GENERAL'] as Track[]).map((t) => ({
    track: t,
    items: (q.data ?? []).filter((p) => p.track === t).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
  }));

  const valid = draft && draft.name.trim() && draft.slug.trim() && draft.summaryTemplate.trim() && draft.categories.length > 0;

  return (
    <>
      <PageHeader
        title="CV profiles"
        description="Each profile tailors how your master profile is presented for a family of roles. Profiles select and order evidence — they never invent it."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraftState({ ...EMPTY })}>
            New profile
          </Button>
        }
      />

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.track}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {TRACK_LABELS[g.track]} <span className="font-normal text-subtle">{g.items.length}</span>
              </h2>
              {g.items.length === 0 ? (
                <Card>
                  <EmptyState title={`No ${TRACK_LABELS[g.track].toLowerCase()} profiles`} />
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((p) => (
                    <Card key={p.id} className={p.active ? '' : 'opacity-60'} bodyClassName="flex h-full flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-fg">{p.name}</div>
                          <div className="font-mono text-xs text-subtle">{p.slug}</div>
                        </div>
                        {!p.active && <Badge tone="grey">Inactive</Badge>}
                      </div>
                      <Chips items={p.categories.map((c) => CATEGORY_LABELS[c] ?? c)} tone="blue" />
                      {p.targetJobTitles.length > 0 && <p className="line-clamp-2 text-xs text-muted">{p.targetJobTitles.join(' · ')}</p>}
                      <div className="text-xs text-subtle">
                        {p.template} · max {p.maximumPages}p · {p.experienceOrdering === 'RELEVANCE' ? 'by relevance' : 'chronological'} · cover letter{' '}
                        {p.includeCoverLetter.toLowerCase().replace('_', ' ')}
                      </div>
                      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-3">
                        <Button size="sm" icon={<Eye className="size-3.5" />} onClick={() => setPreviewing(p)}>
                          Preview
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDraftState(toDraft(p))}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Copy className="size-3.5" />}
                          onClick={() => {
                            const d = toDraft(p);
                            delete d.id;
                            setDraftState({ ...d, name: `${p.name} (copy)`, slug: `${p.slug}-copy` });
                          }}
                        >
                          Duplicate
                        </Button>
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 className="size-3.5" />}
                          title="Delete CV profile?"
                          message="If applications already use this profile it will be deactivated instead of deleted."
                          confirmLabel="Delete"
                          danger
                          onConfirm={() => remove.mutateAsync(p.id)}
                        >
                          Delete
                        </ConfirmButton>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraftState(null)}
        title={draft?.id ? `Edit ${draft.name}` : 'New CV profile'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraftState(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending || update.isPending} disabled={!valid} onClick={save}>
              Save profile
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <Callout tone="blue" className="mb-5">
              Profiles only choose, order and phrase-select from your evidence. Claims not backed by evidence fail validation.
            </Callout>
            <ProfileEditor draft={draft} setDraft={setDraft} />
          </>
        )}
      </Modal>

      <PreviewModal key={previewing?.id ?? 'none'} profile={previewing} onClose={() => setPreviewing(null)} />
    </>
  );
}
