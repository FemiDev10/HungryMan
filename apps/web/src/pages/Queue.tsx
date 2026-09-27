import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ApplicationsTable } from '../components/ApplicationsTable';
import { Pagination } from '../components/Pagination';
import { Card, ErrorBox, LoadingBlock, PageHeader } from '../components/ui';
import { POLL_MS } from '../lib/hooks';

export function QueuePage() {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const q = useQuery({
    queryKey: ['applications', 'queue', page],
    queryFn: () => api.applications({ view: 'queue', page, pageSize }),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Queue"
        description="Applications the agent has accepted and is working through — in-flight first, then by priority."
      />
      <Card bodyClassName="p-0">
        {q.isLoading ? (
          <LoadingBlock />
        ) : q.error ? (
          <div className="p-4">
            <ErrorBox error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : (
          <ApplicationsTable rows={q.data?.items ?? []} emptyTitle="The queue is empty" emptyHint="New matches are queued automatically after discovery and analysis." />
        )}
      </Card>
      {q.data && q.data.total > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={q.data.total} onPage={setPage} />
      )}
    </>
  );
}
