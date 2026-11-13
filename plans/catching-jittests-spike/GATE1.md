# Gate 1

Design: [`catching-jittests-design.md`](../catching-jittests-design.md) §14.1. Corpus: [`corpus/gate1.json`](../../packages/TestingFramework/jit-catching/corpus/gate1.json) (45 bug pairs, 45 clean PRs; candidates and selection in `corpus/gate1.candidates.md`).

## Smoke (task 2.16, 2026-11-10)

Corpus `corpus/smoke.json`: bug pairs #4253 and #5897, clean PRs #3484 and #3519 (the first Tuning entries of each set). Generator `claude-haiku-5-5`, default analyzer and judges, `--max-usd 5`, run locally on a Mac with Docker Desktop. Ledger `smoke-Tuning-Both-claude-haiku-5-5`.

| PR | Set | Attempts | Result | Tests | Weak catches | Reported | Match | Cost (USD) | Wall time |
|---|---|---|---|---|---|---|---|---|---|
| #4253 | Bug | 1 | Assessed | 12 | 0 | 0 | NoCatch | 0.09 | 16.6 min |
| #5897 | Bug | 1 | Assessed | 4 | 1 (Low) | 0 | NotMatched | 0.15 | 11.2 min |
| #3519 | Clean | 2 | Assessed | 13 | 5 (Low) | 0 | — | 0.19 | 35.0 min |
| #3484 | Clean | 4 | Assessed | 8 | 0 | 0 | — | 0.20 (0.06 on the final attempt) | 43.4 min |

Clean PRs #918 and #922 from the first corpus failed before any spend (no `pnpm-lock.yaml` at base) and were replaced; they stay in the ledger as Failed with 0 USD.

What the smoke found and fixed (each with a failing test first, all on `CB-jit-catching-design`):

1. **Pre-pnpm bases cannot run.** The repository switched to pnpm with PR #3500 on 2026-08-05. Every PR merged before has no lockfile at its base. The clean set was re-mined over 2026-08-05..2026-09-15 and the bug set keeps only pnpm-era pairs; the spec's 6-month clean seasoning became "after the switch and at least 8 weeks before the backtest".
2. **No passwd entry for the sandbox user.** `oclif manifest` calls `os.userInfo()`, which threw ENOENT for the host uid. The sandbox now mounts generated passwd and group files read-only.
3. **Recursive `fs.cpSync` fails on a Docker Desktop bind mount** (EACCES; the same copy works on the container's own filesystem). The CLI's build does this, so `Sandbox.BuildExclude` (default `['@memberjunction/cli']`) leaves it out of the turbo closure. Five corpus PRs touch CLI-dependent packages.
4. **OOM-killed head build.** Turbo's default ten parallel compilers exceeded the 6 GB cap; the build now runs `--concurrency=<Sandbox.Cpus>`.
5. **`--retry-failed` re-queued de-selected entries** and tripped the three-failures stop; it now re-queues only entries the corpus still selects.
6. **Report counted de-selected entries** in the run and failed counts; the set counts now cover only corpus PRs.

Unexplained: one `install failed on Base` after the 30-minute sandbox install timeout on an attempt of #3484 (the same base had installed in minutes on the attempt before); a bind-mount I/O probe right after was fast. One `report` invocation crashed with an uncaught exception and succeeded on the immediate rerun.

Cost per PR with Haiku: 0.16 USD over the run PRs; the Sonnet analyzer is about 0.065 USD of it, the Haiku generator 0.02–0.03, the rest is judges on weak catches. Wall time 11–35 minutes per PR, serial. Disk after `clean --all-finished`: 7.7 MB (the finished runs keep only their JSON records; worktrees and the pnpm store go at run end).

### Report (`jit-catch report`, 2026-11-11)

Model `claude-haiku-5-5`.

Ledgers: smoke-Tuning-Both-claude-haiku-5-5

#### Bug set

- PRs: 2; run 2; failed 0; not run 0
- Caught (reported and matched, of run PRs with a match result): 0/2 = 0.0% (95% CI 0.0%–65.8%)
- Gate caught (reported and matched, of every curated bug PR): 0/2 = 0.0% (95% CI 0.0%–65.8%)
- gate inputs complete
- Any weak catch matched: 0; not matched: 1; no catch: 1; fix did not apply: 0

#### Clean set

- PRs: 2; run 2; failed 0; not run 0
- With a reported catch: 0; labeled 0; pending 0
- False alarms (Intended or TestFault): 0/2 = 0.0% (95% CI 0.0%–65.8%)
- Real bugs found: 0

#### Cost

- Total, every attempt: $0.63; current runs recorded $0.47, at table prices $0.46
- claude-haiku-5-5: recorded $0.12; at table prices $0.11
- claude-opus-5-5: recorded $0.12; at table prices $0.12
- claude-sonnet-5-5: recorded $0.18; at table prices $0.18
- gemini-4-argon: recorded $0.04; at table prices $0.04
- gpt-4.1-mini: recorded $0.01; at table prices $0.01
- gpt-5.1: recorded $0.02; at table prices $0.02
- Per run PR: $0.16; per matched bug PR: n/a

#### Session end reasons

- success: 14

#### Drop rules

- none

#### Judge calibration

- claude-opus-5-5: agreement withheld (n=1 < 20); High on Intended/TestFault 0; Low on bugs 0
- gemini-4-argon: agreement withheld (n=1 < 20); High on Intended/TestFault 0; Low on bugs 0
- gpt-5.1: agreement withheld (n=1 < 20); High on Intended/TestFault 0; Low on bugs 0
- TPProb on Bug: n=0, mean n/a
- TPProb on Intended: n=0, mean n/a
- TPProb on TestFault: n=1, mean 0.12
- Tests passing both revisions with no coverage measured: 0


## Tuning (task 2.17, 2026-11-11 to 2026-11-12)

Corpus `corpus/gate1.json`, slice Tuning: 30 bug pairs and 30 clean PRs. Stage A ran `claude-sonnet-5-5` instead of Haiku (user decision after the smoke run: the generator is a small share of the cost, wall time is the scarce resource, and Haiku reported nothing on the smoke pairs). The user then asked for the same bug set with `gemini-3.8-flash` for comparison. Both runs executed locally, serial per ledger, the two ledgers in parallel.

| Ledger | Model | Set | Cap (USD) | Spent (USD) | Assessed | Failed | Not run |
|---|---|---|---|---|---|---|---|
| `gate1-Tuning-Both-claude-sonnet-5-5` | `claude-sonnet-5-5` | Both | 45 | 37.42 | 28 bug, 15 clean | 2 | 15 clean (user: stop at half the clean set) |
| `gate1-Tuning-Bug-gemini-3_8-flash` | `gemini-3.8-flash` | Bug | 30 | 30.99 | 20 bug | 2 | 8 bug (cap reached) |

Settings: Sonnet `{ "GeneratorModel": "claude-sonnet-5-5" }`; Gemini `{ "GeneratorModel": "gemini-3.8-flash", "Limits": { "TurnsPerSession": 60 } }` (Gemini issues one tool call per turn, so the default 30 turns ended five of six sessions on the first PR with `error_max_turns`).

### Result

Neither model passes gate 1 on the tuning slice. Sonnet caught 0 of 30 curated bugs; Gemini caught 1 of 30 (#3831). The clean set has 4 PRs with a reported catch out of 15 run, labels pending (task 2.18); if all four are false alarms the rate is 26.7%, above the 10% bar.

The bug set is not short of weak catches. Sonnet produced a test that fails on head and passes on base for 19 of 28 bug PRs, and for 3 of them (#3735, #6227, #6027) the test also passes once the fix PR is applied, so it caught the curated bug. None of those three was reported: the judges ranked them below the reporting bar. The five reported catches on the bug set (#3602 ×2 High, #4317 ×3 Medium) do not match the fix PR; they describe other behavior changes in the same PR (for #3602, the removal of the Reports tab routing from `shell.component.ts`; for #4317, the re-entrancy guards on `Dirty`/`Validate` and the dropped empty `primaryKey`). Whether those are real bugs is unlabeled; the gate counts only matches. The reporting threshold and the judge prompts are therefore the first tuning levers (task 2.19), ahead of the generator model.

### Bug set per PR

Columns: tests produced / weak catches / reported catches (judge median severity of each reported catch); match result of the weak catches against the fix PR ("fix merge" = the fix did not apply or prepare on the bug head, so the match ran on the fix PR's merge commit); cost in USD over every attempt; wall time of the final attempt in minutes.

| PR | Sonnet: tests / weak / reported | Match | USD | min | Gemini: tests / weak / reported | Match | USD | min |
|---|---|---|---|---|---|---|---|---|
| #4253 | 15 / 4 / 0 | PrepareFailed (fix merge) | 1.56 | 31 | 18 / 16 / 1 (High) | PrepareFailed (fix merge) | 2.47 | 34 |
| #5897 | 16 / 8 / 0 | NotMatched | 1.62 | 19 | 9 / 0 / 0 | NoCatch | 1.59 | 31 |
| #3831 | 7 / 0 / 0 | NoCatch | 0.43 | 22 | 10 / 3 / 2 (High/High) | **Matched** | 0.93 | 29 |
| #5906 | 5 / 1 / 0 | NotMatched | 0.42 | 16 | 11 / 2 / 0 | NotMatched | 1.22 | 31 |
| #4245 | 5 / 5 / 0 | NotMatched | 0.29 | 17 | 11 / 11 / 0 | NotMatched | 0.68 | 30 |
| #4418 | 3 / 0 / 0 | NoCatch | 0.49 | 24 | 5 / 2 / 0 | NotMatched (fix merge) | 0.90 | 35 |
| #3748 | Failed (base lockfile) | — | 0.00 | — | Failed (base lockfile) | — | 0.00 | — |
| #6069 | 5 / 2 / 0 | NotMatched | 0.71 | 20 | 11 / 5 / 0 | NotMatched | 1.51 | 33 |
| #5040 | 12 / 1 / 0 | NotMatched | 0.74 | 13 | 12 / 8 / 0 | NotMatched | 1.85 | 20 |
| #5063 | 9 / 2 / 0 | NotMatched | 0.64 | 12 | 9 / 5 / 0 | NotMatched | 1.51 | 21 |
| #3735 | 13 / 4 / 0 | Matched (not reported) | 1.70 | 29 | 6 / 2 / 0 | Matched (not reported) | 2.42 | 41 |
| #4065 | 5 / 2 / 0 | NoCatch | 0.28 | 15 | 4 / 0 / 0 | NoCatch | 0.40 | 22 |
| #6227 | 7 / 1 / 0 | Matched (not reported) | 0.90 | 19 | 1 / 0 / 0 | NoCatch | 1.33 | 28 |
| #4450 | 7 / 3 / 0 | NotMatched (fix merge) | 0.99 | 17 | 0 / 0 / 0 | NoCatch | 1.55 | 14 |
| #4828 | 5 / 0 / 0 | NoCatch | 1.57 | 20 | 5 / 0 / 0 | NoCatch | 0.45 | 20 |
| #4572 | Failed (head lockfile) | — | 1.01 | — | Failed (head lockfile) | — | 1.81 | — |
| #4290 | 8 / 0 / 0 | NoCatch | 0.54 | 21 | 6 / 0 / 0 | NoCatch | 1.09 | 19 |
| #3602 | 7 / 3 / 2 (High/High) | NotMatched (fix merge) | 0.80 | 32 | 10 / 5 / 0 | NotMatched (fix merge) | 1.28 | 32 |
| #5052 | 4 / 2 / 0 | NotMatched | 0.51 | 16 | 11 / 5 / 0 | NotMatched | 1.52 | 25 |
| #4317 | 21 / 9 / 3 (Medium ×3) | NotMatched (fix merge) | 2.65 | 26 | 11 / 6 / 3 (High/Medium/Medium) | NotMatched (fix merge) | 3.83 | 33 |
| #4451 | 3 / 0 / 0 | NoCatch | 0.38 | 20 | 7 / 7 / 0 | NotMatched | 1.58 | 22 |
| #3585 | 7 / 6 / 0 | NotMatched (fix merge) | 1.14 | 17 | 2 / 0 / 0 | NoCatch | 1.07 | 20 |
| #3644 | 8 / 2 / 0 | NotMatched (fix merge) | 0.74 | 15 | not run | — | — | — |
| #4512 | 9 / 5 / 0 | NotMatched | 1.00 | 12 | not run | — | — | — |
| #4814 | 8 / 0 / 0 | NoCatch | 0.56 | 13 | not run | — | — | — |
| #3412 | 6 / 1 / 0 | NotMatched | 0.69 | 25 | not run | — | — | — |
| #6027 | 8 / 2 / 0 | Matched (not reported) | 0.56 | 14 | not run | — | — | — |
| #5513 | 8 / 7 / 0 | NotMatched | 0.62 | 13 | not run | — | — | — |
| #5729 | 13 / 0 / 0 | NoCatch | 1.01 | 18 | not run | — | — | — |
| #3354 | 8 / 3 / 0 | NotMatched | 2.05 | 23 | not run | — | — | — |

Gemini's #4253 reported catch (an unanchored `/return/i` pattern rejecting the identifier `totalReturns`) has no match result because the fix PR cannot be prepared (below).

### Clean set per PR (Sonnet)

| PR | tests / weak / reported | USD | min |
|---|---|---|---|
| #3484 | 4 / 1 / 0 | 0.24 | 27 |
| #3378 | 3 / 0 / 0 | 0.39 | 28 |
| #3584 | 10 / 3 / 0 | 1.21 | 38 |
| #3601 | 7 / 5 / 0 | 0.81 | 29 |
| #3624 | 11 / 3 / 1 | 1.48 | 32 |
| #3725 | 9 / 2 / 1 | 0.52 | 24 |
| #3529 | 7 / 6 / 2 | 0.59 | 25 |
| #3779 | 7 / 0 / 0 | 0.32 | 23 |
| #3783 | 9 / 1 / 0 | 0.68 | 25 |
| #3776 | 10 / 8 / 0 | 0.78 | 20 |
| #3801 | 4 / 0 / 0 | 0.33 | 16 |
| #3823 | 7 / 5 / 2 | 0.60 | 21 |
| #3774 | 5 / 4 / 0 | 1.98 | 18 |
| #3941 | 4 / 0 / 0 | 0.18 | 17 |
| #4037 | 5 / 1 / 0 | 0.73 | 20 |

Not run (user decision, half the clean set): #4005, #4052, #4087, #3861, #4092, #3916, #3926, #4157, #4100, #4264, #4254, #4251, #4394, #4411, #4408.

### Cost and wall time

| Model | Cost per run PR (USD) | Generator share | Wall time per PR (min), serial | Sessions |
|---|---|---|---|---|
| `claude-sonnet-5-5` | 0.87 | 24.89 of 34.88 USD | 12–38, median 20; 15.1 h for 43 PRs | 166, all `success` |
| `gemini-3.8-flash` | 1.55 | 21.09 of 29.19 USD | 14–41, median 29; 9.0 h for 20 PRs | 75: 30 `success`, 37 `aborted_token_budget`, 8 `error_max_turns` |

Gemini costs almost twice Sonnet per PR despite the cheaper token price: its sessions make one tool call per turn, read more of the tree, and hit the per-session token budget on half of the sessions (#4450 produced no test at all). The two Gemini runs that ran in parallel with Sonnet also slowed each other's Docker installs (see below).

### Infrastructure failures and fixes

Each fix landed on `CB-jit-catching-design` with a failing test first.

1. **Ledger error text lost the cause.** The ledger kept only the first line of each error, which for a nonzero docker exit is the docker command. Errors now keep the redacted message tail; stderr prints the first meaningful line.
2. **Unrunnable pairs #3748 and #4572.** Their base (#3748) or head (#4572) commit has a `pnpm-lock.yaml` that does not match its `package.json` (`ERR_PNPM_OUTDATED_LOCKFILE`), so the frozen offline install fails. Both stay Failed in both ledgers (0 USD and ~1–2 USD of failed attempts). Swapping them for other candidates is the user's call.
3. **Match step died on an uninstallable fix.** The #4253 fix PR adds a dependency without updating the lockfile. `backtest match` now tries the fix PR's merge commit when the patched head does not apply or does not prepare, records `PrepareFailed` with the error when that fails too, and continues with the next entry. The sandbox install retries once without the frozen lockfile (still offline). #4253 still fails: the stale lockfile makes pnpm re-resolve `@babel/traverse` for react-native, which needs registry metadata the offline store lacks (`ERR_PNPM_NO_OFFLINE_META`). Its fix cannot be prepared offline, so #4253 can never count as caught; another swap candidate.
4. **Fix patches that do not apply on the bug head.** Five Sonnet and three Gemini entries had `ApplyFailed` (the fix was written on a later tree). The match now falls back to the fix merge commit for those too; all eight re-matched as NotMatched on the fix merge.
5. **Docker contention.** With two `backtest match` processes installing at once, installs took 41–98 minutes and tripped the 30-minute timeout (#6069 on both ledgers, several slow entries). No code change; the re-match ran the two ledgers one after the other and every entry installed in 7–12 minutes.
6. **Gemini runner** (task G1): one tool call per turn, a `TurnsPerSession` setting, `GEMINI_API_KEY` preflight.

Base builds of #3412 and #3735 failed during stage A because each PR adds a package that the base does not have; the generator now builds and generates only for packages present at the revision and skips the rest with a stderr line. Both entries re-ran.

### Report (`jit-catch report`, 2026-11-12)

### claude-sonnet-5-5

Ledgers: gate1-Tuning-Both-claude-sonnet-5-5

#### Bug set

- PRs: 30; run 28; failed 2; not run 0
- Caught (reported and matched, of run PRs with a match result): 0/28 = 0.0% (95% CI 0.0%–12.1%)
- Gate caught (reported and matched, of every curated bug PR): 0/30 = 0.0% (95% CI 0.0%–11.4%)
- gate blocked: 2 failed, 0 not run, 0 not yet matched, 0 apply failed, 1 prepare failed (needs a person)
- Any weak catch matched: 3 (0 on the fix merge); not matched: 16; no catch: 8; fix did not apply: 0; fix did not prepare: 1

#### Clean set

- PRs: 30; run 15; failed 0; not run 15
- With a reported catch: 4; labeled 0; pending 4
- False alarms (Intended or TestFault): 0/15 = 0.0% (95% CI 0.0%–20.4%)
- Real bugs found: 0

#### Cost

- Total, every attempt: $37.42; current runs recorded $34.88, at table prices $38.25
- claude-opus-5-5: recorded $6.62; at table prices $6.62
- claude-sonnet-5-5: recorded $24.89; at table prices $28.26
- gemini-4-argon: recorded $2.18; at table prices $2.18
- gpt-4.1-mini: recorded $0.29; at table prices $0.29
- gpt-5.1: recorded $0.91; at table prices $0.91
- Per run PR: $0.87; per matched bug PR: $12.47

#### Session end reasons

- success: 166

#### Drop rules

- PrivateAccess: 4

#### Judge calibration

- claude-opus-5-5: kappa -0.07, alpha -0.07 (n=67); High on Intended/TestFault 0; Low on bugs 4
- gemini-4-argon: kappa -0.04, alpha -0.04 (n=67); High on Intended/TestFault 0; Low on bugs 4
- gpt-5.1: kappa -0.01, alpha -0.64 (n=67); High on Intended/TestFault 0; Low on bugs 1
- TPProb on Bug: n=0, mean n/a
- TPProb on Intended: n=0, mean n/a
- TPProb on TestFault: n=0, mean n/a
- Tests passing both revisions with no coverage measured: 64

### gemini-3.8-flash

Ledgers: gate1-Tuning-Bug-gemini-3_8-flash

#### Bug set

- PRs: 30; run 20; failed 2; not run 8
- Caught (reported and matched, of run PRs with a match result): 1/20 = 5.0% (95% CI 0.9%–23.6%)
- Gate caught (reported and matched, of every curated bug PR): 1/30 = 3.3% (95% CI 0.6%–16.7%)
- gate blocked: 2 failed, 8 not run, 0 not yet matched, 0 apply failed, 1 prepare failed (needs a person)
- Any weak catch matched: 2 (0 on the fix merge); not matched: 10; no catch: 7; fix did not apply: 0; fix did not prepare: 1

#### Clean set

- PRs: 0; run 0; failed 0; not run 0
- With a reported catch: 0; labeled 0; pending 0
- False alarms (Intended or TestFault): 0/0 = n/a
- Real bugs found: 0

#### Cost

- Total, every attempt: $30.99; current runs recorded $29.19, at table prices $29.19
- claude-opus-5-5: recorded $4.23; at table prices $4.23
- claude-sonnet-5-5: recorded $1.73; at table prices $1.73
- gemini-3.8-flash: recorded $21.09; at table prices $21.09
- gemini-4-argon: recorded $1.38; at table prices $1.38
- gpt-4.1-mini: recorded $0.18; at table prices $0.18
- gpt-5.1: recorded $0.58; at table prices $0.58
- Per run PR: $1.55; per matched bug PR: $15.50

#### Session end reasons

- aborted_token_budget: 37
- error_max_turns: 8
- success: 30

#### Drop rules

- PrivateAccess: 1

#### Judge calibration

- claude-opus-5-5: kappa 0.59, alpha 0.49 (n=60); High on Intended/TestFault 0; Low on bugs 1
- gemini-4-argon: kappa 0.65, alpha 0.65 (n=60); High on Intended/TestFault 0; Low on bugs 1
- gpt-5.1: kappa -0.00, alpha -0.43 (n=60); High on Intended/TestFault 0; Low on bugs 1
- TPProb on Bug: n=0, mean n/a
- TPProb on Intended: n=0, mean n/a
- TPProb on TestFault: n=0, mean n/a
- Tests passing both revisions with no coverage measured: 18


### Diagnostics on the tuning runs (2026-11-12, no model spend)

Three checks on the 70 run records, after the user asked why 42 USD bought one catch.

**1. Did the generated tests look at the code the fix changed?** For each assessed bug PR, the files the fix PR changed (source only) against the relative imports of each generated test.

| Model | Bug PRs | PRs with ≥ 1 test importing a fix file | Tests importing a fix file | Tests written from a risk note |
|---|---|---|---|---|
| Sonnet | 28 | 15 | 57 of 233 | 67 of 233 |
| Gemini | 20 | 11 | 54 of 178 | 44 of 178 |

Half of the PRs had no test that even imported a file the fix touched. Per-PR numbers: [`TUNING-DIAG-targeting.md`](TUNING-DIAG-targeting.md), produced by [`diag-targeting.js`](diag-targeting.js) from `generation.json` and `git diff` of the fix merge (run from the repo root with the scratch folder that holds the stage logs as its argument).

**2. Did the analyzer's risk notes name the curated bug?** Graded by reading each PR's notes next to the curated description (Opus, medium effort; table in [`TUNING-DIAG-risk-notes.md`](TUNING-DIAG-risk-notes.md)).

| Grade | PRs | Which |
|---|---|---|
| Named (a test from the note could reproduce the bug) | 5 | #4253, #3831, #5906, #4450, #5513 |
| Adjacent (right file or symbol, different failure) | 5 | #5897, #4245, #6227, #6027, #3354 |
| Missed | 18 | 16 with no risk notes at all, plus #3735 and #4317 whose notes stay on the files with the most changed lines |

Of the 5 Named, only #3831 became a catch (Gemini). #4253 cannot be matched (fix not preparable), #4450 produced 0 tests on Gemini and a NotMatched test on Sonnet, #5906 and #5513 produced tests that did not reproduce the bug. So the generator converts a correctly named hazard into a catch about one time in four; the larger loss is upstream.

**3. Why 16 PRs had no risk notes: the analyzer's silent fallback.** `ChangeAnalyzer.ask` calls the model with `maxOutputTokens: 2000`, retries once when the reply is not valid JSON, and otherwise returns intent from the commit prefix, the PR title as summary, and no risks. The run records show the signature: every such run has analyzer `OutputTokens` exactly 4000 (two attempts cut at the cap) and `Summary` equal to the PR title. 34 of the 70 tuning runs (49%) ran this way, 16 of the 28 Sonnet bug PRs among them; large diffs fail most (every PR over ~1000 diff lines except #3735 and #4317), and the same PR fails on one attempt and succeeds on another (#4253, #4828). Nothing on stderr, nothing in the report. Fix: plan `plans/catching-jittests-speed.md` Task 1 (8000-token cap, shorter second attempt, `Analysis.Fallback` recorded and reported).

**Where the time goes** (PR #3602, 32 min, from file timestamps): prepare base and head ~10 min (two worktrees, two offline installs of all 313 workspace projects, two builds), analyze and generate ~4 min, execute ~14 min (head build, type-check, 42 vitest runs, 7 per-test coverage runs), judges ~1 min, teardown ~2 min. Coverage feeds only promotions, which gate 1 never reads. Plan `catching-jittests-speed.md` Tasks 3–6: coverage off in backtests, per-stage timings, one turbo cache per run, analyze first and install only the packages under test.

## Hydrogen cost work and a first held-out run (2026-11-13)

Generator `gemini-4-hydrogen`. All decisions of this night, with their options, are in [`OVERNIGHT-DECISIONS.md`](OVERNIGHT-DECISIONS.md) (N1 to N20).

### Settings kept

`GeneratorEffort: medium`, `Limits.RisksPerSession: 5`, `Limits.PackagesPerPR: 2`, `Limits.TestsPerPackage: 3`, `Limits.RisksPerPackage: 2`, `Limits.TurnsPerSession: 60`, staged judges (default), judge prompt cache. `run_test` type-checks a passing test.

### Tuning PRs (settings varied, see N12 to N18)

| Setting | PRs | Mean USD per PR | PRs with a reported catch that is the known bug |
|---|---|---|---|
| Round 1: default thinking, one session per risk, no type check | 5 | 2.70 | 2 of 5 (#3831, #5906) |
| Round 3: medium thinking, shared session, type check | 3 | 0.73 | 1 of 3 (#3831) |
| Validation: same, PRs with 2 or 3 packages | 4 | 2.85 | 1 of 3 checked (#4450) |
| Round 7: kept settings | 5 | 2.07 | 1 of 5 (#4450) |
| Round 8: kept settings with low thinking | 3 | 1.21 | 0 of 3 |

### Held-out slice, first 8 of 15 bug PRs, kept settings

| PR | USD | Tests | Reported | Match check |
|---|---|---|---|---|
| #5481 | 0.67 | 10 | 0 | NotMatched |
| #4126 | 1.05 | 7 | 2 | NotMatched |
| #4782 | 1.25 | 12 | 0 | Matched by 2 tests that the first judge rated Low (not reported) |
| #5854 | 0.80 | 7 | 0 | NotMatched |
| #5703 | 2.37 | 11 | 0 | NotMatched |
| #3381 | 1.59 | 12 | 2 | NotMatched |
| #4225 | 0.64 | 6 | 0 | NoCatch |
| #4120 | 0.86 | 5 | 2 | Matched (reported catch) |

- Total 9.23 USD, mean 1.15 USD per PR.
- 1 of 8 PRs has a reported catch that is the known bug. A second PR has tests that find the bug, but the first judge filtered them.
- 3 PRs have reports; on 2 of them the reports are not the known bug. They are not labeled, so they can be other real defects or false reports.
- The held-out PRs #5267, #3824, #4874, #5047, #5514, #3915 and #5878 are not used.
- The clean set was not run in this night.

### Infrastructure notes

- `Sandbox.EnsureImage` builds the image at each start and needs the registry for the base image. A registry failure stops the run although the image exists locally (seen three times in the match step).
- One PR failed at `gh pr view` on a network error and passed on a second attempt (`--retry-failed`).

