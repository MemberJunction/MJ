#!/bin/bash
# Chain: wait for the running Phase2 deploy to end -> redeploy the 3 UQ-failed connectors with the
# fixed (primaryKey-injecting) deploy_one -> run the full Phase 3 matrix -> build the report.
set -uo pipefail
ROOT=/Users/madhavsubramaniyam/Projects/MJ/MJ-unified
cd "$ROOT"; set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
LOGD="$ROOT/packages/Integration/connectors/test/logs"
say(){ echo "[finish $(date +%H:%M:%S)] $*"; }

say "waiting for Phase 2 deploy proc to end..."
while pgrep -f "retest-all13.sh deploy" >/dev/null 2>&1; do sleep 20; done
say "Phase 2 ended. Redeploying UQ-failed connectors (imis, growthzone, salesforce) with primaryKey fix."

# Redeploy the connectors that failed the UQ collision in pass 1. growthzone+imis are quick; SF's
# stale IOs are already deleted by pass-1, so its redeploy delete is a no-op and goes straight to upsert.
bash "$LOGD/retest-redeploy-failed.sh" imis "iMIS" growthzone "GrowthZone" salesforce "Salesforce" > "$LOGD/retest-redeploy.log" 2>&1
say "redeploy done. Results:"
for d in imis growthzone salesforce; do cat /tmp/retest-deploy-$d.json 2>/dev/null; echo; done

say "Phase 3 — full matrix (salesforce last)."
bash "$LOGD/retest-all13.sh" matrix > "$LOGD/retest-PHASE3.log" 2>&1
say "Phase 3 + report done. See RETEST_RESULTS.md"
