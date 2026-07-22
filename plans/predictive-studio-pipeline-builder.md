# Predictive Studio — Editable Visual Pipeline Builder

**Status:** in progress. **Owner:** PS dashboard. **Decision (2026-06-29):** make the Training Pipelines
panel a *real* visual DAG builder driven by each pipeline's persisted spec — replacing the prior flat
list (which itself replaced a hardcoded mockup). Keep the **"Training Pipelines"** label for now; a
general **"Data Pipeline"** primitive (sources + feature-step DAG + as-of, ML-agnostic) is a separate,
deliberately-scoped initiative — NOT a rename of this panel.

## Why this is real (not a mockup)

`MJ: ML Training Pipelines` already persists the entire DAG as JSON columns — the mockup was the right
visualization fed with fake data. The builder reads/writes these real fields:

| Field | Shape (`@memberjunction/predictive-studio-core`) | Visual meaning |
|---|---|---|
| `SourceBindings` | `SourceBinding[]` — `{ Kind: 'Entity'\|'Query'\|'ExternalEntity'\|'VectorSet'\|'FeaturePipeline', Ref, Alias? }` | **source** nodes |
| `FeatureSteps` | `FeatureStepGraph` — `{ Steps: FeatureStep[] }`; each step `{ Id, Kind, Label?, Inputs?[] }` + kind config | **feature/embedding** nodes; `Inputs` = edges |
| `AlgorithmID` + `Hyperparameters` | FK + JSON | **algorithm** node |
| `TargetVariable` / `TargetEntityID` | string / FK | **target** node |
| `AsOfStrategy` / `LeakageGuard` / `ValidationStrategy` | JSON | inspector side-panels (not nodes) |

`FeatureStepKind` ∈ `select | impute | standardize | onehot | bin | embedding | llm-derived | flow-agent | vision-llm`.

### Graph mapping (data → nodes/edges)
- Each `SourceBinding` → a `src` node (no inputs).
- Each `FeatureStep` → a `feat`/`emb` node; edges from each step's `Inputs` (step→step).
- Steps with **empty `Inputs`** are roots → connect every `src` node to each root step.
- Terminal steps (no downstream) → the `algo` node; `target` node → `algo` node.
- Layout is the recovered longest-path layering (`layoutDag`/`computeLayers`/`positionColumns`/`edgePath`) —
  deterministic, topology-driven; **never hand-positioned**.

## Phases (commit per phase)

- [x] **P1 — Real read-only DAG.** ✅ Pipeline picker (pills → select) → builds the DAG from the real
      spec (`SourceBindings` → root steps; `FeatureSteps` edges via `Inputs`; terminals + target → algorithm
      → output) → recovered longest-path layout + bezier edges; inspector shows the **selected node's real
      config** + live **Leakage guard / As-of / Validation** parsed from the pipeline (read-only). No fake
      data; no dead Fit/Validate/Train (deferred to P5). Dashboards build clean, PS tests 82 pass.
- [x] **P2 — Editable inspector.** ✅ The parsed spec IS the editable state; nodes/edges are derived, so an
      edit re-derives + re-lays-out. Inspector edits every kind: source (Kind/Ref/Alias), step (Kind switch
      resets config to defaults; per-Kind fields for all 9 kinds), target (variable + problem type), algorithm
      (dropdown + hyperparameters JSON), and live Leakage/As-of/Validation. Dirty tracking + "Unsaved" badge.
- [x] **P3 — Add / remove / rewire.** ✅ Palette "+ Source" / "+ Feature step" add a default node; per-node
      Delete (cleans up downstream `Inputs`); rewire via the inspector's "Inputs (upstream steps)" checkboxes
      with **cycle prevention**. Re-layout on every change. (Inspector-driven, not drag-wiring — robust + explicit
      for a structured persisted DAG.)
- [x] **P4 — Persist.** ✅ Save serializes the edit state back to `SourceBindings` + `FeatureSteps` (+ target/
      algorithm/hyperparameters/Leakage/As-of/Validation) and `pipeline.Save()` — strongly-typed entity,
      provider-threaded, `LatestResult.CompleteMessage` error handling, success/failure notifications.
- [x] **P5 — Validate / Train.** ✅ Validate = client-side spec sanity (sources / target / algorithm / valid
      hyperparameters JSON). Train = `PredictiveStudioTrainModelOperation({ pipelineId })`, gated on a saved
      (non-dirty) pipeline, with busy state, leakage-flag surfacing, and an engine refresh on success → the
      model appears in Registry. Dashboards build clean; PS tests 82 pass.

**Status: builder COMPLETE (P1–P5).** Verified by build + tests; live UI walkthrough (edit → Save → Train on a
real pipeline) still worth a Playwright pass.

## Non-goals / guards
- **No new entity** — everything reads/writes existing `MJ: ML Training Pipelines` JSON columns.
- **Entity-agnostic** — nodes derive from the pipeline's own refs; never hardcode a business entity.
- **Strong typing** — use `MJMLTrainingPipelineEntity` + the `*-core` spec interfaces; no `any`, no hand-copied unions.
- **Design tokens only** — reuse the recovered `--ps-node-*` + shared `--mj-*` tokens.

## Reference
- Spec types: [`packages/AI/PredictiveStudio/Core/src/pipeline-spec.ts`](../packages/AI/PredictiveStudio/Core/src/pipeline-spec.ts),
  [`feature-steps.ts`](../packages/AI/PredictiveStudio/Core/src/feature-steps.ts)
- Layout engine recovered from git `17bd5a4212^:.../ps-pipelines.component.ts`
- Guide: [`guides/PREDICTIVE_STUDIO_GUIDE.md`](../guides/PREDICTIVE_STUDIO_GUIDE.md)
