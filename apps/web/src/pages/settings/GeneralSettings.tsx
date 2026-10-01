import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { ScheduleAction, ScheduleEntry, SearchCriteriaTrack, Settings } from '../../api/types';
import { AgentStateBadge } from '../../components/StatusBadge';
import { TagInput } from '../../components/TagInput';
import { Button, Card, Field, Select, Toggle } from '../../components/ui';
import { useAction, useMeta } from '../../lib/hooks';
import { humanize, SCHEDULE_ACTIONS } from '../../lib/labels';

const TIMEZONES = ['Europe/London', 'UTC', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'Africa/Lagos'];

const ACTION_HINT: Record<ScheduleAction, string> = {
  DISCOVER: 'Search all enabled sources for new jobs',
  ANALYSE: 'Classify, check eligibility and score new jobs',
  PREPARE: 'Generate CVs, cover letters and answers for queued jobs',
  EXECUTE: 'Hand prepared applications to the browser agent',
  FULL_CYCLE: 'Discover → analyse → prepare → execute',
};

function NumberField({ label, value, onChange, hint, min = 0, max }: { label: string; value: number; onChange: (n: number) => void; hint?: string; min?: number; max?: number }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={min} max={max} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function CriteriaEditor({ title, value, onChange, remote }: { title: string; value: SearchCriteriaTrack; onChange: (v: SearchCriteriaTrack) => void; remote?: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <div className="text-sm font-medium">{title}</div>
      <Field label="Keywords">
        <TagInput value={value.keywords ?? []} onChange={(keywords) => onChange({ ...value, keywords })} placeholder="product designer, ux designer…" />
      </Field>
      <Field label="Locations">
        <TagInput value={value.locations ?? []} onChange={(locations) => onChange({ ...value, locations })} placeholder="London, Remote…" />
      </Field>
      {remote && <Toggle checked={!!value.remoteOnly} onChange={(remoteOnly) => onChange({ ...value, remoteOnly })} label="Remote only" />}
    </div>
  );
}

export function GeneralSettings({ s }: { s: Settings }) {
  const meta = useMeta();
  const [f, setF] = useState<Settings>(() => ({
    ...s,
    schedule: Array.isArray(s.schedule) ? s.schedule : [],
    searchCriteria: {
      professional: { keywords: [], locations: [], remoteOnly: false, ...(s.searchCriteria?.professional ?? {}) },
      general: { keywords: [], locations: [], ...(s.searchCriteria?.general ?? {}) },
    },
  }));
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF((x) => ({ ...x, [k]: v }));
  const setSched = (i: number, patch: Partial<ScheduleEntry>) => set('schedule', f.schedule.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const save = useAction(
    () =>
      api.updateSettings({
        professionalPerDay: f.professionalPerDay,
        generalPerDay: f.generalPerDay,
        maxPerDay: f.maxPerDay,
        minMatchProfessional: f.minMatchProfessional,
        minMatchGeneral: f.minMatchGeneral,
        autoSubmit: f.autoSubmit,
        defaultBrowserAgent: f.defaultBrowserAgent,
        schedule: [...f.schedule].filter((e) => /^\d{2}:\d{2}$/.test(e.time)).sort((a, b) => a.time.localeCompare(b.time)),
        timezone: f.timezone,
        searchCriteria: f.searchCriteria,
        termTimeOverride: f.termTimeOverride,
        reviewFirstN: f.reviewFirstN,
        monthlyIncomeGoal: f.monthlyIncomeGoal,
        outreachEmailsPerDay: f.outreachEmailsPerDay,
      }),
    { invalidate: [['settings'], ['overview'], ['checklist']], success: 'Settings saved' },
  );

  const agents = Array.from(new Set([...(meta.data?.integrations.browserAgents ?? []), f.defaultBrowserAgent].filter(Boolean)));
  const tzs = Array.from(new Set([f.timezone, ...TIMEZONES]));
  const overCap = f.professionalPerDay + f.generalPerDay > f.maxPerDay;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Card title="Agent" actions={<AgentStateBadge state={s.agentState} />} subtitle="Use the controls on the Overview page to run, pause or stop the agent.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Professional applications / day" value={f.professionalPerDay} onChange={(n) => set('professionalPerDay', n)} />
          <NumberField label="General-work applications / day" value={f.generalPerDay} onChange={(n) => set('generalPerDay', n)} />
          <NumberField
            label="Hard cap / day"
            value={f.maxPerDay}
            onChange={(n) => set('maxPerDay', n)}
            hint={overCap ? 'Track targets exceed the cap — the cap wins.' : 'Total across both tracks.'}
          />
          <NumberField label="Min match — professional" value={f.minMatchProfessional} onChange={(n) => set('minMatchProfessional', n)} max={100} hint="0–100" />
          <NumberField label="Min match — general work" value={f.minMatchGeneral} onChange={(n) => set('minMatchGeneral', n)} max={100} hint="0–100" />
          <Field label="Default browser agent">
            <Select value={f.defaultBrowserAgent} onChange={(e) => set('defaultBrowserAgent', e.target.value)}>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <NumberField
            label="Warm-up: first N applications stop before submit for your review"
            value={f.reviewFirstN}
            onChange={(n) => set('reviewFirstN', n)}
            max={50}
            hint="They appear under Exceptions as “Review before submit”. 0 turns warm-up off."
          />
          <NumberField label="Cold emails per day" value={f.outreachEmailsPerDay} onChange={(n) => set('outreachEmailsPerDay', n)} max={30} hint="Written as drafts in your Gmail by the daily run; you press send. 0 turns outreach off." />
          <Field label="Monthly income goal (£)" hint="Target from part-time general work, before tax. Shown on the Overview.">
            <input
              className="input"
              type="number"
              min={0}
              step={50}
              value={Number.isFinite(f.monthlyIncomeGoal) ? f.monthlyIncomeGoal : ''}
              onChange={(e) => set('monthlyIncomeGoal', Number(e.target.value))}
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Toggle
              checked={f.autoSubmit}
              onChange={(v) => set('autoSubmit', v)}
              label="Auto-submit applications"
              description="When off, the browser agent fills forms but stops before the final submit and flags the application for you."
            />
          </div>
        </div>
      </Card>

      <Card
        title="Schedule"
        subtitle="Times are in the selected timezone"
        actions={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set('schedule', [...f.schedule, { time: '09:00', action: 'FULL_CYCLE' }])}>
            Add run
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Timezone" className="max-w-xs">
            <Select value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {tzs.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          {f.schedule.length === 0 ? (
            <p className="text-sm text-muted">No scheduled runs. The agent will only act when you press “Run now”.</p>
          ) : (
            <ul className="space-y-2">
              {f.schedule.map((e, i) => (
                <li key={i} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2">
                  <input className="input font-mono" type="time" value={e.time} onChange={(ev) => setSched(i, { time: ev.target.value })} />
                  <Select value={e.action} onChange={(ev) => setSched(i, { action: ev.target.value as ScheduleAction })} title={ACTION_HINT[e.action]}>
                    {SCHEDULE_ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {humanize(a)} — {ACTION_HINT[a]}
                      </option>
                    ))}
                  </Select>
                  <Button variant="ghost" aria-label="Remove" onClick={() => set('schedule', f.schedule.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Search criteria">
        <div className="grid gap-4 lg:grid-cols-2">
          <CriteriaEditor
            title="Professional track"
            remote
            value={f.searchCriteria.professional ?? { keywords: [], locations: [] }}
            onChange={(v) => set('searchCriteria', { ...f.searchCriteria, professional: v })}
          />
          <CriteriaEditor
            title="General-work track"
            value={f.searchCriteria.general ?? { keywords: [], locations: [] }}
            onChange={(v) => set('searchCriteria', { ...f.searchCriteria, general: v })}
          />
        </div>
      </Card>

      <Card title="Term-time override" subtitle="Normally term/vacation is worked out from your vacation periods. Override it here if needed.">
        <div className="flex flex-wrap gap-2">
          {([
            [null, 'Automatic'],
            ['TERM', 'Force term time'],
            ['VACATION', 'Force vacation'],
          ] as const).map(([v, label]) => (
            <Button key={label} variant={f.termTimeOverride === v ? 'primary' : 'secondary'} onClick={() => set('termTimeOverride', v)}>
              {label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" variant="primary" loading={save.isPending} className="shadow-lg">
          Save settings
        </Button>
      </div>
    </form>
  );
}
