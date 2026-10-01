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
    expect(studyPeriodAt(auth, new Date('2027-03-01'))).toBe('NOT_STUDYING'); // after course end
    expect(studyPeriodAt(auth, TERM_DATE, 'VACATION')).toBe('VACATION');
  });

  it('flags general-work jobs above the term-time hours limit as NOT_ELIGIBLE', () => {
    const job = fixtureJob({ title: 'Kitchen Porter', employmentType: 'FULL_TIME', hoursPerWeek: 40 });
    expect(assessEligibility(job, auth, 'GENERAL', { now: TERM_DATE }).status).toBe('NOT_ELIGIBLE');
    // Vacation allows temporary full-time work, not a permanent full-time job
    expect(assessEligibility(job, auth, 'GENERAL', { now: VACATION_DATE }).status).toBe('NOT_ELIGIBLE');
    const temp = fixtureJob({ title: 'Christmas Kitchen Porter', employmentType: 'TEMPORARY', hoursPerWeek: 40 });
    expect(assessEligibility(temp, auth, 'GENERAL', { now: VACATION_DATE }).status).toBe('ELIGIBLE');
    expect(assessEligibility(temp, auth, 'GENERAL', { now: TERM_DATE }).status).toBe('NOT_ELIGIBLE');
  });

  it('accepts part-time within the limit and flags unknown hours', () => {
    expect(assessEligibility(fixtureJob({ employmentType: 'PART_TIME', hoursPerWeek: 16 }), auth, 'GENERAL', { now: TERM_DATE }).status).toBe('ELIGIBLE');
    expect(assessEligibility(fixtureJob({ employmentType: 'PART_TIME', hoursPerWeek: null }), auth, 'GENERAL', { now: TERM_DATE }).status).toBe('POTENTIALLY_ELIGIBLE');
  });

  it('treats professional full-time roles as student work unless the sponsorship route is switched on', () => {
    const r = assessEligibility(fixtureJob(), auth, 'PROFESSIONAL', { now: TERM_DATE });
    expect(r.workContext).toBe('STUDENT_PART_TIME');
    expect(r.status).toBe('NOT_ELIGIBLE'); // 37.5h > 20h
  });

  describe('Student → Skilled Worker route (full-time roles starting after the course)', () => {
    const route = { ...auth, seekingSponsoredRoleAfterCourse: true, sponsoredRoleMinSalary: 30000 };
    const at = { now: TERM_DATE };

    it('applies when the employer is a licensed sponsor, and states the earliest start', () => {
      const r = assessEligibility(fixtureJob({ sponsorLicensed: true, sponsorMatchName: 'Fintech Ltd' }), route, 'PROFESSIONAL', at);
      expect(r.workContext).toBe('SPONSORED_AFTER_COURSE');
      expect(r.status).toBe('POTENTIALLY_ELIGIBLE');
      expect(r.earliestStart).toBe('2027-01-31');
      expect(r.sponsorship.potentialOpportunity).toBe(true);
    });
    it('applies when the advert offers sponsorship even if the name is not on the register', () => {
      expect(assessEligibility(fixtureJob({ sponsorLicensed: false, sponsorshipMention: 'OFFERED' }), route, 'PROFESSIONAL', at).status).toBe('POTENTIALLY_ELIGIBLE');
    });
    it('considers Europe only with visa sponsorship or relocation, full-time, after the course', () => {
      const berlin = (o: Parameters<typeof fixtureJob>[0] = {}) => fixtureJob({ location: 'Berlin, Germany', sponsorLicensed: false, ...o });
      expect(assessEligibility(berlin(), route, 'PROFESSIONAL', at).status).toBe('NOT_ELIGIBLE'); // silent advert
      const reloc = assessEligibility(berlin({ description: 'Frontend engineer (React). We offer relocation support and visa sponsorship for the EU Blue Card.' }), route, 'PROFESSIONAL', at);
      expect(reloc).toMatchObject({ status: 'POTENTIALLY_ELIGIBLE', workContext: 'SPONSORED_AFTER_COURSE', earliestStart: '2027-01-31' });
      expect(assessEligibility(berlin({ sponsorshipMention: 'OFFERED', employmentType: 'PART_TIME' }), route, 'PROFESSIONAL', at).status).toBe('NOT_ELIGIBLE');
      expect(assessEligibility(berlin({ sponsorshipMention: 'OFFERED' }), route, 'GENERAL', at).status).toBe('NOT_ELIGIBLE');
      // "London or Berlin" is still a UK job
      expect(assessEligibility(fixtureJob({ location: 'London or Berlin', sponsorLicensed: true }), route, 'PROFESSIONAL', at).status).toBe('POTENTIALLY_ELIGIBLE');
      const a = prepareAnswers(c, 'PROFESSIONAL', [], 'SPONSORED_AFTER_COURSE', 'Amsterdam, Netherlands');
      expect(findAnswer('Will you require visa sponsorship?', a)?.answer).toBe('Yes');
      expect(findAnswer('Do you have the right to work in the EU?', a)?.answer).toMatch(/^No\. I would need visa sponsorship/);
    });
    it('skips "no sponsorship" adverts even from licensed sponsors', () => {
      expect(assessEligibility(fixtureJob({ sponsorLicensed: true, sponsorshipMention: 'NOT_OFFERED' }), route, 'PROFESSIONAL', at).status).toBe('NOT_ELIGIBLE');
    });
    it('skips silent adverts from employers not on the register', () => {
      expect(assessEligibility(fixtureJob({ sponsorLicensed: false }), route, 'PROFESSIONAL', at).status).toBe('NOT_ELIGIBLE');
    });
    it('asks for review when the register has not been loaded', () => {
      expect(assessEligibility(fixtureJob({ sponsorLicensed: null }), route, 'PROFESSIONAL', at).status).toBe('REQUIRES_REVIEW');
    });
    it('skips immediate-start roles and salaries under the configured floor', () => {
      expect(assessEligibility(fixtureJob({ sponsorLicensed: true, description: 'Immediate start required. Figma.' }), route, 'PROFESSIONAL', at).status).toBe('NOT_ELIGIBLE');
      expect(assessEligibility(fixtureJob({ sponsorLicensed: true, salaryMin: 24000, salaryMax: 26000 }), route, 'PROFESSIONAL', at).status).toBe('NOT_ELIGIBLE');
    });
    it('keeps part-time professional work (e.g. a 15h remote contract) under the student rules', () => {
      const r = assessEligibility(fixtureJob({ employmentType: 'PART_TIME', hoursPerWeek: 15 }), route, 'PROFESSIONAL', at);
      expect(r.workContext).toBe('STUDENT_PART_TIME');
      expect(r.status).toBe('ELIGIBLE');
    });
    it('uses the standard rules once the course has ended', () => {
      expect(assessEligibility(fixtureJob(), route, 'PROFESSIONAL', { now: new Date('2027-03-01') }).workContext).toBe('STANDARD');
    });
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
    // ev4 leads the summary, so it isn't repeated under Key strengths
    expect(cv.summary.flatMap((x) => x.refs)).toContain('evidence:ev4');
    expect(cv.strengths.map((s) => s.evidenceId)).not.toContain('ev4');
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
    ], 'STUDENT_PART_TIME');
    expect(findAnswer('Do you have the right to work in the UK?', answers)?.answer).toMatch(/^Yes, Student visa/);
    expect(findAnswer('Do you require sponsorship?', answers)?.answer).toBe('No');
    expect(findAnswer('Are there any restrictions on the hours you can work?', answers)?.answer).toMatch(/20 hours/);
    expect(findAnswer('Why do you want to work here?', answers)?.answer).toBe(UNKNOWN); // unverified
    expect(findAnswer('Do you hold a full driving licence?', answers)?.answer).toBe('No');
  });

  it('answers sponsorship and start date honestly for full-time roles after the course', () => {
    const lib = [{ key: 'requires_sponsorship', category: 'WORK_AUTHORISATION', question: 'Sponsorship?', patterns: ['sponsorship'], answer: 'No', track: null, evidenceIds: [], verified: true }];
    const full = prepareAnswers(c, 'PROFESSIONAL', lib, 'SPONSORED_AFTER_COURSE');
    expect(findAnswer('Will you require visa sponsorship?', full)?.answer).toBe('Yes'); // library "No" cannot override
    expect(findAnswer('When can you start?', full)?.answer).toMatch(/31 January 2027/);
    expect(findAnswer('Do you have the right to work in the UK?', full)?.answer).toMatch(/Skilled Worker/);
    const part = prepareAnswers(c, 'GENERAL', lib, 'STUDENT_PART_TIME');
    expect(findAnswer('Will you require visa sponsorship?', part)?.answer).toBe('No');
    expect(findAnswer('Do you have the right to work in the UK?', part)?.answer).toMatch(/20 hours per week/);
  });
});

describe('review status', () => {
  it('ignores draft records everywhere the agent looks', async () => {
    const { approvedOnly } = await import('./types.js');
    const c = fixtureCandidate();
    c.evidence.push({ id: 'draft1', kind: 'ACHIEVEMENT', claim: 'Draft claim about Kubernetes', source: 'Imported', allowedForCV: true, allowedForApplication: true, categories: ['PRODUCT_DESIGN'], tags: ['fintech'], employmentId: 'emp1', projectId: null, status: 'DRAFT' });
    const a = approvedOnly(c);
    const cv = buildCvContent({ candidate: a, profile: fixtureProfile('designer'), job: fixtureJob(), category: 'PRODUCT_DESIGN' });
    expect(JSON.stringify(cv)).not.toContain('Kubernetes');
    // A plan citing the draft is rejected by the validator
    expect(validateSentence('Draft claim about Kubernetes', ['evidence:draft1'], a, null, 'cv')).not.toEqual([]);
  });
});

describe('sponsor register', () => {
  it('parses the gov.uk CSV, keeps Skilled Worker rows and trading names', async () => {
    const { registerRowsFromCsv, normalizeCompany } = await import('../sponsors/register.js');
    const csv = '\uFEFF"Organisation Name","Town/City","County","Type & Rating","Route"\r\n"Monzo Bank Ltd","London",,"Worker (A rating)","Skilled Worker"\r\n"Acme Holdings t/a Acme Coffee","Newcastle upon Tyne","Tyne and Wear","Worker (A rating)","Skilled Worker"\r\n"Seasonal Farm Ltd","Kent",,"Temporary Worker (A rating)","Seasonal Worker"\r\n"Quote ""Test"" Ltd","Leeds",,"Worker (A rating)","Skilled Worker"';
    const rows = registerRowsFromCsv(csv);
    expect(rows.map((r) => r.normalizedName)).toEqual(['monzo bank', 'acme', 'acme coffee', 'quote test']);
    expect(normalizeCompany('Monzo Bank Limited')).toBe('monzo bank');
    expect(normalizeCompany('The Ramsay Group PLC')).toBe('ramsay');
  });
});

describe('income estimate', () => {
  it('caps hours at the term-time limit', async () => {
    const { estimateMonthlyPay } = await import('./matching.js');
    const job = fixtureJob({ salaryMin: 12.5, salaryMax: 12.5, salaryPeriod: 'HOUR', hoursPerWeek: 30, employmentType: 'PART_TIME' });
    expect(estimateMonthlyPay(job, 20)).toBe(Math.round((12.5 * 20 * 52) / 12));
    expect(estimateMonthlyPay(job, null)).toBe(Math.round((12.5 * 30 * 52) / 12));
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

describe('licence requirements', () => {
  const c = fixtureCandidate();
  const run = (description: string) =>
    computeMatch({ job: fixtureJob({ title: 'Steward', description, requirements: [] }), category: 'SECURITY', alternativeCategories: [], track: 'GENERAL', candidate: c, profile: fixtureProfile('kp'), eligibility: 'ELIGIBLE', minScore: 10 }).hardBlocks;
  it('only blocks when a licence is actually required', () => {
    expect(run('You must hold a valid SIA licence.')).toHaveLength(1);
    expect(run('No SIA licence required. Training provided.')).toHaveLength(0);
    expect(run("Don't have an SIA licence? We will fund your SIA licence training.")).toHaveLength(0);
  });
});

describe('general-work CVs leave out tech roles', () => {
  it('shows no design/tech employment on a kitchen porter CV', () => {
    const cv = buildCvContent({ candidate: fixtureCandidate(), profile: fixtureProfile('kp'), job: fixtureJob({ title: 'Kitchen Porter', description: 'Kitchen hygiene' }), category: 'KITCHEN_PORTER' });
    expect(cv.experience.map((e) => e.employer)).toEqual(['Campus Café']);
  });
});

describe('tailored general-work CVs', () => {
  const c = fixtureCandidate();
  c.employment.push({ id: 'school', employer: 'Example School', title: 'School Assistant', location: 'Port Harcourt', startDate: new Date('2022-01-01'), endDate: null, current: false, description: null, tags: ['school'], categories: ['CLEANING', 'TEACHING_SUPPORT'], datesText: '2022 – 2025', titleVariants: { CLEANING: 'School Assistant (Cleaning & Facilities)' } });
  c.evidence.push(
    { id: 'sc1', kind: 'EXPERIENCE', claim: 'Cleaned classrooms and emptied bins', source: 'Self', allowedForCV: true, allowedForApplication: true, categories: ['CLEANING'], tags: ['cleaning'], employmentId: 'school', projectId: null },
    { id: 'sc2', kind: 'EXPERIENCE', claim: 'Supported teachers in class', source: 'Self', allowedForCV: true, allowedForApplication: true, categories: ['TEACHING_SUPPORT'], tags: [], employmentId: 'school', projectId: null },
    { id: 'sum', kind: 'OTHER', claim: 'Reliable cleaner with school cleaning experience', source: 'Self', allowedForCV: true, allowedForApplication: true, categories: ['CLEANING'], tags: ['summary'], employmentId: null, projectId: null },
  );
  const cleaner = { ...fixtureProfile('kp'), slug: 'cleaner', categories: ['CLEANING'] as const, targetJobTitles: ['cleaner'], summaryTemplate: '{summary}. {highlight}.' };

  it('uses the candidate-supplied title variant, approximate dates and summary line', () => {
    const cv = buildCvContent({ candidate: c, profile: { ...cleaner, categories: ['CLEANING'] }, job: fixtureJob({ title: 'Cleaner', description: 'Office cleaning' }), category: 'CLEANING' });
    expect(validateCv(cv, c).valid).toBe(true);
    const school = cv.experience.find((e) => e.employer === 'Example School')!;
    expect(school.title).toBe('School Assistant (Cleaning & Facilities)');
    expect(school.datesText).toBe('2022 – 2025');
    expect(school.bullets.map((b) => b.evidenceId)).toEqual(['sc1']);
    expect(cv.summary[0].text).toBe('Reliable cleaner with school cleaning experience.');
    expect(cv.strengths.map((s) => s.evidenceId)).not.toContain('sum');
  });

  it('rejects a title that is neither the real title nor a supplied variant', () => {
    const cv = buildCvContent({ candidate: c, profile: { ...cleaner, categories: ['CLEANING'] }, job: fixtureJob({ title: 'Cleaner', description: 'Office cleaning' }), category: 'CLEANING' });
    cv.experience.find((e) => e.employer === 'Example School')!.title = 'Head of Facilities';
    expect(validateCv(cv, c).valid).toBe(false);
  });

  it('keeps general-only jobs off professional CVs', () => {
    const cv = buildCvContent({ candidate: c, profile: fixtureProfile('designer'), job: fixtureJob(), category: 'PRODUCT_DESIGN' });
    expect(cv.experience.map((e) => e.employer)).not.toContain('Example School');
  });
});

describe('ATS keyword check', () => {
  it('reports advert keywords present on the CV and genuine gaps', async () => {
    const { atsReport } = await import('./ats.js');
    const c = fixtureCandidate();
    const job = fixtureJob({ description: 'We need Figma, prototyping and Framer skills.', requirements: ['Figma', 'Prototyping', 'Framer'] });
    const cv = buildCvContent({ candidate: c, profile: fixtureProfile('designer'), job, category: 'PRODUCT_DESIGN' });
    const r = atsReport(cv, job, 'PRODUCT_DESIGN');
    expect(r.present).toEqual(expect.arrayContaining(['figma', 'prototyping']));
    expect(r.missing).toContain('framer');
    expect(JSON.stringify(cv)).not.toMatch(/framer/i); // never padded
  });
});
