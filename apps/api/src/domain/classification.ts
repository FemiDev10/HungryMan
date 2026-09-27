import type { JobCategory } from '@prisma/client';
import { countPhrase, hasPhrase } from './text.js';

export interface JobClassification {
  category: JobCategory;
  confidence: number;
  alternativeCategories: JobCategory[];
  reasoning: string;
}

interface Rule {
  category: JobCategory;
  titlePhrases: string[]; // strong signal
  bodyPhrases: string[]; // weak signal
}

// Order matters for ties: more specific categories first.
const RULES: Rule[] = [
  {
    category: 'UX_RESEARCH',
    titlePhrases: ['ux researcher', 'user researcher', 'design researcher', 'research ops', 'hci researcher', 'human computer interaction', 'usability researcher'],
    bodyPhrases: ['user research', 'usability testing', 'interviews', 'research synthesis', 'hci', 'qualitative research', 'quantitative research', 'diary studies'],
  },
  {
    category: 'PRODUCT_DESIGN',
    titlePhrases: ['product designer', 'digital product designer', 'interaction designer', 'design lead', 'visual designer'],
    bodyPhrases: ['figma', 'prototyping', 'design system', 'design systems', 'end-to-end design', 'interaction design', 'product design'],
  },
  {
    category: 'UX',
    titlePhrases: ['ux designer', 'ui designer', 'ux/ui', 'ui/ux', 'ux ui', 'ui ux', 'user experience designer', 'service designer', 'content designer', 'ux writer'],
    bodyPhrases: ['wireframes', 'user journeys', 'user experience', 'accessibility', 'information architecture', 'user flows'],
  },
  {
    category: 'PRODUCT_MANAGEMENT',
    titlePhrases: ['product manager', 'product owner', 'associate product manager', 'apm', 'technical product manager', 'product lead'],
    bodyPhrases: ['roadmap', 'stakeholders', 'backlog', 'prioritisation', 'prioritization', 'okrs', 'product discovery', 'go-to-market'],
  },
  {
    category: 'AI',
    titlePhrases: ['ai engineer', 'machine learning', 'ml engineer', 'llm', 'applied ai', 'ai developer', 'prompt engineer', 'ai product', 'data scientist'],
    bodyPhrases: ['llm', 'large language model', 'machine learning', 'generative ai', 'rag', 'pytorch', 'openai', 'anthropic', 'claude', 'embeddings'],
  },
  {
    category: 'FRONTEND',
    titlePhrases: ['frontend', 'front-end', 'front end', 'react developer', 'ui engineer', 'web developer', 'javascript developer'],
    bodyPhrases: ['react', 'typescript', 'javascript', 'css', 'html', 'next.js', 'vue', 'tailwind', 'accessibility'],
  },
  {
    category: 'SOFTWARE',
    titlePhrases: ['software engineer', 'software developer', 'full stack', 'full-stack', 'backend', 'back-end', 'developer', 'programmer', 'engineer'],
    bodyPhrases: ['node.js', 'python', 'java', 'api', 'microservices', 'sql', 'aws', 'docker', 'ci/cd', 'git'],
  },
  {
    category: 'TECH_GENERAL',
    titlePhrases: ['it support', 'technical support', 'helpdesk', 'service desk', 'digital assistant', 'technology graduate', 'tech graduate', 'qa tester', 'data analyst', 'business analyst'],
    bodyPhrases: ['technology', 'digital', 'saas', 'software', 'it systems'],
  },
  {
    category: 'KITCHEN_PORTER',
    titlePhrases: ['kitchen porter', 'kp', 'kitchen assistant', 'pot wash', 'dishwasher', 'kitchen hand', 'porter'],
    bodyPhrases: ['washing up', 'pots and pans', 'kitchen hygiene', 'dishes', 'kitchen', 'chefs'],
  },
  {
    category: 'CLEANING',
    titlePhrases: ['cleaner', 'cleaning operative', 'housekeeper', 'domestic assistant', 'janitor', 'custodian', 'room attendant'],
    bodyPhrases: ['cleaning', 'hoovering', 'vacuuming', 'mopping', 'sanitising', 'coshh', 'housekeeping'],
  },
  {
    category: 'SECURITY',
    titlePhrases: ['security officer', 'security guard', 'door supervisor', 'steward', 'patrol officer', 'cctv operator', 'concierge security'],
    bodyPhrases: ['sia licence', 'sia license', 'patrols', 'cctv', 'access control', 'security'],
  },
  {
    category: 'HOSPITALITY',
    titlePhrases: ['waiter', 'waitress', 'waiting staff', 'bartender', 'bar staff', 'barista', 'front of house', 'host', 'hotel receptionist', 'team member', 'food and beverage', 'catering assistant', 'server'],
    bodyPhrases: ['guests', 'customer service', 'restaurant', 'hotel', 'bar', 'coffee', 'food safety', 'hospitality'],
  },
  {
    category: 'RETAIL',
    titlePhrases: ['retail assistant', 'sales assistant', 'customer assistant', 'store assistant', 'shop assistant', 'cashier', 'checkout', 'stock assistant', 'merchandiser', 'retail'],
    bodyPhrases: ['tills', 'till', 'store', 'shop floor', 'merchandising', 'customers', 'stock replenishment'],
  },
  {
    category: 'WAREHOUSE',
    titlePhrases: ['warehouse', 'picker', 'packer', 'warehouse operative', 'forklift', 'delivery driver', 'logistics operative', 'order picker', 'loader'],
    bodyPhrases: ['picking', 'packing', 'forklift', 'pallets', 'distribution centre', 'logistics', 'manual handling'],
  },
  {
    category: 'GENERAL_ENTRY_LEVEL',
    titlePhrases: ['general assistant', 'general operative', 'labourer', 'crew member', 'entry level', 'assistant', 'operative', 'temp'],
    bodyPhrases: ['no experience required', 'no experience necessary', 'training provided', 'flexible hours', 'entry level'],
  },
];

/** Deterministic keyword classifier. Used directly when Claude is unavailable, and as a sanity check otherwise. */
export function classifyJobHeuristic(title: string, description: string): JobClassification {
  const scores = new Map<JobCategory, number>();
  const signals = new Map<JobCategory, string[]>();

  for (const rule of RULES) {
    let score = 0;
    const hit: string[] = [];
    for (const phrase of rule.titlePhrases) {
      if (hasPhrase(title, phrase)) {
        // Longer phrases are more specific.
        score += 6 + phrase.split(' ').length * 2;
        hit.push(`title:"${phrase}"`);
      }
    }
    for (const phrase of rule.bodyPhrases) {
      const n = Math.min(countPhrase(description, phrase), 3);
      if (n > 0) {
        score += n;
        hit.push(`body:"${phrase}"×${n}`);
      }
    }
    if (score > 0) {
      scores.set(rule.category, score);
      signals.set(rule.category, hit);
    }
  }

  // "engineer"/"developer" are generic — don't let them beat a specific category.
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { category: 'OTHER', confidence: 0.2, alternativeCategories: [], reasoning: 'No category keywords found in title or description.' };
  }

  const [top, topScore] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  const titleHit = (signals.get(top) ?? []).some((s) => s.startsWith('title:'));
  let confidence = Math.min(0.97, 0.35 + 0.45 * (topScore / total) + (titleHit ? 0.2 : 0) - (second === topScore ? 0.15 : 0));
  confidence = Math.max(0.1, Math.round(confidence * 100) / 100);

  return {
    category: top,
    confidence,
    alternativeCategories: ranked.slice(1, 4).filter(([, v]) => v >= topScore * 0.4).map(([c]) => c),
    reasoning: `Keyword classifier: ${(signals.get(top) ?? []).slice(0, 6).join(', ')}.`,
  };
}
