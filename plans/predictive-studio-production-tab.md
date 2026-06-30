# Predictive Studio — "Models in Production" tab rework

**Status:** in progress. **Decision (2026-06-29):** the Production tab is **model-centric**, not
binding-centric. A model does NOT need a scoring binding to appear here — **every approved (Published)
model shows**, whether idle, scheduled, or bound. From the tab you can: review a model's **past runs +
results**, **schedule** it to run regularly (generic output → Process Run Details, no write-back column
required), and **set up a scoring binding** (write-back to a column). Reactive + **DB-light**: bound to the
`PredictiveStudioEngine` (a `BaseEngine` subclass) caches; run history loaded **on demand** (Process Runs
grow unbounded — never bulk-cached).

## Why model-centric
- A binding is a *deployment marker* (registration + schedule + lineage), not a prerequisite to run or to
  save results. A model can run as a `WorkType='ML Model'` Record Process and its predictions persist in
  `MJ: Process Run Details` (ResultPayload) with **no binding**.
- So "in production" = "an approved model you can operate" — list all Published models; show each one's
  deployment state (idle / scheduled / bound) + its run history.

## Data model (all existing — no new entities)
- `engine.PublishedModels` (cached, reactive via `ObserveProperty('_Models')`).
- A model's Record Processes = `engine.RecordProcesses` whose `Configuration.modelId === model.ID`
  (`WorkType='ML Model'`). A model's bindings = `engine.ScoringBindings` where `MLModelID === model.ID`.
- Past runs = `MJ: Process Runs` where `RecordProcessID ∈` the model's RP ids (on-demand RunView, capped,
  newest-first) → per-run `MJ: Process Run Details` carry each prediction's `ResultPayload`.
- Schedule (generic) = a scheduled `WorkType='ML Model'` Record Process, **no `OutputMapping`** → output
  lands in Process Run Details. Schedule + write-back = `createScheduledModelScoring` (requires `outputField`).

## Phases (commit per phase)

- [x] **A — Reactive model-centric list + run history (DB-light).** ✅ Engine: `RecordProcessesForModel(id)`
      + `RecordProcessIDsForModel(id)` + `LoadRecentRunsForModel(...)` (generalized the run loader into a shared
      `loadRunsForProcessIds`). Component rewritten model-centric + inline-template: subscribes to
      `engine.ObserveProperty('_Models')` (reactive, no polling); renders ALL Published models (master/detail)
      with deploy state (idle/scheduled/bound from cached bindings + RecordProcesses), KPIs, the selected model's
      bindings/schedules, and **on-demand run history** (last 90d, capped). DB-light: list from caches, runs only
      for the selected model. **AC met:** a Published model with no binding appears (Idle); its runs show when it
      has run as a Record Process. Dashboards build clean; PS tests 82 pass.
- [x] **C — Engine: generic-output scheduling + whole-entity scope.** ✅ `createScheduledModelScoring`
      `outputField` is now optional (omit → no `OutputMapping`, no binding, predictions → Process Run Details);
      `scope.all` (whole entity) → `ScopeType='Filter'`, `(1=1)`. Action metadata `OutputField` `IsRequired→false`.
      263 tests. (Commit `f606f095ad`.)
- [x] **B1 — Server seam: `CreateScoringProcess` Remote Op.** ✅ `createScoringProcess` helper (on-demand
      `WorkType='ML Model'` RP + optional `OnDemand` binding, sharing Phase-C primitives via
      `scoring-process-shared.ts`); the `PredictiveStudio.CreateScoringProcess` Remote Op (declaration → codegen →
      thin `InternalExecute` impl). 287 tests. (Commits `63aef285cb` / `e8e7294d48` / `d704396409`.)
- [x] **B2 — Operate panel UI.** ✅ `PSOperateDialogComponent` — an "Operate" (rocket) button on a model's
      detail opens an `mj-dialog` with **scope** (Everyone / a saved `MJ: User View` / an `MJ: List`) + **output**
      (run-history-only / write-back to a column, autocompleted from the entity's fields, with a probability/class
      toggle for classification) + a live summary. Footer **[Run now]** / **[Schedule…]** both first call
      `PredictiveStudioCreateScoringProcessOperation` → Run-now uses `RecordProcessRunNowOperation`, Schedule opens
      the generic `@memberjunction/ng-scheduling` `ScheduledJobDialog` (Run-Record-Process job type +
      `{RecordProcessID}` config). Target entity fixed to the model's training entity. Pure submit→input mapping
      extracted + unit-tested (`ps-operate-dialog.mapping.ts`). On success → engine `Config(true)` → reactive list
      updates. 94 tests. (Commit `f08919f208`.)
- [x] **D — UX polish: run drill-in.** ✅ Run-history rows are clickable → drill into the run's **per-record
      predictions** (`MJ: Process Run Details`, parsing the `ResultPayload` score/class/scoredAt), with a back link,
      loading + empty states. (This commit.) Distribution sparkline for bound models — a follow-up nicety.

**Status: A · C · B1 · B2 · D all shipped.** Remaining: MJServer integration script for the operate flow + an
E2E pass.

## Guards
- Reactive via `BaseEngine` `ObserveProperty` — no polling, no bulk run caching.
- Entity-agnostic; strong typing (no `any`, derive field types from entities).
- Design tokens only; reuse `production-distribution.ts` pure helpers (34 tests) + the Registry detail shape.

## Reference
- Engine: [`engine/predictive-studio.engine.ts`](../packages/Angular/Explorer/dashboards/src/PredictiveStudio/engine/predictive-studio.engine.ts)
- Helpers: `scheduling/scheduled-model-scoring.ts`, `scoring/scoring-binding.ts` (PS Engine)
- Storage paths: [`guides/PREDICTIVE_STUDIO_GUIDE.md` §6.5](../guides/PREDICTIVE_STUDIO_GUIDE.md)
