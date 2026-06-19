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

[ "${1:-}" ] || { echo "usage: sudo bash launch-broker.sh <vendor> [<vendor2> <vendor3> ...]"; exit 1; }

# Run as root (via sudo) the first time → re-exec the body AS mjbroker, passing args positionally
# (args pass cleanly through sudo; env vars do not — that was a recurring trap).
# MULTI-VENDOR: one broker can hold several vendors' secrets at once — each plan reads its OWN vars
# (GROWTHZONE_*, PROPFUEL_*, PHEEDLOOP_*/*_API_SECRET), so loading all three env files lets ONE broker
# serve every vendor's jobs. Pass them as trailing args; marker+repo come first so the vendor list is open-ended.
if [ "$(id -un)" != "mjbroker" ]; then
    REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
    exec sudo -u mjbroker bash "$0" "__asbroker__" "$REPO" "$@"
fi

# ---- below runs AS mjbroker ----
[ "${1:-}" = "__asbroker__" ] || { echo "internal: must be invoked as 'sudo bash launch-broker.sh <vendor> [...]'"; exit 1; }
REPO="${2:?internal: repo root not passed}"
shift 2                              # remaining args are the vendor list
VENDORS=("$@")
VENDOR="${VENDORS[0]}"                # primary (used for broker-level E2E_* defaults + log name)
LABEL="$(IFS=-; echo "${VENDORS[*]}")"   # e.g. growthzone-propfuel-pheedloop (for the log file name)
BROKER_DIR=/Users/Shared/mj-broker

for v in "${VENDORS[@]}"; do
    [ -f "$BROKER_DIR/${v}.env" ] || { echo "MISSING $BROKER_DIR/${v}.env (vendor token)"; exit 1; }
done
[ -f "$BROKER_DIR/mjkey.env" ]     || { echo "MISSING $BROKER_DIR/mjkey.env (MJ_API_KEY — reusable; copy from MJAPI's env)"; exit 1; }

# Parse the env files WITHOUT sourcing them. Vendor secrets routinely contain shell metacharacters
# (| $ & ` ( ) " ' etc.); `. file` would EVALUATE them (a `|` runs a pipe, `$x` expands a var, backticks
# run a subshell) → garbage env + "command not found". Read each KEY=VALUE line and export the value
# LITERALLY so no metacharacter is ever interpreted. Everything after the FIRST `=` is the value.
load_env() {
    local file="$1" line k v
    [ -f "$file" ] || return 0
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in ''|'#'*) continue;; esac   # skip blanks + comment lines
        [ "${line%%=*}" = "$line" ] && continue     # skip lines with no '='
        k="${line%%=*}"; v="${line#*=}"; v="${v%$'\r'}"   # split once; strip trailing CR (CRLF)
        export "$k=$v"
    done < "$file"
}
for v in "${VENDORS[@]}"; do load_env "$BROKER_DIR/${v}.env"; done
load_env "$BROKER_DIR/mjkey.env"

# Map the skill's <VENDOR>_TOKEN convention to CONNECTOR_API_KEY if the env file didn't set it directly.
if [ -z "${CONNECTOR_API_KEY:-}" ]; then
    tok_var="$(compgen -v | grep -E '_TOKEN$' | head -1 || true)"
    [ -n "$tok_var" ] && export CONNECTOR_API_KEY="${!tok_var}"
fi
# OAuth connectors (GrowthZone etc.) have NO single token — their creds are client/secret/username/password.
# Header-auth connectors (PheedLoop etc.) use a vendor-prefixed API_SECRET (+ API_KEY) instead of a *_TOKEN.
# In either case there is no single CONNECTOR_API_KEY; the plan reads its own *_CLIENT_*/*_API_SECRET/*_USERNAME
# vars directly. The placeholder just satisfies the guard below; it is never used by such a plan. (API_SECRET is
# safe to match — only vendor creds carry it, never MJ_API_KEY / DB_PASSWORD.)
if [ -z "${CONNECTOR_API_KEY:-}" ] && env | grep -qE '_(CLIENT_SECRET|CLIENT_ID|REFRESH_TOKEN|PASSWORD|API_SECRET)='; then
    export CONNECTOR_API_KEY="oauth-no-single-token"
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
( node packages/Integration/connectors/test/credential-broker.mjs > "/tmp/broker-${LABEL}.log" 2>&1 < /dev/null & )
sleep 3

echo "broker pid(s): $(pgrep -f credential-broker.mjs | tr '\n' ' ')"
echo "vendors loaded: ${VENDORS[*]}"
echo "exported to children -> MJ_API_KEY:$(env | grep -c '^MJ_API_KEY=') CONNECTOR_API_KEY:$(env | grep -c '^CONNECTOR_API_KEY=') DB_PASSWORD:$(env | grep -c '^DB_PASSWORD=')"
echo "--- boot log (/tmp/broker-${LABEL}.log) ---"
tail -3 "/tmp/broker-${LABEL}.log"
