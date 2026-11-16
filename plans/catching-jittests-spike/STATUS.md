# Catching JiTTests: status (2026-11-16)

**Incomplete. The work was timeboxed and is stopped here. Gate 1 is not passed.**

## What exists

- The design: [`catching-jittests-design.md`](../catching-jittests-design.md).
- The package `packages/TestingFramework/jit-catching` (private, not published). `jit-catch run --pr <n>` works on a local machine with Docker: it writes tests on the base revision, runs them on base and head in a sandbox, filters and judges the catches, and stores the result.
- The gate 1 tooling: `corpus mine`, `backtest`, `backtest match`, `label`, `report`, `clean`.
- No workflow, no PR comment and no promotion. That is phase 3 ([`catching-jittests-phase3.md`](../catching-jittests-phase3.md)); a local branch has a draft that was never pushed.

## Results

All labels are provisional (sub agents, not the PR authors). Details: [GATE1.md](GATE1.md), [CLEAN-LABELS.md](CLEAN-LABELS.md), [OVERNIGHT-DECISIONS.md](OVERNIGHT-DECISIONS.md), [CORPUS-AUDIT.md](CORPUS-AUDIT.md).

| Gate 1 measure | Target | Measured |
|---|---|---|
| Known-bug PRs with a reported catch that is the known bug | at least 25% of all 45 | 2 to 6 of the 10 PRs that a base test can find, typically 3; so about 7% of 45 |
| Clean PRs with a false alarm | at most 10% | 9 of 15 (code of 2026-11-15); 5 of 15 with the judge prompt of N30; with the caller check of N32, 2 of 15 PRs still get a report and those reports are not labelled (N35) |

- A test written on the base revision can find the bug on only 12 to 15 of the 45 known-bug PRs. The 25% target is near that ceiling.
- The generator varies between runs: the same PR gets a matching test in one run and none in the next.
- The tool cannot tell a bug from behaviour that the PR text states on purpose (N34).
- On 30 clean PRs the tool found about 7 real defects that no fix PR was linked to; later commits fixed or changed 4 of them, and 3 are still on `next` (#3823, #4123, #3801).
- Cost: about 1.2 USD and 15 to 20 minutes for each PR with `gemini-4-hydrogen` as the generator.

## Settings used in the last rounds

`GeneratorModel` `gemini-4-hydrogen`, `GeneratorEffort` `medium`, `Limits.PackagesPerPR` 2, `Limits.TestsPerPackage` 3, `Limits.RisksPerPackage` 2, `Limits.RisksPerSession` 5, `Limits.TurnsPerSession` 60, `Judges.CallerCheck.Enabled` true. These are not the defaults in `src/settings.ts`.

## To continue later

1. Decide the gate 1 denominator (all known-bug PRs, or the ones a base test can find), or add a test mode for new code (N23).
2. Decide how to treat catches of behaviour that the PR text states (N34).
3. Get author labels. A small pilot with optional comments on real PRs gives them; the sub agent labels have noise.
4. Run the match step for round H (N35), which was not done.
5. Check the false match of the fix-merge fallback in `backtest match` (#4782).

## Parts that can be removed if the work does not continue as designed

No command or stage was removed in the last clean-up. Candidates, with source lines: the `report` command (386), `backtest match` (200), `corpus mine` (230), the Gemini generator runner (240), the caller check (165), coverage and promotion candidates (45), the TP Prob judge (40), the `recheck` and `feedback` stub commands, `Thresholds.Nightly`, `RiskScore` and `RiskPaths`, and the `contracts/` base classes.
