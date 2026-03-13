#!/usr/bin/env bash
#
# CLI Smoke Test for MJ Open App System
#
# Verifies that all 8 `mj app` CLI subcommands load successfully by
# running each with --help and checking the exit code.
#
# Usage: bash tests/open-app/test-cli-smoke.sh
#
# Prerequisites:
#   - MJ CLI (`mj`) must be in PATH or built locally
#   - The mj-open-app-cli package must be built

set -euo pipefail

PASSED=0
FAILED=0

# Color output (if terminal supports it)
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

pass() {
    PASSED=$((PASSED + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
    FAILED=$((FAILED + 1))
    echo -e "  ${RED}✗ FAIL:${NC} $1"
}

test_command() {
    local cmd="$1"
    local label="$2"

    if eval "$cmd" > /dev/null 2>&1; then
        pass "$label"
    else
        fail "$label (exit code: $?)"
    fi
}

echo ""
echo "=== MJ Open App CLI Smoke Tests ==="
echo ""

# Detect CLI path
MJ_CLI="mj"
if ! command -v mj &> /dev/null; then
    # Try local build path
    LOCAL_CLI="$(dirname "$0")/../../packages/MJOpenApp/CLI/dist/index.js"
    if [ -f "$LOCAL_CLI" ]; then
        MJ_CLI="node $LOCAL_CLI"
        echo "Using local CLI: $LOCAL_CLI"
    else
        echo "WARNING: 'mj' CLI not found in PATH and no local build found."
        echo "  Attempting tests anyway..."
    fi
fi

echo "▸ Help Commands"

test_command "$MJ_CLI app install --help" "mj app install --help"
test_command "$MJ_CLI app upgrade --help" "mj app upgrade --help"
test_command "$MJ_CLI app remove --help" "mj app remove --help"
test_command "$MJ_CLI app list --help" "mj app list --help"
test_command "$MJ_CLI app info --help" "mj app info --help"
test_command "$MJ_CLI app disable --help" "mj app disable --help"
test_command "$MJ_CLI app enable --help" "mj app enable --help"
test_command "$MJ_CLI app check-updates --help" "mj app check-updates --help"

echo ""
echo "▸ List Command (Empty State)"

# Run mj app list and check it doesn't error out
# (may show "No apps installed" or an empty table)
if OUTPUT=$($MJ_CLI app list 2>&1); then
    pass "mj app list runs without error"
    if echo "$OUTPUT" | grep -qi "no.*app\|no.*install\|0 app\|empty"; then
        pass "mj app list reports no apps installed"
    else
        echo "    (note: could not verify 'no apps' message - output may vary)"
        pass "mj app list returned output"
    fi
else
    fail "mj app list failed with exit code $?"
fi

echo ""
echo "=================================================="
echo "Results: $PASSED passed, $FAILED failed, $((PASSED + FAILED)) total"
echo "=================================================="
echo ""

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
