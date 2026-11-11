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

