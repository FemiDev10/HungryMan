import type {
  AgentAction,
  AgentStatusView,
  AnswerTemplate,
  ApplicationDetail,
  ApplicationFilters,
  ApplicationRow,
  AuditLog,
  Candidate,
  CandidateCollection,
  Checklist,
  CvImportResult,
  CvPreview,
  CvProfile,
  ImportJobBody,
  Job,
  Meta,
  Notification,
  Outcome,
  Overview,
  Paged,
  ReviewItem,
  Settings,
  SourceConfig,
  SponsorCheck,
  SponsorRegisterStatus,
  WorkAuthorisation,
} from './types';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const BASE = '/api';

function redirectToLogin() {
  if (window.location.pathname.startsWith('/login')) return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  /** Do not redirect to /login on 401 (used for the login + session probe calls). */
  noAuthRedirect?: boolean;
}

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the HungryMan API. Is the server running?');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (res.status === 401) {
    if (!opts.noAuthRedirect) redirectToLogin();
    const e = data as { error?: string } | undefined;
    throw new ApiError(401, (e && typeof e === 'object' && e.error) || 'Not signed in');
  }
  if (!res.ok) {
    const err = data as { error?: string; details?: unknown } | undefined;
    const message =
      (err && typeof err === 'object' && typeof err.error === 'string' && err.error) ||
      (res.status >= 502 && res.status <= 504
        ? 'Cannot reach the HungryMan API. Is the server running?'
        : `Request failed (${res.status})`);
    throw new ApiError(res.status, message, err && typeof err === 'object' ? err.details : undefined);
  }
  return data as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const put = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body });
const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

type Ok = { ok: true; message?: string };

export const api = {
  // auth
  login: (password: string) => request<Ok>('/auth/login', { method: 'POST', body: { password }, noAuthRedirect: true }),
  logout: () => request<Ok>('/auth/logout', { method: 'POST', body: {}, noAuthRedirect: true }),
  me: () => request<{ authenticated: boolean }>('/auth/me', { noAuthRedirect: true }),

  meta: () => request<Meta>('/meta'),

  // dashboard / agent
  overview: () => request<Overview>('/dashboard/overview'),
  checklist: () => request<Checklist>('/dashboard/checklist'),
  agentStatus: () => request<AgentStatusView>('/agent/status'),
  agentControl: (action: AgentAction) => post<{ ok: true; message: string }>('/agent/control', { action }),

  // applications
  applications: (f: ApplicationFilters) =>
    request<Paged<ApplicationRow>>(`/applications${qs({ ...f })}`),
  application: (id: string) => request<ApplicationDetail>(`/applications/${id}`),
  retryApplication: (id: string) => post<unknown>(`/applications/${id}/retry`),
  skipApplication: (id: string, reason?: string) => post<unknown>(`/applications/${id}/skip`, { reason }),
  resolveApplication: (
    id: string,
    body: { action: 'MARK_SUBMITTED' | 'REQUEUE' | 'SKIP'; note?: string; confirmationNumber?: string },
  ) => post<unknown>(`/applications/${id}/resolve`, body),
  setOutcome: (id: string, outcome: Outcome) => post<unknown>(`/applications/${id}/outcome`, { outcome }),
  documentUrl: (id: string) => `${BASE}/documents/${id}/download`,

  // jobs
  importJob: (body: ImportJobBody) => post<{ job: Job; application: ApplicationRow | null }>('/jobs/import', body),
  importJobUrl: (url: string) => post<{ job: Job; application: ApplicationRow | null }>('/jobs/import-url', { url }),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  reanalyseJob: (id: string) => post<{ job: Job; application: ApplicationRow | null }>(`/jobs/${id}/reanalyse`),

  // candidate
  candidate: () => request<Candidate>('/candidate'),
  updateCandidate: (body: Partial<Candidate>) => put<Candidate>('/candidate', body),
  updateWorkAuth: (body: Partial<WorkAuthorisation>) => put<WorkAuthorisation>('/candidate/work-authorisation', body),
  createItem: (col: CandidateCollection, body: unknown) => post<unknown>(`/candidate/${col}`, body),
  updateItem: (col: CandidateCollection, id: string, body: unknown) => put<unknown>(`/candidate/${col}/${id}`, body),
  deleteItem: (col: CandidateCollection, id: string) => del<unknown>(`/candidate/${col}/${id}`),
  importCv: (fileName: string, contentBase64: string) => post<CvImportResult>('/candidate/import-cv', { fileName, contentBase64 }),
  reviewItems: (body: { items?: ReviewItem[]; approveAll?: boolean }) =>
    post<{ approved: number; rejected: number; candidate: Candidate }>('/candidate/review', body),

  // cv profiles
  cvProfiles: () => request<CvProfile[]>('/cv-profiles'),
  createCvProfile: (body: Partial<CvProfile>) => post<CvProfile>('/cv-profiles', body),
  updateCvProfile: (id: string, body: Partial<CvProfile>) => put<CvProfile>(`/cv-profiles/${id}`, body),
  deleteCvProfile: (id: string) => del<unknown>(`/cv-profiles/${id}`),
  previewCvProfile: (id: string, jobId?: string) => post<CvPreview>(`/cv-profiles/${id}/preview`, jobId ? { jobId } : {}),

  // answers
  answers: () => request<AnswerTemplate[]>('/answers'),
  createAnswer: (body: Partial<AnswerTemplate>) => post<AnswerTemplate>('/answers', body),
  updateAnswer: (id: string, body: Partial<AnswerTemplate>) => put<AnswerTemplate>(`/answers/${id}`, body),
  deleteAnswer: (id: string) => del<unknown>(`/answers/${id}`),

  // settings / sources
  settings: () => request<Settings>('/settings'),
  updateSettings: (body: Partial<Settings>) => put<Settings>('/settings', body),
  sources: () => request<SourceConfig[]>('/sources'),
  sponsorStatus: () => request<SponsorRegisterStatus>('/sponsors/status'),
  refreshSponsors: () => post<{ ok: true; rows: number; status: SponsorRegisterStatus }>('/sponsors/refresh'),
  uploadSponsors: (csvBase64: string) => post<{ ok: true; rows: number; status: SponsorRegisterStatus }>('/sponsors/upload', { csvBase64 }),
  checkSponsor: (company: string) => request<SponsorCheck>(`/sponsors/check${qs({ company })}`),
  updateSource: (source: string, body: Partial<SourceConfig>) => put<SourceConfig>(`/sources/${encodeURIComponent(source)}`, body),

  // audit / notifications / privacy
  audit: (p: { applicationId?: string; type?: string; page?: number; pageSize?: number }) =>
    request<{ items: AuditLog[]; total: number }>(`/audit${qs(p)}`),
  notifications: (unread?: boolean) => request<Notification[]>(`/notifications${qs({ unread: unread ? 'true' : undefined })}`),
  markNotificationRead: (id: string) => post<unknown>(`/notifications/${id}/read`),
  markAllNotificationsRead: () => post<unknown>('/notifications/read-all'),
  privacyExportUrl: () => `${BASE}/privacy/export`,
  privacyDelete: (confirm: string) => post<unknown>('/privacy/delete', { confirm }),
};
