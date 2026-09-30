# Phase 3–5 results: the consumers measured, and their thresholds set from data

**Date:** 2026-09-29.
**Plan:** `typed-decision-models.md`, Tasks 3.1, 3.4, 3.8, 4.6, 5.4 and 5.5.
**Follows:** `typed-decision-phase2-results.md`, which measured and calibrated conversation routing.

Phase 2 set routing's threshold from data, and left every other consumer on a placeholder: `finishIf` 0.9, Sage discovery 0.7, the duplicate "Uncertain" band 0.5, and the pipeline escalation floors. This round gives each of them a labelled corpus and a measurement. Where the data supports it, it replaces the placeholder with a calibrated threshold.

Every measurement:
- **runs production's own code path,** rather than a reimplementation, so it measures what ships;
- **pins each decision model,** with failover off;
- **repeats every point** (2–3 reps);
- **names records by ID only.** Corpora and reports stay outside the repository.

## Summary

| Consumer | Plan task | Corpus | Result | Threshold now | PRs |
|---|---|---|---|---|---|
| Sage agent discovery | 3.1 | 258 requests, 33 agents | Jev picks the right agent 77% of the time; semantic search 30% | calibrated 0.85 (was raw 0.7) | #4892, #4893 |
| Duplicate check at entry | 3.8 | 160 new records, 5 candidates each | Jev: 97% precision at 71% recall; the vector threshold alone flags everything | calibrated 0.7 (was raw 0.5); pre-filter 0.3 | #4894, #4896 |
| finishIf gate | 4.6 | replay of 739 gated action rounds | at 0.9 it ends 22% of rounds the agent continued | recommend opt-in (product decision) | #4895 |
| LLM vs Decision pipelines | 5.5 | 117 and 198 labelled rows | Decision matches or beats the LLM at ¼ the latency and ⅓ the cost | — | #4890 |
| Escalation floors | 5.4 | the same | escalating to the LLM didn't help on either task | no floor recommended yet | #4890 |
| Self-reported `confidence` | 3.4 | 546 recorded loop turns | carries no usable signal | don't gate on it | — |

## 1. Sage agent discovery (Task 3.1)

**The corpus:** 258 requests written by Gemini 3 Flash for the 33 agents discoverable in a development database:
- 198 are meant for one agent;
- 60 are meant for none: small talk, questions the conversation manager answers directly, and multi-agent workflows.

Labels come from construction. The catalog includes development fixtures, so absolute numbers depend on it; the comparisons are what carry over.

**The cells:** Jev and LLM Decision, each pinned, three reps; and the semantic search that `Find Candidate Agents` runs, which is what the old two-turn flow started from.

| Cell | Top-1 [95% CI] | p50 / p95 | Within the 1,500 ms timeout | Repeatability |
|---|---|---|---|---|
| **Jev** | **0.769** [0.710, 0.823] | 185 / 274 ms | 100% | 0.981 |
| LLM Decision | 0.646 [0.581, 0.712] | 1,200 / 2,275 ms | 73.6% | 0.906 |
| Semantic search (first row) | 0.298 [0.232, 0.359] | 100 / 132 ms | — | — |

- **The decision picks the right agent 2.6× as often as semantic search.** In 27 runs (9 requests), the labelled agent wasn't among the options, because the search narrows 33 agents to the 25 the Choice allows. Those count against every cell.
- **The placeholder threshold barely fired.** Discovery injects its suggestion only when the Choice's confidence and the any-applies Likelihood both reach the threshold. Jev's raw any-applies Likelihood never passed 0.8, so on raw probabilities 0.7 covered 6.9% of agent requests.
- **Calibrated per model, it works:**

  | At a calibrated threshold | Jev: coverage / precision / false injections | LLM Decision |
  |---|---|---|
  | 0.80 | 33.5% / 94.0% / 10.0% | 25.9% / 90.9% / 5.6% |
  | **0.85** | **23.7% / 95.7% / 6.7%** | 19.0% / 91.2% / 4.4% |
  | 0.90 | 13.6% / 96.3% / 5.0% | 6.6% / 89.7% / 1.7% |

  Coverage is the share of agent requests that get the suggestion. Precision is the share of those that name the right agent. False injections are the share of no-agent requests that got one; Jev's were all multi-agent workflows.
- **The setting (#4893):**
  - per-model Platt calibration of both answers;
  - the threshold at a calibrated 0.85;
  - an uncalibrated model's answer treated as unsure.

  A wrong suggestion costs more than a missed one, because a missed one is only the two-turn flow the agent already used. So precision decided it.

## 2. The duplicate check at entry (Task 3.8)

**The corpus:** 160 new records for `MJ: Actions`, written by Gemini 3 Flash from the entity's own rows:
- **80 duplicates:** a rewrite of one existing row, as a person re-entering it would type it;
- **80 new records:** similar actions that don't exist.

Each record went through the entry check's own retrieval: 5 vector candidates, all above `PotentialMatchThreshold`, and every duplicate's source among them. Then three arms judged the same candidates.

| Arm | Precision | Recall | False flags on new records | p50 / p95 | $ / 1k checks |
|---|---|---|---|---|---|
| Vector threshold (0.7) | 0.10 | 1.00 | 100% | 6 / 13 ms | 0 |
| Prompt (`Duplicate Resolution`) | 0.64 | 0.70 | 40.0% | 718 / 1,209 ms | 1.77 |
| Decision, Jev, raw 0.5 | 0.64 | 1.00 | 57.5% | 198 / 296 ms | 0.24 |
| **Decision, Jev, calibrated 0.7** | **0.97** | **0.71** | **2.5%** | 198 / 296 ms | 0.24 |
| Decision, LLM Decision, calibrated 0.7 | 0.74 | 0.40 | 13.8% | 569 / 1,213 ms | — |

- **The vector threshold alone can't separate a duplicate from a similar record:** every candidate for an action scored above 0.7 with this embedding model.
- **Jev ranks candidates almost perfectly** (AUC 0.993; LLM Decision 0.971), but its raw probabilities run high for similar records. At the raw 0.5 band it flagged more than half of the new records. Calibration fixes that.
- **The entry check** (retrieval plus Jev) had a p95 of 304 ms; every check was within the 1,500 ms budget. With LLM Decision, 96.6% were.
- **The Prompt mode is slower, costlier and less precise** than calibrated Decision here. It still owns what Decision doesn't do: `Merge`, the survivor and the field map.
- **The setting (#4896):**
  - per-model calibration of the duplicate Likelihood;
  - the entry and `Decision`-mode band at a calibrated **0.7**, which favours precision because a flag asks a person to look;
  - the `DecisionThenPrompt` pre-filter at a calibrated **0.3**, which keeps recall, since the prompt reasons over what survives (Jev kept 98.8% of true duplicates and passed 14.5% of candidates).
  - An uncalibrated model gives no probability, and its candidates are flagged, since the provider fails toward inclusion.

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
- **This overstates the risk in one way.** The replay wrote a gate for **every** round, while a live loop model attaches `finishIf` only when it expects to finish, so many of these `continue` rounds would never carry a gate.
- **It understates the risk in another.** A false finish returns the model's pre-written message in place of work the agent went on to do.

**Recommendation:**
- **Don't rely on `finishIf` at 0.9 by default.** The milestone turned it on by default at 0.9 per question, on Amith's direction, with the option to make it opt-in.
- **Make it opt-in per agent until it is measured with live-authored gates,** using the Prompt Eval corpus with the gate recorded and not acted on, as §5 of the plan proposes. Keep 0.9 for the agents that opt in; per-model calibration doesn't help here.
- This is a product decision, recorded here with the data. It isn't changed in code by this work.

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

**Recommendation:**
- **Don't make `confidence` load-bearing.** Where a gate is needed, ask a typed decision, as `finishIf` does.
- **The memory manager** (`minConfidenceThreshold: 80`) already gates durable memory writes on this number. That gate should move to a typed Likelihood about the note itself, with its own labelled corpus, before it is trusted.

## Findings across consumers

1. **Calibrate every consumer, per model.** On all three new decisions, raw probabilities were biased (discovery's Likelihood compressed below 0.8, duplicates' inflated), while ranking was good (AUC 0.77–0.99). Every threshold set here is on calibrated probabilities, and an uncalibrated model is treated as unsure.
2. **Jev beats LLM Decision on every task:** more accurate, 3–6× faster, and cheaper. LLM Decision stays the failover.
3. **Thresholds follow the cost of each kind of mistake.**
   - When a wrong action costs more than a missed one (injecting the wrong agent, flagging a record that isn't a duplicate), the threshold favours precision.
   - When a later stage checks the result (the `DecisionThenPrompt` pre-filter), it favours recall.
4. **A cheap first-stage signal can be useless on its own:** vector similarity for duplicates, and semantic search for discovery. The decision is what separates the candidates.

## Limitations

- **The corpora are synthetic**, written by an LLM from MJ's own metadata or recorded simulated traffic. Refit each calibration on real, consented, labelled data before relying on the numbers.
- **The development catalog includes test fixtures,** which shape discovery's options.
- **The duplicate measurement covers one entity** (`MJ: Actions`).
- **Some cost is missing.** On branches without #4880, LLM Decision's chat cost isn't linked to its decision run, so its cost per 1,000 is missing from some tables.
- **Latencies are measured in-process** against a local database.
