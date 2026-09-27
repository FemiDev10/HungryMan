import { prisma } from '../db.js';
import { ensureDefaults } from './defaults.js';
import { seedDemoCandidate } from './demo.js';

/** `npm run db:seed` → default profiles/settings. `npm run db:seed -- --demo` → also a fictional demo candidate. */
await ensureDefaults();
console.log('Defaults ensured: settings, 14 CV profiles, sources, answer library.');
if (process.argv.includes('--demo')) {
  await seedDemoCandidate();
  console.log('Demo candidate created (fictional). Browser agent set to "mock". Import jobs from the dashboard or run the demo test.');
}
await prisma.$disconnect();
