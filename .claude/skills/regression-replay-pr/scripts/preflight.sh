#!/usr/bin/env bash
# Usage: preflight.sh <base-branch> <env-file>
#
# Checks that this machine can run the regression stack for <base-branch> and open a PR:
# the branch and its harvest support, Docker, no other mj-regression stack, free ports and
# disk, the env file keys, and the GitHub CLI sign-in. Prints every problem, then exits 1
# if there was one.
set -uo pipefail
source "$(dirname "$0")/lib/common.sh"

base="${1:?usage: preflight.sh <base-branch> <env-file>}"
env_file="${2:?usage: preflight.sh <base-branch> <env-file>}"

REQUIRED_KEYS="TEST_SA_PASSWORD MJ_BASE_ENCRYPTION_KEY AUTH0_DOMAIN AUTH0_CLIENTID TEST_UID TEST_PWD"
AI_KEYS="AI_VENDOR_API_KEY__GeminiLLM AI_VENDOR_API_KEY__AnthropicLLM"
PORTS="11433 14000 4200"
MIN_FREE_GB=30
# Files that the harvest needs in the branch under test (PR MemberJunction/MJ#6613).
SUPPORT_FILES="packages/TestingFramework/CLI/src/utils/script-drift-report.ts docker/regression/scripts/lib/test-names.sh"

failures=0
pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*"; failures=$((failures + 1)); }

# True when the env file sets the key to a value that is not empty.
env_has_value() {
    local line value
    line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$2" | tail -1)
    value="${line#*=}"
    value=$(printf '%s' "$value" | tr -d "[:space:]\"'")
    [ -n "$value" ]
}

check_branch() {
    if ! git ls-remote --exit-code --heads origin "$base" >/dev/null 2>&1; then
        fail "origin has no branch $base"
        return
    fi
    pass "origin has branch $base"
    git fetch --quiet origin "$base" || { fail "git fetch origin $base failed"; return; }
    local f missing=0
    for f in $SUPPORT_FILES; do
        git cat-file -e "origin/$base:$f" 2>/dev/null || missing=1
    done
    if [ $missing -eq 0 ]; then
        pass "origin/$base has the replay harvest support"
    else
        fail "origin/$base lacks the replay harvest support (PR MemberJunction/MJ#6613). Pick a branch that contains it."
    fi
}

check_docker() {
    if ! docker info >/dev/null 2>&1; then
        fail "Docker is not running"
        return
    fi
    pass "Docker is running"
    if [ -n "$(docker ps -aq --filter label=com.docker.compose.project=mj-regression)" ]; then
        fail "an mj-regression stack exists (running or stopped). It belongs to another checkout or an earlier run."
    else
        pass "no mj-regression stack exists"
    fi
    local port
    for port in $PORTS; do
        if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
            fail "port $port is in use"
        else
            pass "port $port is free"
        fi
    done
}

check_disk() {
    local free_gb
    free_gb=$(df -Pk "$(main_checkout)" | awk 'NR == 2 { print int($4 / 1048576) }')
    if [ "$free_gb" -lt "$MIN_FREE_GB" ]; then
        fail "only ${free_gb} GB free on disk (the stack needs about ${MIN_FREE_GB} GB)"
    else
        pass "${free_gb} GB free on disk"
    fi
}

check_env_file() {
    if [ ! -f "$env_file" ]; then
        fail "env file not found: $env_file"
        return
    fi
    local key missing="" ai=0
    for key in $REQUIRED_KEYS; do
        env_has_value "$key" "$env_file" || missing="$missing $key"
    done
    for key in $AI_KEYS; do
        env_has_value "$key" "$env_file" && ai=1
    done
    [ $ai -eq 1 ] || missing="$missing (one of: $AI_KEYS)"
    if [ -n "$missing" ]; then
        fail "env file $env_file has no value for:$missing"
    else
        pass "env file has the required keys"
    fi
}

check_gh() {
    if gh auth status >/dev/null 2>&1; then
        pass "gh is signed in"
    else
        fail "gh is not signed in (run: gh auth login)"
    fi
}

echo "Preflight for $base"
check_branch
check_docker
check_disk
check_env_file
check_gh

if [ $failures -gt 0 ]; then
    echo "Preflight failed: $failures problem(s)."
    exit 1
fi
echo "Preflight passed."
