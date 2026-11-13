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

### D29. A new test's `sync` blocks in a harvest

The Phase 5 end-to-end run showed it: a scaffolded test has no `sync` block, so the stack's first
`mj sync push` writes one into the test file and into its suite member in `.regression-suite.json`.
The harvest check then failed on the suite file ("changed outside the tests folder").

| Option | Pros | Cons |
|---|---|---|
| **a. The harvest check allows a suite file to change only in its `sync` state; the skills and the workflow stage the suite folder too** ✅ | Covers every case where a push writes sync state (a new test, an edited suite member). Small, tested change. | The harvest commit can touch `.regression-suite.json` (sync state only). |
| b. The scaffold writes a `sync` block with the checksum a push computes | The file is final from the start. | Copies MetadataSync's checksum logic into the CLI; any drift between the two rewrites the file again. Does not cover an edited suite member. |
| c. Leave it; the developer commits the sync blocks by hand | No code. | The skill stops on every new test. |

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

## MoreCheese move (plan §8, M1–M5)

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
| c. Keep M1 committed locally, unpushed, and ask the user | No guard is skipped without approval. | M1's PR waits for the user. |
| **d. Rebase M1 onto `c9ceac9976`, the `next` commit that PR #6613 starts from, which passes the gate** ✅ | No guard is skipped; the PR opens tonight. M1 touches no file that changed between the two `next` commits, so the rebase was clean. | The branch starts about a day behind `next`; GitHub still shows a correct diff, and a later merge of `next` brings the rest. |

First choice was (c). When `next` still failed hours later, (d) replaced it. After the rebase the
Open App engine (649/649) and MJ CLI (1107/1107) unit tests pass, the push hook passed, and M1 is
draft PR #6630.

### D26. M2 — how the stack installs Open Apps (made by the M2 subagent, reviewed)

| Question | Choice | Other options and why not |
|---|---|---|
| Copy MoreCheese's template user to the test user (`MJ_INSTALL_USER_EMAIL`) | **Off by default (opt-in).** | a. On, as §8.4 said: the test-runner's `mj sync push` of `test-metadata/users/.users.json` (no `primaryKey`) then inserts a second user, fails on `UQ_User_Email`, and the atomic push rolls back the tags, lists and views today's tests need. b. Key `.users.json` on the email now: M3's file, with nested rows that have no `primaryKey`; not verifiable in M2. M3 turns it on after it keys that file. |
| Which CLI runs the package step | The workspace CLI, built first in the image (turbo, concurrency 2) | The published CLI: it does not have M1's flags. Cost: the API image build is somewhat slower. |
| `GITHUB_TOKEN` in the image build | A BuildKit secret, optional, read by the script; an empty token is dropped | A build arg: it stays in the image history. A required secret: breaks builds with no token, although the repos are public. |
| A second copy of an `@memberjunction` package after the install | **Fail the build** (any workspace package, not only `core`) | Warn only: a second `core` copy breaks class registration at run time, which is much harder to trace. |
| Where `mj.config.cjs` enters the images | Before the package step, in all four images | After the build, as before: the package step writes `dynamicPackages` into it, and Explorer's prebuild reads it. |
| App migration time limit | 30 minutes by default (as `mj migrate`), still overridable | Skyway's 5-minute default: MoreCheese's seed migrations (377 MB of SQL) can pass it. |

### D27. Where M3 is built, and in parallel with what

| Option | Pros | Cons |
|---|---|---|
| **a. A subagent writes M3 on its own branch (`CB-regression-morecheese-m3`, from M2) while M2's images build and run; it uses no Docker. The branch is merged into `CB-regression-morecheese` after the live checks** ✅ | Saves about 1.5 hours. M2's build context does not change under it. One MoreCheese PR at the end (M1 merged in, M2, M3). | Some guesses (URL encoding of `?entity=`, form section names, page size) wait for the live stack and may need a second pass. |
| b. Finish M2's live checks first, then write M3 | No guesses. | About 1.5 hours longer overnight. |
| c. M3 directly on `CB-regression-morecheese` | No merge. | Edits during the M2 image build could reach some images and not others. |

### D28. M3 — retarget the suite (made by the M3 subagent, reviewed)

| Question | Choice | Other options and why not |
|---|---|---|
| How the test user record matches a user an app install made first | `primaryKey` = `@lookup:MJ: Users.Email=computeruse@bluecypress.io?create&Name=…&Type=User`. An existing user is updated; a missing one is created. Shipped metadata uses the same form. | A fixed UUID: still fails `UQ_User_Email`. Run `setup-test-user.cjs` before the push: a bigger reorder. **Gap:** the user's User Applications rows have no key, so `MJ_INSTALL_USER_EMAIL` stays off until a live check. |
| form-gen | Keep it, with no demo data (core-only CodeGen) | Remove the flow: the images would then compile against whatever each host has in its generated folders. Cost: a host with an old `.docker-generated/` must run `mj test regression gen-forms` once. |
| How seeds find app tables | Read schema and table from `__mj.Entity` by entity name | Hard-code `__mj_BizAppsCommon` etc.: breaks if an app renames its schema. |
| Which people the seeded lists hold | MoreCheese "hero" people, found by email (pinned across monthly refreshes) | The first N by ID: T109's union of 8 and intersection of 3 would depend on ID order. |
| CodeGen passes in db-setup | One | Two: the second pass existed only for AssociationDB's typed email/URL fields. |
| Names of seeded lists | Keep "VIP Members" and "Recent Sign-ups" (T109 names them); rename the rest to People/Meetings words | Rename all: breaks T109. |
| Deep-link URL form | `?entity=MJ_BizApps_Common:%20People` (as T032/T037 already do with `MJ:%20…`) | `%3A%20`: no test uses it yet. |
| Test names that still name old data (T007 "Search Members", T011 "Create Event", …) | Keep them | Rename: changes the record `Name`, which is the suite member's key and the replay-script file name. |

### D30. Second copies of MJ packages in the M2 images

The first M2 build failed at its own duplicate check: the MoreCheese install pulled about 55
registry copies (`@memberjunction/core@6.1.7`, `global@6.2.1`, many `ng-*`). App packages declare
`^6.1.2`, and a prerelease workspace version (`6.3.0-edge.0`) does not match that range.

| Option | Pros | Cons |
|---|---|---|
| **a. In the image only, before the package step, `open-apps.cjs` adds a root `pnpm.overrides` entry `workspace:*` for each of the 352 workspace `@memberjunction` packages** ✅ | Covers dependencies and peers. Proved first on a scratch workspace with pnpm 10.33.0 and the real MoreCheese package; then the form-gen image build printed "No registry copies". The repo's files do not change. | pnpm prints "missing peer" warnings for peers that MJAPI does not list (harmless). |
| b. `peerDependencyRules.allowAny` for `@memberjunction/*` | Smaller change. | Covers peers only; the `ng-*` copies come from app dependencies. |
| c. Ask the app repos to accept prereleases (`>=6.1.2-0`) | Fixes the cause. | Outside this repo; every app must release first. |

### D31. Open App packages that break the Explorer bundle

The second M2 build failed in the Explorer bundle. Probe (esbuild, one entry at a time): the
secure-messaging 2.1.0 release declares `-core` and `-actions` (server libraries with
`node:crypto`, Google Cloud Storage, Dropbox) and `-element` as client packages, so the client
bootstrap imports them. Its current default branch lists `-core` and `-actions` as server packages.

| Option | Pros | Cons |
|---|---|---|
| **a. `open-apps.json` gets an optional `disableClientPackages` list; the package step sets `Enabled: false` on those client entries (the manifest then emits them as comments). The build fails if a listed name has no client entry** ✅ | Exact; the rest of secure messaging stays. Uses the engine's own `Enabled` flag. The failure on a stale name tells us when the app fixes its manifest. | A text edit of `mj.config.cjs` inside the image (scoped to the `client` array, then checked by loading the config). |
| b. `mj app disable mj-secure-messaging` | Uses the CLI. | Turns off the whole app, server side too; MoreCheese depends on it. |
| c. Pin an older or newer secure-messaging | Fixes the cause. | The version comes from MoreCheese's dependency range; not ours to pin. |

Follow-up outside this repo: secure-messaging's release manifest should mark `-core` and
`-actions` as server packages (or `platform: "node"`).

### D32. Workspace packages that only an app package uses

`@mj-biz-apps/tasks-ng` imports `@memberjunction/ng-gantt` and `ng-kanban`. After D30 those link
to the workspace, but nothing built them, because turbo builds only MJAPI's and MJExplorer's
dependencies.

| Option | Pros | Cons |
|---|---|---|
| **a. After the install, the package step finds every workspace package that an installed registry package depends on (61 today) and runs one `turbo build` for them** ✅ | General; covers future apps. Later image builds reuse the turbo cache. | Adds build time to the package step in every image. |
| b. Add `ng-gantt` and `ng-kanban` to MJExplorer's dependencies in the image | Small. | Only these two; the next app breaks the same way. |

### D33. Sonar 0.7.0 does not compile against this MJ

The third M2+M3 image build failed in the Explorer bundle: `@mj-biz-apps/sonar-ng` 0.7.0 (the
newest release) imports `IsCompositeFilter` from `@memberjunction/ng-filter-builder`. MJ commit
`4884a4750b` (Kendo removal, 2026-09-04) removed that re-export; the function is now only in
`@memberjunction/core`. This is a real break between MJ `next` and a published Open App.

| Option | Pros | Cons |
|---|---|---|
| **a. Add `@mj-biz-apps/sonar-ng` to `disableClientPackages` (D31)** ✅ | One line; no test uses Sonar; no other app package imports `sonar-ng` (checked). The Sonar server side and its data stay. | The Sonar UI is not in the regression stack until Sonar releases a fix. |
| b. Put the re-export back in `ng-filter-builder` | Every app built against 6.1 keeps working. | A product change outside this work, and the repo rule says no cross-package re-exports. |
| c. Rewrite the import in the image with `sed` | Sonar UI stays. | A patch of a published package inside the image; hides the break. |

Follow-up outside this repo: Sonar should import `IsCompositeFilter` from `@memberjunction/core`.
Follow-up for MJ: the 6.x line removed a public export without a major version; the Open App
publish policy may want a check for that.

### D34. M4 — which new MoreCheese tests, and how they are written

| Question | Choice | Other options and why not |
|---|---|---|
| Which tests | Proposals 1–4 of the M3 research: MoreCheese Competition Entries, the People form with MoreCheese's Membership panel, a Committees meeting, an Issues record | Proposal 5 (Skip dashboards): needs `MORECHEESE_SHARED_KEY` and the template-user copy, both off (D26). |
| Where | Branch `CB-regression-morecheese-m4` from `CB-regression-morecheese`, merged back after the tests record | Directly on `CB-regression-morecheese`: that worktree feeds the running image build. |
| The skill's "ask the developer" steps | Skipped; the choices are logged here (overnight rule) | Wait for the user: M4 would not finish tonight. |
| Facts in goals and criteria | Only facts read from the live stack's database (app routes, record values) | Facts from the migrations only: the M3 guesses showed some do not match the running app. |
| How the scaffold runs | The main checkout's built CLI, run from the M4 worktree (the command writes under the current folder) | Build the CLI in the M4 worktree: a long turbo build during the image build. |

### D35. MoreCheese 1.3.2's data migration does not run on MJ 6.3

The first stack start with M2+M3 failed in `db-setup` Step 3b, 14 minutes in: MoreCheese's
`Metadata_Sync_Part5of5` migration calls `__mj.spCreateConversation` (25 calls) and
`spUpdateConversation` with `@Type`. MJ migration `V202611101900` (6.3, 2026-11-10) replaced
`Conversation.Type` with `TypeID`, so the generated procedures no longer take `@Type`. The 10
dependency apps installed. A static check of every MJ procedure call and every direct
`INSERT`/`UPDATE` on an MJ table in MoreCheese 1.3.2's migrations, against the live database,
found no other break.

| Option | Pros | Cons |
|---|---|---|
| **a. Test-only change, opt-in for each app (`"mjCompat": ["legacy-conversation-type"]` in `open-apps.json`): before the app's database step, db-setup adds an optional `@Type nvarchar(100)` parameter to both procedures; the body sets `@TypeID` from `ConversationType.Name` when only `@Type` is given** ✅ | The stack runs tonight. Proved on the live database: create with `Skip`, update to `Routine`, update without `@Type` keeps it; a second apply changes nothing. The entry names the break, so it is removed when MoreCheese ships a 6.3 build. Unit tests for the text change. | The test database's procedures differ from a real 6.3 database. It hides the break from the regression stack (the break is reported here and in the docs instead). |
| b. Keep `@Type` in MJ (a 6.3 migration that adds the optional parameter back) | Fixes it for every user who installs MoreCheese 1.3.2 on 6.3. | A product decision outside this work; CodeGen would remove a hand-added parameter on its next run. |
| c. Stop the MoreCheese move until MoreCheese releases a 6.3 build | No test-only change. | M2–M4 and Phase 6 stop tonight. |

**Finding for MJ 6.3:** together with D33, MoreCheese 1.3.2 cannot be installed on MJ 6.3 as it
is today: the data migration fails, and the Sonar UI does not compile. Either MoreCheese (and
Sonar) release builds for 6.3 before 6.3 ships, or MJ keeps the old names for one more version.

### D36. M5 — cache the set-up database as a bacpac?

Measured on the third M2+M3 start (2026-11-13): `db-setup` took about 18.5 minutes —
migrations 2.4, CodeGen 0.4, the Open Apps database step 15.0 (MoreCheese and its 10 apps), the
metadata pushes and seeds under 1. The image build took 22 minutes with the build cache, and the
155 tests take a few hours with 3 workers.

| Option | Pros | Cons |
|---|---|---|
| a. Build M5 now: export the database after `db-setup` as a bacpac, keyed by a hash of `migrations/` + `open-apps.json`; later starts import it | Saves up to 15 minutes a start when the key matches. | Export and import of a database with 3,000+ people and 377 MB of seed SQL also take minutes, so the real saving is smaller. The key changes with every migration on `next`, so the CI workflow (one run per refresh) gets almost no hits. New code for storage, invalidation and cleanup. |
| **b. Do not build M5 now; keep the numbers here and build it only if start time becomes a problem** ✅ | No new moving parts; the setup always runs the real install, which is what found D35. | Each start keeps the 15 minutes. |
| c. Cache only the MoreCheese seed data (not the whole database) | Survives MJ migrations. | Needs a data export format per app; much larger work. |

### D37. Committees 1.5.0's Meetings view is wider than its code

In the third full run, 7 tests failed (T025, T027, T028, T029, T030, T041, T042), all on a
`Committees: Meetings` record: every Meetings read failed with `Cannot query field
"MeetingDurationMinutes" on type "mjBizAppsCommitteesMeeting_"`. Committees 1.5.0's `vwMeetings`
has ten computed columns that none of its published packages define. Since MJ `d90a3ea456`
(2026-08-25, 6.2), the Open App install refreshes the app schema's metadata after its migrations,
which adds those columns as virtual fields; the browser asks for every field, and MJAPI's GraphQL
type (from the app's package) rejects them. A scan of all 669 virtual fields of app entities
against every installed app package found no other entity with this gap.

| Option | Pros | Cons |
|---|---|---|
| **a. A second opt-in `mjCompat` change, `drop-uncoded-view-fields`: after the apps' database step, delete each virtual field of an app entity whose name appears in no installed app package, and print the list** ✅ | The 7 tests test MJ's form features again (the Meetings form behaves as on MJ 6.1). Generic: covers the next app with the same gap, and prints what it removed. Dry run in a rolled-back transaction found exactly the 10 fields in 2.4 s. | Hides the break from the stack (reported here instead). A name check is coarse: a field whose name appears anywhere in app code stays (safe direction). |
| b. Retarget the 7 tests to People or Products | No change to the database. | Rewrites 7 tests and loses Meetings' text, dropdown and date fields that T027 needs. The Meetings form stays broken for every other test that opens it. |
| c. Keep the 7 failures as known | Shows the break. | The suite's form-feature coverage is gone until Committees republishes. |

**Finding for MJ 6.2+:** with MoreCheese 1.3.2 installed, the Committees Meetings grid and form
fail for every user. Committees should release code generated from its current view; MJ could
also warn at install time when a refreshed view is wider than the app's code (commit `1ce1b80e26`
already warns about this in CodeGen).

**Revised by D39 and D42:** the name check missed two of the twelve fields, and deleting the fields alone breaks a Meeting save.

### D38. Where the replay scripts of the MoreCheese run go

The Phase 6 harvest of run `run-20261113T083613Z` (139/155 passed) pulled 73 new scripts and
no pending ones; the harvest check and `check-regression-suite` passed.

| Option | Pros | Cons |
|---|---|---|
| **a. One separate commit on `CB-regression-morecheese` (`76b42e17fd`)** ✅ | The scripts were recorded on the MoreCheese stack, so they ship with it. The rerun of the 20 tests builds on them. The commit can still move to its own branch later. | The MoreCheese PR grows by 73 JSON files. |
| b. A stacked branch `CB-regression-replay-scripts-morecheese` | Separate review of the generated files. | One more branch to rebase after each change below it; the rerun in the same worktree would push records without the script references. |
| c. Do not commit; let the on-demand workflow record them after the merge | No generated files in a feature PR. | Throws away a 44-minute run; the workflow can only run once the MoreCheese stack is on `next`. |

**Finding: 66 of the 139 passed tests recorded no script.** The engine refused to record them
(the test-run log says why): 57 used a click at a screen position that matched no element the
recorder had extracted, 8 typed without an element selector, 1 used a drag. So a full run gives
scripts for about half the suite. The recorder's element extraction (`MJComputerUse`) is the
place to improve; it is outside this work.

### D39. D37's check missed two Meetings fields

The rerun of the 20 tests (`run-20261113T092410Z`) still failed the 7 Meetings tests and T158,
now with `Cannot query field "AgendaItemCount"`. Two more `vwMeetings` columns
(`AgendaItemCount`, `ExpectedAttendees`) are not in the GraphQL type, but both names appear in
Committees' `CommitteeHealthService`, so the name check (D37 a) kept them.

| Option | Pros | Cons |
|---|---|---|
| **a. Compare with the GraphQL type itself: the compiled server code names every type field as `<ClassName>_.prototype, "<Field>"`; drop a virtual field of an app entity only when its entity's type exists and does not have the field (`a2738aedc5`)** ✅ | Exact. On the live stack, all 215 app entities have a type, every stored field is in its type, and exactly the 2 missed fields are not. Entities with no type found are left alone. | Depends on how `tsc` compiles decorators and on CodeGen's `<ClassName>_` type name; if either changes, the check finds no types and drops nothing (safe direction). |
| b. Ask MJAPI for its GraphQL schema | The real schema. | MJAPI is not running during `db-setup`. |
| c. Add the two names to a fixed list | Smallest change. | Breaks again with the next app release. |

### D40. T118 (File Browser) fails on MoreCheese data

T118 failed twice. MoreCheese adds a file storage account, "More Cheese Dropbox", whose
credential "Dropbox OAuth" is inactive and needs `MORECHEESE_SHARED_KEY` to decrypt, which the
stack does not set (D26). The File Browser then fails to list anything (`Credential 'Dropbox OAuth' … Reload the credential engine`).

| Option | Pros | Cons |
|---|---|---|
| **a. Keep T118 as it is; report the finding** ✅ | The test found a real MJ problem: one unreadable account stops the whole File Browser. | T118 fails until MJ or MoreCheese changes. |
| b. Delete storage accounts with an inactive credential in the stack seed | T118 passes. | Hides the MJ problem; app data changed only to pass a test. |
| c. Change T118's criteria to accept the error | T118 passes. | The test then accepts a broken screen. |
| d. Set `MORECHEESE_SHARED_KEY` in the stack | T118 lists the real account. | One more secret; the test then needs Dropbox on the network. |

**Finding:** the File Browser should show the other accounts and an error for the broken one.
MoreCheese could leave the account out, or inactive, when the key is not set.

### D41. The private integration database

`MJ_6_3_CLEAN_regmorecheese` (local `mj-sqlserver`) holds the clean-room build of
`CB-regression-morecheese-m4`; the M4 worktree's `.env` points at it.

| Option | Pros | Cons |
|---|---|---|
| **a. Keep it, and the M4 worktree, while the MoreCheese PR is in review** ✅ | The integration tier can run again in minutes. | Uses disk; a stale database later looks authoritative, so drop it after the merge. |
| b. Drop it now | No leftover. | A new clean build takes about 30 minutes. |

**Integration tier on the clean build (with MJAPI):** 143/146 passed, 1 skipped (IT52, needs
`RUN_SEARCH_TESTS`), 2 failed. IT01 `server-cache.S34` also fails on the base commit
`c9ceac9976`, so it is older than this work. IT74 `task-graph-execution.TX13` failed in 2 of 5
runs (it passed alone 2 times of 3); it is a timing problem, and this branch changes no task-graph
code.

### D42. Saving a Meeting failed after D39

With D39, 6 of the 7 Meetings tests passed, but T027 (edit and save) failed with `Field
MeetingDurationMinutes does not exist on Committees: Meetings`. `spUpdateMeeting` ends with
`SELECT * FROM vwMeetings`, so the save reads back the 12 columns that no longer have fields, and
`BaseEntity.SetMany` refuses an unknown column. On a stock MJ 6.2+ install with Committees 1.5.0,
Meetings reads fail (the fields exist but the GraphQL type does not have them); with D39 alone,
saves fail. Committees' own code computes `AgendaItemCount` and `ExpectedAttendees` itself and reads
Meetings with an explicit field list, so no code reads the 12 view columns.

| Option | Pros | Cons |
|---|---|---|
| **a. After deleting the fields, narrow the entity's base view to the columns that still have fields: rename it to `<view>__Full` and create `<view>` as `SELECT <those columns> FROM <view>__Full`, with the same grants (`1169d60c46`)** ✅ | Reads and saves both work: T027 passed all four checkpoints. Generic, idempotent, unit-tested SQL builder. | The test database's view differs from the app's. Verified on the live stack, not yet in a fresh `db-setup` (same function, called from the same step). |
| b. Keep T027 failing as a known break | No more stack-only change. | The suite loses its only edit-and-save test on a full record. |
| c. Move T027 to `MJ_BizApps_Tasks: Tasks` | No view change. | Task names repeat (six "Circulate the meeting summary…" rows), so "reopen the same record" is unreliable; needs a new live check of another generated form. |
| d. Keep the fields and deny read on them with field-level security | The client would not ask for them. | Changes security metadata to work around a schema bug; much larger. |

### D43. T106 (Knowledge Hub Analytics) cannot reach "Frequently Paired Tags"

T106 failed four times. With MoreCheese's tags, the Tags section shows a long "Top 20 Tags" table,
and "Frequently Paired Tags" is below the screen. The agent scrolled five times (mouse wheel and
PageDown) and the page did not move. `.main-content` has `overflow-y: auto` but no bounded
height inside `<mj-left-nav-content>`, so taller content is likely cut off with no scroll.

| Option | Pros | Cons |
|---|---|---|
| **a. Keep T106 as it is; add a goal hint that the section is below the table (`f82952e99b`); report the likely layout bug** ✅ | The test points at a real problem; the hint helps once the page scrolls. | T106 fails until the layout is fixed. Not checked by hand: the stack signs in through hosted Auth0, which I may not use in a browser. |
| b. Drop the co-occurrence checkpoint | T106 passes. | Hides the problem. |

### D44. A rerun on a running stack removes the scripts of the run before it

The test-runner pushes the test files at start. A test's replay script lives in its
`Configuration` field, so the push replaces a script that the previous run recorded but no harvest
pulled yet. My reruns lost the scripts of 13 passed tests this way (for example T028: recorded at
09:40, overwritten at 09:46).

| Option | Pros | Cons |
|---|---|---|
| **a. Harvest after every run; rerun the 18 passed tests once more and harvest right after** ✅ | Recovers the scripts tonight with no code change. Result: 15/18 passed, 9 new scripts (82 in all). | One more 20-minute run. |
| b. Make the push keep a recorded `ReplayScript` | Fixes the trap for everyone. | Changes the push/pull design (§6.2 of the replay design); outside this work. |

**Finding:** the skills run one run per stack start, so they do not hit this, but anyone who
reruns tests on a running stack does. The docs should say "harvest before you rerun".
