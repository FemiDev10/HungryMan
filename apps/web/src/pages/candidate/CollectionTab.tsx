import { useMemo, useState, type ReactNode } from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import type { CandidateCollection, ReviewStatus } from '../../api/types';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Modal } from '../../components/Modal';
import { MultiSelect } from '../../components/MultiSelect';
import { TagInput } from '../../components/TagInput';
import { Badge, Button, Card, EmptyState, Field, Select, Toggle, cx } from '../../components/ui';
import { useAction } from '../../lib/hooks';
import { CATEGORIES, CATEGORY_LABELS } from '../../lib/labels';
import { nullIfEmpty, numOrNull, toDateInput } from '../../lib/format';

export type FieldType = 'text' | 'textarea' | 'url' | 'date' | 'bool' | 'number' | 'tags' | 'categories' | 'select' | 'variants';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  wide?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  /** For `select`: options; an option with value '' maps to null. */
  options?: { value: string; label: string }[];
  /** For `bool`: description under the toggle. */
  description?: string;
}

type Values = Record<string, unknown>;

function toFormValues(fields: FieldDef[], item: Values | null): Values {
  const v: Values = {};
  for (const f of fields) {
    const raw = item?.[f.key];
    switch (f.type) {
      case 'date':
        v[f.key] = toDateInput(raw as string | null);
        break;
      case 'bool':
        v[f.key] = raw == null ? (f.key.startsWith('allowed') ? true : false) : Boolean(raw);
        break;
      case 'tags':
      case 'categories':
        v[f.key] = Array.isArray(raw) ? raw : [];
        break;
      case 'number':
        v[f.key] = raw == null ? '' : String(raw);
        break;
      case 'select':
        v[f.key] = raw == null ? (f.options?.[0]?.value ?? '') : String(raw);
        break;
      case 'variants':
        // {CLEANING: "School Assistant (Cleaning)"} → "Cleaning: School Assistant (Cleaning)" per line
        v[f.key] = Object.entries((raw as Record<string, string>) ?? {})
          .map(([k, t]) => `${CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS] ?? k}: ${t}`)
          .join('\n');
        break;
      default:
        v[f.key] = raw == null ? '' : String(raw);
    }
  }
  return v;
}

function toBody(fields: FieldDef[], v: Values): Values {
  const body: Values = {};
  for (const f of fields) {
    const raw = v[f.key];
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'url':
        body[f.key] = f.required ? String(raw ?? '').trim() : nullIfEmpty(raw as string);
        break;
      case 'date':
        body[f.key] = raw ? String(raw) : null;
        break;
      case 'number':
        body[f.key] = numOrNull(raw as string);
        break;
      case 'bool':
        body[f.key] = Boolean(raw);
        break;
      case 'tags':
      case 'categories':
        body[f.key] = raw ?? [];
        break;
      case 'select':
        body[f.key] = raw === '' ? null : raw;
        break;
      case 'variants': {
        const out: Record<string, string> = {};
        for (const line of String(raw ?? '').split('\n')) {
          const i = line.indexOf(':');
          if (i < 0) continue;
          const label = line.slice(0, i).trim().toLowerCase();
          const key = CATEGORIES.find((c) => c.toLowerCase() === label.replace(/[\s/-]+/g, '_') || CATEGORY_LABELS[c].toLowerCase() === label);
          const title = line.slice(i + 1).trim();
          if (key && title) out[key] = title;
        }
        body[f.key] = out;
        break;
      }
    }
  }
  return body;
}

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (f.type) {
    case 'variants':
    case 'textarea':
      return <textarea className="input min-h-24" value={String(value ?? '')} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <input type="date" className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" step="any" className="input" value={String(value ?? '')} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <input type="url" className="input" value={String(value ?? '')} placeholder={f.placeholder ?? 'https://'} onChange={(e) => onChange(e.target.value)} />;
    case 'bool':
      return <Toggle checked={Boolean(value)} onChange={onChange} label={f.label} description={f.description} />;
    case 'tags':
      return <TagInput value={(value as string[]) ?? []} onChange={onChange} placeholder={f.placeholder} />;
    case 'categories':
      return <MultiSelect options={CATEGORIES} labels={CATEGORY_LABELS} value={(value as never[]) ?? []} onChange={onChange} />;
    case 'select':
      return (
        <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    default:
      return <input className="input" value={String(value ?? '')} placeholder={f.placeholder} required={f.required} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function ItemForm({ fields, values, setValues }: { fields: FieldDef[]; values: Values; setValues: (fn: (v: Values) => Values) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) =>
        f.type === 'bool' ? (
          <div key={f.key} className={cx('sm:pt-5', f.wide && 'sm:col-span-2')}>
            <FieldInput f={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          </div>
        ) : (
          <Field
            key={f.key}
            label={`${f.label}${f.required ? ' *' : ''}`}
            hint={f.hint}
            className={f.wide || f.type === 'textarea' || f.type === 'variants' || f.type === 'tags' || f.type === 'categories' ? 'sm:col-span-2' : undefined}
          >
            <FieldInput f={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          </Field>
        ),
      )}
    </div>
  );
}

type Item = { id: string; status?: ReviewStatus };

export interface CollectionTabProps<T extends Item> {
  col: CandidateCollection;
  title: string;
  singular: string;
  description?: ReactNode;
  items: T[];
  fields: FieldDef[];
  render: (item: T) => ReactNode;
  banner?: ReactNode;
  /** Extra filter controls; return predicate for items. */
  filterBar?: (setPredicate: (p: ((t: T) => boolean) | null) => void) => ReactNode;
  sort?: (a: T, b: T) => number;
}

export function CollectionTab<T extends Item>({ col, title, singular, description, items, fields, render, banner, filterBar, sort }: CollectionTabProps<T>) {
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [values, setValuesState] = useState<Values>({});
  const [search, setSearch] = useState('');
  const [predicate, setPredicateState] = useState<((t: T) => boolean) | null>(null);
  const setPredicate = (p: ((t: T) => boolean) | null) => setPredicateState(() => p);

  const inv = [['candidate']];
  const create = useAction((b: Values) => api.createItem(col, b), { invalidate: inv, success: `${singular} added`, onSuccess: () => setEditing(null) });
  const update = useAction(({ id, b }: { id: string; b: Values }) => api.updateItem(col, id, b), {
    invalidate: inv,
    success: `${singular} saved`,
    onSuccess: () => setEditing(null),
  });
  const remove = useAction((id: string) => api.deleteItem(col, id), { invalidate: [...inv, ['checklist']], success: `${singular} deleted` });
  const review = useAction(
    ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) => api.reviewItems({ items: [{ collection: col, id, action }] }),
    {
      invalidate: [...inv, ['checklist']],
      success: (r) => (r.approved ? `${singular} approved` : `${singular} rejected`),
    },
  );
  const reviewing = (id: string, action: 'APPROVE' | 'REJECT') => review.isPending && review.variables?.id === id && review.variables.action === action;
  const drafts = items.filter((i) => i.status === 'DRAFT').length;

  const open = (item: T | 'new') => {
    setValuesState(toFormValues(fields, item === 'new' ? null : (item as unknown as Values)));
    setEditing(item);
  };
  const setValues = (fn: (v: Values) => Values) => setValuesState(fn);

  const missing = fields.filter((f) => f.required && !String(values[f.key] ?? '').trim());
  const save = () => {
    const b = toBody(fields, values);
    if (editing === 'new') create.mutate(b);
    else if (editing) update.mutate({ id: editing.id, b });
  };

  const shown = useMemo(() => {
    let xs = [...items];
    if (sort) xs.sort(sort);
    // Drafts first so they're reviewed (stable sort keeps the order within each group).
    xs.sort((a, b) => Number(b.status === 'DRAFT') - Number(a.status === 'DRAFT'));
    if (predicate) xs = xs.filter(predicate);
    const s = search.trim().toLowerCase();
    if (s) xs = xs.filter((x) => JSON.stringify(x).toLowerCase().includes(s));
    return xs;
  }, [items, predicate, search, sort]);

  return (
    <div className="space-y-4">
      {banner}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {title} <span className="ml-1 text-sm font-normal text-subtle">{items.length}</span>
            {drafts > 0 && (
              <Badge tone="amber" className="ml-2 align-middle">
                {drafts} draft{drafts === 1 ? '' : 's'}
              </Badge>
            )}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => open('new')}>
          Add {singular.toLowerCase()}
        </Button>
      </div>
      {items.length > 4 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input className="input pl-9" placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filterBar?.(setPredicate)}
        </div>
      )}
      <Card bodyClassName="p-0">
        {shown.length === 0 ? (
          <EmptyState title={items.length ? 'No matches' : `No ${title.toLowerCase()} yet`}>
            {!items.length && `Add your first ${singular.toLowerCase()} to strengthen generated CVs and answers.`}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((item) => {
              const draft = item.status === 'DRAFT';
              return (
              <li
                key={item.id}
                className={cx('group flex flex-wrap items-start gap-3 px-4 py-3.5 sm:flex-nowrap', draft && 'border-l-2 border-l-amber-500 bg-amber-500/5')}
              >
                <div className="min-w-0 flex-1">
                  {draft && (
                    <div className="mb-1.5" title="Imported from your CV — the agent won't use this until you approve it">
                      <Badge tone="amber">Draft</Badge>
                    </div>
                  )}
                  {render(item)}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {draft && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
                        loading={reviewing(item.id, 'APPROVE')}
                        disabled={review.isPending}
                        onClick={() => review.mutate({ id: item.id, action: 'APPROVE' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<X className="size-3.5" />}
                        title="Reject — deletes this draft"
                        loading={reviewing(item.id, 'REJECT')}
                        disabled={review.isPending}
                        onClick={() => review.mutate({ id: item.id, action: 'REJECT' })}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                <div className="flex items-center gap-1 opacity-100 transition sm:opacity-60 sm:group-hover:opacity-100">
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => open(item)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <ConfirmButton
                    size="sm"
                    variant="ghost"
                    aria-label="Delete"
                    title={`Delete ${singular.toLowerCase()}?`}
                    message="This cannot be undone. Generated CVs that already cite it keep their stored copy."
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => remove.mutateAsync(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </ConfirmButton>
                </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? `Add ${singular.toLowerCase()}` : `Edit ${singular.toLowerCase()}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending || update.isPending} disabled={missing.length > 0} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <ItemForm fields={fields} values={values} setValues={setValues} />
      </Modal>
    </div>
  );
}
