import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cx } from './ui';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, kind, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-3 text-sm shadow-lg',
              t.kind === 'error' ? 'border-red-500/40' : 'border-line',
            )}
          >
            {t.kind === 'error' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
            )}
            <span className="flex-1 text-fg">{t.message}</span>
            <button className="text-subtle hover:text-fg" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
