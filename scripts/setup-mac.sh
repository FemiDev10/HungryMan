#!/usr/bin/env bash
# One-command setup for HungryMan on a Mac.
#   bash scripts/setup-mac.sh            # set up, then start the app
#   bash scripts/setup-mac.sh --no-start # set up only
# Safe to run again: it skips anything already done and never overwrites apps/api/.env.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31mError:\033[0m %s\n' "$1"; exit 1; }

# 1–2. Node.js 22+ and PostgreSQL.
# Prefers the normal Mac installers (nodejs.org .pkg and Postgres.app), which work on Intel and
# Apple Silicon. Homebrew is only used as a fallback — it no longer fully supports Intel Macs.
PGAPP_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
[ -d "$PGAPP_BIN" ] && export PATH="$PGAPP_BIN:$PATH"

node_ok() { command -v node >/dev/null 2>&1 && node -v | grep -qE '^v(2[2-9]|[3-9][0-9])'; }
if ! node_ok; then
  if command -v brew >/dev/null 2>&1 && [ "$(uname -m)" = "arm64" ]; then
    say "Installing Node.js 22 with Homebrew"
    brew install node@22 && export PATH="$(brew --prefix node@22)/bin:$PATH"
  fi
fi
node_ok || die "Node.js 22 or newer is needed. Download the macOS Installer (.pkg) for Node.js 22 LTS from https://nodejs.org, install it, then run this script again."
say "Using Node.js $(node -v)"

if ! command -v pg_isready >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1 && [ "$(uname -m)" = "arm64" ]; then
    say "Installing PostgreSQL with Homebrew"
    brew install postgresql@16 && export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
    brew services start postgresql@16 >/dev/null
  else
    die "PostgreSQL is needed. Download Postgres.app from https://postgresapp.com, drag it to Applications, open it, click Initialize, then run this script again."
  fi
fi

say "Checking PostgreSQL is running"
if ! pg_isready -q && [ -d /Applications/Postgres.app ]; then open -a Postgres; fi
for _ in $(seq 1 30); do pg_isready -q && break; sleep 1; done
pg_isready -q || die "PostgreSQL isn't running. Open Postgres.app and click Start (or Initialize), then run this script again."
createdb hungryman 2>/dev/null || true

# 3. Settings file with fresh secrets (only if you don't have one yet)
if [ ! -f apps/api/.env ]; then
  say "Creating apps/api/.env with new secrets"
  read -r -p "Choose a password for the dashboard: " -s ADMIN_PW; echo
  [ -n "$ADMIN_PW" ] || die "The dashboard password can't be empty."
  cp apps/api/.env.example apps/api/.env
  set_env() { # replace KEY=... in .env (works with macOS sed)
    local key="$1" val="$2"
    sed -i '' "s|^${key}=.*|${key}=${val}|" apps/api/.env
  }
  set_env DATABASE_URL "postgresql://$(whoami)@localhost:5432/hungryman"
  set_env ADMIN_PASSWORD "$ADMIN_PW"
  set_env SESSION_SECRET "$(openssl rand -hex 32)"
  set_env AGENT_API_TOKEN "$(openssl rand -hex 32)"
  set_env STORAGE_ENCRYPTION_KEY "$(openssl rand -hex 32)"
else
  say "apps/api/.env already exists — keeping it"
fi

# 4. Dependencies, database tables, defaults
say "Installing dependencies (a few minutes the first time)"
npm install
# Newer npm skips packages' install scripts, so Prisma's client isn't generated automatically.
say "Generating the database client"
(cd apps/api && npx prisma generate)
say "Creating database tables"
npm run db:deploy --workspace apps/api
say "Adding default CV profiles, schedule and answer library"
npm run db:seed

# 5. Your profile, if the file is in your home folder or Downloads
PROFILE=""
for f in "$HOME/oluwafemi-profile.json" "$HOME/Downloads/oluwafemi-profile.json"; do [ -f "$f" ] && PROFILE="$f" && break; done
if [ -n "$PROFILE" ]; then
  if [ -f .profile-imported ]; then
    say "Profile already imported (delete .profile-imported to import again)"
  else
    say "Importing your profile from $PROFILE (as drafts for you to approve)"
    npm run profile:import --workspace apps/api -- "$PROFILE" && touch .profile-imported
  fi
else
  say "No oluwafemi-profile.json in your home folder or Downloads — skip for now, or add it and run this again"
fi

say "Setup complete"
echo "  Dashboard:  http://localhost:5173  (log in with the password you chose)"
echo "  Agent token for Claude in Chrome / Cowork is AGENT_API_TOKEN in apps/api/.env"

if [ "${1:-}" != "--no-start" ]; then
  say "Starting HungryMan (press Ctrl+C to stop)"
  (sleep 6 && open http://localhost:5173) &
  npm run dev
fi
