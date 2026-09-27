import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Lock } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button, errorMessage } from '../components/ui';

export function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      qc.clear();
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Incorrect password' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-emerald-500/10">
            <Activity className="size-6" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">HungryMan</h1>
          <p className="mt-1 text-sm text-muted">Your private job-application agent</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <label className="block">
            <span className="label">Password</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                className="input pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!password}>
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-subtle">Single-user dashboard. Sessions are stored in an httpOnly cookie.</p>
      </div>
    </div>
  );
}
