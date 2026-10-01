import { AdzunaSource } from './adzuna.js';
import { GreenhouseSource, LeverSource } from './ats.js';
import { ReedSource } from './reed.js';
import type { JobSource, NormalizedJob, SearchCriteria } from './types.js';

/**
 * Jobs that arrive through `/jobs/import` rather than a server-side search: pasted by hand, or found by a Claude
 * session through the Indeed connector. Each is its own source so per-site hourly/daily limits apply.
 */
export class ImportedSource implements JobSource {
  readonly importOnly = true;
  constructor(
    readonly id: string,
    readonly label: string,
  ) {}
  available() {
    return true;
  }
  supportsApplication() {
    return true;
  }
  canHandleUrl() {
    return false;
  }
  async search(_c: SearchCriteria): Promise<NormalizedJob[]> {
    return [];
  }
  async getJob() {
    return null;
  }
}

const sources: JobSource[] = [new ReedSource(), new AdzunaSource(), new GreenhouseSource(), new LeverSource(), new ImportedSource('manual', 'Manual import'), new ImportedSource('indeed', 'Indeed (connector)')];

export function listSources(): JobSource[] {
  return sources;
}

export function getSource(id: string): JobSource | undefined {
  return sources.find((s) => s.id === id);
}

/** Registering extra sources (tests, future integrations). */
export function registerSource(source: JobSource) {
  const i = sources.findIndex((s) => s.id === source.id);
  if (i >= 0) sources[i] = source;
  else sources.push(source);
}

export const DEFAULT_SOURCE_CONFIG: Record<string, Record<string, unknown>> = {
  greenhouse: { boards: [] },
  lever: { companies: [] },
};

/** Sources whose jobs only arrive through `/jobs/import`. */
export const IMPORT_SOURCES = ['manual', 'indeed'] as const;
