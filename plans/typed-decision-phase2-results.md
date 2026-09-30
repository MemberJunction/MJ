# Phase 2 results: typed decisions measured inside MJ

**Date:** 2026-09-29.
**Plan:** `typed-decision-models.md`, Phase 2 (Tasks 2.1–2.5).
**Harness:** #4875.
**Thresholds:** #4876.

Phase −1 measured typed decisions with an out-of-repo script. Phase 2 measures them **through MJ**:
- the real `AIDecisionRunner` and drivers;
- the exact questions and state that production's conversation routing sends (#4860);
- every point repeated;
- failover off, so each cell measures one model.

## What was measured

- **The decision:** conversation routing's thread Likelihood, "the user's new message continues the current thread with the last agent". It is asked together with the agent Choice, exactly as production asks them (#4860).
- **The corpus:** Phase −1's 374 labelled decision points. Labels come from construction: 127 continue, 181 switch, 66 ambiguous. The traffic was generated in a clean-room database: simulated users, with real MJ agents. **The corpus is kept outside the repository and is not published.** The harness reads it from a local path, and refuses to write anything it generates inside a git working tree.
- **The cells:** two decision models, each with two state layouts:
  - production's layout (`BuildRoutingState`);
  - Phase −1's best "structured" layout (`BuildRoutingStateStructured`).
- **Five repeats per point.** 7,480 calls in total.
- **Scoring** (on `continue`/`switch`; `ambiguous` is reported separately):
  - each point's mean probability over its repeats;
  - balanced accuracy with a 95% bootstrap interval;
  - AUC, Brier, and ECE with 10 bins;
  - repeatability (verdict agreement across repeats);
  - signal value (§2);
  - 5-fold out-of-fold Platt calibration.
  - Production's routing verdict per run: one call, with the Choice and the Likelihood together, at the recorded thresholds. It comes from the eval's re-run; the figures below score the Likelihood alone.

## Results

| Model · state | Points | Balanced acc. raw | Balanced acc. calibrated [95% CI] | ECE raw → cal. | Repeatability | p50 / p95 | $ / 1k decisions |
|---|---|---|---|---|---|---|---|
| **Jev** · production | 301 | 0.800 | **0.928** [0.897, 0.956] | 0.226 → 0.041 | 0.991 | 187 / 258 ms | 0.039 |
| Jev · structured | 301 | 0.706 | 0.913 [0.880, 0.944] | 0.290 → 0.040 | 0.991 | 188 / 264 ms | 0.048 |
| **LLM Decision** · production | 301 | 0.796 | **0.861** [0.826, 0.897] | 0.195 → 0.081 | 0.963 | ~520 / ~1150 ms | ~0.69 ‡ |
| LLM Decision · structured | 301 | 0.762 | 0.840 [0.803, 0.876] | 0.226 → 0.094 | 0.956 | ~515 / ~1180 ms | ~0.69 ‡ |

The first run's Jev cells stopped at 82 points when the OpenRouter credit ran out (HTTP 402). After a top-up, Jev was rerun on all 374 points: 3,740 calls, no failures. Those are the figures above. The 82-point sample had flattered Jev's raw accuracy (0.872); its calibrated accuracy barely moved (0.937 → 0.928).

‡ **LLM Decision's cost isn't linked to its decision run.** The chat model's cost lands on a separate prompt run; this is a known gap, raised on #4814. The figure is the mean cost of those chat runs during the eval.

Jev is `typesafe/jev-1.13-20260917` via OpenRouter. LLM Decision is GPT-OSS-120B via Cerebras.

## Findings

1. **Calibration is required, per model.**
   - Both models' raw probabilities lean heavily toward "continues". Jev's raw 0.5 is a calibrated 0.03, and LLM Decision's is 0.05.
   - Platt scaling fitted per model cut ECE by 60–80%, and raised balanced accuracy by 7–13 points.
   - Phase −1 saw the same thing (Jev's raw ECE was 0.28). A consumer must not act on a raw probability.
2. **Jev beats LLM Decision.** It is:
   - more accurate after calibration (0.928 [0.897, 0.956] against 0.861 [0.826, 0.897]);
   - about 2.8× faster (p50 187 ms against about 520 ms);
   - about 18× cheaper;
   - more repeatable (0.991 against 0.963).
3. **Production's state layout beats the structured one,** on both models (Jev 0.928 against 0.913 calibrated, 0.800 against 0.706 raw). That reverses Phase −1's finding for this decision. Phase −1 compared against the retired intent check's text, not #4860's layout and co-asked Choice. Production keeps its layout.
4. **Both models are highly repeatable** (verdict agreement ≥ 0.96). Temperature and seed can't be pinned through the decision path today, so this is repeatability at provider defaults.
5. **Failover works.** With Jev at zero credit, `Default Decision` failed over to LLM Decision on every call, and each decision succeeded. Routing then times out at 350 ms and keeps continuity, which is the safe outcome.

## Thresholds set from these data (Task 2.4, #4876)

- **Calibration.** The thread Likelihood is calibrated with the fitted Platt parameters, **only for the exact model each was fitted on**:
  - Jev at `typesafe/jev-1.13-20260917`: `A 1.7757, B −3.3506`;
  - LLM Decision when GPT-OSS-120B answered: `A 1.6508, B −2.9110`.

  The key is the decision model that answered and the model its driver reports behind it (`DecisionResult.ResolvedModel`, which `RunDecision` now returns). Any other model is treated as unsure, and routing keeps continuity. That covers Jev at another version, LLM Decision on another chat model (its prompt falls back to GPT 5.5 Instant), and a server that reports no resolved model. `FindDecisionCalibration` in `@memberjunction/ai-core-plus` does the lookup, for any consumer that calibrates.
- **The threshold.** A message leaves the thread at a **calibrated** P(continue) ≤ 0.30. The operating points below score the thread Likelihood alone, on each point's mean over its 5 repeats, **so they are an upper bound on routing**:

  | Model (Likelihood only, upper bound) | Switches routed away correctly | Switches caught | Continuations kept | Accuracy at a 90%-continue prior |
  |---|---|---|---|---|
  | Jev | 96.8% | 86.2% | 96.1% | **95.1%** |
  | LLM Decision | 96.2% | 72.4% | 96.1% | 93.7% |
  | Always-continue | — | 0% | 100% | 90.0% |

  Production does four things these figures don't:
  - it makes one call, not the mean of five;
  - it leaves the thread only when the agent Choice is also confident (≥ 0.7) and names another agent;
  - it acts only on an answer that arrives within the timeout;
  - a switch counted here may have gone to the wrong agent, since the corpus labels continue or switch, not which agent.

  The Decision Eval now scores production's own verdict per run, end to end (#4875 and #4876: the driver records the verdict with the model that answered and the policy applied, and the scorecard's "Production routing verdict" table scores it). The Phase 2 runs predate calibration, so they can't supply that figure. It needs a re-run of the two production-layout cells: 2 × 374 points × 5 repeats = 3,740 calls, scored with `decision-eval-scorecard.ts --since <run start>`. Until then, plan 3.9's "must beat always-continue" is shown for the Likelihood, not yet end to end.
- **The timeout: 250 ms → 350 ms, over the plan's budget, deliberately.**
  - **The budget:** plan Task 3.9 asks for well under the ~300 ms at which the intent check was cut, network included.
  - **Why exceed it:** Jev answers at p95 in 258 ms in-process, so 250 ms gave up on about 1 call in 20 before any network time. 350 ms leaves room for the network.
  - **Why it's safe:**
    - A missed deadline keeps continuity.
    - The wait falls only on an unmentioned message where `EnableDecisionRouting` is on, which is off by default.
    - The wait is at most 350 ms.
  - **Next:** revisit it once client-side latency is measured.

## Recorded choices (Task 2.3)

- **Access path:** OpenRouter's alpha Decisions API (`OpenRouterDecision`), as in Phase −1. A direct TypeSafe connection would remove one hop, but isn't needed at these latencies.
- **Version pinning:** the vendor metadata binds the dated `typesafe/jev-1.13-20260917`, not an alias. Every run records the resolved version.

## Recommendation (Phase 2 exit)

- **Keep Jev as `Default Decision`'s primary, with LLM Decision as the failover.**
- **Apply per-model calibration in every consumer that acts on a threshold, keyed to the exact model it was fitted on** (`FindDecisionCalibration`). The key is the decision model plus the resolved model, never the MJ model name alone.
- **Only conversation routing has thresholds from data so far.** The other consumers keep their placeholders until each has its own labelled corpus: `finishIf` 0.9, Sage discovery 0.7, the duplicate "Uncertain" band, and Decision-pipeline escalation floors. The harness now makes each of those a matter of building a corpus and running it.
- **Task 2.5** (an open-weights driver) is not taken: no candidate model has been published.

## Limitations and follow-ups

- **The routing operating point is an upper bound** until the production-layout cells are re-run and scored end to end. The calibrated figures also predate #4875's fix, which made the scorecard independent of run order. Re-scoring the stored runs needs no model calls, and may move them slightly within the fold-draw spread. The fitted A and B don't depend on order.
- **The agent Choice's confidence is not calibrated:** the corpus labels continue or switch, not which agent.
- **LLM Decision's cost isn't linked to the decision run.** This is being followed up for decision and rerank calls.
- **Latencies are measured in-process,** so the client's budget must also cover network time.
- **The corpus uses simulated users.** Real conversations may differ, so refit on real, consented traffic before relying on these numbers.
