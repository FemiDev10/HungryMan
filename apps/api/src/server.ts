import { createApp } from './app.js';
import { assertProductionSecrets, env, integrations } from './config/env.js';
import { prisma } from './db.js';
import { startScheduler } from './pipeline/scheduler.js';
import { ensureDefaults } from './seed/defaults.js';

assertProductionSecrets();
await ensureDefaults();

const app = createApp();
app.listen(env.PORT, () => {
  console.log(`HungryMan API on :${env.PORT}`);
  console.log(`  Claude: ${integrations.claude() ? 'enabled' : 'not configured (deterministic engine)'}`);
  if (!env.ADMIN_PASSWORD) console.warn('  ADMIN_PASSWORD not set — dev password "changeme" is active');
  if (!env.STORAGE_ENCRYPTION_KEY) console.warn('  STORAGE_ENCRYPTION_KEY not set — generated files are stored unencrypted');
});

if (env.RUN_SCHEDULER_IN_API) {
  startScheduler();
  console.log('  Scheduler running in API process');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
