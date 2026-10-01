import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { api } from '../api/client';
import type { Outreach, OutreachStatus } from '../api/types';
import { Table } from '../components/Table';
import { Badge, Button, Card, EmptyState, ErrorBox, LoadingBlock, PageHeader, Select } from '../components/ui';
import type { Tone } from '../lib/labels';
import { fmtDateTime } from '../lib/format';

const STATUS_TONE: Record<OutreachStatus, Tone> = { PLANNED: 'slate', DRAFTED: 'amber', SENT: 'blue', REPLIED: 'green', SKIPPED: 'grey', FAILED: 'red' };
const STATUS_LABEL: Record<OutreachStatus, string> = { PLANNED: 'Planned', DRAFTED: 'Draft: check & send', SENT: 'Sent', REPLIED: 'Replied', SKIPPED: 'Skipped', FAILED: 'Failed' };

export function OutreachPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['outreach', status], queryFn: () => api.outreach(status || undefined) });
  const quota = useQuery({ queryKey: ['outreach-quota'], queryFn: api.outreachQuota });
  const update = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'SENT' | 'REPLIED' | 'SKIPPED' }) => api.updateOutreach(id, { status: s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outreach"
        description="Speculative and follow-up emails that Claude writes as drafts in your Gmail. Open Gmail → Drafts, check each one and press send, then mark it here. Only addresses published for hiring are used, each address is emailed once, and each company at most once a month."
      />
      {quota.data && (
        <Card>
          <div className="flex flex-wrap gap-6 text-sm">
            <div><span className="text-subtle">Today:</span> {quota.data.usedToday} / {quota.data.perDay}</div>
            <div>
              <span className="text-subtle">Sending:</span>{' '}
              {!quota.data.autoSend || quota.data.warmUpLeft > 0 ? 'you send each draft from Gmail' : 'automatic'}
            </div>
          </div>
        </Card>
      )}
      <Card
        title="Emails"
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All</option>
            {(Object.keys(STATUS_LABEL) as OutreachStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
        }
        bodyClassName="p-0"
      >
        {list.isLoading ? (
          <LoadingBlock />
        ) : list.error ? (
          <ErrorBox error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <Table<Outreach>
            rows={list.data ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
            empty={<EmptyState icon={<Mail className="size-6" />} title="No emails yet">The daily run adds them here.</EmptyState>}
            columns={[
              { key: 'company', header: 'Company', cell: (r) => <div><div className="font-medium text-fg">{r.company}</div><div className="text-xs text-subtle">{r.recipientName ? `${r.recipientName} · ` : ''}{r.recipientEmail}</div></div> },
              {
                key: 'subject',
                header: 'Email',
                cell: (r) => (
                  <div className="max-w-xl">
                    <div>{r.subject}</div>
                    {open === r.id && (
                      <div className="mt-2 space-y-2">
                        <pre className="whitespace-pre-wrap font-sans text-xs text-muted">{r.body}</pre>
                        <a className="text-xs text-accent hover:underline" href={r.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Where the address was found</a>
                      </div>
                    )}
                  </div>
                ),
              },
              { key: 'status', header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
              { key: 'when', header: 'When', cell: (r) => <span className="text-xs text-subtle">{fmtDateTime(r.sentAt ?? r.createdAt)}</span> },
              {
                key: 'actions',
                header: '',
                cell: (r) => (
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {r.status === 'DRAFTED' && <Button size="sm" onClick={() => update.mutate({ id: r.id, s: 'SENT' })}>I sent it</Button>}
                    {(r.status === 'SENT' || r.status === 'DRAFTED') && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: r.id, s: 'REPLIED' })}>Got a reply</Button>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
