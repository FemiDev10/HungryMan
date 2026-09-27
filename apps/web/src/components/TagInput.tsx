import { useId, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cx } from './ui';

/** Free-form string array editor. Enter or comma adds; Backspace on empty removes last. */
export function TagInput({ value, onChange, placeholder, suggestions, className }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: (string | { value: string; label: string })[];
  className?: string;
}) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const listId = suggestions?.length ? `tags-${id}` : undefined;

  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cx(
        'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 transition',
        'focus-within:border-accent focus-within:ring-2 focus-within:ring-ring',
        className,
      )}
    >
      {value.map((t, i) => (
        <span key={`${t}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-3 py-0.5 pl-2 pr-1 text-xs text-fg">
          <span className="truncate">{t}</span>
          <button
            type="button"
            aria-label={`Remove ${t}`}
            className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? '' : placeholder ?? 'Type and press Enter'}
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-fg outline-none placeholder:text-subtle"
      />
      {listId && (
        <datalist id={listId}>
          {suggestions!
            .map((s) => (typeof s === 'string' ? { value: s, label: s } : s))
            .filter((s) => !value.includes(s.value))
            .map((s) => (
              <option key={s.value} value={s.value}>
                {s.label !== s.value ? s.label : undefined}
              </option>
            ))}
        </datalist>
      )}
    </div>
  );
}
