#!/usr/bin/env bash
# Usage:
#   harvest.sh <worktree> report                      write drift.json and drift.md to the run folder, print drift.md
#   harvest.sh <worktree> promote <test name>...      replace each test's script with its pending one
#   harvest.sh <worktree> discard <test name>...      drop each test's pending script
#   harvest.sh <worktree> promote --all | discard --all
#   harvest.sh <worktree> pull                        write the scripts into the worktree, then check the result
#
# Works on the stack that run-stack.sh left up. Every MJ command runs in a one-off test-runner
# container, which writes through the stack's read-write mount of metadata-optional/.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd -P)"
source "$here/lib/common.sh"

usage="usage: harvest.sh <worktree> report|promote|discard|pull [test name... | --all]"
wt=$(abs_dir "${1:?$usage}")
command="${2:?$usage}"
shift 2
init_compose "$wt"

run=$(latest_run "$wt")
[ -n "$run" ] || die "no run folder in $wt/docker/regression/test-results"
run_dir="$wt/docker/regression/test-results/$run"

report() {
    mj_in_stack test scripts --format=json --output="/app/test-results/$run/drift.json" >/dev/null \
        || die "mj test scripts failed"
    mj_in_stack test scripts --format=md --output="/app/test-results/$run/drift.md" >/dev/null \
        || die "mj test scripts failed"
    cat "$run_dir/drift.md"
}

resolve() {
    local verb="$1"
    shift
    if [ "${1:-}" = "--all" ]; then
        mj_in_stack test scripts "--$verb" --yes || die "could not $verb the pending scripts"
        return
    fi
    [ $# -gt 0 ] || die "name the tests, or pass --all"
    local name
    for name in "$@"; do
        mj_in_stack test scripts --test "$name" "--$verb" || die "could not $verb: $name"
    done
}

pull() {
    echo "[$(ts)] Refreshing the drift report..."
    report >/dev/null
    echo "[$(ts)] Pulling the test records and their scripts..."
    mj_in_stack sync pull --entity="MJ: Tests" \
        --target-dir=metadata-optional/regression-test/tests --no-create-new \
        || die "mj sync pull failed"
    echo "[$(ts)] Checking the harvest..."
    local rc=0
    node "$here/harvest-report.mjs" check --worktree "$wt" --remove-orphans --out "$run_dir/harvest.json" || rc=1
    if [ -f "$wt/.github/scripts/check-regression-suite.mjs" ]; then
        node "$wt/.github/scripts/check-regression-suite.mjs" || rc=1
    fi
    return $rc
}

case "$command" in
    report) report ;;
    promote | discard) resolve "$command" "$@" ;;
    pull) pull ;;
    *) die "$usage" ;;
esac
