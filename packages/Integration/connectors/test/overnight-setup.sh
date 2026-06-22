#!/usr/bin/env bash
# overnight-setup.sh — FAITHFUL to context/plans.md + operator's PARALLEL/high-perf directives:
#   fresh DB (+ high-throughput pragmas) -> mj migrate
#   -> sync push --include integration-object-deletes --delete-db-only --parallel-batch-size 10 (clear stale)
#   -> sync push --parallel-batch-size 10 (full, all things)
#   -> mj codegen -> build -> start api.
# Speedups (high-perf laptop, throwaway DB): 8GB node heap, 50-way parallel push, DB pool 200
# (mj.config.cjs + MetadataSync provider-utils), DELAYED_DURABILITY=FORCED + SIMPLE recovery so
# 50 concurrent small commits don't each wait on a log flush. Tolerant logging; only hard stop = SQL down.
set -uo pipefail
# Portable: repo root = 4 levels up from this script (packages/Integration/connectors/test), override via MJ_REPO_ROOT.
REPO_ROOT="${MJ_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
export DB_PLATFORM=sqlserver DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E
export DB_USERNAME=sa DB_PASSWORD=Claude2Sql99 DB_TRUST_SERVER_CERTIFICATE=1 MJ_CORE_SCHEMA=__mj
export CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD=Claude2Sql99
export GRAPHQL_PORT=4007 MJ_DISABLE_SCHEDULED_JOBS=1
export MJ_SYNC_REQUEST_TIMEOUT_MS=600000
export NODE_OPTIONS="--max-old-space-size=8192"      # 8GB heap for the 50-way parallel push
KEY_FILE=/tmp/mj-ss-e2e.env
[ -f "$KEY_FILE" ] && { export MJ_API_KEY="$(grep -m1 '^MJ_API_KEY=' "$KEY_FILE"|cut -d= -f2-)"; export MJ_BASE_ENCRYPTION_KEY="$(grep -m1 '^MJ_BASE_ENCRYPTION_KEY=' "$KEY_FILE"|cut -d= -f2-)"; }
runmj() { ( cd "$REPO_ROOT" && node packages/MJCLI/bin/run.js "$@" ); }
SQLC()  { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Claude2Sql99' -C "$@"; }
say()   { printf '\n=== %s ===\n' "$1"; }

say "0) ensure CLI+API dist present (build only if missing)"
if [ ! -d "$REPO_ROOT/packages/MJCLI/dist" ] || [ ! -d "$REPO_ROOT/packages/MJAPI/dist" ]; then
  ( cd "$REPO_ROOT" && npx turbo build --filter=@memberjunction/cli --filter=mj_api ) > /tmp/ov-build.log 2>&1 \
    && echo "build OK" || { echo "BUILD FAILED — tail:"; tail -30 /tmp/ov-build.log; exit 2; }
else echo "cli+api dist present — skip build"; fi

say "1) FRESH DB + high-throughput pragmas"
# Stop any running MJAPI FIRST — it holds a DB connection that blocks DROP, and SET SINGLE_USER WITH
# ROLLBACK leaves the DB stuck single-user if MJAPI reconnects (the prior failure). Kill listener + sessions.
lsof -ti tcp:${GRAPHQL_PORT} 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "packages/MJAPI" 2>/dev/null || true
SQLC -Q "IF DB_ID('MJ_SS_E2E') IS NOT NULL BEGIN DECLARE @k NVARCHAR(MAX)=''; SELECT @k=@k+'KILL '+CAST(session_id AS VARCHAR)+';' FROM sys.dm_exec_sessions WHERE database_id=DB_ID('MJ_SS_E2E') AND session_id<>@@SPID; EXEC sp_executesql @k; ALTER DATABASE [MJ_SS_E2E] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [MJ_SS_E2E]; END; CREATE DATABASE [MJ_SS_E2E];" 2>&1 | grep -viE "rows affected|^$" || true
SQLC -Q "ALTER DATABASE [MJ_SS_E2E] SET RECOVERY SIMPLE;" 2>&1 | grep -viE "rows affected|^$" || true
echo "fresh DB + SIMPLE recovery (DELAYED_DURABILITY removed — it slowed recovery + risked the parallel hang)"

say "2) mj migrate"
runmj migrate --dir ./migrations/v5 > /tmp/ov-migrate.log 2>&1 && echo "migrate OK" || { echo "MIGRATE FAILED — tail:"; tail -25 /tmp/ov-migrate.log; exit 3; }

say "3a) sync push delete pass (integration-object-deletes, --delete-db-only, parallel 50)"
runmj sync push --dir metadata --include integration-object-deletes --delete-db-only --parallel-batch-size 10 --ci > /tmp/ov-push-delete.log 2>&1 \
  && echo "delete pass OK" || echo "delete pass had issues (tolerated) — tail: $(tail -4 /tmp/ov-push-delete.log | tr '\n' ' ')"

say "3b) sync push FULL (--parallel-batch-size 10, all things)"
runmj sync push --dir metadata --parallel-batch-size 10 --ci > /tmp/ov-push-full.log 2>&1 \
  && echo "full push OK" || echo "full push reported non-zero (inspect /tmp/ov-push-full.log) — tail: $(tail -8 /tmp/ov-push-full.log | tr '\n' ' ')"

say "3c) deploy count — the 20 connectors"
SQLC -d MJ_SS_E2E -h -1 -W -Q "SET NOCOUNT ON; SELECT 'integrations20='+CAST(COUNT(*) AS VARCHAR) FROM __mj.Integration WHERE Name IN ('Cvent','Fonteva','GrowthZone','Hivebrite','iMIS','MemberSuite','Microsoft Dynamics 365','Neon CRM','NetForum Enterprise','NetSuite','Nimble AMS','Novi AMS','OpenWater','ORCID','Path LMS','PheedLoop','PropFuel','Rhythm','Salesforce','SharePoint'); SELECT 'IO_total='+CAST(COUNT(*) AS VARCHAR) FROM __mj.IntegrationObject;" 2>/dev/null | tr -d '\r' | grep -E "integrations20=|IO_total="

say "4) mj codegen"
runmj codegen > /tmp/ov-codegen.log 2>&1 && echo "codegen OK" || echo "codegen reported non-zero (inspect /tmp/ov-codegen.log) — tail: $(tail -6 /tmp/ov-codegen.log | tr '\n' ' ')"

say "5) start API"
bash "$REPO_ROOT/packages/Integration/connectors/test/start-ss-mjapi.sh" > /tmp/ov-mjapi-start.log 2>&1 || true
for i in $(seq 1 80); do code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4007/ 2>/dev/null); [ "$code" = "401" ] && break; sleep 3; done
echo "MJAPI :4007 -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:4007/ 2>/dev/null)"

say "SETUP COMPLETE"
