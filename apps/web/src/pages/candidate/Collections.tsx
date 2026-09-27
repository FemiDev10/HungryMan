import { useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import type { Candidate, Certification, Education, Employment, Evidence, Project, Skill } from '../../api/types';
import { Badge, Callout, Chips, Select } from '../../components/ui';
import { CATEGORY_LABELS, EMPLOYMENT_TYPES, EVIDENCE_KINDS, humanize } from '../../lib/labels';
import { fmtDate } from '../../lib/format';
import { CollectionTab, type FieldDef } from './CollectionTab';

function dateRange(start: string | null, end: string | null, ongoing?: boolean) {
  if (!start && !end) return ongoing ? 'Ongoing' : null;
  return `${start ? fmtDate(start) : '?'} – ${ongoing ? 'present' : end ? fmtDate(end) : '?'}`;
}

function CategoryChips({ cats }: { cats: string[] }) {
  if (!cats?.length) return null;
  return <Chips items={cats.map((c) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c)} tone="blue" />;
}

// ───────────── Education ─────────────

const educationFields: FieldDef[] = [
  { key: 'institution', label: 'Institution', type: 'text', required: true },
  { key: 'qualification', label: 'Qualification', type: 'text', required: true, placeholder: 'MSc, BA (Hons), A-levels…' },
  { key: 'field', label: 'Field of study', type: 'text' },
  { key: 'grade', label: 'Grade', type: 'text' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'inProgress', label: 'In progress', type: 'bool', description: 'Currently studying' },
  { key: 'highlights', label: 'Highlights', type: 'tags', placeholder: 'Dissertation topic, modules, awards…' },
];

export function EducationTab({ c }: { c: Candidate }) {
  return (
    <CollectionTab<Education>
      col="education"
      title="Education"
      singular="Education"
      items={c.education}
      fields={educationFields}
      render={(e) => (
        <div>
          <div className="font-medium text-fg">
            {e.qualification}
            {e.field ? `, ${e.field}` : ''}
          </div>
          <div className="text-sm text-muted">
            {e.institution}
            {e.location ? ` · ${e.location}` : ''}
            {e.grade ? ` · ${e.grade}` : ''}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
            {dateRange(e.startDate, e.endDate, e.inProgress)}
            {e.inProgress && <Badge tone="blue">In progress</Badge>}
          </div>
          {e.highlights?.length > 0 && <div className="mt-2"><Chips items={e.highlights} /></div>}
        </div>
      )}
    />
  );
}

// ───────────── Employment ─────────────

const employmentFields: FieldDef[] = [
  { key: 'title', label: 'Job title', type: 'text', required: true },
  { key: 'employer', label: 'Employer', type: 'text', required: true },
  { key: 'location', label: 'Location', type: 'text' },
  {
    key: 'employmentType',
    label: 'Employment type',
    type: 'select',
    options: [...EMPLOYMENT_TYPES].reverse().map((t) => ({ value: t, label: t === 'UNKNOWN' ? 'Not specified' : humanize(t) })),
  },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'current', label: 'Current role', type: 'bool', description: 'I still work here' },
  { key: 'description', label: 'Description', type: 'textarea', hint: 'Context only — CV bullets come from Evidence items linked to this role.' },
  { key: 'tags', label: 'Tags', type: 'tags', placeholder: 'fintech, saas, customer-facing…' },
  { key: 'categories', label: 'Relevant job categories', type: 'categories' },
];

export function EmploymentTab({ c }: { c: Candidate }) {
  return (
    <CollectionTab<Employment>
      col="employment"
      title="Employment"
      singular="Role"
      items={c.employment}
      fields={employmentFields}
      sort={(a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || (b.startDate ?? '').localeCompare(a.startDate ?? '')}
      render={(e) => {
        const ev = c.evidence.filter((x) => x.employmentId === e.id).length;
        return (
          <div>
            <div className="font-medium text-fg">{e.title}</div>
            <div className="text-sm text-muted">
              {e.employer}
              {e.location ? ` · ${e.location}` : ''}
              {e.employmentType && e.employmentType !== 'UNKNOWN' ? ` · ${humanize(e.employmentType)}` : ''}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
              {dateRange(e.startDate, e.endDate, e.current)}
              <span>· {ev} evidence item{ev === 1 ? '' : 's'}</span>
            </div>
            {e.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{e.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              <CategoryChips cats={e.categories} />
              {e.tags?.length > 0 && <Chips items={e.tags} />}
            </div>
          </div>
        );
      }}
    />
  );
}

// ───────────── Projects ─────────────

const projectFields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'role', label: 'Your role', type: 'text' },
  { key: 'url', label: 'URL', type: 'url' },
  { key: 'shipped', label: 'Shipped', type: 'bool', description: 'Released to real users' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'tags', label: 'Tags', type: 'tags' },
  { key: 'categories', label: 'Relevant job categories', type: 'categories' },
];

export function ProjectsTab({ c }: { c: Candidate }) {
  return (
    <CollectionTab<Project>
      col="projects"
      title="Projects"
      singular="Project"
      items={c.projects}
      fields={projectFields}
      render={(p) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">{p.name}</span>
            {p.shipped && <Badge tone="green">Shipped</Badge>}
            {p.url && (
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-subtle hover:text-fg" aria-label="Open project">
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
          <div className="text-sm text-muted">
            {p.role ?? '—'}
            {dateRange(p.startDate, p.endDate) ? ` · ${dateRange(p.startDate, p.endDate)}` : ''}
          </div>
          {p.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{p.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            <CategoryChips cats={p.categories} />
            {p.tags?.length > 0 && <Chips items={p.tags} />}
          </div>
        </div>
      )}
    />
  );
}

// ───────────── Skills ─────────────

const skillFields: FieldDef[] = [
  { key: 'name', label: 'Skill', type: 'text', required: true },
  { key: 'level', label: 'Level', type: 'text', placeholder: 'Advanced, Working knowledge…' },
  { key: 'years', label: 'Years', type: 'number' },
  { key: 'aliases', label: 'Aliases', type: 'tags', placeholder: 'Other names ATS might use' },
  { key: 'categories', label: 'Relevant job categories', type: 'categories' },
];

export function SkillsTab({ c }: { c: Candidate }) {
  return (
    <CollectionTab<Skill>
      col="skills"
      title="Skills"
      singular="Skill"
      items={c.skills}
      fields={skillFields}
      sort={(a, b) => a.name.localeCompare(b.name)}
      render={(s) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">{s.name}</span>
            {s.level && <Badge tone="slate">{s.level}</Badge>}
            {s.years != null && <span className="text-xs text-subtle">{s.years} yrs</span>}
          </div>
          {s.aliases?.length > 0 && <div className="mt-0.5 text-xs text-subtle">aka {s.aliases.join(', ')}</div>}
          <div className="mt-1.5">
            <CategoryChips cats={s.categories} />
          </div>
        </div>
      )}
    />
  );
}

// ───────────── Certifications ─────────────

const certFields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'issuer', label: 'Issuer', type: 'text' },
  { key: 'issuedAt', label: 'Issued', type: 'date' },
  { key: 'expiresAt', label: 'Expires', type: 'date' },
  { key: 'credentialId', label: 'Credential ID', type: 'text' },
  { key: 'url', label: 'Verification URL', type: 'url' },
  { key: 'categories', label: 'Relevant job categories', type: 'categories' },
];

export function CertificationsTab({ c }: { c: Candidate }) {
  return (
    <CollectionTab<Certification>
      col="certifications"
      title="Certifications"
      singular="Certification"
      items={c.certifications}
      fields={certFields}
      render={(x) => {
        const expired = x.expiresAt && new Date(x.expiresAt).getTime() < Date.now();
        return (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">{x.name}</span>
              {expired && <Badge tone="red">Expired</Badge>}
            </div>
            <div className="text-sm text-muted">
              {x.issuer ?? '—'}
              {x.issuedAt ? ` · issued ${fmtDate(x.issuedAt)}` : ''}
              {x.expiresAt ? ` · expires ${fmtDate(x.expiresAt)}` : ''}
            </div>
            {x.credentialId && <div className="font-mono text-xs text-subtle">{x.credentialId}</div>}
            <div className="mt-1.5">
              <CategoryChips cats={x.categories} />
            </div>
          </div>
        );
      }}
    />
  );
}

// ───────────── Evidence ─────────────

export function EvidenceTab({ c }: { c: Candidate }) {
  const [kind, setKind] = useState('');
  const employmentOptions = [
    { value: '', label: 'Not linked' },
    ...c.employment.map((e) => ({ value: e.id, label: `${e.title} — ${e.employer}` })),
  ];
  const projectOptions = [{ value: '', label: 'Not linked' }, ...c.projects.map((p) => ({ value: p.id, label: p.name }))];

  const fields: FieldDef[] = [
    { key: 'claim', label: 'Claim', type: 'textarea', required: true, hint: 'The exact wording that may appear on a CV or in an answer. Keep it factual and specific.' },
    { key: 'kind', label: 'Kind', type: 'select', options: EVIDENCE_KINDS.map((k) => ({ value: k, label: humanize(k) })) },
    { key: 'source', label: 'Source / proof', type: 'text', required: true, placeholder: 'Payslip, portfolio case study, reference from…' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'employmentId', label: 'Linked role', type: 'select', options: employmentOptions },
    { key: 'projectId', label: 'Linked project', type: 'select', options: projectOptions },
    { key: 'allowedForCV', label: 'Allowed on CVs', type: 'bool', description: 'May appear in generated CVs' },
    { key: 'allowedForApplication', label: 'Allowed in applications', type: 'bool', description: 'May be used in form answers & cover letters' },
    { key: 'categories', label: 'Relevant categories', type: 'categories', hint: 'Leave empty to make it relevant to all categories.' },
    { key: 'tags', label: 'Tags', type: 'tags' },
  ];

  const empName = (id: string | null) => {
    const e = c.employment.find((x) => x.id === id);
    return e ? `${e.title} — ${e.employer}` : null;
  };
  const projName = (id: string | null) => c.projects.find((x) => x.id === id)?.name ?? null;

  return (
    <CollectionTab<Evidence>
      col="evidence"
      title="Evidence"
      singular="Evidence"
      items={c.evidence}
      fields={fields}
      sort={(a, b) => (b.date ?? b.createdAt ?? '').localeCompare(a.date ?? a.createdAt ?? '')}
      banner={
        <Callout tone="green" icon={<ShieldCheck className="size-4" />}>
          <b>Every CV claim must come from here.</b> Generated CVs, cover letters and answers may only state facts backed by an evidence
          item, and each bullet cites its evidence id. If something isn't recorded here, the agent won't claim it — it will answer
          “UNKNOWN” or ask you instead.
        </Callout>
      }
      filterBar={(setPredicate) => (
        <Select
          className="w-auto"
          value={kind}
          onChange={(e) => {
            const k = e.target.value;
            setKind(k);
            setPredicate(k ? (x) => x.kind === k : null);
          }}
        >
          <option value="">All kinds</option>
          {EVIDENCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {humanize(k)}
            </option>
          ))}
        </Select>
      )}
      render={(e) => (
        <div>
          <p className="text-sm leading-relaxed text-fg">{e.claim}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
            <Badge tone="slate">{humanize(e.kind)}</Badge>
            <span>Source: {e.source}</span>
            {e.date && <span>· {fmtDate(e.date)}</span>}
            {empName(e.employmentId) && <span>· {empName(e.employmentId)}</span>}
            {projName(e.projectId) && <span>· {projName(e.projectId)}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge tone={e.allowedForCV ? 'green' : 'grey'}>{e.allowedForCV ? 'CV ✓' : 'Not on CV'}</Badge>
            <Badge tone={e.allowedForApplication ? 'green' : 'grey'}>{e.allowedForApplication ? 'Applications ✓' : 'Not in applications'}</Badge>
            <CategoryChips cats={e.categories} />
            {e.tags?.length > 0 && <Chips items={e.tags} />}
          </div>
          <div className="mt-1 font-mono text-[10px] text-subtle">{e.id}</div>
        </div>
      )}
    />
  );
}
