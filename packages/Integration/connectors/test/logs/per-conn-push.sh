#!/bin/bash
set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1
SRC=/tmp/conn-push-root
LOGD=packages/Integration/connectors/test/logs
mkroot(){ local r=$1; shift; rm -rf "$r"; mkdir -p "$r/integrations"
  printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["credential-types","integrations"] }\n' > "$r/.mj-sync.json"
  cp -r "$SRC/credential-types" "$r/credential-types"
  cp "$SRC/integrations/.mj-sync.json" "$r/integrations/.mj-sync.json"; }
# 1) credential-types once (own root, no integrations)
R=/tmp/push-credtypes; rm -rf "$R"; mkdir -p "$R"
printf '{ "version":"1.0.0","push":{"autoCreateMissingRecords":true},"directoryOrder":["credential-types"] }\n' > "$R/.mj-sync.json"
cp -r "$SRC/credential-types" "$R/credential-types"
echo "### credential-types"; npx mj sync push --dir "$R" --ci > "$LOGD/03-credtypes.log" 2>&1; echo "credtypes exit=$?"
# 2) per-connector (only the 8 needing it)
for v in cvent fonteva hivebrite neon-crm openwater orcid path-lms netsuite; do
  R=/tmp/push-$v; mkroot "$R"
  cp -r "$SRC/integrations/$v" "$R/integrations/$v"
  npx mj sync push --dir "$R" --ci > "$LOGD/03-$v.log" 2>&1
  ec=$?
  if [ $ec -eq 0 ]; then echo "$v: PASS"; else echo "$v: FAIL(exit=$ec) :: $(grep -m1 -iE 'FATAL|cannot|constraint|truncat|String or binary|conversion|too long|null' "$LOGD/03-$v.log" | head -c 160)"; fi
done
echo "### per-connector push loop done"
