#!/usr/bin/env bash
# Driver: runs every agent-scenario file in sequence and prints a summary.
#
# Each scenario is a separate process so AIEngine first-loads cleanly with
# the seeded mutations in place (the engine cache doesn't reliably refresh
# mid-process; see lib.ts notes).
#
# Usage:
#   ./agent-scenarios/run-all.sh           # all 17
#   ./agent-scenarios/run-all.sh s01 s02   # subset

set -uo pipefail
cd "$(dirname "$0")/.."

ALL_SCENARIOS=(
    s01-direct-grant
    s02-direct-none-blocks
    s03-agent-assigned-not-listed
    s04-read-level-blocks-search
    s05-multi-entity
    s06-multi-provider
    s07-cross-scope
    s08-reranker-reorders
    s09-budget-cap
    s10-reranker-no-key
    s11-streaming-partials
    s12-pre-execution-rag
    s13-empty-results
    s14-revoke-mid-flight
    s15-vector-fusion
    s16-sage-vector-end-to-end
    s17-mixed-entity-types
)

# Filter if the user passed specific scenarios on the command line
if [[ $# -gt 0 ]]; then
    REQUESTED=()
    for arg in "$@"; do
        for s in "${ALL_SCENARIOS[@]}"; do
            if [[ "$s" == "$arg"* ]]; then
                REQUESTED+=("$s")
                break
            fi
        done
    done
    SCENARIOS=("${REQUESTED[@]}")
else
    SCENARIOS=("${ALL_SCENARIOS[@]}")
fi

# Reset the results TSV
mkdir -p /tmp/rag-audit
: > /tmp/rag-audit/scenarios-results.tsv

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

echo "=== agent-scenarios driver — running ${#SCENARIOS[@]} scenarios ==="
for s in "${SCENARIOS[@]}"; do
    echo
    echo "▶ $s"
    set +e
    DOTENV_CONFIG_PATH=packages/MJAPI/.env npx tsx -r dotenv/config "agent-scenarios/${s}.ts"
    rc=$?
    set -e

    # Status was appended to the TSV by the scenario itself
    last=$(tail -1 /tmp/rag-audit/scenarios-results.tsv | cut -f2)
    case "$last" in
        PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
        FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
        SKIPPED) SKIP_COUNT=$((SKIP_COUNT + 1)) ;;
        *) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    esac
done

echo
echo "================================================================"
echo "DONE — ${#SCENARIOS[@]} scenarios"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo "  SKIPPED: $SKIP_COUNT"
echo "  Results TSV: /tmp/rag-audit/scenarios-results.tsv"
echo "================================================================"
echo
column -t -s $'\t' /tmp/rag-audit/scenarios-results.tsv

# Exit non-zero if any scenario actually failed (skipped is OK)
[[ $FAIL_COUNT -eq 0 ]]
