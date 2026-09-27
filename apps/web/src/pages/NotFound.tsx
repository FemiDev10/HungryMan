import { Link } from 'react-router';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <EmptyState title="Page not found">
      <Link className="text-accent underline underline-offset-2" to="/">
        Back to overview
      </Link>
    </EmptyState>
  );
}
