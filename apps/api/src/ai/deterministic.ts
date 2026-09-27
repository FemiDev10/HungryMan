import { classifyJobHeuristic } from '../domain/classification.js';
import type { CvSentence } from '../domain/cvBuilder.js';
import { parseJobFacts } from '../domain/jobParsing.js';
import { hasPhrase } from '../domain/text.js';
import type { CandidateAvailability } from '../domain/types.js';
import type { AiEngine, CoverLetter, JobAnalysis } from './engine.js';

/** No-LLM engine: keyword classification, regex facts, evidence-only CV and cover letter. */
export class DeterministicAiEngine implements AiEngine {
  readonly name = 'deterministic';

  async analyseJob(job: { title: string; company: string; location: string | null; description: string }): Promise<JobAnalysis> {
    return {
      classification: classifyJobHeuristic(job.title, job.description),
      facts: parseJobFacts(job.title, job.description, { location: job.location }),
      engine: this.name,
      promptVersion: null,
    };
  }

  async planCv() {
    return { plan: null, promptVersion: null }; // cvBuilder's deterministic ranking is used
  }

  async writeCoverLetter({ job, category, candidate }: Parameters<AiEngine['writeCoverLetter']>[0]): Promise<CoverLetter> {
    const jobText = `${job.title}\n${job.description}`;
    const relevant = candidate.evidence
      .filter((e) => e.allowedForApplication && (e.categories.length === 0 || e.categories.includes(category)))
      .map((e) => ({ e, s: (e.categories.includes(category) ? 3 : 0) + (e.kind === 'ACHIEVEMENT' ? 1 : 0) + (jobText.split(/\W+/).filter((w) => w.length > 4 && hasPhrase(e.claim, w)).length > 0 ? 1 : 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.e);

    const p1: CvSentence[] = [{ text: `I am applying for the ${job.title} position at ${job.company}.`, refs: ['job:title'] }];
    if (candidate.headline) p1.push({ text: `I am a ${candidate.headline.replace(/^(a|an)\s+/i, '').toLowerCase()}.`, refs: ['candidate:headline'] });
    const p2: CvSentence[] = relevant.map((e) => ({ text: e.claim.replace(/\.?$/, '.'), refs: [`evidence:${e.id}`] }));
    const avail = (candidate.availability ?? {}) as CandidateAvailability;
    const p3: CvSentence[] = [];
    if (avail.startDate) p3.push({ text: `I can start ${/^\d/.test(avail.startDate) ? `from ${avail.startDate}` : avail.startDate.toLowerCase()}.`, refs: ['candidate:availability'] });
    p3.push({ text: 'Thank you for considering my application.', refs: ['job:title'] });
    return { paragraphs: [p1, p2, p3].filter((p) => p.length), engine: this.name, promptVersion: null };
  }
}
