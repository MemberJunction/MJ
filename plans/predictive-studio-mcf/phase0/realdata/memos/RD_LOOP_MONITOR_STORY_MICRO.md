# RD-LOOP / RD-MONITOR / RD-STORY / RD-MICRO — the loop, the watch, the stories (More Cheese)

## RD-LOOP — branch → synthesis → budget → illegal-reject — **PASS**
Seeded defer {logistic, xgboost} for the renewal ranker; both branches ran through the locked referee (logistic 0.819 / xgboost 0.850 AUC). The **synthesis checkpoint** received the real leaderboard + budget state + a type-system rejection notice and returned `resolve → xgboost`, **citing the actual numbers**. The illegal temptation (CoxPH `survival-curve` → Isotonic Calibrator `probability` input) was **rejected deterministically** by the port rules (no match, no adapter). The **hard TrainBudget(6) tripped a runaway sweep at 7/6** and aborted it — the graveyard's unbounded-search failure, contained by construction. `results/rd_loop.result.json`.

## RD-MONITOR — real temporal drift + challenger — **PASS**
Real data fact discovered en route: **all 69 lapses start in 2022+ (zero in 2013–2021)** — a genuine structural break where the label prior itself drifts 0%→~11%. Incumbent (≤2023) scored on the 2024/2025 cohorts: **PSI alarms fire hard** (score PSI 3.0–3.4; top-feature PSI 9.8 vs the 0.25 stale threshold) while labeled AUC decays 0.729→0.666. Challenger (≤2024, sees the churn era) improves +0.032 on 2025 → **recommendation: promote — never auto-promoted**. Confound (growth + censoring mix) stated; thresholds tunable. `results/rd_monitor.result.json`.

## RD-STORY — formation, faithfulness, retrieval, reuse — **PASS**
The session's real library: *"Membership Renewal Likelihood"*, *"Member Engagement Cadence Groups"*, *"Member Lapse Time Predictor"*, *"Monthly Dues Revenue Forecast"* — tagger-proposed nominal names + narratives grounded in real columns. **Faithfulness (anti-post-hoc):** the renewal ranker's narrative names 2 of its top-3 REAL feature importances (`auto_renew`, `start_year`) — code-checked, not judged. **Retrieval:** nominal+narrative top-3 = **1.00** vs technical-only 0.88 on 8 business queries. **Reuse:** one genuine cross-situation event on record (session run 1: S5 reused S1's cluster component; run 2's S5 chose commit — both legal, both recorded). `results/rd_story.result.json`.

## RD-MICRO — report-grade tables (no pass bars)
- **Class weighting at the real 94/6 base rate did NOT help** (PR-AUC(lapse): default 0.282 vs weighted 0.250) — the gate's load-bearing element is *judging by PR-AUC/lift*, not the weighting itself; the bank entry gets re-worded accordingly (gate wisdom refined by real data, which is the banks' whole learning loop).
- **Missingness:** sentinel encoding beat median-impute for the GBT (AUC 0.842 vs 0.826); the missingness indicator added nothing a tree needed. Informs the `hadData` presence-mask design: for tree families the mask is redundant with sentinels; it matters for linear/distance families.
- **Verdict stability:** S1 repeat in identical context → same verdict (measured in RD-REASON).
`results/rd_micro.result.json`.
