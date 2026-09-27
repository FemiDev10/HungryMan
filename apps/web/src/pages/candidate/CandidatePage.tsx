import { useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { Tabs } from '../../components/Tabs';
import { Callout, ErrorBox, LoadingBlock, PageHeader } from '../../components/ui';
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

  const setTab = (t: TabId) => setParams(t === 'personal' ? {} : { tab: t }, { replace: true });

  return (
    <>
      <PageHeader
        title="Candidate profile"
        description="Your master record — the single source of truth. CVs, cover letters and answers are generated from this, never the other way round."
      />
      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'personal', label: 'Personal' },
          { id: 'work', label: 'Work authorisation' },
          { id: 'education', label: 'Education', count: c?.education.length },
          { id: 'employment', label: 'Employment', count: c?.employment.length },
          { id: 'projects', label: 'Projects', count: c?.projects.length },
          { id: 'skills', label: 'Skills', count: c?.skills.length },
          { id: 'certifications', label: 'Certifications', count: c?.certifications.length },
          { id: 'evidence', label: 'Evidence', count: c?.evidence.length },
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
          {tab === 'personal' && <PersonalTab key={c.id} c={c} />}
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
