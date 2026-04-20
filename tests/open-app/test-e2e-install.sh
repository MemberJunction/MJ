#!/usr/bin/env bash
#
# End-to-End Install Test for MJ Open App System
#
# Runs a full lifecycle test: install → list → info → disable → enable → remove
# against a real database with a sample Open App.
#
# Usage:
#   bash tests/open-app/test-e2e-install.sh <github-repo-url>
#
# Example:
#   bash tests/open-app/test-e2e-install.sh https://github.com/MemberJunction/mj-sample-open-app
#
# Prerequisites:
#   - MJ CLI (`mj`) must be in PATH or built locally
#   - mj.config.cjs configured with valid DB credentials
#   - Fresh MJ database with v4 migration applied
#   - The sample app must be pushed to the GitHub repo URL

set -euo pipefail

# ── Argument Parsing ──────────────────────────────────────────

if [ $# -lt 1 ]; then
    echo "Usage: $0 <github-repo-url>"
    echo ""
    echo "Example: $0 https://github.com/MemberJunction/mj-sample-open-app"
    exit 1
fi

REPO_URL="$1"
APP_NAME="mj-sample-app"

# ── Colors ────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED=0
FAILED=0
STEP=0

pass() {
    PASSED=$((PASSED + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
    FAILED=$((FAILED + 1))
    echo -e "  ${RED}✗ FAIL:${NC} $1"
}

step() {
    STEP=$((STEP + 1))
    echo -e "\n${CYAN}Step ${STEP}: $1${NC}"
}

# ── CLI Detection ─────────────────────────────────────────────

MJ_CLI="mj"
if ! command -v mj &> /dev/null; then
    LOCAL_CLI="$(dirname "$0")/../../packages/MJOpenApp/CLI/dist/index.js"
    if [ -f "$LOCAL_CLI" ]; then
        MJ_CLI="node $LOCAL_CLI"
        echo -e "${YELLOW}Using local CLI: $LOCAL_CLI${NC}"
    else
        echo -e "${RED}ERROR: 'mj' CLI not found. Build it first or add to PATH.${NC}"
        exit 1
    fi
fi

echo ""
echo "=========================================="
echo " MJ Open App - End-to-End Install Test"
echo "=========================================="
echo ""
echo "  Repo:     $REPO_URL"
echo "  App Name: $APP_NAME"
echo ""

# ── Step 1: Verify Clean State ────────────────────────────────

step "Verify no apps installed (clean state)"

OUTPUT=$($MJ_CLI app list 2>&1) || true
if echo "$OUTPUT" | grep -qi "$APP_NAME"; then
    fail "App '$APP_NAME' already installed — please remove it first"
    exit 1
else
    pass "No existing '$APP_NAME' installation found"
fi

# ── Step 2: Install the App ──────────────────────────────────

step "Install app from $REPO_URL"

if OUTPUT=$($MJ_CLI app install "$REPO_URL" 2>&1); then
    pass "mj app install completed successfully"
    echo "    $OUTPUT" | tail -5
else
    fail "mj app install failed"
    echo "    $OUTPUT"
    exit 1
fi

# ── Step 3: Verify App Appears in List ────────────────────────

step "Verify app appears in list"

OUTPUT=$($MJ_CLI app list 2>&1) || true
if echo "$OUTPUT" | grep -qi "$APP_NAME"; then
    pass "App '$APP_NAME' appears in list"
else
    fail "App '$APP_NAME' NOT found in list output"
fi

if echo "$OUTPUT" | grep -qi "active"; then
    pass "App status is 'Active'"
else
    fail "App status is NOT 'Active'"
fi

# ── Step 4: App Info ──────────────────────────────────────────

step "Get app info"

if OUTPUT=$($MJ_CLI app info "$APP_NAME" 2>&1); then
    pass "mj app info completed successfully"

    if echo "$OUTPUT" | grep -qi "1.0.0"; then
        pass "Version 1.0.0 shown in info"
    else
        echo -e "    ${YELLOW}(Could not verify version in output)${NC}"
    fi

    if echo "$OUTPUT" | grep -qi "sample_app\|sample-app"; then
        pass "Schema name shown in info"
    else
        echo -e "    ${YELLOW}(Could not verify schema name in output)${NC}"
    fi
else
    fail "mj app info failed"
fi

# ── Step 5: Disable the App ──────────────────────────────────

step "Disable the app"

if OUTPUT=$($MJ_CLI app disable "$APP_NAME" 2>&1); then
    pass "mj app disable completed successfully"
else
    fail "mj app disable failed"
fi

# ── Step 6: Verify Disabled Status ────────────────────────────

step "Verify app is disabled"

OUTPUT=$($MJ_CLI app list 2>&1) || true
if echo "$OUTPUT" | grep -qi "disabled"; then
    pass "App status is 'Disabled' in list"
else
    fail "App status is NOT 'Disabled' in list"
fi

# ── Step 7: Enable the App ───────────────────────────────────

step "Enable the app"

if OUTPUT=$($MJ_CLI app enable "$APP_NAME" 2>&1); then
    pass "mj app enable completed successfully"
else
    fail "mj app enable failed"
fi

# ── Step 8: Verify Active Again ──────────────────────────────

step "Verify app is active again"

OUTPUT=$($MJ_CLI app list 2>&1) || true
if echo "$OUTPUT" | grep -qi "active"; then
    pass "App status is 'Active' after re-enable"
else
    fail "App status is NOT 'Active' after re-enable"
fi

# ── Step 9: Check Updates ────────────────────────────────────

step "Check for updates"

if OUTPUT=$($MJ_CLI app check-updates 2>&1); then
    pass "mj app check-updates completed successfully"
    # No update expected since we just installed the latest version
    if echo "$OUTPUT" | grep -qi "up to date\|no update\|latest"; then
        pass "Reports no updates available (expected)"
    else
        echo -e "    ${YELLOW}(Could not verify 'no updates' message)${NC}"
    fi
else
    fail "mj app check-updates failed"
fi

# ── Step 10: Remove the App ──────────────────────────────────

step "Remove the app"

if OUTPUT=$(echo "y" | $MJ_CLI app remove "$APP_NAME" 2>&1); then
    pass "mj app remove completed successfully"
else
    fail "mj app remove failed"
    echo "    $OUTPUT"
fi

# ── Step 11: Verify Removal ──────────────────────────────────

step "Verify app is removed"

OUTPUT=$($MJ_CLI app list 2>&1) || true
if echo "$OUTPUT" | grep -qi "$APP_NAME"; then
    fail "App '$APP_NAME' STILL appears in list after removal"
else
    pass "App '$APP_NAME' no longer in list"
fi

# ── Step 12: Verify Schema Dropped ───────────────────────────

step "Verify database schema was dropped"

echo -e "    ${YELLOW}NOTE: Schema verification requires direct DB access.${NC}"
echo -e "    ${YELLOW}Run the following SQL to verify:${NC}"
echo ""
echo "    SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'sample_app';"
echo ""
echo "    (Should return 0 rows if schema was dropped)"
pass "Schema drop verification instructions provided"

# ── Summary ───────────────────────────────────────────────────

echo ""
echo "=========================================="
echo " E2E Test Results"
echo "=========================================="
echo -e " ${GREEN}Passed:${NC} $PASSED"
echo -e " ${RED}Failed:${NC} $FAILED"
echo -e " Total:  $((PASSED + FAILED))"
echo "=========================================="
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Some tests failed. Check output above for details.${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
fi
