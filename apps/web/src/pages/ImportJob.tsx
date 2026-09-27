import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Link2, PlusCircle } from 'lucide-react';
import { api } from '../api/client';
import type { ApplicationRow, ImportJobBody, Job } from '../api/types';
import { Button, Callout, Card, Field, PageHeader, Select } from '../components/ui';
import { useAction } from '../lib/hooks';
import { EMPLOYMENT_TYPES, humanize } from '../lib/labels';

const EMPTY: ImportJobBody = {
  url: '',
  title: '',
  company: '',
  description: '',
  location: '',
  salaryText: '',
  employmentType: '',
  hoursText: '',
  closingDate: '',
};

export function ImportJobPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [form, setForm] = useState<ImportJobBody>(EMPTY);
  const [lastResult, setLastResult] = useState<{ job: Job; application: ApplicationRow | null } | null>(null);

  const onDone = (r: { job: Job; application: ApplicationRow | null }) => {
    if (r.application?.id) navigate(`/applications/${r.application.id}`);
    else setLastResult(r);
  };

  const importUrl = useAction((u: string) => api.importJobUrl(u), {
    invalidate: [['applications'], ['overview']],
    success: 'Job imported and analysed',
    onSuccess: onDone,
  });
  const importManual = useAction((b: ImportJobBody) => api.importJob(b), {
    invalidate: [['applications'], ['overview']],
    success: 'Job imported and analysed',
    onSuccess: onDone,
  });

  const set = <K extends keyof ImportJobBody>(k: K, v: ImportJobBody[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const body: ImportJobBody = { url: form.url.trim(), title: form.title.trim(), company: form.company.trim(), description: form.description };
    for (const k of ['location', 'salaryText', 'employmentType', 'hoursText', 'closingDate'] as const) {
      const v = form[k]?.trim();
      if (v) body[k] = v;
    }
    importManual.mutate(body);
  };

  const manualValid = form.url.trim() && form.title.trim() && form.company.trim() && form.description.trim();

  return (
    <>
      <PageHeader
        title="Import a job"
        description="Found something yourself? Import it and the agent will deduplicate, classify, check eligibility, score it and queue it if it qualifies."
      />

      {lastResult && !lastResult.application && (
        <Callout tone="amber" className="mb-6">
          <b>{lastResult.job.title}</b> at {lastResult.job.company} was imported, but no application was created (it may be a duplicate or
          didn't qualify).
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="From a URL" subtitle="Greenhouse and Lever public job pages are supported">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) importUrl.mutate(url.trim());
            }}
          >
            <Field label="Job URL">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <input
                  className="input pl-9"
                  type="url"
                  placeholder="https://boards.greenhouse.io/company/jobs/123"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </Field>
            <Button type="submit" variant="primary" loading={importUrl.isPending} disabled={!url.trim()}>
              Import from URL
            </Button>
          </form>
        </Card>

        <Card title="Manual import" subtitle="Paste the details from any job posting">
          <form className="space-y-3" onSubmit={submitManual}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Job URL *" className="sm:col-span-2">
                <input className="input" type="url" required value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Title *">
                <input className="input" required value={form.title} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field label="Company *">
                <input className="input" required value={form.company} onChange={(e) => set('company', e.target.value)} />
              </Field>
              <Field label="Location">
                <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="London / Remote" />
              </Field>
              <Field label="Employment type">
                <Select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
                  <option value="">Not specified</option>
                  {EMPLOYMENT_TYPES.filter((t) => t !== 'UNKNOWN').map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Salary">
                <input className="input" value={form.salaryText} onChange={(e) => set('salaryText', e.target.value)} placeholder="£32,000 – £38,000" />
              </Field>
              <Field label="Hours">
                <input className="input" value={form.hoursText} onChange={(e) => set('hoursText', e.target.value)} placeholder="20 hours/week, evenings" />
              </Field>
              <Field label="Closing date">
                <input className="input" type="date" value={form.closingDate} onChange={(e) => set('closingDate', e.target.value)} />
              </Field>
              <Field label="Description *" className="sm:col-span-2">
                <textarea
                  className="input min-h-48 font-normal"
                  required
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Paste the full job description, including requirements"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setForm(EMPTY)}>
                Reset
              </Button>
              <Button type="submit" variant="primary" icon={<PlusCircle className="size-4" />} loading={importManual.isPending} disabled={!manualValid}>
                Import & analyse
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
