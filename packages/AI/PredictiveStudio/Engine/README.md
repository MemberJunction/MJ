# @memberjunction/predictive-studio

> The **server-side engine** of **MemberJunction Predictive Studio** — assemble features, train models, score records, run experiment searches, keep models honest over time, and expose all of it through Actions + Remote Operations.

**What** — the engine that turns a client's own data into a trained, scored predictive model. Its core is four service classes — `FeatureAssemblyExecutor`, `TrainingEngine`, `MLModelInferenceProcessor`, `ExperimentOrchestrator` — surrounded by feature-pipeline discovery, ongoing maintenance, and two thin invocation surfaces (Actions and Remote Operations) so agents, UI, and workflows can drive it.

**Why** — predictive modeling needs feature assembly, anti-skew correctness, honest validation, batch scoring, and a budgeted search. Each of those already has a home in MJ's substrate; this engine **composes onto** them (Record Set Processing, entities/`RunView`, Remote Operations, Agents, vectors) plus the Python ML sidecar — rather than re-implementing batching, audit, or inference. The cardinal correctness rule: **one feature-assembly code path, used identically across train / materialize / on-demand**, so there is no train/serve skew by construction.

**How it fits** — in the four-layer architecture (data → feature → model → inference) this package owns the **feature, model, and inference** layers in TypeScript, sitting above the [type contracts](../Core/README.md) and the [`MLSidecar` client](../Sidecar/README.md), and is consumed by the Studio dashboard, the (planned) Model Development Agent, and any agent/workflow via its Actions + Remote Operations. See [How it fits the whole](#how-it-fits-the-whole).

For the full architecture, read the **[Predictive Studio Guide](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md)** (§4–§12 cover this package); for the design record, [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Install

```bash
npm install @memberjunction/predictive-studio
```

Depends on `@memberjunction/predictive-studio-core` (type contracts), `@memberjunction/predictive-studio-sidecar` (the `MLSidecar` client), `@memberjunction/record-set-processor-base` (the scoring work-type seam), and the MJ core/global/core-entities packages.

## The four core engines

| Component | Where | What it does |
|---|---|---|
| **`FeatureAssemblyExecutor`** | `src/feature-assembly/feature-assembly-executor.ts` | `(record set, frozen FeatureSteps) → raw matrix + preprocessing recipe`. The single code path for all three contexts (`'train'` / `'materialize'` / `'on-demand'`), so there's no train/serve skew by construction. Splits the graph into data-assembly steps (built as raw columns in TS) vs. preprocessing steps (emitted as a `PreprocessingOp[]` recipe for the sidecar to fit/apply). Enforces the **as-of** point-in-time cutoff (`as-of.ts`) and the **leakage** deny-list (`leakage-guard.ts`). |
| **`TrainingEngine`** | `src/training/training-engine.ts` | `trainModel(input, deps)` — resolve pipeline → assemble (fit context) → carve the **locked holdout** first → sidecar `/train` → persist the artifact to MJStorage → create an **immutable, versioned `MJ: ML Models`** row (with `FittedPreprocessing`, `FeatureSchema`, metrics, holdout metrics, importance, lineage) + an `MJ: ML Training Runs` row → run the single-feature-dominance leakage check. Built on injectable seams (`IEntityFactory` / `IRecordLoader` / `ISidecarTrainer` / `IArtifactStore`). |
| **`MLModelInferenceProcessor`** | `src/scoring/ml-model-inference-processor.ts` | A **Record Set Processing work type** (`@RegisterClass(MLModelInferenceProcessor, 'ML Model')`, alias `'MLModelInference'`) for batch + single-record scoring. Warm-loads the model once per run, assembles features transform-only (frozen — never re-fits), calls the sidecar `/predict`, returns an `MLInferenceResultPayload`. Ephemeral by default; the substrate's `WriteBackProcessor` applies an `OutputMapping` when present. Registers *without* forking the substrate (`src/scoring/register.ts`). |
| **`ExperimentOrchestrator`** | `src/experiment/experiment-orchestrator.ts` | `runSession(plan, deps, options)` — deterministic execution of an *approved* `ModelingPlanSpec` as **waves through Record Set Processing**: generate wave (`IWaveStrategist`) → train (bounded concurrency) → evaluate → leaderboard → prune → budget-gate → next wave. Wires the generic `MJ: Experiments` / `Experiment Sessions` / `Experiment Session Iterations` primitives. |

> The **`MLSidecar`** client (the self-managing Python sidecar) lives in its own package, [`@memberjunction/predictive-studio-sidecar`](../Sidecar/README.md) — import it directly from there; it is intentionally not re-exported here.

## The supporting modules

Beyond the four core engines, the package's `src/` is organized into focused folders, each its own barrel export:

| Folder | Exports | Role | Plan ref |
|---|---|---|---|
| `feature-assembly/` | `FeatureAssemblyExecutor` + `as-of` / `leakage-guard` / `vision-llm` / `data-access` seams | The single skew-free assembly path and its correctness primitives (point-in-time cutoff, deny-list, vision-LLM-as-feature) | §5 / §6 / §11 |
| `training/` | `TrainingEngine` + seams (`IEntityFactory` / `IRecordLoader` / `ISidecarTrainer` / `IArtifactStore`) + `artifact-store` | Train → persist an immutable, versioned `MJ: ML Models` row with full lineage | §3 / §4.3 |
| `scoring/` | `MLModelInferenceProcessor`, `LoadMLModelInferenceProcessor`, the `'ML Model'` work-type `register`, `artifact-loader`, `scoring-binding` | Batch + single-record inference as a Record Set Processing **work type**, registered without forking the substrate | §10 |
| `experiment/` | `ExperimentOrchestrator` + `leaderboard` / `concurrency` / `wave-strategist` / `seams` | Deterministic, wave-based execution of an approved `ModelingPlanSpec` with leaderboard, pruning, and a budget gate | §8 / §9 |
| `feature-pipelines/` | `FeaturePipelineEngine` (a `BaseEngine` cache) + projection types | Discover/monitor Feature Pipelines (categorized `MJ: Record Processes` rows) — "what pipelines exist, what each writes to, when each last ran" | §5.4 / SP6 |
| `maintenance/` | `MaintenanceEngine`, `RetrainingPolicy` + defaults, the honest `RowCountProxyDriftDetector`, seams | Staleness detection, scheduled re-scoring, retraining triggers, and challenger-vs-incumbent promotion recommendation | §12 / SP10 |
| `scheduling/` | `createScheduledModelScoring` (the Phase 2 north-star helper) | One call binds a model to write its prediction into a target column on a recurring cron (auto-creates the owned Scheduled Job) | §15 / PS2-6 |
| `actions/` | `PredictiveStudio{TrainModel,ScoreRecordSet,RunExperiment,PromoteModel}Action` + `LoadPredictiveStudioActions` | **Invocation surface A** — thin MJ Actions over the engines (see below) | §12 |
| `operations/` | `PredictiveStudio{TrainModel,ScoreRecordSet,RunFeaturePipeline,StartExperimentSession,ControlExperimentSession,PromoteModel}ServerOperation` + `LoadPredictiveStudioOperations` | **Invocation surface B** — typed Remote Operations over the engines (see below) | §12 |

## Phase 2 reach — one scorer, many surfaces

Phase 2 extends the model's *reach* without new ML: the **same** scorer (`MLModelInferenceProcessor`) and the **same** entry point (`ScoreRecordSet`) plumbed into every MJ surface where a prediction is useful, each through a registry / ClassFactory seam so no base/types package depends on Predictive Studio. Full write-up: **[Predictive Studio Guide §15](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md#15-phase-2--model-as-a-first-class-primitive-reach)**.

| Item | Module | What it adds |
|---|---|---|
| **PS2-1** scoring as a saved/scheduled Record Process | `scoring/startup-register.ts` (`PredictiveStudioScoringStartup`), `scoring/register.ts` (`registerMLScoringProcessor`) | Registers the `'ML Model'` work type into `RecordProcessorRegistry` at MJAPI boot so a saved `MJ: Record Processes` row routes to the scorer. (Migration `V202606280215…` drops the closed `WorkType` CHECK so the registry governs work types.) |
| **PS2-2** per-model Action on Publish | `actions/model-scoring-action-generator.ts` (`ModelScoringActionGenerator`), hooked from `actions/promote-model.gate.ts` | Generates an idempotent child Action `Score with <pipeline> v<n>` (Type=Custom, parent's `DriverClass`, `ParentID` set, `ModelID` `DefaultValue` baked) — so every published model is a discoverable Action. |
| **PS2-3** scored-query enrichment | `scoring/ml-model-score-enricher.ts` (`MLModelScoreEnricher`, `@RegisterClass(QueryResultEnricherBase, 'ML Model Score')`) | Appends a model prediction column to a `RunQuery` result via the decoupled `RunQueryParams.Enrichment` seam in `@memberjunction/core`. |
| **PS2-6** scheduled model scoring (north-star) | `scheduling/scheduled-model-scoring.ts` (`createScheduledModelScoring`), `actions/schedule-model-scoring.action.ts` | One call creates an Active `'ML Model'` Record Process with `ScheduleEnabled` + monthly cron + `OutputMapping`; saving it auto-creates the owned Scheduled Job. |

> PS2-4 (the Interactive Components `utilities.ml` capability) lives **outside** this package — `SimpleMLTools` in `@memberjunction/interactive-component-types`, built by `RuntimeUtilities.CreateSimpleMLTools()` in `@memberjunction/ng-react`, marshaling `ScoreRecordSet` over GraphQL to this engine.

Each item ships with an MJServer integration script (`ps-live-recordprocess-scoring`, `ps-live-modelaction-generation`, `ps-inproc-scored-query`, `ps-inproc-scheduled-scoring`).

### Business-experience layer

The **business-user experience** phase (the conversational north-star made real) builds on this engine without new ML: `createScheduledModelScoring` now, after saving the scheduled Record Process, also **records an `MJ: ML Model Scoring Binding`** (via `upsertScoringBinding` — `MLModelID` / `RecordProcessID` / `TargetEntityID` / `TargetColumn` / `Mode='Scheduled'`). That binding is the lineage seam the Angular surfaces key off — the generic, binding-driven risk-card form panel and the "Models in Production" Studio section both light up from it. On the agent side, the Model Development Agent now **proactively offers to operationalize** after a clean promote ("score everyone + refresh monthly?") and, on a yes, calls the `Schedule Model Scoring` action. Full plan + commit lineage: [`plans/predictive-studio-business-experience.md`](../../../../plans/predictive-studio-business-experience.md); architecture write-up: [Predictive Studio Guide §16](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md#16-the-business-user-experience).

## Two invocation surfaces: Actions vs. Remote Operations

The engine service classes are the *real* logic; both surfaces are thin and **share one delegation path** (`operations/delegation.ts`), so they train / score / experiment / promote through the same code — never duplicating it.

- **Actions** (`actions/`) — discoverable, metadata-driven boundaries for **agents, low-code workflows, and the visual designer**. Four driver-class keys (`PredictiveStudioTrainModelAction`, `…ScoreRecordSetAction`, `…RunExperimentAction`, `…PromoteModelAction`) matching the `metadata/actions/predictive-studio/` rows. Call `LoadPredictiveStudioActions()` from a server bootstrap to keep the `@RegisterClass` registrations from being tree-shaken.
- **Remote Operations** (`operations/`) — the typed peers, invoked by **stable key** from client or server with framework-applied scope/permission gates. Six keys: `PredictiveStudio.TrainModel`, `.ScoreRecordSet`, `.RunFeaturePipeline`, `.StartExperimentSession`, `.ControlExperimentSession`, `.PromoteModel`. These are the Manual-mode server bodies for the CodeGen-emitted operation bases in `@memberjunction/core-entities`. Call `LoadPredictiveStudioOperations()` from a server bootstrap to anchor them.

Which to reach for: **Actions** when an agent/workflow needs to *discover and chain* capabilities; **Remote Operations** when client or server code needs a *typed, gated call by key*. (Internal engine-to-engine calls use neither — they import the service class directly. See the Transport-Layer and Remote Operations guides.)

## Usage

```typescript
import { TrainingEngine, FeatureAssemblyExecutor } from '@memberjunction/predictive-studio';
import { MLModelInferenceProcessor, LoadMLModelInferenceProcessor } from '@memberjunction/predictive-studio';

// 1. Ensure the scoring work-type registration survives bundling (call from a server bootstrap)
LoadMLModelInferenceProcessor();

// 2. Train — produces a new immutable MJ: ML Models row
const engine = new TrainingEngine();
const result = await engine.trainModel({ PipelineID: retentionPipelineId /* … */ }, productionDeps);

// 3. Score — runs as the 'ML Model' Record Set Processing work type (on-demand or scheduled)
//    See the Record Set Processing Guide for RunNow / scope-override mechanics.
```

## How it fits the whole

```
predictive-studio-core (types)            ─┐
predictive-studio-sidecar (MLSidecar)     ─┤
record-set-processor / -base (substrate)  ─┤
@memberjunction/actions + core-entities   ─┤
                                            ▼
                 @memberjunction/predictive-studio  (this package)
   feature-assembly · training · scoring · experiment · feature-pipelines ·
                    maintenance · actions · operations
                                            │ exposed to / consumed by
        ┌───────────────────────┬───────────┴───────────┬────────────────────┐
   Actions (agents/         Remote Operations      Studio dashboard      (planned) Model
   workflows/low-code)      (typed, by key)        (ng-dashboards)       Development Agent
```

## Build & test

```bash
npm run build              # tsc && tsc-alias -f
npm run test               # vitest run — unit tests (all seams mocked; no DB, no live sidecar)
npm run test:integration   # opt-in end-to-end live test (PS_INTEGRATION=1) — spawns the real
                           # managed Python sidecar; skips gracefully if the venv is missing.
                           # Prereq: cd ../Sidecar && npm run setup:python
```
