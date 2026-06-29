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

- [ ] **P1 — Real read-only DAG.** Pipeline picker (list → select) → build the DAG from the real spec →
      render the recovered canvas; inspector shows the **selected node's real config** (read-only). No fake
      data, no dead Fit/Validate/Train (hidden until P5). **AC:** `ps-live-renewal-lifecycle` renders its
      actual sources + steps + algorithm + target.
- [ ] **P2 — Editable inspector.** Selected node's config becomes editable in-memory (rename, change
      columns/strategy/dims/etc. per Kind). Dirty tracking. No persistence yet.
- [ ] **P3 — Add / remove / rewire.** Palette drag-to-add a node of each Kind; delete a node; connect/disconnect
      ports (edges). Cycle prevention. Re-layout on change.
- [ ] **P4 — Persist.** Serialize the canvas back to `SourceBindings` + `FeatureSteps` JSON; `pipeline.Save()`
      (strongly-typed entity, provider-threaded, `LatestResult` error handling). Version bump policy TBD.
- [ ] **P5 — Validate / Fit / Train.** Wire the toolbar to the engine: Validate (spec sanity + leakage),
      Train (`PredictiveStudioTrainModelOperation`). Surface run progress; on success the model appears in
      Registry. **AC:** edit a pipeline → Save → Train → a new `MJ: ML Models` row.

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
