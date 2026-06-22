#!/usr/bin/env bash
# loop-connectors.sh — per-connector lifecycle testing with reset between each (so ApplyAll CodeGen
# stays small = no accumulation). For each connector: reset-to-core -> restart MJAPI -> run lifecycle
# -> save real proof to overnight-proof/<c>/ + append to overnight-proof/SUMMARY.md. Sequential,
# connector-by-connector, fully tracked. Validated on orcid (green) + iMIS (pipeline works).
set -uo pipefail
# Portable: DIR = this script's dir; ROOT = repo root (4 levels up), override via MJ_REPO_ROOT.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${MJ_REPO_ROOT:-$(cd "$DIR/../../../.." && pwd)}"
PROOF=$ROOT/overnight-proof
cd "$DIR"
export DB_DATABASE=MJ_SS_E2E DB_PORT=1444 DB_PASSWORD=Claude2Sql99 GRAPHQL_PORT=4007 SQL_CONTAINER=sql-claude DB_HOST=localhost
mkdir -p "$PROOF"
SUM="$PROOF/SUMMARY.md"
[ -f "$SUM" ] || echo "# Connector lifecycle matrix (per-connector, reset between each)" > "$SUM"

CONNS="${1:-cvent fonteva growthzone hivebrite membersuite microsoft-dynamics-365 neon-crm netforum netsuite nimble-ams novi openwater path-lms pheedloop propfuel rhythm salesforce sharepoint}"

for c in $CONNS; do
  echo "##### $(date '+%H:%M:%S') START $c #####"
  node reset-to-core.mjs > "/tmp/reset-$c.log" 2>&1 || echo "  reset warn"
  # restart MJAPI (clear in-process cache, reload core-only)
  DB_PASSWORD=Claude2Sql99 bash start-ss-mjapi.sh > "/tmp/mjapi-$c.log" 2>&1 || true
  for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4007/ 2>/dev/null)" = "401" ] && break; sleep 3; done
  # run the lifecycle for this one connector, with a ~25min safety timeout (no connector should exceed)
  NO_RESTART=1 FRESH=1 node run-connector-campaign.mjs "$c" > "/tmp/conn-$c.log" 2>&1 &
  CPID=$!
  for i in $(seq 1 100); do kill -0 "$CPID" 2>/dev/null || break; grep -qiE "campaign done" "/tmp/conn-$c.log" 2>/dev/null && break; sleep 15; done
  if kill -0 "$CPID" 2>/dev/null; then echo "  TIMEOUT $c (>25min) — killing + moving on"; pkill -9 -f "run-connector-campaign" 2>/dev/null; pkill -9 -f "MJCLI/bin/run.js" 2>/dev/null; fi
  wait "$CPID" 2>/dev/null || true
  # save proof
  mkdir -p "$PROOF/$c"
  cp "/tmp/conn-$c.log" "$PROOF/$c/run.log" 2>/dev/null || true
  TOPOK=$(grep -oE "$c: topOk=[a-z]+" "/tmp/conn-$c.log" 2>/dev/null | tail -1)
  CELLS=$(grep -oE 'cells=\{[^}]*\}' "/tmp/conn-$c.log" 2>/dev/null | tail -1)
  COV=$(grep -oE 'coverage: [0-9]+/[0-9]+ rows>0 \(deployed [0-9]+[^)]*\)' "/tmp/conn-$c.log" 2>/dev/null | tail -1)
  LC=$(grep -oE 'lifecycle: .*' "/tmp/conn-$c.log" 2>/dev/null | tail -1)
  printf '{"connector":"%s","result":"%s","coverage":"%s","cells":%s}\n' "$c" "${TOPOK:-unknown}" "${COV:-}" "${CELLS#cells=}" > "$PROOF/$c/result.json" 2>/dev/null || true
  { echo ""; echo "## $c"; echo "- ${TOPOK:-NO RESULT}"; echo "- $COV"; echo "- $LC"; } >> "$SUM"
  echo "  DONE $c -> ${TOPOK:-NO RESULT} | $COV"
  echo "##### $(date '+%H:%M:%S') END $c #####"
done
echo "===== LOOP COMPLETE ====="
grep -E "topOk=" "$PROOF"/*/run.log 2>/dev/null | grep -oE 'topOk=[a-z]+' | sort | uniq -c
