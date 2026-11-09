# Phase 1 end-to-end results (Task 1.24)

Date: 2026-11-09. Machine: local (macOS host, Docker sandbox `jit-sandbox:local`, 16 CPUs, 62 GB for Docker). Nothing ran on GitHub Actions.

Command for every run (from the repository root; `--pr` is not used, so `gh` is never called):

```bash
node packages/TestingFramework/jit-catching/bin/jit-catch.js run --base <M^1> --head <M> --trigger Backtest --settings <settings file>
```

Settings: `packages/TestingFramework/jit-catching/jit-catch.settings.json` (Opus 5.5 generator, Sonnet 5.5 analyzer, default limits). The first run on #6368 used a copy with `GeneratorModel: claude-haiku-5-5`.

## The three PRs

| PR | Shape | Merge `M` | Base `M^1` | Changed source |
|---|---|---|---|---|
| #6368 | one package | `a163aeafec` | `ea207aec3a` | `SQLConverter` (`ExecBlockRule`, `PostProcessor`) |
| #6122 | two packages | `314640c9d6` | `22050a32d8` | `MJCoreEntitiesServer` (`MJQueryEntityServer`), `MetadataSync` (`PullService`) |
| #6357 | touches `MJCore` | `eee025bc6d` | `c1f0dc2183` | `MJCore` (`providerBase.ts`) |

The base of #6122 built in the sandbox, so #6362 was not needed.

## Judge check (closes the deferred 1.20 check)

One real call per judge model on the fixture catch from `judgeFixtures.ts`:

| Judge | Model | Answer | Error |
|---|---|---|---|
| TP Prob | `gpt-4.1-mini` | Score 0.9998 (yes) from first-token logprobs | none |
| Bucket | `claude-opus-5-5` | `{bucket: Low, reason}` | none |
| Bucket | `gemini-4-argon` | `{bucket: Low, reason}` (52 s) | none |
| Bucket | `gpt-5.1` | `{bucket: High, reason}` | none |

Panel median: Low. Cost: 0.007 USD.

## Per-PR results

Wall time per step comes from the run log timestamps and the file times of `generation.json`, `execution.json` and `assessment.json`. "Prepare" is host fetch, sandbox install, change analysis and the base build, up to the first agent session.

| | #6368 Haiku | #6368 Opus | #6122 Opus | #6357 Opus |
|---|---|---|---|---|
| Run ID | `20261109-083357-local-a163aea` | `20261109-084641-local-a163aea` | `20261109-085724-local-314640c` | `20261109-091634-local-eee025b` |
| Prepare base | 3 m 48 s | 3 m 41 s | 6 m 21 s | 3 m 43 s |
| Sessions | 1 m 15 s | 1 m 21 s | 2 m 49 s | 3 m 03 s |
| Execute (head prepare, build, 3× base and head, coverage) | 3 m 34 s | 3 m 36 s | 7 m 53 s | 3 m 30 s |
| Assess | 34 s | 1 m 26 s | 1 m 06 s | 1 m 22 s |
| Cleanup | 22 s | 22 s | 22 s | 22 s |
| **Total** | **9 m 33 s** | **10 m 26 s** | **18 m 31 s** | **12 m 00 s** |
| Packages tested | 1 | 1 | 2 | 1 |
| Intent / risks | fix / 4 | fix / 4 | fix / 2 | perf / 3 |
| Sessions (end reason) | 4 success | 4 success | 1 success, 3 token budget | 2 success, 2 token budget |
| Tests produced / failed | 10 / 0 | 11 / 0 | 10 / 2 | 9 / 1 |
| Verdicts | 9 PassesBoth, 1 Weak | 10 PassesBoth, 1 Weak | 2 PassesBoth, 5 Weak (3 test faults, 2 intended), 3 Invalid | 4 PassesBoth, 5 Weak |
| Dropped by rule | 0 | 0 | 0 | 1 (PrivateAccess) |
| Judge buckets (Opus / Gemini / GPT-5.1) | Low / Low / High | Low / Low / Low | 5 × Low / Low / High | 4 × Low / Low / High |
| Medians | 1 Low | 1 Low | 5 Low | 4 Low |
| Reported | 0 | 0 | 0 | 0 |
| Promotion candidates | 3 | 3 | 2 | 0 (coverage not measured, see fix 3) |
| Cost (price table) | 0.18 USD | 1.23 USD | 1.48 USD | 1.92 USD |

### Sessions

Turns are the distinct assistant messages in the transcript (the SDK turn count is not stored).

| Run | Session | End | Turns | `run_test` calls | Tests | Tokens in / out / cache read | Cost |
|---|---|---|---|---|---|---|---|
| #6368 Haiku | DodgyDiff | success | 31 | 11 | 5 produced | 34,921 / 11,764 / 120,041 | 0.011 |
| | IntentAware R1 | success | 18 | 7 | 2 produced | 27,992 / 7,618 / 54,217 | 0.008 |
| | IntentAware R2 | success | 31 | 8 | 2 produced | 44,845 / 11,805 / 272,303 | 0.014 |
| | IntentAware R3 | success | 27 | 6 | 1 produced | 34,899 / 10,558 / 192,747 | 0.011 |
| #6368 Opus | DodgyDiff | success | 25 | 8 | 5 produced | 31,306 / 8,105 / 100,979 | 0.30 |
| | IntentAware R1 | success | 22 | 8 | 2 produced | 36,247 / 5,798 / 118,785 | 0.28 |
| | IntentAware R2 | success | 26 | 6 | 2 produced | 36,360 / 6,988 / 190,221 | 0.32 |
| | IntentAware R3 | success | 18 | 5 | 2 produced | 32,084 / 4,869 / 85,147 | 0.24 |
| #6122 Opus | MJCoreEntitiesServer DodgyDiff | token budget | 30 | 5 | 5 produced | 55,407 / 199* / 386,209 | 0.30* |
| | MJCoreEntitiesServer IntentAware R1 | success | 24 | 4 | 2 produced | 48,259 / 12,005 / 227,456 | 0.51 |
| | MetadataSync DodgyDiff | token budget | 40 | 6 | 3 produced, 2 failed (never passed on base) | 47,863 / 134* / 391,575 | 0.27* |
| | MetadataSync IntentAware R2 | token budget | 31 | 0 | none written | (in run total only) | — |
| #6357 Opus | DodgyDiff | success | 28 | 5 | 5 produced | 63,619 / 22,351 / 351,387 | 0.81 |
| | IntentAware R1 | success | 19 | 4 | 2 produced | 35,395 / 10,715 / 134,390 | 0.39 |
| | IntentAware R2 | token budget | 28 | 2 | 1 produced | 41,572 / 188* / 381,157 | 0.25* |
| | IntentAware R3 | token budget | 32 | 4 | 1 produced, 1 failed (no mutant killed) | 48,777 / 162* / 376,291 | 0.27* |

\* A session stopped by the token budget has no SDK `result` message; its output tokens and cost come from the host count, which records only the first usage snapshot of each message and so runs low.

### Tokens per model

| Run | Model | In | Out | Cache read | Cost (table) | Cost (recorded) |
|---|---|---|---|---|---|---|
| #6368 Haiku | claude-sonnet-5-5 (analyzer) | 6,314 | 1,061 | 0 | 0.023 | 0.023 |
| | claude-haiku-5-5 (generator) | 142,657 | 41,745 | 639,308 | 0.099 | 0.044 |
| | judges (4 models) | 16,407 | 1,089 | 5,859 | 0.055 | 0.055 |
| #6368 Opus | claude-sonnet-5-5 | 6,314 | 1,108 | 0 | 0.024 | 0.024 |
| | claude-opus-5-5 (generator + bucket judge) | 142,810 | 25,849 | 495,132 | 1.187 | 1.177 |
| | gpt-4.1-mini / gemini-4-argon / gpt-5.1 | 12,363 | 336 | 0 | 0.019 | 0.019 |
| #6122 Opus | claude-sonnet-5-5 | 1,684 | 593 | 0 | 0.009 | 0.009 |
| | claude-opus-5-5 | 216,754 | 13,210 | 1,371,000 | 1.405 | 1.440 |
| | gpt-4.1-mini / gemini-4-argon / gpt-5.1 | 42,438 | 1,051 | 0 | 0.064 | 0.064 |
| #6357 Opus | claude-sonnet-5-5 | 3,415 | 737 | 0 | 0.014 | 0.014 |
| | claude-opus-5-5 | 215,526 | 35,675 | 1,243,225 | 1.824 | 1.877 |
| | gpt-4.1-mini / gemini-4-argon / gpt-5.1 | 44,658 | 2,276 | 2,432 | 0.079 | 0.079 |

"Recorded" is `TokensByModel.CostUSD` in the store: the SDK's own cost for completed sessions, the price table for the rest. For Haiku the two differ by 2×: the table prices a Haiku cache read at the full input price (0.1 per million).

## Catch assessments

No catch was reported on any PR. Every weak catch is listed, including the one dropped by a rule.

| Run | Test | What it pins | Class |
|---|---|---|---|
| #6368 Haiku | `e35724a2` | A guarded `IF NOT EXISTS … EXEC` block converts to a `DO $mj$` block; head writes `-- SKIPPED: EXEC block (unparseable upsert)` | Real behaviour change, intended (the PR's stated fix) |
| #6368 Opus | `8d33e7cf` | The skip marker text `(auto-conversion not supported)`; head writes `(unparseable upsert)` | Real behaviour change, intended |
| #6122 | `636cef2f`, `9ee5fe45` | An existing dialect `QuerySQL` row found in `QueryEngine`'s cache is updated; the tests stub the provider's `RunView` empty | Test fault: the tests pin the old lookup path that the PR replaced on purpose |
| #6122 | `5a8f723b` | Same, asserted as "update existing, do not create new" | Test fault (same cause) |
| #6122 | `8e9ff2ad` | The existing row is still updated with the converted SQL when the provider's `RunView` fails (`Success: false`) | Real behaviour change, intended (the PR adds the early return) |
| #6122 | `d8aa4256` | A failed provider read still saves the converted SQL | Real behaviour change, intended (the PR adds the early return) |
| #6357 | `5eead4fb`, `e3e5ab16`, `e8d85150`, `b5130334` | After a write lands between the staleness check's status read and the scoped reload, the next check finds nothing stale | Real behaviour change, intended: the PR reuses the first status read and its comment accepts one extra reload in that window |
| #6357 | `8f18bb8b` (dropped, PrivateAccess) | Same race, reached through a test subclass that calls the protected `RefreshAfterMetadataMemberChange` | Real behaviour change, intended; the drop was not needed (same kind as the four judged ones) |

Also seen: three MetadataSync tests on #6122 (`9c59a295`, `2dec4f46`, `d243feb5`) were `Invalid` because they construct the abstract `BaseEntity` (TS2511). They ran and passed on base; `9c59a295` failed on head and pinned the PR's intended embeds merge.

## Fixes

| # | Failure seen | Test written first (failed before the fix) | Commit |
|---|---|---|---|
| 1 | The Opus 5.5 bucket judge cut its JSON reply: thinking used most of the 300-token output budget. The bucket came from the word fallback with the raw JSON as reason, after a retry. | `BucketJudge.test.ts`: "asks for an output budget that leaves room for thinking before the JSON reply" | `c39497397d` |
| 2 | Re-running `assess` on a run gives every catch a new random ID, so the store holds two catches per test. | `Assess.test.ts`: "keeps one catch per test in the store when the step runs again on the same run" | `d257e3552e` |
| 3 | `MJCore` is on vitest 3; the root `@vitest/coverage-v8` is 4, so the coverage run writes no report and every test counted 0 covered lines. | `VitestCatchTarget.test.ts`: "leaves out a test whose coverage run wrote no report, instead of counting zero covered lines" | `c848274b42` |

Fix 1 was checked with a real call on the #6368 Haiku catch: the reply is complete JSON, 102 output tokens. Fixes 2 and 3 could not be re-run on the existing run folders, because `run` removes the base worktree when it ends; they are covered by the unit tests, and fix 3's cause was reproduced on the host (vitest reports "mixed versions is not supported").

## Spend

| Item | USD |
|---|---|
| Judge check | 0.01 |
| Judge reply checks for fix 1 | 0.01 |
| #6368 Haiku | 0.18 |
| #6368 Opus | 1.23 |
| #6122 Opus | 1.48 |
| #6357 Opus | 1.92 |
| **Total (price table)** | **4.83** |

The five sessions stopped by the token budget under-count their output tokens; at the output per turn of the completed Opus sessions, the true total is about 6–7.5 USD.

## Design items for phase 2

1. **Token budget is too tight for Opus.** 5 of 12 Opus sessions stopped on `TokensPerSession` (400,000) at 28–40 turns, before `TurnsPerSession` (30 turns, counted by the SDK) or `UsdPerSession` (3 USD) could act. Cache reads (0.2 per million) count the same as input; one session wrote no test at all. Decide whether the budget counts cache reads, or raise it.
2. **Cost of a stopped session runs low.** The host count keeps the first usage snapshot of each message, so output tokens and cost are low for every session that the token budget stops. A stream-event count or the final `message_delta` usage would fix it.
3. **GPT-5.1 bucket judge says High on intended changes.** It gave High on 10 of 11 weak catches whose PR made the change on purpose, often with a reason that says the change is intended. Opus and Gemini agreed with each other on all 11. Revisit the GPT-5.1 prompt or the panel.
4. **TP Prob is not calibrated.** `gpt-4.1-mini` gave 0.64–0.97 on the three #6122 test faults and 0.94 on one #6357 intended change.
5. **PrivateAccess drops a call through a test subclass.** A subclass that calls a protected extension point (the MJ pattern for extension points) is treated as private access. Gate-1 labels should decide whether such calls stay.
6. **Abstract `BaseEntity` makes tests Invalid.** Three generated MetadataSync tests construct `BaseEntity` directly; they run but fail type-check. The generator prompt could name this, or `run_test` could type-check during the session.
7. **Re-running a step after `run`.** `run` removes the base worktree at the end, so `execute --run` and `assess --run` work only on a run that failed. A fix to a later step needs a full new run.
8. **Vitest versions differ per package.** `MJCore` is on vitest 3 and the root coverage provider on 4; coverage is now left out for such packages. Measuring it needs a matching provider per package.
9. **Per-run pnpm store is 4 GB and stays.** Each run folder keeps its own 4 GB store; there is no cleanup.
10. **Session details are not stored.** `generation.json` does not hold the end reason, turn count or tokens of a session that wrote no test; they are only in the transcript and the run total. Opus judge tokens are also merged with the generator's under one model in `TokensByModel`.
11. **Price table.** The Haiku cache-read price equals its input price; the SDK cost for the same tokens is half the table cost.
12. **Log noise.** The SDK prints `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` once per session for `run_test` (intended by D36), and the Gemini provider prints a temperature notice per assess.
