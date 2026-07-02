# @memberjunction/predictive-studio-core

> The shared vocabulary of **MemberJunction Predictive Studio** — every type the sidecar, engine, UI, and agent agree on, defined exactly once.

**What** — the **type contracts** for Predictive Studio (MJ's capability for training predictive models on a client's own data and scoring records with them): the sidecar request/response shapes, the declarative pipeline-spec JSON, the visual FeatureStep DAG, and the Model Development Agent's modeling-plan payload — plus the handful of pure helpers every layer must agree on (zod validators for the modeling plan, the metric-direction predicate). Almost entirely interfaces and union types; the only runtime dependency is `zod` (for the trust-boundary validators).

**Why** — four layers (server engine, Python sidecar client, Studio UI, Model Development Agent) must agree on the same shapes. Defining the contract once, here, is what keeps them in lockstep — change a shape and every consumer fails to compile until it's reconciled.

**How it fits** — it's the bottom of the stack: imported by everything, importing nothing. See [How it fits the whole](#how-it-fits-the-whole) below.

For the full architecture, read the **[Predictive Studio Guide](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md)** (§3 covers this package); for the design record, [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Install

```bash
npm install @memberjunction/predictive-studio-core
```

It's a workspace package — within the monorepo it's already wired as a dependency of `@memberjunction/predictive-studio` and `@memberjunction/predictive-studio-sidecar`.

## What's here

| File | Contents | Plan ref |
|---|---|---|
| `sidecar-contract.ts` | The Python sidecar `/train` + `/predict` HTTP contract: `TrainRequest`/`TrainResponse`, `PredictRequest`/`PredictResponse`, `FeatureSchemaEntry`, `PreprocessingOp`, `ValidationConfig`, `MatrixData`, `Prediction`; scalars `FeatureKind`, `ProblemType`, `ModelMetrics`, `FeatureImportance`, `FittedPreprocessing` | §3.2 |
| `pipeline-spec.ts` | The declarative training-pipeline shape: `SourceBinding`, `AsOfStrategy` (point-in-time), `LeakageGuard`, `ValidationStrategy` | §4.2 / §5 / §6 |
| `feature-steps.ts` | The visual **FeatureStep DAG** — a discriminated union on `Kind` (`select` / `impute` / `standardize` / `onehot` / `bin` / `embedding` / `llm-derived` / `flow-agent` / `vision-llm`) + `FeatureStepGraph` | §4.2 / §5 / §6 |
| `modeling-plan-spec.ts` | `ModelingPlanSpec` — the Model Development Agent's strongly-typed payload — plus `Budget` and `LeaderboardEntry` | §9.2 / §8.4 |
| `modeling-plan-schema.ts` | **Runtime** (zod) validators for the modeling plan — `ModelingPlanSpecSchema`, `BudgetSchema`, and the `validateModelingPlanSpec()` / `validateBudget()` guards that prove an untrusted JSON payload (an Action param, an agent-produced plan) well-formed before the deterministic engine executes it | §9.2 |
| `metrics-util.ts` | `isErrorMetric()` — the single source of truth for a metric's **direction** (lower-is-better RMSE/MAE/MSE/loss vs. higher-is-better AUC/F1/R²), shared by the experiment leaderboard and the maintenance challenger comparison so the two never disagree on which model is "better" | §8 / §12 |

## Usage

```typescript
import type {
  ModelingPlanSpec,
  TrainRequest,
  PredictRequest,
  FeatureStepGraph,
  AsOfStrategy,
  LeakageGuard,
} from '@memberjunction/predictive-studio-core';
```

Two contract details worth internalizing (both enforce the system's anti-skew correctness — see the guide §4):

- **`FittedPreprocessing`** is an opaque, serialized blob of *fitted* transform parameters (means/stds/vocabularies/bin edges). It is produced once at `/train` and round-tripped unchanged into every `/predict` call — the model never re-fits at inference.
- **`AsOfStrategy`** (`none` / `column` / `offset`) drives point-in-time feature assembly so training "as-of-then" and scoring "as-of-now" stay consistent.

At trust boundaries — where untrusted JSON (an Action param or an agent-produced plan) crosses into the deterministic engine — validate it *at runtime* with the shared zod guard rather than trusting the compile-time type:

```typescript
import { validateModelingPlanSpec } from '@memberjunction/predictive-studio-core';

const result = validateModelingPlanSpec(rawJson);
if (!result.ok) {
  throw new Error(result.error); // single flattened "path: message; …" string
}
const plan = result.value;        // typed ModelingPlanSpec, proven well-formed
```

## How it fits the whole

```
predictive-studio-core  (this package — types only)
        │ imported by
        ├── predictive-studio-sidecar   → MLSidecar (train/predict over the contract)
        ├── predictive-studio (Engine)  → FeatureAssemblyExecutor · TrainingEngine ·
        │                                  MLModelInferenceProcessor · ExperimentOrchestrator
        └── ng-dashboards (Studio UI) + the Model Development Agent
```

Because this is the *only* place these shapes are defined, import them from here directly (never re-export them through another package — see root `CLAUDE.md` rule 5).

## Build & test

```bash
npm run build   # tsc && tsc-alias -f
npm run test    # vitest run
```
