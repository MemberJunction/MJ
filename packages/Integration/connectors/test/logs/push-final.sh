#!/bin/bash
set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
SRC=/tmp/conn-push-root; LOGD=packages/Integration/connectors/test/logs
echo "### pwgrant credtype"
npx mj sync push --dir /tmp/push-pwgrant --ci > "$LOGD/06b-pwgrant.log" 2>&1 && echo "pwgrant: PASS" || echo "pwgrant: FAIL :: $(grep -m1 -iE 'error|duplicate|fail' $LOGD/06b-pwgrant.log|head -c140)"
for v in cvent fonteva hivebrite neon-crm openwater orcid path-lms netsuite; do
  R=/tmp/pushf-$v; rm -rf "$R"; mkdir -p "$R/integrations"
  printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["integrations"] }\n' > "$R/.mj-sync.json"
  cp "$SRC/integrations/.mj-sync.json" "$R/integrations/.mj-sync.json"; cp -r "$SRC/integrations/$v" "$R/integrations/$v"
  npx mj sync push --dir "$R" --ci > "$LOGD/09-$v.log" 2>&1; ec=$?
  if [ $ec -eq 0 ]; then echo "$v: PASS"; else echo "$v: FAIL(exit=$ec) :: $(grep -m1 -iE 'FATAL|cannot|constraint|truncat|String or binary|conversion|too long|duplicate|null|Lookup|does not provide' $LOGD/09-$v.log | tr -s ' ' | head -c 160)"; fi
done
echo "### done"
