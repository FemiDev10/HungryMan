import { env } from '../config/env.js';
import { stripHtml } from '../domain/text.js';
import { httpJson, type JobSource, type NormalizedJob, type SearchCriteria } from './types.js';

interface ReedResult {
  jobId: number;
  employerName: string;
  jobTitle: string;
  locationName: string;
  minimumSalary: number | null;
  maximumSalary: number | null;
  expirationDate: string | null; // dd/mm/yyyy
  date: string | null; // dd/mm/yyyy
  jobDescription: string;
  jobUrl: string;
}
interface ReedDetail extends ReedResult {
  partTime?: boolean;
  fullTime?: boolean;
  contractType?: string;
  salaryType?: string;
  externalUrl?: string | null;
}

const parseUkDate = (s: string | null | undefined) => {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null;
};

/** Reed.co.uk official Jobseeker API (https://www.reed.co.uk/developers). */
export class ReedSource implements JobSource {
  readonly id = 'reed';
  readonly label = 'Reed (official API)';
  private base = 'https://www.reed.co.uk/api/1.0';

  available() {
    return Boolean(env.REED_API_KEY);
  }
  supportsApplication() {
    return true;
  }
  canHandleUrl(url: string) {
    return /reed\.co\.uk\/jobs\/.+\/(\d+)/.test(url);
  }

  private auth() {
    return { Authorization: `Basic ${Buffer.from(`${env.REED_API_KEY}:`).toString('base64')}` };
  }

  private normalize(r: ReedDetail): NormalizedJob {
    const salaryPeriod = r.salaryType ? (/hour/i.test(r.salaryType) ? 'HOUR' : /day/i.test(r.salaryType) ? 'DAY' : 'YEAR') : r.maximumSalary && r.maximumSalary < 100 ? 'HOUR' : 'YEAR';
    return {
      source: this.id,
      sourceJobId: String(r.jobId),
      url: r.jobUrl,
      title: r.jobTitle,
      company: r.employerName,
      location: r.locationName,
      description: stripHtml(r.jobDescription ?? ''),
      employmentType: r.partTime ? 'PART_TIME' : r.contractType === 'temporary' ? 'TEMPORARY' : r.contractType === 'contract' ? 'CONTRACT' : r.fullTime ? 'FULL_TIME' : undefined,
      salaryMin: r.minimumSalary,
      salaryMax: r.maximumSalary,
      salaryPeriod: r.minimumSalary || r.maximumSalary ? salaryPeriod : null,
      postedAt: parseUkDate(r.date),
      closingDate: parseUkDate(r.expirationDate),
      applicationMethod: 'EXTERNAL_URL',
      rawData: r,
    };
  }

  async search(c: SearchCriteria): Promise<NormalizedJob[]> {
    const out: NormalizedJob[] = [];
    const locations = c.locations.length ? c.locations : [''];
    for (const keywords of c.keywords.length ? c.keywords : ['']) {
      for (const loc of locations) {
        const q = new URLSearchParams({ keywords, resultsToTake: String(Math.min(100, c.maxResults)) });
        if (loc) q.set('locationName', loc);
        if (c.track === 'GENERAL') q.set('distanceFromLocation', '10');
        const data = await httpJson<{ results: ReedResult[] }>(`${this.base}/search?${q}`, { headers: this.auth() });
        out.push(...data.results.map((r) => this.normalize(r)));
        if (out.length >= c.maxResults) return out.slice(0, c.maxResults);
      }
    }
    return out;
  }

  /** Search results carry a truncated description; fetch the full advert. */
  async hydrate(job: NormalizedJob): Promise<NormalizedJob> {
    if (!job.sourceJobId) return job;
    const d = await httpJson<ReedDetail>(`${this.base}/jobs/${job.sourceJobId}`, { headers: this.auth() });
    return this.normalize({ ...d, jobUrl: d.jobUrl ?? job.url });
  }

  async getJob(url: string) {
    const id = url.match(/\/(\d+)(?:[/?#]|$)/)?.[1];
    if (!id || !this.available()) return null;
    return this.hydrate({ source: this.id, sourceJobId: id, url, title: '', company: '', location: null, description: '', applicationMethod: 'EXTERNAL_URL' });
  }
}
