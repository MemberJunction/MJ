#!/bin/bash
set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
cd packages/Integration/connectors/test
LOGD=logs
declare -a ROWS=( "growthzone|GrowthZone" "netsuite|NetSuite" "imis|iMIS" "path-lms|Path LMS" "hivebrite|Hivebrite" "cvent|Cvent" "fonteva|Fonteva" )
for row in "${ROWS[@]}"; do
  IFS='|' read -r dir name <<< "$row"
  ct=$(node -e "const c=require('/tmp/matrix-config.json').find(x=>x.dir==='$dir');process.stdout.write(c&&c.credTypeID?c.credTypeID:'')")
  echo "### $dir ($name) credType=$ct"
  E2E_CONNECTOR="$dir" E2E_INTEGRATION="$name" E2E_MODE=mock \
  HS_LIVE_GRAPHQL_URL=http://localhost:4021/ HS_LIVE_PLATFORM=sqlserver \
  HS_LIVE_COMPANY_ID=C0FFEE00-0000-4000-8000-000000000013 HS_LIVE_CREDTYPE_ID="$ct" \
  HS_LIVE_DB_HOST=localhost HS_LIVE_DB_PORT=1444 HS_LIVE_DB_NAME=MJ_CONN_E2E HS_LIVE_DB_USER=sa HS_LIVE_MJ_SCHEMA=__mj \
  DB_PASSWORD="$DB_PASSWORD" MJ_API_KEY="$MJ_API_KEY" \
  node run-plan.mjs connector-e2e > "$LOGD/13-$dir.log" 2>&1
  ec=$?
  ok=$(node -e "try{const t=require('fs').readFileSync('$LOGD/13-$dir.log','utf8');const s=t.indexOf('{');const j=JSON.parse(t.slice(s));process.stdout.write((j.ok??j.result?.ok)?'OK':'NOTOK')}catch(e){process.stdout.write('PARSEFAIL')}")
  echo "$dir: exit=$ec verdict=$ok"
done
echo "### matrix done"
