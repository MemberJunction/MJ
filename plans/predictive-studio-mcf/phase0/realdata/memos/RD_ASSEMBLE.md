# RD-ASSEMBLE — Real-trap leakage, as-of honesty, and the trust gate (More Cheese)

**Verdict: PASS** — the assembly/leakage pillar proven on REAL post-outcome columns, not planted ones, plus the promotion gate blocking the leaky model mechanically.

## Method
1,242 labeled member-periods (renewed=1173 / lapsed=69). Arms share the locked-holdout referee (seeds 201–203): `asof_honest` (GBT on engagement/tenure/dues assembled strictly before each period's start) vs `naive_with_traps` (same + the real post-outcome columns `CancellationReason`, `cancel_days_after_start`, `renewal_year`); two leak screens — statistical (|corr|>0.5) and semantic (ONE Gemini call over column names+meanings, no values) — scored against 5 known traps and 5 realistic decoys; and the single-feature-dominance trust gate run on the leaky model.

## Results (`results/rd_assemble.result.json`)
- **Inflation reproduced on real traps: naive = 1.000 AUC every seed** vs honest as-of 0.798–0.879 → **+0.158 mean inflation**. A pipeline that doesn't assemble as-of would ship a "perfect" model that knows the answer because the answer was written into the row.
- **Semantic screen: recall 0.80, decoy FPR 0.00** — caught `Status`, `CancellationDate`, `CancellationReason`, **and `RenewalDate` (which the statistical screen missed — recall 0.60)**. The union-beats-either claim (V1) holds on real data; the LLM caught a leak by *meaning* where the correlation route failed.
- **`EndDate` missed by both screens — and honestly debatable as a trap**: in this schema EndDate is the *scheduled* calendar-year period end (mostly Dec-31), largely knowable at period start. The "miss" is defensible; recorded as a nuance, not excused.
- **Trust gate: promotion BLOCKED in 3/3 seeds** — `cancel_days_after_start` owns 99.7–100% of feature importance, exactly the single-feature-dominance signature (`detectSingleFeatureDominance` posture, threshold 0.5). The near-perfect score alarms instead of celebrating, mechanically.

## What it proves for the plan
Pillars 1–2 of the effort order (assembly correctness + leakage control) and the graveyard rows "trained confidently on leaked data" / "outputs nobody trusted" — demonstrated end-to-end on a real association schema: honest as-of number (~0.84 AUC), leak reproduced, leak caught by the screen stack, leaky model refused promotion.

## Reproduce
`cd phase0 && DYLD_LIBRARY_PATH=/opt/homebrew/opt/libomp/lib .venv/bin/python realdata/rd_assemble.py` (sources `.env.local` for the one screen call). Referee records in `results/referee_audit.jsonl`.
