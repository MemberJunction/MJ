# V9 — Monitoring / Drift Detection (Arie's #1 priority)

**Verdict: PASS** — closes the biggest gap in the original Phase-0 set: the pillar Arie emphasized most ("*especially monitoring*") and which the first eight experiments hadn't touched.

## Hypothesis
A PSI/KS drift monitor on a scored population flags a covariate shift *before* holdout performance visibly rots, and the challenger-vs-incumbent comparison recommends promote/hold correctly — as a recommendation, never an auto-promotion.

## Method
Train an incumbent on a baseline period; score five later periods with a growing planted covariate shift (0 → 2.5 std on three features). Each period tracks PSI on the score distribution and top feature vs the training snapshot, and the true holdout AUC. Then train a challenger on recent shifted data and compare direction-aware. 3 seeds. Thresholds: PSI warn 0.10, stale 0.25.

## Result (`results/v9_drift_monitoring.result.json`)

- **Alarm precedes decay in every seed.** PSI crossed the 0.25 "stale" line at period 1 (shift 0.5) — at or before the period where holdout AUC first dropped ≥0.05. You learn the model is going stale from the *inputs* before it silently hurts on the *outputs*.
- **Incumbent rots as shift grows** (AUC falls toward and below 0.5 as the relationship drifts), exactly the silent-failure monitoring exists to catch.
- **Challenger recommended correctly, every seed** — trained on shifted data it recovered AUC to ~0.82–0.85 vs the incumbent's ~0.35–0.51, and the direction-aware comparison returned `promote`. Critically it returns a **recommendation**; promotion stays a human-gated decision (no auto-promote).

## Reading
This is the operational half the AutoML graveyard skipped — models shipped and rotted with nobody watching. A distribution monitor gives an early warning from the feature/score drift before the label-based performance visibly degrades (labels often arrive late in retention problems, which is exactly when you can least afford to wait). The challenger loop then proposes a fix without ever auto-deploying it.

## What it does for the plan
Validates the monitoring pillar (`MaintenanceEngine` drift/challenger loop) and directly answers the reviewer's strongest emphasis with evidence rather than a promise. Design note surfaced: PSI thresholds (0.10 / 0.25) are standard and fired appropriately here, but should be tunable per deployment — a monitor that cries wolf is ignored.

## Caveat
Synthetic covariate shift; real drift is messier (concept drift, seasonal vs structural). The mechanism is validated; threshold calibration on real streams is a build-time task.

## Reproduce
`./run.sh v9_drift_monitoring` — seeds 81–83. Raw records in `results/v9_drift_monitoring.result.json` + `results/referee_audit.jsonl`.
