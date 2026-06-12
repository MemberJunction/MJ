#!/bin/bash
# Reusable credential-broker launcher for ANY connector's live SQL-Server e2e.
#
#   Usage:  sudo bash packages/Integration/connectors/test/launch-broker.sh <vendor>
#
# Prereqs (one-time per machine — see connector-test-conventions.md § "SQL Server live-run setup"):
#   /Users/Shared/mj-broker/<vendor>.env  -> the vendor token. Either CONNECTOR_API_KEY=<token>
#                                            OR the skill's <VENDOR>_TOKEN=<token> form (auto-mapped below).
#   /Users/Shared/mj-broker/mjkey.env     -> MJ_API_KEY='<the value MJAPI was started with>'  (REUSABLE
#                                            across every vendor — copy once from MJAPI's own process env).
#   /Users/Shared/mj-mailbox              -> the jobs/results mailbox (chmod 1777).
#
# Why this script exists: getting all THREE secrets (vendor token + DB_PASSWORD + MJ_API_KEY) to actually
# reach the runner cost ~10 debugging rounds once. The traps, now codified: MJ_API_KEY must be EXPORTED
# (not just set), the broker caches by jobId (use a fresh one each submit), and the launch must survive
# sudo having no tty (subshell-orphan, no nohup). This encodes all of that.
set -uo pipefail

VENDOR="${1:?usage: sudo bash launch-broker.sh <vendor>}"

# Run as root (via sudo) the first time → re-exec the body AS mjbroker, passing args positionally
# (args pass cleanly through sudo; env vars do not — that was a recurring trap).
if [ "$(id -un)" != "mjbroker" ]; then
    REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
    exec sudo -u mjbroker bash "$0" "$VENDOR" "__asbroker__" "$REPO"
fi

# ---- below runs AS mjbroker ----
[ "${2:-}" = "__asbroker__" ] || { echo "internal: must be invoked as 'sudo bash launch-broker.sh <vendor>'"; exit 1; }
REPO="${3:?internal: repo root not passed}"
BROKER_DIR=/Users/Shared/mj-broker

[ -f "$BROKER_DIR/${VENDOR}.env" ] || { echo "MISSING $BROKER_DIR/${VENDOR}.env (vendor token)"; exit 1; }
[ -f "$BROKER_DIR/mjkey.env" ]     || { echo "MISSING $BROKER_DIR/mjkey.env (MJ_API_KEY — reusable; copy from MJAPI's env)"; exit 1; }

set -a
. "$BROKER_DIR/${VENDOR}.env"
. "$BROKER_DIR/mjkey.env"
set +a

# Map the skill's <VENDOR>_TOKEN convention to CONNECTOR_API_KEY if the env file didn't set it directly.
if [ -z "${CONNECTOR_API_KEY:-}" ]; then
    tok_var="$(compgen -v | grep -E '_TOKEN$' | head -1 || true)"
    [ -n "$tok_var" ] && export CONNECTOR_API_KEY="${!tok_var}"
fi

export DB_PASSWORD="${DB_PASSWORD:-Claude2Sql99}"
export E2E_CONNECTOR="$VENDOR" E2E_INTEGRATION="$VENDOR" E2E_MODE=live E2E_PLATFORM=sqlserver
export MJ_CRED_MAILBOX=/Users/Shared/mj-mailbox

[ -n "${CONNECTOR_API_KEY:-}" ] || { echo "MISSING CONNECTOR_API_KEY — set it (or a *_TOKEN) in $BROKER_DIR/${VENDOR}.env"; exit 1; }
[ -n "${MJ_API_KEY:-}" ]        || { echo "MISSING MJ_API_KEY — set it in $BROKER_DIR/mjkey.env"; exit 1; }

# Publish MJ_API_KEY — the INTERNAL GraphQL gate, NOT the vendor token — to a shared-readable file so
# the MJAPI launcher (which runs as the repo user, not mjbroker) can start MJAPI automatically. This is
# the wire that makes the e2e self-contained: ONE `sudo launch-broker.sh <vendor>` both starts the broker
# AND publishes the key, after which `run-ss-e2e.sh` brings MJAPI up hands-free. The vendor token
# (CONNECTOR_API_KEY) NEVER leaves this process — only the internal gate the repo user already needs.
KEY_PUBLISH=/tmp/mj-ss-e2e.env
if ( umask 022; printf 'MJ_API_KEY=%s\n' "$MJ_API_KEY" > "$KEY_PUBLISH" ) 2>/dev/null; then
    chmod 644 "$KEY_PUBLISH" 2>/dev/null || true
    echo "published MJ_API_KEY -> $KEY_PUBLISH (repo-user readable; vendor token NOT exposed)"
else
    echo "WARN: could not write $KEY_PUBLISH (pre-existing, owned by another user?) — already-present key is fine"
fi

cd "$REPO"
pkill -f credential-broker.mjs 2>/dev/null || true
sleep 1
# Orphan into a subshell so node reparents to launchd and survives sudo exit (no nohup — fails without a tty).
( node packages/Integration/connectors/test/credential-broker.mjs > "/tmp/broker-${VENDOR}.log" 2>&1 < /dev/null & )
sleep 3

echo "broker pid(s): $(pgrep -f credential-broker.mjs | tr '\n' ' ')"
echo "exported to children -> MJ_API_KEY:$(env | grep -c '^MJ_API_KEY=') CONNECTOR_API_KEY:$(env | grep -c '^CONNECTOR_API_KEY=') DB_PASSWORD:$(env | grep -c '^DB_PASSWORD=')"
echo "--- boot log (/tmp/broker-${VENDOR}.log) ---"
tail -3 "/tmp/broker-${VENDOR}.log"
