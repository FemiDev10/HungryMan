import type { JobCategory } from '@prisma/client';
import { hasPhrase } from './text.js';
import { trackForCategory, type CvProfileLike } from './types.js';

/**
 * Pick the CV profile for a job. A profile is only eligible if it serves the job's
 * category *and* the job's track — a Product Designer CV can never go to a Kitchen
 * Porter advert, and vice versa.
 */
export function selectCvProfile<P extends CvProfileLike>(
  job: { title: string; description: string },
  category: JobCategory,
  alternativeCategories: JobCategory[],
  profiles: P[],
): { profile: P | null; reason: string } {
  const track = trackForCategory(category);
  if (!track) return { profile: null, reason: `Category ${category} has no track; not applying.` };
  const active = profiles.filter((p) => p.active && p.track === track);

  const score = (p: P) => {
    let s = 0;
    if (p.categories.includes(category)) s += 10;
    if (alternativeCategories.some((c) => p.categories.includes(c))) s += 2;
    s += p.targetJobTitles.filter((t) => hasPhrase(job.title, t)).length * 6;
    s += Math.min(5, p.targetKeywords.filter((k) => hasPhrase(job.description, k)).length);
    return s;
  };

  const ranked = active
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.p.categories.includes(category) || x.p.targetJobTitles.some((t) => hasPhrase(job.title, t)))
    .sort((a, b) => b.s - a.s);

  if (ranked.length) return { profile: ranked[0].p, reason: `Selected "${ranked[0].p.name}" (score ${ranked[0].s}).` };

  // Fall back to a generic profile on the same track.
  const fallbackCategory: JobCategory = track === 'PROFESSIONAL' ? 'TECH_GENERAL' : 'GENERAL_ENTRY_LEVEL';
  const fallback = active.find((p) => p.categories.includes(fallbackCategory));
  if (fallback) return { profile: fallback, reason: `No profile for ${category}; using general "${fallback.name}" on the same track.` };
  return { profile: null, reason: `No active ${track.toLowerCase()} CV profile for ${category}.` };
}
