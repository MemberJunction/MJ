# Track B (Infrastructure) + Integration Reconciliation — Report

**Both tracks COMPLETE. The two-track program (PLAN.md Addendum 6) is closed: Theory ⟂ Infra, each proven separately, reconciled exactly once — Δ = 0.000.**

## Track B scoreboard (machinery-correct; fixtures only, no ideas claimed)

| Gate | Result | Evidence |
|---|---|---|
| **B1 Core lockstep** | ✅ 49/49 tests | `Core/src/tasks.ts` (ALL_TASKS ×10) + `composite-schema.ts` (`validateCompositeSpec`, `findCompatibleSlots/Fillers`) + barrel exports + sidecar `Task` Literal; three-way contract test parses the REAL migration SQL + `schemas.py`; 8 legal / 13 named-illegal graphs; affordance-expansion property |
| **B2 Fresh DB** | ✅ | `MJ_MCF_Fresh` on sql-claude: migrate (v5.46 baseline + MCF migration) → codegen 5.47 (advancedGen off) → **all 6 entities named exactly as predicted** (`MJ: ML Port Types/Components/Component Ports/Component Slots/Port Adapters/Composite Memberships`), `MLModel` +Kind/ParentModelID/Task/ComponentID, Kind default `'Standard'`, Task CHECK → 10 EntityFieldValues, generated classes compile |
| **B3 Catalog slice** | ✅ | 23 port types + 10 components (6 algorithm-wrapped via `@lookup`, 2 calibrators `Planned`, 2 templates w/ slots) + 3 adapters pushed via `mj sync push`; **zero orphan FKs**; views resolve names |
| **B4a Seeded legality** | ✅ 8/8 | `validateCompositeSpec`/`findCompatibleSlots` over the REAL DB rows; **an illegal edge became legal by seeding an adapter ROW — zero code change** (metadata-driven legality proven); `CodeApprovalStatus` Pending→Approved + CHECK rejects invalid |
| **B4b As-of/guard** | ✅ 311/311 | Engine unit suite green in the worktree (filterAsOf, deny-list, dominance, assembly) |
| **B4c Cascade spike** | ✅ | Real sidecar: A(train dev) → predict frozen → adapter → B(train augmented + forwarded holdout); **sha256: holdout ∩ child-fits = ∅; holdout scored exactly once**; composite AUC sane |
| **B4d Integration suite** | ✅ 4/4 | live train+score ×3 (xgboost/logistic/ridge incl. the RSP batch-scoring path) + the spike |

## The reconciliation (the single point where the tracks meet)

`mc-reconciliation.integration.test.ts`: More Cheese assembled through the **REAL `FeatureAssemblyExecutor`** (4 `DatedSourceSpec` sources, as-of on the period start, leakage deny-list, in-memory seam) → **REAL sidecar xgboost**, same hyperparameters, the **exact Track-A seed-201 split** (indices exported from the standalone run).

- **Feature-matrix parity: 100.00%** — 0 of 7,452 numeric cells differ from Track A's hand-built assembly.
- **Holdout AUC: 0.737 vs 0.737 — Δ = 0.000** (tolerance was ≤0.02).

### The genuine integration finding (the separation principle paying off)
First run: only 60.6% cell parity. Cause isolated in minutes *because both halves were pre-proven*: the executor's `filterAsOf` is **inclusive** (`≤ cutoff`) while honest assembly counts **strictly-before** (`<`) — and on this schema dues orders/payments are written ON the period start date, so the inclusive boundary **counts same-day transactions that may BE the outcome** (same-day leakage). Mapped at the call site (cut at StartDate−1d; recency +1 constant shift) → exact parity. **Framework follow-up filed: `DatedFeatureSpec` needs an explicit boundary flag (strict default recommended).** This is precisely the class of defect the reconciliation existed to catch, and it could not have been attributed this fast if theory and infra had been tested together.

## Artifacts
- Code: `Core/src/{tasks,composite-schema,port-types}.ts` + tests · sidecar `Task` Literal · `metadata/ml-{port-types,components,port-adapters}/` · `Engine/src/__tests__/integration/{composite-cascade-spike,mc-reconciliation}.integration.test.ts` · `trackb/seeded-legality.check.mjs`
- Fixture: `phase0/realdata/mc_reconciliation_fixture.json` (tables + exact split + reference)
- DB: `MJ_MCF_Fresh` on sql-claude:1444 (droppable/recreatable)

## Program status
- **Track A (theory):** COMPLETE — `phase0/realdata/memos/REALDATA_VERDICT.md` (8 PASS · 1 honest-no-lift · 1 REVISE · 0 KILL)
- **Track B (infra):** COMPLETE — this report
- **Integration:** COMPLETE — exact reconciliation + 1 framework follow-up
- **Next:** the Doc 1–5 build proper (catalog to 58, drivers, tree/study, composite executor, agent) — every piece now standing on validated ideas AND validated machinery, with the RD-*→production twin map (PLAN.md A7.6) as the specification.
