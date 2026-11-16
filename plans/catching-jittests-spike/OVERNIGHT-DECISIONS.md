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

## N6. Risks per package after the analyzer fix

The analyzer fix raised the risk notes from Named 5 / Adjacent 5 / Missed 18 to Named 10 / Adjacent 15 / Missed 5. For #5906 and #5513 the note that names the bug is at rank 4 in its package.

- **A. Keep 3 risks per package.** Pro: cheapest; fewest sessions. Con: the two rank-4 notes never reach the generator.
- **B. 5 risks per package.** Pro: every note that names a bug in the tuning slice is used. Con: up to two more sessions per package, about 0.40 USD each with Hydrogen.
- **Choice: B for round 1.** Cost task B (N10) makes the extra risks cheaper. If wrong: about 0.80 USD per PR for sessions that report nothing.

## N7. Sandbox size for backtest rounds

- **A. Default 3 CPUs / 6 GB.** Pro: matches a GitHub runner. Con: slow installs and builds on a 16-core host.
- **B. 6 CPUs / 12 GB in the round settings only.** Pro: shorter prepare and build stages. Con: stage times are not the runner's times.
- **Choice: B**, in the round settings file only; the default stays 3 / 6.

## N8. Docker Desktop stopped after a killed round

I stopped a round during a 311-package build and the Docker engine did not come back.

- **A. Wait for the user.** Pro: no action on the host. Con: the night's testing stops.
- **B. Restart Docker Desktop and start the four database containers that were running before.** Pro: testing goes on. Con: the containers were down for some minutes.
- **Choice: B.** The containers `mj-sqlserver`, `mj-repro-pg`, `pg-check-17` and `pg-repro-616` run again.

## N9. Model after round 1 (user decision, 2026-11-13)

Round 1 cost 2.22 to 3.40 USD per PR with `gemini-4-hydrogen`. The user asked whether to reduce cost in the harness or go back to `gemini-3.8-flash`.

- **A. Keep Hydrogen, change the harness.** Pro: all sessions complete, 2 of 5 PRs reported catches. Con: code changes and measuring rounds.
- **B. Back to Flash.** Pro: no code change, about 45% cheaper. Con: half of its sessions stopped on the token limit.
- **C. Back to Sonnet.** Pro: cheapest measured (0.85 USD per PR). Con: 0 of 30 known bugs matched in the first run.
- **Choice: A, by the user** ("Keep the Model fix the harness").

## N10. Which harness changes, and in which order

Cost of one Hydrogen PR (#5897): generator 2.80 USD = new input 1.19 + output 0.95 + cached input 0.65; judges about 0.50; analyzer 0.04.
Stored results of 220 judged catches: when the Opus judge said Low (198 times), the catch was never reported and the median was never Medium or High. GPT-5.1 said High 166 times; Argon said Low 209 times.

- **A. Staged judges: the first bucket judge (Opus) runs first; Low ends the panel.** Pro: two of three judge calls saved on about 90% of weak catches; no reported catch lost in 220. Con: a Low / High / High vote would now be Low, where the median was High; never seen so far.
- **B. Generator thinking level (`GeneratorEffort`).** Pro: output is 34% of the generator cost; one setting. Con: effect on catch quality unknown; must be measured.
- **C. Several risks in one session (`Limits.RisksPerSession`).** Pro: the package is read once, not once per risk. Con: risks run one after the other, so the generate stage takes longer; one long session spends more cached input per turn.
- **D. Hint to batch read calls in one reply.** Pro: fewer turns. Con: the model may not follow it.
- **E. Fewer risks per package.** Pro: about 30% saving. Con: loses the rank-4 notes (N6).
- **F. Shared cached prompt start across sessions.** Pro: the diff is paid once at the full price. Con: about 0.10 USD per PR; needs staggered session starts. Not worth it now.
- **Choice: A, B, D first (cost task A), then C (cost task B). E and F not done.** Each is a setting, so a round can switch it. If wrong: a round shows fewer catches and the setting goes back.

## N11. Round 2 configuration

Round 1 result after the match check: 2 of 5 PRs have a reported catch that is the known bug (#3831, #5906); #5897, #4450 and #5513 did not match.

- **A. One change per round.** Pro: each saving and each quality change has one cause. Con: three rounds of about an hour.
- **B. All changes in one round on three round 1 PRs (#3831, #5906, #5513): thinking level low, 5 risks in one session, staged judges, read hint.** Pro: the largest saving is known after one round; the token counts still show the share of each change (output for the thinking level, new input for the shared session, judge usage for staging). Con: if the two matched catches are lost, the cause is not known and a second round must separate the changes.
- **Choice: B.** If wrong: one more round of about 6 USD.

## N12. Round 2 result and what to change next

Round 2 (thinking level low, 5 risks in one session, staged judges, read hint), against round 1 on the same PRs:

| PR | Round 1 USD | Round 2 USD | Round 1 result | Round 2 result |
|---|---|---|---|---|
| #3831 | 2.22 | 0.47 | 10 tests, 3 reported, matched | 12 tests, all Invalid (type errors) |
| #5906 | 2.23 | 0.31 | 11 tests, 1 reported, matched | 10 tests, all pass on both revisions |
| #5513 | 2.79 | 0.40 | 13 tests, 7 weak catches, 0 reported | 10 tests, 6 weak catches, 0 reported |

Cost fell by 84%, and both matched catches were lost. Staged judges worked: judge cost 0.15 USD on #5513 (round 1: about 0.50), same result. Sessions were much shorter (5 to 27 turns).
Cause 1: `run_test` ran vitest only, so the agent never saw type errors that job 2 then rejects. Fixed: `run_test` now type-checks a passing file and returns the compiler errors (failing tests first).
Cause 2, not separated yet: low thinking level, or the shared session, or both, gave weaker tests on #5906.

- **A. Round 3 = low thinking + shared session + type check.** Pro: cheapest configuration; shows whether the type check alone brings the catches back. Con: #5906 had no type errors and still lost its catch, so low thinking is a likely cause by itself.
- **B. Round 3 = medium thinking + shared session + type check.** Pro: the middle point; if the catches return, the configuration is found in one round. Con: if they do not, the shared session and the thinking level are still not separated.
- **C. Round 3 = default thinking + shared session + type check.** Pro: separates the shared session from the thinking level. Con: the most expensive of the three; a second round is still needed to find the cheapest good level.
- **Choice: B.** If wrong: one more round (C) of about 4 USD.

## N13. Round 3 result and the separating round

Round 3 (thinking level medium, risks of a package in one session, type check in `run_test`, staged judges):

| PR | Round 1 USD | Round 3 USD | Round 1 result | Round 3 result |
|---|---|---|---|---|
| #3831 | 2.22 | 0.99 | 3 reported, matched | 11 tests, 6 weak catches, 3 reported (match check pending); no Invalid test |
| #5906 | 2.23 | 0.48 | 1 reported, matched | 13 tests, all pass on both revisions |
| #5513 | 2.79 | 0.72 | 7 weak catches, 0 reported | 5 weak catches, 0 reported |

Cost is 70% lower than round 1. The type check removed the Invalid tests. #5906 lost its catch again: the shared session used 21 turns for 4 risks, where round 1 used 13 to 27 turns for each risk.
Each result is one run of a model that does not repeat exactly, so one lost catch is weak evidence.

- **A. Accept round 3 settings.** Pro: cheapest working configuration. Con: one of the two matched catches is lost.
- **B. Round 4 = medium thinking, one session per risk, on #5906 and #5513.** Pro: shows whether the shared session is the cause; two PRs, about 30 minutes. Con: about 2 to 3 USD.
- **C. Go straight to 2 risks per session.** Pro: a middle setting. Con: a guess with no measurement of either end.
- **Choice: B.** If #5906's catch returns, the shared session costs catches and the default stays at one risk per session (or 2 after one more check). If it does not return, the cause is the thinking level or run-to-run variation.

## N14. Round 4 result and round 5

Round 4 (thinking level medium, one session per risk, type check, staged judges):

- #5513: 1.27 USD, 8 weak catches, 1 reported (Medium, from the rank-4 risk). First report on this PR in any round.
- #5906: first attempt failed and lost 0.81 USD: a test was proved with a mutant in a file that the run record does not accept, and the whole run failed on save. Fixed (`run_test` refuses such a file; failing test first). Second attempt: 0.75 USD, 13 tests, all pass on both revisions.

#5906 has now lost its catch in three runs with a lower thinking level (low shared, medium shared, medium per risk) and had 6 weak catches in the one run at the default level. So for #5906 the thinking level is the likely cause, not the shared session. #5513 points the other way (catch only with one session per risk). Each cell is one run.

- **A. Stop here with medium thinking and one session per risk.** Pro: about 0.75 to 1.27 USD per PR. Con: loses #5906.
- **B. Round 5 = default thinking + shared session + type check + staged judges, on the three PRs.** Pro: tests the one cheap configuration not yet run; it keeps full thinking and still saves the repeated reading. Con: about 3 to 4 USD and 45 minutes.
- **C. Go back to round 1 settings plus type check and staged judges.** Pro: known to catch. Con: about 2 USD per PR; only the judge saving is kept.
- **Choice: B.** After it, the three PRs have a result for each of the four combinations that matter, and the default is chosen from that table.

## N15. Round 5 result, match results, and the candidate setting

Round 5 (default thinking, shared session): #3831 1.21 USD, 3 reported; #5906 1.02 USD, no catch; #5513 1.67 USD, 0 reported.

Reported catch that is the known bug (match check), per PR:

| Setting | #3831 | #5906 | #5513 | Mean USD per PR |
|---|---|---|---|---|
| Round 1: default thinking, one session per risk, no type check | Matched | Matched | no report | 2.41 |
| Round 3: medium thinking, shared session | Matched | no catch | no report | 0.73 |
| Round 4: medium thinking, one session per risk | not run | no catch | reported, NOT matched | about 1.00 |
| Round 5: default thinking, shared session | Matched | no catch | no report | 1.30 |

#5906 was caught once in five runs; no setting explains it. Its round 1 catch came from one risk note that later analyzer runs did not write again, so that catch depends on analyzer variation. The round 4 report on #5513 is not the known bug.

- **A. Medium thinking + shared session (round 3).** Pro: cheapest (0.73 USD, 70% below round 1), keeps the stable catch, no false report in three PRs. Con: generate stage is longer (240 to 425 s) because risks run one after the other.
- **B. Medium thinking + one session per risk (round 4).** Pro: shortest generate stage (about 220 s, sessions in parallel). Con: about 1.00 USD; its one extra report was not the bug.
- **C. Default thinking + shared session (round 5).** Pro: full thinking. Con: 1.30 USD and no extra matched catch.
- **D. Round 1 settings.** Pro: the only run that caught #5906. Con: 2.41 USD; one run in five is not a property of the setting.
- **Choice: A as the candidate.** Next: a validation round with A on six more PRs whose risk notes name the bug (#4253, #4418, #4290, #3644, #5729, #4450), then the match check. If A matches clearly fewer bugs there than the notes predict, the next check is B on the same six.

## N16. Validation round result and the smaller session plan

The validation round ran candidate A on PRs that change two or three packages. It stopped at the 10 USD cap after four of the six PRs (#3644 and #5729 did not run).

| PR | Packages | USD | Reported | Match check |
|---|---|---|---|---|
| #4253 | 3 | 2.77 | 0 | not possible: the fix revision does not install |
| #4418 | 2 | 2.34 | 2 (risk 5) | NOT matched |
| #4450 | 2 | 2.08 | 2 (risk 1 and one diff-only test) | Matched |
| #4290 | 3 | 4.19 | 2 (risk 4) | NOT matched |

Mean 2.85 USD per PR. The 0.73 USD of round 3 holds only for a PR that changes one package. The cost follows the number of sessions: each package gets one diff-only session (5 tests) and one session per 5 risks, and each weak catch gets an Opus judge call.

Stored data from the 17 Hydrogen runs of the night (rounds 1, 3, 4, 5 and validation):

| Method | Sessions | USD | Tests | Reported | Reported and matched |
|---|---|---|---|---|---|
| Diff-only (DodgyDiff) | 25 | 8.92 | 114 | 3 | 3 |
| Risk-based (IntentAware) | 43 | 18.43 | 120 | 14 | 5 |

- Each matched risk-based catch came from risk 1 or risk 3 of its package, except the one-time #5906 catch (risk 4).
- The two tests of one risk had the same result in almost all cases.
- Each run with a matched diff-only report also had a matched risk-based report, except round 1 (before the type check).

Options for the next cut:

- **A. Stop the diff-only sessions.** Pro: about one third of the generator cost goes away. Con: its 3 reports were all correct (3 of 3), and per USD it gave as many matched reports as the risk-based method. Not chosen.
- **B. Smaller plan with the current settings only: 2 packages per PR, 3 diff-only tests per package, the 2 top-ranked risks per package.** Pro: no code change; removes the sessions and risks that gave no matched catch in the stored data; fewer weak catches to judge. Con: a bug that only risk 3 or lower names is lost (one case in the stored data: #3831 risk 3, but risk 1 matched in the same run).
- **C. One test per risk.** Pro: about half the risk-based tests. Con: in two of the #3831 runs only one of the two tests of risk 1 matched, so this can lose a catch. Not chosen.
- **D. One Opus judge call for all weak catches of a run.** Pro: the diff is sent once (judge cost was 0.3 to 1.0 USD per PR in this round). Con: code change in the judge panel and a new prompt to validate. Kept as the next step if B is not enough.
- **Choice: B.** Round 7 runs B on #4450, #4418, #4290, #3644 and #5729 with a 9 USD cap, then the match check. #4253 is left out because its match check cannot run.

## N17. Round 7 result (smaller plan) and round 8

Round 7 ran option B of N16 (2 packages, 3 diff-only tests, 2 risks per package, medium thinking, shared session).

| PR | Validation USD | Round 7 USD | Reported | Match check |
|---|---|---|---|---|
| #4418 | 2.34 | 2.29 | 3 | NOT matched |
| #4450 | 2.08 | 1.98 | 3 | Matched (one diff-only test and one risk 1 test) |
| #4290 | 4.19 | 2.07 | 1 | NOT matched |
| #3644 | not run | 1.91 | 0 | NOT matched |
| #5729 | not run | 2.09 | 0 | NOT matched |

Mean 2.07 USD per PR, total 10.34 USD. The plan removed the third package of #4290, but fewer tests per session did not make a session cheaper: a session costs 0.2 to 0.6 USD for 2 or 5 tests alike. The same PR matched as before.

Generator cost of the 20 sessions, by token kind: new input 2.70 USD (37%), output 3.09 USD (42%), cached input 1.51 USD (21%). The 63 stored tests hold about 104 000 tokens of code; the sessions wrote 411 000 output tokens. So most of the output is thinking, not test code.

Options:

- **A. Low thinking, now with the type check.** Round 2 used low thinking and cost 0.31 to 0.47 USD per PR, but it ran before `run_test` had the type check, so all its #3831 tests were invalid. Low thinking was never tested with the type check. Pro: settings only; targets the largest cost part. Con: weaker tests are possible; the type check can add repair turns.
- **B. One session per package for both methods.** Pro: the package files are read once. Con: a longer session re-reads a larger history each turn; code change; gain not clear from the data.
- **C. One Opus judge call per run.** Judge cost in round 7 was 0.3 to 0.7 USD per PR. Pro: about 0.2 to 0.4 USD saved per PR. Con: code change and a new prompt to validate.
- **D. One package per PR.** Pro: half the sessions. Con: a bug in the second package is lost.
- **Choice: A first (round 8: #4450, #3831, #4418, 5 USD cap), because it needs no code and tests the largest part.** C is next if the catch on #4450 and #3831 stays.

## N18. Round 8 result (low thinking), the judge prompt cache, and the settings to keep

Round 8 ran the smaller plan with low thinking and the type check.

| PR | Round 7 USD (medium) | Round 8 USD (low) | Round 7 result | Round 8 result |
|---|---|---|---|---|
| #3831 | 0.99 (round 3) | 0.47 | 3 reported, matched | 7 tests, all pass on both revisions |
| #4418 | 2.29 | 1.39 | 3 reported, not matched | 4 weak catches, 0 reported |
| #4450 | 1.98 | 1.77 | 3 reported, matched | 12 weak catches, all judged Low, 0 reported |

Low thinking is about 35% cheaper and loses both stable catches. No type errors remained, so the loss is test quality, not validity.

- **A. Low thinking.** Pro: cheapest. Con: 0 reported catches in three PRs. Rejected.
- **B. Medium thinking (keep).** Pro: keeps the #3831 and #4450 catches in every run. Con: about 2 USD for a PR that changes two packages.
- **Choice: B.**

Judge prompt cache (cost task D, commit 06a3ef1cbb, merged): the judge input now starts with the part that is the same for all catches of a run (intent, diff, PR title and summary); the Anthropic judge marks the end of that part for the provider cache. Options were (1) this, same prompt content, no new validation; (2) one combined judge call per run, larger saving but a new prompt to validate. Chosen: (1). Measured by judging the stored #4450 run of round 7 again: Opus judge 0.435 USD before, 0.286 USD after (39 559 of 94 228 input tokens read from the cache); 2 reported and 12 Low, against 3 reported and 10 Low before. The saving is smaller than expected because the test source, not the diff, is the larger part of each call.

Settings to keep for Hydrogen (file content): `GeneratorEffort: medium`, `Limits.RisksPerSession: 5`, `Limits.PackagesPerPR: 2`, `Limits.TestsPerPackage: 3`, `Limits.RisksPerPackage: 2`, `Judges.Staged: true` (default). Expected cost: about 0.7 USD for a PR that changes one package and about 1.9 USD for two packages. The code defaults are not changed; this is a settings file for the Hydrogen generator.

Cuts that remain, each with a cost in catches or work that the user must weigh:
- One package per PR: about half the cost of a multi-package PR; a bug in the second package is lost.
- A cheaper first judge than Opus: not validated; the stored data only shows that an Opus Low is never reported.
- Shorter test source in the judge input (12 000 characters now): changes what the judge sees.

## N19. Phase 3 rehearsal (task 3.13) and the held-out run

Rehearsal: all steps ran locally on PR #3831 with the real commands (select, the three jobs with bundles in three folders, comment, feedback, recheck). Nothing went to GitHub. 5 tests, 2 reported catches (all three judges High). Job 1 about 285 s, job 2 203 s, job 3 35 s, recheck 302 s. Spend 0.46 USD. One defect fixed with a failing test first: the mutant diff named its files by host folders (fix fc238f2e4f on the design branch). The record is `GATE2-REHEARSAL.md` on the local phase 3 branch.

- Generator for the rehearsal. **A. Sonnet (as the plan said).** Pro: follows the plan. Con: not the model we keep; about 2 USD. **B. Hydrogen with the kept settings.** Pro: rehearses what would be deployed; 0.46 USD. Con: differs from the plan text. Choice: B.
- Spend approval for the rehearsal. The plan asks for the user's approval of the figure. The overnight instruction covers it; ceiling set to 3 USD.

Held-out run. The held-out slice has 15 bug PRs.

- **A. All 15 now.** Pro: the full gate 1 figure. Con: about 25 USD and 4 hours; if the user changes the settings after reading this list (for example one package per PR), no unused held-out PR is left.
- **B. The first 8 in corpus order, cap 16 USD.** Pro: a first held-out figure tonight; 7 PRs stay unused for the final settings; follows the user's earlier instruction to run half the PRs. Con: a smaller sample.
- **C. No held-out run tonight.** Pro: nothing used. Con: no figure outside the tuning PRs.
- **Choice: B.** No setting is changed after this run starts.

## N20. Held-out result and what it means

Result (details in `GATE1.md`): 8 held-out bug PRs, 9.23 USD, mean 1.15 USD per PR. 1 PR has a reported catch that is the known bug (#4120). On #4782 two tests find the bug but the first judge rated them Low. On #4126 and #3381 the reports are not the known bug (not labeled).

Decisions during the run:
- #4120 failed on a network error at `gh pr view`. Options: leave it out, or run it again. Chosen: run it again (same settings, no change between).
- The match step stopped on registry failures in the image build. Options: (A) change `EnsureImage` to use the local image when the build fails; (B) run the step again. Chosen: B tonight, because A changes which image runs untrusted code and needs the user's view; A is listed as a follow-up.

Reading of the result (no setting was changed after it):
- Cost is now near 1 USD per PR on this slice. The catch rate of known bugs is low (1 of 8 reported, 2 of 8 found).
- The first judge is now the step that loses a found bug (#4782 here; #4450 in round 8). The stored data before this night showed that an Opus Low was never reported, but that says nothing about bugs it filters out.
- The next work with the most value is on catch rate, not on cost: what the first judge sees for catches that match the bug, and why the risk notes do not name the bug on most PRs.

## N21. Package choice follows the risk rank

The analyzer ranked the risks, but the package list came from the LLM's own order. On #5481 the top risk named the fix package and that package was not tested.

| Option | For | Against |
|---|---|---|
| A. Keep the LLM's package order | No change | Fix package in the first 2 packages on 14 of 18 PRs |
| **B. Packages of the risks in rank order, then the LLM's list, then other changed packages (chosen)** | 16 of 18 with the same cap; no added cost | A wrong top risk now also moves the package choice |
| C. B and `PackagesPerPR 3` | 17 of 18 | About 50% more generator cost per PR |

Decision: B. C stays open for the user (see N27).

## N22. `Sandbox.BuildImage` setting

A cached `docker build` takes about 1 second but contacts the registry, so a run fails when the registry is not reachable.

| Option | For | Against |
|---|---|---|
| A. Always build | The image is always current | A registry outage stops every run |
| **B. Setting `Sandbox.BuildImage`, default `true`; `false` uses the local image and fails clearly when it is absent (chosen)** | Backtests do not depend on the registry; turn it off by one settings line | A stale local image is used until someone builds again |
| C. Build, and fall back to the local image on failure | No setting to manage | A silent fallback hides a broken build |

Decision: B. `false` is in the backtest settings only. It does not make runs faster.

## N23. Corpus audit and the gate 1 denominator

Two sub agents classified all 45 known-bug entries ([CORPUS-AUDIT.md](CORPUS-AUDIT.md)). A test written on the base revision can find the bug on 12 entries, and on 3 more only with heavy mocking. On 14 the bug was there before the PR, on 14 it is in all-new code, and 2 name the wrong PR. Two verdicts were checked by hand against the code; the rest are not checked by a person.

| Option | For | Against |
|---|---|---|
| A. Keep the target as 25% of all 45 entries | No change to the gate | The ceiling is 27% to 33%, so the target needs almost every possible catch |
| B. Count only entries a base test can find | Measures the tool on what it can do | The denominator rests on sub agent verdicts; looks like moving the goal |
| C. Repair the miner (the fixed lines must exist at the bug head, and behaviour must differ from base) and mine a new corpus | A sound corpus | Days of work; new labels |
| D. Add a second test mode that tests new code on head against the stated intent | Reaches the 14 new-code entries | A design change; no base run to compare with, so false reports are harder to control |

Decision: none taken. This is the user's choice. Results below are reported against both denominators.

## N24. First judge: model and prompt stay

93 stored catches were judged again (18 that match a known bug, 74 others), about 10.1 USD.

| First judge | Known-bug catches passed | Other catches passed | Cost (USD) |
|---|---|---|---|
| **Opus, current prompt (kept)** | 11 of 18 | 18 of 74 | 2.75 |
| Opus, new prompt | 11 of 18 | 25 of 74 | 2.98 |
| GPT-5.1, current prompt | 18 of 18 | 64 of 74 | 0.45 |
| GPT-5.1, new prompt | 18 of 18 | 71 of 74 | — |
| Argon | 6 of 18 | 7 of 74 | 1.28 |
| Sonnet, current prompt | 8 of 18 | 20 of 74 | 1.33 |
| Sonnet, new prompt | 9 of 18 | 29 of 74 | 1.39 |

Decision: keep Opus with the current prompt. GPT-5.1 passes almost everything, so it does not filter. Argon and Sonnet lose known-bug catches. The new prompt adds passes on other catches and none on known-bug catches.

Also rejected: one judge call per group of sibling tests. It removes 76 of 184 calls, but 9 groups have mixed verdicts, so it can lose catches; the judges are only 15% of the cost.

## N25. Proof mutants must be in the changed code; first test uses the exact trigger

In the stored runs, risk tests whose proof mutant was within 10 lines of a changed hunk gave 103 weak catches and 14 matches from 198 tests. Tests with a mutant farther away or in another file gave 0 from 29. On #4126 the test mocked the buggy branch; on #5513 and #5729 the tests used ordinary inputs.

| Option | For | Against |
|---|---|---|
| A. Prompt text only | No code | The model already ignored softer text |
| **B. The run-test tool refuses a mutant more than 10 lines from every changed hunk, and the prompt asks for the exact trigger input first, then other edge inputs, and forbids mocking the changed function (chosen)** | Removes tests that never catch; pushes tests onto the changed lines | A real risk in code that the PR only calls, not changes, can no longer get a proof |
| C. B with a file-level rule (same file is enough) | Fewer refused mutants | Keeps the far-away mutants that gave nothing |

Decision: B, merged to the design branch (`02bc3c6052`). Round V measures it.

## N26. Two sandbox jobs at the same time, and the held-out bug PRs that were kept back

The user approved both on 2026-11-15 to cut about 8 hours of serial runs to about 3.5.

| Option | For | Against |
|---|---|---|
| A. One job at a time, all sets | Earlier rule; no risk to Docker | About 8 hours |
| **B. Two jobs at a time, each 6 CPUs and 12 GB, in two worktrees with separate ledgers and stores (chosen)** | Half the wall time; a trial with #3831 and #4450 ended without errors | Stage times grow a little (prepare base 105 s alone, up to 229 s in the pair); not tested with three jobs |
| **C. Do not run the 7 held-out bug PRs that were kept back (chosen)** | The audit says none can be found; the clean set measures false reports | Those 7 stay unmeasured |

## N27. Rounds V and W: the catch-rate changes are kept, one session per package is rejected

Both rounds ran at the same time on the 10 PRs that a base test can find (#5481, #5513, #5729, #4126, #5703, #3831, #4450, #4120, #5040, #4451). Round V = kept settings with N21 and N25. Round W = the same and `Limits.OneSessionPerPackage` (the DodgyDiff tests are written inside the first risk session of the package).

| | Before (stored runs) | Round V | Round W |
|---|---|---|---|
| Reported catch that is the known bug | 3 of 10 (#3831, #4450, #4120) | 6 of 10 (#3831, #4450, #5481, #4126, #5703, #5513) | 4 of 10 (#3831, #4450, #5481, #4126) |
| Cost per PR (USD) | about 1.15 | 1.13 | 1.00 |

- #5481 and #4450 matched through the fix-merge fallback of the match step. The reports on #5481, #4126, #5703 and #5513 were read and each describes the known bug.
- #4120 was caught before and is missed in both rounds. The new tests assert on the error list, not on the orphan sweep, and the first judge rated them Low as intended behaviour. The stored run had one test of each kind. This looks like variation in which effect the test asserts.
- #5040, #4451 and #5729 are missed in all runs.

| Option | For | Against |
|---|---|---|
| **A. Keep the session structure, keep N21 and N25 (chosen)** | 6 of 10 | No cost cut |
| B. One session per package | 11% cheaper | Loses #5703 and #5513 |

Decision: A. The code for B stays on the local branch `CB-jit-one-session` and is not merged. One run per PR; the 10 PRs were also used to find the miss causes, so this is not a blind result.

## N28. Clean sets: more reports after the catch-rate changes

| Set | Code | PRs | PRs with a report | Reports | Cost (USD) |
|---|---|---|---|---|---|
| Clean, tuning slice | Before N25 (`8a14b23f05`) | 15 | 2 (#3624, #3823) | 4 | 13.32 |
| Clean, held-out slice | Final (`02bc3c6052`) | 15 | 9 (#3525, #3907, #3892, #3872, #3895, #3968, #4123, #4276, #4470) | 18 | 14.05 |

- The two sets hold different PRs, so the rise from 2 to 9 is not a clean measure of N25. It is still the most likely cause: tests now target the changed lines with edge inputs.
- A "clean" PR in the corpus means that no later fix PR was linked to it. It does not mean that the PR has no bug. Several reports read as real defects (for example #3872: a trailing slash in the migrations directory cuts the first letter of each file name; #4123: a caller filter with `or` is joined without parentheses). Others rest on unlikely inputs (#3872 `..` path, #4470 a test subclass).
- No report is labelled by a person yet. The false report rate of gate 1 needs those labels.

| Option | For | Against |
|---|---|---|
| **A. Keep N25 and label the 22 reports (chosen, pending the user)** | Keeps the catch gain; the labels say if the reports have value | Up to 9 of 15 clean PRs get a comment, which is too many if most are false |
| B. Run the tuning clean set again with the final code | Separates the effect of N25 from the PR mix | About 13 USD and 2 hours |
| C. Report only catches with median High | Cuts 7 of the 18 held-out reports; all 6 known-bug PRs in round V keep a report only if their catch is High (#5703 is Medium and would be lost) | Loses #5703 |

Decision: A, with B and C open for the user.

## N29. Provisional labels for the clean reports

The 22 clean reports of N28 were labelled by sub agents (Opus), not by the PR authors. See [CLEAN-LABELS.md](CLEAN-LABELS.md). Held-out slice with the code of N28: 9 of 15 PRs had a report that is *Intended* or *TestFault* (60%; the gate is 10% or less).

| Option | For | Against |
|---|---|---|
| **A. Use these labels to steer the work, and do not record them (chosen)** | The work can continue in the night; the label store stays clean | The labels have noise: two labelers gave different labels for #3872 and for one #3895 test |
| B. Wait for author labels | Correct by the design | No progress until the authors answer |
| C. Record the labels in the label store | The report command can use them | They are not author labels |

Decision: A. All rates below use provisional labels.

## N30. Judges read the PR body and the commit messages; judge prompt with an intent and reachability checklist

Most false alarms were behaviour that the PR text states on purpose, or a test input that no real caller sends. The judges had only the PR title and the diff summary.

| Option | For | Against |
|---|---|---|
| A. Keep the judge prompt (p0) | No change | 9 of 15 held-out clean PRs with a false alarm |
| B. Shorter prompt that asks only "is this intended" (p2) | Small | Offline it removed fewer false alarms than C |
| **C. Checklist prompt (p3): first "does the PR text or a code comment state this behaviour", then "can a real caller send this input"; the PR body and commit messages (4000 characters at most) are in the input (chosen)** | Offline on the stored catches: false-alarm PRs 9 → 5 of 15; all matched catches of round G were still reported | The judges cannot read callers, so reachability is a guess (see N32) |

Decision: C. Code: `GitRepo.Messages`, `ChangeAnalysis.CommitMessages`, `JudgePanel`, `BucketJudge`.

## N31. Generator rule "use only inputs a real caller can send": tried and removed

| Option | For | Against |
|---|---|---|
| A. Add the rule to the generator prompt | Fewer tests on unreachable inputs | Two runs of the 10 known-bug PRs gave 2 and 3 matched reports; the false-alarm PRs on the held-out clean set were 5 of 15, the same as p3 alone gives offline |
| **B. No rule in the generator; the judges and the caller check decide (chosen)** | Keeps the edge-input tests that find the known bugs | The generator still writes tests that are rejected later (cost of the judge calls) |

Decision: B. Note: round G (no rule) gave 3 of 10, so the difference between 6 (round V) and 2 to 3 is mostly run-to-run variation of the generator, not the rule. In round G the generator wrote a matching test for only 3 of the 10 PRs, and all 3 were reported.

## N32. Caller check: one model with read tools on the head revision

A judge without code access cannot see the callers. The caller check gives one model (`claude-opus-5-5`) two tools, `read_file` and `grep`, on the PR head revision through git. It labels each reported catch *Bug*, *Intended* or *TestFault* with a confidence. Setting: `Judges.CallerCheck` (default off). Cost: about 0.09 to 0.14 USD for each checked catch, 3 to 4 model turns.

| Option | For | Against |
|---|---|---|
| A. No check | No cost | Held-out clean: about 5 of 15 PRs with a false alarm |
| B. Report only when the check says *Bug* | Lowest false-alarm rate | Loses real catches where the check is not sure |
| **C. Report when the check says *Bug*, or the check failed, or (confidence is not High and the judge median is High) (chosen)** | Offline on 36 labelled stored catches: false-alarm PRs 2, real-bug catches kept 6 of 8, known-bug PRs kept 4 | One *Intended* report stayed on #3801 in round G |
| D. Give the tools to all three judges | One stage | About 3 times the cost; the first prompt version (v1) was also too strict |

Decision: C, with prompt version 3 (v1 dropped 4 of 8 real-bug catches; v3 dropped 2). Stability: a second run on the same 36 catches gave the same *Bug* / not-*Bug* answer on 34. The prompt was tuned on these 36 catches, so round H (N35) is the first fair test.

## N33. Four lanes and the early stop of the first clean rerun

- Four parallel lanes gave the same throughput as three (8 to 9 PRs each hour); the disk is the limit. Three lanes are used.
- The rerun of the tuning clean set with the code of N28 was stopped after 3 PRs (2.28 USD) on the user's instruction, to use the time for N30 to N32.

## N34. Round G: known-bug PRs and tuning clean set, generator of N25, judge prompt p3

| Set | PRs | PRs with a report | Result | Cost (USD) |
|---|---|---|---|---|
| Known bugs (10 that a base test can find) | 10 | 5 (#5481, #4450, #5703, #4120, #5729) | 3 matched: #5481, #4450, #4120 | 12.96 |
| Clean, tuning slice | 15 | 3 (#3624, #3823, #3801) | 1 PR with a false alarm (#3801: one *Bug*, one *Intended*) = 7% | 12.76 |

- #3624 and #3823 are the same defects as in N28 (*Bug*).
- With the caller check (rule C): the clean set is the same (the *Intended* report on #3801 stays because the judge median is High and the check confidence is Medium). On the known-bug PRs the check keeps #4120 and rejects #5481 and #4450 as *Intended*.

**The conflict.** The catches on #5481, #4450 and #5703 show behaviour that the PR text states on purpose (for example "10,000-entry ceiling, oldest dropped"). A later fix PR changed that behaviour, so the corpus counts them as bugs. A catch of this kind on a clean PR is a false alarm by the gate definition. The tool cannot tell the two apart; only the author can.

| Option | Known-bug catch (of 10, one run) | Clean PRs with a false alarm | Note |
|---|---|---|---|
| A. Report stated-intent catches (judge prompt p0, no check) | about 6 | about 9 of 15 held-out | Fails the false-alarm gate |
| B. Judge prompt p3, no check | 2 to 3 | 5 of 15 held-out (offline), 1 of 15 tuning | |
| C. Judge prompt p3 and caller check | 1 to 4 | 1 to 2 of 15 held-out (offline), 1 of 15 tuning | Lowest false alarms |
| D. Two classes: "likely bug" (passes the check) as a normal comment, "stated behaviour, please confirm" as a short low-priority note | Both counts can be reported | The gate definition must say which class counts | Not built |

Decision: open for the user. The code has B as the default and C as a setting.

## Spend ledger for the night

| Round | What | Model spend (USD) | Running total |
|---|---|---|---|
| 0 | Hydrogen #5897 (first run) + one failed #3831 attempt | 3.42 | 3.42 |
| A1 | Analyzer only, 30 tuning bug PRs, Sonnet | 2.65 | 6.07 |
| 1 | Hydrogen, new pipeline: #3831, #5906, #4450, #5513 | 10.09 | 16.16 |
| 2 | Hydrogen, all cost changes, thinking low: #3831, #5906, #5513 | 1.18 | 17.34 |
| 3 | Hydrogen, thinking medium, shared session, type check: #3831, #5906, #5513 | 2.19 | 19.53 |
| 4 | Hydrogen, thinking medium, one session per risk: #5906 (two attempts), #5513 | 2.83 | 22.36 |
| 5 | Hydrogen, default thinking, shared session: #5906, #5513, #3831 | 3.90 | 26.26 |
| M | Match checks, rounds 1 and 3 to 5 (no model spend) | 0.00 | 26.26 |
| 6 | Validation, candidate A: #4253, #4418, #4450, #4290 (stopped at the cap) | 11.36 | 37.62 |
| 7 | Smaller plan (N16 B): #4418, #4450, #4290, #3644, #5729 | 10.34 | 47.96 |
| 8 | Smaller plan, low thinking: #3831, #4418, #4450 | 3.63 | 51.59 |
| J | Judge-only rerun of the stored #4450 run (prompt cache check) | 0.34 | 51.93 |
| R | Phase 3 rehearsal, PR #3831 (task 3.13) | 0.46 | 52.39 |
| H | Held-out, first 8 bug PRs, kept settings | 9.23 | 61.62 |
| JE | First-judge comparison on 93 stored catches (7 judge and prompt pairs) | 10.10 | 71.72 |
| C | Clean, tuning slice, 15 PRs, code before N25 | 13.32 | 85.04 |
| V | Catch-rate validation, 10 PRs | 11.26 | 96.30 |
| W | One session per package, 10 PRs | 10.01 | 106.31 |
| HC | Clean, held-out slice, 15 PRs, final code | 14.05 | 120.36 |
| L | Label sub agents for the clean reports (Claude Code session, no API spend) | 0.00 | 120.36 |
| JP | Judge prompt trials p0, p2, p3 on stored catches | about 4 | about 124 |
| TC | Tuning clean rerun, stopped after 3 PRs | 2.28 | about 127 |
| FY/FZ | Held-out clean, generator rule + p3, 15 PRs | 14.01 | about 141 |
| FX1 | Known bugs, generator rule + p3, 10 PRs | 12.31 | about 153 |
| FX2 | Known bugs, second run | 13.96 | about 167 |
| CC | Caller check trials (v1, v2, v3, repeat) and match steps | about 17 | about 184 |
| G | Known bugs 10 PRs + tuning clean 15 PRs, generator of N25 + p3 | 25.72 | about 210 |
| GC | Caller check on round G (offline and real stage) | about 4 | about 214 |
