import { env } from '../config/env.js';
import { httpJson, type JobSource, type NormalizedJob, type SearchCriteria } from './types.js';

interface AdzunaResult {
  id: string;
  title: string;
  description: string;
  redirect_url: string;
  created: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  contract_time?: 'full_time' | 'part_time';
  contract_type?: 'permanent' | 'contract';
}

/** Adzuna official API (https://developer.adzuna.com). Descriptions are snippets. */
export class AdzunaSource implements JobSource {
  readonly id = 'adzuna';
  readonly label = 'Adzuna (official API)';

  available() {
    return Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY);
  }
  supportsApplication() {
    return true; // redirect_url leads to the employer / board page
  }
  canHandleUrl() {
    return false;
  }

  async search(c: SearchCriteria): Promise<NormalizedJob[]> {
    const out: NormalizedJob[] = [];
    const locations = c.locations.length ? c.locations : [''];
    for (const what of c.keywords.length ? c.keywords : ['']) {
      for (const where of locations) {
        const q = new URLSearchParams({
          app_id: env.ADZUNA_APP_ID!,
          app_key: env.ADZUNA_APP_KEY!,
          results_per_page: String(Math.min(50, c.maxResults)),
          what,
          'content-type': 'application/json',
        });
        if (where) q.set('where', where);
        const data = await httpJson<{ results: AdzunaResult[] }>(`https://api.adzuna.com/v1/api/jobs/gb/search/1?${q}`);
        for (const r of data.results) {
          out.push({
            source: this.id,
            sourceJobId: r.id,
            url: r.redirect_url,
            title: r.title.replace(/<[^>]+>/g, ''),
            company: r.company?.display_name ?? 'Unknown company',
            location: r.location?.display_name ?? null,
            description: r.description.replace(/<[^>]+>/g, ''),
            employmentType: r.contract_time === 'part_time' ? 'PART_TIME' : r.contract_type === 'contract' ? 'CONTRACT' : r.contract_time === 'full_time' ? 'FULL_TIME' : undefined,
            salaryMin: r.salary_min ?? null,
            salaryMax: r.salary_max ?? null,
            salaryPeriod: r.salary_min || r.salary_max ? ((r.salary_max ?? 0) < 100 ? 'HOUR' : 'YEAR') : null,
            postedAt: r.created ? new Date(r.created) : null,
            applicationMethod: 'EXTERNAL_URL',
            rawData: r,
          });
        }
        if (out.length >= c.maxResults) return out.slice(0, c.maxResults);
      }
    }
    return out;
  }

  async getJob() {
    return null;
  }
}
