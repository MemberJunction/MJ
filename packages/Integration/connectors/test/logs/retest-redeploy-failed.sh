#!/bin/bash
# Redeploy ONLY the connectors that failed the first Phase 2 pass (UQ_Integration_Name collision),
# using the FIXED deploy_one from retest-all13.sh (injects the existing Integration primaryKey).
# Usage: bash retest-redeploy-failed.sh <dir1> "<Name1>" [<dir2> "<Name2>" ...]
set -uo pipefail
ROOT=/Users/madhavsubramaniyam/Projects/MJ/MJ-unified
cd "$ROOT"; set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
LOGD="$ROOT/packages/Integration/connectors/test/logs"
TESTD="$ROOT/packages/Integration/connectors/test"
DB="${DB_DATABASE:-MJ_CONN_E2E}"; SAPW="${DB_PASSWORD}"
SQ() { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SAPW" -C -d "$DB" -h -1 -W "$@"; }
say() { echo "[redeploy $(date +%H:%M:%S)] $*"; }

# Reuse the exact (fixed) deploy_one logic by sourcing retest-all13.sh's function via a thin re-impl here
deploy_one() {
  local DIR="$1" NAME="$2" before after
  before=$(SQ -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1); before=${before:-0}
  SQ -s'|' -Q "SET NOCOUNT ON; SELECT io.Name+'|'+CAST(io.ID AS VARCHAR(36)) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep '|' > "/tmp/retest-del-$DIR-ids.txt" || true
  local nids; nids=$(wc -l < "/tmp/retest-del-$DIR-ids.txt" 2>/dev/null | tr -d ' '); nids=${nids:-0}
  if [ "$nids" -gt 0 ]; then
    SQ -Q "SET NOCOUNT ON;
      DELETE f FROM __mj.IntegrationObjectField f
        JOIN __mj.IntegrationObject io ON io.ID=f.IntegrationObjectID
        JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';
      DELETE io FROM __mj.IntegrationObject io
        JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" \
      > "$LOGD/retest-redeploy-$DIR-delete.log" 2>&1
  fi
  local UR=/tmp/retest-up-$DIR; rm -rf "$UR"; mkdir -p "$UR/integrations"
  printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["integrations"] }\n' > "$UR/.mj-sync.json"
  cp "$ROOT/metadata/integrations/.mj-sync.json" "$UR/integrations/.mj-sync.json"
  rsync -a --exclude='.backups' --exclude='*.bak' "$ROOT/metadata/integrations/$DIR/" "$UR/integrations/$DIR/"
  CONN_DIR="$DIR" node "$TESTD/strip-pushcopy.mjs" "$UR/integrations/$DIR" >> "$LOGD/retest-redeploy-$DIR-upsert.log" 2>&1
  local existId; existId=$(SQ -Q "SET NOCOUNT ON; SELECT TOP 1 CAST(ID AS VARCHAR(36)) FROM __mj.Integration WHERE Name='$NAME';" 2>&1 | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -n "$existId" ]; then
    local JF; JF=$(ls "$UR/integrations/$DIR"/.*.integration.json 2>/dev/null | head -1)
    EID="$existId" node -e 'const fs=require("fs");const p=process.argv[1];const a=JSON.parse(fs.readFileSync(p,"utf8"));const arr=Array.isArray(a)?a:[a];arr[0].primaryKey={ID:process.env.EID};fs.writeFileSync(p,JSON.stringify(arr,null,2)+"\n");' "$JF"
    say "   injected Integration primaryKey $existId"
  fi
  npx mj sync push --dir "$UR" --ci >> "$LOGD/retest-redeploy-$DIR-upsert.log" 2>&1
  local uec=$?
  after=$(SQ -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1); after=${after:-0}
  local iofs; iofs=$(SQ -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObjectField f JOIN __mj.IntegrationObject io ON io.ID=f.IntegrationObjectID JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1); iofs=${iofs:-0}
  echo "{\"dir\":\"$DIR\",\"name\":\"$NAME\",\"before\":$before,\"staleDeleted\":$nids,\"afterIO\":$after,\"afterIOF\":$iofs,\"upsertExit\":$uec}" > "/tmp/retest-deploy-$DIR.json"
  say "   $DIR: before=$before staleDel=$nids -> IO=$after IOF=$iofs (upsert exit=$uec)"
}

while [ $# -ge 2 ]; do
  say "redeploy $1 ($2)"
  deploy_one "$1" "$2" || say "   $1 hit an error"
  shift 2
done
say "redeploy-failed complete."
