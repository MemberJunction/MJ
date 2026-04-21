#!/usr/bin/env bash
# Drive the smoke-test matrix. Writes timestamped results.
set -euo pipefail

if [ -z "${AI_API_KEY:-}" ]; then
  echo "ERROR: AI_API_KEY env var not set" >&2
  exit 1
fi

TESTS_TO_RUN=${@:-all}
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
RESULTS_DIR="results/$TIMESTAMP"
mkdir -p "$RESULTS_DIR"

export RESULTS_DIR

ALL_TESTS=(t1 t2 t3 t4 t5)
if [ "$TESTS_TO_RUN" = "all" ]; then
  TESTS=("${ALL_TESTS[@]}")
else
  TESTS=($TESTS_TO_RUN)
fi

SUMMARY="$RESULTS_DIR/summary.md"
echo "# Smoke test run $TIMESTAMP" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "Model: ${AI_MODEL:-gemini-3-flash-preview}" >> "$SUMMARY"
echo "Tests requested: ${TESTS[*]}" >> "$SUMMARY"
echo "" >> "$SUMMARY"

for test_id in "${TESTS[@]}"; do
  script="smoke-tests/${test_id}-*.mjs"
  resolved=$(ls $script 2>/dev/null | head -1 || true)
  if [ -z "$resolved" ]; then
    echo "  ⚠️  skipping $test_id (no script found)"
    echo "## $test_id: skipped (no script found)" >> "$SUMMARY"
    echo "" >> "$SUMMARY"
    continue
  fi

  echo ""
  echo "════════════════════════════════════════════════"
  echo "  Running $test_id: $(basename "$resolved")"
  echo "════════════════════════════════════════════════"

  log_file="$RESULTS_DIR/${test_id}.log"
  json_file="$RESULTS_DIR/${test_id}.json"

  if node "$resolved" --out "$json_file" 2>&1 | tee "$log_file"; then
    status="✅ pass"
  else
    status="❌ fail (see $log_file)"
  fi

  echo "" >> "$SUMMARY"
  echo "## $test_id — $status" >> "$SUMMARY"
  echo "" >> "$SUMMARY"
  if [ -f "$json_file" ]; then
    echo '```json' >> "$SUMMARY"
    jq -c '.summary // .' "$json_file" >> "$SUMMARY" 2>/dev/null || cat "$json_file" >> "$SUMMARY"
    echo '```' >> "$SUMMARY"
  fi
done

echo ""
echo "════════════════════════════════════════════════"
echo "  All results in: $RESULTS_DIR/"
echo "════════════════════════════════════════════════"
cat "$SUMMARY"
