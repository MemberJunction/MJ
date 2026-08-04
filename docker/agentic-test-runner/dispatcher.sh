#!/bin/bash
# Entrypoint dispatcher for `memberjunction/agentic-test-runner`.
#
# Supports these subcommands:
#   run [--target <file>]    Run the test suite. With --target, loads a target
#                            profile (load-target-profile.cjs) → MJ_TEST_VAR_*/
#                            TEST_SUITE_NAME/EXTRA_METADATA_DIRS/ORACLES_MODULE.
#                            Pushes prompts + extra metadata to DB_*, runs the
#                            suite, then generates screenshots + md/html reports.
#   import-bacpac            One-shot SqlPackage import into DB_* (reads BACPAC_FILE
#                            / DB_*). Runs before MJAPI in the bacpac standalone stack.
#   export [<run-dir>]       Inline screenshots → report.standalone.html (default: latest).
#   exec <cmd…>              Pass-through to the underlying shell. Useful for
#                            `docker run … exec npx mj test list`.
#   help                     Print this help.
#
# Scaffolding mode templates (the former `init` subcommand) has moved to the
# CLI: `npm i -g @memberjunction/cli && mj test regression init <template>`.
# Templates ship inside the published CLI package — no Docker run required.
#
# The MJ-specific full-stack flow uses docker/regression/test-runner-entrypoint.sh
# instead of this dispatcher — that script is mounted by the regression compose
# and overrides ENTRYPOINT. This dispatcher is the entry point for everyone else.
set -e

SUBCMD="${1:-run}"
shift || true

case "$SUBCMD" in
    init)
        echo "✗ The 'init' subcommand has moved to the MJ CLI." >&2
        echo "  Install once: npm i -g @memberjunction/cli" >&2
        echo "  Then run:     mj test regression init <template>" >&2
        echo "                mj test regression init --list" >&2
        exit 2
        ;;

    run)
        SCRIPTS=/app/docker/regression/scripts

        # Optional --target <profile.json>: load it host-side-equivalently inside
        # the image and export MJ_TEST_VAR_* / TEST_SUITE_NAME / EXTRA_METADATA_DIRS
        # / ORACLES_MODULE. `env:` refs resolve from this container's env (passed
        # via -e / --env-file). This is how external `mj test regression remote`
        # reaches load-target-profile.cjs without a monorepo checkout.
        TARGET=""
        while [ $# -gt 0 ]; do
            case "$1" in
                --target) TARGET="$2"; shift 2 || true ;;
                --target=*) TARGET="${1#--target=}"; shift ;;
                *) shift ;;
            esac
        done
        if [ -n "$TARGET" ]; then
            if [ ! -f "$TARGET" ]; then
                echo "✗ --target not found: $TARGET" >&2
                exit 1
            fi
            echo "Loading target profile: $TARGET"
            eval "$(node "$SCRIPTS/load-target-profile.cjs" --format=env "$TARGET")"
        fi

        SUITE_NAME="${TEST_SUITE_NAME:-MJ Explorer Regression Suite}"
        WORKERS="${MAX_PARALLEL_WORKERS:-4}"

        echo ""
        echo "  Agentic Test Runner"
        echo "  ─────────────────────────────────────────"
        echo "  Suite: ${SUITE_NAME}"
        echo "  Workers: ${WORKERS}"
        echo "  Base URL: ${MJ_TEST_VAR_baseUrl:-<inherited from test definition>}"
        echo ""

        export NODE_OPTIONS="--import /app/bootstrap.mjs"

        # Computer Use controller/judge prompts must exist in the provider DB for
        # the engine to run. Best-effort (a current-version DB may already carry them).
        echo "Pushing Computer Use prompts..."
        npx mj sync push --dir=metadata --include="prompts" 2>&1 || echo "  WARNING: prompts push failed"

        # Optional: push extra metadata dirs (the user's tests/suites) before the run.
        if [ -n "${EXTRA_METADATA_DIRS:-}" ]; then
            IFS=',' read -ra DIRS <<< "$EXTRA_METADATA_DIRS"
            for DIR in "${DIRS[@]}"; do
                DIR_TRIMMED="$(echo "$DIR" | xargs)"
                if [ -d "$DIR_TRIMMED" ]; then
                    echo "Pushing metadata from $DIR_TRIMMED..."
                    npx mj sync push --dir="$DIR_TRIMMED" 2>&1 || echo "  WARNING: push failed"
                fi
            done
        fi

        # Optional --oracles-module forwarded to the suite invocation.
        ORACLES_ARGS=()
        if [ -n "${ORACLES_MODULE:-}" ] && [ -f "$ORACLES_MODULE" ]; then
            ORACLES_ARGS=(--oracles-module "$ORACLES_MODULE")
            echo "  Custom oracle module: $ORACLES_MODULE"
        fi

        # Per-run output directory so concurrent invocations don't overwrite.
        TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
        RUN_DIR="/app/test-results/run-${TIMESTAMP}"
        mkdir -p "$RUN_DIR"

        set +e
        npx mj test suite --name "${SUITE_NAME}" \
            --format json \
            --output "${RUN_DIR}/results.json" \
            --parallel \
            --max-parallel "${WORKERS}" \
            "${ORACLES_ARGS[@]}"
        EXIT_CODE=$?
        set -e

        # Full-parity reports: screenshots + markdown + HTML gallery (best-effort).
        echo ""
        echo "Generating reports..."
        RUN_DIR="$RUN_DIR" node "$SCRIPTS/extract-screenshots.cjs" 2>&1 || echo "  WARNING: screenshot extraction failed"
        RUN_DIR="$RUN_DIR" node "$SCRIPTS/generate-md-report.cjs" 2>&1 || echo "  WARNING: md report failed"
        RUN_DIR="$RUN_DIR" TIMESTAMP="$TIMESTAMP" node "$SCRIPTS/generate-html-report.cjs" 2>&1 || echo "  WARNING: html report failed"

        ln -sfn "run-${TIMESTAMP}" /app/test-results/latest 2>/dev/null || true
        echo ""
        echo "Results: ${RUN_DIR}/  (results.json, report.md, report.html, screenshots/)"
        exit $EXIT_CODE
        ;;

    import-bacpac)
        # One-shot SqlPackage import into DB_* (drop-if-exists → import → history
        # guard). Reads BACPAC_FILE / BACPAC_UPGRADE / DB_* from env. Used by the
        # bacpac-standalone compose as the step before MJAPI boots.
        node /app/docker/regression/scripts/import-bacpac.cjs
        ;;

    export)
        # Inline screenshots into a portable report.standalone.html. Lets
        # `mj test regression export` reach inline-report.cjs outside the monorepo.
        RUN_DIR_ARG="${1:-/app/test-results/latest}"
        node /app/docker/regression/scripts/inline-report.cjs "$RUN_DIR_ARG"
        ;;

    exec)
        if [ -z "${1:-}" ]; then
            echo "✗ usage: exec <command> [args...]" >&2
            exit 1
        fi
        exec "$@"
        ;;

    help|--help|-h)
        cat <<'EOF'
Agentic Test Runner — generalized regression-suite image.

Subcommands:
  init <example-name>   Copy an example directory from /app/examples/ to /out
                        (bind-mount the host directory you want it in).
                        Available examples:
EOF
        ls -1 /app/examples/ 2>/dev/null | sed 's/^/                          /'
        cat <<'EOF'

  run [--target <file>] Run a test suite. --target loads a target profile;
                        otherwise configured via env vars:
                          TEST_SUITE_NAME (default: "MJ Explorer Regression Suite")
                          MJ_TEST_VAR_*   (variable substitution)
                          EXTRA_METADATA_DIRS (comma-separated push paths)
                          ORACLES_MODULE  (path to custom oracle module)
                          MAX_PARALLEL_WORKERS (default: 4)
                          DB_*            (provider DB for defs/prompts/results)
                        Pushes prompts + extra metadata, runs the suite, then
                        writes results.json + report.md + report.html + screenshots/.

  import-bacpac         SqlPackage import into DB_* (reads BACPAC_FILE / DB_*).

  export [<run-dir>]    Inline screenshots → report.standalone.html (default: latest run).

  exec <cmd>            Pass-through. e.g. `agentic-test-runner exec npx mj test list`.

  help                  Show this help.

Examples:
  docker run --rm -v $(pwd):/out memberjunction/agentic-test-runner init generic-web
  docker run --rm \
      -v $(pwd)/my-suite:/work -v $(pwd)/test-results:/app/test-results \
      --env-file .env \
      memberjunction/agentic-test-runner run --target=/work/target.json

For the MJ Explorer regression suite (full-stack mode), use
`mj test regression up` instead — that wraps a docker-compose stack.
EOF
        ;;

    *)
        echo "✗ unknown subcommand: ${SUBCMD}" >&2
        echo "  try 'help' for usage" >&2
        exit 1
        ;;
esac
