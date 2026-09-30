# Phase 3–5 results: the consumers measured, and their thresholds set from data

**Date:** 2026-09-29.
**Plan:** `typed-decision-models.md`, Tasks 3.1, 3.4, 3.8, 4.6, 5.4 and 5.5.
**Follows:** `typed-decision-phase2-results.md`, which measured and calibrated conversation routing.

Phase 2 set routing's threshold from data, and left every other consumer on a placeholder: `finishIf` 0.9, Sage discovery 0.7, the duplicate "Uncertain" band 0.5, and the pipeline escalation floors. This round gives each of them a labelled corpus and a measurement. Where the data supports it, it replaces the placeholder with a calibrated threshold.

Every measurement:
- **runs production's own code path,** rather than a reimplementation, so it measures what ships;
- **pins each decision model,** with failover off. The one exception is the Feature Pipeline measurement (§3). It ran through each pipeline's own prompt bindings, and didn't record which model answered. Its Decision arm's latency (172 ms p50) and cost ($0.025 per 1k) match Jev, not LLM Decision. The rig now records the answering model and can fail on a mismatch (#4890);
- **repeats every point** (2–3 reps);
- **names records by ID only.** Corpora and reports stay outside the repository.

## Summary

| Consumer | Plan task | Corpus | Result | Threshold now | PRs |
|---|---|---|---|---|---|
| Sage agent discovery | 3.1 | 258 requests, 33 agents | Jev picks the right agent 77% of the time; semantic search 30% | calibrated 0.85 (was raw 0.7) | #4892, #4893 |
| Duplicate check at entry | 3.8 | 160 new records, 5 candidates each | Jev: 97% precision at 70% recall (out of fold); the vector threshold alone flags everything | calibrated 0.7 (was raw 0.5); pre-filter 0.3 | #4894, #4896 |
| finishIf gate | 4.6 | replay of 739 gated action rounds | at 0.9 it ends 22% of rounds the agent continued | opt-in (`finishIfMode`, default off; shadow to measure) | #4895, #4814 |
| LLM vs Decision pipelines | 5.5 | 117 and 198 labelled rows | Decision matches or beats the LLM at ¼ the latency and ⅓ the cost | — | #4890 |
| Escalation floors | 5.4 | the same | escalating to the LLM didn't help on either task | no floor recommended yet | #4890 |
| Self-reported `confidence` | 3.4 | 546 recorded loop turns; 337 memory notes | the loop's carries no usable signal; Jev gates memory notes better than the extraction's own | loop: don't gate on it; memory: Jev at calibrated 0.6, opt-in | #4897 |

## 1. Sage agent discovery (Task 3.1)" up to, not including, "## 2. The duplicate check at entry".
The Summary table's discovery row still holds as written (77% vs 30%; calibrated 0.85, was raw 0.7).
Source: the 2026-09-29 run re-scored on 2026-09-30 from its stored per-run results
(~/Projects/decision-eval-runs/discovery-rescore-2026-09-30/), no new model calls.
-->

## 1. Sage agent discovery (Task 3.1)

**The corpus:** 258 requests written by Gemini 3 Flash for the 33 agents discoverable in a development database:
- 198 are meant for one agent;
- 60 are meant for none: small talk, questions the conversation manager answers directly, and multi-agent workflows.

Labels come from construction. The catalog includes development fixtures, so absolute numbers depend on it; the comparisons are what carry over.

**The cells:** Jev and LLM Decision, each pinned, three reps; and the semantic search that `Find Candidate Agents` runs, which is what the old two-turn flow started from.

**Scored as production scores it (re-scored 2026-09-30).** Production gives up on discovery after 1,500 ms, and that limit covers building the options, including the semantic search, as well as the call. The first scoring counted every answer, however late. Every figure below counts an answer that came after the limit as injecting nothing. The re-score used the stored runs, with no new model calls. Each run's stored duration also includes writing the test-run rows, so it overstates the discovery a little. So LLM Decision's on-time rate and coverage below are lower bounds, and a re-run with the fixed eval gives exact figures.

| Cell | Top-1 [95% CI] | Call p50 / p95 | Discovery within 1,500 ms | Repeatability |
|---|---|---|---|---|
| **Jev** | **0.769** [0.715, 0.828] | 185 / 274 ms | 99.9% (all but the run's first, which loaded the embedding model) | 0.981 |
| LLM Decision | 0.646 [0.582, 0.709] | 1,200 / 2,275 ms | 67.7% to 73.6% | 0.906 |
| Semantic search (first row) | 0.298 [0.237, 0.364] | 100 / 132 ms | — | — |

- **The decision picks the right agent 2.6× as often as semantic search.** In 27 runs (9 requests), the labelled agent wasn't among the options, because the search narrows 33 agents to the 25 the Choice allows. Those count against every cell.
- **LLM Decision often misses the limit.** On its call time alone, 73.6% of its answers came within 1,500 ms. Counting the semantic search too, at least 67.7% did. So as Jev's failover, LLM Decision loses between a quarter and a third of discoveries to the timeout, and those inject nothing. Jev is unaffected: its call took 274 ms at p95.
- **The placeholder threshold barely fired.** Discovery injects its suggestion only when the Choice's confidence and the any-applies Likelihood both reach the threshold. Jev's raw any-applies Likelihood never passed 0.8, so on raw probabilities 0.7 covered 6.9% of agent requests. LLM Decision's raw 0.7 covered 26.4% on time, not the 33.2% first reported.
- **Calibrated per model, it works:**

  | At a calibrated threshold | Jev: coverage / precision / false injections | LLM Decision |
  |---|---|---|
  | 0.80 | 33.0% / 94.9% / 8.9% | 20.9% / 89.5% / 6.1% |
  | **0.85** | **21.7% / 95.3% / 5.0%** | 16.0% / 92.6% / 5.0% |
  | 0.90 | 10.1% / 95.0% / 3.3% | 7.9% / 91.5% / 2.8% |

  Coverage is the share of agent requests that get the suggestion. Precision is the share of those that name the right agent. False injections are the share of no-agent requests that got one. Jev's were all multi-agent workflows; LLM Decision's were 8 workflows and 1 direct question.

  Calibration is out of fold: each request is scored by a fit that never saw it.
  - **LLM Decision's figures moved because of the timeout.** At 0.85, coverage fell from 19.0% to 16.0%, and it stays between 16.0% and 16.8% however much of the stored duration is overhead.
  - **Jev's figures moved for a different reason.** The first table's folds depended on the order the database returned the runs. They are now dealt from the requests in ID order. On the same runs, Jev's coverage at 0.85 ranged from 21.5% to 23.7% with the read order. Read these figures as ±2 points.
- **The fits converged.** The first scorecard reported LLM Decision's any-applies fit as not converged. The fit was already at its optimum, but float rounding stalled the harness's convergence check. With that fixed, all four fits converge in 5 to 7 iterations, and a 60-digit refit agrees with the shipped constants to 4 places. The constants are unchanged.
- **The setting (#4893):**
  - per-model Platt calibration of both answers, each tied to the exact model it was fitted on: Jev at its pinned `typesafe/jev-1.13-20260917`, and LLM Decision only when its GPT-OSS-120B chat model answered;
  - the threshold at a calibrated 0.85;
  - an answer from any other model is treated as unsure, and discovery warns once per such model.

  A wrong suggestion costs more than a missed one, because a missed one is only the two-turn flow the agent already used. So precision decided it. The corrected scoring doesn't change the choice: Jev's precision is about 95% from 0.80 to 0.90, and 0.85 cuts false injections from 8.9% to 5.0% while keeping twice the coverage of 0.90.

## 2. The duplicate check at entry (Task 3.8)

**The corpus:** 160 new records for `MJ: Actions`, written by Gemini 3 Flash from the entity's own rows:
- **80 duplicates:** a rewrite of one existing row, as a person re-entering it would type it;
- **80 new records:** similar actions that don't exist. These were screened only for an exact match with existing rows. One may already exist under other wording, and a correct flag on it would then count as a false flag.

Each record went through the entry check's own retrieval: 5 vector candidates, all above `PotentialMatchThreshold`, and every duplicate's source among them. Then three arms judged the same candidates. Every calibrated row is scored **out of fold**: each candidate is calibrated by a Platt fit that never saw it.

| Arm | Precision | Recall | False flags on new records | p50 / p95 | $ / 1k checks |
|---|---|---|---|---|---|
| Vector threshold (0.7) | 0.10 | 1.00 | 100% | 6 / 13 ms | 0 |
| Prompt (`Duplicate Resolution`) | 0.64 | 0.70 | 40.0% | 718 / 1,209 ms | 1.77 |
| Decision, Jev, raw 0.5 | 0.64 | 1.00 | 57.5% | 198 / 296 ms | 0.24 |
| **Decision, Jev, calibrated 0.7** | **0.97** | **0.70** | **2.5%** | 198 / 296 ms | 0.24 |
| Decision, LLM Decision, calibrated 0.7 | 0.74 | 0.36 | 12.5% | 569 / 1,213 ms | — |

- **The vector threshold alone can't separate a duplicate from a similar record:** every candidate for an action scored above 0.7 with this embedding model.
- **Jev ranks candidates almost perfectly** (AUC 0.993; LLM Decision 0.971), but its raw probabilities run high for similar records. At the raw 0.5 band it flagged more than half of the new records. Calibration fixes that.
- **The measurement counts what production would show.** A candidate the decision gave no answer for is flagged, and a failed decision flags nothing, as in the entry check. Both are reported. Neither run had either: no decision call failed, and every candidate was answered. The prompt gave no verdict for 2 of 800 candidates, and these count as not flagged.
- **Latency is a lower bound.** The vector query plus Jev's decision had a p95 of 304 ms, and every check was within the 1,500 ms budget; with LLM Decision, 96.6% were. These times leave out building the record, the permission check and loading the candidates, which the entry check also does. The measurement now times the whole path, but these runs predate that.
- **The Prompt mode is slower, costlier and less precise** than calibrated Decision here. It still owns what Decision doesn't do: `Merge`, the survivor and the field map.
- **The setting (#4896):**
  - per-model calibration of the duplicate Likelihood, fitted on every candidate: Jev (`typesafe/jev-1.13-20260917`) at A 2.5855, B −4.4485; LLM Decision (through its `LLM Decision` prompt) at A 0.9918, B −1.4843;
  - the entry and `Decision`-mode band at a calibrated **0.7**, which favours precision because a flag asks a person to look. Out of fold, it's where false flags fall from 15% (at 0.6) to 2.5% at 96.6% precision; at 0.8, recall falls to 31% with no gain in precision;
  - the `DecisionThenPrompt` pre-filter at a calibrated **0.3**, which keeps recall, since the prompt reasons over what survives. Jev kept 98.8% of true duplicates and passed 14.8% of candidates.
  - **An uncalibrated model flags nothing at entry,** as a failed decision does: its raw probabilities can't be banded, and flagging every candidate would be the vector threshold alone. The provider logs the missing calibration once per model. Batch `Decision` mode sends such a model's candidates for review, and `DecisionThenPrompt` passes them all to the prompt.

---

## 3. LLM against Decision Feature Pipelines (Tasks 5.5 and 5.4)

**The setup:** the same rows run through `InferProcessor` twice, with identical specs except `PipelineType`, two reps, and nothing written back. The labels are objective: the value already stored in another field.
- **The LLM pipeline** used a local prompt on Gemini 3.1 Flash-Lite.
- **The Decision pipeline** used `Default Decision` (Jev).

Both saw the same value descriptions.

| Task | Rows | Accuracy LLM / Decision | Agreement | p50 LLM / Decision | $ / 1k LLM / Decision |
|---|---|---|---|---|---|
| An action's vendor category (4 values) | 198 | 100% / 100% | 100% | 658 / 174 ms | 0.086 / 0.026 |
| An action's functional category (4 overlapping values) | 117 | 38.5% / 44.4% (CIs overlap) | 81.6% | 709 / 172 ms | 0.083 / 0.025 |

- **Where the categories are distinct,** Decision matches the LLM at about a quarter of the latency and a third of the cost. Its confidence is exact: ECE 0, every answer at 0.9 or more.
- **Where the categories overlap** ("System", "Data", "Utilities"), the two types agree with each other far more than with the stored labels, which points at the labels. Decision's confidence isn't calibrated there (ECE 0.28): at 0.9 or more, it's right 70% of the time.
- **Escalation (Task 5.4)** — Decision's answer, or the LLM's when Decision's confidence is below a floor — helped on neither task:
  - on the clear one, nothing fell below any floor;
  - on the ambiguous one, the LLM was no better than Decision.

  **No floor is recommended yet.** Escalation needs a task where the LLM is materially better than Decision, and Decision's confidence calibrated for that task.
- **Recommendation:** `Decision` is a sound default for an enum output whose values are distinct. Keep `LLM` where they overlap, until a per-task calibration exists.

## 4. The finishIf gate (Task 4.6)

**The corpus:** the Phase −1 clean-room traffic (simulated users on real MJ agents) holds 999 recorded **action rounds**: the actions one loop turn asked for, and the turn after them. The label is behavioural, as the plan asks:
- `finish` when the next turn ended the run without asking for more actions (286 rounds);
- `continue` otherwise (713 rounds).

Production's code checks never gate 260 rounds, where an action failed or may have returned AIDirectives. That left **739 gated rounds** (253 finish, 486 continue). Each was replayed twice from its recorded results, through production's own state formatter, questions and pass rule (moved into `@memberjunction/ai-agents` as pure functions), with the gate evaluated and not acted on.

**Two arms:**
- **Authored.** The recorded runs predate `finishIf`, so Gemini 3 Flash wrote one per round. It saw the turn that asked for the actions and the loop agent's own `finishIf` guidance, but never the results or the label.
- **Generic.** One fixed question: "The action results fully complete what the user asked for".

| Arm | AUC [95% CI] | At the production 0.9: finish rounds skipped | Continue rounds ended early | Precision |
|---|---|---|---|---|
| Authored | 0.704 [0.661, 0.746] | 48.6% | **22.4%** | 53.0% |
| Generic | 0.632 [0.585, 0.681] | 0% (nothing passes) | 0% | — |

- **The gate itself is cheap and stable:** p50 181 ms, p95 367 ms, $0.034 per 1,000 rounds, 99.5% verdict agreement across reps. On the rounds it lets finish, it saves about 2.0 s and $0.0045 of LLM turn per round.
- **But it can't reliably tell done from not done from the results alone.**
  - At the production 0.9, the authored gate would have ended **22% of the rounds where the agent went on to act**, while skipping 49% of the rounds it could have closed.
  - A stricter threshold doesn't fix that: at 0.95 it is 18% and 41%.
  - Calibration doesn't either: calibrated, no threshold reaches 70% precision with meaningful coverage.
  - The generic question discriminates worse still.
- **Re-scored after review (2026-09-30), from the cached decisions, with no model calls.** The replay now also excludes rounds production never gates: a ForEach or While loop's iterations, actions after any other kind of turn, and non-Loop agents' runs. None of those occur in this corpus, so every figure above stands. Two further notes:
  - **The decisions weren't pinned.** They ran through `Default Decision` with failover, but Jev answered all 2,956 of them.
  - **Chat replies are counted as `finish`.** Of the 129 finish rounds whose next turn was a Chat reply, 67 pass at 0.9. If a Chat reply counts as `continue` instead, the gate ends **28.6%** of the rounds where the agent went on to act (not 22.4%), and skips 45.2% of the rest (not 48.6%). That strengthens the case for opt-in.
- **This overstates the risk in one way.** The replay wrote a gate for **every** round, while a live loop model attaches `finishIf` only when it expects to finish, so many of these `continue` rounds would never carry a gate.
- **It understates the risk in another.** A false finish returns the model's pre-written message in place of work the agent went on to do.

**Recommendation:**
- **Don't rely on `finishIf` at 0.9 by default.** The milestone planned it on by default at 0.9 per question, on Amith's direction. After this replay it shipped opt-in instead (see below).
- **Make it opt-in per agent until it is measured with live-authored gates,** using the Prompt Eval corpus with the gate recorded and not acted on, as §5 of the plan proposes. Keep 0.9 for the agents that opt in; per-model calibration doesn't help here.
- **Try a narrower gate** (Amith's review): let finishIf end a run only when the finish condition can also be checked in code, not by reading intent alone (plan rule 6).
- **Done on the train (`e250baf527`):** a Loop prompt param, `finishIfMode`, defaults to `off`. `shadow` evaluates and records every gate without acting, to measure an agent's own gates on real traffic, and `on` acts as before.

## 5. The loop agent's self-reported `confidence` (Task 3.4)

**The data:** 549 recorded loop turns in the Phase −1 clean-room traffic carry `confidence` (546 fall in the bands below). Two things stand out:
- **The values cluster at the top:** 38% are 1.0, and about 90% are 0.9 or more.
- **Some turns use a 0–100 scale instead of 0–1.**

**Against the one outcome recorded for every turn,** whether its run succeeded (bands after normalising the scale):

| Reported confidence | Turns | In runs that succeeded |
|---|---|---|
| below 0.90 | 29 | 34.5% |
| 0.90–0.94 | 140 | 12.1% |
| 0.95–0.99 | 170 | 45.3% |
| 1.00 | 207 | 37.2% |

It isn't even monotonic. Run success is a crude proxy for whether a turn was right, but a number that is nearly constant and unrelated to outcomes can't carry a threshold.

**Recommendation:** don't make the loop agent's `confidence` load-bearing. Where a gate is needed, ask a typed decision, as `finishIf` does.

### The Memory Manager's note gate (#4897)

The Memory Manager keeps an extracted note when the extraction prompt's own `confidence` is at least 80. #4897 measures that against a typed Likelihood per note, on 60 synthetic conversations with 337 candidate notes labelled durable (153), ephemeral (true, but only about this conversation), wrong or speculative. Two repeats per model.

| Gate | AUC | Precision | Recall | Ephemeral kept | Wrong kept | Speculative kept |
|---|---|---|---|---|---|---|
| Self-reported ≥ 80 (today) | 0.969 | 0.853 | 0.987 | 40.0% | 0% | 0% |
| **Jev, calibrated 0.6** | **0.991** | **0.961** | 0.954 | **6.2%** | 0% | 3.4% |
| LLM Decision, calibrated 0.6 | 0.908 | 0.814 | 0.856 | 16.9% | 11.5% | 20.7% |

- **Unlike the loop agent's turn-level `confidence`, the extraction prompt's per-note confidence is informative.** Jev's gate is still better: it mostly stops conversation-only details from becoming durable memory.
- **LLM Decision is worse than the self-report,** so only Jev is calibrated. A batch answered by any other model falls back to the self-reported rule, as a failed call does.
- **The first run caught a design bug.** With every question worded the same and the note only in the state, Jev's answers were at chance (AUC 0.51), because a native driver may answer each question on its own. Each question now quotes its note.
- **The gate ships off** (`EnableDecisionGate`). The corpus and the self-reported scores came from the same model family, which may flatter the self-report, so refit on real extraction data before turning it on by default.

## Findings across consumers

1. **Calibrate every consumer, per model.** On all three new decisions, raw probabilities were biased (discovery's Likelihood compressed below 0.8, duplicates' inflated), while ranking was good (AUC 0.77–0.99). Every threshold set here is on calibrated probabilities, and an uncalibrated model is treated as unsure (the duplicate entry check shows nothing for it).
2. **Jev beats LLM Decision on every task:** more accurate, 3–6× faster, and cheaper. LLM Decision stays the failover.
3. **Thresholds follow the cost of each kind of mistake.**
   - When a wrong action costs more than a missed one (injecting the wrong agent, flagging a record that isn't a duplicate), the threshold favours precision.
   - When a later stage checks the result (the `DecisionThenPrompt` pre-filter), it favours recall.
4. **A cheap first-stage signal can be useless on its own:** vector similarity for duplicates, and semantic search for discovery. The decision is what separates the candidates.

## Limitations

- **The corpora are synthetic**, written by an LLM from MJ's own metadata or recorded simulated traffic. Refit each calibration on real, consented, labelled data before relying on the numbers.
  - **Where real data comes from.** Client MJ usage data never comes back to Blue Cypress, so pooling client traffic is off the table. There are two options:
    - refit on our own dogfood tenants;
    - calibrate inside each client's instance.
  - **Where the calibrations live today:** in code. `FindDecisionCalibration` (`@memberjunction/ai-core-plus`, #4876) does the lookup, keyed to the exact model the fit came from. Routing (#4876), discovery (#4893) and duplicates (#4896) each pass it their own table. The memory gate (#4897) still keys its table by model name alone.
  - **Calibrating per instance** needs those parameters stored as per-instance metadata, with the code constants as defaults, plus a scheduled refit job over the instance's own labelled outcomes. That fits with the MJ Care Canon-audit work.
- **The development catalog includes test fixtures,** which shape discovery's options.
- **The duplicate measurement covers one entity** (`MJ: Actions`).
- **Some cost is missing.** On branches without #4880, LLM Decision's chat cost isn't linked to its decision run, so its cost per 1,000 is missing from some tables.
- **Latencies are measured in-process** against a local database. The duplicate entry check's were timed without the record build, the permission check and the candidate load.
