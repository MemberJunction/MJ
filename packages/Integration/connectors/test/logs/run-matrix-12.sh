#!/bin/bash
set -uo pipefail
ROOT=/Users/madhavsubramaniyam/Projects/MJ/MJ-unified
cd "$ROOT"; set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
LOGD="$ROOT/packages/Integration/connectors/test/logs"
say(){ echo "[matrix12 $(date +%H:%M:%S)] $*"; }
for dir in cvent fonteva hivebrite neon-crm openwater orcid path-lms netsuite imis growthzone nimble-ams propfuel; do
  say "matrix $dir"
  RUN_DIRS="$dir" node "$LOGD/retest-matrix.mjs" > "$LOGD/retest-matrix-$dir.log" 2>&1 || say "  $dir process nonzero"
  say "  $dir: $(tail -1 "$LOGD/retest-matrix-$dir.log" | head -c 240)"
done
say "matrix-12 done."
