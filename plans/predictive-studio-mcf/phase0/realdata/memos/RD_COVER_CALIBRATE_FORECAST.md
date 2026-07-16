# RD-COVER / RD-CALIBRATE / RD-FORECAST — the remaining execution arms (More Cheese)

## RD-COVER — survival vs GBT-window on real censoring — **REVISE (honest)**
CoxPH/WeibullAFT vs GBT-window-365 on real time-to-lapse (69 events, 96% censored; seeds 211–213). **All arms rank near-ceiling (C-index 0.96–0.99) and the GBT-window actually edges the survival arms on pure ranking in 3/3 seeds.** Two honest notes: (1) demo-data durations are near-deterministic given outcome (calendar-year periods → renewed≈365d, lapsed cancel mid-year), inflating every C-index and blunting the comparison; (2) consistent with V3's REVISE — the survival family's justification is **task coverage, not ranking superiority**: only it answers *WHEN* (survival curves, remaining-lifetime estimates) and handles the 305 live Actives without discarding or mislabeling them. The GBT-window emits no time estimate, structurally. Position unchanged: survival ships in the business-question set for the questions GBT cannot express; claims of ranking superiority are dropped (that was already V3's outcome).
`results/rd_cover.result.json` · ~20 holdout events/seed → wide CIs, stated.

## RD-CALIBRATE — the helps-or-skip gate on real renewal data — **PASS**
Raw GBT ECE **0.0315** → sigmoid-CV **0.0057** (isotonic-CV 0.0141 with the best log-loss 0.170 vs raw 0.192). Calibration helped and never degraded log-loss; the gate decided CALIBRATE (had raw ECE been ≤0.03 it would have said SKIP — the gate deciding is the test). At a 94% base rate the absolute ECEs are small, exactly why the V6 design note (gated, never blind) matters. `results/rd_calibrate.result.json`.

## RD-FORECAST — dues revenue, time-ordered holdout — **PASS**
Monthly dues 2013-01→2026-06 (139 months), holdout = trailing 12 (time-ordered enforced structurally — the module contains no RNG; a random split is unwritable). **MASE: ETS 1.84 < seasonal-naive 2.08.** Both >1 because the trailing year sits atop steep growth — reported plainly; the floor discipline (must beat naive) and the T5 time-ordered-holdout invariant are the proven claims. `results/rd_forecast.result.json`.
