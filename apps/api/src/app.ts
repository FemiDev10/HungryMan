import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { checkPassword, issueSession, loginAllowed, requireAgentToken, requireSession, SESSION_COOKIE } from './auth.js';
import { env } from './config/env.js';
import { audit } from './lib/audit.js';
import { agentTasksRouter } from './routes/agentTasks.js';
import { applicationsRouter } from './routes/applications.js';
import { candidateRouter } from './routes/candidate.js';
import { configRouter } from './routes/config.js';
import { dashboardRouter } from './routes/dashboard.js';
import { jobsRouter } from './routes/jobs.js';
import { miscRouter } from './routes/misc.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/auth/login', async (req, res) => {
    if (!loginAllowed(req.ip ?? 'unknown')) return res.status(429).json({ error: 'Too many attempts; try again later' });
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!checkPassword(password)) return res.status(401).json({ error: 'Incorrect password' });
    issueSession(res);
    await audit('LOGIN', 'Dashboard login', { actor: 'user' });
    res.json({ ok: true });
  });
  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/auth/me', requireSession, (_req, res) => res.json({ authenticated: true }));

  // Browser-agent handoff API: bearer token only.
  app.use('/api', (req, res, next) => (req.path.startsWith('/agent-tasks') ? requireAgentToken(req, res, next) : next()));
  app.use('/api', agentTasksRouter);

  // Everything else requires the dashboard session.
  app.use('/api', requireSession);
  app.use('/api', dashboardRouter, applicationsRouter, jobsRouter, candidateRouter, configRouter, miscRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid request', details: err.issues });
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
      if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists', details: err.meta });
    }
    const message = (err as Error)?.message ?? 'Internal error';
    if (/Invalid application transition|already (completed|cancelled)/.test(message)) return res.status(409).json({ error: message });
    console.error('[api]', err);
    res.status(500).json({ error: env.NODE_ENV === 'production' ? 'Internal error' : message });
  });
  return app;
}
