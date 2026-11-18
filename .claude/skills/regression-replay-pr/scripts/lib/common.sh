# Sourced by the regression-replay-pr helper scripts. Works in bash 3.2 and later.

# Prints an error and exits.
die() {
    echo "✗ $*" >&2
    exit 1
}

# Prints the absolute path of a directory.
abs_dir() {
    (cd "$1" 2>/dev/null && pwd -P) || die "not a directory: $1"
}

# Prints the main checkout of the current repo (also when called from a worktree).
main_checkout() {
    local common
    common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || die "not inside a git repo"
    dirname "$common"
}

# Sets the COMPOSE array to the regression stack command of a worktree.
init_compose() {
    local file="$1/docker/regression/docker-compose.test.yml"
    local env="$1/docker/regression/.env.test"
    [ -f "$file" ] || die "no regression stack in $1 ($file is missing)"
    [ -f "$env" ] || die "$env is missing"
    COMPOSE=(docker compose -f "$file" --env-file "$env" --profile full)
}

# Runs the MJ CLI in a one-off test-runner container. The stack's database must be up.
mj_in_stack() {
    "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint node test-runner /app/packages/MJCLI/bin/run.js "$@"
}

# Prints the run folder name that test-results/latest points to, or nothing.
latest_run() {
    readlink "$1/docker/regression/test-results/latest" 2>/dev/null || true
}

# Prints a time stamp for progress lines.
ts() {
    date '+%H:%M:%S'
}
