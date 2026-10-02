#!/usr/bin/env bash
# Timed CodeGen cycle against the private BigSchema DB.
# Run from the worktree root AFTER bootstrap + demo SQL are in place.
#
#   ./Demos/BigSchemaDemo/run-cycle.sh --profile smoke
#   ./Demos/BigSchemaDemo/run-cycle.sh --profile standard
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROFILE="smoke"
cd "$REPO_ROOT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

OUT="$SCRIPT_DIR/generated"
mkdir -p "$OUT"
LOG="$OUT/cycle-$(date +%Y%m%dT%H%M%S).log"
EXPECT_SCHEMAS=3
EXPECT_TABLES=36
if [[ "$PROFILE" == "standard" ]]; then
  EXPECT_SCHEMAS=24
  EXPECT_TABLES=2880
elif [[ "$PROFILE" == "large" ]]; then
  EXPECT_SCHEMAS=36
  EXPECT_TABLES=5400
fi

time_step() {
  local name="$1"
  shift
  local start
  start=$(python3 -c 'import time; print(int(time.time()*1000))')
  echo "===== $name =====" | tee -a "$LOG"
  set +e
  "$@" >>"$LOG" 2>&1
  local rc=$?
  set -e
  local end
  end=$(python3 -c 'import time; print(int(time.time()*1000))')
  echo "STEP $name rc=$rc ms=$((end-start))" | tee -a "$LOG"
  return $rc
}

echo "cycle start profile=$PROFILE log=$LOG" | tee "$LOG"

time_step "verify-before" node "$SCRIPT_DIR/verify.mjs" --expect-schemas "$EXPECT_SCHEMAS" --expect-tables "$EXPECT_TABLES" --skip-codegen || true

# NOT `npx mj`: nothing in this repo creates a workspace-root node_modules/.bin/mj (the root
# `workspace:*` devDependencies that used to are gone, so turbo's hashOfInternalDependencies
# stays empty), and this demo has no package.json of its own. `npx` would walk up, find
# nothing, and fetch the UNRELATED `mj` package from the registry.
MJ_CLI="$REPO_ROOT/packages/MJCLI/bin/run.js"

time_step "codegen-pass-1" node "$MJ_CLI" codegen
time_step "verify-pass-1" node "$SCRIPT_DIR/verify.mjs" --expect-schemas "$EXPECT_SCHEMAS" --expect-tables "$EXPECT_TABLES"

time_step "codegen-pass-2-noop" node "$MJ_CLI" codegen
time_step "verify-pass-2" node "$SCRIPT_DIR/verify.mjs" --expect-schemas "$EXPECT_SCHEMAS" --expect-tables "$EXPECT_TABLES"

echo "cycle complete. log=$LOG"
echo "latest reporter: $(ls -t ~/.mj/codegen-state/run-*.json 2>/dev/null | head -1)"
