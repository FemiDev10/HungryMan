import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Tabs } from '../../components/Tabs';
import { ErrorBox, LoadingBlock, PageHeader } from '../../components/ui';
import { GeneralSettings } from './GeneralSettings';
import { SourcesSettings } from './SourcesSettings';
import { PrivacySettings } from './PrivacySettings';

type TabId = 'agent' | 'sources' | 'privacy';

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'agent';
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });

  return (
    <>
      <PageHeader title="Settings" description="How hard the agent works, when it runs, where it looks, and your data." />
      <Tabs<TabId>
        value={tab}
        onChange={(t) => setParams(t === 'agent' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: 'agent', label: 'Agent & schedule' },
          { id: 'sources', label: 'Sources' },
          { id: 'privacy', label: 'Privacy' },
        ]}
      />
      {tab === 'agent' &&
        (settings.isLoading ? (
          <LoadingBlock />
        ) : settings.error || !settings.data ? (
          <ErrorBox error={settings.error} onRetry={() => settings.refetch()} />
        ) : (
          <GeneralSettings key={settings.data.updatedAt ?? 'settings'} s={settings.data} />
        ))}
      {tab === 'sources' && <SourcesSettings />}
      {tab === 'privacy' && <PrivacySettings />}
    </>
  );
}
