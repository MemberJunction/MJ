# U4 — Placement (the final study checkpoint) for sign-off

Every accumulated idea (original team thread ∪ plan addenda ∪ Sonar absorption ∪ the
fan-out's own findings) placed into **exactly one bucket** (`placement.json`, 38 items).
This is the last study gate; on approval the study's **seed diffs amend the Doc-1 catalog**
and we're into the Doc 3/4 build.

## The 5 buckets (38 items)

**BANK-ENTRY (9)** — preprocessing placed by (node × position), inherited down the tree:
Yeo-Johnson→weighted-sum/transform · standardize→distance-kernel+weighted-sum/scale (empty
for split-based) · target-encode→split-based/encode · sentinel+missingness-indicator→
weighted-sum+distance-kernel only (RD-MICRO: redundant for trees) · Sonar normalizers→
weighted-sum/transform · log→recurrence-temporal/transform · median-impute, one-hot, PCA-whiten.

**FACET-GATE (9)** — gates that prune/route, orthogonal to the mechanism tree:
VIF (linear) · **class-balance → PR-AUC/lift, NOT class-weight (RD-MICRO)** · censoring-rate
(survival) · seasonality/n-cycles (forecasting) · **Hopkins = INVESTIGATE-only, not commit
(RD-COMPOSE)** · n-gate (GP<10k) · PH-test (survival) · dispersion (counts) · **label-linked
structure evidence — the hardened compose gate (RD-COMPOSE): compose ONLY on this**.

**COMPONENT (10)** — new catalog components beyond the 58 models:
isotonic/Platt calibrators (seeded) · SHAP explainer (`attributions`) · **uplift T-learner
template** (V10) · cluster-then-classify (seeded) · **as-of window aggregates** (Sonar #1 +
the RD-COMPOSE gbt_core 0.08–0.13 AUC gap — *highest leverage*) · event-log→RFM featurizer
(CLV prereq) · score-banding · **PSI drift monitor** (V9) · momentum/trajectory · HMM
cadence-state extractor.

**UI-SURFACE (5)** — reliability diagram · uplift quadrant · drift sparkline · the 3
frontend concepts (Atlas/Observatory/Story) · can-be affordance panel.

**REJECTED (5, recorded so they never resurface)** — Shapiro-gated scaling · Box-Cox-over-YJ
· stepwise selection · auto-promote challenger (V9: human gate) · blind single-slice isotonic
(V6: use CV + helps-or-skip).

## Validation-forced placements (evidence, not opinion)
Three placements are locked by the real-data experiments, not preference:
1. **compose-gate = label-linked structure evidence** (not Hopkins) — RD-COMPOSE.
2. **imbalance-gate = the metric (PR-AUC/lift)**, class-weighting demoted — RD-MICRO.
3. **presence-mask scoped to linear/distance families** (redundant for trees) — RD-MICRO.

## Contested (need your ruling — the only genuinely open calls)
- **C1** as-of aggregates: TS row-reducer (one-assembly-path invariant) vs an optional
  SQL fast path. ▶ **TS row-reducer now**, SQL path a later optimization (matches the
  integration-reconciliation finding + the invariant).
- **C2** SHAP explainer as a **hard dep** vs optional-extras (heavy). ▶ **optional-extras**,
  cheap-first attributions (Coefficients/Rules) native, SHAP only for BlackBox.
- **C3** momentum/trajectory as a **Transformation component** vs a Maintenance-loop concern.
  ▶ **Transformation** (composable, reusable) with a Maintenance consumer.

## What I need from you (U4 sign-off — the LAST study gate)
1. **Ratify the 38-item bucketing** (or move any item).
2. **Rule on C1–C3.**
3. Confirm the 5 REJECTED stay rejected.

On approval → the study is **COMPLETE**. Its outputs (58 reviewed sheets, vocabulary,
adapters, tree+facets+`tree-check`, `placement.json`) become **seed diffs that amend the
Doc-1 catalog** (10→58 components + the new Transformation/Calibration/Explainer/Template
components + bank entries), and the build moves to **Doc 3 drivers** (per-family, unblocked)
and **Doc 4 composition** (executor + the node-seeded banks). Say **"approve U4"**.
