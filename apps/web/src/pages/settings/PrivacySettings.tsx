import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ShieldAlert } from 'lucide-react';
import { api } from '../../api/client';
import { Button, buttonClass, Card, Field } from '../../components/ui';
import { useAction } from '../../lib/hooks';

const PHRASE = 'DELETE ALL MY DATA';

export function PrivacySettings() {
  const [typed, setTyped] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const wipe = useAction(() => api.privacyDelete(PHRASE), {
    success: 'All data deleted',
    onSuccess: () => {
      setTyped('');
      qc.invalidateQueries();
      navigate('/');
    },
  });

  return (
    <div className="space-y-6">
      <Card title="Export your data" subtitle="Download everything HungryMan stores about you as a single JSON file.">
        <a href={api.privacyExportUrl()} className={buttonClass('secondary')} download>
          <Download className="size-4" /> Export data
        </a>
      </Card>

      <section className="rounded-xl border border-red-500/40 bg-red-500/[0.04]">
        <header className="flex items-center gap-2 border-b border-red-500/30 px-4 py-3">
          <ShieldAlert className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Danger zone</h2>
        </header>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted">
            Permanently delete your candidate profile, evidence, jobs, applications, generated documents and stored files. This cannot be undone.
            Export your data first if you might need it.
          </p>
          <Field label={`Type “${PHRASE}” to confirm`}>
            <input className="input max-w-sm font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={PHRASE} autoComplete="off" />
          </Field>
          <Button variant="danger" disabled={typed !== PHRASE} loading={wipe.isPending} onClick={() => wipe.mutate(undefined)}>
            Delete all my data
          </Button>
        </div>
      </section>
    </div>
  );
}
