#!/bin/bash
# _drive.sh <slug> <intName> <srcFile> [envKey] [cfgKey]
set -uo pipefail
MJ=/Users/bcladmin/Projects/MemberJunction/MJ; T="$MJ/packages/Integration/connectors/test"
export DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa DB_PASSWORD=Claude2Sql99
slug="$1"; intName="$2"; src="$3"; envKey="${4:-}"; cfgKey="${5:-}"
INT_NAME="$intName" /usr/local/bin/node "$T/_cleanci.mjs" 2>&1 | tail -1
MJ_REPO_ROOT="/tmp/${slug}-seed" CONNECTORS="$slug" /usr/local/bin/node "$T/bulk-insert-connectors.mjs" 2>&1 | grep -E "bulk Integration|IntegrationObject:|DONE|ERROR|Lookup failed" | head -4
rm -f "$T/fixtures/${slug}/fixtures/fixtures.json"
export MJ_API_KEY="$(cat /tmp/mjkey.txt)" E2E_CONNECTOR="$slug" E2E_INTEGRATION="$intName" E2E_WRITE_ALL=1 \
  E2E_CONNECTOR_SRC_FILE="$src" CONN_OUT="/tmp/${slug}-REAL-result.json" E2E_DB_REQUEST_TIMEOUT_MS=600000
[ -n "$envKey" ] && export E2E_RESPONSE_ENVELOPE_KEY="$envKey"
[ -n "$cfgKey" ] && export E2E_CFG_URL_KEY="$cfgKey"
/usr/local/bin/node "$T/run-connector-mock.mjs" > "/tmp/${slug}-REAL.log" 2>&1
echo "DRIVE_DONE $slug"
