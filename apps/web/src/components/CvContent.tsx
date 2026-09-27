import type { ReactNode } from 'react';
import { JsonBlock } from './ui';

/**
 * Renders a generated CV's structured content. The exact shape is produced by the
 * backend generator, so this is deliberately tolerant: it understands common shapes
 * (summary, skills, experience/employment with bullets, projects, education) where
 * text items may carry `evidenceIds`, and falls back to JSON for anything else.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null);

function evidenceOf(v: unknown): string[] {
  if (!isObj(v)) return [];
  const ids = v.evidenceIds ?? v.refs ?? v.evidence ?? v.evidenceId;
  if (Array.isArray(ids)) return ids.filter((x): x is string => typeof x === 'string');
  if (typeof ids === 'string') return [ids];
  return [];
}

function textOf(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (isObj(v)) return str(v.text) ?? str(v.claim) ?? str(v.content) ?? str(v.name) ?? str(v.value);
  return null;
}

function EvidenceTags({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => (
        <span key={id} className="rounded bg-emerald-500/10 px-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-300" title="Evidence id">
          {id}
        </span>
      ))}
    </span>
  );
}

function Claim({ v }: { v: unknown }) {
  const t = textOf(v);
  if (!t) return <JsonBlock value={v} />;
  return (
    <span>
      {t}
      <EvidenceTags ids={evidenceOf(v)} />
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{children}</h3>;
}

function dates(o: Obj): string | null {
  const d = str(o.dates) ?? str(o.period);
  if (d) return d;
  const s = str(o.startDate) ?? str(o.start) ?? str(o.issuedAt);
  const e = str(o.endDate) ?? str(o.end) ?? (o.current || o.inProgress ? 'present' : null);
  if (!s && !e) return null;
  const f = (x: string | null) => (x && /^\d{4}-\d{2}/.test(x) ? new Date(x).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : x);
  return `${f(s) ?? '?'} – ${f(e) ?? '?'}`;
}

function Entry({ o }: { o: Obj }) {
  const qual = str(o.qualification);
  const title =
    str(o.title) ?? str(o.name) ?? (qual ? [qual, str(o.field)].filter(Boolean).join(', ') : null) ?? str(o.role);
  const org =
    str(o.employer) ?? str(o.company) ?? str(o.institution) ?? str(o.organisation) ?? str(o.issuer) ?? (str(o.name) ? str(o.role) : null);
  const bullets = (o.bullets ?? o.highlights ?? o.achievements ?? o.points) as unknown;
  const d = dates(o);
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium text-fg">{title ?? '—'}</span>
          {org && <span className="text-muted"> · {org}</span>}
          <EvidenceTags ids={evidenceOf(o)} />
        </div>
        {d && <span className="text-xs text-subtle">{d}</span>}
      </div>
      {str(o.description) && <p className="mt-0.5 text-sm text-muted">{str(o.description)}</p>}
      {Array.isArray(bullets) && bullets.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
          {bullets.map((b, i) => (
            <li key={i}>
              <Claim v={b} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Skills({ v }: { v: unknown }) {
  if (!Array.isArray(v)) return <JsonBlock value={v} />;
  // grouped: [{category, items: []}]
  if (v.every((x) => isObj(x) && Array.isArray((x as Obj).items))) {
    return (
      <div className="space-y-1.5 text-sm">
        {v.map((g, i) => (
          <div key={i}>
            <span className="font-medium text-fg">{str((g as Obj).category) ?? str((g as Obj).name) ?? 'Skills'}: </span>
            <span className="text-muted">{((g as Obj).items as unknown[]).map((s) => textOf(s)).filter(Boolean).join(', ')}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {v.map((s, i) => (
        <span key={i} className="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-fg">
          <Claim v={s} />
        </span>
      ))}
    </div>
  );
}

const KNOWN = [
  'schemaVersion', 'profile', 'targetJob', 'header', 'name', 'headline', 'contact', 'summary', 'strengths',
  'skills', 'experience', 'employment', 'projects', 'education', 'certifications',
];

function Summary({ v }: { v: unknown }) {
  if (Array.isArray(v)) {
    return (
      <p className="text-sm leading-relaxed text-fg">
        {v.map((s, i) => (
          <span key={i}>
            <Claim v={s} />{' '}
          </span>
        ))}
      </p>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-fg">
      <Claim v={v} />
    </p>
  );
}

export function CvContent({ content }: { content: unknown }) {
  if (!isObj(content)) return <JsonBlock value={content} />;
  const c = content;
  const header = isObj(c.header) ? c.header : c;
  const name = str(header.name) ?? str(header.fullName);
  const headline = str(header.headline);
  const summary = c.summary ?? (typeof c.profile === 'string' ? c.profile : undefined);
  const contact = [str(header.email), str(header.phone), str(header.location)].filter(Boolean) as string[];
  const links = Array.isArray(header.links) ? (header.links as unknown[]).filter(isObj) : [];
  const target = isObj(c.targetJob) ? c.targetJob : null;
  const strengths = Array.isArray(c.strengths) ? c.strengths : [];
  const exp = (c.experience ?? c.employment) as unknown;
  const rest = Object.fromEntries(Object.entries(c).filter(([k]) => !KNOWN.includes(k)));

  const list = (title: string, v: unknown) =>
    Array.isArray(v) && v.length > 0 ? (
      <section>
        <SectionTitle>{title}</SectionTitle>
        {v.map((o, i) => (isObj(o) ? <Entry key={i} o={o} /> : <div key={i} className="text-sm text-muted"><Claim v={o} /></div>))}
      </section>
    ) : null;

  return (
    <div className="space-y-5 rounded-xl border border-line bg-surface p-5">
      {target && (
        <div className="text-xs text-subtle">
          Tailored for <span className="text-fg">{str(target.title)}</span>
          {str(target.company) ? ` at ${str(target.company)}` : ''}
        </div>
      )}
      {(name || headline) && (
        <div>
          {name && <div className="text-lg font-semibold text-fg">{name}</div>}
          {headline && <div className="text-sm text-muted">{headline}</div>}
          {(contact.length > 0 || links.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-subtle">
              {contact.map((x) => (
                <span key={x}>{x}</span>
              ))}
              {links.map((l, i) => (
                <span key={i}>{str(l.label) ?? str(l.url)}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {summary != null && (!Array.isArray(summary) || summary.length > 0) && (
        <section>
          <SectionTitle>Summary</SectionTitle>
          <Summary v={summary} />
        </section>
      )}
      {strengths.length > 0 && (
        <section>
          <SectionTitle>Key strengths</SectionTitle>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
            {strengths.map((b, i) => (
              <li key={i}>
                <Claim v={b} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {Array.isArray(c.skills) && c.skills.length > 0 && (
        <section>
          <SectionTitle>Skills</SectionTitle>
          <Skills v={c.skills} />
        </section>
      )}
      {list('Experience', exp)}
      {list('Projects', c.projects)}
      {list('Education', c.education)}
      {list('Certifications', c.certifications)}
      {Object.keys(rest).length > 0 && (
        <section>
          <SectionTitle>Other data</SectionTitle>
          <JsonBlock value={rest} />
        </section>
      )}
    </div>
  );
}
