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
