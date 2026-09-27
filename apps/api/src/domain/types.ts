import type {
  Eligibility,
  EmploymentType,
  EvidenceKind,
  JobCategory,
  RemoteType,
  Track,
} from '@prisma/client';

export type { Eligibility, EmploymentType, EvidenceKind, JobCategory, RemoteType, Track };

export const PROFESSIONAL_CATEGORIES: JobCategory[] = [
  'PRODUCT_DESIGN',
  'UX',
  'UX_RESEARCH',
  'PRODUCT_MANAGEMENT',
  'FRONTEND',
  'SOFTWARE',
  'AI',
  'TECH_GENERAL',
];

export const GENERAL_CATEGORIES: JobCategory[] = [
  'HOSPITALITY',
  'KITCHEN_PORTER',
  'CLEANING',
  'SECURITY',
  'RETAIL',
  'WAREHOUSE',
  'GENERAL_ENTRY_LEVEL',
];

export function trackForCategory(category: JobCategory): Track | null {
  if (PROFESSIONAL_CATEGORIES.includes(category)) return 'PROFESSIONAL';
  if (GENERAL_CATEGORIES.includes(category)) return 'GENERAL';
  return null;
}

/** Minimal job shape used by the pure domain functions. Prisma Job satisfies it. */
export interface JobLike {
  title: string;
  company: string;
  location?: string | null;
  description: string;
  requirements: string[];
  preferredRequirements: string[];
  remoteType: RemoteType;
  employmentType: EmploymentType;
  hoursPerWeek?: number | null;
  hoursText?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: string | null;
  sponsorshipMention?: string | null;
  sponsorshipEvidence?: string | null;
  closingDate?: Date | null;
  postedAt?: Date | null;
  sponsorLicensed?: boolean | null;
  sponsorMatchName?: string | null;
}

export interface EvidenceLike {
  id: string;
  kind: EvidenceKind;
  claim: string;
  source: string;
  date?: Date | null;
  allowedForCV: boolean;
  allowedForApplication: boolean;
  categories: JobCategory[];
  tags: string[];
  employmentId?: string | null;
  projectId?: string | null;
  status?: 'DRAFT' | 'APPROVED';
}

export interface EmploymentLike {
  id: string;
  employer: string;
  title: string;
  location?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  current: boolean;
  description?: string | null;
  tags: string[];
  categories: JobCategory[];
  sortOrder?: number;
  status?: 'DRAFT' | 'APPROVED';
}

export interface ProjectLike {
  id: string;
  name: string;
  role?: string | null;
  url?: string | null;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  shipped: boolean;
  tags: string[];
  categories: JobCategory[];
  sortOrder?: number;
  status?: 'DRAFT' | 'APPROVED';
}

export interface EducationLike {
  id: string;
  institution: string;
  qualification: string;
  field?: string | null;
  grade?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  inProgress: boolean;
  highlights: string[];
  status?: 'DRAFT' | 'APPROVED';
}

export interface SkillLike {
  id: string;
  name: string;
  aliases: string[];
  level?: string | null;
  years?: number | null;
  categories: JobCategory[];
  status?: 'DRAFT' | 'APPROVED';
}

export interface CertificationLike {
  id: string;
  name: string;
  issuer?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  categories: JobCategory[];
  status?: 'DRAFT' | 'APPROVED';
}

export interface WorkAuthLike {
  visaType: string;
  hasRightToWork: boolean;
  termTimeHoursLimit?: number | null;
  vacationWorkAllowed: boolean;
  fullTimeRestrictions?: string | null;
  sponsorshipRequired: boolean;
  courseStart?: Date | null;
  courseEnd?: Date | null;
  visaExpiry?: Date | null;
  vacationPeriods: unknown; // [{start,end,label}]
  knownRestrictions: string[];
  seekingSponsoredRoleAfterCourse?: boolean;
  sponsoredRoleMinSalary?: number | null;
}

export interface CandidateLike {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  headline?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  willingToRelocate?: boolean;
  links: unknown; // [{label,url}]
  availability: unknown;
  preferences: unknown;
  workAuthorisation?: WorkAuthLike | null;
  education: EducationLike[];
  employment: EmploymentLike[];
  projects: ProjectLike[];
  skills: SkillLike[];
  certifications: CertificationLike[];
  evidence: EvidenceLike[];
}

export interface CvProfileLike {
  id: string;
  slug: string;
  name: string;
  track: Track;
  categories: JobCategory[];
  targetJobTitles: string[];
  targetKeywords: string[];
  preferredSkills: string[];
  preferredExperience: string[];
  excludedExperience: string[];
  summaryTemplate: string;
  skillOrdering: string[];
  experienceOrdering: string;
  projectSelectionRules: unknown;
  maximumPages: number;
  template: string;
  includeCoverLetter: string;
  active: boolean;
}

export interface CandidatePreferences {
  minSalaryProfessional?: number;
  minHourlyGeneral?: number;
  remoteTypes?: string[];
  locations?: string[];
  excludedCompanies?: string[];
}

export interface CandidateAvailability {
  startDate?: string;
  noticePeriod?: string;
  daysAvailable?: string[];
  shiftsAvailable?: string[];
  notes?: string;
}

export interface LinkItem {
  label: string;
  url: string;
}

/** Only APPROVED records may be used for CVs, answers or matching. Imported drafts wait for review. */
export function approvedOnly<C extends CandidateLike>(c: C): C {
  const ok = (x: { status?: string }) => (x.status ?? 'APPROVED') === 'APPROVED';
  return {
    ...c,
    education: c.education.filter(ok),
    employment: c.employment.filter(ok),
    projects: c.projects.filter(ok),
    skills: c.skills.filter(ok),
    certifications: c.certifications.filter(ok),
    evidence: c.evidence.filter(ok),
  };
}
