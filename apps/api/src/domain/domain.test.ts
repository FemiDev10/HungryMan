import { describe, expect, it } from 'vitest';
import { findAnswer, prepareAnswers, UNKNOWN } from './answers.js';
import { classifyJobHeuristic } from './classification.js';
import { validateCv, validateSentence } from './claimValidation.js';
import { buildCvContent } from './cvBuilder.js';
import { dedupeKey } from './dedupe.js';
import { assessEligibility, studyPeriodAt } from './eligibility.js';
import { fixtureCandidate, fixtureJob, fixtureProfile } from './fixtures.js';
import { detectEmploymentType, detectHours, detectSalary, detectSponsorship, parseJobFacts } from './jobParsing.js';
import { computeMatch } from './matching.js';
import { selectCvProfile } from './profileSelection.js';
import { canTransition } from './stateMachine.js';

const TERM_DATE = new Date('2026-10-15');
const VACATION_DATE = new Date('2026-12-20');

describe('classification', () => {
  it.each([
    ['Product Designer', 'Figma, prototyping, design systems', 'PRODUCT_DESIGN'],
    ['Senior UX/UI Designer', 'wireframes and user journeys', 'UX'],
    ['UX Researcher', 'usability testing and interviews', 'UX_RESEARCH'],
    ['Associate Product Manager', 'roadmap and stakeholders', 'PRODUCT_MANAGEMENT'],
    ['Frontend Developer (React)', 'React, TypeScript, CSS', 'FRONTEND'],
    ['AI Engineer', 'LLM, RAG and embeddings', 'AI'],
    ['Kitchen Porter', 'washing up, pots and pans in a busy kitchen', 'KITCHEN_PORTER'],
    ['Cleaner - Evenings', 'cleaning offices, mopping and vacuuming', 'CLEANING'],
    ['Security Officer', 'SIA licence required, patrols and CCTV', 'SECURITY'],
    ['Retail Sales Assistant', 'tills and shop floor', 'RETAIL'],
    ['Warehouse Operative', 'picking and packing', 'WAREHOUSE'],
    ['Barista', 'coffee and customer service', 'HOSPITALITY'],
  ])('%s → %s', (title, desc, expected) => {
    expect(classifyJobHeuristic(title, desc).category).toBe(expected);
  });

  it('returns OTHER with low confidence when nothing matches', () => {
    const r = classifyJobHeuristic('Zookeeper', 'feeding penguins');
    expect(r.category).toBe('OTHER');
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe('job parsing', () => {
  it('detects hours, salary, employment type and sponsorship', () => {
    expect(detectHours('Part time, 16 hours per week').hoursPerWeek).toBe(16);
    expect(detectHours('20-25 hours a week').hoursPerWeek).toBe(25);
    expect(detectSalary('£12.21 per hour')).toMatchObject({ salaryMin: 12.21, salaryPeriod: 'HOUR' });
    expect(detectSalary('£35,000 - £42,000 per annum')).toMatchObject({ salaryMin: 35000, salaryMax: 42000, salaryPeriod: 'YEAR' });
    expect(detectSalary('£40k-£50k')).toMatchObject({ salaryMin: 40000, salaryMax: 50000, salaryPeriod: 'YEAR' });
    expect(detectEmploymentType('This is a part-time role')).toBe('PART_TIME');
    expect(detectEmploymentType('Permanent, full time')).toBe('FULL_TIME');
    expect(detectSponsorship('Unfortunately we are unable to offer sponsorship.').mention).toBe('NOT_OFFERED');
    expect(detectSponsorship('Visa sponsorship available for the right candidate.').mention).toBe('OFFERED');
    expect(detectSponsorship('Great benefits.').mention).toBe('NONE');
  });

  it('extracts requirement bullets', () => {
    const f = parseJobFacts('Designer', 'About the role\nStuff.\nRequirements:\n- Figma\n- 3 years experience\nNice to have:\n- Framer');
    expect(f.requirements).toEqual(['Figma', '3 years experience']);
    expect(f.preferredRequirements).toEqual(['Framer']);
  });
});

describe('eligibility (configurable work authorisation)', () => {
  const c = fixtureCandidate();
  const auth = c.workAuthorisation!;

  it('computes term vs vacation from configured periods', () => {
    expect(studyPeriodAt(auth, TERM_DATE)).toBe('TERM');
    expect(studyPeriodAt(auth, VACATION_DATE)).toBe('VACATION');
    expect(studyPeriodAt(auth, new Date('2027-03-01'))).toBe('VACATION'); // after course end
    expect(studyPeriodAt(auth, TERM_DATE, 'VACATION')).toBe('VACATION');
  });

  it('flags general-work jobs above the term-time hours limit as NOT_ELIGIBLE', () => {
    const job = fixtureJob({ title: 'Kitchen Porter', employmentType: 'FULL_TIME', hoursPerWeek: 40 });
    expect(assessEligibility(job, auth, 'GENERAL', { now: TERM_DATE }).status).toBe('NOT_ELIGIBLE');
    expect(assessEligibility(job, auth, 'GENERAL', { now: VACATION_DATE }).status).toBe('ELIGIBLE');
  });

  it('accepts part-time within the limit and flags unknown hours', () => {
    expect(assessEligibility(fixtureJob({ employmentType: 'PART_TIME', hoursPerWeek: 16 }), auth, 'GENERAL', { now: TERM_DATE }).status).toBe('ELIGIBLE');
    expect(assessEligibility(fixtureJob({ employmentType: 'PART_TIME', hoursPerWeek: null }), auth, 'GENERAL', { now: TERM_DATE }).status).toBe('POTENTIALLY_ELIGIBLE');
  });

  it('sends professional full-time roles in term time to review rather than rejecting', () => {
    const r = assessEligibility(fixtureJob(), auth, 'PROFESSIONAL', { now: TERM_DATE });
    expect(r.status).toBe('REQUIRES_REVIEW');
  });

  it('handles sponsorship requirements without ever guaranteeing sponsorship', () => {
    const needs = { ...auth, termTimeHoursLimit: null, sponsorshipRequired: true };
    expect(assessEligibility(fixtureJob({ sponsorshipMention: 'NOT_OFFERED' }), needs, 'PROFESSIONAL').status).toBe('NOT_ELIGIBLE');
    const offered = assessEligibility(fixtureJob({ sponsorshipMention: 'OFFERED' }), needs, 'PROFESSIONAL');
    expect(offered.status).toBe('POTENTIALLY_ELIGIBLE');
    expect(offered.sponsorship.potentialOpportunity).toBe(true);
    expect(offered.sponsorship.note).toMatch(/not a guarantee/);
  });

  it('returns UNKNOWN when work authorisation is not configured', () => {
    expect(assessEligibility(fixtureJob(), null, 'PROFESSIONAL').status).toBe('UNKNOWN');
  });

  it('applies configured known restrictions', () => {
    const job = fixtureJob({ description: 'Freelance, self-employed contractor role', employmentType: 'CONTRACT', hoursPerWeek: 10 });
    expect(assessEligibility(job, auth, 'GENERAL', { now: TERM_DATE }).status).toBe('NOT_ELIGIBLE');
  });
});

describe('profile selection', () => {
  const profiles = [fixtureProfile('designer'), fixtureProfile('kp')];
  it('never sends a professional CV to a general-work job, or vice versa', () => {
    expect(selectCvProfile({ title: 'Kitchen Porter', description: '' }, 'KITCHEN_PORTER', [], profiles).profile?.slug).toBe('kitchen-porter');
    expect(selectCvProfile({ title: 'Product Designer', description: '' }, 'PRODUCT_DESIGN', [], profiles).profile?.slug).toBe('product-designer');
    expect(selectCvProfile({ title: 'Cleaner', description: '' }, 'CLEANING', ['PRODUCT_DESIGN'], [fixtureProfile('designer')]).profile).toBeNull();
  });
});

describe('matching', () => {
  const c = fixtureCandidate();
  it('scores a strong designer match highly and lists matched skills', () => {
    const m = computeMatch({ job: fixtureJob(), category: 'PRODUCT_DESIGN', alternativeCategories: [], track: 'PROFESSIONAL', candidate: c, profile: fixtureProfile('designer'), eligibility: 'ELIGIBLE', minScore: 55 });
    expect(m.score).toBeGreaterThan(70);
    expect(m.requiredSkillsMatched).toEqual(expect.arrayContaining(['Figma', 'Prototyping', 'User research']));
    expect(m.recommendation).toBe('APPLY');
  });

  it('hard eligibility constraints override a high score', () => {
    const m = computeMatch({ job: fixtureJob(), category: 'PRODUCT_DESIGN', alternativeCategories: [], track: 'PROFESSIONAL', candidate: c, profile: fixtureProfile('designer'), eligibility: 'NOT_ELIGIBLE', minScore: 10 });
    expect(m.recommendation).toBe('SKIP');
    expect(m.hardBlocks.length).toBeGreaterThan(0);
  });

  it('blocks jobs demanding a licence the candidate has not recorded', () => {
    const job = fixtureJob({ title: 'Security Officer', description: 'Must hold a valid SIA licence.', requirements: [] });
    const m = computeMatch({ job, category: 'SECURITY', alternativeCategories: [], track: 'GENERAL', candidate: c, profile: fixtureProfile('kp'), eligibility: 'ELIGIBLE', minScore: 10 });
    expect(m.hardBlocks.join()).toMatch(/SIA licence/);
    expect(m.recommendation).toBe('SKIP');
  });
});

describe('CV builder + claim validation', () => {
  const c = fixtureCandidate();

  it('builds a designer CV only from evidence and it validates', () => {
    const cv = buildCvContent({ candidate: c, profile: fixtureProfile('designer'), job: fixtureJob(), category: 'PRODUCT_DESIGN' });
    const report = validateCv(cv, c);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    const bullets = cv.experience.flatMap((e) => e.bullets.map((b) => b.evidenceId));
    expect(bullets).toContain('ev1');
    expect(bullets).not.toContain('ev6'); // not allowed for CV
    expect(cv.skills[0].name).toBe('Figma');
    expect(cv.projects.map((p) => p.name)).toContain('Budget app');
  });

  it('builds a kitchen porter CV that emphasises transferable evidence, not design work', () => {
    const cv = buildCvContent({ candidate: c, profile: fixtureProfile('kp'), job: fixtureJob({ title: 'Kitchen Porter', description: 'Kitchen hygiene and cleaning' }), category: 'KITCHEN_PORTER' });
    expect(validateCv(cv, c).valid).toBe(true);
    expect(cv.projects).toHaveLength(0);
    expect(cv.header.headline).toBeNull();
    expect(cv.skills.map((s) => s.name)).not.toContain('Figma');
    expect(cv.experience[0].employer).toBe('Campus Café'); // relevance ordering
    expect(cv.strengths.map((s) => s.evidenceId)).toContain('ev4');
    const designBullets = cv.experience.find((e) => e.employer === 'PayCo')?.bullets ?? [];
    expect(designBullets.map((b) => b.evidenceId)).not.toContain('ev1');
    expect(cv.summary[0].text).toContain('Kitchen Porter');
  });

  it('rejects tampered or fabricated content', () => {
    const cv = buildCvContent({ candidate: c, profile: fixtureProfile('designer'), job: fixtureJob(), category: 'PRODUCT_DESIGN' });
    cv.experience[0].bullets[0].text = 'Increased completion by 80%';
    cv.skills.push({ skillId: 'fake', name: 'Kubernetes' });
    cv.summary.push({ text: 'Expert in Kubernetes with 10 years experience.', refs: ['skill:sk1'] });
    const report = validateCv(cv, c);
    expect(report.valid).toBe(false);
    expect(report.errors.join('\n')).toMatch(/differs from evidence/);
    expect(report.errors.join('\n')).toMatch(/Kubernetes/);
    expect(report.errors.join('\n')).toMatch(/Number "10"/);
  });

  it('rejects summary sentences with no evidence or disallowed evidence', () => {
    expect(validateSentence('I am a great leader.', [], c, null, 'cv')).not.toEqual([]);
    expect(validateSentence('Private achievement not for CVs', ['evidence:ev6'], c, null, 'cv')).not.toEqual([]);
    expect(validateSentence('Advanced Figma user.', ['skill:sk1'], c, null, 'cv')).toEqual([]);
  });
});

describe('answers', () => {
  const c = fixtureCandidate();
  it('derives standard answers and returns UNKNOWN rather than guessing', () => {
    const answers = prepareAnswers(c, 'GENERAL', [
      { key: 'why_us', category: 'MOTIVATION', question: 'Why do you want to work here?', patterns: ['why do you want'], answer: 'Because…', track: null, evidenceIds: [], verified: false },
      { key: 'driving', category: 'OTHER', question: 'Do you have a driving licence?', patterns: ['driving licence'], answer: 'No', track: null, evidenceIds: [], verified: true },
    ]);
    expect(findAnswer('Do you have the right to work in the UK?', answers)?.answer).toBe('Yes');
    expect(findAnswer('Do you require sponsorship?', answers)?.answer).toBe('No');
    expect(findAnswer('Are there any restrictions on the hours you can work?', answers)?.answer).toMatch(/20 hours/);
    expect(findAnswer('Why do you want to work here?', answers)?.answer).toBe(UNKNOWN); // unverified
    expect(findAnswer('Do you hold a full driving licence?', answers)?.answer).toBe('No');
  });
});

describe('dedupe + state machine', () => {
  it('produces the same key across sources', () => {
    expect(dedupeKey('Acme Ltd', 'Kitchen Porter', 'Manchester, UK')).toBe(dedupeKey('ACME', 'Kitchen porter', 'Manchester'));
  });
  it('enforces transitions', () => {
    expect(canTransition('QUEUED', 'CV_GENERATING')).toBe(true);
    expect(canTransition('QUEUED', 'SUBMITTED')).toBe(false);
    expect(canTransition('BROWSER_EXECUTING', 'BLOCKED')).toBe(true);
    expect(canTransition('SUBMITTED', 'QUEUED')).toBe(false);
    expect(canTransition('NEEDS_HUMAN', 'SUBMITTED')).toBe(true);
  });
});
