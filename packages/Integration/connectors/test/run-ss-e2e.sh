#!/usr/bin/env bash
# =============================================================================
# run-ss-e2e.sh — ONE command: FULL fresh-DB PropFuel SQL-Server live e2e, end to end.
#
# Owns the WHOLE setup so the e2e can never fail on a half-done / degraded environment.
# The hard-won lesson (HYBRID_E2E_ENV_RUNBOOK §0): NEVER reuse a leftover DB — degraded DBs
# carry malformed entities (0 EntityField / no PK) and the RSU Post-CodeGen CRUD validation
# fails fatally on ANY malformed entity, even unrelated ones. A freshly-baselined DB is clean
# by construction, so RSU/ApplyAll just works. So this script ALWAYS baselines fresh.
#
# Steps:
#   1. broker up? (the one inherent sudo step — separate-user credential wall)
#   2. FRESH DB: drop → create → `mj migrate` → VERIFY 0 malformed entities (abort if not)
#   3. MJAPI up on the fresh DB (start-ss-mjapi.sh — baked env, key from broker)
#   4. resolve coordinates from the fresh DB (Company [create if none], CredentialType, Integration)
#   5. submit the live e2e job (all streams) with the RESOLVED ids — fresh jobId, never a cache hit
#   6. wait, parse §forward/§incremental/§idempotent assertions, print PASS/FAIL
#
# Usage:
#   bash packages/Integration/connectors/test/run-ss-e2e.sh                                   # all 3 streams, serial
#   bash .../run-ss-e2e.sh "opens,clicks"                                                     # subset
#   bash .../run-ss-e2e.sh "opens,clicks,checkin_questions" 3                                 # opt-in concurrency=3
#
# Prereq (the ONE sudo step): sudo bash packages/Integration/connectors/test/launch-broker.sh propfuel
# =============================================================================
set -uo pipefail

OBJECTS="${1:-checkin_questions,opens,clicks}"   # default = ALL three streams
CONCURRENCY="${2:-}"                              # empty = serial; N>1 = opt-in concurrent
SKIP_REBUILD="${SKIP_REBUILD:-0}"                 # set 1 to reuse the current DB (debug only — NOT a real run)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

MAILBOX=/Users/Shared/mj-mailbox
DBPW="Claude2Sql99"
SQLC() { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DBPW" -C "$@"; }
SQL1() { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DBPW" -C -d MJ_SS_E2E -h -1 -W -Q "SET NOCOUNT ON; $1" 2>/dev/null | tr -d '\r' | sed '/^$/d' | head -1; }
say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

# --- 1) broker -----------------------------------------------------------------
say "1/6 broker"
if ! pgrep -f credential-broker.mjs >/dev/null 2>&1; then
  echo "Broker DOWN. Start it once: sudo bash packages/Integration/connectors/test/launch-broker.sh propfuel" >&2
  exit 2
fi
echo "broker up: pid $(pgrep -f credential-broker.mjs | head -1)"

# --- 2) FRESH DB (drop → migrate → verify clean) -------------------------------
say "2/6 FRESH DB baseline (drop → mj migrate → verify 0 malformed)"
if [ "$SKIP_REBUILD" = "1" ]; then
  echo "SKIP_REBUILD=1 — reusing current MJ_SS_E2E (debug only; NOT a clean-baseline run)"
else
  echo "dropping + recreating MJ_SS_E2E..."
  SQLC -Q "IF DB_ID('MJ_SS_E2E') IS NOT NULL BEGIN ALTER DATABASE MJ_SS_E2E SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE MJ_SS_E2E; END; CREATE DATABASE MJ_SS_E2E;" 2>&1 | grep -viE "rows affected|^$" || true
  echo "migrating (mj migrate --dir ./migrations/v5)..."
  ( cd "$REPO_ROOT" && DB_PLATFORM=sqlserver DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa DB_PASSWORD="$DBPW" \
      DB_TRUST_SERVER_CERTIFICATE=1 MJ_CORE_SCHEMA=__mj CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD="$DBPW" \
      node packages/MJCLI/bin/run.js migrate --dir ./migrations/v5 ) > /tmp/ss-migrate.log 2>&1 \
    && echo "migrate OK" || { echo "MIGRATE FAILED — tail:" >&2; tail -25 /tmp/ss-migrate.log >&2; exit 4; }
  MALFORMED="$(SQL1 "SELECT count(*) FROM __mj.Entity e WHERE NOT EXISTS(SELECT 1 FROM __mj.EntityField f WHERE f.EntityID=e.ID);")"
  echo "malformed entities (must be 0): ${MALFORMED:-?}"
  [ "${MALFORMED:-1}" = "0" ] || { echo "DB not clean after baseline — aborting." >&2; exit 4; }
  # CodeGen regenerates ALL sprocs/views to the CURRENT form. CRITICAL: the baseline ships an OLDER
  # spCreate/spUpdateIntegrationObjectField (the @ResultTable form, not NULL-robust on the MetadataSource
  # default-handling), and the CodeGen_Run_*.sql regen migrations are IGNORED by flyway (no V prefix), so
  # `migrate` alone leaves stale sprocs. Without this, the FIRST connection's SchemaRefresh persists
  # discovered fields via the stale sproc → "Cannot insert NULL into MetadataSource" → 0 fields → 0 sync.
  # advancedGeneration is OFF in mj.config.cjs (keyless-safe). This IS the "full + complete MJ setup".
  echo "codegen (regenerate sprocs/views to current — fixes stale baseline IntegrationObjectField sprocs)..."
  ( cd "$REPO_ROOT" && DB_PLATFORM=sqlserver DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa DB_PASSWORD="$DBPW" \
      DB_TRUST_SERVER_CERTIFICATE=1 MJ_CORE_SCHEMA=__mj CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD="$DBPW" \
      node packages/MJCLI/bin/run.js codegen ) > /tmp/ss-codegen.log 2>&1 \
    && echo "codegen OK" || { echo "CODEGEN FAILED — tail:" >&2; tail -30 /tmp/ss-codegen.log >&2; exit 4; }
fi

# Ensure the PropFuel Integration is present (baseline Metadata-Sync should seed it; else mj sync push)
INTEGRATION="$(SQL1 "SELECT CONVERT(varchar(36),ID) FROM __mj.Integration WHERE Name='PropFuel';")"
if [ -z "$INTEGRATION" ]; then
  echo "PropFuel Integration not seeded by baseline — running mj sync push for propfuel metadata..."
  ( cd "$REPO_ROOT" && DB_PLATFORM=sqlserver DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa DB_PASSWORD="$DBPW" \
      DB_TRUST_SERVER_CERTIFICATE=1 MJ_CORE_SCHEMA=__mj \
      node packages/MJCLI/bin/run.js sync push --dir metadata/integrations/propfuel ) > /tmp/ss-syncpush.log 2>&1 \
    && echo "sync push OK" || { echo "sync push failed — tail:" >&2; tail -20 /tmp/ss-syncpush.log >&2; }
  INTEGRATION="$(SQL1 "SELECT CONVERT(varchar(36),ID) FROM __mj.Integration WHERE Name='PropFuel';")"
fi
[ -n "$INTEGRATION" ] || { echo "PropFuel Integration still missing — aborting." >&2; exit 4; }

# --- 3) MJAPI on the fresh DB --------------------------------------------------
say "3/6 MJAPI (fresh DB)"
bash "$SCRIPT_DIR/start-ss-mjapi.sh" || { echo "MJAPI failed to start." >&2; exit 3; }

# --- 4) resolve coordinates from the FRESH DB ----------------------------------
say "4/6 resolve coordinates (Company / CredentialType / Integration)"
CREDTYPE="$(SQL1 "SELECT TOP 1 CONVERT(varchar(36),ID) FROM __mj.CredentialType WHERE Name LIKE '%API Key%';")"
COMPANY="$(SQL1 "SELECT TOP 1 CONVERT(varchar(36),ID) FROM __mj.Company;")"
if [ -z "$COMPANY" ]; then
  SQL1 "INSERT INTO __mj.Company (ID,Name,Description) VALUES (NEWID(),'MJ E2E Test Co','hybrid e2e');" >/dev/null
  COMPANY="$(SQL1 "SELECT TOP 1 CONVERT(varchar(36),ID) FROM __mj.Company;")"
fi
echo "Company=$COMPANY  CredentialType=$CREDTYPE  Integration=$INTEGRATION"
[ -n "$COMPANY" ] && [ -n "$CREDTYPE" ] || { echo "could not resolve Company/CredentialType — aborting." >&2; exit 5; }

# --- 5) submit the live e2e job (resolved ids) ---------------------------------
say "5/6 submit live e2e job (objects: $OBJECTS, concurrency: ${CONCURRENCY:-serial})"
JOB="propfuel-e2e-$(date +%s)"
LIVE_CONFIG='{"AccountID":"2019"}'
[ -n "$CONCURRENCY" ] && LIVE_CONFIG="{\"AccountID\":\"2019\",\"syncConcurrency\":$CONCURRENCY}"
OBJECTS="$OBJECTS" LIVE_CONFIG="$LIVE_CONFIG" JOB="$JOB" MAILBOX="$MAILBOX" \
  COMPANY="$COMPANY" CREDTYPE="$CREDTYPE" INTEGRATION="$INTEGRATION" python3 - <<'PY'
import json, os
job={"jobId":os.environ["JOB"],"task":"connector-e2e-live","env":{
 "E2E_CONNECTOR":"propfuel","E2E_INTEGRATION":"PropFuel","E2E_MODE":"live","E2E_TOKEN_KEY":"Token",
 "E2E_LIVE_CONFIG":os.environ["LIVE_CONFIG"],"E2E_OBJECTS":os.environ["OBJECTS"],
 "HS_LIVE_PLATFORM":"sqlserver","HS_LIVE_DB_HOST":"localhost","HS_LIVE_DB_PORT":"1444","HS_LIVE_DB_NAME":"MJ_SS_E2E","HS_LIVE_DB_USER":"sa",
 "HS_LIVE_MJ_SCHEMA":"__mj","HS_LIVE_GRAPHQL_URL":"http://localhost:4007/",
 "HS_LIVE_COMPANY_ID":os.environ["COMPANY"],"HS_LIVE_CREDTYPE_ID":os.environ["CREDTYPE"],"HS_LIVE_INTEGRATION_ID":os.environ["INTEGRATION"],
 "HS_LIVE_CIID":"","HS_LIVE_OBJECTS":os.environ["OBJECTS"],"HS_LIVE_MAX_POLLS":"2400"}}
open(os.path.join(os.environ["MAILBOX"],"jobs",os.environ["JOB"]+".json"),"w").write(json.dumps(job,indent=2))
print("submitted",os.environ["JOB"])
PY

# --- 6) wait + parse -----------------------------------------------------------
say "6/6 waiting for result (fresh DB → ApplyAll → full+incremental sync; up to ~40min)"
R="$MAILBOX/results/$JOB.json"
for i in $(seq 1 480); do [ -f "$R" ] && { echo "result after ~$((i*5))s"; break; }; sleep 5; done
[ -f "$R" ] || { echo "TIMEOUT — no result after ~40min" >&2; exit 6; }

R="$R" python3 - <<'PY'
import json, os
d=json.load(open(os.environ["R"])); r=d.get("result",{})
print("\n===== E2E RESULT =====")
print("overall ok:", r.get("ok"), "| platform:", r.get("platform"))
err=r.get("error")
if err: print("ERROR:", str(err)[:400])
fails=[]
for g in ("forward","incremental","idempotent"):
    steps=r.get("steps",{}).get(g)
    if not steps: continue
    print(f"\n--- {g} ---")
    for s in (steps if isinstance(steps,list) else [steps]):
        tag="PASS" if s.get("ok") else "FAIL"
        if not s.get("ok"): fails.append(f"{g}.{s.get('name')}")
        keep={k:v for k,v in s.items() if k in ("counts","recordMap","destRows","recordMapOneToOne","object","before","after","mode","fullProcessed","incrProcessed","incrSucceeded","processed","succeeded")}
        print(f"  [{tag}] {s.get('name')}: {json.dumps(keep)}")
print("\n===== SUMMARY =====")
print("FAILURES:", ", ".join(fails) if fails else ("none — all assertions green" if not err else "setup error (see above)"))
PY
echo ""
echo "error signatures in MJAPI log: recErr=$(grep -c 'sync.record.error' /tmp/ss-mjapi-4007.log 2>/dev/null) txn=$(grep -c 'Transaction has not begun' /tmp/ss-mjapi-4007.log 2>/dev/null)"
