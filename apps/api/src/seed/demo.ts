import { prisma } from '../db.js';
import { getCandidate } from '../lib/candidate.js';

/**
 * Obviously-fictional demo data so the dashboard can be explored before real data is
 * entered. Never mixes with a real profile: refuses to run if a candidate already exists
 * with a name other than the placeholder.
 */
export async function seedDemoCandidate() {
  const existing = await prisma.candidate.findFirst();
  if (existing && existing.fullName !== 'Your Name' && existing.fullName !== 'Demo Candidate') {
    throw new Error('A real candidate profile exists — refusing to overwrite it with demo data.');
  }
  if (existing) await prisma.candidate.delete({ where: { id: existing.id } });

  const c = await prisma.candidate.create({
    data: {
      fullName: 'Demo Candidate',
      email: 'demo@example.com',
      phone: '07000 000000',
      headline: 'Product designer and frontend builder',
      city: 'London',
      postcode: 'E1 6AN',
      country: 'United Kingdom',
      links: [{ label: 'Portfolio', url: 'https://portfolio.example.com' }],
      availability: { startDate: 'Immediately', noticePeriod: 'None', daysAvailable: ['Friday', 'Saturday', 'Sunday'], shiftsAvailable: ['Evening', 'Weekend'] },
      preferences: { locations: ['London', 'Remote'], minSalaryProfessional: 32000, minHourlyGeneral: 12.21, remoteTypes: ['REMOTE', 'HYBRID', 'ONSITE'] },
      workAuthorisation: {
        create: {
          visaType: 'Student (demo — configure your own)',
          hasRightToWork: true,
          termTimeHoursLimit: 20,
          vacationWorkAllowed: true,
          sponsorshipRequired: false,
          fullTimeRestrictions: 'Permanent full-time roles only from after course end date',
          courseStart: new Date('2025-09-22'),
          courseEnd: new Date('2027-01-15'),
          vacationPeriods: [{ start: '2026-12-12', end: '2027-01-10', label: 'Winter break' }],
          knownRestrictions: ['No self-employment'],
        },
      },
      education: { create: [{ institution: 'Example University', qualification: 'MSc', field: 'Human-Computer Interaction', startDate: new Date('2025-09-22'), endDate: new Date('2027-01-15'), inProgress: true }] },
      skills: {
        create: [
          { name: 'Figma', level: 'Advanced', categories: ['PRODUCT_DESIGN', 'UX'] },
          { name: 'Prototyping', categories: ['PRODUCT_DESIGN', 'UX'] },
          { name: 'User research', aliases: ['usability testing', 'user interviews'], categories: ['PRODUCT_DESIGN', 'UX', 'UX_RESEARCH'] },
          { name: 'Design systems', categories: ['PRODUCT_DESIGN', 'UX', 'FRONTEND'] },
          { name: 'React', categories: ['FRONTEND'] },
          { name: 'TypeScript', categories: ['FRONTEND', 'SOFTWARE', 'AI'] },
          { name: 'Customer service', categories: [] },
          { name: 'Teamwork', categories: [] },
        ],
      },
      certifications: { create: [{ name: 'Level 2 Food Hygiene and Safety', issuer: 'Demo Awarding Body', issuedAt: new Date('2025-10-01'), categories: ['HOSPITALITY', 'KITCHEN_PORTER'] }] },
    },
  });
  const design = await prisma.employment.create({ data: { candidateId: c.id, employer: 'Demo Fintech Ltd', title: 'Product Designer', location: 'Remote', startDate: new Date('2022-02-01'), endDate: new Date('2025-07-31'), employmentType: 'FULL_TIME', tags: ['fintech', 'saas', 'shipped'], categories: ['PRODUCT_DESIGN', 'UX', 'FRONTEND'] } });
  const cafe = await prisma.employment.create({ data: { candidateId: c.id, employer: 'Demo Campus Café', title: 'Barista (part-time)', location: 'London', startDate: new Date('2025-10-06'), current: true, employmentType: 'PART_TIME', tags: ['hospitality', 'customer-facing'], categories: ['HOSPITALITY', 'KITCHEN_PORTER', 'RETAIL', 'CLEANING'] } });
  const project = await prisma.project.create({ data: { candidateId: c.id, name: 'Budget planner app', role: 'Designer and developer', shipped: true, tags: ['fintech', 'shipped'], categories: ['PRODUCT_DESIGN', 'FRONTEND'] } });
  await prisma.evidence.createMany({
    data: [
      { candidateId: c.id, kind: 'ACHIEVEMENT', claim: 'Redesigned the savings onboarding flow, lifting completion from 41% to 58% in A/B tests', source: 'Portfolio case study + analytics export (demo)', categories: ['PRODUCT_DESIGN', 'UX'], tags: ['fintech'], employmentId: design.id },
      { candidateId: c.id, kind: 'EXPERIENCE', claim: 'Built and maintained a Figma design system used by 3 product squads', source: 'Portfolio (demo)', categories: ['PRODUCT_DESIGN', 'UX', 'FRONTEND'], tags: ['saas'], employmentId: design.id },
      { candidateId: c.id, kind: 'EXPERIENCE', claim: 'Ran weekly usability tests with customers and turned findings into prioritised design changes', source: 'Research repository (demo)', categories: ['PRODUCT_DESIGN', 'UX', 'UX_RESEARCH'], tags: ['fintech'], employmentId: design.id },
      { candidateId: c.id, kind: 'EXPERIENCE', claim: 'Serve customers and keep the counter and equipment clean during busy morning rushes', source: 'Employer reference (demo)', categories: ['HOSPITALITY', 'KITCHEN_PORTER', 'RETAIL', 'CLEANING'], tags: ['hospitality', 'customer-facing'], employmentId: cafe.id },
      { candidateId: c.id, kind: 'EXPERIENCE', claim: 'Follow opening and closing checklists, including cleaning and food hygiene procedures', source: 'Employer reference (demo)', categories: ['HOSPITALITY', 'KITCHEN_PORTER', 'CLEANING'], tags: ['hospitality'], employmentId: cafe.id },
      { candidateId: c.id, kind: 'TRAIT', claim: 'Reliable: have not missed a scheduled shift since starting at the café', source: 'Employer reference (demo)', categories: [], tags: [] },
      { candidateId: c.id, kind: 'TRAIT', claim: 'Comfortable working quickly and calmly as part of a small team under pressure', source: 'Employer reference (demo)', categories: [], tags: [] },
      { candidateId: c.id, kind: 'PROJECT', claim: 'Designed and shipped a React budgeting app from research to release', source: 'GitHub repository (demo)', categories: ['PRODUCT_DESIGN', 'FRONTEND'], tags: ['fintech', 'shipped'], projectId: project.id },
    ],
  });
  await prisma.answerTemplate.updateMany({ where: { key: 'driving_licence' }, data: { answer: 'No', verified: true } });
  await prisma.answerTemplate.updateMany({ where: { key: 'criminal_convictions' }, data: { answer: 'No', verified: true } });
  await prisma.settings.update({ where: { id: 1 }, data: { defaultBrowserAgent: 'mock' } });
  return getCandidate();
}

export const DEMO_JOBS = [
  { url: 'https://example.com/jobs/product-designer', title: 'Product Designer', company: 'Demo Bank', location: 'London', description: 'Hybrid, full-time permanent role.\nRequirements:\n- Figma\n- Prototyping\n- Design systems\n- User research\nSalary £45,000 - £55,000 per annum. Please include a cover letter.' },
  { url: 'https://example.com/jobs/kitchen-porter', title: 'Kitchen Porter', company: 'Demo Bistro', location: 'London', description: 'Part-time, 16 hours per week, evenings and weekends. £12.50 per hour.\nWhat you will do:\n- Washing up pots and pans\n- Keeping the kitchen clean and hygienic\nNo experience necessary, training provided.' },
  { url: 'https://example.com/jobs/retail-captcha', title: 'Retail Assistant', company: 'Demo Stores', location: 'London', description: 'Part-time 12 hours per week on the tills and shop floor. Customer service focus. £12.21 per hour.' },
  { url: 'https://example.com/jobs/cleaner-fulltime', title: 'Cleaner', company: 'Demo Facilities', location: 'London', description: 'Full-time 40 hours per week office cleaning. £12.60 per hour.' },
  { url: 'https://example.com/jobs/security', title: 'Security Officer', company: 'Demo Guarding', location: 'London', description: 'Must hold a valid SIA licence. 12 hours per week weekend patrols.' },
];
