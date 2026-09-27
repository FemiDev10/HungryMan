import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../api/client';
import type { Notification } from '../api/types';
import { useAction } from '../lib/hooks';
import { fmtRelative } from '../lib/format';
import { cx, Spinner } from './ui';

export function notificationTone(type: string): string {
  if (type.includes('HUMAN') || type.includes('ATTENTION')) return 'bg-amber-500';
  if (type.includes('FAIL')) return 'bg-red-500';
  if (type.includes('OFFER') || type.includes('INTERVIEW') || type.includes('SUBMITTED')) return 'bg-emerald-500';
  return 'bg-sky-500';
}

export function NotificationItem({ n, onClick }: { n: Notification; onClick?: () => void }) {
  const cls = cx('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2', !n.read && 'bg-accent-soft/40');
  const inner = (
    <>
      <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-surface-3' : notificationTone(n.type))} />
      <span className="min-w-0 flex-1">
        <span className={cx('block text-sm', n.read ? 'text-muted' : 'font-medium text-fg')}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
        <span className="mt-1 block text-[11px] text-subtle">{fmtRelative(n.createdAt)}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unread = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.notifications(true), refetchInterval: 15_000 });
  const all = useQuery({ queryKey: ['notifications', 'all'], queryFn: () => api.notifications(false), enabled: open });

  const markRead = useAction((id: string) => api.markNotificationRead(id), { invalidate: [['notifications'], ['overview']] });
  const markAll = useAction(() => api.markAllNotificationsRead(), { invalidate: [['notifications'], ['overview']], success: 'All notifications marked read' });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = unread.data?.length ?? 0;
  const items = (all.data ?? unread.data ?? []).slice(0, 30);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-14 z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
              onClick={() => markAll.mutate(undefined)}
              disabled={count === 0 || markAll.isPending}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {all.isLoading && !unread.data ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</p>
            ) : (
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  n={n}
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    if (n.applicationId) {
                      setOpen(false);
                      navigate(`/applications/${n.applicationId}`);
                    }
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
