import fs from 'node:fs';
import path from 'node:path';
import { CvImportSchema } from '../ai/claude.js';
import { prisma } from '../db.js';
import { getCandidate } from '../lib/candidate.js';
import { saveCvImport } from '../lib/cvImport.js';
import { ensureDefaults } from './defaults.js';

/**
 * Load a profile JSON (same shape as the CV importer's output, plus optional
 * `workAuthorisation`) as DRAFT records — for when there's no Claude API key.
 *   npm run profile:import -- path/to/profile.json
 * Keep that file outside the repo: it contains personal data.
 */
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run profile:import -- path/to/profile.json');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = CvImportSchema.parse(raw);
await ensureDefaults();
const c = await getCandidate();
const counts = await saveCvImport(c.id, data, raw.sourceFile ?? path.basename(file));
console.log('Imported as drafts:', counts);

if (raw.workAuthorisation) {
  const w = raw.workAuthorisation;
  const d = (v: string | null | undefined) => (v ? new Date(v) : null);
  const wa = { ...w, courseStart: d(w.courseStart), courseEnd: d(w.courseEnd), visaExpiry: d(w.visaExpiry) };
  await prisma.workAuthorisation.upsert({ where: { candidateId: c.id }, create: { ...wa, candidateId: c.id }, update: wa });
  console.log('Work authorisation set:', w.visaType, `course ${w.courseStart} → ${w.courseEnd}`);
}
console.log('Next: open Candidate profile in the dashboard, check each draft, and approve.');
await prisma.$disconnect();
