# Browser agents: Claude Cowork / Claude in Chrome

HungryMan never drives a browser itself. It prepares a **structured application task**
(job URL, the exact CV file, cover letter if any, verified answers, rules) and hands it to
a browser agent through the `BrowserAgent` interface (`apps/api/src/browser/`):

```
BrowserAgent
  ├── CoworkAgent        (handoff queue, agent=cowork)
  ├── ClaudeChromeAgent  (handoff queue, agent=claude-chrome)
  └── MockBrowserAgent   (simulation for dev/tests — never contacts employers)
```

Pick the agent in **Settings → Default browser agent**.

## How the handoff works

1. The orchestrator moves an application to `BROWSER_EXECUTING` and stores a `BrowserTask` (status `PENDING`).
2. A Cowork or Claude in Chrome session claims it:
   `GET /api/agent-tasks/next?agent=cowork` with `Authorization: Bearer $AGENT_API_TOKEN`
   → `204` (nothing to do) or `{ taskId, leaseExpiresAt, task }`.
3. The session downloads the files named in the task (`task.cvFile.downloadPath`) with the same bearer token. Only that task's documents can be fetched.
4. It posts progress, which also extends the lease: `POST /api/agent-tasks/:taskId/events` `{ "type": "STEP", "step": "Filling contact details" }`
5. It posts **one** final result: `POST /api/agent-tasks/:taskId/result` (schema below).
6. If no result arrives before the lease runs out (`BROWSER_TASK_LEASE_MINUTES`, default 30), the application is marked `FAILED` and the queue moves on.

## Result schema

```jsonc
{
  "outcome": "SUBMITTED" | "SUBMISSION_ATTEMPTED" | "EXCEPTION" | "FAILED",
  "employerVerified": true,                 // page matched the expected employer + job title
  "stepReached": "confirmation",
  "fieldsFilled": ["full_name", "email", "cv_upload"],
  "unansweredQuestions": ["..."],           // questions with no approved answer
  "confirmation": {                         // REQUIRED for SUBMITTED to count
    "type": "CONFIRMATION_PAGE" | "CONFIRMATION_NUMBER" | "SUCCESS_MESSAGE" | "CONFIRMATION_EMAIL" | "APPLICATION_STATUS",
    "confirmationNumber": "…", "message": "…", "url": "…"
  },
  "exception": { "type": "CAPTCHA" | "VIDEO_QUESTION" | "LIVE_INTERVIEW" | "UNSUPPORTED_FIELD" | "MISSING_CANDIDATE_DATA"
                 | "IDENTITY_VERIFICATION" | "APPLICATION_REQUIRES_SIGNATURE" | "AUTOMATION_BLOCKED" | "UNEXPECTED_QUESTION"
                 | "PAYMENT_REQUIRED" | "DUPLICATE_APPLICATION" | "SITE_ERROR" | "LOGIN_REQUIRED",
                 "detail": "…" },
  "error": "…", "notes": "…"
}
```

How results map to statuses:

| Result | Application status |
|---|---|
| `SUBMITTED` with confirmation evidence | `SUBMITTED` |
| `SUBMITTED` without evidence, or `SUBMISSION_ATTEMPTED` | `SUBMISSION_ATTEMPTED` (you can confirm it later from the dashboard) |
| `EXCEPTION` CAPTCHA / AUTOMATION_BLOCKED | `BLOCKED` |
| any other `EXCEPTION` | `NEEDS_HUMAN` |
| `FAILED` | `FAILED` |

Every task includes a `rules` array (see `AGENT_RULES` in `browser/types.ts`). The agent must never bypass CAPTCHAs, bot detection, logins or rate limits, never invent answers, and only click submit when `autoSubmit` is true.

## Recommended setup: Claude in Chrome, driven from Cowork, on your laptop

Claude in Chrome acts in **your own Chrome**, so it uses the job sites you're already signed into. Running everything on the same laptop means it can reach HungryMan at `http://localhost:4000` with no hosting.

1. In `apps/api/.env`, set `AGENT_API_TOKEN` to a long random value (`openssl rand -hex 32`). Restart the API.
2. Install the Claude in Chrome extension and sign in to the job sites you use (Indeed, Reed, LinkedIn, Workday accounts, etc.).
3. In Settings, set **Default browser agent** to `claude-chrome` (the default) and leave **Warm-up** at 3.
4. Start a Cowork session with Chrome access and paste the prompt below (with `agent=claude-chrome`). The Overview checklist shows "Browser agent connected" once it has checked in.
5. **Warm-up:** the first 3 applications are filled in and left open in Chrome. Check each one, press submit yourself, then click **"I submitted it"** on the Exceptions page. After that, the agent submits on its own.
6. To keep it running without you, re-run the Cowork task on a schedule if your plan supports scheduled tasks, or start it whenever you open your laptop. The queue waits safely in between: tasks nobody has claimed just stay pending.

## Prompt for a Cowork / Claude in Chrome session

Paste this into a Cowork task, replacing the URL and token placeholders. **Don't paste the real token into anything shared.**

```text
You are the browser executor for my private job-application system, HungryMan.

API: http://localhost:4000/api   Token: (use the AGENT_API_TOKEN I give you; send as "Authorization: Bearer <token>")

Loop:
1. GET /agent-tasks/next?agent=claude-chrome (use agent=cowork if Settings says cowork). If 204, stop and tell me the queue is empty.
2. Read the task JSON. Obey every item in task.rules exactly.
3. Download task.cvFile.downloadPath (and task.coverLetterFile if present).
4. Open task.url. Check the page is for task.job.company and task.job.title. If not, report EXCEPTION/SITE_ERROR.
5. Fill fields only from task.candidate and task.approvedAnswers (match questions using each answer's "patterns").
   If a required question has no approved answer, or its answer is "UNKNOWN", do not guess: report EXCEPTION/UNEXPECTED_QUESTION and list the questions in unansweredQuestions.
6. Upload exactly the CV file from step 3.
7. If you see a CAPTCHA, bot check, login wall, payment, signature, ID check, or video/live interview, stop and report the matching EXCEPTION. Never try to get around it.
8. Submit only if task.autoSubmit is true. Then report SUBMITTED with the confirmation text/number, or SUBMISSION_ATTEMPTED if you can't see confirmation.
9. POST progress to /agent-tasks/{taskId}/events as you go, and exactly one result to /agent-tasks/{taskId}/result.
10. Go back to step 1.
```

> Cowork and Claude in Chrome are driven by that prompt, not by a programmatic API from this app,
> so the handoff queue above is the integration point. Test it on one or two applications with
> `autoSubmit` switched off before letting it submit.
