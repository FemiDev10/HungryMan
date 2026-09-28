import type { JobCategory } from '@prisma/client';

/**
 * Skills commonly named in adverts, per category. Used only to *detect* what a job asks
 * for, so the matcher can list missing skills. It never adds anything to a CV.
 */
export const SKILL_VOCABULARY: Partial<Record<JobCategory, string[]>> = {
  PRODUCT_DESIGN: ['figma', 'sketch', 'prototyping', 'design systems', 'user research', 'interaction design', 'visual design', 'wireframing', 'usability testing', 'accessibility', 'framer', 'adobe xd', 'motion design', 'design thinking', 'product thinking', 'a/b testing'],
  UX: ['figma', 'wireframing', 'prototyping', 'user journeys', 'information architecture', 'usability testing', 'accessibility', 'wcag', 'user research', 'personas', 'design systems', 'html', 'css'],
  UX_RESEARCH: ['user interviews', 'usability testing', 'surveys', 'diary studies', 'thematic analysis', 'quantitative research', 'qualitative research', 'statistics', 'hci', 'research synthesis', 'card sorting', 'dovetail', 'spss', 'r'],
  PRODUCT_MANAGEMENT: ['roadmapping', 'agile', 'scrum', 'jira', 'stakeholder management', 'product discovery', 'okrs', 'analytics', 'sql', 'a/b testing', 'user stories', 'prioritisation', 'go-to-market'],
  FRONTEND: ['react', 'typescript', 'javascript', 'html', 'css', 'next.js', 'vue', 'angular', 'tailwind', 'redux', 'jest', 'testing library', 'accessibility', 'webpack', 'vite', 'graphql', 'rest apis', 'git'],
  SOFTWARE: ['node.js', 'typescript', 'javascript', 'python', 'java', 'go', 'c#', 'sql', 'postgresql', 'aws', 'docker', 'kubernetes', 'rest apis', 'graphql', 'git', 'ci/cd', 'microservices', 'testing'],
  AI: ['python', 'llm', 'prompt engineering', 'rag', 'embeddings', 'pytorch', 'tensorflow', 'machine learning', 'claude api', 'openai api', 'langchain', 'vector databases', 'evaluation', 'fine-tuning', 'typescript'],
  TECH_GENERAL: ['microsoft office', 'excel', 'sql', 'troubleshooting', 'customer support', 'jira', 'data analysis', 'communication'],
  KITCHEN_PORTER: ['food hygiene', 'food safety', 'cleaning', 'dishwashing', 'coshh', 'manual handling', 'teamwork', 'level 2 food hygiene'],
  CLEANING: ['cleaning', 'coshh', 'hygiene', 'housekeeping', 'health and safety', 'attention to detail', 'manual handling'],
  SECURITY: ['sia licence', 'cctv', 'patrolling', 'first aid', 'conflict management', 'access control', 'report writing', 'customer service'],
  HOSPITALITY: ['customer service', 'food hygiene', 'barista', 'cash handling', 'epos', 'teamwork', 'food safety', 'bar work', 'table service'],
  RETAIL: ['customer service', 'cash handling', 'till', 'stock replenishment', 'merchandising', 'epos', 'teamwork', 'visual merchandising'],
  WAREHOUSE: ['picking', 'packing', 'forklift', 'manual handling', 'rf scanner', 'stock control', 'health and safety', 'flt licence'],
  ADMIN_RECEPTION: ['data entry', 'microsoft office', 'excel', 'email', 'scheduling', 'filing', 'customer service', 'organisation', 'communication'],
  CUSTOMER_SERVICE: ['customer service', 'communication', 'problem solving', 'complaint handling', 'crm', 'email', 'phone manner', 'teamwork'],
  TEACHING_SUPPORT: ['supporting students', 'classroom support', 'supervising children', 'communication', 'patience', 'safeguarding', 'organisation'],
  GENERAL_ENTRY_LEVEL: ['customer service', 'teamwork', 'communication', 'reliability', 'manual handling', 'time management'],
};

/** Licences/certifications that are hard requirements when an advert demands them. */
export const HARD_REQUIREMENT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(sia (licence|license|badge)|valid sia)\b/i, label: 'SIA licence' },
  { pattern: /\b(full (uk )?driving licen[cs]e|must (be able to )?drive)\b/i, label: 'Driving licence' },
  { pattern: /\b(flt|forklift) (licen[cs]e|certificate|certified)\b/i, label: 'Forklift licence' },
  { pattern: /\b(dbs check required|enhanced dbs)\b/i, label: 'DBS check' },
  { pattern: /\bsecurity clearance\b|\bsc cleared\b|\bdv cleared\b/i, label: 'Security clearance' },
];
