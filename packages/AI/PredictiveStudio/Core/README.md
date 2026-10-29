# @memberjunction/predictive-studio-core

> The shared vocabulary of **MemberJunction Predictive Studio** — every type the sidecar, engine, UI, and agent agree on, defined exactly once.

**What** — the **type contracts** for Predictive Studio (MJ's capability for training predictive models on a client's own data and scoring records with them): the sidecar request/response shapes, the declarative pipeline-spec JSON, the visual FeatureStep DAG, and the Model Development Agent's modeling-plan payload — plus the browser-safe, dependency-free runtime logic shared by the server engine, the UI and the agent that every layer must agree on (trust verdicts, at-risk rules, evaluation lineage, the metric-direction predicate, zod validators for the modeling plan). The only runtime dependency is `zod` (for the trust-boundary validators).

**Why** — four layers (server engine, Python sidecar client, Studio UI, Model Development Agent) must agree on the same shapes. Defining the contract once, here, is what keeps them in lockstep — change a shape and every consumer fails to compile until it's reconciled.

**How it fits** — it's the bottom of the stack: imported by everything, importing nothing. See [How it fits the whole](#how-it-fits-the-whole) below.

For the full architecture, read the **[Predictive Studio Guide](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md)** (§3 covers this package); for the design record, [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Install

```bash
npm install @memberjunction/predictive-studio-core
```

It's a workspace package — within the monorepo it's already wired as a dependency of `@memberjunction/predictive-studio` and `@memberjunction/predictive-studio-sidecar`.

## What's here

| File | Public surface | Plan ref |
|---|---|---|
| `sidecar-contract.ts` | The Python sidecar `/train` + `/predict` HTTP contract: `TrainRequest`/`TrainResponse`, `PredictRequest`/`PredictResponse`, `Prediction`, `PredictionContribution`, `FeatureSchemaEntry`, `PreprocessingOp`, `ValidationConfig`, `MatrixData`; scalars `FeatureKind`, `ProblemType`, `ModelMetrics`, `FeatureImportance`, `ImportanceKind` (derived from the `IMPORTANCE_KINDS` list), `FittedPreprocessing`; `ProblemTypes.IsRegression()` — the one problem-type predicate the trust, outcome and at-risk rules share | §3.2 |
| `pipeline-spec.ts` | The declarative training-pipeline shape: `SourceBinding`, `AsOfStrategy` (point-in-time), `LeakageGuard`, `ValidationStrategy`, `MajorityBaselineRule` | §4.2 / §5 / §6 |
| `leakage-guard-validation.ts` | Validation of a pipeline's `LeakageGuard`: `ValidateLeakageGuard()`, `ParseDenyList()`, `SanitizeNameToken()`, `NormalizeName()`, `IsMalformedNameToken()`, `ClampDominanceThreshold()`, the `DOMINANCE_THRESHOLD_*` constants, `LeakageGuardIssue` and its field/severity types | §6 |
| `feature-steps.ts` | The visual **FeatureStep DAG** — a discriminated union on `Kind` (`select` / `impute` / `standardize` / `onehot` / `bin` / `embedding` / `llm-derived` / `flow-agent` / `vision-llm`) + `FeatureStepGraph` | §4.2 / §5 / §6 |
| `modeling-plan-spec.ts` | `ModelingPlanSpec` — the Model Development Agent's strongly-typed payload — plus `Budget`, `LeaderboardEntry`, `CandidateFeatureKind`, `FeatureStepWarning` | §9.2 / §8.4 |
| `modeling-plan-schema.ts` | **Runtime** (zod) validators for the modeling plan — `ModelingPlanSpecSchema`, `BudgetSchema`, and the `ValidateModelingPlanSpec()` / `ValidateBudget()` guards that prove an untrusted JSON payload (an Action param, an agent-produced plan) well-formed before the deterministic engine executes it | §9.2 |
| `metrics-util.ts` | `MetricDirections` (`IsErrorMetric()`, `MetricDirectionOf()`) — the single source of truth for a metric's **direction**, read from `METRIC_DIRECTION` (lower-is-better RMSE/MAE/MSE/loss vs. higher-is-better AUC/F1/R²), shared by the experiment leaderboard and the maintenance challenger comparison so the two never disagree on which model is "better" | §8 / §12 |
| `trust.ts` | `TrustVerdicts` — `DeriveTrustVerdict()` (the Poor/Fair/Good/Excellent grade and the `canAct` gate the UI and the agent's publish gate share), `TrustEvidenceLine()`, `TrustDots()`; types `TrustGrade`, `TrustModelInput`, `TrustVerdict`, `MajorityBaselineFinding`, `TrustEvidenceOptions` | business UX |
| `outcome-config.ts` | Score labels, polarity and status bands for a model's predictions: `OutcomeConfig`, `OutcomeBand`, `OutcomeStyle`, `OutcomeConfigSource`, `ResolveOutcomeConfig()` (stored config, else inferred from the target name), `NormalizeOutcomeConfig()`, `ResolveScoreBand()`, `ResolveOutcomeStyle()`, `FormatPredictionScore()`, `CloseSentinelBandGaps()`, the `DEFAULT_*_BANDS` | business UX |
| `at-risk-rules.ts` | `AtRiskRules` — the ranked at-risk list: `BuildAtRiskOptions()`, `ParseAtRiskRows()`, `SelectAtRiskListMembers()`, `RiskOf()`, `RiskBandFor()`, `RiskBands`, `RiskBandDisplayFor()`, `DriverRaisesRisk()`, `ParseRowDrivers()`, `TopGlobalDrivers()`, `HumanizeFeatureName()`, `LabelFromRecord()`, `FormatAtRiskListName()`; types `AtRiskRow`, `RowDriver`, `RiskBand`, `RiskBandDisplay`, `RunDetailLike`, `ParseAtRiskOptions`, `AtRiskModelOptions`, `OutcomeModelLike`; `AT_RISK_LIST_MIN_RISK_PCT` | business UX |
| `evaluation-record.ts` | `EvaluationLineage` — builds (`Build()`) and reads (`Read()`) the `evaluation` record training stores in `MLModel.Lineage`, plus `ParseMajorityBaselineRule()`; `EvaluationRecord`; `InvalidMajorityBaselineRuleError` | trust |
| `importance-display.ts` | `ImportanceDisplay.GlobalDriversShowable()` — whether a model's global feature-importance list may be shown (absolute coefficients or held-out permutation importance; split/impurity counts stay hidden) — and its `HiddenNote` | trust |
| `refusal-codes.ts` | `PredictiveStudioRefusalCodes` (`All`, `IsRefusal()`) and the `PredictiveStudioRefusalCode` union — the typed `ResultCode`s a refused Train or Score request returns | operations |
| `experiment-sessions.ts` | `ExperimentSessions` — the `Enabled` switch (off) and the `DisabledReason` callers report | §8 |

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
import { ValidateModelingPlanSpec } from '@memberjunction/predictive-studio-core';

const result = ValidateModelingPlanSpec(rawJson);
if (!result.ok) {
  throw new Error(result.error); // single flattened "path: message; …" string
}
const plan = result.value;        // typed ModelingPlanSpec, proven well-formed
```

## How it fits the whole

```
predictive-studio-core  (this package — types + browser-safe, dependency-free runtime logic)
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
