#!/usr/bin/env bash
# Usage: teardown.sh <worktree>
#
# Stops the worktree's regression stack and deletes its throwaway database. The run folders in
# docker/regression/test-results stay.
set -uo pipefail
source "$(dirname "$0")/lib/common.sh"

wt=$(abs_dir "${1:?usage: teardown.sh <worktree>}")
init_compose "$wt"
"${COMPOSE[@]}" down -v --remove-orphans || die "docker compose down failed"
