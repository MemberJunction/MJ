#!/usr/bin/env bash
# Usage: cleanup.sh <worktree> [--delete-branch]
#
# Copies the worktree's run folders into the main checkout's docker/regression/test-results
# (so `mj test regression compare` can use them), with the skill's run log in the latest one,
# then removes the worktree. With
# --delete-branch it also deletes the worktree's local branch: use it only when the branch has
# no commits that were not pushed.
set -euo pipefail
source "$(dirname "$0")/lib/common.sh"

wt=$(abs_dir "${1:?usage: cleanup.sh <worktree> [--delete-branch]}")
delete_branch="${2:-}"
main=$(main_checkout)
[ "$wt" != "$(abs_dir "$main")" ] || die "$wt is the main checkout"

branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD)
src="$wt/docker/regression/test-results"
dest="$main/docker/regression/test-results"
mkdir -p "$dest"
for run in "$src"/run-*; do
    [ -d "$run" ] || continue
    cp -R "$run" "$dest/"
    echo "Kept $(basename "$run") in $dest"
done
latest=$(latest_run "$wt")
if [ -f "$src/replay-pr-run.log" ] && [ -n "$latest" ] && [ -d "$dest/$latest" ]; then
    cp "$src/replay-pr-run.log" "$dest/$latest/"
fi

git -C "$main" worktree remove "$wt"
echo "Removed the worktree $wt"
if [ "$delete_branch" = "--delete-branch" ]; then
    git -C "$main" branch -D "$branch"
    echo "Deleted the local branch $branch"
fi
