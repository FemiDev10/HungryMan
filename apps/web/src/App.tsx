import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api/client';
import { Layout } from './components/Layout';
import { ErrorBox, LoadingBlock } from './components/ui';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { QueuePage } from './pages/Queue';
import { HistoryPage } from './pages/History';
import { ExceptionsPage } from './pages/Exceptions';
import { ApplicationDetailPage } from './pages/ApplicationDetail';
import { ImportJobPage } from './pages/ImportJob';
import { CandidatePage } from './pages/candidate/CandidatePage';
import { CvProfilesPage } from './pages/CvProfiles';
import { AnswersPage } from './pages/Answers';
import { SettingsPage } from './pages/settings/SettingsPage';
import { AuditPage } from './pages/Audit';
import { NotFoundPage } from './pages/NotFound';

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: api.me, retry: false, staleTime: 60_000 });
  if (me.isLoading) return <LoadingBlock label="Checking session…" />;
  if (me.error instanceof ApiError && me.error.status === 401) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (me.error) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorBox error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="applications/:id" element={<ApplicationDetailPage />} />
        <Route path="import" element={<ImportJobPage />} />
        <Route path="profile" element={<CandidatePage />} />
        <Route path="cv-profiles" element={<CvProfilesPage />} />
        <Route path="answers" element={<AnswersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
