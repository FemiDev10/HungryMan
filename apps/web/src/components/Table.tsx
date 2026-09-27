import type { ReactNode } from 'react';
import { cx } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

/** Plain responsive data table (scrolls horizontally on small screens). */
export function Table<T>({ columns, rows, rowKey, onRowClick, empty, rowClassName }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  empty?: ReactNode;
  rowClassName?: (r: T) => string | undefined;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cx('whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-subtle first:pl-4 last:pr-4', c.headerClassName)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx(
                'border-b border-line/70 last:border-0',
                onRowClick && 'cursor-pointer hover:bg-surface-2/70',
                rowClassName?.(r),
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx('px-3 py-2.5 align-top first:pl-4 last:pr-4', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
