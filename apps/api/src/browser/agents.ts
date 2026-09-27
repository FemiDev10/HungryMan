import type { BrowserAgent, BrowserResult, BrowserTaskPayload, ExecuteResult } from './types.js';

/**
 * Handoff agent for Claude Cowork. The task is stored as a BrowserTask row; a Cowork
 * session (configured with docs/BROWSER_AGENTS.md) claims it through
 * GET /api/agent-tasks/next?agent=cowork, performs the application in the browser,
 * and posts a BrowserResult to /api/agent-tasks/:id/result.
 */
export class CoworkAgent implements BrowserAgent {
  readonly id = 'cowork';
  readonly label = 'Claude Cowork (handoff)';
  readonly mode = 'handoff' as const;
  readonly simulated = false;
  async execute(_task: BrowserTaskPayload, ctx: { browserTaskId: string }): Promise<ExecuteResult> {
    return { kind: 'pending', taskId: ctx.browserTaskId };
  }
}

/** Same handoff protocol, claimed by a Claude in Chrome session (agent=claude-chrome). */
export class ClaudeChromeAgent implements BrowserAgent {
  readonly id = 'claude-chrome';
  readonly label = 'Claude in Chrome (handoff)';
  readonly mode = 'handoff' as const;
  readonly simulated = false;
  async execute(_task: BrowserTaskPayload, ctx: { browserTaskId: string }): Promise<ExecuteResult> {
    return { kind: 'pending', taskId: ctx.browserTaskId };
  }
}

/**
 * Simulated agent for development and tests. It never opens a browser or contacts an
 * employer; results are flagged `simulated` everywhere in the UI.
 * URL markers let you exercise every exception path: include e.g. "captcha", "video",
 * "login", "payment", "blocked", "sitedown" or "noconfirm" in the job URL.
 */
export class MockBrowserAgent implements BrowserAgent {
  readonly id = 'mock';
  readonly label = 'Mock (simulation only)';
  readonly mode = 'inline' as const;
  readonly simulated = true;

  async execute(task: BrowserTaskPayload): Promise<ExecuteResult> {
    const url = task.url.toLowerCase();
    const r = (result: BrowserResult): ExecuteResult => ({ kind: 'completed', result });
    const filled = ['full_name', 'email', 'phone'];
    if (url.includes('captcha')) return r({ outcome: 'EXCEPTION', stepReached: 'open_application', exception: { type: 'CAPTCHA', detail: 'CAPTCHA shown before the form (simulated).' } });
    if (url.includes('blocked')) return r({ outcome: 'EXCEPTION', stepReached: 'open_application', exception: { type: 'AUTOMATION_BLOCKED', detail: 'Automation restriction detected (simulated).' } });
    if (url.includes('login')) return r({ outcome: 'EXCEPTION', stepReached: 'open_application', exception: { type: 'LOGIN_REQUIRED', detail: 'Site requires sign-in (simulated).' } });
    if (url.includes('video')) return r({ outcome: 'EXCEPTION', stepReached: 'questions', fieldsFilled: filled, exception: { type: 'VIDEO_QUESTION', detail: 'Recorded video answer required (simulated).' } });
    if (url.includes('payment')) return r({ outcome: 'EXCEPTION', stepReached: 'questions', exception: { type: 'PAYMENT_REQUIRED', detail: 'Application fee requested (simulated).' } });
    if (url.includes('sitedown')) return r({ outcome: 'FAILED', stepReached: 'open_application', error: 'HTTP 503 (simulated).' });

    const unknown = task.approvedAnswers.filter((a) => a.answer === 'UNKNOWN' && ['right_to_work_uk', 'requires_sponsorship'].includes(a.key));
    if (unknown.length) {
      return r({ outcome: 'EXCEPTION', stepReached: 'questions', fieldsFilled: filled, unansweredQuestions: unknown.map((a) => a.question), exception: { type: 'MISSING_CANDIDATE_DATA', detail: 'Required answers are UNKNOWN in the candidate profile.' } });
    }
    const steps = [...filled, 'cv_upload', ...(task.coverLetterFile ? ['cover_letter_upload'] : [])];
    if (!task.autoSubmit) return r({ outcome: 'SUBMISSION_ATTEMPTED', employerVerified: true, stepReached: 'ready_to_submit', fieldsFilled: steps, notes: 'autoSubmit disabled (simulated).' });
    if (url.includes('noconfirm')) return r({ outcome: 'SUBMISSION_ATTEMPTED', employerVerified: true, stepReached: 'submitted_no_confirmation', fieldsFilled: steps });
    return r({
      outcome: 'SUBMITTED',
      employerVerified: true,
      stepReached: 'confirmation',
      fieldsFilled: steps,
      confirmation: { type: 'CONFIRMATION_NUMBER', confirmationNumber: `SIM-${task.applicationRef}`, message: 'Simulated confirmation — no real application was sent.' },
    });
  }
}

const agents: BrowserAgent[] = [new CoworkAgent(), new ClaudeChromeAgent(), new MockBrowserAgent()];

export function listBrowserAgents() {
  return agents;
}

export function getBrowserAgent(id: string): BrowserAgent {
  return agents.find((a) => a.id === id) ?? agents[0];
}
