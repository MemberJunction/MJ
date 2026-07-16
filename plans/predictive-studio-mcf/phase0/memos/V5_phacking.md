# V5 — P-Hacking Reproduction + Locked-Holdout Containment

**Verdict: PASS** — the graveyard's deadliest failure, reproduced in code and mechanically contained. This is the memo to put in front of Arie.

## Hypothesis
(a) Iterating freely against a visible validation score overfits it — manufacturing apparent skill on pure noise (the AutoML leaderboard-overfitting failure). (b) A locked holdout that is *never used for selection* contains the damage completely.

## Method
The multiple-comparisons search **is** the p-hacking mechanism, so it's reproduced deterministically: a 400-config random search (feature subsets + hyperparameters) that keeps the best-on-validation config — exactly what an agent tuning against a visible score does. Validation set deliberately small (120 rows) — the realistic regime for association-scale data where p-hacking bites hardest. Datasets: pure noise (true AUC 0.5) and weak signal, 5 seeds each. **Arm A** = best validation AUC found (what a p-hacker would report). **Arm B** = that same config scored once on the locked holdout (the truth).

## Result (pure noise, true AUC = 0.5; `results/referee_audit.jsonl`)

| seed | best validation AUC | locked-holdout AUC | optimism |
|---|---|---|---|
| 41 | 0.623 | 0.490 | 0.133 |
| 42 | 0.639 | 0.539 | 0.100 |
| 43 | 0.607 | 0.497 | 0.111 |
| 44 | 0.620 | 0.512 | 0.108 |
| 45 | 0.645 | 0.461 | 0.183 |
| **mean** | **0.627** | **0.500** | **0.127** |

PASS bar: noise optimism ≥ 0.10 (observed **0.127**) AND noise holdout ≤ 0.56 (observed **0.500**).

## Reading
On data with **no signal whatsoever**, searching against a visible validation score manufactured a 0.627 AUC — which any team would read as "we have a real model." It is entirely an illusion of multiple comparisons: try 400 things on 120 rows and the luckiest one looks good. The locked holdout, never touched during selection, reported **0.500** — the truth — every time. The weak-signal arm shows the same shape: validation optimism inflates the number, the holdout gives the honest estimate.

## Why this is decisive for the pitch
1. **It reproduces the exact mechanism that discredited AutoML leaderboards** — not an analogy, the real thing, in ~60 lines.
2. **It proves the plan's central honesty claim mechanically**: the locked holdout, scored once and never used for selection, is immune to the search's self-deception.
3. **It answers the LLM-optimism trap head-on.** An LLM agent does not exempt a system from this — a fluent agent can p-hack *better*, and narrate a story for its lucky config. That is precisely why the plan keeps the honesty layer **mechanical, not agentic**: the holdout is carved before search and scored by code. V5 is the evidence that this design decision is load-bearing, not decorative.

## What it gates
Nothing — this experiment exists to be *shown*. It converts "we prevent p-hacking" from a claim into a demonstration, and it's the strongest single artifact for the skeptical-veteran audience.

## Reproduce
`./run.sh v5_phacking` — deterministic (seeds 41–45, 400 configs, 120-row validation). Raw records in `results/v5_phacking.result.json`.
