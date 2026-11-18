# Sourced by the test-runner entrypoints.
#
# build_test_name_args sets the TEST_ARGS array for `mj test suite` from TEST_NAMES, a
# comma-separated list of exact test names. TEST_ARGS is empty when TEST_NAMES is not set,
# so the whole suite runs.
build_test_name_args() {
    TEST_ARGS=()
    if [ -z "${TEST_NAMES:-}" ]; then
        return 0
    fi
    local names name
    IFS=',' read -r -a names <<< "$TEST_NAMES"
    for name in "${names[@]}"; do
        TEST_ARGS+=(--test "$name")
    done
    echo "  Selected tests: ${TEST_NAMES}"
}
