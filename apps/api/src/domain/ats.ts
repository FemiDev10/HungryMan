import type { JobCategory } from '@prisma/client';
import type { CvContent } from './cvBuilder.js';
import { SKILL_VOCABULARY } from './skillsVocabulary.js';
import { hasPhrase, unique } from './text.js';
import type { JobLike } from './types.js';

export interface AtsReport {
  keywords: string[]; // what the advert asks for (from the skills vocabulary)
  present: string[]; // appear on the CV as plain text
  missing: string[]; // not on the CV — genuine gaps, never added without evidence
  coverage: number; // 0–1
}

/** All the text an ATS would read from the CV, in reading order. */
export function cvPlainText(cv: CvContent): string {
  return [
    cv.header.name,
    cv.header.headline,
    cv.header.email,
    cv.header.phone,
    cv.header.location,
    ...cv.summary.map((s) => s.text),
    ...cv.strengths.map((s) => s.text),
    ...cv.skills.map((s) => s.name),
    ...(cv.skillLines ?? []).map((s) => s.text),
    ...cv.experience.flatMap((e) => [e.title, e.employer, ...e.bullets.map((b) => b.text)]),
    ...cv.projects.flatMap((p) => [p.name, ...p.bullets.map((b) => b.text)]),
    ...cv.education.flatMap((e) => [e.qualification, e.field, e.institution, ...(e.highlights ?? [])]),
    ...(cv.additional ?? []).map((a) => a.text),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * ATS keyword coverage: which skills/terms the advert asks for appear on the CV.
 * Missing ones are reported as gaps for the candidate — the CV is never padded with them.
 */
export function atsReport(cv: CvContent, job: JobLike, category: JobCategory): AtsReport {
  const advert = `${job.title}\n${job.description}\n${job.requirements.join('\n')}`;
  const vocab = unique([...(SKILL_VOCABULARY[category] ?? []), ...Object.values(SKILL_VOCABULARY).flat()]);
  const keywords = vocab.filter((k) => k.length > 2 && hasPhrase(advert, k));
  const text = cvPlainText(cv);
  const present = keywords.filter((k) => hasPhrase(text, k));
  const missing = keywords.filter((k) => !present.includes(k));
  return { keywords, present, missing, coverage: keywords.length ? Math.round((present.length / keywords.length) * 100) / 100 : 1 };
}
