import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';

export const SESSION_COOKIE = 'hm_session';
const DEV_PASSWORD = 'changeme';

// Ephemeral secret in dev if none configured (sessions reset on restart). Production requires SESSION_SECRET.
const sessionSecret = env.SESSION_SECRET ?? crypto.randomBytes(32).toString('hex');

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function adminPassword() {
  if (env.ADMIN_PASSWORD) return env.ADMIN_PASSWORD;
  if (env.NODE_ENV === 'production') throw new Error('ADMIN_PASSWORD is required in production');
  return DEV_PASSWORD;
}

// Simple in-memory brute-force protection.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function loginAllowed(ip: string) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  a.count++;
  return a.count <= 10;
}

export function checkPassword(password: string) {
  return safeEqual(password, adminPassword());
}

export function issueSession(res: Response) {
  const token = jwt.sign({ sub: 'owner' }, sessionSecret, { expiresIn: '7d' });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    jwt.verify(token, sessionSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

/** Either the dashboard session or the agent bearer token (for routes both the owner and Claude sessions use). */
export function requireSessionOrAgent(req: Request, res: Response, next: NextFunction) {
  return (req.headers.authorization ?? '').startsWith('Bearer ') ? requireAgentToken(req, res, next) : requireSession(req, res, next);
}

/** Browser agents (Cowork / Claude in Chrome) authenticate with a separate bearer token. */
export function requireAgentToken(req: Request, res: Response, next: NextFunction) {
  if (!env.AGENT_API_TOKEN) return res.status(503).json({ error: 'AGENT_API_TOKEN is not configured on the server' });
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !safeEqual(token, env.AGENT_API_TOKEN)) return res.status(401).json({ error: 'Invalid agent token' });
  next();
}
