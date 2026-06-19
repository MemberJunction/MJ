#!/bin/bash
# ============================================================================
# PRODUCTION-GRADE RETEST of all 13 connectors — ONE DB, ONE MJAPI, salesforce LAST.
# Deterministic + re-runnable. The "unbreakable setup": fresh DB -> migrate -> credtypes ->
# codegen -> build -> pm2 restart -> deploy 13 (redo recipe) -> per-connector mock matrix.
#
# Usage:  bash packages/Integration/connectors/test/logs/retest-all13.sh [PHASE]
#   PHASE (optional): env | deploy | matrix | all  (default all)
#   FROM=<dir> with PHASE=matrix to resume the matrix at a connector.
#
# Every step logs to packages/Integration/connectors/test/logs/retest-*.log.
# Per-connector isolation: one connector failing never aborts the rest.
# ============================================================================
set -uo pipefail
ROOT=/Users/madhavsubramaniyam/Projects/MJ/MJ-unified
cd "$ROOT"
set -a; . ./.env; set +a
export DB_TRUST_SERVER_CERTIFICATE=1

PHASE="${1:-all}"
LOGD="$ROOT/packages/Integration/connectors/test/logs"
TESTD="$ROOT/packages/Integration/connectors/test"
DB="${DB_DATABASE:-MJ_CONN_E2E}"
PORT="${GRAPHQL_PORT:-4021}"
SAPW="${DB_PASSWORD}"
mkdir -p "$LOGD"

SQ() { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SAPW" -C -d "$DB" -h -1 -W "$@"; }
SQM() { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SAPW" -C -d master -h -1 -W "$@"; }
say() { echo "[retest $(date +%H:%M:%S)] $*"; }

# 13 connectors: dir|IntegrationName  (salesforce LAST)
ALL=(
  "cvent|Cvent"
  "fonteva|Fonteva"
  "hivebrite|Hivebrite"
  "neon-crm|Neon CRM"
  "openwater|OpenWater"
  "orcid|ORCID"
  "path-lms|Path LMS"
  "netsuite|NetSuite"
  "imis|iMIS"
  "growthzone|GrowthZone"
  "nimble-ams|Nimble AMS"
  "propfuel|PropFuel"
  "salesforce|Salesforce"
)
MATRIX_ORDER=(cvent fonteva hivebrite neon-crm openwater orcid path-lms netsuite imis growthzone nimble-ams propfuel salesforce)

# ---------------------------------------------------------------------------
phase_env() {
  say "PHASE 1 — fresh env"
  say "1) drop+recreate $DB"
  SQM -Q "IF DB_ID('$DB') IS NOT NULL BEGIN ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DB]; END; CREATE DATABASE [$DB];" > "$LOGD/retest-01-dbcreate.log" 2>&1
  say "   created (exit ${PIPESTATUS[0]:-?})"

  say "1b) quarantine UNTRACKED RSU migration artifacts (prior-run live tables; cause version collisions)"
  local rsuMoved=0
  for f in $(ls "$ROOT"/migrations/v5/V*__RSU_*.sql 2>/dev/null | grep -v '\.skip$'); do
    if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then say "   REFUSING to move TRACKED $f"; continue; fi
    mv "$f" "$f.skip"; rsuMoved=$((rsuMoved+1))
  done
  say "   quarantined $rsuMoved untracked RSU .sql -> .skip (connector tables are re-created at ApplyAll)"

  say "2) mj migrate (includes F1 V202606171600)"
  npx mj migrate --dir ./migrations/v5 > "$LOGD/retest-02-migrate.log" 2>&1
  local mc=$?
  say "   migrate exit=$mc (tail): $(tail -3 "$LOGD/retest-02-migrate.log" | tr '\n' ' ' | head -c 200)"
  # confirm F1 columns landed
  local f1=$(SQ -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('__mj.IntegrationObject') AND name IN ('SupportsCreate','SyncStrategy','StableOrderingKey','ContentHashApplicable');" 2>&1 | grep -oE '^[0-9]+' | head -1)
  say "   F1 IntegrationObject cols present: $f1/4"

  say "4) push credential-types (scoped, first; strip deleteRecord markers that roll back a fresh push)"
  local R=/tmp/retest-credtypes; rm -rf "$R"; mkdir -p "$R"
  printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["credential-types"] }\n' > "$R/.mj-sync.json"
  rsync -a --exclude='.backups' "$ROOT/metadata/credential-types/" "$R/credential-types/"
  # A leftover deleteRecord (e.g. retiring "GrowthZone API") fails on a fresh-from-baseline DB and rolls
  # back the WHOLE push, so the NEW cred types never land. Strip delete markers — upsert-only is what we need.
  node -e '
    const fs=require("fs");const p=process.argv[1];
    const a=JSON.parse(fs.readFileSync(p,"utf8"));const arr=Array.isArray(a)?a:[a];
    const kept=arr.filter(r=>!r.deleteRecord);
    fs.writeFileSync(p,JSON.stringify(kept,null,2)+"\n");
    process.stderr.write(`stripped ${arr.length-kept.length} deleteRecord(s); ${kept.length} cred types to upsert\n`);
  ' "$R/credential-types/.credential-types.json"
  npx mj sync push --dir "$R" --ci > "$LOGD/retest-03-credtypes.log" 2>&1
  say "   credtypes push exit=$? :: $(grep -m1 -iE 'Created:|Updated:|error|fail' "$LOGD/retest-03-credtypes.log" | head -c 140)"
  # Hivebrite needs 'OAuth2 Password Grant' — added to the cred-types metadata. Push it as an isolated
  # single-record file (a full-file re-push can fail at [0] once mj-sync has written back primaryKey/sync).
  local PG=/tmp/retest-ct-pwgrant; rm -rf "$PG"; mkdir -p "$PG/credential-types/schemas"
  printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["credential-types"] }\n' > "$PG/.mj-sync.json"
  cp "$ROOT/metadata/credential-types/.mj-sync.json" "$PG/credential-types/.mj-sync.json"
  cp "$ROOT/metadata/credential-types/schemas/oauth2-password-grant.schema.json" "$PG/credential-types/schemas/" 2>/dev/null || true
  printf '%s\n' '[{"fields":{"Name":"OAuth2 Password Grant","Description":"OAuth2 Resource Owner Password Credentials grant (used by Hivebrite).","Category":"Authentication","FieldSchema":"@file:schemas/oauth2-password-grant.schema.json","IconClass":"fa-solid fa-key","ValidationEndpoint":null}}]' > "$PG/credential-types/.pwgrant.json"
  npx mj sync push --dir "$PG" --ci > "$LOGD/retest-03b-pwgrant.log" 2>&1
  say "   pwgrant push exit=$? (OAuth2 Password Grant for Hivebrite)"

  say "5) mj codegen (advancedGen OFF)"
  npx mj codegen > "$LOGD/retest-04-codegen.log" 2>&1
  local cg=$?
  say "   codegen exit=$cg :: $(grep -m1 -iE 'CodeGen completed|error|MJRSUAuditLog' "$LOGD/retest-04-codegen.log" | head -c 160)"
  local cgerr=$(grep -cE 'error TS|Error:|FAILED' "$LOGD/retest-04-codegen.log" 2>/dev/null || echo 0)
  say "   codegen error-lines: $cgerr"

  say "6) turbo build --filter=mj_api"
  npx turbo build --filter=mj_api > "$LOGD/retest-05-build.log" 2>&1
  say "   build exit=$? :: $(grep -m1 -iE 'Tasks:.*successful|error TS|FAILED' "$LOGD/retest-05-build.log" | head -c 140)"

  say "7) pm2 restart mjapi -> wait for 401"
  pm2 restart mjapi --update-env > "$LOGD/retest-06-pm2.log" 2>&1 || pm2 start "$LOGD/start-mjapi.sh" --name mjapi >> "$LOGD/retest-06-pm2.log" 2>&1
  local code=$(curl --retry 60 --retry-delay 2 --retry-connrefused -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/")
  say "   MJAPI health http_code=$code (401=healthy)"

  # ensure the test Company exists (matrix attaches connections to it)
  local CID='C0FFEE00-0000-4000-8000-000000000013'
  SQ -Q "SET NOCOUNT ON; IF NOT EXISTS (SELECT 1 FROM __mj.Company WHERE ID='$CID') INSERT INTO __mj.Company (ID, Name, Description) VALUES ('$CID','Connector Retest Co','Throwaway company for the 13-connector retest');" > "$LOGD/retest-07-company.log" 2>&1
  say "   test Company $CID ensured (exit ${PIPESTATUS[0]:-?})"
  say "PHASE 1 done."
}

# ---------------------------------------------------------------------------
# Deploy ONE connector via the redo recipe: author deletes from CURRENT DB IO IDs ->
# delete-only push (--delete-db-only) -> upsert stripped current metadata. Robust whether
# the Integration was baseline-seeded (stale IOs cleared) or brand-new (delete is a no-op).
deploy_one() {
  local DIR="$1" NAME="$2"
  local before after
  before=$(SQ -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1)
  before=${before:-0}

  # 1) author deletes from live IO IDs
  SQ -s'|' -Q "SET NOCOUNT ON; SELECT io.Name+'|'+CAST(io.ID AS VARCHAR(36)) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep '|' > "/tmp/retest-del-$DIR-ids.txt" || true
  local nids=$(wc -l < "/tmp/retest-del-$DIR-ids.txt" 2>/dev/null | tr -d ' ')
  nids=${nids:-0}

  if [ "$nids" -gt 0 ]; then
    # Set-based SQL delete of the stale IO/IOF for THIS integration (sub-second), instead of mj-sync's
    # per-row --delete-db-only (which logs ~3 lines + a round-trip PER IOF — pathologically slow for a
    # large connector like Salesforce with 31k IOFs). Same end-state (stale IO/IOF gone, Integration row
    # kept for the in-place upsert), but deterministic and fast. We delete IOF first (FK), then IO.
    SQ -Q "SET NOCOUNT ON;
      DELETE f FROM __mj.IntegrationObjectField f
        JOIN __mj.IntegrationObject io ON io.ID=f.IntegrationObjectID
        JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';
      DELETE io FROM __mj.IntegrationObject io
        JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" \
      > "$LOGD/retest-deploy-$DIR-delete.log" 2>&1
    echo "set-based SQL delete of $nids stale IOs (+ their IOFs) for '$NAME'" >> "$LOGD/retest-deploy-$DIR-delete.log"
  else
    echo "no stale IOs; delete skipped" > "$LOGD/retest-deploy-$DIR-delete.log"
  fi

  # 2) upsert stripped current metadata
  local UR=/tmp/retest-up-$DIR; rm -rf "$UR"; mkdir -p "$UR/integrations"
  printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["integrations"] }\n' > "$UR/.mj-sync.json"
  cp "$ROOT/metadata/integrations/.mj-sync.json" "$UR/integrations/.mj-sync.json"
  rsync -a --exclude='.backups' --exclude='*.bak' "$ROOT/metadata/integrations/$DIR/" "$UR/integrations/$DIR/"
  CONN_DIR="$DIR" node "$TESTD/strip-pushcopy.mjs" "$UR/integrations/$DIR" >> "$LOGD/retest-deploy-$DIR-upsert.log" 2>&1
  # If the Integration row ALREADY exists (baseline-seeded deprecated connector), inject its primaryKey so
  # mj-sync UPDATES in place instead of INSERTing a duplicate -> avoids UQ_Integration_Name (DEPLOY.md).
  local existId
  existId=$(SQ -Q "SET NOCOUNT ON; SELECT TOP 1 CAST(ID AS VARCHAR(36)) FROM __mj.Integration WHERE Name='$NAME';" 2>&1 | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -n "$existId" ]; then
    JF=$(ls "$UR/integrations/$DIR"/.*.integration.json 2>/dev/null | head -1)
    EID="$existId" node -e '
      const fs=require("fs");const p=process.argv[1];
      const a=JSON.parse(fs.readFileSync(p,"utf8"));const arr=Array.isArray(a)?a:[a];
      arr[0].primaryKey={ID:process.env.EID};
      fs.writeFileSync(p,JSON.stringify(arr,null,2)+"\n");
    ' "$JF"
    say "   injected existing Integration primaryKey $existId (avoid UQ_Integration_Name)"
  fi
  npx mj sync push --dir "$UR" --ci >> "$LOGD/retest-deploy-$DIR-upsert.log" 2>&1
  local uec=$?

  after=$(SQ -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1)
  after=${after:-0}
  local iofs=$(SQ -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObjectField f JOIN __mj.IntegrationObject io ON io.ID=f.IntegrationObjectID JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1)
  iofs=${iofs:-0}
  echo "{\"dir\":\"$DIR\",\"name\":\"$NAME\",\"before\":$before,\"staleDeleted\":$nids,\"afterIO\":$after,\"afterIOF\":$iofs,\"upsertExit\":$uec}" > "/tmp/retest-deploy-$DIR.json"
  say "   $DIR: before=$before staleDel=$nids -> IO=$after IOF=$iofs (upsert exit=$uec)"
}

phase_deploy() {
  say "PHASE 2 — deploy all 13 (redo recipe; per-connector isolated)"
  for row in "${ALL[@]}"; do
    IFS='|' read -r dir name <<< "$row"
    say "deploy $dir ($name)"
    deploy_one "$dir" "$name" || say "   $dir deploy hit an error (continuing)"
  done
  say "PHASE 2 done."
}

# ---------------------------------------------------------------------------
phase_matrix() {
  say "PHASE 3 — per-connector mock matrix (salesforce LAST)"
  # Build /tmp/matrix-config.json from the DB: dir -> {name, credTypeID}
  local cfgjson="["; local first=1
  for row in "${ALL[@]}"; do
    IFS='|' read -r dir name <<< "$row"
    local ct=$(SQ -Q "SET NOCOUNT ON; SELECT TOP 1 CAST(CredentialTypeID AS VARCHAR(36)) FROM __mj.Integration WHERE Name='$name';" 2>&1 | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    [ $first -eq 0 ] && cfgjson="$cfgjson,"; first=0
    cfgjson="$cfgjson{\"dir\":\"$dir\",\"name\":\"$name\",\"credTypeID\":\"${ct:-}\"}"
  done
  cfgjson="$cfgjson]"
  echo "$cfgjson" > /tmp/matrix-config.json
  say "   wrote /tmp/matrix-config.json"

  local startfrom="${FROM:-}"; local skipping=0
  [ -n "$startfrom" ] && skipping=1
  for dir in "${MATRIX_ORDER[@]}"; do
    if [ $skipping -eq 1 ]; then [ "$dir" = "$startfrom" ] && skipping=0 || continue; fi
    say "matrix $dir"
    # Each connector in its OWN node process so a crash isolates to that connector.
    RUN_DIRS="$dir" node "$LOGD/retest-matrix.mjs" > "$LOGD/retest-matrix-$dir.log" 2>&1 || say "   $dir matrix process exited nonzero (continuing)"
    say "   $dir: $(tail -1 "$LOGD/retest-matrix-$dir.log" | head -c 240)"
  done
  say "PHASE 3 done."
}

# ---------------------------------------------------------------------------
build_report() {
  say "Building RETEST_RESULTS.md"
  node "$LOGD/retest-report.mjs" "$ROOT/packages/Integration/connectors/test/RETEST_RESULTS.md" "${MATRIX_ORDER[@]}"
  say "Report at packages/Integration/connectors/test/RETEST_RESULTS.md"
}

case "$PHASE" in
  env)    phase_env ;;
  deploy) phase_deploy ;;
  matrix) phase_matrix; build_report ;;
  all)    phase_env; phase_deploy; phase_matrix; build_report ;;
  report) build_report ;;
  *) echo "unknown phase '$PHASE' (env|deploy|matrix|all|report)"; exit 2 ;;
esac
say "retest-all13.sh ($PHASE) complete."
