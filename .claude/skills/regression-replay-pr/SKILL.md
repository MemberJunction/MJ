---
name: regression-replay-pr
description: Use when replay scripts for the MJ Explorer regression suite must be recorded, refreshed or committed for a branch, or when asked to run the Docker regression suite on a branch (usually next) and open a PR with the replay scripts the run recorded.
---

# Regression replay-script PR

## Overview

Runs the Docker regression stack for one branch in its own git worktree, pulls the replay
scripts that the run recorded into `metadata-optional/regression-test/tests/regression/scripts/`,
and opens a PR to that branch. The helper scripts do the fixed steps. You make the decisions and
talk to the user.

`S` below is the absolute path of `.claude/skills/regression-replay-pr/scripts` in the checkout
this skill was loaded from. Run each helper with `bash`, from any folder.

## Inputs

Ask only for what the user did not give.

| Input | Default |
|---|---|
| Base branch (the run tests it, the PR targets it) | `next` |
| Branch prefix | Ask once. Follow the user's branch-name rule (for example `CB`). |
| Env file | `<main checkout>/docker/regression/.env.test`. If it does not exist, ask for a path. |
| Tests | All. Exact test names give a partial run. Say that its PR covers only those tests. |

The branch is `<prefix>-regression-replay-scripts-<base>-<yyyymmdd>`.

## Steps

1. **Preflight.** `bash $S/preflight.sh <base> <env-file>`. If it fails, show its output and
   stop. If an `mj-regression` stack exists, it may belong to another session: ask the user. Do
   not remove it yourself. With no user to ask, stop and report.
2. **Worktree.** `bash $S/worktree.sh <base> <prefix> <env-file>`. Keep `WORKTREE`, `BRANCH` and
   `BASE_SHA` from its output.
3. **Run.** In the background (`run_in_background`), run
   `bash $S/run-stack.sh <WORKTREE> [test name]... > <WORKTREE>/docker/regression/test-results/replay-pr-run.log 2>&1`.
   Tell the user the time: entity forms about 20 min (first run in a worktree), image build
   about 40 min, start about 10 min, the full suite 60–75 min. Wait for the task notification.
   Do not poll.
4. **Results.** Read `RUN_DIR` and `RUNNER_EXIT` from the end of the log. `RUN_DIR` is printed
   only when its `results.json` exists.
   - No `RUN_DIR` (the script exited 1): show the last 40 log lines, do step 7, keep the
     worktree, stop.
   - Read `RUN_DIR/results.json`: passed, failed and skipped counts, and the `tier` of each test.
     If no test passed, show the failures, do step 7, stop. No PR.
   - `RUNNER_EXIT` is not 0 when a test failed. That alone does not stop the skill.
5. **Pending scripts.** `bash $S/harvest.sh <WORKTREE> report` prints the drift report. If it
   lists pending (re-recorded) scripts, show it and ask: promote all, discard all, decide per
   test, or keep them pending. Then run `bash $S/harvest.sh <WORKTREE> promote|discard <test name>...`
   (or `--all`). Kept scripts go into the PR as `.pending.json` files. Note the names you promoted
   and discarded. With no user to ask, keep them pending.
6. **Harvest.** `bash $S/harvest.sh <WORKTREE> pull`. It refreshes the drift report, runs
   `mj sync pull`, deletes script files that no test points to, writes `RUN_DIR/harvest.json`,
   and runs the branch's parity guard. If it exits 1: show the problems and
   `git -C <WORKTREE> diff --stat`, keep the stack and the worktree, and ask the user what to do
   (a retry needs the stack's database). Do step 7 when they are done. Do not edit files to make
   the check pass. With no user to ask, do step 7 and stop.
7. **Teardown.** `bash $S/teardown.sh <WORKTREE>`.
8. **No changes.** If `git -C <WORKTREE> status --porcelain` prints nothing, say "no new or
   changed scripts", run `bash $S/cleanup.sh <WORKTREE> --delete-branch`, stop.
9. **Commit.** `git -C <WORKTREE> add metadata-optional/regression-test/tests` (this path only),
   then commit with the message
   `test(regression): refresh replay scripts from <base> run <run>` (`<run>` is the last part of
   `RUN_DIR`, for example `run-20261112T183113Z`) and the session's attribution trailer.
10. **Push.** `git -C <WORKTREE> push -u origin <BRANCH>`. Then `git -C <WORKTREE> branch -vv`
    must show `[origin/<BRANCH>]`.
11. **PR.** `node $S/harvest-report.mjs pr-body --worktree <WORKTREE> --run-dir <RUN_DIR> --base <base> [--promoted <name>]... [--discarded <name>]...`
    writes `RUN_DIR/pr-body.md`. Then
    `gh pr create --base <base> --head <BRANCH> --title "Refresh regression replay scripts from <base>" --body-file <RUN_DIR>/pr-body.md`.
12. **Clean up.** After the PR is open, `bash $S/cleanup.sh <WORKTREE>`. It copies the run
    folders to the main checkout's `docker/regression/test-results/` and removes the worktree.
    The branch stays.

## Rules

- Work only in the worktree that step 2 made. Never run `git checkout --`, `git restore` or
  `git reset --hard`.
- Stage only `metadata-optional/regression-test/tests`. Never stage `.env.test`.
- Never push to `next` or `main`. The PR goes from `BRANCH` to the base.
- Only one `mj-regression` stack can run on a machine (fixed name and ports).
- A failed test records no script. It does not block the PR; the PR body lists it.
- After a failure, keep the worktree for debugging and tell the user its path.

## Common mistakes

| Mistake | Fix |
|---|---|
| Running `mj test regression up` from the main checkout | That builds the main checkout's code. `run-stack.sh` builds the worktree, which is the base branch. |
| Teardown before `harvest.sh pull` | The pull reads the stack's database. Tear down after the harvest. |
| The check reports a file outside the test folder (for example the suite file's `sync` block), "only the formatting changed", or a test field change | A push and a pull of unchanged metadata must write the same bytes, so this is a bug in the branch, not noise. Report it; do not revert the change and do not commit. |
| `preflight.sh` reports missing harvest support | The base branch is older than PR MemberJunction/MJ#6613. Pick a newer branch. |
