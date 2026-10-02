#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - Execution Trace & Diagnostic Tool
# Inspects recent agent runs, step traces, and action execution errors via the
# native MemberJunction CLI (mj ai audit agent-run).
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Ensure MJ container is running
if ! docker compose ps --status running --format "{{.Service}}" 2>/dev/null | grep -q "mj"; then
  echo "Error: MemberJunction container ('mj') is not running." >&2
  echo "Start the workspace services with: docker compose up -d" >&2
  exit 1
fi

# If specific arguments or flags are passed:
# - If first arg starts with '-' (e.g. --list, --format json, --errors), pass through directly
# - If first arg matches a UUID format, treat as RunID and pass through directly
# - If first arg is non-empty string, treat as agent name filter: --list --agent "$1"
# - If no args, list recent runs
if [ $# -eq 0 ]; then
  docker compose exec -T mj mj ai audit agent-run --list
elif [[ "$1" == -* ]]; then
  docker compose exec -T mj mj ai audit agent-run "$@"
elif [[ "$1" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  docker compose exec -T mj mj ai audit agent-run "$@"
else
  AGENT_NAME="$1"
  shift
  docker compose exec -T mj mj ai audit agent-run --list --agent "$AGENT_NAME" "$@"
fi
