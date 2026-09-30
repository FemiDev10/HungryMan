---
description: Install and start HungryMan on this Mac (Node.js, PostgreSQL, database, profile import)
---
Set up HungryMan on this machine and get the dashboard running.

1. Run `bash scripts/setup-mac.sh --no-start` from the repo root. It needs Node.js 22+ (nodejs.org installer) and Postgres.app (postgresapp.com, opened and initialised). If either is missing, tell me exactly what to download and stop.
2. The script asks for a dashboard password once. It's interactive, so if you can't type into it, create `apps/api/.env` yourself from `apps/api/.env.example`: set `DATABASE_URL=postgresql://<my macOS username>@localhost:5432/hungryman`, ask me for `ADMIN_PASSWORD`, and fill `SESSION_SECRET`, `AGENT_API_TOKEN` and `STORAGE_ENCRYPTION_KEY` with `openssl rand -hex 32`. Then run the script again.
3. If a step fails, read the error, fix the cause (never delete my data or `.env`) and rerun. Explain each fix in one line.
4. Start the app in the background with `npm run dev` and check http://localhost:4000/api/health returns `{"ok":true}` and http://localhost:5173 loads.
5. Finish with: the dashboard URL, whether my profile was imported (it looks for `oluwafemi-profile.json` in my home folder or Downloads), and what's left on the Overview setup checklist.
