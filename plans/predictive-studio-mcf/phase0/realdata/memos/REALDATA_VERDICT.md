# Real-Data Verdict — the FULL plan tested on More Cheese Demo V2 (Track A / Theory)

**What this is.** Phase 0 (10 synthetic experiments, 8 PASS · 2 REVISE · 0 KILL) validated the plan's bets on planted truth. This program re-tested the **whole plan** on a REAL association dataset — More Cheese Demo V2 (`BlueCypress/morecheesev2`): 16k records, 385 members, 1,558 membership periods, events/courses/orders/payments, real leakage traps, a real structural churn break — under the governing principle **test theory and infrastructure separately** (this is the theory track; zero MJ infra in the loop). Every headline number comes from the locked-holdout referee's append-only audit; every LLM judgment is schema-forced, temp-0, block-hashed.

## Scoreboard

| Pillar (plan home) | Experiment | Headline | Verdict |
|---|---|---|---|
| Assembly + leakage (Docs 1–2, WS-2) | RD-ASSEMBLE | real traps inflate to a **perfect 1.000 AUC** vs honest as-of 0.80–0.88; semantic screen recall 0.8 / 0 decoy FPs, catches `RenewalDate` that statistics miss; **dominance gate BLOCKS the leaky model 3/3** | **PASS** |
| Reasoning-through-situations + meaningfulness (Doc 5) | RD-REASON | **5/5 situations correct** via the 7-block constructed prompt; citations 1.00; meaningfulness 5/5; S1 stable on repeat | **PASS** |
| The honesty case (identification) | RD-REASON S3 | single-shot, the agent **conflated risk with uplift despite a prose warning**; the **deterministic gate rejected it and the repair loop recovered DEFER in one retry** — "LLM proposes, code enforces," demonstrated on the hardest case | **PASS (via gate)** |
| Composition (Doc 4, the V2 gate) | RD-COMPOSE | cluster+HMM composite: **−0.014 mean lift** — honest no-lift; Hopkins 0.96 yet no lift ⇒ the demand-gate must require **label-linked** structure, not cluster tendency | **HONEST-NO-LIFT** (demand-gate confirmed + sharpened) |
| Task coverage (T4) | RD-COVER | all arms rank near-ceiling on demo-grade durations; GBT-window edges ranking — survival's case is **answering WHEN + censoring**, not ranking superiority (consistent with V3) | **REVISE (honest)** |
| Calibration (WS-1) | RD-CALIBRATE | raw ECE 0.0315 → sigmoid-CV 0.0057; log-loss never degraded; gate says CALIBRATE | **PASS** |
| Forecasting + time-ordered holdout (T5) | RD-FORECAST | ETS MASE 1.84 beats seasonal-naive 2.08 on the real trailing year; time-ordered split enforced structurally | **PASS** |
| The metacognitive loop + budget (Docs 4–5) | RD-LOOP | branches → synthesis resolves to the true winner **citing real numbers**; illegal port wiring rejected; **hard budget cap trips a runaway sweep at 7/6** | **PASS** |
| Monitoring (Arie's #1) | RD-MONITOR | REAL structural break found (all 69 lapses in 2022+): PSI alarms 3.0–9.8 vs 0.25 threshold while AUC decays 0.729→0.666; challenger +0.032 → **recommend promote, never auto** | **PASS** |
| Story layer + reuse (Doc 5) | RD-STORY | 4 real components named + grounded; narrative **faithful to real importances** (code-checked); retrieval 1.00 vs 0.88; one genuine cross-situation reuse | **PASS** |
| Bank/gate wisdom + missingness | RD-MICRO | class-weighting did NOT help (PR-AUC 0.250 vs 0.282) — the gate's value is the metric, not the weighting; sentinel beats median for trees | report-grade findings |

**8 PASS · 1 HONEST-NO-LIFT · 1 REVISE · 0 KILL** — and the two non-passes are the same two honest results Phase 0 already flagged (composition demand-gated; survival justified by task coverage), now confirmed on real data.

## The chain, demonstrated end-to-end
One session, one schema, five different questions → five different reasoned verdicts (**including a correct refusal**) → four different model classes actually built (calibrated GBT, CoxPH, ETS, KMeans/HMM) → each story-tagged with faithful, grounded, retrievable names → components reused across situations → every step referee-audited under a hard budget. That is the generative loop the plan proposes, running on real data with no MJ infrastructure — the theory, proven separately, as required.

## Design consequences fed back into the plan
1. **Identification gate → code** (`validateTriageDecision`): uplift without treatment data admits only defer. Prose warnings demonstrably insufficient.
2. **Combine-evidence rule upgraded**: label-linked structure evidence required; cluster tendency (Hopkins) alone is not composition justification.
3. **`validation_plan` added to the triage contract** (mirrors `ModelingPlanSpec.ValidationStrategy`).
4. **DatedFeatureSpec widening is worth ~0.08–0.13 AUC** (`gbt_core` vs full as-of) — the Sonar aggregate item now has its number.
5. **Bank re-wording**: imbalance gate = "judge by PR-AUC/lift" (metric), not "class-weight" (lever).
6. **Presence-mask scope**: redundant with sentinels for tree families; scope it to linear/distance families.

## Honest limits
Demo-grade synthetic-realistic data (durations near-deterministic → RD-COVER's ceiling C-indexes); no treatment column (uplift's DEFER is the correct outcome here — the causal proof remains V10); 69 lapse events (wide CIs, stated); one LLM (gemini-2.5-flash, temp 0); LLM-call budget overran the ≤30 plan to ~40 across two debug runs + final (ledger-capped per run; overage documented). Field-data messiness remains untested until a customer dataset exists.

## Status of the two-track program
- **Track A (theory): COMPLETE** — this document.
- **Track B (infrastructure) + the single integration reconciliation: deferred by decision** until testing review is done; specs live in PLAN.md A6.6–A6.7.

## Artifacts
`realdata/` — loader, features, asof_core, situations, catalog, promptbuild, schemas, session + 9 experiment modules · `memos/RD_*.md` · `results/rd_*.result.json`, `session_library_session1.json`, shared `referee_audit.jsonl` + `llm_audit.jsonl`.
