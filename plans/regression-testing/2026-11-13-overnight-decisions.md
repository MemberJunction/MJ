# Regression automation — decisions made during the overnight run (2026-11-12/13)

Each entry lists the options, their pros and cons, and the choice. The plan is
[2026-11-12-regression-automation-plan.md](2026-11-12-regression-automation-plan.md).

## Phase 4 — replay-script PR skill

### D1. Where the skill's helper code lives

| Option | Pros | Cons |
|---|---|---|
| **a. In the skill folder (`.claude/skills/regression-replay-pr/scripts/`)** ✅ | Runs from the session's checkout, so it works on any target branch that has the harvest support. Changes to the flow do not need a target-branch change. | Not in a published package; Phase 7 CI must check out this folder. |
| b. In the target branch (`.github/scripts/` or an MJCLI command) | One copy of the logic per branch, versioned with the code it checks. | An old target branch would run old harvest logic; a fix would need to land in every branch first. |

**Why a:** the plan (Part C) already chose it; the run of a branch should not depend on that branch's copy of the harvest tooling.

### D2. Language of the helpers

| Option | Pros | Cons |
|---|---|---|
| **a. Bash for Docker and git steps, Node for the harvest check and PR body** ✅ | Each part uses the tool that fits. The check logic is pure and unit-tested. | Two languages. |
| b. All Node | One language, all testable. | Long-running Docker steps and log redirects are clumsier in Node. |
| c. All bash | One language. | JSON diffing and PR-body building in bash are fragile and hard to test. |

### D3. Where the helper tests run

| Option | Pros | Cons |
|---|---|---|
| **a. In the existing guard-script vitest suite (`.github/scripts/vitest.config.mts` includes `.claude/skills/*/scripts/__tests__`)** ✅ | Runs in CI ("Guard-script unit tests") with no new job. | The guard suite now also covers skill code. |
| b. A separate vitest config for skills | Clear separation. | Needs a new CI step or it never runs in CI. |
| c. No unit tests (only the Docker run) | No setup. | The check logic is the safety net of the PR; a bug there commits noise. |

The CI changed-path filter in `test.yml` now includes `.claude/skills/*/scripts/**`.

### D4. `AUTH0_CLIENT_SECRET`

| Option | Pros | Cons |
|---|---|---|
| **a. Optional (preflight does not require it; docs say so)** ✅ | Matches the code: MJServer reads only the domain and client ID (JWKS). Phase 0 ran with it empty. | — |
| b. Keep it required | Matches the old docs. | The preflight fails on a working env file. |

### D5. How strict the harvest check is

| Option | Pros | Cons |
|---|---|---|
| **a. Any change outside the test folder, a format-only change, or a changed test field blocks the PR** ✅ | A push + pull of unchanged metadata must be byte-stable (Phase 0 fixes), so any other change is a bug worth seeing. The PR stays reviewable. | A new MetadataSync behavior blocks harvests until fixed. |
| b. Revert the noise automatically | Harvests never block. | Hides bugs; reverting files in the worktree is close to the forbidden `git restore`. |
| c. Warn only | Never blocks. | Noise reaches the PR. |

### D6. Script files that no test references

| Option | Pros | Cons |
|---|---|---|
| **a. `harvest.sh pull` deletes them and the PR lists them** ✅ | A promoted or discarded pending script leaves a stale `.pending.json`; deleting keeps the parity guard green. | A deletion the user did not see before the PR (it is listed in the body). |
| b. Report only | Nothing deleted silently. | The parity guard fails on the orphan, so the PR cannot merge without a manual fix. |

### D7. Worktree and branch names

| Option | Pros | Cons |
|---|---|---|
| **a. `<prefix>-regression-replay-scripts-<base>-<yyyymmdd>`; stop when it exists** ✅ | Predictable; follows the `CB-...` rule; no silent second branch. | A second run on the same day needs the first worktree removed. |
| b. Add a counter suffix | Never blocks. | Easy to leave several stale branches. |

### D8. Run results after cleanup

| Option | Pros | Cons |
|---|---|---|
| **a. `cleanup.sh` copies the run folders (and the skill's log) into the main checkout's `docker/regression/test-results/`, then removes the worktree** ✅ | `mj test regression compare` can use them; the worktree does not pile up. | Uses disk in the main checkout (gitignored). |
| b. Keep the worktree | Nothing copied. | Worktrees with built forms pile up. |
| c. Delete with the worktree | Simple. | Loses the reports and screenshots. |

### D9. Root `CLAUDE.md` budget (the file was 7 bytes under its 18,000-byte limit)

| Option | Pros | Cons |
|---|---|---|
| **a. Shorten the other skill descriptions on the same line** ✅ | Every skill stays routed; no budget change. | Slightly terser descriptions. |
| b. Leave the skill out of the router | No edit to other lines. | Breaks the routing rule. |
| c. Raise the budget | Room to grow. | The budget exists to stop growth. |

### D10. Testing the skill text

Two Opus subagents answered the same five scenarios, one with the skill and one without. The
baseline would have hand-edited the suite file to pass the check and staged only the script
files (losing the `ReplayScript` references). The skill version got all five right and found five
gaps, which were fixed: the missing `test-results/` folder in a new worktree, keeping the stack
up after a failed harvest, the unattended rule at preflight, the `<run>` name, and a clear rule
that an outside change is a bug.

### D25. Replay scripts that hold the Auth0 tenant

The Phase 4 run on a pre-fix build recorded T001 and T002 with the Auth0 tenant URL 10 times, and
the harvest check let both through.

| Option | Pros | Cons |
|---|---|---|
| **a. The harvest check fails a new or changed script with an absolute URL on a host other than `localhost`, `127.0.0.1` or `[::1]`** ✅ | Catches a script from an old build, a new identity provider, or any other host before it reaches git. Tested on the real run: both scripts are flagged. | A test that must visit an outside site would need an allow list. None does today. |
| b. Look for `auth0.com` only | Narrow; no false alarm. | Misses other providers and other tenants. |
| c. No check; trust the recorder fix | Nothing to keep. | A worktree on an old base records the tenant again, silently. |

## Auth0 recorder fix (replay scripts with identity-provider URLs)

### D12. How to keep the Auth0 tenant out of a recorded script

A login run passes through `https://<tenant>.auth0.com/u/login?...`. The recorder stored these URLs
absolute, so a script recorded on one tenant failed its URL guards on any other tenant, and the
tenant name went into committed metadata.

| Option | Pros | Cons |
|---|---|---|
| **a. Store URLs on another origin than the app's as a path fragment (`/u/login`)** ✅ | Uses the existing rule that a non-absolute pattern matches by containment, so replay needs no change. Works for every identity provider. | A path fragment is a weaker guard than a full URL (any origin with that path matches). |
| b. Replace the tenant with a variable (`{{AUTH0_DOMAIN}}`) | Exact guard. | Auth0-specific; needs variable resolution in URL guards; the recorder must know the env value. |
| c. Drop URL guards on foreign origins | Simplest. | Loses the check that the login page loaded. |

### D13. Which origin is "the app's"

| Option | Pros | Cons |
|---|---|---|
| **a. `RecordTrace` takes `appOrigin`; the test driver passes the test's start URL; the default is the first step's origin** ✅ | The driver knows the real app URL. The default keeps old callers working. | A caller that starts on the IdP page and passes no origin would treat the IdP as the app. |
| b. Always the first step's origin | No new option. | A test whose first page is the login page (a fresh browser) records the IdP as the app. |
| c. A configured list of IdP hosts | Exact. | A new config to keep current; breaks on a new provider. |

### D14. URLs of `Navigate` actions

| Option | Pros | Cons |
|---|---|---|
| **a. Leave them absolute** ✅ | A navigate needs a full URL to go to. Recorded runs navigate only to app URLs. | A navigate to an IdP URL would still hold the tenant (not seen in any recorded test). |
| b. Make them relative too | No tenant anywhere. | A relative navigate to another origin cannot work. |

## Phase 5 — authoring skill

### D15. How the authoring skill records a new test's first replay script

| Option | Pros | Cons |
|---|---|---|
| **a. Optional step on the developer's own checkout: commit the test, then the replay-pr helpers (`run-stack.sh`, `harvest.sh pull`, `teardown.sh`)** ✅ | Proves the test passes in the real app. The script lands on the feature branch with the test. Reuses the tested helpers and their harvest check. | 30–60 min and one LLM run. Needs a clean working tree (the harvest check flags any other change). |
| b. Run the replay-pr skill with the feature branch as its base (a PR into the feature branch) | No new flow. | A second branch and PR for one file; heavy for a developer. |
| c. Never record; the next suite harvest records it | Cheapest. | The developer never sees the test pass before merge. |

The default is (c) when the developer declines (a).

### D16. Finding the tests related to a branch

| Option | Pros | Cons |
|---|---|---|
| **a. A helper (`related-tests.mjs`) that turns changed UI paths into area words and ranks tests by tag (3), name (2) and goal/description (1) matches** ✅ | Same result every time; fast; unit-tested. Leaves out tests, docs and CodeGen output (`/generated/`). | Word matching misses tests that use other words; `--keywords` covers that. |
| b. Let the agent grep the test files | No code. | Inconsistent; the goal text is escaped JSON, so greps are noisy. |
| c. Map packages to Explorer apps and routes | Precise. | 128 of 155 tests start at the root URL, so a route says little; a mapping table goes stale. |

### D17. Duplicate record IDs in the regression suite

The baseline subagent found that `check-regression-suite.mjs` did not catch a hand-copied test file
(it keeps the other test's `primaryKey.ID`, so a push overwrites that test).

| Option | Pros | Cons |
|---|---|---|
| **a. The parity guard reports duplicate `primaryKey.ID` values (tests and suite members, compared without case)** ✅ | Catches the copy in CI and in the pre-push hook. | — |
| b. Only warn in the skill | No code. | A copy made without the skill still passes CI. |

### D18. Stale docs found during Phase 5

`AGENTS.md` pointed to the removed integration-test scripts and said the regression stack runs on
every release; `REGRESSION_TESTING.md` said to hand-create test files. All three now match the
code: the integration suite runs through `mj test`, the regression stack is a local tool, and new
tests come from `mj test regression new` (with a pointer to the skill).

### D21. Root `CLAUDE.md` skills line for the new skill

The file had 7 bytes left. Shortened four descriptions on the same line to add
`author-regression-test` (17,993 of 18,000 bytes). Same reasoning as D9.

## Phase 7 — the GitHub workflow

### D22. When the workflow runs

| Option | Pros | Cons |
|---|---|---|
| **a. `workflow_dispatch`, plus a nightly schedule that runs only when the repository variable `REGRESSION_NIGHTLY` is `true`** ✅ | Nothing runs (or costs LLM tokens) until someone opts in. Turning nightly on is one variable, no code change. | Two triggers to explain. |
| b. Nightly always | Scripts stay fresh. | A large runner and a full LLM run every night from the day it merges, before secrets exist (it would fail nightly). |
| c. `workflow_dispatch` only | Simplest. | The plan asked for a nightly option. |

### D23. Secrets the workflow needs

| Option | Pros | Cons |
|---|---|---|
| **a. Auth0, the test user and the AI keys come from secrets; the SA password and the encryption key are generated per run** ✅ | Fewer secrets to manage; the database is thrown away after the run. | — |
| b. All values from secrets | Same values as a developer's `.env.test`. | Two more secrets with no benefit. |

### D24. The bot branch and the PR

| Option | Pros | Cons |
|---|---|---|
| **a. `chore/regression-replay-scripts-<base>`, rebuilt from the base on every run (force push), one open PR updated by later runs; GitHub App token** ✅ | Same pattern as `bizapps-guide.yml`; required checks run on a PR the App opens. | The `CB-` prefix rule is for branches a person creates; a bot branch follows the repo's `chore/` pattern. |
| b. A dated branch per run | History of every run. | PRs pile up. |

The workflow reuses the skill's helpers (D1), so the skill and CI follow the same harvest check.
**Not verified:** the workflow was not run (it needs the secrets and a large runner); its YAML
parses and every `run:` block passes `bash -n`.

## Branches and PRs

### D11. Where M1 (the install split) goes

| Option | Pros | Cons |
|---|---|---|
| **a. Its own branch from `next` (`CB-open-app-install-split`) and its own PR** ✅ | Open App engine work, reviewable alone; also helps the production `docker/MJAPI` image. | M2 needs it, so the MoreCheese branch merges it in until it lands. |
| b. Inside PR #6613 | One PR. | Mixes engine work into the regression PR. |
| c. Inside the MoreCheese PR | Keeps M1–M5 together. | The engine change waits on the long M3 work. |

### D19. M1 — how `mj app install` splits (made by the M1 subagent, reviewed)

| Question | Choice | Other option and why not |
|---|---|---|
| Context for the package step | A separate `PackageStepContext` type (no database members) that `OrchestratorContext` extends, and a new `InstallAppPackages` function | Optional database members on one context: about 100 null checks, and the compiler could no longer prove the package step never touches the database |
| Config for `--packages-only` | `GetOptionalConfig()`, which needs no database settings | `GetValidatedConfig()` throws in a Docker build with no database |
| npm registry check with `--database-only` | Skipped (the packages are already in the image) | Keep it: fails at container start when the registry needs a build-time token |
| A failed package install with `--packages-only` | An error | The full install only warns; in a Docker build that makes a broken image silently |
| Hooks | All run in the database step, none in the package step | Run the shell hook in the package step: it may need the database |
| Dependencies | The package step installs every dependency's packages; the database step uses the normal installed-app check | — |

Known limit: `--database-only` fails for an app that is already installed. The regression stack
starts from an empty database on every `up`, so M2 runs it once per database and is not affected.

### D20. Pushing M1 when the push gate fails on `next`

The pre-push hook blocks `CB-open-app-install-split`: `check:standards` has one error, a naming
violation (`focusEditableSegment` in `markdown-artifact-viewer.component.ts`) that is on `next` and
that the branch does not touch.

| Option | Pros | Cons |
|---|---|---|
| a. Push with `MJ_SKIP_PUSH_GUARDS=1` | M1's PR opens tonight. | The guard skip was refused in this session; it needs the user's OK. |
| b. A separate small PR to `next` that renames the method (with a deprecated stub) | What the hook asks for. | Unrelated to this work; every branch from `next` stays blocked until it merges. |
| **c. Keep M1 committed locally, unpushed, and ask the user** ✅ | No guard is skipped without approval. | M1's PR waits for the user. |

