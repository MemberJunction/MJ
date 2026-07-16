# RD-COMPOSE — Composition on real association data (the V2 real-data gate)

**Verdict: HONEST-NO-LIFT** — composite (cluster-id + HMM-state + calibrated GBT) mean lift **−0.014 AUC** vs the raw as-of GBT (range −0.042..+0.020, 5 seeds). The demand-gate design is confirmed, and sharpened.

## Results (`results/rd_compose.result.json`)
| seed | base AUC | composite AUC | lift | PR-AUC(lapse) base→comp | ECE comp |
|---|---|---|---|---|---|
| 201 | 0.850 | 0.851 | +0.001 | 0.309→0.296 | 0.010 |
| 202 | 0.798 | 0.756 | −0.042 | 0.228→0.114 | 0.031 |
| 203 | 0.879 | 0.860 | −0.018 | 0.310→0.345 | 0.025 |
| 204 | 0.808 | 0.779 | −0.029 | 0.202→0.180 | 0.025 |
| 205 | 0.848 | 0.867 | +0.020 | 0.404→0.299 | 0.013 |

## Reading (the important part)
- Consistent with V2's REVISE: **feature-space structure (engagement clusters) is exactly what a GBT reconstructs itself** — composing it in adds variance, not signal, at n≈1.2k with 69 minority events.
- **The gate gets sharper:** Hopkins was 0.96 (strong cluster *tendency*) yet no lift — so cluster tendency alone is INSUFFICIENT composition evidence. The demand-gate must require **label-linked** structure evidence (e.g., per-cluster outcome-rate divergence, regime-vs-outcome dependence), not geometric clusteredness. This refinement goes into `validateTriageDecision`'s combine-evidence rule (Doc 5) and the strategist's gates (Doc 4).
- **The bonus number that matters for Doc 1/Sonar:** `gbt_core` (today's 2-aggregate `DatedFeatureSpec` subset) scored 0.618–0.814 — **0.08–0.13 AUC below** the full as-of set. Widening the as-of aggregate vocabulary (Sonar Addendum item #1) is worth ~a tenth of AUC on real data; that item now has its justification number.
- Calibration inside the composite behaved (ECE 0.010–0.031).

## What it changes
Nothing is killed: composition remains demand-gated (as designed since Phase 0), with the gate upgraded from "structure evidence" to "**label-linked** structure evidence". The HMM/cluster components remain valuable as *segmentation deliverables* (S5) even where they don't lift supervised AUC.

## Reproduce
`.venv/bin/python realdata/rd_compose.py` — seeds 201–205, referee-audited.
