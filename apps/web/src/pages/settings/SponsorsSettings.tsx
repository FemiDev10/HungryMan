import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CloudDownload, ExternalLink, Search, Upload } from 'lucide-react';
import { api } from '../../api/client';
import type { SponsorCheck } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Badge, Button, Callout, Card, ErrorBox, errorMessage, KeyValue, LoadingBlock } from '../../components/ui';
import { fileToBase64, fmtDateTime, fmtRelative } from '../../lib/format';

const REGISTER_PAGE = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';

function CheckCompany({ disabled }: { disabled: boolean }) {
  const [company, setCompany] = useState('');
  const check = useMutation({ mutationFn: (name: string) => api.checkSponsor(name) });
  const r: SponsorCheck | undefined = check.data;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (company.trim()) check.mutate(company.trim());
      }}
    >
      <div className="flex gap-2">
        <input
          className="input max-w-sm"
          placeholder="Company name, e.g. Monzo"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          aria-label="Company name"
        />
        <Button type="submit" icon={<Search className="size-4" />} loading={check.isPending} disabled={disabled || !company.trim()}>
          Check
        </Button>
      </div>
      {check.error && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage(check.error)}</p>}
      {r &&
        (r.result === null ? (
          <p className="text-sm text-muted">The register isn't loaded yet — download or upload it first.</p>
        ) : r.result.licensed ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="green">
              <BadgeCheck className="size-3" />
              Licensed sponsor
            </Badge>
            <span className="text-muted">
              “{r.company}” matches <b className="text-fg">{r.result.name}</b>
            </span>
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="grey">Not on register</Badge>
            <span className="text-muted">No entry found for “{r.company}”. Try the company's legal name (e.g. “… Ltd”).</span>
          </p>
        ))}
    </form>
  );
}

export function SponsorsSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const status = useQuery({ queryKey: ['sponsors'], queryFn: api.sponsorStatus });

  const onDone = (rows: number) => {
    qc.invalidateQueries({ queryKey: ['sponsors'] });
    qc.invalidateQueries({ queryKey: ['checklist'] });
    toast(`Sponsor register loaded — ${rows.toLocaleString('en-GB')} entries`);
  };
  const refresh = useMutation({
    mutationFn: () => api.refreshSponsors(),
    onSuccess: (r) => onDone(r.rows),
    onError: () => qc.invalidateQueries({ queryKey: ['sponsors'] }),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => api.uploadSponsors(await fileToBase64(file)),
    onSuccess: (r) => onDone(r.rows),
  });
  const busy = refresh.isPending || upload.isPending;
  const s = status.data;

  return (
    <div className="space-y-6">
      <Card
        title="Register of licensed sponsors"
        subtitle="Home Office list of employers licensed to sponsor Skilled Worker visas"
        actions={
          s?.loaded ? (
            <Badge tone="green" dot>
              Loaded
            </Badge>
          ) : (
            <Badge tone="amber" dot>
              Not loaded
            </Badge>
          )
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Used to check whether the employer behind a full-time professional job can sponsor you after your course — jobs from employers not on
            the register (and whose advert doesn't mention sponsorship) are marked not eligible.{' '}
            <a className="inline-flex items-center gap-0.5 underline underline-offset-2" href={REGISTER_PAGE} target="_blank" rel="noopener noreferrer">
              About the register <ExternalLink className="size-3" />
            </a>
          </p>

          {status.isLoading ? (
            <LoadingBlock />
          ) : status.error ? (
            <ErrorBox error={status.error} onRetry={() => status.refetch()} />
          ) : (
            s && (
              <KeyValue
                items={[
                  ['Entries', s.loaded ? s.rows.toLocaleString('en-GB') : '—'],
                  ['Imported', s.importedAt ? `${fmtDateTime(s.importedAt)} (${fmtRelative(s.importedAt)})` : 'Never'],
                  ['Source', s.sourceUrl ? <span className="break-all">{s.sourceUrl}</span> : '—'],
                ]}
              />
            )
          )}

          {s?.lastError && !refresh.error && (
            <Callout tone="red">
              <span className="font-medium">Last refresh failed:</span> {s.lastError}
            </Callout>
          )}
          {refresh.error && (
            <Callout tone="red">
              <p className="font-medium">Couldn't download the register from gov.uk</p>
              <p className="mt-0.5">{errorMessage(refresh.error)}</p>
              <p className="mt-0.5 text-xs">
                You can download the CSV yourself from{' '}
                <a className="underline underline-offset-2" href={REGISTER_PAGE} target="_blank" rel="noopener noreferrer">
                  gov.uk
                </a>{' '}
                and upload it here instead.
              </p>
            </Callout>
          )}
          {upload.error && <Callout tone="red">Upload failed: {errorMessage(upload.error)}</Callout>}
          {refresh.isPending && <Callout tone="blue">Downloading and importing the register — this can take a minute. Keep this page open.</Callout>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<CloudDownload className="size-4" />}
              loading={refresh.isPending}
              disabled={busy}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? 'Downloading…' : 'Download latest from gov.uk'}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) upload.mutate(f);
              }}
            />
            <Button icon={<Upload className="size-4" />} loading={upload.isPending} disabled={busy} onClick={() => fileInput.current?.click()}>
              Upload CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Check a company" subtitle="Look up how an employer's name matches the register">
        <CheckCompany disabled={busy} />
      </Card>
    </div>
  );
}
