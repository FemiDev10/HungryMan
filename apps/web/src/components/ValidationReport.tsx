import { CheckCircle2, XCircle } from 'lucide-react';
import type { ValidationReport } from '../api/types';
import { Badge } from './ui';

export function ValidationReportView({ v }: { v: ValidationReport | null | undefined }) {
  if (!v) return <p className="text-xs text-subtle">No validation report.</p>;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {v.valid ? (
          <Badge tone="green">
            <CheckCircle2 className="size-3" /> Valid
          </Badge>
        ) : (
          <Badge tone="red">
            <XCircle className="size-3" /> Invalid
          </Badge>
        )}
        <span className="text-muted">{v.checkedClaims} claims checked against evidence</span>
      </div>
      {v.errors?.length > 0 && (
        <ul className="space-y-0.5 text-red-600 dark:text-red-400">
          {v.errors.map((e, i) => (
            <li key={i}>✕ {e}</li>
          ))}
        </ul>
      )}
      {v.warnings?.length > 0 && (
        <ul className="space-y-0.5 text-amber-700 dark:text-amber-400">
          {v.warnings.map((e, i) => (
            <li key={i}>! {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

