# Overnight run 2026-11-13: decisions log

The user asked for autonomous work overnight: iterate in short test rounds, bring cost and time down, finish what can be finished of the remaining phases, and record every design decision with its options. Each entry: the question, the options with pros and cons, the choice, and what it costs if the choice is wrong.

## N1. Spend ceiling for the night

- **A. No ceiling.** Pro: nothing stops the work. Con: a loop of failing rounds can spend without limit while nobody watches.
- **B. Keep the 40 USD cap of the 15-PR run only.** Pro: the last figure the user saw. Con: too small for "as much testing as possible" plus the held-out run.
- **C. One ceiling of 120 USD of model spend for the whole night, tracked per round in this file.** Pro: bounded; about three times the tuning spend, enough for iteration rounds and one held-out run. Con: the figure is mine, not the user's.
- **Choice: C.** If wrong: at most 120 USD spent; rounds stop at the ceiling and the rest waits for the user.

## N2. Round size while iterating

- **A. All 15 chosen PRs each round.** Pro: tighter rates. Con: about 5 hours a round; one or two rounds a night.
- **B. Rounds of 4 PRs, picked for the question of the round.** Pro: about 60 to 80 minutes; four to six rounds a night. Con: a 4-PR rate is noisy, so a round can only answer a yes/no question.
- **C. Stage-only checks where a stage can run alone (analyzer on all 30 bug PRs: 2.65 USD, 2 minutes).** Pro: full-slice signal for cents. Con: only for stages with no sandbox work.
- **Choice: B and C together.** Round 1 = the four PRs where the old analyzer named the bug (#3831, #5906, #4450, #5513): it asks "does a correct risk note become a reported catch with Hydrogen?". If wrong: a noisy round misleads one iteration.

## N3. Which PRs are in the Hydrogen sample

- **A. First 15 of the ledger order.** Pro: no selection by me. Con: includes the three pairs that cannot be prepared offline; wastes runs.
- **B. 15 spread over the risk-note grades (4 Named, 5 Adjacent, 1 Missed with notes, 5 with no notes), unrunnable pairs left out.** Pro: tests the analyzer fix and the generator separately. Con: the sample is not random, so its catch rate is not the gate rate.
- **Choice: B.** The gate rate comes only from the held-out slice, which is run once and whole.

## N4. Turbo build filter (bug found by the first Hydrogen run)

Turbo treats the workspace root as a dependency of every package, and the root depends on the CLI package. So `--filter=<pkg>...` selected 157 packages for `@memberjunction/core`.

- **A. Keep `--filter=<pkg>...` and go back to the full install.** Pro: no code change. Con: every run builds half the workspace; slow.
- **B. `--filter=...<pkg>`.** My first attempt (`95ef909f8a`). Con: wrong; that form is the dependents, 311 packages. It cost one failed round start.
- **C. Exact name, `--filter=<pkg>`.** Pro: turbo runs that build and the builds it depends on (3 tasks for core), the same closure the filtered install covers. Con: none found.
- **Choice: C** (failing test first). If wrong: a build fails on a missing dependency and the run is recorded as failed, with no model spend beyond the analyzer call.

## N5. Shared download cache for dependencies across runs

Measured on the host: cold `pnpm fetch` 62 s, warm fetch 5 s, copying a 3.4 GB store (181 000 files) 70 s.

- **A. One host cache, cloned into each run's store.** Pro: no network per run. Con: the clone takes longer than the download it replaces.
- **B. Mount one shared store into every sandbox.** Pro: fastest. Con: a generated test could write to a store later runs trust; breaks the per-run isolation of the design.
- **C. Leave it as it is.** Pro: no change, isolation kept. Con: 62 s per run stays.
- **Choice: C.**

## Spend ledger for the night

| Round | What | Model spend (USD) | Running total |
|---|---|---|---|
| 0 | Hydrogen #5897 (first run) + one failed #3831 attempt | 3.42 | 3.42 |
| A1 | Analyzer only, 30 tuning bug PRs, Sonnet | 2.65 | 6.07 |
