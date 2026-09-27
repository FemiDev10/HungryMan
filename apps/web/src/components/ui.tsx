import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertTriangle, Info, Loader2, FlaskConical } from 'lucide-react';
import { TONE_CLASSES, type Tone } from '../lib/labels';
import { ApiError } from '../api/client';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
  subtle: 'bg-surface-2 text-fg hover:bg-surface-3',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
    VARIANTS[variant],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function Badge({ tone = 'grey', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function SimulatedBadge() {
  return (
    <span title="Produced by the mock browser agent — not a real submission">
      <Badge tone="violet">
        <FlaskConical className="size-3" />
        Simulated
      </Badge>
    </span>
  );
}

export function Card({ title, actions, children, className, bodyClassName, subtitle }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-subtle', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/8 p-4 text-sm text-red-700 dark:text-red-300">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p>{errorMessage(error)}</p>
        {onRetry && (
          <button className="mt-2 text-xs font-medium underline underline-offset-2" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Callout({ tone = 'blue', icon, children, className }: { tone?: 'blue' | 'amber' | 'green' | 'red'; icon?: ReactNode; children: ReactNode; className?: string }) {
  const styles = {
    blue: 'border-sky-500/30 bg-sky-500/8 text-sky-900 dark:text-sky-200',
    amber: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    green: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-900 dark:text-emerald-200',
    red: 'border-red-500/30 bg-red-500/8 text-red-900 dark:text-red-200',
  }[tone];
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border p-3.5 text-sm', styles, className)}>
      <span className="mt-0.5 shrink-0">{icon ?? <Info className="size-4" />}</span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input appearance-auto pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-ring',
          checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-line-strong ring-inset',
        )}
      >
        <span
          className={cx(
            'inline-block size-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-fg">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function ScoreBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const p = Math.max(0, Math.min(1, value / max));
  const color = p >= 0.7 ? 'bg-emerald-500' : p >= 0.5 ? 'bg-sky-500' : p >= 0.35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${p * 100}%` }} />
    </div>
  );
}

export function MatchPill({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-subtle">—</span>;
  const s = Math.round(score);
  const tone: Tone = s >= 70 ? 'green' : s >= 50 ? 'blue' : s >= 35 ? 'amber' : 'red';
  return <Badge tone={tone}>{s}%</Badge>;
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[auto_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-fg">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Chips({ items, tone = 'slate', empty = '—' }: { items: string[] | null | undefined; tone?: Tone; empty?: string }) {
  if (!items || items.length === 0) return <span className="text-sm text-subtle">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t, i) => (
        <Badge key={`${t}-${i}`} tone={tone}>
          {t}
        </Badge>
      ))}
    </div>
  );
}
