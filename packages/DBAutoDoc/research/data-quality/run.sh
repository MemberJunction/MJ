#!/usr/bin/env bash
# Run DBAutoDoc with descriptions and discovery off (no model calls) against one database and
# write the data quality report under runs/<label>/.
#
#   BENCH_ENV_FILE=<file with BENCH_SQL_PASSWORD etc.> run.sh <database> <label>
#
# The config keeps ${BENCH_...} placeholders, which DBAutoDoc expands from the environment, so no
# secret is written to disk. runs/ is git-ignored anyway.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DB=${1:?database}
LABEL=${2:?label}
if [ -n "${BENCH_ENV_FILE:-}" ]; then set -a; . "$BENCH_ENV_FILE"; set +a; fi
export BENCH_SQL_HOST=${BENCH_SQL_HOST:-localhost} BENCH_SQL_PORT=${BENCH_SQL_PORT:-1433} BENCH_SQL_USER=${BENCH_SQL_USER:-sa}
export BENCH_DB=$DB
RUN=$HERE/runs/$LABEL
mkdir -p "$RUN"
export BENCH_OUTPUT_DIR=$RUN
cp "$HERE/config.template.json" "$RUN/config.json"
cd "$RUN"
START=$(date +%s)
node "$HERE/../../bin/run.js" analyze --config "$RUN/config.json" --max-iterations 0 > "$RUN/run.log" 2>&1 && STATUS=0 || STATUS=$?
echo "exit $STATUS after $(( $(date +%s) - START ))s" | tee "$RUN/exit.txt"
REPORT=$(ls -t "$RUN"/output/*/data-quality.json "$RUN"/output/*/*/data-quality.json 2>/dev/null | head -1 || true)
[ -n "$REPORT" ] && cp "$REPORT" "$RUN/data-quality.json" && cp "${REPORT%.json}.md" "$RUN/data-quality.md"
exit $STATUS
