/**
 * End-to-end pipeline test against a real Postgres database, driving the HTTP API.
 * Requires TEST_DATABASE_URL (a disposable database — it is wiped).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DB = process.env.TEST_DATABASE_URL;
// Safety: only ever run against a database whose name says it is disposable.
const suite = TEST_DB && /\/[\w-]*test[\w-]*(\?|$)/.test(TEST_DB) ? describe : describe.skip;

suite('end-to-end pipeline (mock browser agent)', () => {
  let agent: ReturnType<typeof request.agent>;
  let prisma: typeof import('./db.js').prisma;
  let DEMO_JOBS: typeof import('./seed/demo.js').DEMO_JOBS;
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-test-'));

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: TEST_DB,
      NODE_ENV: 'test',
      ADMIN_PASSWORD: 'test-password',
      SESSION_SECRET: 'test-secret',
      AGENT_API_TOKEN: 'agent-token',
      STORAGE_DIR: storageDir,
      STORAGE_ENCRYPTION_KEY: 'a'.repeat(64),
      AI_ENABLED: 'false',
    });
    execSync('npx prisma migrate deploy', { env: process.env, stdio: 'ignore' });
    ({ prisma } = await import('./db.js'));
    // Clear rows left by a previous run (test database only — see guard above).
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    const { ensureDefaults } = await import('./seed/defaults.js');
    const demo = await import('./seed/demo.js');
    DEMO_JOBS = demo.DEMO_JOBS;
    await ensureDefaults();
    await demo.seedDemoCandidate();
    const { createApp } = await import('./app.js');
    agent = request.agent(createApp());
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('rejects unauthenticated requests and accepts login', async () => {
    await agent.get('/api/candidate').expect(401);
    await agent.post('/api/auth/login').send({ password: 'wrong' }).expect(401);
    await agent.post('/api/auth/login').send({ password: 'test-password' }).expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('imports and analyses jobs into the correct outcomes', async () => {
    // Pin "today" to term time for deterministic eligibility.
    await agent.put('/api/settings').send({ termTimeOverride: 'TERM' }).expect(200);
    const results: Record<string, { status: string; category: string; profile: string | null; eligibility: string }> = {};
    for (const j of DEMO_JOBS) {
      const r = await agent.post('/api/jobs/import').send(j).expect(201);
      results[j.title] = { status: r.body.application.status, category: r.body.job.category, profile: r.body.application.cvProfile?.slug ?? null, eligibility: r.body.job.eligibility };
    }
    expect(results['Kitchen Porter']).toMatchObject({ status: 'QUEUED', category: 'KITCHEN_PORTER', profile: 'kitchen-porter', eligibility: 'ELIGIBLE' });
    expect(results['Retail Assistant']).toMatchObject({ status: 'QUEUED', category: 'RETAIL', profile: 'retail' });
    // 40h/week general work in term time exceeds the configured 20h limit
    expect(results['Cleaner']).toMatchObject({ status: 'REJECTED_BY_RULE', eligibility: 'NOT_ELIGIBLE' });
    // Licence required that the candidate doesn't have
    expect(results['Security Officer'].status).toBe('REJECTED_BY_RULE');
    // Full-time professional role during term: good match, but eligibility needs a human decision
    expect(results['Product Designer']).toMatchObject({ status: 'NEEDS_HUMAN', profile: 'product-designer', eligibility: 'REQUIRES_REVIEW' });

    // Dedupe: same job again from "another source"
    const dup = await agent.post('/api/jobs/import').send({ ...DEMO_JOBS[1], url: 'https://other.example.com/kp' }).expect(201);
    expect(dup.body.application.status).toBe('DUPLICATE');
  });

  it('human review requeues the professional role', async () => {
    const ex = await agent.get('/api/applications?view=exceptions').expect(200);
    const pd = ex.body.items.find((i: { job: { title: string } }) => i.job.title === 'Product Designer');
    await agent.post(`/api/applications/${pd.id}/resolve`).send({ action: 'REQUEUE', note: 'Start date is after my course ends' }).expect(200);
  });

  it('runs a full cycle: tailored CVs, validation, browser execution, verification', async () => {
    await agent.post('/api/agent/control').send({ action: 'RESUME' }).expect(200);
    const { runCycle } = await import('./pipeline/orchestrator.js');
    const summary = await runCycle('FULL_CYCLE', { manual: true });
    expect(summary).not.toBeNull();

    const hist = await agent.get('/api/applications?view=history&pageSize=50').expect(200);
    const by = (t: string) => hist.body.items.find((i: { job: { title: string }; status: string }) => i.job.title === t && i.status !== 'DUPLICATE');

    const kp = by('Kitchen Porter');
    expect(kp.status).toBe('SUBMITTED');
    expect(kp.simulated).toBe(true);
    expect(kp.cvFileName).toMatch(/^CV-\d{4}-\d{2}-\d{2}-KITCHEN-PORTER-\d{4}\.pdf$/);

    const pd = by('Product Designer');
    expect(pd.status).toBe('SUBMITTED');
    expect(pd.cvFileName).toMatch(/PRODUCT-DESIGNER/);

    // CAPTCHA → BLOCKED, and it did not stop the queue
    expect(by('Retail Assistant').status).toBe('BLOCKED');

    // Detail: exact CV + answers recorded, CV validated, cover letter only where asked
    const detail = await agent.get(`/api/applications/${pd.id}`).expect(200);
    const cv = detail.body.documents.find((d: { kind: string }) => d.kind === 'CV');
    expect(cv.validation.valid).toBe(true);
    expect(detail.body.documents.some((d: { kind: string }) => d.kind === 'COVER_LETTER')).toBe(true);
    expect(detail.body.answerSets[0].answers.find((a: { key: string }) => a.key === 'right_to_work_uk').answer).toBe('Yes');
    const types = detail.body.audit.map((a: { type: string }) => a.type);
    for (const t of ['JOB_DISCOVERED', 'JOB_CLASSIFIED', 'MATCH_CALCULATED', 'CV_GENERATED', 'CV_VALIDATED', 'BROWSER_STARTED', 'CV_UPLOADED', 'SUBMISSION_CONFIRMED']) expect(types).toContain(t);
    const kpDetail = await agent.get(`/api/applications/${kp.id}`).expect(200);
    expect(kpDetail.body.documents.some((d: { kind: string }) => d.kind === 'COVER_LETTER')).toBe(false);

    // Kitchen porter CV contains no design claims
    const kpCv = kpDetail.body.documents.find((d: { kind: string }) => d.kind === 'CV');
    const kpText = JSON.stringify(kpCv.content);
    expect(kpText).not.toMatch(/Figma|design system|onboarding flow/i);

    // The stored PDF is encrypted at rest but downloads as a PDF
    const dl = await agent.get(`/api/documents/${cv.id}/download`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(dl.status).toBe(200);
    expect((dl.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const onDisk = await prisma.document.findUniqueOrThrow({ where: { id: cv.id } });
    expect(fs.readFileSync(path.join(storageDir, onDisk.storageKey)).subarray(0, 6).toString()).toBe('HMENC1');

    const overview = await agent.get('/api/dashboard/overview').expect(200);
    expect(overview.body.today.submitted).toBeGreaterThanOrEqual(2);
    expect(overview.body.today.needsAttention).toBe(1);
  });

  it('supports the Cowork handoff protocol', async () => {
    // New job dispatched to the cowork handoff agent
    await agent.put('/api/settings').send({ defaultBrowserAgent: 'cowork' }).expect(200);
    const imp = await agent.post('/api/jobs/import').send({ url: 'https://example.com/jobs/barista', title: 'Barista', company: 'Demo Coffee', location: 'London', description: 'Part-time barista, 15 hours per week, weekends. Coffee and customer service. £12.40 per hour.' }).expect(201);
    expect(imp.body.application.status).toBe('QUEUED');
    const { runCycle } = await import('./pipeline/orchestrator.js');
    await runCycle('FULL_CYCLE', { manual: true });
    const app = await agent.get(`/api/applications/${imp.body.application.id}`).expect(200);
    expect(app.body.application.status).toBe('BROWSER_EXECUTING');

    const bot = request(await import('./app.js').then((m) => m.createApp()));
    await bot.get('/api/agent-tasks/next?agent=cowork').expect(401);
    const next = await bot.get('/api/agent-tasks/next?agent=cowork').set('Authorization', 'Bearer agent-token').expect(200);
    expect(next.body.task.job.company).toBe('Demo Coffee');
    expect(next.body.task.rules.join(' ')).toMatch(/CAPTCHA/);
    await bot.get('/api/agent-tasks/next?agent=cowork').set('Authorization', 'Bearer agent-token').expect(204);

    const cvPath = next.body.task.cvFile.downloadPath;
    await bot.get(cvPath).set('Authorization', 'Bearer agent-token').expect(200);
    const otherDoc = await prisma.document.findFirstOrThrow({ where: { applicationId: { not: imp.body.application.id } } });
    await bot.get(`/api/agent-tasks/${next.body.taskId}/files/${otherDoc.id}`).set('Authorization', 'Bearer agent-token').expect(403);

    await bot.post(`/api/agent-tasks/${next.body.taskId}/events`).set('Authorization', 'Bearer agent-token').send({ type: 'CV_UPLOADED', detail: 'Uploaded CV' }).expect(200);
    // Clicked submit but no evidence → SUBMISSION_ATTEMPTED, not SUBMITTED
    const res1 = await bot.post(`/api/agent-tasks/${next.body.taskId}/result`).set('Authorization', 'Bearer agent-token').send({ outcome: 'SUBMITTED', stepReached: 'submit' }).expect(200);
    expect(res1.body.applicationStatus).toBe('SUBMISSION_ATTEMPTED');
    await bot.post(`/api/agent-tasks/${next.body.taskId}/result`).set('Authorization', 'Bearer agent-token').send({ outcome: 'SUBMITTED' }).expect(404);

    // Human confirms after checking email
    await agent.post(`/api/applications/${imp.body.application.id}/resolve`).send({ action: 'MARK_SUBMITTED', confirmationNumber: 'ABC123' }).expect(200);
    const done = await agent.get(`/api/applications/${imp.body.application.id}`).expect(200);
    expect(done.body.application.status).toBe('SUBMITTED');
    expect(done.body.application.simulated).toBe(false);
  });

  it('respects daily targets', async () => {
    await agent.put('/api/settings').send({ defaultBrowserAgent: 'mock', generalPerDay: 0 }).expect(200);
    const imp = await agent.post('/api/jobs/import').send({ url: 'https://example.com/jobs/waiter', title: 'Waiter', company: 'Demo Restaurant', location: 'London', description: 'Part-time waiting staff, 10 hours per week, restaurant table service, customer service. £12.30 per hour.' }).expect(201);
    expect(imp.body.application.status).toBe('QUEUED');
    const { runCycle } = await import('./pipeline/orchestrator.js');
    await runCycle('FULL_CYCLE', { manual: true });
    const app = await agent.get(`/api/applications/${imp.body.application.id}`).expect(200);
    expect(app.body.application.status).toBe('QUEUED');
  });

  it('exports data', async () => {
    const r = await agent.get('/api/privacy/export').expect(200);
    expect(r.body.candidate[0].fullName).toBe('Demo Candidate');
    expect(JSON.stringify(r.body.documents)).not.toContain('storageKey');
  });
});
