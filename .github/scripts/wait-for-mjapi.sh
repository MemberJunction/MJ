#!/usr/bin/env bash
# Waits for an MJAPI to be ready, for CI boot steps.
#
# Usage: wait-for-mjapi.sh <base-url> <log-file> [attempts=36] [interval-seconds=5] [pid]
#
# Polls <base-url>/healthcheck. While MJAPI starts, that endpoint answers 503 with
# {"status":"starting","phase":...}; once ready it answers 200. A start that failed (including one
# that loaded no entity metadata) answers 503 with {"status":"failed","phase":...} for as long as
# the process lives, so this script stops at the first such answer instead of polling until the
# attempts run out. With a pid it also stops as soon as that process has exited.
#
# Exits 0 when ready. Otherwise prints the last /healthcheck answer and the log tail, and exits 1.
set -u

if [ $# -lt 2 ]; then
  echo "usage: $0 <base-url> <log-file> [attempts] [interval-seconds] [pid]" >&2
  exit 2
fi

URL="${1%/}/healthcheck"
LOG_FILE="$2"
ATTEMPTS="${3:-36}"
INTERVAL="${4:-5}"
PID="${5:-}"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

fail() {
  echo "::error::$1"
  if [ -s "$BODY_FILE" ]; then
    echo "Last ${URL} answer: $(cat "$BODY_FILE")"
  fi
  echo "--- last 200 lines of ${LOG_FILE} ---"
  tail -200 "$LOG_FILE" 2>/dev/null || echo "(no log at ${LOG_FILE})"
  exit 1
}

echo "Waiting for ${URL} (up to ${ATTEMPTS} attempts, ${INTERVAL}s apart)..."
for i in $(seq 1 "$ATTEMPTS"); do
  : > "$BODY_FILE"
  CODE="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' "$URL" 2>/dev/null || true)"
  if [ "$CODE" = "200" ]; then
    echo "MJAPI is ready (attempt ${i})."
    exit 0
  fi
  if [ "$CODE" = "503" ] && grep -q '"status":"failed"' "$BODY_FILE"; then
    fail "MJAPI startup failed; the answer below names the phase it failed in."
  fi
  if [ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null; then
    fail "MJAPI process ${PID} exited before it was ready."
  fi
  sleep "$INTERVAL"
done
fail "MJAPI was not ready after ${ATTEMPTS} attempts, ${INTERVAL}s apart."
