import type { CandidateLike, CvProfileLike, JobLike } from './types.js';

/** Test fixtures — a fictional candidate. Never used at runtime. */
export function fixtureCandidate(overrides: Partial<CandidateLike> = {}): CandidateLike {
  return {
    id: 'cand1',
    fullName: 'Alex Example',
    email: 'alex@example.com',
    phone: '07000 000000',
    headline: 'Product designer and frontend builder',
    city: 'Manchester',
    postcode: 'M1 1AA',
    country: 'United Kingdom',
    willingToRelocate: false,
    links: [{ label: 'Portfolio', url: 'https://alex.example.com' }],
    availability: { startDate: 'Immediately', noticePeriod: 'None', daysAvailable: ['Saturday', 'Sunday'], shiftsAvailable: ['Evening'] },
    preferences: { locations: ['Manchester'], minSalaryProfessional: 30000, minHourlyGeneral: 11.44 },
    workAuthorisation: {
      visaType: 'Student',
      hasRightToWork: true,
      termTimeHoursLimit: 20,
      vacationWorkAllowed: true,
      fullTimeRestrictions: null,
      sponsorshipRequired: false,
      courseStart: new Date('2025-09-15'),
      courseEnd: new Date('2027-01-31'),
      visaExpiry: null,
      vacationPeriods: [{ start: '2026-12-13', end: '2027-01-11', label: 'Winter break' }],
      knownRestrictions: ['No self-employment'],
    },
    education: [
      { id: 'ed1', institution: 'University of Manchester', qualification: 'MSc', field: 'Human-Computer Interaction', grade: null, startDate: new Date('2025-09-15'), endDate: new Date('2027-01-31'), inProgress: true, highlights: [] },
    ],
    employment: [
      { id: 'emp1', employer: 'PayCo', title: 'Product Designer', location: 'Lagos', startDate: new Date('2022-01-01'), endDate: new Date('2025-06-30'), current: false, description: null, tags: ['fintech', 'saas'], categories: ['PRODUCT_DESIGN', 'UX'] },
      { id: 'emp2', employer: 'Campus Café', title: 'Barista', location: 'Manchester', startDate: new Date('2025-10-01'), endDate: null, current: true, description: null, tags: ['hospitality', 'customer-facing'], categories: ['HOSPITALITY'] },
    ],
    projects: [
      { id: 'proj1', name: 'Budget app', role: 'Designer & developer', url: null, description: null, startDate: null, endDate: null, shipped: true, tags: ['fintech'], categories: ['PRODUCT_DESIGN', 'FRONTEND'] },
    ],
    skills: [
      { id: 'sk1', name: 'Figma', aliases: [], level: 'Advanced', years: 4, categories: ['PRODUCT_DESIGN', 'UX'] },
      { id: 'sk2', name: 'User research', aliases: ['usability testing'], level: null, years: null, categories: ['PRODUCT_DESIGN', 'UX', 'UX_RESEARCH'] },
      { id: 'sk3', name: 'React', aliases: [], level: 'Working', years: 2, categories: ['FRONTEND'] },
      { id: 'sk4', name: 'Customer service', aliases: [], level: null, years: null, categories: [] },
      { id: 'sk5', name: 'Prototyping', aliases: [], level: null, years: null, categories: ['PRODUCT_DESIGN', 'UX'] },
    ],
    certifications: [{ id: 'cert1', name: 'Level 2 Food Hygiene', issuer: 'CIEH', issuedAt: new Date('2025-10-01'), expiresAt: null, categories: ['HOSPITALITY', 'KITCHEN_PORTER'] }],
    evidence: [
      { id: 'ev1', kind: 'ACHIEVEMENT', claim: 'Redesigned the onboarding flow, increasing completion by 18%', source: 'Portfolio case study', allowedForCV: true, allowedForApplication: true, categories: ['PRODUCT_DESIGN', 'UX'], tags: ['fintech'], employmentId: 'emp1', projectId: null },
      { id: 'ev2', kind: 'EXPERIENCE', claim: 'Built and maintained a design system used across 3 products', source: 'Portfolio', allowedForCV: true, allowedForApplication: true, categories: ['PRODUCT_DESIGN', 'UX', 'FRONTEND'], tags: ['saas'], employmentId: 'emp1', projectId: null },
      { id: 'ev3', kind: 'EXPERIENCE', claim: 'Served customers during peak morning rush in a busy campus café', source: 'Employer reference', allowedForCV: true, allowedForApplication: true, categories: ['HOSPITALITY', 'KITCHEN_PORTER', 'RETAIL'], tags: ['hospitality', 'customer-facing'], employmentId: 'emp2', projectId: null },
      { id: 'ev4', kind: 'TRAIT', claim: 'Follows food hygiene and cleaning procedures at every shift', source: 'Employer reference', allowedForCV: true, allowedForApplication: true, categories: ['HOSPITALITY', 'KITCHEN_PORTER', 'CLEANING'], tags: [], employmentId: null, projectId: null },
      { id: 'ev5', kind: 'TRAIT', claim: 'Comfortable working quickly under pressure in a team', source: 'Employer reference', allowedForCV: true, allowedForApplication: true, categories: [], tags: [], employmentId: null, projectId: null },
      { id: 'ev6', kind: 'ACHIEVEMENT', claim: 'Private achievement not for CVs', source: 'Self', allowedForCV: false, allowedForApplication: false, categories: [], tags: [], employmentId: null, projectId: null },
      { id: 'ev7', kind: 'PROJECT', claim: 'Designed and shipped a React budgeting app', source: 'GitHub', allowedForCV: true, allowedForApplication: true, categories: ['PRODUCT_DESIGN', 'FRONTEND'], tags: ['fintech'], employmentId: null, projectId: 'proj1' },
    ],
    ...overrides,
  };
}

export function fixtureProfile(kind: 'designer' | 'kp'): CvProfileLike {
  if (kind === 'designer') {
    return {
      id: 'p-design', slug: 'product-designer', name: 'Product Designer', track: 'PROFESSIONAL',
      categories: ['PRODUCT_DESIGN', 'UX'], targetJobTitles: ['product designer', 'ux designer'],
      targetKeywords: ['figma', 'design system', 'fintech', 'prototyping'], preferredSkills: ['Figma', 'Prototyping', 'User research'],
      preferredExperience: ['fintech', 'saas'], excludedExperience: [], summaryTemplate: '{headline} with experience in {topSkills}. {highlight}',
      skillOrdering: ['Figma'], experienceOrdering: 'RELEVANCE', projectSelectionRules: { maxProjects: 2 }, maximumPages: 2, template: 'classic', includeCoverLetter: 'WHEN_REQUIRED', active: true,
    };
  }
  return {
    id: 'p-kp', slug: 'kitchen-porter', name: 'Kitchen Porter', track: 'GENERAL',
    categories: ['KITCHEN_PORTER', 'HOSPITALITY'], targetJobTitles: ['kitchen porter', 'kitchen assistant'],
    targetKeywords: ['cleaning', 'hygiene', 'teamwork'], preferredSkills: ['Customer service'],
    preferredExperience: ['hospitality'], excludedExperience: [], summaryTemplate: 'Applying for {targetTitle} roles. {highlight} {availability}',
    skillOrdering: [], experienceOrdering: 'RELEVANCE', projectSelectionRules: { maxProjects: 0 }, maximumPages: 1, template: 'compact', includeCoverLetter: 'NEVER', active: true,
  };
}

export function fixtureJob(overrides: Partial<JobLike> = {}): JobLike {
  return {
    title: 'Product Designer',
    company: 'Fintech Ltd',
    location: 'Manchester',
    description: 'We are looking for a product designer. Requirements:\n- Figma\n- Prototyping\n- Design systems\n- User research',
    requirements: ['Figma', 'Prototyping', 'Design systems', 'User research'],
    preferredRequirements: [],
    remoteType: 'HYBRID',
    employmentType: 'FULL_TIME',
    hoursPerWeek: null,
    salaryMin: 40000,
    salaryMax: 50000,
    salaryPeriod: 'YEAR',
    sponsorshipMention: 'NONE',
    closingDate: null,
    ...overrides,
  };
}
