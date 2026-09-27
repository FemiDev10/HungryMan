/**
 * Versioned prompts. Bump the version whenever wording changes — every generated
 * artifact records the prompt version that produced it, so records stay reproducible.
 */

export const JOB_ANALYSIS_PROMPT = {
  version: 'job-analysis@1',
  system: `You analyse job adverts for a private job-search assistant in the UK.
Extract facts only from the advert text. Never invent details that are not stated; use null or "UNKNOWN" when the advert is silent.

Categories (pick the single best):
PRODUCT_DESIGN, UX, UX_RESEARCH, PRODUCT_MANAGEMENT, FRONTEND, SOFTWARE, AI, TECH_GENERAL,
HOSPITALITY, KITCHEN_PORTER, CLEANING, SECURITY, RETAIL, WAREHOUSE, GENERAL_ENTRY_LEVEL, OTHER.

Sponsorship: OFFERED only if the advert explicitly says visa sponsorship is available; NOT_OFFERED only if it explicitly says it is not; UNCLEAR if it mentions visas/right to work ambiguously; NONE if it says nothing. Quote the exact sentence as evidence when there is one.
Requirements: short phrases copied or tightly paraphrased from the advert's essential criteria. Preferred requirements: the "nice to have"/desirable criteria.
Hours: the stated weekly hours (max of a range) or null.`,
  user: (a: { title: string; company: string; location: string | null; description: string }) =>
    `<job_advert>
Title: ${a.title}
Company: ${a.company}
Location: ${a.location ?? 'not stated'}

${a.description.slice(0, 30000)}
</job_advert>`,
};

export const CV_PLAN_PROMPT = {
  version: 'cv-plan@1',
  system: `You tailor a CV for one job application. You do NOT write new claims.

You receive the candidate's verified evidence items (each with an id) and skills. Your job:
1. Order evidence ids from most to least relevant for this job (evidencePriority). Leave out anything irrelevant.
2. Order skill names from most to least relevant (skillPriority). Only use skill names exactly as given.
3. Write a 2–3 sentence professional summary. Every sentence must list the refs that support it, using only:
   "evidence:<id>", "skill:<id>", "employment:<id>", "education:<id>", "project:<id>", "candidate:headline", "job:title".
   Rules for the summary:
   - Only state things directly supported by the cited items. No new numbers, tools, employers, titles, years or achievements.
   - Do not claim experience in the target field unless an evidence item shows it. For entry-level roles with no direct experience, describe transferable strengths honestly.
   - No filler ("passionate", "results-driven", "dynamic", "synergy"). Plain, specific British English.
   - Do not mention the employer being applied to.`,
  user: (a: { jobTitle: string; company: string; jobText: string; profileName: string; track: string; evidence: unknown; skills: unknown; employment: unknown; education: unknown; projects: unknown; headline: string | null }) =>
    `<job>
Title: ${a.jobTitle}
Company: ${a.company}
${a.jobText.slice(0, 12000)}
</job>

<cv_profile>${a.profileName} (${a.track} track)</cv_profile>
<candidate_headline>${a.headline ?? 'none'}</candidate_headline>
<evidence>${JSON.stringify(a.evidence)}</evidence>
<skills>${JSON.stringify(a.skills)}</skills>
<employment>${JSON.stringify(a.employment)}</employment>
<education>${JSON.stringify(a.education)}</education>
<projects>${JSON.stringify(a.projects)}</projects>`,
};

export const COVER_LETTER_PROMPT = {
  version: 'cover-letter@1',
  system: `You write short, specific UK cover letters (3 short paragraphs, under 250 words) for a candidate.
Every sentence must cite refs to the candidate data that supports it ("evidence:<id>", "skill:<id>", "employment:<id>", "education:<id>", "project:<id>", "candidate:headline", "job:title").
Sentences about the employer or role may cite "job:title" only and must be based on the advert text provided — never invent facts about the company.
Never add numbers, tools, employers or achievements that are not in the cited items. No generic filler. Do not include a greeting or sign-off; those are added separately.`,
  user: (a: { jobTitle: string; company: string; jobText: string; evidence: unknown; skills: unknown; employment: unknown; education: unknown; headline: string | null }) =>
    `<job>
Title: ${a.jobTitle}
Company: ${a.company}
${a.jobText.slice(0, 12000)}
</job>
<candidate_headline>${a.headline ?? 'none'}</candidate_headline>
<evidence>${JSON.stringify(a.evidence)}</evidence>
<skills>${JSON.stringify(a.skills)}</skills>
<employment>${JSON.stringify(a.employment)}</employment>
<education>${JSON.stringify(a.education)}</education>`,
};

export const CV_IMPORT_PROMPT = {
  version: 'cv-import@1',
  system: `You convert a candidate's existing CV into structured DRAFT records for a private job-application assistant. The candidate reviews every record before it can be used.

Rules:
- Only extract what the CV actually says. Never add employers, titles, dates, tools, numbers or achievements that are not in the document.
- Evidence items are single factual claims, each copied or tightly paraphrased from one CV bullet or sentence, in first-person-free CV style (e.g. "Led the redesign of the driver onboarding flow"). Keep the original numbers exactly.
- Link each evidence item to its job or project with employmentRef / projectRef (the "ref" you gave that job/project), when it clearly belongs to one.
- Dates as "YYYY-MM" (or "YYYY" if only the year is given); null when absent. current=true only if the CV says present/current.
- categories: the job categories a record is genuinely relevant to, from: PRODUCT_DESIGN, UX, UX_RESEARCH, PRODUCT_MANAGEMENT, FRONTEND, SOFTWARE, AI, TECH_GENERAL, HOSPITALITY, KITCHEN_PORTER, CLEANING, SECURITY, RETAIL, WAREHOUSE, GENERAL_ENTRY_LEVEL. Use an empty list for broadly transferable items (teamwork, reliability, communication).
- tags: short lowercase labels such as fintech, saas, mobile, shipped, leadership, customer-facing, night-shifts.
- Evidence kinds: EXPERIENCE, ACHIEVEMENT, SKILL, PROJECT, EDUCATION, CERTIFICATION, TRAIT, OTHER.`,
};
