import { stripHtml } from '../domain/text.js';
import { httpJson, matchesKeywords, matchesLocation, type JobSource, type NormalizedJob, type SearchCriteria } from './types.js';

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
}

/**
 * Greenhouse public Job Board API — employer career sites hosted on Greenhouse.
 * config: { boards: string[] } e.g. ["monzo", "deliveroo"]
 */
export class GreenhouseSource implements JobSource {
  readonly id = 'greenhouse';
  readonly label = 'Greenhouse career sites (public job board API)';

  available() {
    return true;
  }
  supportsApplication() {
    return true;
  }
  canHandleUrl(url: string) {
    return /greenhouse\.io\/.+\/jobs\/\d+/.test(url) || /[?&]gh_jid=\d+/.test(url);
  }

  private normalize(board: string, j: GreenhouseJob): NormalizedJob {
    return {
      source: this.id,
      sourceJobId: `${board}:${j.id}`,
      url: j.absolute_url,
      title: j.title,
      company: j.company_name ?? board.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      location: j.location?.name ?? null,
      description: stripHtml(decodeEntities(j.content ?? '')),
      postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
      applicationMethod: 'EXTERNAL_URL',
      rawData: { board, id: j.id, updated_at: j.updated_at },
    };
  }

  async search(c: SearchCriteria, config: Record<string, unknown>): Promise<NormalizedJob[]> {
    const boards = (config.boards as string[] | undefined) ?? [];
    const out: NormalizedJob[] = [];
    for (const board of boards) {
      const data = await httpJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
      for (const j of data.jobs) {
        const n = this.normalize(board, j);
        if (matchesKeywords(n.title, c.keywords) && matchesLocation(n.location, c.locations, /remote/i.test(n.location ?? ''))) out.push(n);
      }
    }
    return out.slice(0, c.maxResults);
  }

  async getJob(url: string) {
    const m = url.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([\w-]+)\/jobs\/(\d+)/) ?? url.match(/for=([\w-]+).*token=(\d+)/);
    if (!m) return null;
    const j = await httpJson<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`);
    return this.normalize(m[1], j);
  }
}

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; interval?: string; currency?: string };
}

/**
 * Lever public Postings API — employer career sites hosted on Lever.
 * config: { companies: string[] }
 */
export class LeverSource implements JobSource {
  readonly id = 'lever';
  readonly label = 'Lever career sites (public postings API)';

  available() {
    return true;
  }
  supportsApplication() {
    return true;
  }
  canHandleUrl(url: string) {
    return /jobs\.(eu\.)?lever\.co\/[\w-]+\/[\w-]+/.test(url);
  }

  private normalize(company: string, p: LeverPosting): NormalizedJob {
    const lists = (p.lists ?? []).map((l) => `${l.text}:\n${stripHtml(l.content)}`).join('\n\n');
    const commitment = (p.categories?.commitment ?? '').toLowerCase();
    return {
      source: this.id,
      sourceJobId: `${company}:${p.id}`,
      url: p.hostedUrl,
      title: p.text,
      company: company.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      location: p.categories?.location ?? null,
      description: [p.descriptionPlain ?? '', lists, p.additionalPlain ?? ''].filter(Boolean).join('\n\n'),
      remoteType: p.workplaceType === 'remote' ? 'REMOTE' : p.workplaceType === 'hybrid' ? 'HYBRID' : p.workplaceType === 'onsite' ? 'ONSITE' : undefined,
      employmentType: /part/.test(commitment) ? 'PART_TIME' : /intern/.test(commitment) ? 'INTERNSHIP' : /contract|fixed/.test(commitment) ? 'CONTRACT' : /temp/.test(commitment) ? 'TEMPORARY' : /full/.test(commitment) ? 'FULL_TIME' : undefined,
      salaryMin: p.salaryRange?.min ?? null,
      salaryMax: p.salaryRange?.max ?? null,
      salaryPeriod: p.salaryRange?.interval ? (/hour/.test(p.salaryRange.interval) ? 'HOUR' : /month/.test(p.salaryRange.interval) ? 'MONTH' : 'YEAR') : null,
      postedAt: p.createdAt ? new Date(p.createdAt) : null,
      applicationMethod: 'EXTERNAL_URL',
      rawData: { company, id: p.id, applyUrl: p.applyUrl },
    };
  }

  async search(c: SearchCriteria, config: Record<string, unknown>): Promise<NormalizedJob[]> {
    const companies = (config.companies as string[] | undefined) ?? [];
    const out: NormalizedJob[] = [];
    for (const company of companies) {
      const data = await httpJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
      for (const p of data) {
        const n = this.normalize(company, p);
        if (matchesKeywords(n.title, c.keywords) && matchesLocation(n.location, c.locations, n.remoteType === 'REMOTE')) out.push(n);
      }
    }
    return out.slice(0, c.maxResults);
  }

  async getJob(url: string) {
    const m = url.match(/jobs\.(?:eu\.)?lever\.co\/([\w-]+)\/([\w-]+)/);
    if (!m) return null;
    const host = url.includes('.eu.') ? 'api.eu.lever.co' : 'api.lever.co';
    const p = await httpJson<LeverPosting>(`https://${host}/v0/postings/${m[1]}/${m[2]}`);
    return this.normalize(m[1], p);
  }
}
