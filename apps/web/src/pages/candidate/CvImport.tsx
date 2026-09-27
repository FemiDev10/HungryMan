import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, FileUp, KeyRound } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { Candidate, CandidateCollection, CvImportResult } from '../../api/types';
import { ConfirmButton } from '../../components/ConfirmButton';
import { useToast } from '../../components/Toast';
import { Button, Callout, errorMessage } from '../../components/ui';
import { useAction } from '../../lib/hooks';
import { fileToBase64 } from '../../lib/format';

export const COLLECTIONS: CandidateCollection[] = ['employment', 'education', 'projects', 'skills', 'certifications', 'evidence'];

const COUNT_LABELS: Record<string, [string, string]> = {
  employment: ['job', 'jobs'],
  education: ['education entry', 'education entries'],
  projects: ['project', 'projects'],
  skills: ['skill', 'skills'],
  certifications: ['certification', 'certifications'],
  evidence: ['evidence claim', 'evidence claims'],
};

export function draftCount(c: Candidate | undefined, col: CandidateCollection): number {
  if (!c) return 0;
  return (c[col] as { status?: string }[]).filter((x) => x.status === 'DRAFT').length;
}

export function totalDrafts(c: Candidate | undefined): number {
  return COLLECTIONS.reduce((n, col) => n + draftCount(c, col), 0);
}

function describeCounts(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${COUNT_LABELS[k]?.[n === 1 ? 0 : 1] ?? k}`);
  return parts.length ? parts.join(', ') : 'nothing new';
}

const MAX_BYTES = 10 * 1024 * 1024;

/** "Import CV" button plus a status panel (progress / result / error) to render below the header. */
export function useCvImport(onImported?: () => void): { button: ReactNode; panel: ReactNode } {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const [result, setResult] = useState<{ fileName: string; r: CvImportResult } | null>(null);
  const [error, setError] = useState<{ message: string; needsKey: boolean } | null>(null);

  const imp = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error('File too large (max 10 MB).');
      if (!/\.(pdf|docx)$/i.test(file.name)) throw new Error('Upload a PDF or DOCX file.');
      const b64 = await fileToBase64(file);
      return { fileName: file.name, r: await api.importCv(file.name, b64) };
    },
    onMutate: () => {
      setError(null);
      setResult(null);
    },
    onSuccess: (res) => {
      qc.setQueryData(['candidate'], res.r.candidate);
      qc.invalidateQueries({ queryKey: ['candidate'] });
      qc.invalidateQueries({ queryKey: ['checklist'] });
      setResult(res);
      toast('CV imported as drafts');
      onImported?.();
    },
    onError: (e) => {
      const needsKey = e instanceof ApiError && e.status === 503;
      setError({ message: errorMessage(e), needsKey });
    },
  });

  const button = (
    <>
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) imp.mutate(f);
        }}
      />
      <Button variant="primary" icon={<FileUp className="size-4" />} loading={imp.isPending} onClick={() => input.current?.click()}>
        {imp.isPending ? 'Reading your CV…' : 'Import CV'}
      </Button>
    </>
  );
  const panel = (result || error || imp.isPending) && (
    <div className="mb-5">
      {imp.isPending && <Callout tone="blue">Claude is reading your CV and extracting items. This usually takes under a minute.</Callout>}
      {error && (
        <Callout tone={error.needsKey ? 'amber' : 'red'} icon={error.needsKey ? <KeyRound className="size-4" /> : undefined}>
          <p className="font-medium">{error.needsKey ? 'CV import needs a Claude API key' : 'CV import failed'}</p>
          <p className="mt-0.5">{error.message}</p>
          {error.needsKey && <p className="mt-0.5 text-xs">You can still add items by hand below.</p>}
        </Callout>
      )}
      {result && (
        <Callout tone="green">
          <p>
            Imported <b>{result.fileName}</b>: {describeCounts(result.r.counts)}. Everything was saved as a <b>draft</b> — review each item and
            approve it before the agent will use it. Any empty personal details (email, phone, city…) were filled in from the CV where found.
          </p>
        </Callout>
      )}
    </div>
  );
  return { button, panel };
}

/** Banner shown while any collection holds drafts. */
export function DraftsBanner({ count }: { count: number }) {
  const approveAll = useAction(() => api.reviewItems({ approveAll: true }), {
    invalidate: [['candidate'], ['checklist']],
    success: (r) => `${r.approved} item${r.approved === 1 ? '' : 's'} approved`,
  });
  if (count === 0) return null;
  return (
    <Callout tone="amber" className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <b>
            {count} imported {count === 1 ? 'item' : 'items'}
          </b>{' '}
          waiting for review — the agent only uses approved items. Check each tab for the <b>Draft</b> badge.
        </p>
        <ConfirmButton
          size="sm"
          variant="secondary"
          icon={<CheckCheck className="size-3.5" />}
          title={`Approve all ${count} drafts?`}
          message="Every imported item becomes usable on CVs and application answers straight away. Only do this if you've read them — anything wrong could end up in an application."
          confirmLabel="Approve all"
          onConfirm={() => approveAll.mutateAsync(undefined)}
        >
          Approve all
        </ConfirmButton>
      </div>
    </Callout>
  );
}
