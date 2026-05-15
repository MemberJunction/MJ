#!/bin/bash
# Test Runner Entrypoint
#
# Runs the regression suite end-to-end:
#   1. Forwards localhost:4200 → mjexplorer:4200 (secure context for Auth0)
#   2. Syncs application + test metadata
#   3. Seeds the test user + roles + apps + favorites via SQL safety-net
#   4. Pre-flight diagnostics (MJAPI, nginx, socat, Auth0)
#   5. Runs the regression test suite in parallel (N workers, shared browser contexts)
#   6. Extracts screenshots from DB
#   7. Generates markdown + HTML reports
#
# All non-trivial JavaScript lives in scripts/*.cjs — see scripts/lib/db.cjs
# for the shared mssql connection helper.
set -e

SCRIPTS=/app/docker/regression/scripts

# Register ComputerUseTestDriver with ClassFactory before the CLI runs.
export NODE_OPTIONS="--import /app/bootstrap.mjs"

echo ""
echo "  MJ Regression Test Runner"
echo "  ─────────────────────────────────────────"
echo ""

# ─── 1. localhost proxy ──────────────────────────────────────────────────────
# auth0-spa-js only works on secure origins; browsers treat localhost as
# secure but not arbitrary hostnames like "mjexplorer". Forward
# localhost:4200 → mjexplorer:4200 inside the test-runner container.
echo "Starting localhost proxy (localhost:4200 → mjexplorer:4200)..."
socat TCP-LISTEN:4200,fork,reuseaddr TCP:mjexplorer:4200 &
SOCAT_PID=$!
sleep 1
curl -sf http://localhost:4200/ -o /dev/null \
    && echo "  ✓ localhost:4200 is reachable" \
    || echo "  ✗ localhost:4200 NOT reachable"
echo ""

# ─── 2. Application + test metadata ──────────────────────────────────────────
# Application sync must run first so that the SQL user-setup can find all
# ApplicationEntity rows (with DefaultForNewUser=1) to create the matching
# UserApplicationEntity rows.
echo "Syncing application metadata..."
npx mj sync push --dir=metadata --include="applications" 2>&1 || {
    echo "  WARNING: Application metadata sync failed"
}
echo ""

# Test-scoped metadata (from docker/regression/test-metadata/):
#   tags  — 3 global tags (vip, follow-up, regression-test)
#   users — test user + roles + List Categories + Lists + User View Categories
#           + User Views + User Notifications (nested as relatedEntities)
# Tags must process first so any future UserTag references resolve.
echo "Syncing test user metadata..."
npx mj sync push --dir=/app/test-metadata --include="tags,users" 2>&1 || {
    echo "  WARNING: Test user metadata sync failed — falling back to SQL"
}
echo ""

# ─── 3. SQL safety-net for test user + roles + apps + favorites ──────────────
# Guarantees the user + both roles exist before the browser authenticates,
# even if mj-sync fails. Also seeds dynamic example data (lists, favorites)
# that reference AssociationDemo record IDs.
echo "Ensuring test user, roles, apps, and example data via SQL..."
node "$SCRIPTS/setup-test-user.cjs" 2>&1
echo ""

# Sync test definitions + suite mapping. Tests must process before suites
# because suites reference tests by name.
echo "Syncing test metadata..."
npx mj sync push --dir=metadata --include="tests" 2>&1 || {
    echo "  WARNING: Test metadata sync failed"
}
echo ""
echo "Syncing test suites..."
npx mj sync push --dir=metadata --include="test-suites" 2>&1 || {
    echo "  WARNING: Suite metadata sync failed"
}
echo ""

# Optional: extra metadata directories pushed in addition to the MJ metadata.
# EXTRA_METADATA_DIRS=/app/byo-tests,/app/byo-suites would push two extra dirs
# of test + suite JSON before running the suite. Used by Mode D overlays that
# need to seed app-specific tests (e.g., the BYO example app) without making
# them part of the core MJ metadata.
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

# ─── 4. Pre-flight diagnostics ───────────────────────────────────────────────
# Probes MJAPI/nginx/socat/Auth0 + records a memory snapshot. Writes to
# /tmp/preflight.json (we move it into $RUN_DIR after creating it below).
echo "Running pre-flight diagnostics..."
node "$SCRIPTS/preflight-checks.cjs" 2>&1
echo ""

# Each run writes into its own timestamped folder so runs don't overwrite
# each other. Structure:
#   test-results/run-YYYYMMDDTHHMMSSZ/{results.json,report.md,report.html,
#                                     diagnostics.json,preflight.json,
#                                     screenshots/}
# A "latest" symlink always points at the most recent run.
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
RUN_DIR="/app/test-results/run-${TIMESTAMP}"
mkdir -p "$RUN_DIR/screenshots"
echo "Run directory: $RUN_DIR"
echo ""

# Move pre-flight diagnostics into the run directory.
[ -f /tmp/preflight.json ] && mv /tmp/preflight.json "$RUN_DIR/preflight.json"

# ─── 5. Background health monitor ────────────────────────────────────────────
# Probes MJAPI/nginx/socat every 10s, writes diagnostics.json into RUN_DIR.
echo "Starting background health monitor..."
RUN_DIR="$RUN_DIR" node "$SCRIPTS/health-monitor.cjs" &
MONITOR_PID=$!
echo "  Health monitor PID: $MONITOR_PID"
echo ""

# ─── 6. Run the suite ────────────────────────────────────────────────────────
# Disable set -e so we can capture screenshots + reports on failure.
#
# TEST_SUITE_NAME defaults to "MJ Explorer Regression Suite" but Mode D
# overlays (e.g., the BYO example app) override this to point at their own
# suite — e.g., TEST_SUITE_NAME="BYO Regression Suite".
WORKERS=${MAX_PARALLEL_WORKERS:-4}
SUITE_NAME="${TEST_SUITE_NAME:-MJ Explorer Regression Suite}"
echo "Running '${SUITE_NAME}' (${WORKERS} parallel workers)..."

# Optional --oracles-module arg (Phase 5). Lets BYO Mode D / Mode C adopters
# ship custom IOracle implementations alongside their tests.
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
npx mj test suite --name "${SUITE_NAME}" \
    --format json \
    --output "$RUN_DIR/results.json" \
    --parallel \
    --max-parallel "$WORKERS" \
    "${ORACLES_ARGS[@]}"
EXIT_CODE=$?
set -e

# Stop the health monitor.
echo ""
echo "Stopping health monitor..."
kill $MONITOR_PID 2>/dev/null
wait $MONITOR_PID 2>/dev/null || true

# ─── 7. Extract screenshots + generate reports ───────────────────────────────
echo ""
echo "Extracting screenshots..."
RUN_DIR="$RUN_DIR" node "$SCRIPTS/extract-screenshots.cjs" 2>&1 \
    || echo "  WARNING: Screenshot extraction failed"

echo ""
echo "Generating markdown report..."
RUN_DIR="$RUN_DIR" node "$SCRIPTS/generate-md-report.cjs" 2>&1

echo ""
echo "Generating HTML screenshot gallery..."
RUN_DIR="$RUN_DIR" TIMESTAMP="$TIMESTAMP" node "$SCRIPTS/generate-html-report.cjs" 2>&1

# ─── 8. Optional archive: pull this suite-run + children + push to archive MJ ─
# Enabled when ARCHIVE_MJ_CONFIG points at a mj.config.cjs for the destination
# MJ instance. The pull uses the entity-cascade config in
# docker/regression/archive/ to externalize InlineData screenshots; the push
# uses MJ_CONFIG_FILE to swap providers without disturbing the local mj.config.
#
# Skipped silently when ARCHIVE_MJ_CONFIG is unset.
if [ -n "${ARCHIVE_MJ_CONFIG:-}" ]; then
    echo ""
    echo "Archiving suite run to ${ARCHIVE_MJ_CONFIG}..."

    # Pull the suite run's ID from results.json so we can filter the pull.
    SUITE_RUN_ID=$(node -e "const r=require('${RUN_DIR}/results.json'); console.log(r.suiteRunId || '');" 2>/dev/null || echo "")
    if [ -z "$SUITE_RUN_ID" ]; then
        echo "  WARNING: Could not read suiteRunId from results.json — skipping archive"
    elif [ ! -f "$ARCHIVE_MJ_CONFIG" ]; then
        echo "  WARNING: ARCHIVE_MJ_CONFIG file not found: $ARCHIVE_MJ_CONFIG — skipping archive"
    else
        # 8a. Copy the archive template (.mj-sync.json files describing the
        # entity cascade + externalization) into the run dir.
        ARCHIVE_DIR="${RUN_DIR}/archive"
        mkdir -p "${ARCHIVE_DIR}"
        cp -R /app/docker/regression/archive/. "${ARCHIVE_DIR}/"

        # 8b. Pull the suite run + cascading children into the archive dir.
        # Uses the LOCAL mj.config.cjs (default cosmiconfig search) to pull
        # from the docker SQL Server.
        echo "  Pulling suite run + children to ${ARCHIVE_DIR}..."
        (cd "${ARCHIVE_DIR}" && npx mj sync pull \
            --entity="MJ: Test Suite Runs" \
            --filter="ID='${SUITE_RUN_ID}'" 2>&1) \
            || echo "  WARNING: Archive pull failed"

        # 8c. Tag the pulled records (Tags field, optional MachineName overlay).
        ARCHIVE_TAG="${ARCHIVE_TAG:-${TEST_SUITE_NAME:-}}" \
        ARCHIVE_SOURCE="${ARCHIVE_SOURCE:-}" \
        RUN_DIR="${RUN_DIR}" \
            node "$SCRIPTS/tag-archive.cjs" 2>&1 || echo "  WARNING: Tagging failed"

        # 8d. Push to the archive MJ. Swap mj.config.cjs via MJ_CONFIG_FILE
        # so the push targets a different DB than the pull. --ci flag avoids
        # the interactive "continue anyway?" prompt that hangs in a non-TTY
        # container; validation errors fail the push outright.
        echo "  Pushing archive to destination MJ..."
        MJ_CONFIG_FILE="${ARCHIVE_MJ_CONFIG}" \
            npx mj sync push --dir="${ARCHIVE_DIR}" --ci 2>&1 \
            || echo "  WARNING: Archive push failed"

        echo "  Archive complete."
    fi
fi

# Maintain a "latest" symlink pointing at this run's directory.
# `mj test compare --from-json docker/regression/test-results` discovers
# all run-* folders automatically (no need to reference "latest" explicitly).
ln -sfn "run-${TIMESTAMP}" /app/test-results/latest \
    || echo "  WARNING: Could not create latest symlink"

echo ""
echo "Run directory: $RUN_DIR"
echo "  results.json       → $RUN_DIR/results.json"
echo "  report.md          → $RUN_DIR/report.md"
echo "  report.html        → $RUN_DIR/report.html  (open in a browser)"
echo "  screenshots/       → $RUN_DIR/screenshots/"
echo "  diagnostics.json   → $RUN_DIR/diagnostics.json  (health monitor log)"
echo "  preflight.json     → $RUN_DIR/preflight.json    (pre-flight checks)"
echo "  latest symlink     → /app/test-results/latest → run-${TIMESTAMP}"
exit $EXIT_CODE
