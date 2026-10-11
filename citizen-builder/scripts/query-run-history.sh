#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - agent run history and traces
#
# Usage:
#   ./scripts/query-run-history.sh                       # recent runs, all agents
#   ./scripts/query-run-history.sh "<Agent Name>"        # recent runs of one agent
#   ./scripts/query-run-history.sh <RunID>               # summary of one run
#   ./scripts/query-run-history.sh <RunID> --errors      # only what failed
#   ./scripts/query-run-history.sh <RunID> --step 1 --detail full
#   ./scripts/query-run-history.sh <RunID> --format json
#
# A thin wrapper around `mj ai audit agent-run` inside the container.
# ==============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx mj; then
  echo "The MemberJunction container ('mj') is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

audit() {
  docker compose exec -T mj mj ai audit agent-run "$@"
}

if [ $# -eq 0 ]; then
  audit --list
elif [[ "$1" == -* ]] || [[ "$1" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  audit "$@"
else
  agent_name="$1"
  shift
  audit --list --agent "$agent_name" "$@"
fi
