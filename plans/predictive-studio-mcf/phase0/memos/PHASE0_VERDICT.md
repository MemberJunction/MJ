# Phase-0 Verdict — Idea Validation Before Building

**What this is.** Eight cheap, falsifiable experiments run *before* building the Model Component Framework, to test its contested bets and to reproduce the failures the team (Arie) rightly warned about. Every headline number comes from a locked-holdout referee that scores each arm exactly once and logs an immutable audit trail (`results/referee_audit.jsonl`, `results/llm_audit.jsonl`). Fully reproducible: `./run.sh v<n>_<name>`.

## Scoreboard

| ID | Bet / failure tested | Verdict | Headline |
|---|---|---|---|
| **V1** | semantic leakage detection beats statistics | **PASS** | LLM caught the name-only leak (stat screen: 0.00 → semantic: 1.00), zero decoy false-positives |
| **V2** | components-as-features lift a GBT | **REVISE** | HMM hidden-state feature: **+0.054 AUC**; feature-space clusters: ~0 (GBT reconstructs them) |
| **V3** | task coverage: survival vs GBT-window | **REVISE** | survival wins all 5 seeds, +0.024 C-index (understated: GBT can't answer "when" at all) |
| **V4** | agent triage validity | **PASS** | task-family 1.00, full triage 0.86; **collapses to 0.29 without the stats (+0.57)** |
| **V5** | reproduce p-hacking + contain it | **PASS** | noise search fakes 0.63 AUC; locked holdout reports the truth, 0.50 |
| **V6** | miscalibration + fixable | **PASS** | GBT ECE 0.062 → 0.023 via CV-calibration (single-slice is risky — a design catch) |
| **V7** | naive aggregation leaks; as-of doesn't | **PASS** | leaky 0.85 vs honest 0.61 — a 0.23 inflation gap, removed by as-of assembly |
| **V8** | meaning-tag retrieval beats keyword | **PASS** | story-tag retrieval 1.00 vs keyword 0.50 (+0.50) |
| **V9** | monitoring: drift caught before rot | **PASS** | PSI alarm fires at/before performance decay every seed; challenger recommends (never auto-promotes) |
| **V10** | uplift / persuadables | **PASS** | uplift-targeting 30% of members beats contacting 100% (984 vs 852); segments recovered 90% |

**8 PASS · 2 REVISE · 0 KILL** (V9 + V10 added to close the monitoring gap Arie emphasized and the flagship uplift business claim — the two omissions caught on review).

## What the verdicts mean for the build

- **Nothing was killed.** No part of the plan must be abandoned. The riskiest bet (V2, composition) survived in a *disciplined* form rather than as a blanket claim.
- **The two REVISEs sharpen exactly the thing Arie pushed on.** V2 + V3 together say: composition and extra model families earn their keep **specifically for structure a GBT cannot internalize from raw features** — hidden/temporal state (HMM, proven +0.054), censored time-to-event, sequences, forecasting — and add nothing for ordinary tabular structure the GBT reconstructs itself. This is already the plan's demand-gated design (Addendum 4) and now it's evidence-backed: **the agent composes only on cited evidence of GBT-irreducible structure** (wired into `validateTriageDecision`), never reflexively.
- **The honesty machinery is validated as mechanical, not agentic (V5, V6, V7).** We reproduced the graveyard's deadliest failures — leaderboard p-hacking and aggregation leakage — and showed the locked holdout + as-of assembly contain them completely. Critically, an LLM does **not** exempt the system from p-hacking (it can rationalize a lucky config), which is why these controls are code, not judgment.
- **The two pillars Arie stressed and the flagship business claim are now covered (V9, V10).** Monitoring: a drift alarm fires from input/score distribution shift before label-based performance visibly rots, and the challenger loop recommends (never auto-promotes) — the operational half the graveyard skipped. Uplift: targeting by who is *movable* beats targeting by who is *at risk* and beats contacting everyone, at a fraction of the budget, while declining to contact the members outreach would harm. This is the business case, on causal ground truth.
- **The LLM-era difference is real and measurable (V1, V4, V8).** Meaning caught a leak statistics structurally couldn't (V1); statistics-grounded triage routed tasks correctly and was worthless without the statistics (V4); components are findable by what they find (V8). These are the three capabilities the AutoML graveyard lacked, each now demonstrated rather than asserted.

## Design refinements Phase 0 caught (cheaply, before code)

1. **Calibration must be gated, not blind** — ship cross-validated calibration with a "helps-or-skip" check; a naive single-slice isotonic can *worsen* an already-calibrated model (V6).
2. **Composition is not a blanket win** — gate it on structure evidence; the cluster-then-classify motif is not automatically useful (V2).
3. **Triage: route families confidently, treat commit-vs-defer as the soft call** with a tunable threshold; require a cited statistic per decision (V4).
4. **Story tagging's payoff is the one-line nominal identity**, not verbose descriptions (V8).

## Honest limits

Synthetic planted-truth data throughout (the point: known ground truth to test recovery); LLM experiments are one model (gemini-2.5-flash), few seeds — pre-build signals, not the production eval suite. The natural next step, exactly as promised to Arie: **rerun V2/V3 on one real association dataset**, and let the first shippable increment (the pillar stack — assembly, leakage, calibration, monitoring — which is valuable under every outcome above) be judged as a working artifact rather than a plan.

## The one-paragraph readout

We tested the plan's bets before building. The unglamorous, must-have machinery — leakage control, p-hacking prevention, calibration, honest evaluation, and monitoring — works and demonstrably contains the exact failures that sank prior AutoML efforts. The flagship business value (uplift: who is worth contacting) is demonstrated on causal ground truth, beating both risk-targeting and blanket outreach. The ambitious bet (composable, meaning-tagged components designed by an agent) is validated with discipline: it pays off precisely where gradient-boosted trees *can't* reach — hidden/temporal structure and the task families GBT can't express — and we've turned "compose only when it helps" into an enforceable gate rather than a hope. Nothing needs abandoning; the build proceeds pillars-first, composition demand-gated, with these ten experiments as the evidence base.

## Artifacts
- `experiments/` — 8 runnable scripts. `harness/` — generators, locked-holdout referee, dials, LLM harness.
- `memos/` — one memo per experiment (V1–V8) + this verdict.
- `results/` — per-experiment result JSON + the two append-only audit logs (every number's provenance).
