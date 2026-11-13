---
name: author-regression-test
description: Use when a branch changes what a user sees or does in MJ Explorer and needs a browser regression test, when asked to add, update or scaffold a test in metadata-optional/regression-test, or when a regression test's T number collides after a rebase.
---

# Author a regression test

## Overview

MJ Explorer regression tests are `MJ: Tests` records (Computer Use type) in
`metadata-optional/regression-test/tests/regression/.T###-*.json`, each a member of
`test-suites/.regression-suite.json`. An LLM drives a browser to reach the goal and a judge checks
the criteria. **Files come from `mj test regression new`, never from a hand copy**: a copy keeps the
other test's `primaryKey`, so a push overwrites that test.

Helper (run from the repo root): `node .claude/skills/author-regression-test/scripts/related-tests.mjs [--base origin/next] [--keywords a,b]`.

## Steps

1. **Check the tooling.** The branch needs `packages/MJCLI/src/lib/regression/test-scaffold.ts` and
   `.github/scripts/check-regression-suite.mjs`. If they are missing, stop: the branch must merge a
   `next` that has them.
2. **Find the UI change and the related tests.** Run the helper. Read the diff of the files it lists.
   - "No UI files changed" and no visible behavior the developer can name → no regression test.
     Say so and point to integration coverage (`guides/INTEGRATION_TESTING_QUICKSTART.md`).
   - Read the top related tests. **Update one** when the change alters a flow it already drives
     (edit its goal and criteria). **Add one** when the change adds a new flow.
3. **Check the data.** The stack starts from MJ's migrations and metadata plus the seeds in
   `docker/regression/`: `test-metadata/`, `scripts/seed-conversations.cjs`,
   `scripts/seed-sample-data.cjs` and `scripts/setup-test-user.cjs`. A goal may name only records
   these create, or must create what it needs first (for example, "if the rail is empty, create
   and save a form, then duplicate it").
4. **Propose 1–3 tests and ask** the developer to accept, edit or drop each one:
   - **Goal**: the path (app → screen → action) and the success state on screen. Add "Pages can
     take 10-30s to load — wait, don't navigate away." Never ask the agent to save data it cannot
     clean up unless the test is about saving.
   - **Criteria**: 2–4 facts a judge can see on screen, plus "No error messages, blank screens, or
     crash pages".
   - **Priority** (`P0` login/navigation/CRUD, `P1` core workflows, `P2` extended features, `P3`
     edge cases; when unsure, the priority of the related tests), **tags** (the area tag of the
     related tests), **max steps** (5 for one click, 15–35 for a workflow), and `--from` the
     closest related test.
   - **Start path**: empty (the home page, like most tests, with the goal naming the app to open)
     or the app's route (`/app/<path>`). Find the route from the component that the diff changes
     (its resource registration or the app's nav), not from the folder name.
5. **Scaffold.** Run `pnpm mj test regression new … --dry-run`, show it, then run it without
   `--dry-run`. Read the new file. Then run `pnpm run check:regression-suite`. Do not run the
   "next steps" the command prints (`mj sync push`, `mj test run`): they write to the database in
   your `mj.config.cjs`, which may be shared. Step 6 runs the test in its own stack.
6. **Optional: prove it passes and record its first replay script.** Ask first: it costs one LLM
   run and 30–60 minutes (1–2 hours the first time, which also generates forms and builds the
   images). Without it, the next suite harvest records the script.
   1. Commit the new test first (step 7). The harvest check fails on any other uncommitted change,
      so if the checkout has other uncommitted work, stop and ask the developer to commit it.
   2. Check: no `mj-regression` containers (`docker ps -aq --filter label=com.docker.compose.project=mj-regression`),
      ports 11433, 14000 and 4200 are free, and `docker/regression/.env.test` exists. If it does
      not, the developer copies `.env.test.example` and fills in the secrets; never type them.
   3. With `S=.claude/skills/regression-replay-pr/scripts` and `C=$(pwd)`: run
      `mkdir -p docker/regression/test-results` and `bash $S/run-stack.sh "$C" "<test name>"` in the
      background. It prints `RUN_DIR=` and `RUNNER_EXIT=`.
   4. Failed → read `$RUN_DIR/report.md`, sharpen the goal or criteria, `bash $S/teardown.sh "$C"`,
      and run again. Passed → `bash $S/harvest.sh "$C" pull`. On a problem, show it and stop; do not
      edit files to make the check pass.
   5. `bash $S/teardown.sh "$C"`. Show `git diff`: only the test's new `ReplayScript` reference and its
      script file may change. The file name is the lowercase kebab form of the test name
      (`T156 - Form Studio Duplicate` → `regression/scripts/t156-form-studio-duplicate.json`).
      Commit them on approval.
7. **Commit only with approval**, with explicit paths: the test file, `.regression-suite.json`, and
   any script file. Test files under `metadata-optional/` need no changeset.

## When the developer wants a hand copy

Say once why the CLI is safer (the copied `primaryKey`, the suite member, the escaped JSON strings)
and that `--from T###` copies the configuration. If they still want a copy: rename the file and
`Name` to the next number; give the test a new `uuidgen` ID; delete `sync` and any
`ReplayScript`/`PendingReplayScript`; edit the goal, `startUrl`, criteria and `maxSteps` inside the
escaped `InputDefinition`/`ExpectedOutcomes` strings and in `Configuration`; set `Tags`; add the
suite member with its own new ID and `Sequence` = highest + 1; run the check (it reports duplicate
IDs, names, numbers and sequences).

## T number collision after a rebase

A rebase usually also stops on `.regression-suite.json`, because both branches append a member:
keep both members. Keep `next`'s test. Renumber yours to the next free number: `git mv` the file,
edit `Name`, set the member's `TestID` to the new name and its `Sequence` to highest + 1, and keep
both `primaryKey` IDs. If it has a script, `git mv` the script file to the new kebab name and fix
the `@file:` reference. Run the check and `grep -rn "<old name>" metadata-optional/`. Commit on
approval; the rebased branch needs `git push --force-with-lease`, so ask first and check
`git branch -vv`.

## Common mistakes

| Mistake | Fix |
|---|---|
| A test for a server-only change | Integration coverage instead |
| A goal that names data the stack does not seed | Create the data in the goal, or use a seeded record |
| Criteria that need the database ("the row is saved") | State what the screen shows |
| `mj test regression up` to record a script | It stays attached after the run (and `-d` does not wait); use `run-stack.sh`, which waits and leaves the stack up for the harvest |
| Harvest with uncommitted work in the checkout | Commit the test first |
