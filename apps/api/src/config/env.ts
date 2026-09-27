import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  // Dashboard login. Single private user.
  ADMIN_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).optional(),
  // Bearer token used by Cowork / Claude in Chrome sessions to pull tasks.
  AGENT_API_TOKEN: z.string().optional(),

  // Files at rest are AES-256-GCM encrypted with this key (64 hex chars).
  STORAGE_DIR: z.string().default('./storage'),
  STORAGE_ENCRYPTION_KEY: z.string().optional(),

  // AI
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-opus-5'),
  AI_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  // Job sources (official APIs only)
  REED_API_KEY: z.string().optional(),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),

  BROWSER_TASK_LEASE_MINUTES: z.coerce.number().default(30),
  RUN_SCHEDULER_IN_API: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;

export function assertProductionSecrets() {
  if (env.NODE_ENV !== 'production') return;
  const missing = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'STORAGE_ENCRYPTION_KEY'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) throw new Error(`Missing required production secrets: ${missing.join(', ')}`);
}

export const integrations = {
  claude: () => env.AI_ENABLED && Boolean(env.ANTHROPIC_API_KEY),
  reed: () => Boolean(env.REED_API_KEY),
  adzuna: () => Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
};
