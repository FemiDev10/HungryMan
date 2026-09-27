import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { Tabs } from '../../components/Tabs';
import { Badge, Callout, ErrorBox, LoadingBlock, PageHeader } from '../../components/ui';
import type { CandidateCollection } from '../../api/types';
import { draftCount, DraftsBanner, totalDrafts, useCvImport } from './CvImport';
import { useCandidate } from '../../lib/hooks';
import { CertificationsTab, EducationTab, EmploymentTab, EvidenceTab, ProjectsTab, SkillsTab } from './Collections';
import { PersonalTab } from './PersonalTab';
import { WorkAuthTab } from './WorkAuthTab';

type TabId = 'personal' | 'work' | 'education' | 'employment' | 'projects' | 'skills' | 'certifications' | 'evidence';

export function CandidatePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'personal';
  const q = useCandidate();
  const c = q.data;
  const notFound = q.error instanceof ApiError && q.error.status === 404;

  const [importNonce, setImportNonce] = useState(0);
  const drafts = totalDrafts(c);
  const cvImport = useCvImport(() => setImportNonce((n) => n + 1));
  const colTab = (id: CandidateCollection, label: string): { id: TabId; label: ReactNode; count?: number } => {
    const n = draftCount(c, id);
    return {
      id,
      label: n ? (
        <>
          {label}
          <span title={`${n} draft${n === 1 ? '' : 's'} to review`}>
            <Badge tone="amber">{n} draft{n === 1 ? '' : 's'}</Badge>
          </span>
        </>
      ) : (
        label
      ),
      count: c?.[id].length,
    };
  };

  const setTab = (t: TabId) => setParams(t === 'personal' ? {} : { tab: t }, { replace: true });

  return (
    <>
      <PageHeader
        title="Candidate profile"
        description="Your master record — the single source of truth. CVs, cover letters and answers are generated from this, never the other way round."
        actions={cvImport.button}
      />
      {cvImport.panel}
      <DraftsBanner count={drafts} />
      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'personal', label: 'Personal' },
          { id: 'work', label: 'Work authorisation' },
          colTab('education', 'Education'),
          colTab('employment', 'Employment'),
          colTab('projects', 'Projects'),
          colTab('skills', 'Skills'),
          colTab('certifications', 'Certifications'),
          colTab('evidence', 'Evidence'),
        ]}
      />
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error && !notFound ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : !c ? (
        <div className="space-y-4">
          <Callout tone="blue">No candidate profile exists yet. Fill in your personal details to create one.</Callout>
          <PersonalTab c={undefined} />
        </div>
      ) : (
        <div key={tab}>
          {tab === 'personal' && <PersonalTab key={`${c.id}:${importNonce}`} c={c} />}
          {tab === 'work' && <WorkAuthTab key={c.workAuthorisation?.updatedAt ?? 'new'} wa={c.workAuthorisation} />}
          {tab === 'education' && <EducationTab c={c} />}
          {tab === 'employment' && <EmploymentTab c={c} />}
          {tab === 'projects' && <ProjectsTab c={c} />}
          {tab === 'skills' && <SkillsTab c={c} />}
          {tab === 'certifications' && <CertificationsTab c={c} />}
          {tab === 'evidence' && <EvidenceTab c={c} />}
        </div>
      )}
    </>
  );
}
