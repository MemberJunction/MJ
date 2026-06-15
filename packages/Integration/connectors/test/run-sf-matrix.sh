#!/usr/bin/env bash
# Phase B-2 — engine sync matrix (forward 2-object FK + pagination + custom-cols + incremental +
# delta CRUD + delete-detection via queryAll + idempotency) through the REAL MJAPI GraphQL pipeline
# on :4014/MJ_SALESFORCE, mock vendor replaying the expanded fixtures.json. Credential-free.
set -a
DB_PASSWORD="${DB_PASSWORD:-$(grep -E '^DB_PASSWORD=' /Users/madhavsubramaniyam/Projects/MJ/MJ-unified/packages/MJAPI/.env | head -1 | cut -d= -f2- | tr -d '"')}"
MJ_API_KEY="$(cat /tmp/sf-mjkey.txt)"
E2E_CONNECTOR=salesforce
E2E_MODE=mock
E2E_FIXTURES_DIR=/tmp/sf-rich-fixtures
E2E_INTEGRATION=Salesforce
E2E_OBJECTS=Account,Contact,Opportunity,Case,Order,Asset,Product2,Lead,Campaign
E2E_SCHEMA_REFRESH=false
HS_LIVE_PLATFORM=sqlserver
HS_LIVE_GRAPHQL_URL=http://localhost:4014/
HS_LIVE_DB_HOST=localhost
HS_LIVE_DB_PORT=1447
HS_LIVE_DB_NAME=MJ_SALESFORCE
HS_LIVE_DB_USER=sa
HS_LIVE_MJ_SCHEMA=__mj
HS_LIVE_COMPANY_ID=16FF57A8-4040-4E5B-9B29-C013CA08B9B0
HS_LIVE_CREDTYPE_ID=4A5D4276-E084-4968-9AB2-965A2B055840
HS_LIVE_MAX_POLLS=600
set +a
cd /Users/madhavsubramaniyam/Projects/MJ/MJ-unified/packages/Integration/connectors/test
node run-sf-e2e.mjs
