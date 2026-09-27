import type { JobCategory } from '@prisma/client';
import { integrations } from '../config/env.js';
import type { JobClassification } from '../domain/classification.js';
import type { CvAiPlan, CvSentence } from '../domain/cvBuilder.js';
import type { ParsedJobFacts } from '../domain/jobParsing.js';
import type { CandidateLike, CvProfileLike, JobLike } from '../domain/types.js';
import { ClaudeAiEngine } from './claude.js';
import { DeterministicAiEngine } from './deterministic.js';

export interface JobAnalysis {
  classification: JobClassification;
  facts: Partial<ParsedJobFacts>;
  engine: string;
  promptVersion: string | null;
}

export interface CoverLetter {
  paragraphs: CvSentence[][];
  engine: string;
  promptVersion: string | null;
}

export interface AiEngine {
  readonly name: string;
  analyseJob(job: { title: string; company: string; location: string | null; description: string }): Promise<JobAnalysis>;
  planCv(input: { job: JobLike; category: JobCategory; profile: CvProfileLike; candidate: CandidateLike }): Promise<{ plan: CvAiPlan | null; promptVersion: string | null }>;
  writeCoverLetter(input: { job: JobLike; category: JobCategory; profile: CvProfileLike; candidate: CandidateLike }): Promise<CoverLetter>;
}

let cached: AiEngine | null = null;
const deterministic = new DeterministicAiEngine();

/** Claude when configured; otherwise the deterministic engine. Claude failures fall back per call. */
export function getAiEngine(): AiEngine {
  if (cached) return cached;
  cached = integrations.claude() ? new FallbackEngine(new ClaudeAiEngine(), deterministic) : deterministic;
  return cached;
}

export function resetAiEngine() {
  cached = null;
}

class FallbackEngine implements AiEngine {
  readonly name: string;
  constructor(
    private primary: AiEngine,
    private fallback: AiEngine,
  ) {
    this.name = primary.name;
  }
  private async run<T>(label: string, fn: (e: AiEngine) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary);
    } catch (err) {
      console.warn(`[ai] ${label} failed on ${this.primary.name}, using ${this.fallback.name}:`, (err as Error).message);
      return fn(this.fallback);
    }
  }
  analyseJob(job: Parameters<AiEngine['analyseJob']>[0]) {
    return this.run('analyseJob', (e) => e.analyseJob(job));
  }
  planCv(input: Parameters<AiEngine['planCv']>[0]) {
    return this.run('planCv', (e) => e.planCv(input));
  }
  writeCoverLetter(input: Parameters<AiEngine['writeCoverLetter']>[0]) {
    return this.run('writeCoverLetter', (e) => e.writeCoverLetter(input));
  }
}
