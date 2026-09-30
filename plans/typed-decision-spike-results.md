# Typed Decision Models — Phase −1 spike results

**Plan:** [`plans/typed-decision-models.md`](typed-decision-models.md), Phase −1
**Date:** 2026-09-22
**Status:** Complete. An independent model audit of the labels is done (§7). A human audit of the
same 50 items is optional and still open.
**Harness:** `typed-decision-spike` (out of repo, per the plan); commands to reproduce are in §12

---

## 1. Recommendation — **native provider**, with three conditions

Proceed with Phase 1 as planned. Plan `JevDecision` for Phase 2, and keep `LLMDecision` as the
fallback.

On MJ's own decision, in MJ-shaped states, the best Jev configuration beats the same configuration on
GPT-OSS-120B on accuracy, latency and cost. At production's strict continue-retention the two are
close on accuracy (§3), so there the case rests on speed and price.

| | Jev | GPT-OSS-120B @ Cerebras |
|---|---|---|
| Accuracy | better: **+9.2 pts** balanced accuracy (95% CI +5.0 to +13.4), **+0.077 AUC** (+0.046 to +0.110) | — |
| Latency, p50 / p95 | **1.5× / 2.0× faster**: **246 / 319 ms** | 358 / 638 ms (same one-question arm) |
| Cost | **about 11× cheaper**: **$0.04** per 1,000 decisions | $0.42 |

Jev is also the only setup that clears the sub-500 ms bar the intent check was built to — and was
removed for missing.

The conditions:

1. **Calibrate in MJ; never threshold on the vendor's raw number.** Jev's raw probability ranks
   well (AUC 0.951) but is badly calibrated (ECE 0.28). At a 0.5 cut-off it scores only 69.9%.
   Two parameters fitted on our own labels (Platt scaling) take the same numbers to **88.3%**, with
   ECE 0.072. This is the plan's Task 2.4, and it is load-bearing.
2. **Get the state right. It is the largest single effect measured.** The same Jev question scores
   AUC 0.951 on a structured state with correct speakers, and 0.754 on the shipped intent-check
   string (+0.197; CI +0.153 to +0.242). The shipped payload labels every agent message with the
   *previous agent's* name, Sage's replies included. Fixing only that lifts the incumbent by +6.3
   points.
3. **Re-validate on real traffic before any threshold ships.** The users here are simulated (§6).

**A correction to the plan's premise.** Task −1.3 expected decomposition to be decisive (62.6% →
95.0% in published benchmarks). **For this decision it was not.** Seven narrow questions beat one
question only when neither was calibrated (+14.1 points at a 0.5 cut-off). Once the single question
was calibrated, it beat the seven-question fitted combiner: 88.3% against 84.0% balanced accuracy,
and AUC +0.024 (CI +0.002 to +0.045). Decomposition remains a useful tool when no labelled data
exists: the hand-written rule over seven questions beat the raw single question by +7.1 points.
But it is not a prerequisite. (An earlier draft of this analysis credited decomposition with the
gain. That was a threshold artifact.)

---

## 2. Headline results

374 decision points; 308 carry a binary label (the 66 ambiguous items are reported in §4). Balanced
accuracy is the primary metric, because the classes are unbalanced by design. Calibration and
combiners are fitted and scored out-of-fold (5 folds).

| Arm | Model | State | Bal. acc (95% CI) | AUC | ECE | p50 / p95 ms | $ / 1k |
|---|---|---|---|---|---|---|---|
| **1 question + calibration** | **Jev** | structured | **88.3%** (84.4–91.6) | **0.951** | **0.072** | **246 / 319** | **0.037** |
| 7 questions + fitted combiner | Jev | structured | 84.0% (79.8–88.2) | 0.927 | 0.077 | 252 / 318 | 0.042 |
| 7 questions + fitted combiner | GPT-OSS-120B | structured | 79.4% (74.7–83.7) | 0.876 | 0.061 | 635 / 1,401 | 0.836 |
| 1 question + calibration | GPT-OSS-120B | structured | 79.1% (75.2–83.0) | 0.874 | 0.078 | 358 / 638 | 0.424 |
| 7 questions + hand rule | Jev | structured | 77.0% (72.6–81.4) | 0.877 | —* | 252 / 318 | 0.042 |
| 1 question + calibration | Jev | narrow | 74.5% (69.5–79.4) | 0.798 | 0.057 | 271 / 399 | 0.026 |
| 1 question, raw | Jev | structured | 69.9% (66.1–73.6) | 0.951 | 0.284 | 246 / 319 | 0.037 |
| Incumbent, speaker bug fixed | GPT-OSS-120B | incumbent string | 69.6% (65.3–73.6) | — | — | 427 / 808 | 1.004 |
| 1 question + calibration | Jev | incumbent string | 67.6% (62.1–72.8) | 0.754 | 0.046 | 259 / 350 | 0.033 |
| **Incumbent as shipped** (`Check Sage Intent`) | GPT-OSS-120B | incumbent string | **63.3%** (59.7–67.1) | — | — | **420 / 756** | **0.975** |
| Today's router (always continue) | — | — | 50.0% | — | — | — | — |

\* The hand rule's output is a rank score, not a probability.

**Labelled data needed.** Calibration here was fitted on about 246 labelled examples per fold.
Two parameters need far fewer; the seven-feature combiner needs more. Budget for a labelled set per
decision type.

---

## 3. At production's class balance

A 0.5 cut-off on a switch-heavy corpus is not how the router would run. Instead, hold every arm to
the incumbent's continue-retention (96.9%) and price errors at production's mix:
`plans/agent-latency-optimization.md` calls the intent check wasteful "~90% of the time", so about
90% of messages continue. Thresholds are chosen on the scored data, so these figures are slightly
optimistic.

| Arm | Continue kept | Switch recall | Expected routing error @ 90% continue |
|---|---|---|---|
| Always continue (today) | 100.0% | 0.0% | 10.0% |
| **Incumbent as shipped** | 96.9% | 29.8% | **9.9%** |
| Incumbent, speaker bug fixed | 94.5% | 44.8% | 10.5% |
| GPT-OSS, 1 question, structured | 96.9% | 62.4% | 6.6% |
| **Jev, 1 question, structured** | 96.9% | 60.2% | **6.8%** |
| Jev, 7 questions fitted, structured | 96.9% | 50.3% | 7.8% |

**The shipped intent check was no better than always continuing** (9.9% against 10.0%). That
independently vindicates PR #2309's decision to remove it. A calibrated, well-framed typed decision
cuts routing errors by about a third at the same retention. At this strict operating point Jev and
GPT-OSS are close, so Jev's case there rests on latency and cost. Its accuracy advantage shows
across the whole ranking (AUC) and at balanced thresholds.

---

## 4. By case type

| Arm | Model | State | Continue → kept (127) | Planned switch → re-routed (76) | Continuing Sage's work → re-routed (105) | Ambiguous → kept (66) |
|---|---|---|---|---|---|---|
| 1 question + calibration | Jev | structured | 88.2% | 92.1% | 85.7% | 19.7% |
| 1 question + calibration | GPT-OSS | structured | 96.9% | 76.3% | 50.5% | 56.1% |
| 7 questions + fitted | Jev | structured | 83.5% | 94.7% | 77.1% | 25.8% |
| Incumbent, fixed | GPT-OSS | incumbent string | 94.5% | 69.7% | 26.7% | 83.3% |
| Incumbent as shipped | GPT-OSS | incumbent string | 96.9% | 65.8% | **3.8%** | **95.5%** |

**The incumbent's worst weakness is structural.** When Sage handles a turn, MJ records the reply
under Sage, so `findLastNonSageAgentId` still names the *old* specialist as the previous agent. The
history block then labels Sage's reply with that specialist's name. A user continuing Sage's work
therefore looks, in the payload, like someone continuing the specialist's. The incumbent re-routes
3.8% of these; Jev given the same string re-routes 1.9%. The problem is the payload, not the model.

**Ambiguous messages.** The incumbent's prompt says *"When in doubt, choose UNSURE"*, yet it kept
95.5% of ambiguous messages with the previous agent. How to treat ambiguity is a product decision.
A calibrated decision makes it a threshold rather than a prompt instruction the model ignores.

---

## 5. Calibration and the routing story

Here is how the plan's policy (act ≥ 0.7 / review 0.35–0.7 / escalate < 0.35) would have split this
traffic:

| Arm | Acted on | Precision when acting | Sent to review |
|---|---|---|---|
| Jev, 1 question + calibration | 86% (36% continue, 51% switch) | 93.6% / 93.6% | 14% |
| Jev, 7 questions + fitted | 82% | 90.8% / 92.2% | 18% |
| GPT-OSS, 1 question + calibration | 53% | 80.7% / 97.2% | 47% |
| Jev, 1 question, **raw** vendor probability | 78% (61% continue) | **64.6%** / 98.1% | 22% |

**Do not threshold on raw vendor numbers.** Among messages Jev scored 0.8–0.9, only 31% were
continuations; among those it scored 0.7–0.8, 10%. After calibration the reliability curve follows the diagonal.

---

## 6. Corpus — where this departs from the plan

**The plan's labelling assumption does not hold on today's traffic.** Task −1.2 proposed labelling
by "which agent actually handled the next message". Since PR #2309 (merged 2026-04-07) the client
always continues with the previous agent, so on post-#2309 traffic that label is the router's
constant output. Pre-#2309 traffic is partly circular.

**There was no usable real traffic available to the spike.** The only sizeable conversation data at
hand came from a single-agent deployment. It is customer data, and more than 90% of its follow-ups
went to the same agent, so it cannot measure switch detection.

**What was done instead.** A clean-room database was built from `next` (`de6dfe386d`) per the
`bootstrap-clean-db` skill, as `MJ_6_1_0_DECISIONSPIKE_pr4660`. Against it, 80 conversations (509
turns) were generated with the **real MJ agents** — Marketing, Research, Codesmith, Query Builder,
Demo Loop, Agent Manager, SkillSmith and Sage, on their shipped model bindings. They ran in-process
exactly as `RunAIAgentResolver.RunAIAgentFromConversationDetail` runs them, behind the row
choreography the Angular client performs.

- **Genuine MJ output:** everything an arm sees — agent replies, artifacts, histories (median 6
  messages; 296 of 374 states carry artifacts).
- **Simulated:** the **user side only.** Gemini 3.8 Flash, a different model family from both
  models under test, wrote each message to realise a planned move under one of eight personas.

This is a disclosed deviation from "do not use synthetic inputs". The plan's reason for that rule
is state projection, and the states here are real.

**Labels by construction.** Each point is labelled with the move its message was written to
realise, expressed relative to the previous agent MJ's router sees:

| Label | Count |
|---|---|
| continue | 127 |
| switch | 181 (76 planned; 105 continuing work Sage last handled) |
| ambiguous | 66 |

Routing followed the label, so in this database the plan's behavioural label is valid again. It
agrees with the construction label on all 374 points.

---

## 7. Label audit

**Independent model audit (done).** Claude (Opus 5.5) — used nowhere else in this pipeline — labelled
a uniform random 50 blind. It saw no routing and no "what happened next", and was given the same
instructions a human labeller would get. It agreed with the construction labels on **86% (κ = 0.74)**.
The seven disagreements show three systematic flaws in the construction labels:

- **Sage only asked a question.** Sage handled the last turn, but only to ask a clarifying question
  about the previous agent's work. The construction rule calls the follow-up a switch, though its
  substance is the previous agent's. About 16 points corpus-wide by heuristic.
- **A planned switch whose target was the previous agent itself.** A plan artifact; 1 point.
- **One simulated message that did not realise its move.** Asked for a continue, it ended with an
  explicit switch.

The other three disagreements were on items labelled ambiguous, which are excluded from binary
scoring.

**Sensitivity.** Removing the 17 suspect points changes no conclusion. Every arm gains 1–2 points,
the ordering is unchanged, and Jev with one question plus calibration reaches 89.8% (86.0–93.1). Its
lead over GPT-OSS becomes +10.0 points (+5.8 to +14.3).

**Human audit (optional, open).** The same 50 rows are in `data/spike-traffic/hand-labels.csv`,
with instructions alongside. A model auditing a model-generated corpus is a weaker check than a
person, which is why this remains worth doing.

---

## 8. Threats to validity

- **Simulated users.** They are plausible, but may be cleaner, or more deliberately ambiguous, than
  real users.
- **The class balance was set by the plan**, not by production. §3 prices errors at production's mix.
- **Calibration and combiners** were fitted and scored on the same distribution (out-of-fold).
  Their parameters must be refitted on real traffic.
- **Latency** was measured on warm connections from a developer laptop, not the MJAPI host region.
  On a trivial input, Cerebras' own compute was 30–100 ms against a 170–1,300 ms wall clock. Jev
  went through OpenRouter; a direct TypeSafe connection would remove one hop.
- **Single user and one decision type.** Every conversation belongs to the seeded `System` user,
  and the intent check is the plan's first candidate, not its only one.

---

## 9. What this means for the later phases

- **Phase 1:** unchanged. The spike's `LLMDecision` prototype worked on the first real run, with
  0.5% malformed responses (2 of 374, both a probability written as `"0. nine"`). A native
  typed-decision model cannot produce that failure.
- **Phase 2:** calibration (Task 2.4) is load-bearing, not a polish step. Decomposition (the plan's
  Task −1.3 emphasis) is a tool, not a requirement.
- **Task 3.2 (resurrect the intent check):** first fix the payload. Either attribute Sage-delegated
  replies to the agent that did the work, or give the check the true speaker. Otherwise it is blind
  to most switches that follow a Sage turn.
- **Task 3.4 (make `confidence` load-bearing):** the band tables in §5 are the evidence it
  requires. Derive thresholds from a real-traffic corpus, not these.

---

## 10. Findings outside the spike's question

- `next` fails `pnpm install --frozen-lockfile`: `@memberjunction/feature-pipelines` is declared
  without a lockfile entry.
- `next` fails to build `@memberjunction/ng-core-entity-forms`:
  `record-process-form.component.ts` imports `LogError` from `@memberjunction/global`, which does
  not export it.
- Sage's highest-priority binding, `gemma-4-31b` on Cerebras, is archived
  (`404 model_archived`). Every Sage call fails over, which adds a round trip.
- **Failover does not cover context overflow.** A Sage run hit 166k tokens against GPT-OSS-120B's
  131k limit on Cerebras and errored, instead of failing over to its bound Gemini model with a
  larger context window. This is relevant to Phase 0, Task 0.3 (error classification).
- The Marketing Agent failed 3 of its 15 openings with
  `Maximum validation retries of 10 exceeded`.
- A clean-room bootstrap of `next` produced no generated-code diff, so the committed generated
  code matches what migrations and metadata produce.

---

## 11. Cost of the spike

| Item | Cost |
|---|---|
| Traffic generation (2,455 prompt runs, mostly Gemini) | $30.58 |
| Arm matrix (10 runs, 3,740 decisions) | $1.29 |
| Jev portion of the matrix (OpenRouter-reported) | $0.08 |

---

## 12. Reproduce

In `typed-decision-spike`:

```bash
uv sync --group dev && uv run pytest -q                                  # 24 tests
uv run spike reach                                                        # Task −1.0
uv run spike plan-traffic --out data/spike-traffic/plan.json --n 80 --seed 7
generator/run-generator.sh <mj-worktree> --plan data/spike-traffic/plan.json --out data/spike-traffic/traffic-0.jsonl --shard 0/4   # ×4 shards
cat data/spike-traffic/traffic-*.jsonl > data/spike-traffic/turn-log.jsonl
uv run spike extract --db MJ_6_1_0_DECISIONSPIKE_pr4660 --name spike-traffic
uv run spike labels construction --corpus spike-traffic --log data/spike-traffic/turn-log.jsonl
./run-matrix.sh spike-traffic
uv run spike run --corpus spike-traffic --arm incumbent --backend cerebras --projection incumbent-fixed
uv run spike score --corpus spike-traffic --labels construction           # -> results.md / results.json
```
