#!/bin/bash
set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
SRC=/tmp/conn-push-root; LOGD=packages/Integration/connectors/test/logs
for v in cvent fonteva hivebrite neon-crm openwater orcid path-lms netsuite; do
  R=/tmp/push2-$v; rm -rf "$R"; mkdir -p "$R/integrations"
  printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["integrations"] }\n' > "$R/.mj-sync.json"
  cp "$SRC/integrations/.mj-sync.json" "$R/integrations/.mj-sync.json"
  cp -r "$SRC/integrations/$v" "$R/integrations/$v"
  npx mj sync push --dir "$R" --ci > "$LOGD/04-$v.log" 2>&1; ec=$?
  if [ $ec -eq 0 ]; then echo "$v: PASS"; else echo "$v: FAIL(exit=$ec) :: $(grep -m1 -iE 'FATAL|cannot|constraint|truncat|String or binary|conversion|too long|duplicate|null|Lookup' "$LOGD/04-$v.log" | tr -s ' ' | head -c 170)"; fi
done
echo "### loop done"
