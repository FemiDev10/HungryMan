# HungryMan: autonomous job application agent

A private web app that searches for jobs and applies to them:

**discover → dedupe → classify → check work eligibility → match → choose CV profile → tailored CV → validate every claim → answers → browser agent (Cowork / Claude in Chrome) → submit where permitted → verify → track → next job**

It runs automatically. You're only pulled in when something genuinely needs you: a CAPTCHA, a video question, a login, an unanswered question, or an eligibility decision. One stuck application never blocks the queue.

## Built for a UK student on two tracks

- **Full-time professional roles, starting after your course**, with Skilled Worker sponsorship. You can apply now, but the job can only start once your course has ended. The agent applies only where the advert offers sponsorship or the employer is on the gov.uk **register of licensed sponsors**, which is downloaded weekly. It skips "no sponsorship" adverts and immediate-start roles. On the form it answers sponsorship **Yes** and gives your course end date as the start.
- **Part-time work now**, within your term-time hours limit (e.g. stadium stewarding, fast-food night shifts, kitchen porter). Pay is estimated per month (hours capped at your limit) and the queue ranks jobs towards your monthly income goal. Forms state your hours restriction honestly.
- **CV import:** upload your CV (PDF/DOCX) and Claude turns it into **draft** records. The agent can't use anything until you approve it.
- **Warm-up:** the first 3 applications stop before submit for you to check. After that it runs automatically.

## Ground rules built into the code

- **The candidate database is the source of truth, not a CV.** Every CV bullet is an exact `Evidence` claim. Every summary sentence cites the evidence behind it, and `domain/claimValidation.ts` rejects anything unsupported: invented numbers, skills or tools you haven't recorded, or evidence marked as not allowed on CVs. If an AI-written summary fails validation, it's replaced with the evidence-only version.
- **Two tracks with separate CV profiles.** The seeded profiles are 7 professional (Product Designer, UX, UX Research/HCI, PM, Frontend, AI/Software, General Tech) and 7 general-work (Kitchen Porter, Cleaner, Security, Hospitality, Retail, Warehouse, General Entry-Level). A profile can only be used for jobs on its own track, so a design CV can't be sent to a kitchen porter job. General-work CVs use honest transferable evidence.
- **Unknown answers are `UNKNOWN`, never guessed.** Unverified library answers are treated as unknown.
- **No bypassing CAPTCHAs, bot checks, logins or rate limits.** If a site blocks automation, the application goes to `BLOCKED` or `NEEDS_HUMAN` and the queue continues. Each source has hourly and daily limits and a cooldown.
- **`SUBMITTED` requires evidence** (a confirmation page, number or message). A click with no evidence is recorded as `SUBMISSION_ATTEMPTED`.
- **UK work rules are configuration, not code.** Visa type, term-time hours limit, vacation periods and restrictions are entered by you; check them against gov.uk guidance. Sponsorship is flagged as a possible opportunity and never presented as guaranteed.
- **Everything is versioned and audited.** CVs are immutable files such as `CV-2026-09-27-PRODUCT-DESIGNER-0182.pdf` and are never overwritten. Answer sets are versioned, AI prompts carry versions, and every step is written to the audit log.

## Stack

| | |
|---|---|
| `apps/api` | Node + TypeScript, Express 5, Prisma + PostgreSQL, Zod, pdfkit, node-cron, Anthropic SDK |
| `apps/web` | React 19 + TypeScript + Vite + Tailwind v4, TanStack Query |

Code layout (`apps/api/src`):

```
domain/     pure logic: classification, job parsing, eligibility, matching,
            profile selection, CV builder, claim validation, answers, state machine
ai/         AiEngine interface → ClaudeAiEngine (structured outputs) | DeterministicAiEngine; versioned prompts
sources/    JobSource plug-ins: Reed API, Adzuna API, Greenhouse & Lever public job boards, manual import
browser/    BrowserAgent interface → CoworkAgent, ClaudeChromeAgent (handoff queue), MockBrowserAgent
pipeline/   ingest → analyse → prepare → execute, orchestrator (daily targets, pause/stop), scheduler
routes/     REST API (docs/API.md)
storage/    private file storage, AES-256-GCM at rest
```

## Quick start on a Mac (one command)

```bash
git clone https://github.com/FemiDev10/HungryMan.git && cd HungryMan
git checkout claude/job-search-project-r0wb04
bash scripts/setup-mac.sh
```

It installs Node.js 22 and PostgreSQL through Homebrew, creates the database and `apps/api/.env` with fresh secrets (asking you for a dashboard password), imports `~/oluwafemi-profile.json` or `~/Downloads/oluwafemi-profile.json` if present, and opens the dashboard.

## Getting started

```bash
npm install
cp apps/api/.env.example apps/api/.env      # set DATABASE_URL at minimum
npm run db:migrate                          # create tables
npm run db:seed                             # CV profiles, schedule, sources, answer library
# optional: explore with fictional data + the mock browser agent
npm run db:seed --workspace apps/api -- --demo

npm run dev --workspace apps/api            # API on :4000
npm run dev --workspace apps/web            # dashboard on :5173 (dev password: changeme)
npm run worker --workspace apps/api         # scheduler (or set RUN_SCHEDULER_IN_API=true)
```

Then:

1. **Candidate profile**: fill in personal details, **work authorisation**, education, jobs, projects and skills. Most importantly, add **evidence**: the factual claims you're happy to have on a CV, each with where it's proven.
2. **Answer library**: fill in and verify the answers that start as `UNKNOWN`.
3. **Settings**: set daily targets, match thresholds, schedule, search keywords and locations per track, and which sources are enabled (add Greenhouse board tokens or Lever company slugs for employers you like).
4. **Browser agent**: follow [docs/BROWSER_AGENTS.md](docs/BROWSER_AGENTS.md) to connect Cowork / Claude in Chrome. Start with **auto-submit off**.
5. Press **Resume** on the Overview page. The agent then runs on its schedule.

## Tests

```bash
npm test                                             # domain unit tests
TEST_DATABASE_URL=postgresql://…/hungryman_test npm test   # + end-to-end pipeline over HTTP (database name must contain "test")
```

## Credentials still needed for full autonomy

| What | Where | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API | deterministic classifier and evidence-only summaries (still works) |
| `REED_API_KEY` | reed.co.uk/developers | Reed discovery off |
| `ADZUNA_APP_ID/KEY` | developer.adzuna.com | Adzuna discovery off |
| `AGENT_API_TOKEN` + a Cowork / Claude in Chrome session | docs/BROWSER_AGENTS.md | applications wait in `BROWSER_EXECUTING` for an agent |

LinkedIn and Indeed are deliberately **not** scraped because their terms forbid it. Use manual import (paste the advert) for jobs you find there.

## Roadmap (spec phases 3–4)

Email monitoring (confirmations, rejections, interviews), push/email notifications (hook: `lib/notify.ts`), official sponsor-register lookup, S3 storage adapter (`storage/storage.ts` interface), and CV/source performance analytics.
