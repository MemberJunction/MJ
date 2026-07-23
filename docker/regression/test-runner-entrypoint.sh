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

# DR-E5: shared helpers (extra-metadata push, archive pre-flight, oracles args,
# report generation, latest symlink) — one copy, sourced by both entrypoints.
source "$SCRIPTS/lib/entrypoint-common.sh"

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
# Skipped entirely in bacpac mode: the imported DB is the customer's own, and
# the user supplies their suite via EXTRA_METADATA_DIRS (pushed in § 2b below).
# Seeding demo apps / the computeruse@ user / the standard 25 tests would be
# wrong against their data.
if [ -z "${BACPAC_FILE:-}" ]; then
# Application sync must run first so that the SQL user-setup can find all
# ApplicationEntity rows (with DefaultForNewUser=1) to create the matching
# UserApplicationEntity rows.
echo "Syncing application metadata..."
npx mj sync push --dir=metadata --include="applications" --no-write-back 2>&1 || {
    echo "  WARNING: Application metadata sync failed"
}
echo ""

# DR-B5: push Computer Use controller/judge PROMPTS from the LIVE host mount
# every run. db-setup also seeds them, but from its BAKED copy — so editing a
# prompt JSON used to take effect only on a db-setup image rebuild (the
# staleness trap). This live push (idempotent, runs after db-setup) makes prompt
# edits take effect on the next `up`, same as test/suite edits already do.
echo "Syncing Computer Use prompts (live)..."
npx mj sync push --dir=metadata --include="prompts" --no-write-back 2>&1 || {
    echo "  WARNING: Prompts metadata sync failed — Computer Use prompts may be stale"
}
echo ""

# Test-scoped metadata (from docker/regression/test-metadata/):
#   tags  — 3 global tags (vip, follow-up, regression-test)
#   users — test user + roles + List Categories + Lists + User View Categories
#           + User Views + User Notifications (nested as relatedEntities)
# Tags must process first so any future UserTag references resolve.
echo "Syncing test user metadata..."
npx mj sync push --dir=/app/test-metadata --include="tags,users" --no-write-back 2>&1 || {
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
# Clear the regression suite's baseline-seeded members BEFORE any test push:
# (a) makes the metadata suite-member push authoritative — the baseline seeds
# different PKs for the same (SuiteID,TestID) pairs, which would UQ-collide and
# roll back the whole member transaction; and (b) drops suite members holding an
# FK to a Computer Use test that the delete records below prune.
echo "Clearing baseline-seeded regression suite members..."
node "$SCRIPTS/clear-baseline-suite-members.cjs" 2>&1 || echo "  WARNING: suite-member clear failed (non-fatal)"
echo ""

# Default metadata/ tree: research-agent tests/suites + the Computer Use delete
# records (metadata/tests/regression/.deleted-computer-use-tests.json) that prune
# the pre-consolidation regression tests from the instance.
echo "Syncing test metadata (incl. Computer Use delete records)..."
npx mj sync push --dir=metadata --include="tests" --no-write-back 2>&1 || {
    echo "  WARNING: Test metadata sync failed"
}
echo ""
echo "Syncing test suites..."
npx mj sync push --dir=metadata --include="test-suites" --no-write-back 2>&1 || {
    echo "  WARNING: Suite metadata sync failed"
}
echo ""

# Regression tests + suite live in the opt-in metadata-optional sibling root
# (kept out of the base instance, like integration-test). directoryOrder pushes
# tests before the suite so @lookup suite members resolve.
echo "Syncing regression tests + suite from metadata-optional/regression-test..."
npx mj sync push --dir=metadata-optional/regression-test --no-write-back 2>&1 || {
    echo "  WARNING: Regression metadata sync failed"
}
echo ""
fi  # end: standard (non-bacpac) metadata seeding

# ─── 2b. Extra metadata directories ──────────────────────────────────────────
# Optional dirs of test/suite JSON pushed in addition to the MJ metadata (Mode D
# overlays seeding app-specific tests). --no-write-back: local ephemeral DB.
push_extra_metadata_dirs "--no-write-back"

# ─── 4. Pre-flight gate ──────────────────────────────────────────────────────
# DR-E1: preflight now GATES the run. It exits non-zero when a gating check
# fails (MJAPI/nginx/socat unreachable, DB suite membership short of metadata,
# missing auth material, no AI keys), turning a config mistake into a ~5s abort
# instead of a hanging run / hours of LLM spend. Set PREFLIGHT_SOFT=1 to
# restore advisory-only behavior. Writes /tmp/preflight.json (moved into
# $RUN_DIR after it's created below).
echo "Running pre-flight gate..."
if ! node "$SCRIPTS/preflight-checks.cjs" 2>&1; then
    echo ""
    echo "  ✗ Pre-flight gate failed — aborting before the suite (no LLM spend)."
    echo "    Fix the issues above, or re-run with PREFLIGHT_SOFT=1 for advisory mode."
    exit 78
fi
echo ""

# ─── 4b. Archive destination pre-flight ─────────────────────────────────────
# Fail fast (~5s) on a misconfigured archive destination instead of after the
# ~10-min suite. Sets ARCHIVE_PREFLIGHT_OK, consumed by § 8 (archive-run.sh).
run_archive_preflight

# Each run writes into its own timestamped folder so runs don't overwrite
# each other. Structure:
#   test-results/run-YYYYMMDDTHHMMSSZ/{results.json,report.md,report.html,
#                                     diagnostics.json,preflight.json,
#                                     screenshots/}
# A "latest" symlink always points at the most recent run.
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
# DR-F1: prefer the host-minted RUN_ID (the CLI sets it before compose so it
# owns this run's identity + output dir from launch); fall back to a
# container-minted id for direct `docker run` / legacy invocations.
RUN_ID="${RUN_ID:-run-${TIMESTAMP}}"
RUN_DIR="/app/test-results/${RUN_ID}"
mkdir -p "$RUN_DIR/screenshots"

# RI-C1/B1/B2: replay-trace store wiring for the ComputerUseTestDriver.
#  - CU_TRACE_OUT_DIR — where a green, recordable LLM-tier pass RECORDS a
#    candidate trace (RI-B1). Under this run's dir so it survives to the host and
#    `mj test regression promote-traces` finds it at
#    test-results/<RUN_ID>/traces-out/.
#  - CU_TRACE_DIR — the committed store the driver REPLAYS from (RI-B2),
#    delivered read-only via the metadata-optional mount. (Matches the driver's
#    cwd-relative default; set explicitly so it's independent of cwd.)
export CU_TRACE_OUT_DIR="$RUN_DIR/traces-out"
export CU_TRACE_DIR="/app/metadata-optional/regression-test/tests/regression/traces"
mkdir -p "$CU_TRACE_OUT_DIR"

# Security: feed the {{authUsername}}/{{authPassword}} test variables from the
# single credential source (.env.test → TEST_UID/TEST_PWD). Test auth bindings
# reference these variables instead of a git-committed literal password, so the
# real password lives ONLY in the gitignored .env.test. An explicitly-set
# MJ_TEST_VAR_* (host env) still wins.
export MJ_TEST_VAR_authUsername="${MJ_TEST_VAR_authUsername:-${TEST_UID:-}}"
export MJ_TEST_VAR_authPassword="${MJ_TEST_VAR_authPassword:-${TEST_PWD:-}}"

# DR-F2: tee everything from here on to the bind-mounted run dir, so a detached
# (`up -d`) or crashed/OOM-killed run still leaves a complete console record on
# disk — not only in `docker logs` (which a killed run loses). Append (-a) so a
# resumed run (DR-D6) doesn't truncate the prior log. Output BEFORE this point
# (socat/metadata/preflight gate) stays in docker logs; capturing the full
# stdout host-side is DR-F2's Wave-1 half (up-then-run with piped stdio).
exec > >(tee -a "$RUN_DIR/runner.log") 2>&1

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

# ─── 5b. Single-login auth bootstrap ─────────────────────────────────────────
# Log in to Auth0 ONCE and capture the browser storageState (cookies +
# localStorage). The ComputerUseTestDriver seeds EVERY browser context from this
# single file, so no individual test re-authenticates — one Auth0 login for the
# whole suite instead of ~one per test (which previously throttled the tenant).
# On failure we unset the var so the suite falls back to the per-worker login
# path. Skipped in bacpac mode (the imported DB has the customer's own users,
# not the computeruse@ test user).
if [ -z "${BACPAC_FILE:-}" ]; then
    export MJ_TEST_AUTH_STATE_FILE=/tmp/mj-auth-state.json
    echo "Running single-login auth bootstrap..."
    if node "$SCRIPTS/auth-bootstrap.cjs" 2>&1; then
        echo "  ✓ Single-login mode ENABLED (state: $MJ_TEST_AUTH_STATE_FILE)"
    else
        echo "  ✗ Auth bootstrap failed — falling back to per-worker login"
        unset MJ_TEST_AUTH_STATE_FILE
    fi
    echo ""
fi

# ─── 6. Run the suite ────────────────────────────────────────────────────────
# Disable set -e so we can capture screenshots + reports on failure.
#
# TEST_SUITE_NAME defaults to "MJ Explorer Regression Suite" but Mode D
# overlays (e.g., the BYO example app) override this to point at their own
# suite — e.g., TEST_SUITE_NAME="BYO Regression Suite".
WORKERS=${MAX_PARALLEL_WORKERS:-3}
SUITE_NAME="${TEST_SUITE_NAME:-MJ Explorer Regression Suite}"
# Retry a failed test up to N extra times (pass-if-any) to absorb the inherent
# non-determinism of LLM-driven Computer Use tests; a test that fails then passes
# is reported as flaky so genuine regressions stay visible. Override via MAX_RETRIES.
RETRIES=${MAX_RETRIES:-2}
echo "Running '${SUITE_NAME}' (${WORKERS} parallel workers, up to ${RETRIES} retries on failure)..."
# RI-A1: surface the build identity the container actually received, so an empty
# value (→ Computer Use replay falls back to replay-with-heal instead of the
# zero-heal replay tier) is visible in the run log rather than a silent mystery.
# Empty is expected for a dirty tree or a non-CLI launch; the composite hash only
# unlocks exact-match replay on a clean, CLI-launched build.
echo "  Build (APP_BUILD_HASH): ${APP_BUILD_HASH:-<empty — replay will use replay-with-heal>}"

# Optional --oracles-module arg (Phase 5): BYO custom IOracle implementations.
build_oracles_args

# DR-F4: restrict the run to specific test names (rerun-failures / ad-hoc
# selection). Empty = whole suite.
TESTS_ARGS=()
if [ -n "${TEST_NAME_FILTER:-}" ]; then
    TESTS_ARGS=(--tests "$TEST_NAME_FILTER")
    echo "  Restricting to tests: $TEST_NAME_FILTER"
fi

set +e
npx mj test suite --name "${SUITE_NAME}" \
    --format json \
    --output "$RUN_DIR/results.json" \
    --parallel \
    --max-parallel "$WORKERS" \
    --max-retries "$RETRIES" \
    "${ORACLES_ARGS[@]}" \
    "${TESTS_ARGS[@]}"
EXIT_CODE=$?
set -e

# DR-G4: the health supervisor stays alive THROUGH report generation (below) so
# its samples cover the whole run, then is stopped at the very end. It also
# parent-watches, so even if this script dies unexpectedly the supervisor exits
# on its own rather than orphaning for hours (the §3.2 failure).

# ─── 7. Extract screenshots + generate reports ───────────────────────────────
generate_standard_reports

# DR-G2: machine-readable summary.json for CI gates + trend tracking.
echo ""
echo "Generating summary.json..."
RUN_DIR="$RUN_DIR" node "$SCRIPTS/generate-summary.cjs" 2>&1 || echo "  WARNING: summary.json generation failed"

# ─── 8. Optional archive: pull this suite-run + children + push to archive MJ ─
# Shared with the remote entrypoint — see scripts/archive-run.sh for the full
# env-var contract. Sourced so it runs in this shell with RUN_DIR / SCRIPTS /
# ARCHIVE_PREFLIGHT_OK / TEST_SUITE_NAME / EXTRA_METADATA_DIRS already set.
source "$SCRIPTS/archive-run.sh"

# Maintain a "latest" symlink pointing at this run's directory.
# `mj test compare --from-json docker/regression/test-results` discovers
# all run-* folders automatically (no need to reference "latest" explicitly).
finalize_latest_symlink

# DR-G4: stop the supervisor now that reports are done (it stayed alive through
# them). Parent-watch already backstops orphaning if we never reach here.
if [ -n "${MONITOR_PID:-}" ]; then
    kill "$MONITOR_PID" 2>/dev/null || true
    wait "$MONITOR_PID" 2>/dev/null || true
fi

echo ""
echo "Run directory: $RUN_DIR"
echo "  results.json       → $RUN_DIR/results.json"
echo "  results.jsonl      → $RUN_DIR/results.jsonl       (per-attempt, crash-safe)"
echo "  report.md          → $RUN_DIR/report.md"
echo "  report.html        → $RUN_DIR/report.html  (open in a browser)"
echo "  screenshots/       → $RUN_DIR/screenshots/"
echo "  summary.json       → $RUN_DIR/summary.json        (CI-gate machine summary)"
echo "  diagnostics.ndjson → $RUN_DIR/diagnostics.ndjson  (health supervisor log)"
echo "  health-state.json  → $RUN_DIR/health-state.json   (last health state)"
echo "  preflight.json     → $RUN_DIR/preflight.json      (pre-flight checks)"
echo "  latest symlink     → /app/test-results/latest → $RUN_ID"
exit $EXIT_CODE
