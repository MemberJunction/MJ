#!/bin/bash
# Launches an eval suite run fully detached from the shell that starts it, so a tool or terminal
# timeout cannot kill a 20–40 minute run mid-flight and leave it stuck "Running".
# Writes a start-time fence and a completion marker the caller can poll.
#
#   rigs/launch-eval-comparison.sh <run-tag> [suite-name] [max-parallel]
#
# Defaults: suite "Native Tool Calling — Envelope vs Native", 10 workers (two per provider,
# which stays clear of rate limits). NEVER set MJ_INTEGRATION_TEST=1 for a prompt-eval suite:
# SuiteCommand forces serial execution under that variable and the prompt-eval driver never reads it.
#
# CATALOG PREREQUISITE: the shipped catalog has native tool calling OFF by default. The eval
# driver never forces tools out — AIPromptRunner's gate decides from metadata exactly as in production —
# so before a comparison run set, on each model in the matrix, `LLM.DefaultToNativeToolCalling: true` and, for the
# implicit-protocol rows (see pin-eval-matrix.cjs WANT), `LLM.NativeControlFlow: 'implicit'`; push with
# `mj sync push --dir=metadata --include=ai-models --ci`, and revert after. Otherwise every native cell
# records `Envelope` under a native label (the scorecard's attribution check will show it).
# `rigs/native-posture.cjs --testing` (everything on) / `--shipping` (off) toggles both files in one step.
#
# Outputs:
#   $EVAL_LOG_DIR/<tag>.log   (default /tmp) — the CLI's output, ending with "<TAG> EXIT=<code> <utc>"
#   $EVAL_LOG_DIR/<tag>.since — the UTC start time; score with:
#                   node packages/TestingFramework/integration-test-suite/rigs/tool-calling-scorecard.cjs --since $(cat <tag>.since)
set -u
TAG="${1:?usage: launch-eval-comparison.sh <run-tag> [suite-name] [max-parallel]}"
SUITE="${2:-Native Tool Calling — Envelope vs Native}"
PAR="${3:-10}"
cd "$(dirname "$0")/../../../.." || exit 1
# Log and fence files go to EVAL_LOG_DIR (default /tmp), never into the repo tree.
OUT="${EVAL_LOG_DIR:-/tmp}"
mkdir -p "$OUT"
LOG="$OUT/$TAG.log"
: > "$LOG"
SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "$SINCE" > "$OUT/$TAG.since"
echo "$(echo "$TAG" | tr '[:lower:]' '[:upper:]') START $SINCE suite=\"$SUITE\" workers=$PAR" >> "$LOG"
nohup bash -c "
  cd '$PWD'
  node packages/MJCLI/bin/run.js test suite --name '$SUITE' -p --max-parallel $PAR >> '$LOG' 2>&1
  echo \"$(echo "$TAG" | tr '[:lower:]' '[:upper:]') EXIT=\$? \$(date -u +%Y-%m-%dT%H:%M:%SZ)\" >> '$LOG'
" > /dev/null 2>&1 & disown
echo "launched pid $! at $SINCE"
echo "  log:   $LOG"
echo "  since: $OUT/$TAG.since"
