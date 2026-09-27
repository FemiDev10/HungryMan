import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3 text-xs text-muted">
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="size-3.5" />}>
          Prev
        </Button>
        <span className="tabular-nums">
          Page {page} / {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
