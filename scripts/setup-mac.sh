#!/usr/bin/env bash
# One-command setup for HungryMan on a Mac.
#   bash scripts/setup-mac.sh            # set up, then start the app
#   bash scripts/setup-mac.sh --no-start # set up only
# Safe to run again: it skips anything already done and never overwrites apps/api/.env.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31mError:\033[0m %s\n' "$1"; exit 1; }

# 1. Homebrew (the Mac package manager) — asks for your Mac password the first time.
if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew (you'll be asked for your Mac password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
fi

# 2. Node.js 22 and PostgreSQL 16
say "Installing Node.js 22 and PostgreSQL (skipped if already installed)"
brew list node@22 >/dev/null 2>&1 || brew install node@22
brew list postgresql@16 >/dev/null 2>&1 || brew install postgresql@16
export PATH="$(brew --prefix node@22)/bin:$(brew --prefix postgresql@16)/bin:$PATH"
node -v | grep -q '^v2[2-9]' || die "Node.js 22+ is needed (found $(node -v))."

say "Starting PostgreSQL"
brew services start postgresql@16 >/dev/null
for _ in $(seq 1 20); do pg_isready -q && break; sleep 1; done
pg_isready -q || die "PostgreSQL did not start. Try: brew services restart postgresql@16"
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
