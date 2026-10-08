#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - apply .env changes and restart the API
#
# Usage: ./scripts/restart-api.sh
#
# Copies the settings in .env (AI provider keys, sign-in settings) into the
# files MemberJunction reads, restarts the API, and waits until it answers.
# Restarts the Explorer web app too when its sign-in or port settings changed.
# Usually 1 to 3 minutes.
# ==============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx mj; then
  echo "The MemberJunction container is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

changed="$(docker compose exec -T mj node /work/scripts/workspace-settings.mjs sync)"
echo "Restarting the API (usually under a minute, longer the first time)..."
docker compose exec -T mj pm2 restart mjapi >/dev/null
if [[ "$changed" == *'"explorer":true'* ]]; then
  echo "Sign-in or port settings changed, so restarting the Explorer web app too (a few minutes)..."
  docker compose exec -T mj pm2 restart mjexplorer >/dev/null
fi

# Wait for the API to answer again, up to 5 minutes.
for _ in $(seq 1 60); do
  if docker compose exec -T mj node -e "fetch('http://localhost:' + (process.env.API_PORT || 4000) + '/healthcheck', { signal: AbortSignal.timeout(4000) }).then(() => process.exit(0), () => process.exit(1))" 2>/dev/null; then
    echo "The API is running."
    exit 0
  fi
  sleep 5
done
echo "The API did not answer within 5 minutes. See: docker compose exec mj pm2 logs mjapi --lines 80" >&2
exit 1
