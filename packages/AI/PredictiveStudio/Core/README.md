# @memberjunction/predictive-studio-core

Pure TypeScript type contracts for **MemberJunction Predictive Studio**. No runtime
dependencies — this package defines only interfaces and union types shared across
the Predictive Studio server engine, UI, and the Model Development Agent.

See [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md) for the
full design.

## What's here

| File | Contents | Plan ref |
|---|---|---|
| `sidecar-contract.ts` | Python sidecar `/train` + `/predict` request/response types, feature schema, preprocessing ops, metrics, feature importance | §3.2 |
| `pipeline-spec.ts` | `SourceBinding`, `AsOfStrategy`, `LeakageGuard`, `ValidationStrategy`, `FittedPreprocessing`, `ProblemType` | §4.2 / §5 / §6 |
| `feature-steps.ts` | The visual **FeatureStep DAG** — discriminated union of step kinds (`select`, `impute`, `standardize`, `onehot`, `bin`, `embedding`, `llm-derived`, `flow-agent`) + `FeatureStepGraph` | §4.2 / §5 / §6 |
| `modeling-plan-spec.ts` | `ModelingPlanSpec` (the Model Development Agent's strongly-typed payload), `Budget`, `LeaderboardEntry` | §9.2 / §8.4 |

## Usage

```typescript
import type { ModelingPlanSpec, TrainRequest, FeatureStepGraph } from '@memberjunction/predictive-studio-core';
```

## Build & test

```bash
npm run build   # tsc && tsc-alias -f
npm run test    # vitest run
```
