#!/bin/bash
# Entrypoint dispatcher for `memberjunction/agentic-test-runner`.
#
# Supports three subcommands:
#   init <example-name>      Copy an example directory from /app/examples/ to /out/
#                            (the caller's bind-mounted cwd). Used by
#                            `mj test regression init` and direct docker invocations.
#   run                      Run the test suite. Reads TEST_SUITE_NAME, MJ_TEST_VAR_*,
#                            EXTRA_METADATA_DIRS, ORACLES_MODULE, ARCHIVE_MJ_CONFIG.
#                            Defaults to "MJ Explorer Regression Suite" for parity
#                            with the legacy test-runner image.
#   exec <cmd…>              Pass-through to the underlying shell. Useful for
#                            `docker run … exec npx mj test list`.
#   help                     Print this help.
#
# The MJ-specific full-stack flow uses docker/regression/test-runner-entrypoint.sh
# instead of this dispatcher — that script is mounted by the regression compose
# and overrides ENTRYPOINT. This dispatcher is the entry point for everyone else.
set -e

SUBCMD="${1:-run}"
shift || true

case "$SUBCMD" in
    init)
        if [ -z "${1:-}" ]; then
            echo "✗ usage: init <example-name>" >&2
            echo "  available examples:" >&2
            ls -1 /app/examples/ 2>/dev/null | sed 's/^/    /' >&2
            exit 1
        fi
        exec /usr/local/bin/agentic-test-runner-init "$@"
        ;;

    run)
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

        # Optional: push extra metadata dirs (BYO tests/suites) before the run.
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

        ln -sfn "run-${TIMESTAMP}" /app/test-results/latest 2>/dev/null || true
        echo ""
        echo "Results: ${RUN_DIR}/results.json"
        exit $EXIT_CODE
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

  run                   Run a test suite. Configured via env vars:
                          TEST_SUITE_NAME (default: "MJ Explorer Regression Suite")
                          MJ_TEST_VAR_*   (variable substitution)
                          EXTRA_METADATA_DIRS (comma-separated push paths)
                          ORACLES_MODULE  (path to custom oracle module)
                          MAX_PARALLEL_WORKERS (default: 4)

  exec <cmd>            Pass-through. e.g. `agentic-test-runner exec npx mj test list`.

  help                  Show this help.

Examples:
  docker run --rm -v $(pwd):/out memberjunction/agentic-test-runner init generic-web
  docker run --rm \
      -v $(pwd)/test-results:/app/test-results \
      -e TEST_SUITE_NAME="My App Suite" \
      -e MJ_TEST_VAR_baseUrl=https://my-app.example.com \
      memberjunction/agentic-test-runner

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
