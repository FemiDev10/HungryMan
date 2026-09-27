import type { ReactNode } from 'react';
import { cx } from './ui';

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              value === t.id ? 'bg-surface-3 text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count != null && <span className="rounded bg-surface-2 px-1.5 text-[11px] tabular-nums text-muted">{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
