# @memberjunction/predictive-studio

The **server-side engine** for **MemberJunction Predictive Studio** — the layer that assembles features, trains models, scores records, and orchestrates experiment searches. It composes onto existing MJ substrates (Record Set Processing, entities/`RunView`, Remote Operations, Agents, vectors) and the Python ML sidecar, rather than re-implementing them.

For the full architecture, read the **[Predictive Studio Guide](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md)**; for the design record, [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Install

```bash
npm install @memberjunction/predictive-studio
```

Depends on `@memberjunction/predictive-studio-core` (type contracts), `@memberjunction/predictive-studio-sidecar` (the `MLSidecar` client), `@memberjunction/record-set-processor-base` (the scoring work-type seam), and the MJ core/global/core-entities packages.

## The four components

| Component | Where | What it does |
|---|---|---|
| **`FeatureAssemblyExecutor`** | `src/feature-assembly/feature-assembly-executor.ts` | `(record set, frozen FeatureSteps) → raw matrix + preprocessing recipe`. The single code path for all three contexts (`'train'` / `'materialize'` / `'on-demand'`), so there's no train/serve skew by construction. Splits the graph into data-assembly steps (built as raw columns in TS) vs. preprocessing steps (emitted as a `PreprocessingOp[]` recipe for the sidecar to fit/apply). Enforces the **as-of** point-in-time cutoff (`as-of.ts`) and the **leakage** deny-list (`leakage-guard.ts`). |
| **`TrainingEngine`** | `src/training/training-engine.ts` | `trainModel(input, deps)` — resolve pipeline → assemble (fit context) → carve the **locked holdout** first → sidecar `/train` → persist the artifact to MJStorage → create an **immutable, versioned `MJ: ML Models`** row (with `FittedPreprocessing`, `FeatureSchema`, metrics, holdout metrics, importance, lineage) + an `MJ: ML Training Runs` row → run the single-feature-dominance leakage check. Built on injectable seams (`IEntityFactory` / `IRecordLoader` / `ISidecarTrainer` / `IArtifactStore`). |
| **`MLModelInferenceProcessor`** | `src/scoring/ml-model-inference-processor.ts` | A **Record Set Processing work type** (`@RegisterClass(MLModelInferenceProcessor, 'ML Model')`, alias `'MLModelInference'`) for batch + single-record scoring. Warm-loads the model once per run, assembles features transform-only (frozen — never re-fits), calls the sidecar `/predict`, returns an `MLInferenceResultPayload`. Ephemeral by default; the substrate's `WriteBackProcessor` applies an `OutputMapping` when present. Registers *without* forking the substrate (`src/scoring/register.ts`). |
| **`ExperimentOrchestrator`** | `src/experiment/experiment-orchestrator.ts` | `runSession(plan, deps, options)` — deterministic execution of an *approved* `ModelingPlanSpec` as **waves through Record Set Processing**: generate wave (`IWaveStrategist`) → train (bounded concurrency) → evaluate → leaderboard → prune → budget-gate → next wave. Wires the generic `MJ: Experiments` / `Experiment Sessions` / `Experiment Session Iterations` primitives. |

> The **`MLSidecar`** client (the self-managing Python sidecar) lives in its own package, [`@memberjunction/predictive-studio-sidecar`](../Sidecar/README.md) — import it directly from there; it is intentionally not re-exported here.

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
predictive-studio-core (types)  ─┐
predictive-studio-sidecar (MLSidecar) ─┤
record-set-processor-base (work-type seam) ─┤
                                            ▼
                          @memberjunction/predictive-studio  (this package)
                                            │ consumed by
                          ┌─────────────────┴──────────────────┐
                  (planned) Remote Operations + Actions    Studio dashboard (ng-dashboards)
                          + Model Development Agent
```

## Build & test

```bash
npm run build              # tsc && tsc-alias -f
npm run test               # vitest run — unit tests (all seams mocked; no DB, no live sidecar)
npm run test:integration   # opt-in end-to-end live test (PS_INTEGRATION=1) — spawns the real
                           # managed Python sidecar; skips gracefully if the venv is missing.
                           # Prereq: cd ../Sidecar && npm run setup:python
```
