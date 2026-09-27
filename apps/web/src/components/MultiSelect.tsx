import { Check } from 'lucide-react';
import { cx } from './ui';

/** Chip-style multi select for small fixed option sets (e.g. job categories). */
export function MultiSelect<T extends string>({ options, value, onChange, labels }: {
  options: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  labels?: Partial<Record<T, string>>;
}) {
  const toggle = (o: T) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            aria-pressed={on}
            className={cx(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition',
              on
                ? 'border-accent/60 bg-accent-soft text-fg'
                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {on && <Check className="size-3 text-accent" />}
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}
