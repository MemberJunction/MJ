#!/bin/bash
# Test Runner Entrypoint — REMOTE-TARGET MODE
#
# Used when the test-runner targets a remote URL (Mode B/C/D) instead of the
# local 5-container MJ stack. Strips everything that assumes a local DB:
#   - localhost socat shim (target is reachable directly at MJ_TEST_VAR_baseUrl)
#   - mj sync push for applications/test-user/tests/suites
#   - setup-test-user.cjs (no local DB to provision)
#
# Still does:
#   - Run the regression suite (variable-templated via MJ_TEST_VAR_*)
#   - Extract screenshots (uses the LOCAL ephemeral docker DB for TestRunOutput)
#   - Generate markdown + HTML reports
#   - Optional archive push to a destination MJ instance
#
# Required env vars (set by load-target-profile.cjs on the host):
#   MJ_TEST_VAR_baseUrl       — target app URL ({{baseUrl}} substitution)
#   MJ_TEST_VAR_allowedDomains — JSON array string for {{allowedDomains}}
#   TEST_SUITE_NAME           — suite to execute (e.g. "MJ Explorer Regression Suite")
#
# Optional:
#   MJ_TEST_VAR_authUsername / authPassword / authDomains
#   EXTRA_METADATA_DIRS       — comma-separated dirs of test/suite JSON to push
#   ARCHIVE_MJ_CONFIG         — mj.config.cjs path for archive destination
#
set -e

SCRIPTS=/app/docker/regression/scripts

export NODE_OPTIONS="--import /app/bootstrap.mjs"

echo ""
echo "  MJ Regression Test Runner — REMOTE TARGET MODE"
echo "  ─────────────────────────────────────────────────"
echo "  Target: ${TARGET_PROFILE_NAME:-<unnamed>} (${TARGET_PROFILE_KIND:-unknown kind})"
echo "  Base URL: ${MJ_TEST_VAR_baseUrl:-<not set>}"
echo "  Suite: ${TEST_SUITE_NAME:-<not set>}"
echo ""

# ─── Sanity checks ───────────────────────────────────────────────────────────
if [ -z "${MJ_TEST_VAR_baseUrl:-}" ]; then
    echo "✗ FATAL: MJ_TEST_VAR_baseUrl is not set."
    echo "         Did you forget to pass --target=path/to/target.json?"
    exit 1
fi
if [ -z "${TEST_SUITE_NAME:-}" ]; then
    echo "✗ FATAL: TEST_SUITE_NAME is not set. Either add 'suite' to the target"
    echo "         profile JSON or export TEST_SUITE_NAME directly."
    exit 1
fi

# ─── 1. Test metadata sync (suite definition must exist in the LOCAL DB) ─────
# Even in remote-target mode the test-runner needs a local DB to record
# TestRun/TestRunOutput rows. The MJ stack in Mode B/C/D is NOT running, so
# the runner uses an existing remote DB via its mj.config.cjs (typically the
# same DB as the target's archive destination, or a dedicated runs DB).
#
# Tests + suites still need to be pushed to that DB so `mj test suite --name`
# resolves the suite. If EXTRA_METADATA_DIRS is set, push those too.
echo "Syncing test metadata to results DB..."
npx mj sync push --dir=metadata --include="tests" 2>&1 || {
    echo "  WARNING: Test metadata sync failed"
}
echo ""

echo "Syncing test suites to results DB..."
npx mj sync push --dir=metadata --include="test-suites" 2>&1 || {
    echo "  WARNING: Suite metadata sync failed"
}
echo ""

if [ -n "${EXTRA_METADATA_DIRS:-}" ]; then
    IFS=',' read -ra EXTRA_DIRS <<< "$EXTRA_METADATA_DIRS"
    for EXTRA_DIR in "${EXTRA_DIRS[@]}"; do
        EXTRA_DIR_TRIMMED="$(echo "$EXTRA_DIR" | xargs)"
        if [ -d "$EXTRA_DIR_TRIMMED" ]; then
            echo "Syncing extra metadata from $EXTRA_DIR_TRIMMED..."
            npx mj sync push --dir="$EXTRA_DIR_TRIMMED" 2>&1 || {
                echo "  WARNING: Extra metadata sync from $EXTRA_DIR_TRIMMED failed"
            }
            echo ""
        else
            echo "  WARNING: EXTRA_METADATA_DIRS entry not found: $EXTRA_DIR_TRIMMED"
        fi
    done
fi

# ─── 2. Per-run output directory ─────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
RUN_DIR="/app/test-results/run-${TIMESTAMP}"
mkdir -p "$RUN_DIR/screenshots"
echo "Run directory: $RUN_DIR"
echo ""

# ─── 3. Run the suite ────────────────────────────────────────────────────────
WORKERS=${MAX_PARALLEL_WORKERS:-4}
echo "Running '${TEST_SUITE_NAME}' (${WORKERS} parallel workers) against ${MJ_TEST_VAR_baseUrl}..."

# Optional --oracles-module arg threaded through from the target profile's
# `oraclesModule` field. Lets Mode C adopters plug app-specific IOracle
# implementations without touching TestingFramework.
ORACLES_ARGS=()
if [ -n "${ORACLES_MODULE:-}" ]; then
    if [ -f "$ORACLES_MODULE" ]; then
        ORACLES_ARGS=(--oracles-module "$ORACLES_MODULE")
        echo "  Custom oracle module: $ORACLES_MODULE"
    else
        echo "  WARNING: ORACLES_MODULE=$ORACLES_MODULE not found — skipping"
    fi
fi

set +e
npx mj test suite --name "${TEST_SUITE_NAME}" \
    --format json \
    --output "$RUN_DIR/results.json" \
    --parallel \
    --max-parallel "$WORKERS" \
    "${ORACLES_ARGS[@]}"
EXIT_CODE=$?
set -e

# ─── 4. Extract screenshots + generate reports ───────────────────────────────
echo ""
echo "Extracting screenshots..."
RUN_DIR="$RUN_DIR" node "$SCRIPTS/extract-screenshots.cjs" 2>&1 \
    || echo "  WARNING: Screenshot extraction failed"

echo ""
echo "Generating markdown report..."
RUN_DIR="$RUN_DIR" node "$SCRIPTS/generate-md-report.cjs" 2>&1

echo ""
echo "Generating HTML report..."
RUN_DIR="$RUN_DIR" TIMESTAMP="$TIMESTAMP" node "$SCRIPTS/generate-html-report.cjs" 2>&1

# ─── 5. Optional archive ─────────────────────────────────────────────────────
# Same shape as the full-stack entrypoint. Pulls SuiteRun + children to a
# local folder via mj-sync, tags them, then pushes to ARCHIVE_MJ_CONFIG.
if [ -n "${ARCHIVE_MJ_CONFIG:-}" ]; then
    echo ""
    echo "Archiving suite run to ${ARCHIVE_MJ_CONFIG}..."

    SUITE_RUN_ID=$(node -e "const r=require('${RUN_DIR}/results.json'); console.log(r.suiteRunId || '');" 2>/dev/null || echo "")
    if [ -z "$SUITE_RUN_ID" ]; then
        echo "  WARNING: Could not read suiteRunId from results.json — skipping archive"
    elif [ ! -f "$ARCHIVE_MJ_CONFIG" ]; then
        echo "  WARNING: ARCHIVE_MJ_CONFIG file not found: $ARCHIVE_MJ_CONFIG — skipping archive"
    else
        ARCHIVE_DIR="${RUN_DIR}/archive"
        mkdir -p "${ARCHIVE_DIR}"
        cp -R /app/docker/regression/archive/. "${ARCHIVE_DIR}/"

        echo "  Pulling suite run + children to ${ARCHIVE_DIR}..."
        (cd "${ARCHIVE_DIR}" && npx mj sync pull \
            --entity="MJ: Test Suite Runs" \
            --filter="ID='${SUITE_RUN_ID}'" 2>&1) \
            || echo "  WARNING: Archive pull failed"

        ARCHIVE_TAG="${ARCHIVE_TAG:-${TEST_SUITE_NAME:-}}" \
        ARCHIVE_SOURCE="${ARCHIVE_SOURCE:-}" \
        RUN_DIR="${RUN_DIR}" \
            node "$SCRIPTS/tag-archive.cjs" 2>&1 || echo "  WARNING: Tagging failed"

        echo "  Pushing archive to destination MJ..."
        MJ_CONFIG_FILE="${ARCHIVE_MJ_CONFIG}" \
            npx mj sync push --dir="${ARCHIVE_DIR}" --ci 2>&1 \
            || echo "  WARNING: Archive push failed"

        echo "  Archive complete."
    fi
fi

# ─── 6. Latest symlink ───────────────────────────────────────────────────────
ln -sfn "run-${TIMESTAMP}" /app/test-results/latest \
    || echo "  WARNING: Could not create latest symlink"

echo ""
echo "Run directory: $RUN_DIR"
echo "  results.json       → $RUN_DIR/results.json"
echo "  report.md          → $RUN_DIR/report.md"
echo "  report.html        → $RUN_DIR/report.html  (open in a browser)"
echo "  screenshots/       → $RUN_DIR/screenshots/"
echo "  latest symlink     → /app/test-results/latest → run-${TIMESTAMP}"
exit $EXIT_CODE
