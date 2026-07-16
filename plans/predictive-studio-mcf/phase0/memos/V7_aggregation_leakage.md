# V7 — Aggregation Leakage Reproduction (the Featuretools grave)

**Verdict: PASS** — and it reproduces one of the most common real-world ML failures cleanly.

## Hypothesis
Naive relational aggregates (no time cutoff) inflate apparent performance and collapse under temporally-honest evaluation; as-of aggregates (events ≤ decision date) do not.

## Method
Seeded planted event-log generator (`gen_event_log`, 3,000 entities × 5 seeds): each member has dated events before and after a decision day; the honest label is driven by the *pre-decision* engagement rate, but churned members stop generating events afterward — so **post-decision event counts correlate with the label** (a future peek). Two feature-assembly arms feed the same XGBoost and the same locked holdout via the referee:
- **NAIVE** — aggregate over ALL events (count / sum / mean / recency)
- **AS-OF** — identical aggregates, clipped to events on/before each entity's decision day

## Result (locked-holdout AUC, `results/referee_audit.jsonl`)

| seed | naive (leaky) | as-of (honest) | inflation gap |
|---|---|---|---|
| 11 | 0.843 | 0.608 | 0.235 |
| 12 | 0.845 | 0.632 | 0.213 |
| 13 | 0.863 | 0.611 | 0.252 |
| 14 | 0.838 | 0.593 | 0.246 |
| 15 | 0.852 | 0.626 | 0.226 |
| **mean** | **0.848** | **0.614** | **0.234** |

PASS bar was inflation gap ≥ 0.05; observed **0.234**.

## Reading
The naive feature set looks 23 AUC points better — and every one of those points is a lie: it comes from counting events that happened *after* the moment the prediction is supposed to be made. A team shipping the naive pipeline would report ~0.85, deploy it, and watch it perform at ~0.61 in production. This is exactly the class of failure that sank Featuretools-style automated relational feature generation, and it is invisible to any purely statistical check on the training data — the naive features are genuinely predictive *of the training labels*.

## What it demonstrates for the plan
1. The failure is real and severe — validating the concern, not hand-waving it.
2. **As-of assembly is not a nice-to-have; it is the difference between 0.85-fiction and 0.61-fact.** This is why the plan makes point-in-time cutoffs a spine invariant rather than a feature, and why the Sonar as-of aggregate work (A30/B8) must be as-of *by construction*.
3. It is a graveyard case-test for the Arie memo: a named historical failure, reproduced in 40 lines, with the design's mitigation shown to remove it.

## Reproduce
`./run.sh v7_aggregation_leakage` — deterministic (seeds 11–15). Raw records in `results/v7_aggregation_leakage.result.json` + `results/referee_audit.jsonl`.
