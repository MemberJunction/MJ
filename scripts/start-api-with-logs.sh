#!/usr/bin/env bash
#
# Run MJAPI locally with all stdout+stderr piped to a log file with timestamps.
# All existing [IntegrationEngine], [IntegrationProgressEmitter], etc. log lines
# land in the file.  Connector-creation pipeline runs ALSO drop their
# structured JSONL artifacts to <cwd>/logs/integration-runs/<runID>/.
#
# Usage:
#   ./scripts/start-api-with-logs.sh                 # logs to /tmp/mjapi.log
#   ./scripts/start-api-with-logs.sh /path/to/log    # custom log path
#
# In another terminal:
#   tail -f /tmp/mjapi.log
#   tail -f /tmp/mjapi.log | grep -E '\[IntegrationEngine\]|sync\.|discovery\.|pk\.classifier'
#
# To see per-run structured events for a connector-creation/refresh:
#   ls packages/MJAPI/logs/integration-runs/
#   tail -f packages/MJAPI/logs/integration-runs/<runID>/progress.jsonl | jq .

set -euo pipefail

LOG_FILE="${1:-/tmp/mjapi.log}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MJAPI_DIR="$REPO_ROOT/packages/MJAPI"

if [ ! -d "$MJAPI_DIR" ]; then
    echo "ERROR: MJAPI directory not found at $MJAPI_DIR" >&2
    exit 1
fi

: > "$LOG_FILE"

echo "============================================================"
echo "  MJAPI starting"
echo "  Log file:        $LOG_FILE"
echo "  Per-run events:  $MJAPI_DIR/logs/integration-runs/<runID>/"
echo "  Tail it:         tail -f $LOG_FILE"
echo "  Tail filtered:   tail -f $LOG_FILE | grep -E '\\[Integration|sync\\.|discovery\\.|pk\\.'"
echo "============================================================"

cd "$MJAPI_DIR"

# Pipe stdout+stderr through a tiny awk to prepend timestamps, then tee into
# the log file while still showing on the controlling terminal.
exec npm run start 2>&1 \
    | awk '{ printf "%s %s\n", strftime("%H:%M:%S"), $0; fflush(); }' \
    | tee -a "$LOG_FILE"
