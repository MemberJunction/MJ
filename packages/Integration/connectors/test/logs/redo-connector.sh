#!/bin/bash
# Replace a deprecated-seeded connector with CURRENT metadata (the F10 fix, applied at deploy):
#   1) author deletes from the DB's current (stale-seeded) IO IDs
#   2) delete-only push (removes old IO + dependent IOF via --delete-db-only)
#   3) upsert CURRENT metadata (F1-stripped + MetadataSource + @parent:IntegrationID + width-trim)
# Usage: redo-connector.sh <connector-dir> <IntegrationName>
set -e
ROOT=/Users/madhavsubramaniyam/Projects/MJ/MJ-unified
cd "$ROOT"; set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
DIR="$1"; NAME="$2"; SQLCMD=/opt/mssql-tools18/bin/sqlcmd
LOGD=packages/Integration/connectors/test/logs
echo "### REDO $DIR ($NAME)"
BEFORE=$(docker exec sql-claude $SQLCMD -S localhost -U sa -P 'Claude2Sql99' -C -d MJ_CONN_E2E -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1)
echo "  before (stale seed) IOs=$BEFORE"

# 1) author deletes from current seeded IO IDs
docker exec sql-claude $SQLCMD -S localhost -U sa -P 'Claude2Sql99' -C -d MJ_CONN_E2E -h -1 -W -s'|' -Q "SET NOCOUNT ON; SELECT io.Name+'|'+CAST(io.ID AS VARCHAR(36)) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep '|' > /tmp/redo-$DIR-ids.txt
DR=/tmp/redo-del-$DIR; rm -rf "$DR"; mkdir -p "$DR/integration-object-deletes"
printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["integration-object-deletes"] }\n' > "$DR/.mj-sync.json"
cp metadata/integration-object-deletes/.mj-sync.json "$DR/integration-object-deletes/.mj-sync.json"
node -e '
const fs=require("fs");
const lines=fs.readFileSync("/tmp/redo-'$DIR'-ids.txt","utf8").trim().split("\n").map(l=>l.trim()).filter(Boolean);
const recs=lines.map(l=>{const[name,id]=l.split("|");return{fields:{Name:name},primaryKey:{ID:id},deleteRecord:{delete:true}};});
fs.writeFileSync("'$DR'/integration-object-deletes/.old-'$DIR'-seed.deletes.json",JSON.stringify(recs,null,2)+"\n");
console.log("  authored "+recs.length+" delete records");
'
# 2) delete-only push
npx mj sync push --dir "$DR" --delete-db-only --ci > "$LOGD/17-$DIR-delete.log" 2>&1 && echo "  delete-push: OK" || echo "  delete-push: FAIL(see 17-$DIR-delete.log)"
AFTERDEL=$(docker exec sql-claude $SQLCMD -S localhost -U sa -P 'Claude2Sql99' -C -d MJ_CONN_E2E -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1)
echo "  after delete IOs=$AFTERDEL (expect 0)"

# 3) build stripped current push copy + upsert
UR=/tmp/redo-up-$DIR; rm -rf "$UR"; mkdir -p "$UR/integrations"
printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["integrations"] }\n' > "$UR/.mj-sync.json"
cp metadata/integrations/.mj-sync.json "$UR/integrations/.mj-sync.json"
rsync -a --exclude='.backups' --exclude='*.bak' "metadata/integrations/$DIR/" "$UR/integrations/$DIR/"
CONN_DIR="$DIR" node packages/Integration/connectors/test/strip-pushcopy.mjs "$UR/integrations/$DIR"
npx mj sync push --dir "$UR" --ci > "$LOGD/17-$DIR-upsert.log" 2>&1 && echo "  upsert: OK" || echo "  upsert: FAIL(see 17-$DIR-upsert.log)"
AFTER=$(docker exec sql-claude $SQLCMD -S localhost -U sa -P 'Claude2Sql99' -C -d MJ_CONN_E2E -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON i.ID=io.IntegrationID WHERE i.Name='$NAME';" 2>&1 | grep -oE '^[0-9]+' | head -1)
echo "  after upsert IOs=$AFTER (current metadata)"
