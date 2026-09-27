import { useState } from 'react';
import { ExternalLink, Landmark, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { VacationPeriod, WorkAuthorisation } from '../../api/types';
import { TagInput } from '../../components/TagInput';
import { Button, Callout, Card, Field, Toggle } from '../../components/ui';
import { useAction } from '../../lib/hooks';
import { fmtDate, nullIfEmpty, numOrNull, toDateInput } from '../../lib/format';

interface Form {
  visaType: string;
  hasRightToWork: boolean;
  termTimeHoursLimit: string;
  vacationWorkAllowed: boolean;
  fullTimeRestrictions: string;
  sponsorshipRequired: boolean;
  courseStart: string;
  courseEnd: string;
  visaExpiry: string;
  vacationPeriods: VacationPeriod[];
  knownRestrictions: string[];
  seekingSponsoredRoleAfterCourse: boolean;
  sponsoredRoleMinSalary: string;
  guidanceVerifiedAt: string;
  notes: string;
}

function fromWA(w: WorkAuthorisation | null | undefined): Form {
  return {
    visaType: w?.visaType ?? '',
    hasRightToWork: w?.hasRightToWork ?? true,
    termTimeHoursLimit: w?.termTimeHoursLimit != null ? String(w.termTimeHoursLimit) : '',
    vacationWorkAllowed: w?.vacationWorkAllowed ?? true,
    fullTimeRestrictions: w?.fullTimeRestrictions ?? '',
    sponsorshipRequired: w?.sponsorshipRequired ?? false,
    courseStart: toDateInput(w?.courseStart),
    courseEnd: toDateInput(w?.courseEnd),
    visaExpiry: toDateInput(w?.visaExpiry),
    vacationPeriods: (w?.vacationPeriods ?? []).map((p) => ({ label: p.label ?? '', start: toDateInput(p.start), end: toDateInput(p.end) })),
    knownRestrictions: w?.knownRestrictions ?? [],
    seekingSponsoredRoleAfterCourse: w?.seekingSponsoredRoleAfterCourse ?? false,
    sponsoredRoleMinSalary: w?.sponsoredRoleMinSalary != null ? String(w.sponsoredRoleMinSalary) : '',
    guidanceVerifiedAt: toDateInput(w?.guidanceVerifiedAt),
    notes: w?.notes ?? '',
  };
}

const VISA_SUGGESTIONS = ['Student', 'Graduate', 'Skilled Worker', 'British citizen', 'Settled status', 'Pre-settled status', 'Dependant'];

export function WorkAuthTab({ wa }: { wa: WorkAuthorisation | null | undefined }) {
  const [f, setF] = useState<Form>(() => fromWA(wa));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const setPeriod = (i: number, patch: Partial<VacationPeriod>) =>
    set('vacationPeriods', f.vacationPeriods.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const save = useAction(
    () =>
      api.updateWorkAuth({
        visaType: f.visaType.trim(),
        hasRightToWork: f.hasRightToWork,
        termTimeHoursLimit: numOrNull(f.termTimeHoursLimit),
        vacationWorkAllowed: f.vacationWorkAllowed,
        fullTimeRestrictions: nullIfEmpty(f.fullTimeRestrictions),
        sponsorshipRequired: f.sponsorshipRequired,
        courseStart: f.courseStart || null,
        courseEnd: f.courseEnd || null,
        visaExpiry: f.visaExpiry || null,
        vacationPeriods: f.vacationPeriods.filter((p) => p.start && p.end).map((p) => ({ ...p, label: p.label.trim() })),
        knownRestrictions: f.knownRestrictions,
        seekingSponsoredRoleAfterCourse: f.seekingSponsoredRoleAfterCourse,
        sponsoredRoleMinSalary: numOrNull(f.sponsoredRoleMinSalary),
        guidanceVerifiedAt: f.guidanceVerifiedAt || null,
        notes: nullIfEmpty(f.notes),
      }),
    { invalidate: [['candidate'], ['checklist']], success: 'Work authorisation saved' },
  );

  const stale = !f.guidanceVerifiedAt || Date.now() - new Date(f.guidanceVerifiedAt).getTime() > 1000 * 60 * 60 * 24 * 180;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Callout tone="amber" icon={<Landmark className="size-4" />}>
        <p>
          Immigration rules change. The agent uses these settings to filter and flag jobs, but it is <b>not legal advice</b>. Verify your
          conditions — term-time hour limits, vacation dates, restrictions on permanent full-time roles and self-employment — against{' '}
          <a
            className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2"
            href="https://www.gov.uk/student-visa/work"
            target="_blank"
            rel="noopener noreferrer"
          >
            official gov.uk guidance <ExternalLink className="size-3" />
          </a>{' '}
          and your BRP/eVisa and university, then record the date you checked below.
        </p>
        {stale && <p className="mt-1.5 font-medium">{f.guidanceVerifiedAt ? `Last verified ${fmtDate(f.guidanceVerifiedAt)} — consider re-checking.` : 'Not yet verified.'}</p>}
      </Callout>

      <Card title="Status">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visa / immigration status *">
            <input className="input" list="visa-types" required value={f.visaType} onChange={(e) => set('visaType', e.target.value)} />
            <datalist id="visa-types">
              {VISA_SUGGESTIONS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
          <Field label="Visa expiry">
            <input className="input" type="date" value={f.visaExpiry} onChange={(e) => set('visaExpiry', e.target.value)} />
          </Field>
          <div className="space-y-3 sm:col-span-2">
            <Toggle checked={f.hasRightToWork} onChange={(v) => set('hasRightToWork', v)} label="I have the right to work in the UK" />
            <Toggle
              checked={f.sponsorshipRequired}
              onChange={(v) => set('sponsorshipRequired', v)}
              label="I require visa sponsorship"
              description="Jobs that explicitly don't sponsor will be marked not eligible."
            />
          </div>
        </div>
      </Card>

      <Card title="Study & working-hours conditions">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course start">
            <input className="input" type="date" value={f.courseStart} onChange={(e) => set('courseStart', e.target.value)} />
          </Field>
          <Field label="Course end" hint="Full-time applications will say you can start after this date.">
            <input className="input" type="date" value={f.courseEnd} onChange={(e) => set('courseEnd', e.target.value)} />
          </Field>
          <Field label="Term-time weekly hours limit" hint="Leave blank if no limit applies.">
            <input className="input" type="number" min={0} value={f.termTimeHoursLimit} onChange={(e) => set('termTimeHoursLimit', e.target.value)} />
          </Field>
          <div className="sm:pt-5">
            <Toggle checked={f.vacationWorkAllowed} onChange={(v) => set('vacationWorkAllowed', v)} label="Full-time work allowed during official vacations" />
          </div>
          <Field label="Restrictions on permanent full-time roles" className="sm:col-span-2">
            <textarea
              className="input min-h-20"
              value={f.fullTimeRestrictions}
              onChange={(e) => set('fullTimeRestrictions', e.target.value)}
              placeholder="e.g. Cannot fill a permanent full-time vacancy before course end date"
            />
          </Field>
          <Field label="Known restrictions" className="sm:col-span-2">
            <TagInput
              value={f.knownRestrictions}
              onChange={(v) => set('knownRestrictions', v)}
              placeholder="No self-employment, No professional sportsperson…"
              suggestions={['No self-employment', 'No permanent full-time role before course end', 'No work as a professional sportsperson', 'No work as an entertainer']}
            />
          </Field>
        </div>
      </Card>

      <Card title="After your course" subtitle="Student → Skilled Worker route">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Toggle
              checked={f.seekingSponsoredRoleAfterCourse}
              onChange={(v) => set('seekingSponsoredRoleAfterCourse', v)}
              label="I'm applying for full-time roles that start after my course ends, with Skilled Worker sponsorship"
              description="Full-time professional roles are then treated as starting after your course end date and need an employer that can sponsor. When off, they're checked against your term-time hours limit."
            />
          </div>
          {f.seekingSponsoredRoleAfterCourse && !f.courseEnd && (
            <Callout tone="amber" className="sm:col-span-2">
              Set your course end date above — it's the earliest start date the agent will give employers.
            </Callout>
          )}
          <Field
            label="Minimum salary for sponsored roles (£/year)"
            className="sm:col-span-2"
            hint={
              <>
                Check the current Skilled Worker salary rules on{' '}
                <a
                  className="inline-flex items-center gap-0.5 underline underline-offset-2"
                  href="https://www.gov.uk/skilled-worker-visa/your-job"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  gov.uk <ExternalLink className="size-3" />
                </a>{' '}
                (new-entrant rates can apply when switching from a Student visa). Leave blank to skip this check.
              </>
            }
          >
            <input
              className="input max-w-xs"
              type="number"
              min={0}
              step={100}
              disabled={!f.seekingSponsoredRoleAfterCourse}
              value={f.sponsoredRoleMinSalary}
              onChange={(e) => set('sponsoredRoleMinSalary', e.target.value)}
              placeholder="e.g. 30000"
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Official vacation periods"
        subtitle="Use your university's published vacation dates"
        actions={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set('vacationPeriods', [...f.vacationPeriods, { label: '', start: '', end: '' }])}>
            Add period
          </Button>
        }
      >
        {f.vacationPeriods.length === 0 ? (
          <p className="text-sm text-muted">No vacation periods recorded.</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_10rem_10rem_auto] gap-2 text-xs text-subtle sm:grid">
              <span>Label</span>
              <span>Start</span>
              <span>End</span>
              <span className="w-9" />
            </div>
            {f.vacationPeriods.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_10rem_10rem_auto] sm:border-0 sm:p-0">
                <input className="input col-span-2 sm:col-span-1" placeholder="Christmas vacation" value={p.label} onChange={(e) => setPeriod(i, { label: e.target.value })} />
                <input className="input" type="date" aria-label="Start" value={p.start} onChange={(e) => setPeriod(i, { start: e.target.value })} />
                <input className="input" type="date" aria-label="End" value={p.end} onChange={(e) => setPeriod(i, { end: e.target.value })} />
                <Button variant="ghost" className="col-span-2 sm:col-span-1" aria-label="Remove period" onClick={() => set('vacationPeriods', f.vacationPeriods.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Verification">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guidance last verified" hint="When you last checked these rules against official UK guidance.">
            <div className="flex gap-2">
              <input className="input" type="date" value={f.guidanceVerifiedAt} onChange={(e) => set('guidanceVerifiedAt', e.target.value)} />
              <Button onClick={() => set('guidanceVerifiedAt', new Date().toISOString().slice(0, 10))}>Today</Button>
            </div>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea className="input min-h-20" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!f.visaType.trim()} className="shadow-lg">
          Save work authorisation
        </Button>
      </div>
    </form>
  );
}
