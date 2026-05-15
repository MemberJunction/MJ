#!/bin/bash
# `init <example-name>` — copy one of the bundled example directories into the
# caller's bind-mounted /out directory.
#
# Invoked by:
#   docker run --rm -v $(pwd):/out memberjunction/agentic-test-runner init generic-web
#
# Or by the MJ CLI:
#   mj test regression init generic-web    (resolves to the docker run above)
#
# Bundled examples live in /app/examples/ (baked in by the Dockerfile from
# docker/regression/examples/). The set is whatever is checked into the
# monorepo at image-bake time.
set -e

EXAMPLES_DIR=/app/examples
OUT_DIR=/out

EXAMPLE_NAME="$1"
shift || true

if [ -z "$EXAMPLE_NAME" ]; then
    echo "✗ usage: init <example-name>" >&2
    echo "  available examples:" >&2
    ls -1 "$EXAMPLES_DIR" 2>/dev/null | sed 's/^/    /' >&2
    exit 1
fi

SRC="${EXAMPLES_DIR}/${EXAMPLE_NAME}"
if [ ! -d "$SRC" ]; then
    echo "✗ example '${EXAMPLE_NAME}' not found in image" >&2
    echo "  available:" >&2
    ls -1 "$EXAMPLES_DIR" 2>/dev/null | sed 's/^/    /' >&2
    exit 1
fi

if [ ! -d "$OUT_DIR" ]; then
    echo "✗ /out is not mounted. Did you forget '-v \$(pwd):/out'?" >&2
    exit 1
fi

DEST="${OUT_DIR}/${EXAMPLE_NAME}"
if [ -e "$DEST" ]; then
    echo "✗ destination already exists: ./${EXAMPLE_NAME}" >&2
    echo "  remove or rename it first, or copy individual files manually." >&2
    exit 1
fi

cp -R "$SRC" "$DEST"

# Best-effort chown so the user owns the files on the host instead of root.
# Honors UID/GID env vars when provided; otherwise leaves ownership as-is.
if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
    chown -R "${HOST_UID}:${HOST_GID}" "$DEST" 2>/dev/null || true
fi

echo "✓ Scaffolded ./${EXAMPLE_NAME}/"
echo ""
echo "Next steps:"
echo "  1. Edit ${EXAMPLE_NAME}/target.json — point baseUrl + auth at your app."
echo "  2. Adjust tests under ${EXAMPLE_NAME}/metadata/tests/ to match your app."
echo "  3. Run the suite:"
echo "       docker run --rm \\"
echo "           -v \$(pwd)/${EXAMPLE_NAME}/test-results:/app/test-results \\"
echo "           -v \$(pwd)/${EXAMPLE_NAME}/metadata:/app/byo-metadata \\"
echo "           -e TEST_SUITE_NAME=\"<from target.json>\" \\"
echo "           -e MJ_TEST_VAR_baseUrl=\"<from target.json>\" \\"
echo "           -e EXTRA_METADATA_DIRS=/app/byo-metadata \\"
echo "           memberjunction/agentic-test-runner"
echo ""
echo "Or, inside the MJ monorepo:"
echo "  mj test regression remote --target=./${EXAMPLE_NAME}/target.json"
