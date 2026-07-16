# V2 — Components-as-Features Lift (THE composition bet)

**Verdict: REVISE** — and this is the most decision-relevant result in Phase 0. It directly tests Arie's "GBT is all you need" challenge, and the honest answer is *"mostly he's right — with one important, well-defined exception that the plan should build for and nothing more."*

## Hypothesis
Features extracted by structural models (HMM hidden states, KMeans cluster IDs) lift a gradient-boosted tree beyond raw features — when the data contains that structure — and do not spuriously help when it doesn't.

## Method
Three datasets × 5 seeds, each feeding the same XGBoost and same locked holdout; every extractor fit on the DEV split only:
- **HMM** — planted hidden-state regime driving the label; raw arm = obs summary stats, component arm = + HMM-recovered state-share/last-state features.
- **CLUSTER** — planted overlapping clusters with the feature→label sign flipping per cluster; component arm = + KMeans cluster-id (one-hot).
- **CONTROL** — plain classification with no latent structure + KMeans cluster-id → the honesty check: a real method must NOT lift here.

## Result (mean holdout AUC over 5 seeds, `results/referee_audit.jsonl`)

| dataset | raw AUC | + component | lift |
|---|---|---|---|
| **HMM (hidden temporal state)** | 0.816 | **0.871** | **+0.054** |
| cluster (feature-space, overlapping) | 0.877 | 0.878 | +0.001 |
| control (no structure) | 0.790 | 0.789 | −0.000 |

Bar: +0.03 on ≥2 planted AND control < +0.015. Observed: **1 of 2** planted passing, control honest.

## The honest reading
- **The HMM lift is real and decisive (+0.054).** A GBT sees per-row summary statistics; it *cannot* reconstruct a hidden state that only exists across a sequence over time. Extracting that state with an HMM and handing it over lifts the GBT materially. This is genuine composition value.
- **The cluster lift is ~zero — and that's XGBoost being excellent, not the idea failing.** Even with deliberately overlapping clusters, a depth-4 GBT partitions feature space finely enough to recover the cluster-conditional relationship on its own. The explicit cluster-id is redundant. I did *not* keep tuning to force this positive (that would be p-hacking my own test); the null is the finding.
- **The control confirms the harness is trustworthy** — adding a cluster feature to structureless data produced no spurious lift, so the HMM lift isn't an artifact.

## What this means for the plan (and for Arie)
The result splits the composition claim cleanly, and the split is *favorable precisely because it's disciplined*:

1. **Composition earns its keep only for structure a GBT cannot internalize from the raw features** — hidden/temporal/sequential state (HMM, proven here), and by direct extension the task-coverage families the plan already prioritizes: survival (censoring), forecasting (time index), state models. This is the SAME class as "questions GBT can't answer."
2. **Composition is NOT a blanket win.** For ordinary tabular latent structure the GBT reconstructs itself, the cluster-then-classify motif adds nothing. A system that composes reflexively would burn compute for no lift — exactly the AutoML failure mode.
3. **Therefore the design change (already the plan's REVISE gate):** the agent reaches for component composition **only on cited evidence of GBT-irreducible structure** — temporal signal, censoring, sequence dependence — wired into `validateTriageDecision`. Reflexive composition is disallowed by construction.

This is a stronger position with a skeptic than a blanket PASS would have been: it concedes his point where he's right (GBT reconstructs ordinary structure), proves the exception where the plan's real value lives (structure GBT can't touch), and turns the boundary into an enforced gate rather than a hope.

## Caveat / next
Two structural datasets is thin; the HMM case should be corroborated on (a) a real association sequence dataset if available, and (b) the survival and forecasting families in V3 and a follow-up, which test the same "GBT-can't-reach-this" thesis on their own terms. ALS-embedding-as-feature was not tested (implicit lib not installed) — a noted gap, not a claim.

## Reproduce
`./run.sh v2_component_lift` — deterministic (seeds 31–35). Raw records in `results/v2_component_lift.result.json`.
