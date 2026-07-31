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
#   ARCHIVE_DB_DATABASE       — destination DB for the archive flow (+ ARCHIVE_DB_*)
#
set -e

SCRIPTS=/app/docker/regression/scripts

# DR-E5: shared helpers, one copy across both entrypoints (see the full-mode
# entrypoint + scripts/lib/entrypoint-common.sh).
source "$SCRIPTS/lib/entrypoint-common.sh"

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

# Remote mode pushes into its results DB (no --no-write-back).
push_extra_metadata_dirs ""

# ─── 1b. Archive destination pre-flight ─────────────────────────────────────
# Fail fast (~5s) if the archive destination is misconfigured. Sets
# ARCHIVE_PREFLIGHT_OK, consumed by § 5 (archive-run.sh).
run_archive_preflight

# ─── 2. Per-run output directory ─────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
# DR-F1: prefer the host-minted RUN_ID; fall back to a container-minted id.
RUN_ID="${RUN_ID:-run-${TIMESTAMP}}"
RUN_DIR="/app/test-results/${RUN_ID}"
mkdir -p "$RUN_DIR/screenshots"

# DR-F2: tee everything from here on to the bind-mounted run dir so a detached
# or crashed run still leaves a console record on disk (not only docker logs).
exec > >(tee -a "$RUN_DIR/runner.log") 2>&1

echo "Run directory: $RUN_DIR"
echo ""

# ─── 3. Run the suite ────────────────────────────────────────────────────────
WORKERS=${MAX_PARALLEL_WORKERS:-4}
echo "Running '${TEST_SUITE_NAME}' (${WORKERS} parallel workers) against ${MJ_TEST_VAR_baseUrl}..."

# Optional --oracles-module arg from the target profile's `oraclesModule` field.
build_oracles_args

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
generate_standard_reports

# ─── 5. Optional archive ─────────────────────────────────────────────────────
# Shared with the full-stack entrypoint — see scripts/archive-run.sh for the
# full env-var contract. Sourced so it runs in this shell with RUN_DIR /
# SCRIPTS / ARCHIVE_PREFLIGHT_OK / TEST_SUITE_NAME / EXTRA_METADATA_DIRS set.
source "$SCRIPTS/archive-run.sh"

# ─── 6. Latest symlink ───────────────────────────────────────────────────────
finalize_latest_symlink

echo ""
echo "Run directory: $RUN_DIR"
echo "  results.json       → $RUN_DIR/results.json"
echo "  report.md          → $RUN_DIR/report.md"
echo "  report.html        → $RUN_DIR/report.html  (open in a browser)"
echo "  screenshots/       → $RUN_DIR/screenshots/"
echo "  latest symlink     → /app/test-results/latest → $RUN_ID"
exit $EXIT_CODE
