import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from './ui';

export function StatCard({ label, value, icon, tone, to, hint }: {
  label: string;
  value: number | string | null | undefined;
  icon?: ReactNode;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'blue';
  to?: string;
  hint?: ReactNode;
}) {
  const accent = {
    default: 'text-fg',
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-sky-600 dark:text-sky-400',
  }[tone ?? 'default'];
  const body = (
    <div className={cx('card h-full p-4 transition', to && 'hover:border-line-strong hover:bg-surface-2/60')}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
        <span className="truncate">{label}</span>
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
      <div className={cx('mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl', accent)}>{value ?? '—'}</div>
      {hint && <div className="mt-1 text-xs text-subtle">{hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
