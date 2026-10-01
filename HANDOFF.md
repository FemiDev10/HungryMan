# HungryMan: handoff (read this first)

This project was built in a cloud chat. From now on, all work happens **locally on the owner's Mac** (`~/HungryMan`), where Chrome, LinkedIn, Indeed and Gmail are logged in.

## How the owner likes to work
- Keep replies short: no jargon, no walls of text, one clear next step.
- Do things yourself; only hand over what truly needs them (CAPTCHAs, logins).

## The goal
HungryMan applies for jobs every day, on its own, about **40 a day**, with no reviews or approvals from the owner.

## Who the owner is
- MSc HCI student at Northumbria. Student visa; the course ends **October 2027**.
- Product designer / UX, frontend (React) and AI builder. Head of Product at DriveVault.

## What to apply for
- **Priority:** remote roles. **LinkedIn**, **Indeed UK** and **Europe** first.
- **Spread the 40 a day across sites**, not all on one: LinkedIn, Indeed, Welcome to the Jungle, YC Work at a Startup, Wellfound, remote job boards, and graduate schemes (e.g. Revolut, Uber).
- **Professional roles:** design, UX, frontend/React, design engineer and AI roles in the UK, Europe/EMEA and US remote. Full-time roles start after the course; they need visa sponsorship or relocation (Europe), or an employer that can hire UK-based staff (US remote).
- **Part-time work in Newcastle/Sunderland:** steward, fast food, kitchen porter, cleaning, hotel, retail, warehouse. Within 20h/week in term time.
- **Requirements first:** skip jobs that need licences the owner doesn't have (SIA, driving, forklift, DBS) or strict UK experience.

## CVs
- Every job gets its own tailored CV: pick, reword and reorder to match the company.
- The owner has done a lot that isn't on paper yet. Ask them for a brain dump (voice note or list) and add it to the profile.
- Everything must be true. Never invent jobs, degrees or licences.

## Cold outreach
- Startups in the UK, Europe and US (VC/YC-funded): message founders, CEOs or the company, using **published work emails**.
- Also people posting "we're hiring" on LinkedIn or X.
- Write like a human: short and direct. "Remote role; MSc HCI finishing Oct 2027." No AI tone.

## What's built (see README.md)
- **Local app:** API on :4000, dashboard on :5173. Runs in the background via `bash scripts/autostart-mac.sh`.
- **Owner profile:** imported (13 jobs, 97 CV points). The owner still needs to **Approve all** and add a phone number.
- **Commands** in `.claude/commands/`: `/daily-run`, `/find-jobs`, `/apply-queue`, `/outreach`, `/add-job`, `/status`.
- **Settings → Full autopilot:** no reviews, and emails are sent automatically.
- **Scheduling:** `docs/COWORK.md` explains how to run it daily.
- **Hard rules:** see CLAUDE.md.

## Next steps
1. **Test:** with Claude in Chrome, apply to one LinkedIn Easy Apply job and one Indeed UK job, and stop before submit.
2. **Build:** the per-site daily split (40/day across the sites above), plus Welcome to the Jungle, YC and Wellfound searches.
3. **Writing style:** human, direct cold emails; add founder/CEO targeting.
4. **Redesign the dashboard:** white, simple, a few clear numbers, nice charts, subtle motion. Not a generic AI look.
5. **Still needed from the owner:** UK phone number, exact course dates, PayZeep dates, the Chowdeck job title.
