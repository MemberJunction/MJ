#!/usr/bin/env bash
# deploy-only.sh — DB is ALREADY migrated. NO fresh DB, NO migrate. Just deploy the 20 connectors
# onto the existing migrated DB, then codegen + API. parallel-10 (the only config that completes).
# RUN TO COMPLETION — do not kill.
set -uo pipefail
# Portable: repo root = 4 levels up from this script (packages/Integration/connectors/test), override via MJ_REPO_ROOT.
REPO_ROOT="${MJ_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
export DB_PLATFORM=sqlserver DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E
export DB_USERNAME=sa DB_PASSWORD=Claude2Sql99 DB_TRUST_SERVER_CERTIFICATE=1 MJ_CORE_SCHEMA=__mj
export CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD=Claude2Sql99
export GRAPHQL_PORT=4007 MJ_DISABLE_SCHEDULED_JOBS=1
export NODE_OPTIONS="--max-old-space-size=8192"
KEY_FILE=/tmp/mj-ss-e2e.env
[ -f "$KEY_FILE" ] && { export MJ_API_KEY="$(grep -m1 '^MJ_API_KEY=' "$KEY_FILE"|cut -d= -f2-)"; export MJ_BASE_ENCRYPTION_KEY="$(grep -m1 '^MJ_BASE_ENCRYPTION_KEY=' "$KEY_FILE"|cut -d= -f2-)"; }
runmj() { ( cd "$REPO_ROOT" && node packages/MJCLI/bin/run.js "$@" ); }
SQLC()  { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Claude2Sql99' -C "$@"; }
say()   { printf '\n=== %s ===\n' "$1"; }

say "A) delete pass — clear migrate-seeded stale (parallel-10)"
runmj sync push --dir metadata --include integration-object-deletes --delete-db-only --parallel-batch-size 10 --ci > /tmp/ov-push-delete.log 2>&1 \
  && echo "delete pass OK" || echo "delete pass issues (tolerated) — tail: $(tail -3 /tmp/ov-push-delete.log | tr '\n' ' ')"

say "B) full push — deploy the 20 connectors (parallel-10)"
runmj sync push --dir metadata --parallel-batch-size 10 --ci > /tmp/ov-push-full.log 2>&1 \
  && echo "full push OK" || echo "full push non-zero — tail: $(tail -6 /tmp/ov-push-full.log | tr '\n' ' ')"

say "C) deploy count"
SQLC -d MJ_SS_E2E -h -1 -W -Q "SET NOCOUNT ON; SELECT 'integrations20='+CAST(COUNT(*) AS VARCHAR) FROM __mj.Integration WHERE Name IN ('Cvent','Fonteva','GrowthZone','Hivebrite','iMIS','MemberSuite','Microsoft Dynamics 365 (Dataverse)','Neon CRM','NetForum Enterprise','NetSuite','Nimble AMS','Novi AMS','OpenWater','ORCID','Path LMS','PheedLoop','PropFuel','Rhythm Software','Salesforce','SharePoint'); SELECT 'IOF='+CAST(COUNT(*) AS VARCHAR) FROM __mj.IntegrationObjectField;" 2>/dev/null | tr -d '\r' | grep -E "integrations20=|IOF="

say "D) codegen"
runmj codegen > /tmp/ov-codegen.log 2>&1 && echo "codegen OK" || echo "codegen non-zero (tolerated if core ok) — tail: $(tail -5 /tmp/ov-codegen.log | tr '\n' ' ')"

say "E) start API"
bash "$REPO_ROOT/packages/Integration/connectors/test/start-ss-mjapi.sh" > /tmp/ov-mjapi-start.log 2>&1 || true
for i in $(seq 1 80); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4007/ 2>/dev/null)" = "401" ] && break; sleep 3; done
echo "MJAPI :4007 -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:4007/ 2>/dev/null)"

say "DEPLOY COMPLETE"
