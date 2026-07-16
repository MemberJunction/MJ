# PS Model Component Framework — Build Execution Roadmap

**Purpose.** The single ordered, dependency-aware plan for building Docs 1–5, with an honest ledger of what the two-track validation ALREADY landed. This is what "start the full execution" runs against. Companion to `PLAN.md` (the design; 5 docs + 7 addenda) — this file is the *do-list*.

## Status legend
✅ done · 🟡 partial (started, evidence exists) · ⬜ not started

---

## Where we are (validation → build handoff)

Validation is **complete** (`trackb/TRACKB_REPORT.md`, `phase0/realdata/memos/REALDATA_VERDICT.md`): ideas proven on real data, machinery proven on fixtures, reconciled Δ=0.000. **That work also landed a meaningful chunk of Doc 1 already** — the roadmap below credits it honestly rather than re-listing it as "to do."

The RD-* standalone twins (`phase0/realdata/`) are the **executable specification** for Docs 4–5 (see PLAN.md A7.6 twin map). Building = porting each proven twin to its production home.

---

## DOC 1 — Foundation (ontology + catalog + TestBench) — 🟡 ~45% done

| Item | State | Note |
|---|---|---|
| Migration: 6 tables + ALTERs | ✅ | landed on `MJ_MCF_Fresh`; convention-clean; commit to `migrations/v5/` (fresh timestamp) |
| CodeGen: 6 `MJ: ML *` entities | ✅ | names/fields/EFVs verified; generated classes compile |
| `Core/src/tasks.ts` (ALL_TASKS) | ✅ | 3-way lockstep test green |
| `Core/src/port-types.ts` (23) | ✅ | exported, contract-tested |
| `Core/src/composite-schema.ts` | ✅ | `validateCompositeSpec` + `findCompatibleSlots/Fillers`, 49/49 |
| sidecar `Task` Literal | ✅ | additive; binary `ProblemType` preserved |
| Catalog metadata | 🟡 | **10 of 58** components seeded (+23 port types, 3 adapters). Remaining: **48 components** + their ports/axes/`@file:` hyperparameter schemas |
| `MLComponentEngine` (BaseEngine cache) | ⬜ | shape specced in A7.3; extend `BaseEngine<T>`, `Config()` array, `GetConfigData` getters; don't re-cache ComponentMetadataEngine entities |
| `MJMLComponentEntityServer` | ⬜ | `ValidateAsync` runs `validateCompositeSpec` on GraphSpec; maintains Composite Membership rows on Save |
| target-optional sidecar contract | ⬜ | `TrainRequest.target?` + Prediction `vector?`/`cluster?`/`curve?` (Docs 3 T3–T5 depend on it) |
| `/health` runnable-component reporting | ⬜ | report Planned-vs-Active per driver importability |
| **TestBench** package (`TestBench/` + `python/psgen/`) | ⬜ | production-grade generators + dials + parity fixtures + tolerances; Phase-0 harness is the throwaway preview to port |

**Doc 1 exit gate:** contract tests green · full catalog (~70 rows) RunView-visible · `validateCompositeSpec` matrix green (✅ already) · TestBench parity green · fresh-DB migrate→codegen→sync clean (✅ pipeline proven) · existing PS end-to-end still green (✅ 311/311).

---

## DOC 2 — The Study (spec sheets, vocabulary, tree, placements) — ⬜ not started · **runs in parallel with Doc 1** (no DB/code)

Workspace `plans/predictive-studio-mcf/study/`. Gold sheets first (xgboost/cox/arima) → **U1 freeze template** → 16 family batches (producer agents + independent reviewer) → cross-model vocabulary reconciliation → **U2 sign-off** → property matrix + containment → tree(s) + facets → **U3 sign-off** → placement of every idea → **U4 contested**. Output: 58 reviewed sheets, `vocabulary.md`, adapter closure, `tree-check.mjs` (permanent CI gate), `placement.json`, seed diffs that **amend Doc 1's catalog**. **This is the "main thing" and gates Doc 4's tree.**

*Real-data feedback already banked for the study:* composition demand-gate needs **label-linked** structure evidence (not Hopkins); `gbt_core` shows the 2-aggregate as-of vocabulary costs 0.08–0.13 AUC (widen aggregates).

---

## DOC 3 — Drivers: 48 remaining models in 7 tranches — ⬜ (sidecar has 6) · **per-family unblock as Doc 2 sheets clear**

T1 sklearn/catboost + **calibrators** · T2 statsmodels GLM/GAM · T3 unsupervised (+ target-optional) · T4 survival (C-index) · T5 forecasting (+ time-ordered holdout mode) · T6 sequence-state · T7 CLV/reco/pattern. Each tranche = drivers + contract deltas + **recovery-of-planted-structure** floors (TestBench) + Status flips Planned→Active. *De-risked:* the frozen-cascade + holdout-once mechanics already proven live (cascade spike); CoxPH/ETS/HMM already run in the Track-A twins.

---

## DOC 4 — Composition & Search (executor, tree, strategist) — 🟡 foundation exists

| Item | State |
|---|---|
| `validateCompositeSpec` (legality) | ✅ Doc-1 |
| frozen-cascade mechanics + holdout-once | ✅ proven (cascade spike) — port to `CompositeTrainingExecutor` |
| `CompositeTrainingExecutor` / `CompositeInferenceExecutor` | ⬜ the real N+1-lineage executor |
| Tree + banks schema + `resolveLeafProfile` | ⬜ seeded from Doc-2 study |
| `TreeSamplingWaveStrategist` (IWaveStrategist) + budget gates | ⬜ `TrainBudget` twin → existing MaxRuns/MaxComputeCost gates |
| per-task metric routing + `deriveTrustVerdict` widening | ⬜ |

---

## DOC 5 — Design Agent, Story, Evals — ⬜ · **the RD-* twins are the spec (A7.6)**

`TriageDecision` Zod (← `rd_reason.validate_triage` incl. identification gate) · Statistician sub-agent + sidecar `/profile` (← `situations.qualia_*`) · component-catalog `MJ: AI Agent Data Sources` row (Block-4 assembly) · Composition Designer + synthesis checkpoint (← `rd_loop`) · `MJ: ML Design Decisions` capture · Story Tagger + `MJ: ML Story Tags` (← `rd_story`) · 12-scenario eval harness + `DesignDecisionOracle`/`LLMJudgeOracle` (← `rd_story` faithfulness). Small migration for the two new entities.

---

## Critical path + parallelism

```
Doc 1 (finish: catalog×58, MLComponentEngine, target-optional, TestBench)  ┐
Doc 2 (the study — parallel, no code) ────────────────────────────────────┤→ amends Doc 1 catalog
        └─ per-family sheets unblock ─→ Doc 3 tranches (T1..T7)            │
Doc 2 tree/vocab ─────────────────────────────────────────→ Doc 4 (executor+tree+strategist) → Doc 5 (agent+story+evals)
```
- **Start-now, parallel:** finish Doc 1 (engineering) ‖ Doc 2 (the study, agent-driven, no DB).
- **First shippable increment:** Doc 1 + T1 drivers → catalog visible in the Studio, ~19 runnable models, contract matrix green — user-visible immediately.
- **Permanent CI gates born here:** `tree-check.mjs` (Doc 2), the floor-check matrix (Doc 1), holdout-once instrumentation (✅ Doc 4 pattern proven).

---

## Two human handshakes before/around kickoff (from the plan, not code)

1. **Team "go"** on the gated plan — the Arie thread: send `REALDATA_VERDICT.md` + `PHASE0-Validation-Report.pdf` (evidence the bets hold on real data). *Ready to send now.*
2. **Work-split + frozen contracts** with the Sonar/Python collaborator — split by language seam (TS/metadata/agents ‖ Python sidecar drivers); freeze the 4 contracts (sidecar train/predict, port vocabulary, Task union, composite GraphSpec — **all 4 now exist and are tested**).

---

## READINESS: are we ready to start full execution?

**YES — planning is complete and de-risked.** Every idea is validated on real data, every machinery seam on fixtures, the two met at Δ=0.000, and ~45% of Doc 1 is already built and green. The 4 cross-cutting contracts Docs 3–5 depend on all exist and are contract-tested. No architecture discovery remains — A7.6 maps each remaining piece to a proven twin.

**The one gating decision is yours, not technical:** pick the kickoff lane —
- **(A) Engineering-first:** finish Doc 1 (catalog→58, `MLComponentEngine`, target-optional contract, TestBench) → first shippable increment (catalog + T1). Fastest visible progress.
- **(B) Study-first:** run Doc 2 (the spec-sheet study) to lock vocabulary/tree/placements before more code — higher up-front rigor, gates Doc 4 anyway.
- **(C) Both in parallel** (recommended by the critical path): engineering finishes Doc 1 while the study runs; they converge when Doc 2's seed diffs amend the catalog.

Say which lane (or "C") and I start.
