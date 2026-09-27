import type { EmploymentType, RemoteType, Track } from '@prisma/client';

export interface NormalizedJob {
  source: string;
  sourceJobId: string | null;
  url: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
  remoteType?: RemoteType;
  employmentType?: EmploymentType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: string | null;
  salaryText?: string | null;
  hoursText?: string | null;
  postedAt?: Date | null;
  closingDate?: Date | null;
  applicationMethod: 'EXTERNAL_URL' | 'EASY_APPLY' | 'EMAIL' | 'UNKNOWN';
  rawData?: unknown;
}

export interface SearchCriteria {
  track: Track;
  keywords: string[];
  locations: string[];
  remoteOnly?: boolean;
  maxResults: number;
}

/** Pluggable job source. Only official APIs / public job-board feeds — no scraping or anti-bot evasion. */
export interface JobSource {
  readonly id: string;
  readonly label: string;
  /** Credentials/config needed for this source are present. */
  available(): boolean;
  /** Whether the browser agent may apply through this source's pages. */
  supportsApplication(): boolean;
  search(criteria: SearchCriteria, config: Record<string, unknown>): Promise<NormalizedJob[]>;
  getJob(url: string): Promise<NormalizedJob | null>;
  canHandleUrl(url: string): boolean;
}

const UA = 'HungryMan/0.1 (private job-search assistant)';

export async function httpJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 429) throw new Error(`Rate limited by ${new URL(url).host} — backing off`);
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}

export function matchesKeywords(text: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

export function matchesLocation(location: string | null, locations: string[], remote: boolean): boolean {
  if (!locations.length) return true;
  if (remote) return true;
  const l = (location ?? '').toLowerCase();
  return locations.some((x) => l.includes(x.toLowerCase())) || /remote/.test(l);
}
