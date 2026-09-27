import { AdzunaSource } from './adzuna.js';
import { GreenhouseSource, LeverSource } from './ats.js';
import { ReedSource } from './reed.js';
import type { JobSource, NormalizedJob, SearchCriteria } from './types.js';

/** Jobs added by hand / pasted from any site. Never searched automatically. */
export class ManualSource implements JobSource {
  readonly id = 'manual';
  readonly label = 'Manual import';
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

const sources: JobSource[] = [new ReedSource(), new AdzunaSource(), new GreenhouseSource(), new LeverSource(), new ManualSource()];

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
