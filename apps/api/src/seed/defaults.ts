import type { JobCategory, Prisma, Track } from '@prisma/client';
import { prisma } from '../db.js';
import { DEFAULT_SCHEDULE } from '../pipeline/scheduler.js';
import { DEFAULT_SOURCE_CONFIG, listSources } from '../sources/registry.js';

type ProfileSeed = {
  slug: string;
  name: string;
  track: Track;
  categories: JobCategory[];
  targetJobTitles: string[];
  targetKeywords: string[];
  preferredSkills: string[];
  preferredExperience: string[];
  excludedExperience?: string[];
  summaryTemplate: string;
  maximumPages: number;
  template?: string;
  includeCoverLetter?: string;
  projectSelectionRules?: Record<string, unknown>;
};

// Summary templates contain only neutral scaffolding; every factual phrase comes from
// a {placeholder} filled with cited candidate data.
// The candidate's own profile paragraph; falls back to a built summary when there isn't one.
const PRO = '{summary}';
// Each placeholder is its own sentence, so a missing piece drops only that sentence.
const GEN = '{summary}. {availability}.';

export const DEFAULT_PROFILES: ProfileSeed[] = [
  { slug: 'product-designer', name: 'Product Designer', track: 'PROFESSIONAL', categories: ['PRODUCT_DESIGN'], targetJobTitles: ['product designer', 'digital product designer', 'interaction designer'], targetKeywords: ['figma', 'prototyping', 'design system', 'user research', 'product thinking', 'fintech', 'saas'], preferredSkills: ['Figma', 'Prototyping', 'Design systems', 'User research', 'Interaction design'], preferredExperience: ['fintech', 'saas', 'shipped'], summaryTemplate: PRO, maximumPages: 2, projectSelectionRules: { maxProjects: 4 } },
  { slug: 'ux-designer', name: 'UX Designer', track: 'PROFESSIONAL', categories: ['UX'], targetJobTitles: ['ux designer', 'ui designer', 'ux/ui designer', 'ui/ux designer', 'user experience designer', 'service designer'], targetKeywords: ['wireframes', 'user journeys', 'accessibility', 'usability testing', 'figma'], preferredSkills: ['Figma', 'Wireframing', 'Prototyping', 'Accessibility', 'Usability testing'], preferredExperience: ['saas', 'fintech'], summaryTemplate: PRO, maximumPages: 2, projectSelectionRules: { maxProjects: 3 } },
  { slug: 'ux-researcher', name: 'UX Researcher / HCI', track: 'PROFESSIONAL', categories: ['UX_RESEARCH'], targetJobTitles: ['ux researcher', 'user researcher', 'design researcher', 'hci researcher'], targetKeywords: ['user research', 'usability testing', 'interviews', 'hci', 'synthesis', 'qualitative', 'quantitative'], preferredSkills: ['User research', 'Usability testing', 'Interviews', 'Thematic analysis', 'Survey design'], preferredExperience: ['research', 'hci'], summaryTemplate: PRO, maximumPages: 2, projectSelectionRules: { maxProjects: 3 } },
  { slug: 'product-manager', name: 'Product Manager', track: 'PROFESSIONAL', categories: ['PRODUCT_MANAGEMENT'], targetJobTitles: ['product manager', 'associate product manager', 'product owner'], targetKeywords: ['roadmap', 'stakeholders', 'discovery', 'prioritisation', 'agile', 'metrics'], preferredSkills: ['Product discovery', 'Roadmapping', 'Stakeholder management', 'Agile', 'Analytics'], preferredExperience: ['product', 'fintech', 'saas'], summaryTemplate: PRO, maximumPages: 2, projectSelectionRules: { maxProjects: 2 } },
  { slug: 'frontend-developer', name: 'Frontend Developer', track: 'PROFESSIONAL', categories: ['FRONTEND'], targetJobTitles: ['frontend developer', 'front-end developer', 'front end engineer', 'react developer', 'ui engineer'], targetKeywords: ['react', 'typescript', 'javascript', 'css', 'accessibility'], preferredSkills: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS'], preferredExperience: ['engineering', 'shipped'], summaryTemplate: PRO, maximumPages: 2, projectSelectionRules: { maxProjects: 3 } },
  { slug: 'ai-software-builder', name: 'AI / Software Builder', track: 'PROFESSIONAL', categories: ['AI', 'SOFTWARE'], targetJobTitles: ['ai engineer', 'software engineer', 'full stack developer', 'ai developer', 'software developer'], targetKeywords: ['llm', 'typescript', 'python', 'api', 'node.js', 'claude'], preferredSkills: ['TypeScript', 'Python', 'Node.js', 'LLM', 'Prompt engineering'], preferredExperience: ['engineering', 'ai', 'shipped'], summaryTemplate: PRO, maximumPages: 2, projectSelectionRules: { maxProjects: 3 } },
  { slug: 'general-technology', name: 'General Technology', track: 'PROFESSIONAL', categories: ['TECH_GENERAL'], targetJobTitles: ['graduate', 'digital assistant', 'technical support', 'business analyst', 'data analyst'], targetKeywords: ['technology', 'digital', 'analysis', 'support'], preferredSkills: ['Communication', 'Problem solving', 'Excel'], preferredExperience: ['saas', 'fintech'], summaryTemplate: PRO, maximumPages: 2, projectSelectionRules: { maxProjects: 2 } },

  { slug: 'kitchen-porter', name: 'Kitchen Porter', track: 'GENERAL', categories: ['KITCHEN_PORTER', 'HOSPITALITY'], targetJobTitles: ['kitchen porter', 'kitchen assistant', 'pot washer', 'kitchen hand'], targetKeywords: ['cleaning', 'hygiene', 'teamwork', 'fast-paced', 'reliable'], preferredSkills: ['Food hygiene', 'Cleaning', 'Teamwork'], preferredExperience: ['hospitality', 'kitchen', 'cleaning', 'customer-facing'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'cleaner', name: 'Cleaner', track: 'GENERAL', categories: ['CLEANING'], targetJobTitles: ['cleaner', 'cleaning operative', 'housekeeper', 'domestic assistant'], targetKeywords: ['cleaning', 'hygiene', 'attention to detail', 'reliable'], preferredSkills: ['Cleaning', 'Attention to detail'], preferredExperience: ['cleaning', 'hospitality'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'security', name: 'Security', track: 'GENERAL', categories: ['SECURITY'], targetJobTitles: ['security officer', 'security guard', 'door supervisor', 'steward'], targetKeywords: ['sia', 'vigilant', 'customer service', 'reliable'], preferredSkills: ['Customer service', 'Communication'], preferredExperience: ['security', 'customer-facing'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'stadium-steward', name: 'Events / stadium', track: 'GENERAL', categories: ['SECURITY'], targetJobTitles: ['steward', 'matchday steward', 'event steward', 'stadium steward', 'concert steward', 'crowd safety', 'event staff', 'event crew', 'usher', 'ticket scanner', 'box office'], targetKeywords: ['crowd', 'safety', 'customer service', 'matchday', 'events', 'reliable', 'calm'], preferredSkills: ['Customer service', 'Communication', 'Teamwork'], preferredExperience: ['events', 'weddings', 'security', 'customer-facing', 'night-shifts'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'fast-food-crew', name: 'Fast food crew', track: 'GENERAL', categories: ['HOSPITALITY'], targetJobTitles: ['crew member', 'restaurant crew', 'team member', 'fast food', 'kitchen crew', 'night crew'], targetKeywords: ['customer service', 'teamwork', 'fast-paced', 'food safety', 'night shifts', 'cleaning'], preferredSkills: ['Customer service', 'Food hygiene', 'Teamwork'], preferredExperience: ['hospitality', 'customer-facing', 'night-shifts', 'kitchen'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'restaurant-waiting', name: 'Restaurant / waiting staff', track: 'GENERAL', categories: ['HOSPITALITY'], targetJobTitles: ['waiter', 'waitress', 'waiting staff', 'server', 'food runner', 'restaurant assistant', 'front of house', 'host', 'bar staff', 'bartender', 'glass collector', 'banqueting'], targetKeywords: ['table service', 'customer service', 'food service', 'busy service', 'teamwork'], preferredSkills: ['Customer service', 'Table service', 'Teamwork'], preferredExperience: ['front-of-house', 'bar', 'events', 'customer-facing'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'hotel', name: 'Hotel', track: 'GENERAL', categories: ['HOSPITALITY', 'CLEANING'], targetJobTitles: ['hotel assistant', 'room attendant', 'housekeeping assistant', 'housekeeper', 'hotel porter', 'night porter', 'hotel team member', 'hotel general assistant'], targetKeywords: ['housekeeping', 'guests', 'cleaning', 'hotel', 'presentation'], preferredSkills: ['Cleaning and hygiene', 'Customer service', 'Teamwork'], preferredExperience: ['hotel', 'housekeeping', 'cleaning', 'front-of-house'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'admin-reception', name: 'Admin / reception', track: 'GENERAL', categories: ['ADMIN_RECEPTION'], targetJobTitles: ['receptionist', 'admin assistant', 'administrative assistant', 'office assistant', 'data entry', 'front desk', 'student assistant'], targetKeywords: ['data entry', 'organisation', 'email', 'scheduling', 'customer service', 'microsoft office'], preferredSkills: ['Data entry', 'Digital literacy', 'Organisation', 'Professional communication'], preferredExperience: ['admin', 'digital', 'customer-facing'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'WHEN_REQUIRED', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'customer-service', name: 'Customer service', track: 'GENERAL', categories: ['CUSTOMER_SERVICE'], targetJobTitles: ['customer service advisor', 'customer service assistant', 'customer advisor', 'customer support', 'call centre', 'contact centre'], targetKeywords: ['customer service', 'problem solving', 'complaints', 'communication', 'systems'], preferredSkills: ['Customer service', 'Problem solving', 'Professional communication'], preferredExperience: ['customer-facing', 'digital', 'admin'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'WHEN_REQUIRED', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'teaching-assistant', name: 'Teaching / tutoring', track: 'GENERAL', categories: ['TEACHING_SUPPORT'], targetJobTitles: ['teaching assistant', 'classroom assistant', 'learning support assistant', 'tutor', 'school assistant', 'after-school club assistant', 'student support assistant'], targetKeywords: ['students', 'classroom', 'supervision', 'learning', 'communication', 'patience'], preferredSkills: ['Student support', 'Supervising children', 'Communication'], preferredExperience: ['teaching', 'children'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'WHEN_REQUIRED', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'hospitality', name: 'Hospitality', track: 'GENERAL', categories: ['HOSPITALITY'], targetJobTitles: ['waiter', 'waitress', 'bartender', 'barista', 'front of house', 'team member', 'catering assistant'], targetKeywords: ['customer service', 'teamwork', 'fast-paced', 'food hygiene'], preferredSkills: ['Customer service', 'Cash handling', 'Food hygiene'], preferredExperience: ['hospitality', 'customer-facing'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'retail', name: 'Retail', track: 'GENERAL', categories: ['RETAIL'], targetJobTitles: ['retail assistant', 'sales assistant', 'customer assistant', 'store assistant', 'cashier'], targetKeywords: ['customer service', 'tills', 'stock', 'teamwork'], preferredSkills: ['Customer service', 'Cash handling', 'Stock replenishment'], preferredExperience: ['retail', 'customer-facing', 'hospitality'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'warehouse', name: 'Warehouse', track: 'GENERAL', categories: ['WAREHOUSE'], targetJobTitles: ['warehouse operative', 'picker', 'packer', 'warehouse assistant'], targetKeywords: ['picking', 'packing', 'manual handling', 'reliable', 'accuracy'], preferredSkills: ['Manual handling', 'Teamwork'], preferredExperience: ['warehouse', 'logistics'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
  { slug: 'general-entry-level', name: 'General Entry-Level', track: 'GENERAL', categories: ['GENERAL_ENTRY_LEVEL'], targetJobTitles: ['general assistant', 'operative', 'crew member', 'assistant'], targetKeywords: ['reliable', 'teamwork', 'flexible'], preferredSkills: ['Customer service', 'Teamwork', 'Communication'], preferredExperience: ['customer-facing', 'hospitality'], summaryTemplate: GEN, maximumPages: 2, template: 'compact', includeCoverLetter: 'NEVER', projectSelectionRules: { maxProjects: 0 } },
];

/** Library entries whose answers need the user. They stay UNKNOWN (never guessed) until filled and verified. */
export const DEFAULT_ANSWERS = [
  { key: 'why_this_company', category: 'MOTIVATION', question: 'Why do you want to work for us?', patterns: ['why do you want to work', 'why are you interested in', 'why us', 'why this company'] },
  { key: 'why_this_role', category: 'MOTIVATION', question: 'Why are you interested in this role?', patterns: ['why this role', 'interested in this role', 'why have you applied'] },
  { key: 'criminal_convictions', category: 'OTHER', question: 'Do you have any unspent criminal convictions?', patterns: ['unspent', 'criminal conviction'] },
  { key: 'driving_licence', category: 'OTHER', question: 'Do you hold a full UK driving licence?', patterns: ['driving licence', 'driving license', 'full uk licence'] },
  { key: 'how_did_you_hear', category: 'OTHER', question: 'How did you hear about this role?', patterns: ['how did you hear', 'where did you hear', 'where did you see'] },
  { key: 'disability_adjustments', category: 'OTHER', question: 'Do you require any reasonable adjustments?', patterns: ['reasonable adjustment', 'adjustments'] },
  { key: 'diversity_prefer_not', category: 'OTHER', question: 'Equal opportunities monitoring questions', patterns: ['gender', 'ethnicity', 'sexual orientation', 'religion'] },
  { key: 'behavioural_teamwork', category: 'BEHAVIOURAL', question: 'Tell us about a time you worked in a team.', patterns: ['time you worked in a team', 'example of teamwork'] },
  { key: 'behavioural_pressure', category: 'BEHAVIOURAL', question: 'Describe a time you worked under pressure.', patterns: ['under pressure', 'tight deadline'] },
  { key: 'behavioural_customer', category: 'BEHAVIOURAL', question: 'Describe a time you delivered great customer service.', patterns: ['customer service', 'difficult customer'] },
];

/** Per-source pacing for applications. */
const SOURCE_LIMITS: Record<string, { enabled: boolean; maxApplicationsPerHour: number; maxApplicationsPerDay: number; cooldownSeconds: number }> = {
  manual: { enabled: true, maxApplicationsPerHour: 10, maxApplicationsPerDay: 20, cooldownSeconds: 0 },
  indeed: { enabled: true, maxApplicationsPerHour: 8, maxApplicationsPerDay: 30, cooldownSeconds: 60 },
};

/** Idempotent: creates only what's missing, never overwrites user edits. */
export async function ensureDefaults() {
  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      schedule: DEFAULT_SCHEDULE as unknown as Prisma.InputJsonValue,
      searchCriteria: {
        professional: { keywords: ['product designer', 'ux designer', 'ui ux designer', 'ux researcher', 'frontend developer', 'frontend engineer', 'react developer', 'design engineer', 'ai engineer', 'product manager', 'graduate product designer'], locations: ['Newcastle upon Tyne', 'London', 'Manchester', 'Remote'] },
        general: { keywords: ['steward', 'crew member', 'kitchen porter', 'night shift', 'cleaner', 'warehouse operative', 'retail assistant'], locations: ['Newcastle upon Tyne', 'Sunderland'] },
      },
      defaultBrowserAgent: 'claude-chrome',
    },
    update: {},
  });
  await prisma.agentStatus.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  for (const p of DEFAULT_PROFILES) {
    await prisma.cvProfile.upsert({
      where: { slug: p.slug },
      create: {
        ...p,
        excludedExperience: p.excludedExperience ?? [],
        skillOrdering: p.preferredSkills,
        template: p.template ?? 'classic',
        includeCoverLetter: p.includeCoverLetter ?? 'WHEN_REQUIRED',
        projectSelectionRules: (p.projectSelectionRules ?? {}) as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  for (const s of listSources()) {
    await prisma.sourceConfig.upsert({
      where: { source: s.id },
      create: {
        source: s.id,
        ...(SOURCE_LIMITS[s.id] ?? { enabled: false, maxApplicationsPerHour: 5, maxApplicationsPerDay: 20, cooldownSeconds: 120 }),
        config: (DEFAULT_SOURCE_CONFIG[s.id] ?? {}) as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  for (const a of DEFAULT_ANSWERS) {
    await prisma.answerTemplate.upsert({ where: { key: a.key }, create: { ...a, answer: 'UNKNOWN', verified: false }, update: {} });
  }
}
