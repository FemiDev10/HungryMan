import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { Availability, Candidate, CandidateLink, Preferences } from '../../api/types';
import { MultiSelect } from '../../components/MultiSelect';
import { TagInput } from '../../components/TagInput';
import { Button, Card, Field, Toggle } from '../../components/ui';
import { useAction } from '../../lib/hooks';
import { nullIfEmpty, numOrNull, toDateInput } from '../../lib/format';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SHIFTS = ['Morning', 'Afternoon', 'Evening', 'Night', 'Weekend'] as const;
const REMOTE = ['REMOTE', 'HYBRID', 'ONSITE'] as const;

interface Form {
  fullName: string;
  email: string;
  phone: string;
  headline: string;
  addressLine: string;
  city: string;
  postcode: string;
  country: string;
  willingToRelocate: boolean;
  maxCommuteMinutes: string;
  links: CandidateLink[];
  availability: { startDate: string; noticePeriod: string; daysAvailable: string[]; shiftsAvailable: string[]; notes: string };
  preferences: { minSalaryProfessional: string; minHourlyGeneral: string; remoteTypes: string[]; locations: string[]; excludedCompanies: string[] };
}

function fromCandidate(c: Partial<Candidate> | undefined): Form {
  const av: Availability = c?.availability ?? {};
  const pr: Preferences = c?.preferences ?? {};
  return {
    fullName: c?.fullName ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    headline: c?.headline ?? '',
    addressLine: c?.addressLine ?? '',
    city: c?.city ?? '',
    postcode: c?.postcode ?? '',
    country: c?.country ?? 'United Kingdom',
    willingToRelocate: c?.willingToRelocate ?? false,
    maxCommuteMinutes: c?.maxCommuteMinutes != null ? String(c.maxCommuteMinutes) : '',
    links: Array.isArray(c?.links) ? c!.links : [],
    availability: {
      startDate: toDateInput(av.startDate ?? null),
      noticePeriod: av.noticePeriod ?? '',
      daysAvailable: av.daysAvailable ?? [],
      shiftsAvailable: av.shiftsAvailable ?? [],
      notes: av.notes ?? '',
    },
    preferences: {
      minSalaryProfessional: pr.minSalaryProfessional != null ? String(pr.minSalaryProfessional) : '',
      minHourlyGeneral: pr.minHourlyGeneral != null ? String(pr.minHourlyGeneral) : '',
      remoteTypes: pr.remoteTypes ?? [],
      locations: pr.locations ?? [],
      excludedCompanies: pr.excludedCompanies ?? [],
    },
  };
}

export function PersonalTab({ c }: { c: Candidate | undefined }) {
  const [f, setF] = useState<Form>(() => fromCandidate(c));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const setAv = <K extends keyof Form['availability']>(k: K, v: Form['availability'][K]) =>
    setF((s) => ({ ...s, availability: { ...s.availability, [k]: v } }));
  const setPr = <K extends keyof Form['preferences']>(k: K, v: Form['preferences'][K]) =>
    setF((s) => ({ ...s, preferences: { ...s.preferences, [k]: v } }));

  const save = useAction(
    () =>
      api.updateCandidate({
        fullName: f.fullName.trim(),
        email: nullIfEmpty(f.email),
        phone: nullIfEmpty(f.phone),
        headline: nullIfEmpty(f.headline),
        addressLine: nullIfEmpty(f.addressLine),
        city: nullIfEmpty(f.city),
        postcode: nullIfEmpty(f.postcode),
        country: nullIfEmpty(f.country),
        willingToRelocate: f.willingToRelocate,
        maxCommuteMinutes: numOrNull(f.maxCommuteMinutes),
        links: f.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() })),
        availability: {
          startDate: f.availability.startDate || undefined,
          noticePeriod: f.availability.noticePeriod.trim() || undefined,
          daysAvailable: f.availability.daysAvailable,
          shiftsAvailable: f.availability.shiftsAvailable,
          notes: f.availability.notes.trim() || undefined,
        },
        preferences: {
          minSalaryProfessional: numOrNull(f.preferences.minSalaryProfessional) ?? undefined,
          minHourlyGeneral: numOrNull(f.preferences.minHourlyGeneral) ?? undefined,
          remoteTypes: f.preferences.remoteTypes,
          locations: f.preferences.locations,
          excludedCompanies: f.preferences.excludedCompanies,
        },
      }),
    { invalidate: [['candidate']], success: 'Profile saved' },
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Card title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *">
            <input className="input" required value={f.fullName} onChange={(e) => set('fullName', e.target.value)} />
          </Field>
          <Field label="Headline">
            <input className="input" value={f.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Product designer & frontend developer" />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Address line" className="sm:col-span-2">
            <input className="input" value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} />
          </Field>
          <Field label="City">
            <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Postcode">
            <input className="input" value={f.postcode} onChange={(e) => set('postcode', e.target.value)} />
          </Field>
          <Field label="Country">
            <input className="input" value={f.country} onChange={(e) => set('country', e.target.value)} />
          </Field>
          <Field label="Max commute (minutes)">
            <input className="input" type="number" min={0} value={f.maxCommuteMinutes} onChange={(e) => set('maxCommuteMinutes', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Toggle checked={f.willingToRelocate} onChange={(v) => set('willingToRelocate', v)} label="Willing to relocate" />
          </div>
        </div>
      </Card>

      <Card
        title="Links"
        subtitle="Portfolio, LinkedIn, GitHub and other professional profiles"
        actions={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set('links', [...f.links, { label: '', url: '' }])}>
            Add link
          </Button>
        }
      >
        {f.links.length === 0 ? (
          <p className="text-sm text-muted">No links yet.</p>
        ) : (
          <div className="space-y-2">
            {f.links.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[12rem_1fr_auto]">
                <input
                  className="input col-span-2 sm:col-span-1"
                  placeholder="Label (e.g. Portfolio)"
                  value={l.label}
                  onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="input"
                  type="url"
                  placeholder="https://"
                  value={l.url}
                  onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                <Button variant="ghost" aria-label="Remove link" onClick={() => set('links', f.links.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Availability">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Earliest start date">
            <input className="input" type="date" value={f.availability.startDate} onChange={(e) => setAv('startDate', e.target.value)} />
          </Field>
          <Field label="Notice period">
            <input className="input" value={f.availability.noticePeriod} onChange={(e) => setAv('noticePeriod', e.target.value)} placeholder="Immediate / 2 weeks / 1 month" />
          </Field>
          <Field label="Days available" className="sm:col-span-2">
            <MultiSelect options={DAYS} value={f.availability.daysAvailable as (typeof DAYS)[number][]} onChange={(v) => setAv('daysAvailable', v)} />
          </Field>
          <Field label="Shifts available" className="sm:col-span-2">
            <MultiSelect options={SHIFTS} value={f.availability.shiftsAvailable as (typeof SHIFTS)[number][]} onChange={(v) => setAv('shiftsAvailable', v)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea className="input min-h-20" value={f.availability.notes} onChange={(e) => setAv('notes', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Preferences">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum salary — professional (£/year)">
            <input className="input" type="number" min={0} value={f.preferences.minSalaryProfessional} onChange={(e) => setPr('minSalaryProfessional', e.target.value)} />
          </Field>
          <Field label="Minimum hourly rate — general work (£/hour)">
            <input className="input" type="number" min={0} step="0.01" value={f.preferences.minHourlyGeneral} onChange={(e) => setPr('minHourlyGeneral', e.target.value)} />
          </Field>
          <Field label="Work arrangements" className="sm:col-span-2">
            <MultiSelect
              options={REMOTE}
              labels={{ REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'On-site' }}
              value={f.preferences.remoteTypes as (typeof REMOTE)[number][]}
              onChange={(v) => setPr('remoteTypes', v)}
            />
          </Field>
          <Field label="Preferred locations" className="sm:col-span-2">
            <TagInput value={f.preferences.locations} onChange={(v) => setPr('locations', v)} placeholder="London, Manchester…" />
          </Field>
          <Field label="Excluded companies" className="sm:col-span-2" hint="The agent will never apply to these.">
            <TagInput value={f.preferences.excludedCompanies} onChange={(v) => setPr('excludedCompanies', v)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!f.fullName.trim()} className="shadow-lg">
          Save personal details
        </Button>
      </div>
    </form>
  );
}
