#!/bin/bash
# Shared helpers for the regression test-runner entrypoints (DR-E5).
#
# `test-runner-entrypoint.sh` (full mode) and `test-runner-remote-entrypoint.sh`
# (remote-target mode) had independently-drifting copies of the same blocks —
# the extra-metadata push loop, the archive-destination pre-flight, the
# oracles-module arg builder, the screenshot+report generation, and the `latest`
# symlink. This library holds ONE copy of each, sourced by both entrypoints — the
# same pattern already used for `archive-run.sh`.
#
# Sourcing runs these in the CALLER's shell (not a subshell), so the functions
# read and write the caller's globals directly — `SCRIPTS`, `RUN_DIR`, `RUN_ID`,
# `TIMESTAMP`, plus the two they populate for later steps: `ORACLES_ARGS` (the
# suite invocation) and `ARCHIVE_PREFLIGHT_OK` (consumed by archive-run.sh). They
# run under the caller's `set -e`, matching the inline code they replaced.
#
# NOTE: the published-image dispatcher (docker/agentic-test-runner/dispatcher.sh)
# carries the same duplication but lives in a different image; folding it onto
# this library is gated on DR-C6 (which vendors scripts/ into the published
# image). The functions are written mode-agnostically so it can adopt them then.

# Push every comma-separated directory in EXTRA_METADATA_DIRS (a Mode D / BYO
# hook for seeding app-specific test + suite JSON before the run). $1 = extra
# flags for `mj sync push` — "--no-write-back" for the local-DB full mode, ""
# for remote mode (which pushes into its results DB). No-op when the var is unset.
push_extra_metadata_dirs() {
    local push_flags="$1"
    [ -n "${EXTRA_METADATA_DIRS:-}" ] || return 0
    local IFS=','
    read -ra _extra_dirs <<< "$EXTRA_METADATA_DIRS"
    local dir dir_trimmed
    for dir in "${_extra_dirs[@]}"; do
        dir_trimmed="$(echo "$dir" | xargs)"
        if [ -d "$dir_trimmed" ]; then
            echo "Syncing extra metadata from $dir_trimmed..."
            npx mj sync push --dir="$dir_trimmed" $push_flags 2>&1 || {
                echo "  WARNING: Extra metadata sync from $dir_trimmed failed"
            }
            echo ""
        else
            echo "  WARNING: EXTRA_METADATA_DIRS entry not found: $dir_trimmed"
        fi
    done
}

# Validate the archive destination up front (fail fast, ~5s) when
# ARCHIVE_DB_DATABASE is set, instead of discovering misconfiguration after the
# ~10-minute suite. Sets ARCHIVE_PREFLIGHT_OK (caller global) so archive-run.sh
# can decide whether to attempt the push.
run_archive_preflight() {
    ARCHIVE_PREFLIGHT_OK=0
    if [ -n "${ARCHIVE_DB_DATABASE:-}" ]; then
        echo "Running archive destination pre-flight..."
        if node "$SCRIPTS/archive-preflight.cjs" 2>&1; then
            ARCHIVE_PREFLIGHT_OK=1
        else
            echo "  Archive destination pre-flight FAILED — the archive step will be skipped."
            echo "  Fix the issues above and re-run, or unset ARCHIVE_DB_DATABASE to disable archiving."
        fi
        echo ""
    fi
}

# Populate ORACLES_ARGS (caller global array) from ORACLES_MODULE, so a Mode C/D
# adopter can plug custom IOracle implementations into the suite invocation.
# Empty array when unset or the module path doesn't exist.
build_oracles_args() {
    ORACLES_ARGS=()
    if [ -n "${ORACLES_MODULE:-}" ]; then
        if [ -f "$ORACLES_MODULE" ]; then
            ORACLES_ARGS=(--oracles-module "$ORACLES_MODULE")
            echo "  Custom oracle module: $ORACLES_MODULE"
        else
            echo "  WARNING: ORACLES_MODULE=$ORACLES_MODULE not found — skipping"
        fi
    fi
}

# The reports common to every mode: extract screenshots from the DB, then the
# markdown report and the HTML screenshot gallery. Uses RUN_DIR + TIMESTAMP +
# SCRIPTS (caller globals). Mode-specific extras (e.g. full mode's summary.json)
# stay in the caller after this returns.
generate_standard_reports() {
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

    # DR-F6 (carve-out): JUnit XML for CI consumers. Best-effort — a report
    # failure must never fail an otherwise-complete run.
    echo ""
    echo "Generating JUnit XML (CI)..."
    RUN_DIR="$RUN_DIR" node "$SCRIPTS/generate-junit.cjs" 2>&1 \
        || echo "  WARNING: JUnit report generation failed"
}

# Point test-results/latest at THIS run. Keyed on RUN_ID (which equals
# basename "$RUN_DIR"), NOT a re-derived run-${TIMESTAMP}: when the host mints
# RUN_ID (DR-F1) those differ, and the remote entrypoint's old
# `ln … run-${TIMESTAMP}` produced a symlink pointing at a directory that didn't
# exist. Using RUN_ID keeps the symlink correct in every mode.
finalize_latest_symlink() {
    ln -sfn "$RUN_ID" /app/test-results/latest \
        || echo "  WARNING: Could not create latest symlink"
}
