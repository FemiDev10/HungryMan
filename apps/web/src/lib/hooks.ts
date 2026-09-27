import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { errorMessage } from '../components/ui';

export const POLL_MS = 5000;

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: POLL_MS });
}

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 5 * 60_000 });
}

export function useCandidate() {
  return useQuery({ queryKey: ['candidate'], queryFn: api.candidate });
}

/** Mutation helper: shows a toast and invalidates the given keys on success. */
export function useAction<TArgs, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast(msg);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
}

/** Re-renders every `ms` and returns the current timestamp. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
