#!/usr/bin/env bash
# Usage: worktree.sh <base-branch> <branch-prefix> <env-file>
#
# Creates the harvest worktree from origin/<base-branch> on a new branch that tracks nothing,
# and copies the env file into it. Prints WORKTREE=, BRANCH= and BASE_SHA= lines.
set -euo pipefail
source "$(dirname "$0")/lib/common.sh"

base="${1:?usage: worktree.sh <base-branch> <branch-prefix> <env-file>}"
prefix="${2:?usage: worktree.sh <base-branch> <branch-prefix> <env-file>}"
env_file="${3:?usage: worktree.sh <base-branch> <branch-prefix> <env-file>}"

[ -f "$env_file" ] || die "env file not found: $env_file"
main=$(main_checkout)
safe_base=$(printf '%s' "$base" | tr '/' '-')
stamp=$(date +%Y%m%d)
branch="$prefix-regression-replay-scripts-$safe_base-$stamp"
wt="$main/.claude/worktrees/replay-$safe_base-$stamp"

[ ! -e "$wt" ] || die "$wt already exists. Remove it with: git worktree remove $wt"
if git -C "$main" show-ref --verify --quiet "refs/heads/$branch"; then
    die "branch $branch already exists locally"
fi
if git -C "$main" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    die "branch $branch already exists on origin"
fi

git -C "$main" fetch --quiet origin "$base"
git -C "$main" worktree add --quiet --no-track -b "$branch" "$wt" "origin/$base"
install -m 600 "$env_file" "$wt/docker/regression/.env.test"
mkdir -p "$wt/docker/regression/test-results"

echo "WORKTREE=$wt"
echo "BRANCH=$branch"
echo "BASE_SHA=$(git -C "$wt" rev-parse HEAD)"
