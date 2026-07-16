#!/bin/bash
# _freshcycle.sh <slug> <intName> <srcFile> [envKey] [cfgKey]
set -uo pipefail
MJ=/Users/bcladmin/Projects/MemberJunction/MJ; T="$MJ/packages/Integration/connectors/test"
export DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa DB_PASSWORD=Claude2Sql99
slug="$1"; intName="$2"; src="$3"; envKey="${4:-}"; cfgKey="${5:-}"
# 1) full clean
/usr/local/bin/node "$T/_purge.mjs" >/dev/null 2>&1
for n in stripe eventbrite zendesk "Wild Apricot" magnetmail blackbaud; do INT_NAME="$n" /usr/local/bin/node "$T/_cleanci.mjs" >/dev/null 2>&1; done
/usr/local/bin/node "$T/reset-to-core.mjs" 2>&1 | tail -1
for s in stripe eventbrite zendesk wild_apricot magnetmail blackbaud; do DROP_SCHEMA=$s /usr/local/bin/node "$T/_dropschema.mjs" >/dev/null 2>&1; done
# 2) restart MJAPI
pid=$(lsof -nP -iTCP:4007 -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $2}'); [ -n "$pid" ] && kill "$pid" 2>/dev/null
for i in $(seq 1 15); do lsof -nP -iTCP:4007 -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 1; done
MJ_CODEGEN_NO_AFTER=1 bash "$T/start-ss-mjapi.sh" >/dev/null 2>&1
for i in $(seq 1 45); do lsof -nP -iTCP:4007 -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 3; done
sleep 3
# 3) seed + run
MJ_REPO_ROOT="/tmp/${slug}-seed" CONNECTORS="$slug" /usr/local/bin/node "$T/bulk-insert-connectors.mjs" 2>&1 | grep -E "bulk Integration|IntegrationObject:|ERROR|Lookup failed" | head -3
rm -f "$T/fixtures/${slug}/fixtures/fixtures.json"
export MJ_API_KEY="$(cat /tmp/mjkey.txt)" E2E_CONNECTOR="$slug" E2E_INTEGRATION="$intName" E2E_WRITE_ALL=1 \
  E2E_CONNECTOR_SRC_FILE="$src" CONN_OUT="/tmp/${slug}-REAL-result.json" E2E_DB_REQUEST_TIMEOUT_MS=600000
[ -n "$envKey" ] && export E2E_RESPONSE_ENVELOPE_KEY="$envKey"
[ -n "$cfgKey" ] && export E2E_CFG_URL_KEY="$cfgKey"
/usr/local/bin/node "$T/run-connector-mock.mjs" > "/tmp/${slug}-REAL.log" 2>&1
echo "FRESH_DONE $slug"
