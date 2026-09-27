import { assertProductionSecrets } from './config/env.js';
import { prisma } from './db.js';
import { startScheduler } from './pipeline/scheduler.js';
import { ensureDefaults } from './seed/defaults.js';

/** Background worker: runs the schedule (discovery, analysis, preparation, execution). */
assertProductionSecrets();
await ensureDefaults();
const stop = startScheduler();
console.log('HungryMan worker started — scheduled cycles run while the agent is RUNNING');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stop();
    await prisma.$disconnect();
    process.exit(0);
  });
}
