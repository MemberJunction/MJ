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
- [ ] **B2 — Operate panel UI (the UX).** An "Operate" button on a model's detail opens a dialog with
      **scope** (View via `view-selector` / List via `record-selector` / Everyone) · **cadence** (Once / Daily /
      Weekly / Monthly) · **output** (Generic / Write-back column, autocompleted from the entity's fields), plus a
      live "what will happen" summary. **Wiring (all scouted):**
      - call `new PredictiveStudioCreateScoringProcessOperation().Execute(input, {provider, user})` → `recordProcessId`
        (pattern: `ps-registry.component.ts:432`).
      - **Run now** → `RecordProcessRunNowOperation` (existing op) on that `recordProcessId`.
      - **Schedule** → open the generic `@memberjunction/ng-scheduling` `ScheduledJobDialogComponent`
        (`[JobTypeID]`=Run Record Process, `[DefaultConfiguration]={ RecordProcessID }`, `[HideJobType]=true`,
        `(Close)→{Saved, Job?}`). Add `@memberjunction/ng-scheduling` as a dashboards dep.
      - On success → engine `Config(true,…)` refresh (the reactive list updates the deploy state).
      Unit tests (pure submit→intent mapping) + docs.
- [ ] **D — Amazing UX polish.** Empty/idle states, run-result drill-in (a run → its per-record predictions
      from Process Run Details), schedule chips, distribution sparkline, consistent with the Registry detail.

## Guards
- Reactive via `BaseEngine` `ObserveProperty` — no polling, no bulk run caching.
- Entity-agnostic; strong typing (no `any`, derive field types from entities).
- Design tokens only; reuse `production-distribution.ts` pure helpers (34 tests) + the Registry detail shape.

## Reference
- Engine: [`engine/predictive-studio.engine.ts`](../packages/Angular/Explorer/dashboards/src/PredictiveStudio/engine/predictive-studio.engine.ts)
- Helpers: `scheduling/scheduled-model-scoring.ts`, `scoring/scoring-binding.ts` (PS Engine)
- Storage paths: [`guides/PREDICTIVE_STUDIO_GUIDE.md` §6.5](../guides/PREDICTIVE_STUDIO_GUIDE.md)
