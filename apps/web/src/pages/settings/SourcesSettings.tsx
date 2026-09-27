import { useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react';
import { api } from '../../api/client';
import type { SourceConfig } from '../../api/types';
import { TagInput } from '../../components/TagInput';
import { Badge, Button, Card, ErrorBox, Field, LoadingBlock, Toggle } from '../../components/ui';
import { useAction } from '../../lib/hooks';
import { fmtRelative } from '../../lib/format';

/** Known list-shaped config keys that get a friendly tag editor. */
const LIST_KEYS: Record<string, { label: string; hint: string }> = {
  boards: { label: 'Board tokens', hint: 'Greenhouse board tokens, e.g. "monzo" from boards.greenhouse.io/monzo' },
  companies: { label: 'Companies', hint: 'Lever company slugs, e.g. "netflix" from jobs.lever.co/netflix' },
};

const DEFAULT_LIST_KEY: Record<string, string> = { greenhouse: 'boards', lever: 'companies' };

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function SourceCard({ src }: { src: SourceConfig }) {
  const initialConfig = { ...(src.config ?? {}) };
  const dk = DEFAULT_LIST_KEY[src.source];
  if (dk && !(dk in initialConfig)) initialConfig[dk] = [];
  const listKeys = Object.keys(initialConfig).filter((k) => k in LIST_KEYS && isStringArray(initialConfig[k]));
  const onlyLists = listKeys.length > 0 && Object.keys(initialConfig).every((k) => listKeys.includes(k));

  const [f, setF] = useState({
    enabled: src.enabled,
    maxApplicationsPerHour: src.maxApplicationsPerHour,
    maxApplicationsPerDay: src.maxApplicationsPerDay,
    cooldownSeconds: src.cooldownSeconds,
    maxResultsPerSearch: src.maxResultsPerSearch,
  });
  const [config, setConfig] = useState<Record<string, unknown>>(initialConfig);
  const [rawMode, setRawMode] = useState(!onlyLists);
  const [raw, setRaw] = useState(() => JSON.stringify(src.config ?? {}, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const save = useAction((body: Partial<SourceConfig>) => api.updateSource(src.source, body), {
    invalidate: [['sources']],
    success: `${src.label || src.source} saved`,
    onSuccess: () => setDirty(false),
  });

  const num = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => {
    setF((x) => ({ ...x, [k]: Number(e.target.value) }));
    setDirty(true);
  };

  const submit = () => {
    let cfg: Record<string, unknown> = config;
    if (rawMode) {
      try {
        const parsed = JSON.parse(raw || '{}');
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Config must be a JSON object');
        cfg = parsed;
        setRawError(null);
      } catch (e) {
        setRawError(e instanceof Error ? e.message : 'Invalid JSON');
        return;
      }
    }
    save.mutate({ ...f, config: cfg });
  };

  const toggleEnabled = (v: boolean) => {
    setF((x) => ({ ...x, enabled: v }));
    save.mutate({ enabled: v });
  };

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {src.label || src.source}
          <span className="font-mono text-xs font-normal text-subtle">{src.source}</span>
        </span>
      }
      actions={
        <div className="flex items-center gap-3">
          {src.available ? (
            <Badge tone="green">
              <CheckCircle2 className="size-3" /> Available
            </Badge>
          ) : (
            <span title="Required API credentials are not configured on the server">
              <Badge tone="amber">
                <KeyRound className="size-3" /> Credentials missing
              </Badge>
            </span>
          )}
          {src.supportsApplication && <Badge tone="blue">Can apply</Badge>}
          <Toggle checked={f.enabled} onChange={toggleEnabled} disabled={save.isPending} />
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
          <span>Last run: {src.lastRunAt ? fmtRelative(src.lastRunAt) : 'never'}</span>
        </div>
        {src.lastError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/6 p-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {src.lastError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Max applications / hour">
            <input className="input" type="number" min={0} value={f.maxApplicationsPerHour} onChange={num('maxApplicationsPerHour')} />
          </Field>
          <Field label="Max applications / day">
            <input className="input" type="number" min={0} value={f.maxApplicationsPerDay} onChange={num('maxApplicationsPerDay')} />
          </Field>
          <Field label="Cooldown (seconds)">
            <input className="input" type="number" min={0} value={f.cooldownSeconds} onChange={num('cooldownSeconds')} />
          </Field>
          <Field label="Max results / search">
            <input className="input" type="number" min={1} value={f.maxResultsPerSearch} onChange={num('maxResultsPerSearch')} />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">Configuration</span>
            {listKeys.length > 0 && (
              <button
                type="button"
                className="text-xs text-muted underline underline-offset-2 hover:text-fg"
                onClick={() => {
                  if (rawMode) {
                    try {
                      setConfig(JSON.parse(raw || '{}'));
                      setRawError(null);
                      setRawMode(false);
                    } catch {
                      setRawError('Fix the JSON before switching views');
                    }
                  } else {
                    setRaw(JSON.stringify(config, null, 2));
                    setRawMode(true);
                  }
                }}
              >
                {rawMode ? 'Edit as list' : 'Edit as JSON'}
              </button>
            )}
          </div>
          {rawMode ? (
            <>
              <textarea
                className="input min-h-28 font-mono text-xs"
                spellCheck={false}
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  setDirty(true);
                }}
              />
              {rawError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{rawError}</p>}
              <p className="mt-1 text-[11px] text-subtle">Non-secret settings only. API keys live in the server environment.</p>
            </>
          ) : (
            <div className="space-y-3">
              {listKeys.map((k) => (
                <Field key={k} label={LIST_KEYS[k].label} hint={LIST_KEYS[k].hint}>
                  <TagInput
                    value={(config[k] as string[]) ?? []}
                    onChange={(v) => {
                      setConfig((c) => ({ ...c, [k]: v }));
                      setDirty(true);
                    }}
                  />
                </Field>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant={dirty ? 'primary' : 'secondary'} size="sm" loading={save.isPending} onClick={submit}>
            Save {src.label || src.source}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function SourcesSettings() {
  const q = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Enable the job sources the agent may search. Rate limits protect your accounts and respect each site's terms — keep them conservative.
      </p>
      {q.data.map((s) => (
        <SourceCard key={`${s.source}-${s.lastRunAt ?? ''}`} src={s} />
      ))}
    </div>
  );
}
