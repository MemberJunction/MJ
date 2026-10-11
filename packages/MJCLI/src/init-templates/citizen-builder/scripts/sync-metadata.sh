#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - push metadata/ to the local MemberJunction database
#
# Usage: ./scripts/sync-metadata.sh [--no-restart]
#
# After a successful push the API is restarted, because it loads AI prompts and
# their templates when it starts: without a restart a new prompt is "not in the
# engine's metadata" and a changed template keeps its old text. Pass
# --no-restart to skip that, for example when only data records changed.
# ==============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

RESTART=1
if [ "${1:-}" = "--no-restart" ]; then
  RESTART=0
fi

echo "Pushing metadata/ to the MemberJunction database..."
# --ci: never prompt for confirmation, and exit non-zero on any error.
docker compose exec -T mj mj sync push --dir /work/metadata --ci

if [ "$RESTART" = "1" ]; then
  "$DIR/scripts/restart-api.sh"
fi
echo "Metadata sync complete."
