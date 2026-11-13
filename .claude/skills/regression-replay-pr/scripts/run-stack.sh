#!/usr/bin/env bash
# Usage: run-stack.sh <worktree> [test name]...
#
# Builds the regression stack from the worktree and runs the suite, or only the named tests.
# Leaves the stack up, so that the harvest can read its database. Prints RUN_DIR= and
# RUNNER_EXIT= at the end. RUNNER_EXIT is not 0 when a test failed; the script exits 1 only
# when the stack did not start or the runner wrote no results.
#
# Environment: REPLAY_SUITE_NAME overrides the suite (default "MJ Explorer Regression Suite").
set -uo pipefail
source "$(dirname "$0")/lib/common.sh"

wt=$(abs_dir "${1:?usage: run-stack.sh <worktree> [test name]...}")
shift
init_compose "$wt"

names=""
for name in "$@"; do
    case "$name" in *,*) die "a test name cannot contain a comma: $name" ;; esac
    names="${names:+$names,}$name"
done

results="$wt/docker/regression/test-results"
mkdir -p "$results"
before=$(latest_run "$wt")
cd "$wt"

if [ ! -d docker/regression/.docker-generated/MJExplorer-forms ]; then
    echo "[$(ts)] Generating entity forms (about 20 min)..."
    bash docker/regression/gen-forms.sh || die "gen-forms failed"
fi

echo "[$(ts)] Building images (about 40 min when nothing is cached)..."
"${COMPOSE[@]}" build || die "the image build failed"

echo "[$(ts)] Starting the stack (about 10 min until the first test)..."
TEST_SUITE_NAME="${REPLAY_SUITE_NAME:-MJ Explorer Regression Suite}" TEST_NAMES="$names" \
    "${COMPOSE[@]}" up -d \
    || die "the stack did not start. See: docker compose -p mj-regression logs db-setup mjapi"

echo "[$(ts)] Waiting for the test runner..."
"${COMPOSE[@]}" wait test-runner
rc=$?

after=$(latest_run "$wt")
if [ -z "$after" ] || [ "$after" = "$before" ] || [ ! -f "$results/$after/results.json" ]; then
    die "the test runner wrote no results (exit $rc). See: docker compose -p mj-regression logs test-runner"
fi

echo "[$(ts)] The test runner finished."
echo "RUN_DIR=$results/$after"
echo "RUNNER_EXIT=$rc"
