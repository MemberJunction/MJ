# Regression Suite Automation — Design and Plan

**Date:** 2026-11-12
**Status:** Draft for review. Nothing is implemented.
**Scope:** The MJ Explorer regression suite (Computer Use tests in `metadata-optional/regression-test/`).

## 1. Goals

1. **Authoring.** A developer adds regression-test metadata in their own feature PR, the same way
   they add integration-test metadata today: a test record plus its suite membership, in the
   same PR, guarded by a parity check that fails CI when the two do not match.
2. **Harvest.** After a regression run, the replay scripts that the run recorded get written back to
   git-tracked files, so that a PR can carry them.
3. **Skill.** A Claude skill takes a branch (or asks for one), runs the regression suite for that
   branch in a git worktree, harvests the replay scripts, and opens a PR to that branch (usually
   `next`).

### Decisions already made (2026-11-12)

| Question | Decision |
|---|---|
| Which suite does the PR automation run? | Regression suite only. Only Computer Use tests record replay scripts. |
| How do developers make test metadata? | A `mj test regression new` CLI, plus an authoring skill that drafts the test from the PR diff, plus a parity guard in CI. |
| Where does the replay-script PR automation run? | Locally first, as a skill. A CI workflow is a later phase. |
| What happens to re-recorded ("pending") scripts? | The skill shows the drift report and asks you to promote or discard. A non-interactive run keeps them as `.pending.json` and lists them in the PR body. |

### Non-goals

- A GitHub Actions workflow for the regression run (Phase 7, later).
- Running the integration tier inside the skill.
- A persisted map from Angular code to regression tests. The authoring skill infers the area from
  the diff each time.

## 2. Current state (research findings)

### Integration suite (the model to copy)

- Test records are hand-written: `.IT##-<bundle>.json` plus a member row in
  `.integration-suite.json` (`guides/INTEGRATION_TESTING_QUICKSTART.md` §4, Method 2).
- Enforcement is vitest "sibling parity" tests in `packages/TestingFramework/integration-test-suite/src/__tests__/`:
  `sibling-parity.test.ts` (every bundle has a record, every record is a suite member, nothing
  leaks into `metadata/`), `suite-sequencing.test.ts` (unique IT numbers, Name prefix matches the
  filename), `check-registry.test.ts` (pinned check counts).
- Weak point: those tests run only when the suite package changes. A metadata-only PR skips them.
- IT numbers are picked by hand and collide on `next` (renumbering commits `b1a96eceaf`,
  `9ebc6f43d0`, `8992d9d280`, `a9c4058196`).

### Regression suite (today)

- 155 tests, `T001`–`T155`, one file each in `tests/regression/`, plus 155 members (Sequence 1–155)
  in `test-suites/.regression-suite.json`. Parity holds today only because people kept it up.
- Authoring is "copy the closest test" by hand (`metadata-optional/regression-test/README.md`,
  "Adding a New Test"). No generator, no parity check.
- `mj test validate --dir=...` is in two READMEs but **does not exist**: the command has no `--dir`
  flag and reads tests from the database (`packages/TestingFramework/CLI/src/commands/validate.ts`).
- File encoding: `InputDefinition` and `ExpectedOutcomes` are escaped JSON **strings**;
  `Configuration` is an **object**. Every file carries `primaryKey`/`sync` blocks.
- Some descriptions cite test numbers that do not exist (for example, T041 cites T201–T209).

### Replay scripts (today)

- A passing run that used the LLM records a script into the **database only**
  (`ComputerUseTestDriver.maybeRecordScript` → `script-store.ts SaveScript`).
- Slot rule (`script-store.ts:95`): if the test has no `ReplayScript`, the new script goes to
  `ReplayScript` (promoted). If it has one, the new script goes to `PendingReplayScript`.
  Replay runs only the promoted script.
- `tests/.mj-sync.json` externalizes both fields on **pull** to
  `tests/regression/scripts/{Name}.json` and `{Name}.pending.json`.
- The Docker test runner pushes `metadata-optional/regression-test` at startup
  (`test-runner-entrypoint.sh:140`) but **never pulls**. The stack's database is wiped by
  `down -v`. So today every recorded script is lost. No script is committed yet.
- `mj test scripts [--test] [--promote|--discard] [--yes]` shows and resolves pending scripts. It
  works against the database only and prints plain text.
- Docs disagree: `plans/regression-testing/dom-selection-and-replay-design.md:134-143` says
  scripts live in the database; the README and `.mj-sync.json` make files the source of truth.

### Docker stack constraints

- Fixed compose project name `mj-regression` and fixed host ports 11433, 14000, 4200. Only one
  stack per machine can run. Port 4200 also collides with a local Explorer dev server.
- Images are built from the current working tree, but image names are shared by every checkout.
  A worktree must **build** before **up**, or it runs images from another tree.
- `metadata-optional/` is bind-mounted read-write into the test runner, so a pull inside the
  container writes files straight into the worktree.
- `mj test regression up` (attached) does not return when the test runner exits. Automation must
  use `up -d` and `docker compose wait test-runner`.
- `docker/regression/.env.test` (gitignored) holds Auth0, LLM keys and DB passwords. The
  `.env.test.example` that the QUICKSTART cites does not exist.
- A cold build is long (four full-monorepo images; gen-forms about 5 min). A full LLM-tier run of
  155 tests is about 60–75 min with 4 workers (estimate from earlier runs). Later runs replay and
  should be much faster and cheaper.
- No CI workflow runs this stack (`integration.yml:48-49`).

### Repo conventions that the design follows

- `test.yml` → "Run unit tests" is a required check with no paths filter. It already runs fast
  pure-file guard scripts on every PR (for example, `check-manifest-registrations.mjs`).
- `pnpm run check:guards` (`.github/scripts/check-guards.sh`) runs the same scripts, and the
  pre-push hook runs `check:guards` before `git push` and `gh pr create`.
- Skills are one `SKILL.md` per folder in `.claude/skills/`, frontmatter `name` + `description`.
- Worktrees go in `.claude/worktrees/` (gitignored), from the `save-plan-new-pr` command pattern.
- PRs target `next` with a `## Summary` / `## Test plan` body. A branch must track its
  same-named remote branch.
- A change only under `metadata-optional/` needs no changeset (inferred: it is outside `packages/`
  and `metadata/`; confirm with `npm run check:changeset`).

## 3. Design

### Part A — Authoring (developer makes the metadata)

#### A1. Parity guard: `.github/scripts/check-regression-suite.mjs`

A plain Node script (file reads only, no build, no database), like
`check-manifest-registrations.mjs`. It fails when:

1. A `tests/regression/.T###-*.json` file has no member in `.regression-suite.json`, or a member's
   `@lookup:MJ: Tests.Name=…` names no file.
2. Two files use the same `T###` number, or the `Name` prefix (`T### - `) does not match the
   filename number.
3. Two members use the same `Sequence`. (Gaps are allowed, so a removed test does not force a
   renumber.)
4. A required field is missing or empty: `TypeID` = `@lookup:MJ: Test Types.Name=Computer Use`,
   `Name`, `Description`, `InputDefinition.goal`, `InputDefinition.startUrl`,
   `ExpectedOutcomes.judgeValidationCriteria` (non-empty), `Status`, and `Tags` with exactly one
   of `P0`–`P3` plus `regression`. (`InputDefinition`/`ExpectedOutcomes` are parsed from their
   string form.)
5. A `@file:` reference in `Configuration` points to a missing file, or a file in
   `tests/regression/scripts/` is not referenced by any test (orphan script).
6. A Computer Use test record exists under `metadata/tests/` (leak check, same as the
   integration suite's).

Wiring:

- `package.json`: `"check:regression-suite": "node .github/scripts/check-regression-suite.mjs"`.
- `.github/scripts/check-guards.sh`: run it, so the pre-push hook catches problems before a PR.
- `.github/workflows/test.yml`: add one step next to "Entity manifest registration gate"
  (`if: ${{ !cancelled() }}`). This runs on every PR because the job has no paths filter. This
  also fixes the weak point that the integration parity tests have.
- Replace `mj test validate --dir=…` in both READMEs with `pnpm run check:regression-suite`.

#### A2. Scaffold CLI: `mj test regression new`

`packages/MJCLI/src/commands/test/regression/new.ts` (thin oclif command) plus a pure module
`packages/MJCLI/src/lib/regression/test-scaffold.ts` (unit-tested, next to `docker-helpers.ts`).

```bash
mj test regression new --name "Form builder clones a form" \
  --priority P1 --tags form-builder \
  --start-path /app/form-builder \
  --goal "Open the Forms list, clone 'Contact Form', and verify the copy opens in the editor." \
  --criteria "A new form named 'Copy of Contact Form' is listed" \
  --criteria "The form editor is open on the copy" \
  [--from T149] [--max-steps 25] [--dry-run]
```

Behavior:

1. Read `tests/regression/` and pick the next number: highest `T###` + 1.
2. Build the file from `--from <T###>` (copy that test's `Configuration`, drop its `primaryKey`,
   `sync`, `ReplayScript`, `PendingReplayScript`) or from a built-in minimal template.
3. Write `InputDefinition` and `ExpectedOutcomes` as escaped strings and `Configuration` as an
   object, to match the 155 existing files. Keep `finalUrlPattern`, the `url-match` oracle and
   `startUrl` consistent with `--start-path`.
4. Append a member to `.regression-suite.json` with Sequence = highest + 1 and
   `Status: "Active"`.
5. If `.github/scripts/check-regression-suite.mjs` exists (it does in this repo, not in an
   external app repo), run it on the result. Then print the file path and next steps.

`--dry-run` prints the files without writing. The command never touches the database.

Number collisions between two open PRs are still possible. The parity guard fails the second PR
after the first one merges, and the fix is a renumber on rebase. The command prints this reminder.

#### A3. Authoring skill: `.claude/skills/author-regression-test/SKILL.md`

The developer runs this on their feature branch. Steps:

1. Find the UI surfaces the branch changes: `git diff origin/<base>...HEAD --stat` limited to
   `packages/Angular/**` and `metadata/applications/**`. Map them to Explorer apps
   (`metadata/applications/*.json`) and routes.
2. List existing tests for that area (tags, `startUrl`), so that the skill can propose to **update**
   an existing test before it proposes a new one.
3. Propose 1–3 test candidates (goal, success state, judge criteria, priority, max steps). Ask the
   developer to accept, edit, or drop each one.
4. Call `mj test regression new` for each accepted candidate. Run
   `pnpm run check:regression-suite`.
5. Optional: run only the new tests in the Docker stack (needs B3's single-test filter), then
   harvest (Part B) to record the first replay script.
6. Show the diff. Commit only with the developer's approval, with explicit `git add <paths>`.

### Part B — Harvest (the "system" that gets scripts into git)

The harvest runs **inside the test-runner container**. That container already has the built CLI,
an `mj.config.cjs` that reads the stack's `DB_*` variables, and the read-write mount of
`metadata-optional/`. So no `pnpm install` and no host build is needed in the worktree.

#### B1. Harvest steps (after the test runner exits, before `down -v`)

```bash
C="docker compose -f docker/regression/docker-compose.test.yml --env-file docker/regression/.env.test --profile full"

# 1. Drift report (pending scripts and what changed)
$C run --rm --no-deps --entrypoint node test-runner /app/packages/MJCLI/bin/run.js test scripts

# 2. Resolve pending scripts (the skill asks first)
$C run --rm --no-deps --entrypoint node test-runner /app/packages/MJCLI/bin/run.js \
   test scripts --test "<name>" --promote        # or --discard

# 3. Pull scripts back to files (writes through the RW mount into the worktree)
$C run --rm --no-deps --entrypoint node test-runner /app/packages/MJCLI/bin/run.js \
   sync pull --entity="MJ: Tests" --target-dir=metadata-optional/regression-test/tests
```

Expected result: new files in `tests/regression/scripts/`, plus a
`"ReplayScript": "@file:regression/scripts/<name>.json"` key in each changed test's
`Configuration`. **Phase 0 must prove this** (see risks).

> **See §7.** Phase 0 showed that `sync pull` (and the entrypoint's push before it) rewrote all
> 155 test files. §7 lists the four causes and their fixes. The harvest keeps step 3.

The commands live in the skill's helper script (C2), not in the target branch, so the harvest
works for any branch that has replay-script support.

#### B2. `mj test scripts --format markdown|json`

Add an output format flag so the drift report can go straight into a PR body. The current text
output stays the default.

#### B3. Small stack fixes

1. Add `docker/regression/.env.test.example` with key names only (the docs already cite it).
2. Add a `TEST_NAMES` variable to `test-runner-entrypoint.sh` (comma-separated). When set, the
   runner runs `mj test run --name` for each name instead of the whole suite. Expose it as
   `mj test regression up --test "<name>"` (repeatable). The authoring skill uses this.
3. Update `dom-selection-and-replay-design.md` so it says that files are the source of truth
   (matches the README and `.mj-sync.json`).

### Part C — The replay-script PR skill

`.claude/skills/regression-replay-pr/SKILL.md` plus helper scripts in
`.claude/skills/regression-replay-pr/scripts/` (`preflight.sh`, `harvest.sh`). The helpers do
the fixed steps. The SKILL.md handles decisions and talks to the user.

#### C1. Flow

| # | Step | Detail |
|---|---|---|
| 1 | Get the branch | Use the argument, or ask (default `next`). Check it exists: `git ls-remote --heads origin <branch>`. |
| 2 | Choose the PR base | Base = that branch. Branches under `lts/*` are allowed (the PR goes to that line). |
| 3 | Preflight | Docker is running. No `mj-regression` compose project is running. Ports 11433, 14000, 4200 are free. `docker/regression/.env.test` exists in the main checkout. Enough disk space. Stop with a clear message if any check fails. |
| 4 | Worktree | `git fetch origin <base>` then `git worktree add .claude/worktrees/replay-<base>-<yyyymmdd> -b <prefix>-regression-replay-scripts-<base>-<yyyymmdd> --no-track origin/<base>`. Copy `.env.test` into the worktree. |
| 5 | Build | From the worktree: `bash docker/regression/gen-forms.sh` if `.docker-generated/` is missing, then `docker compose … build`. |
| 6 | Run | `docker compose … up -d`, then `docker compose … wait test-runner` as a background task. Tell the user the expected time. |
| 7 | Results | Read `docker/regression/test-results/latest/results.json` and `report.md`: passed, failed, skipped, and replay tier for each test. If `db-setup` failed or no test passed, stop: no PR. |
| 8 | Drift and review | Run the drift report (B1 step 1). Ask the user to promote or discard, all together or per test. Apply the answers (B1 step 2). |
| 9 | Harvest | B1 step 3. |
| 10 | Verify | `git -C <wt> status --porcelain` must show changes only in `tests/regression/scripts/**` and `Configuration` keys of test files. Run `node .github/scripts/check-regression-suite.mjs` if the branch has it. Stop and show the diff if anything else changed. |
| 11 | Teardown | `docker compose … down -v` (the stack's own throwaway database). Keep the results folder. |
| 12 | No changes | Report "no new or changed scripts", remove the worktree, stop. |
| 13 | Commit | `git -C <wt> add metadata-optional/regression-test/tests` (explicit path). Message: `test(regression): refresh replay scripts from <base> run <timestamp>`. |
| 14 | Push | `git -C <wt> push -u origin <branch>`. Check `git -C <wt> branch -vv` shows `[origin/<branch>]`. |
| 15 | PR | `gh pr create --base <base> --head <branch>`. Body: run summary (counts, tiers, duration), new scripts, promoted, discarded, still pending (with the B2 markdown drift report), failed tests (no script recorded), and a test plan. Repo footer. |
| 16 | Clean up | Remove the worktree after the PR is open. Keep it if a step failed, for debugging. |

#### C2. Branch prefix

The branch name is `<prefix>-regression-replay-scripts-<base>-<yyyymmdd>`. The skill reads the
prefix from an argument or asks once. Your convention is `CB`.

#### C3. Failure rules

- A failed test records no script. It does not block the PR. The PR body lists it.
- The skill never runs `git checkout --`, `git restore`, or `git reset --hard`. It works only
  inside the worktree it created.
- The skill never stages `.env.test` (it adds explicit paths only).

## 4. Implementation phases

Each phase is one PR to `next` from `CB-regression-suite-automation` (or one branch per phase).
Every task writes its failing tests first, confirms they fail, then implements.

| Phase | Work | Depends on | Size |
|---|---|---|---|
| 0 | **Spike (throwaway).** Run 2–3 tests in the stack (a temporary suite via `TEST_SUITE_NAME`), run B1 step 3, and inspect `git diff`. Prove: (0) a one-off `test-runner` container reaches the stack's database (its `mj.config.cjs` reads the `DB_*` variables), (a) the pull changes only script files and `Configuration` keys, (b) file names match `{Name}` sanitization, (c) the next `up` pushes the scripts back and those tests run on the replay tier. Decide: keep `sync pull`, or write a focused harvester that writes only the script files and keys. | — | S |
| 1 | **Parity guard** (A1): script, `check:regression-suite`, `check-guards.sh`, `test.yml` step, README fixes. Fix any current violations it finds. | — | S |
| 2 | **Scaffold CLI** (A2): `test-scaffold.ts` + vitest, `new.ts` command, README "Adding a New Test" rewrite. | 1 (reuses its rules) | M |
| 3 | **Stack and CLI fixes** (B2, B3): `--format` on `mj test scripts`, `TEST_NAMES` + `up --test`, `.env.test.example`, design-doc fix. | 0 | M |
| 4 | **Replay-script PR skill** (Part C) with `preflight.sh` and `harvest.sh`. Add it to the skills list in root `CLAUDE.md` (check `npm run check:claude-md`). | 0, 3 | M |
| 5 | **Authoring skill** (A3). | 2, 3 | M |
| 6 | **First real harvest.** Run the Part C skill on `next`. This is the first PR that commits replay scripts. Expect fewer than 155: a test whose run used an unmatched coordinate click records no script (§7). | 4 | L (run time) |
| 7 | **Later:** a `workflow_dispatch` / nightly GitHub Action that runs Part C's helpers, copied from the `bizapps-guide.yml` PR pattern (GitHub App token, fixed branch, reuse an open PR). Needs Auth0 and LLM secrets and a large runner. | 6 | L |

Phases 1 and 2 touch different files from Phases 0 and 3, so they can run in parallel.

## 5. Risks and checks

| Risk | Mitigation |
|---|---|
| `sync pull` rewrites all 155 test files (format, key order, `primaryKey`/`sync`). | Confirmed in Phase 0. Four causes, all fixed in this branch (§7). |
| Recorded scripts hard-code the Auth0 tenant origin. | Fix the recorder before Phase 6 (§7). |
| Only one stack can run per machine (fixed name and ports). | Preflight stops the skill. Parameterized ports can come later. |
| Stale images from another checkout. | The skill always builds in the worktree before `up`. |
| The first full run is long and costs LLM tokens (about 60–75 min). | Run once for the first harvest. Later runs replay and cost less. |
| Auth0 must allow `http://localhost:4200` callbacks. | Preflight note. Same as today. |
| Secrets in `.env.test` get copied into the worktree. | The worktree folder is gitignored. The skill stages explicit paths only. |
| Two feature PRs pick the same T number. | The parity guard fails the second PR after the first merges. Renumber on rebase. |
| The parity guard fails on day one. | Phase 1 fixes current violations in the same PR. |
| `AGENTS.md:511-525` ("Extend the suite with every feature") points to a folder that no longer exists, and `.claude/rules/testing.md:82` disagrees with `AGENTS.md:582` about the regression stack in CI. | Fix both in Phase 5 docs, so the rule says to add a regression test for UI changes and points to the new skill. |

## 6. Success criteria

- A feature PR that adds a `.T###` file without a suite member fails "Run unit tests" in CI.
- `mj test regression new` creates a test that passes the parity guard with no hand edits.
- Running the Part C skill on `next` opens a PR to `next` that contains only replay-script
  files and `Configuration` references, plus a body with run counts and the drift report.
- After that PR merges, the next run uses the replay tier for the tests that have scripts.

## 7. Phase 0 findings (2026-11-12)

The spike ran in a throwaway worktree on `origin/next` (`6736c12914`) with a temporary suite,
"Harvest Spike Suite" (T001, T002). Nothing from it is committed. The evidence (both
`results.json` files, the T001 script, the T001 pull diff) was kept outside the repo.

### Times

| Step | Time |
|---|---|
| `gen-forms.sh` (no `.docker-generated/` yet) | 19 min |
| Image build | 42 min |
| `up -d` until the runner starts tests (db-setup, metadata push) | 8.5 min |
| Two tests, LLM tier | 61 s |
| `sync pull` in a one-off container | 22 s |
| Second `up` on a fresh database (no rebuild) + two tests | 8.5 min + 45 s |

### Answers

**(0) A one-off container reaches the database: yes.** `docker compose … run --rm --no-deps
--entrypoint node test-runner …` gets the `DB_*` variables from the service and the image's
`mj.config.cjs`. But `mj test scripts` prints its answer and then does not exit. It was still
running after 5 minutes, after "Connection pool is closed" errors from `AIEngine`. `sync pull`
exits normally.

**(a) The pull changes only script files and references: no.** The pull rewrote all 155 test
files:

- It adds `"RubricID": null` to every test (the database has the column; the files do not).
- It adds or refreshes the `sync` block on every record.
- It removes the trailing newline from 65 files and writes the `\u` escapes in 63 files as
  literal characters.

The entrypoint's push makes the `sync`, newline, and escape changes **before** the pull runs,
because `metadata-optional/` is mounted read-write and push writes its state back into the files.
No push flag turns this off. So after any run, the worktree has 156 dirty files (155 tests and the
suite file).

**(b) File names follow `{Name}` sanitization: yes.** `T001 - Login Smoke` becomes
`tests/regression/scripts/t001-login-smoke.json`: lowercase, whitespace becomes `-`, characters
outside `[a-z0-9.-]` are removed, repeated `-` collapse. The test gets
`"ReplayScript": "@file:regression/scripts/t001-login-smoke.json"` as the last key of
`Configuration`. The script file has no trailing newline. The parity guard passes on the result.

**(c) The next run replays: yes.** On a fresh database, the push loaded the script and T001 ran on
the `replay-with-heal` tier: 4 of 4 steps hit, 0 healed, 0 diverged, 20 s (the LLM run took 28 s).
The tier is "with heal" because the script's `AppBuildHash` is empty. The judge still runs on a
replay, so a replay is cheaper but not free.

### Other findings

1. **Not every passing test records a script.** T002 passed on both runs and recorded nothing:
   "step 5 used a coordinate click that matches no extracted element".
2. **No secrets are in the script.** Typed credentials are stored as `%authUsername%` and
   `%authPassword%`. No `.env.test` value is in the file, except the Auth0 tenant domain.
3. **The script hard-codes the Auth0 tenant origin** in 4 places (step 0 postcondition, step 1
   precondition, `UrlBefore` of steps 1–3). `TraceUrlMatches` (`ComputerUse/src/engine/trace.ts`)
   matches an absolute pattern by origin. So the script fails its guards on another tenant, and
   the tenant name goes into the public repo. A path fragment such as `/u/login` matches by
   containment on any tenant.
4. **Test files round-trip byte for byte.** `JSON.stringify(x, null, 2)`, plus lowercase
   `\uXXXX` escapes for non-ASCII characters when the file already uses escapes, plus the
   trailing newline the file had. All 155 files match exactly. So a harvester can add one key and
   change nothing else.
5. **`docker/regression/scripts/lib/db.cjs` exports `connect()`** from the `DB_*` variables. A
   script mounted into a one-off container can use it without the MJ bootstrap.

### Decision: keep `sync pull` and close its gaps

A first proposal was a separate export + apply harvester. It was dropped: the pull's
externalization works (file name, `@file:` reference, side file, replay on the next run), and the
noise has four exact causes. Fixing them in MetadataSync helps every metadata folder, not only this
suite.

| # | Gap | Where | Fix |
|---|---|---|---|
| 1 | The record writer always writes `JSON.stringify(x, null, 2)` with no trailing newline and literal non-ASCII characters. 65 test files have a trailing newline, and 63 use `\u` escapes, so every push and pull rewrites them. | `lib/json-write-helper.ts` (`WriteOrderedRecordData`) | Before it overwrites a file, the writer reads it and keeps its trailing newline and its non-ASCII escape style (finding 4 shows this is byte-stable for all 155 files). |
| 2 | Pull hashes `@file` content only when a top-level field holds `@file:` and the folder has `externalizeFields`. Push always hashes file content. A replay script is nested (`Configuration.ReplayScript`), so push and pull disagree and `lastModified` changes on every run. | `lib/RecordProcessor.ts` (`calculateSyncMetadata`) | Pull always hashes with file content, as push does. A missing file still hashes as its reference. |
| 3 | 65 test files have no `sync` block, and the checksums in the other 90 no longer match their content. | file data | One normalization in this branch: push and pull once against a throwaway database, commit the result. |
| 4 | `MJ: Tests` has a `RubricID` column that the files lack, and the merge adds it. | file data | Part of the same normalization. A future column on `MJ: Tests` adds one line per test file in the next harvest. |

Once 1–4 are in place, a push and a pull on a fresh database write the same bytes. So the
entrypoint's write-back and the pull's rewrite of unchanged files make no git diff.

### Effect on the phases

- **This branch:** fixes 1 and 2 (failing tests first) and the normalization (3 and 4).
- **Phase 3:** `TEST_NAMES` / `up --test`, `.env.test.example`, the design-doc fix, `--format`
  on `mj test scripts`, and a fix for its exit hang.
- **Phase 4:** the skill harvests with
  `mj sync pull --entity="MJ: Tests" --target-dir=metadata-optional/regression-test/tests --no-create-new`
  inside a one-off `test-runner` container, then stages only `metadata-optional/regression-test/tests`.
- **Phase 6:** expect fewer than 155 scripts (finding 1).

### Decisions made after Phase 0 (2026-11-12)

- **Keep `mj sync pull`** and fix the gaps above in MetadataSync, instead of a separate harvester.
- **Fix the recorder for the Auth0 origin.** `ComputerUse` records URLs on other origins (not the
  app's) as path fragments, so a script works on any tenant and holds no tenant name. The other
  options were a rewrite in the harvester, or keeping the URLs as recorded. This is engine code, so
  it gets its own failing tests first and lands before the first real harvest (Phase 6).
