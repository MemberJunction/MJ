#!/bin/bash
# One-shot custom-field key-diff probe launcher — reuses launch-broker.sh's proven secret recipe,
# but runs the probe ONCE (no long-lived mailbox listener) and prints the result.
#
#   Usage:  sudo bash packages/Integration/connectors/test/run-keydiff-probe.sh <vendor> [accountId]
#   e.g.    sudo bash packages/Integration/connectors/test/run-keydiff-probe.sh propfuel 2019
#
# Reads ONLY the vendor token (no DB / no MJAPI key needed — the probe hits the vendor API directly).
# Output is KEY NAMES + counts only; never a record value. The token never leaves the broker user.
set -uo pipefail

VENDOR="${1:?usage: sudo bash run-keydiff-probe.sh <vendor> [accountId] [filesPerStream]}"
ACCT_ARG="${2:-}"
FILES_ARG="${3:-}"

# First pass runs as root via sudo → re-exec the body AS mjbroker (args pass through sudo; env does not).
if [ "$(id -un)" != "mjbroker" ]; then
    REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
    exec sudo -u mjbroker bash "$0" "$VENDOR" "$ACCT_ARG" "__asbroker__" "$REPO" "$FILES_ARG"
fi

# ---- below runs AS mjbroker ----
[ "${3:-}" = "__asbroker__" ] || { echo "internal: invoke as 'sudo bash run-keydiff-probe.sh <vendor> [accountId] [filesPerStream]'"; exit 1; }
REPO="${4:?internal: repo root not passed}"
[ -n "${5:-}" ] && export PROBE_FILES_PER_STREAM="$5"
BROKER_DIR=/Users/Shared/mj-broker

[ -f "$BROKER_DIR/${VENDOR}.env" ] || { echo "MISSING $BROKER_DIR/${VENDOR}.env (vendor token)"; exit 1; }

set -a
. "$BROKER_DIR/${VENDOR}.env"
set +a

# Map the skill's <VENDOR>_TOKEN convention to CONNECTOR_API_KEY if not set directly.
if [ -z "${CONNECTOR_API_KEY:-}" ]; then
    tok_var="$(compgen -v | grep -E '_TOKEN$' | head -1 || true)"
    [ -n "$tok_var" ] && export CONNECTOR_API_KEY="${!tok_var}"
fi
[ -n "${CONNECTOR_API_KEY:-}" ] || { echo "MISSING CONNECTOR_API_KEY — set it (or a *_TOKEN) in $BROKER_DIR/${VENDOR}.env"; exit 1; }

# Resolve E2E_LIVE_CONFIG: explicit accountId arg > env file's E2E_LIVE_CONFIG > PROPFUEL_ACCOUNT_ID.
if [ -n "$ACCT_ARG" ]; then
    export E2E_LIVE_CONFIG="{\"AccountID\":\"${ACCT_ARG}\"}"
elif [ -z "${E2E_LIVE_CONFIG:-}" ] && [ -n "${PROPFUEL_ACCOUNT_ID:-}" ]; then
    export E2E_LIVE_CONFIG="{\"AccountID\":\"${PROPFUEL_ACCOUNT_ID}\"}"
fi

cd "$REPO"
echo "running ${VENDOR} key-diff probe as $(id -un) (token:$(env | grep -c '^CONNECTOR_API_KEY=') config:${E2E_LIVE_CONFIG:-<none>})"
echo "-------------------------------------------------------------"
node "packages/Integration/connectors/test/${VENDOR}-keydiff-probe.mjs"
