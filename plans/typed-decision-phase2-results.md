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

## Results

| Model · state | Points | Balanced acc. raw | Balanced acc. calibrated [95% CI] | ECE raw → cal. | Repeatability | p50 / p95 | $ / 1k decisions |
|---|---|---|---|---|---|---|---|
| **Jev** · production | 82 † | 0.872 | **0.937** [0.881, 0.987] | 0.145 → 0.060 | 0.993 | 225 / ~330 ms | 0.038 |
| Jev · structured | 81 † | 0.737 | 0.936 [0.882, 0.986] | 0.222 → 0.073 | 0.995 | 229 / ~340 ms | 0.047 |
| **LLM Decision** · production | 301 | 0.796 | **0.861** [0.826, 0.897] | 0.195 → 0.081 | 0.963 | ~520 / ~1150 ms | ~0.69 ‡ |
| LLM Decision · structured | 301 | 0.762 | 0.840 [0.803, 0.876] | 0.226 → 0.094 | 0.956 | ~515 / ~1180 ms | ~0.69 ‡ |

† **The OpenRouter account ran out of credit partway through** (HTTP 402). Failed calls were excluded, not scored, so Jev's sample is smaller than planned. The intervals are correspondingly wider.

‡ **LLM Decision's cost isn't linked to its decision run.** The chat model's cost lands on a separate prompt run; this is a known gap, raised on #4814. The figure is the mean cost of those chat runs during the eval.

Jev is `typesafe/jev-1.13-20260917` via OpenRouter. LLM Decision is GPT-OSS-120B via Cerebras.

## Findings

1. **Calibration is required, per model.**
   - Both models' raw probabilities lean heavily toward "continues". Jev's raw 0.5 is a calibrated 0.10, and LLM Decision's is 0.05.
   - Platt scaling fitted per model cut ECE by more than half, and raised balanced accuracy by 6–7 points.
   - Phase −1 saw the same thing (Jev's raw ECE was 0.28). A consumer must not act on a raw probability.
2. **Jev beats LLM Decision.** It is:
   - more accurate after calibration (0.937 against 0.861; the intervals overlap only between 0.881 and 0.897);
   - about 2.3× faster;
   - about 18× cheaper;
   - more repeatable.

   Jev's sample is 82 points; rerun it in full when there is credit.
3. **Production's state layout is at least as good as the structured one,** on both models. That reverses Phase −1's finding for this decision. Phase −1 compared against the retired intent check's text, not #4860's layout and co-asked Choice. Production keeps its layout.
4. **Both models are highly repeatable** (verdict agreement ≥ 0.96). Temperature and seed can't be pinned through the decision path today, so this is repeatability at provider defaults.
5. **Failover works.** With Jev at zero credit, `Default Decision` failed over to LLM Decision on every call, and each decision succeeded. Routing then times out at 350 ms and keeps continuity, which is the safe outcome.

## Thresholds set from these data (Task 2.4, #4876)

- **Calibration.** The thread Likelihood is calibrated per answering model with the fitted Platt parameters:
  - Jev: `A 1.5035, B −2.1629`;
  - LLM Decision: `A 1.6508, B −2.9110`.

  An uncalibrated model's answer is treated as unsure.
- **The threshold.** A message leaves the thread at a **calibrated** P(continue) ≤ 0.30:

  | Model | Switches routed away correctly | Switches caught | Continuations kept | Accuracy at a 90%-continue prior |
  |---|---|---|---|---|
  | Jev | 97.0% | 82.1% | 97.7% | **96.1%** |
  | LLM Decision | 96.2% | 72.4% | 96.1% | 93.7% |
  | Always-continue | — | 0% | 100% | 90.0% |

- **The timeout:** 250 ms → **350 ms.** At 250 ms, about half of Jev's answers came too late before any network time.

## Recorded choices (Task 2.3)

- **Access path:** OpenRouter's alpha Decisions API (`OpenRouterDecision`), as in Phase −1. A direct TypeSafe connection would remove one hop, but isn't needed at these latencies.
- **Version pinning:** the vendor metadata binds the dated `typesafe/jev-1.13-20260917`, not an alias. Every run records the resolved version.

## Recommendation (Phase 2 exit)

- **Keep Jev as `Default Decision`'s primary, with LLM Decision as the failover.**
- **Apply per-model calibration in every consumer that acts on a threshold.**
- **Only conversation routing has thresholds from data so far.** The other consumers keep their placeholders until each has its own labelled corpus: `finishIf` 0.9, Sage discovery 0.7, the duplicate "Uncertain" band, and Decision-pipeline escalation floors. The harness now makes each of those a matter of building a corpus and running it.
- **Task 2.5** (an open-weights driver) is not taken: no candidate model has been published.

## Limitations and follow-ups

- **Jev covered 82 points,** because of the credit limit. Rerun it in full.
- **The agent Choice's confidence is not calibrated:** the corpus labels continue or switch, not which agent.
- **LLM Decision's cost isn't linked to the decision run.** This is being followed up for decision and rerank calls.
- **Latencies are measured in-process,** so the client's budget must also cover network time.
- **The corpus uses simulated users.** Real conversations may differ, so refit on real, consented traffic before relying on these numbers.
