#!/usr/bin/env bash
# Keep HungryMan running in the background: starts at login and restarts if it stops.
#   bash scripts/autostart-mac.sh             # turn on
#   bash scripts/autostart-mac.sh --off       # turn off
# Logs: ~/Library/Logs/hungryman.log
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
LABEL="com.hungryman.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/hungryman.log"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "${1:-}" = "--off" ]; then
  rm -f "$PLIST"
  echo "HungryMan autostart is off."
  exit 0
fi

NODE_DIR="$(dirname "$(command -v node)")"
PGAPP_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>for i in \$(seq 1 60); do pg_isready -q &amp;&amp; break; sleep 2; done; exec npm run dev</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$NODE_DIR:$PGAPP_BIN:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "HungryMan now runs in the background and starts when you log in."
echo "  Dashboard: http://localhost:5173    Logs: $LOG    Turn off: bash scripts/autostart-mac.sh --off"
echo "  Also open Postgres.app → Settings → tick 'Start automatically after login'."
