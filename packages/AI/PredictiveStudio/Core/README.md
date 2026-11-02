# @memberjunction/predictive-studio-core

> The shared vocabulary of **MemberJunction Predictive Studio** — every type the sidecar, engine, UI, and agent agree on, defined exactly once.

**What** — the **type contracts** for Predictive Studio (MJ's capability for training predictive models on a client's own data and scoring records with them): the sidecar request/response shapes, the Prediction Unit and Evaluation Protocol shapes with the gate that judges a run, the declarative pipeline-spec JSON, the visual FeatureStep DAG, and the Model Development Agent's modeling-plan payload — plus the browser-safe, dependency-free runtime logic shared by the server engine, the UI and the agent that every layer must agree on (trust verdicts, at-risk rules, evaluation lineage, the metric-direction predicate, zod validators for the modeling plan). Its runtime dependencies are `zod` (for the trust-boundary validators) and `@memberjunction/global` (UUID comparison, ordinal ordering and canonical JSON).

**Why** — four layers (server engine, Python sidecar client, Studio UI, Model Development Agent) must agree on the same shapes. Defining the contract once, here, is what keeps them in lockstep — change a shape and every consumer fails to compile until it's reconciled.

**How it fits** — it's the bottom of the stack: imported by everything, importing only `zod` and `@memberjunction/global`. See [How it fits the whole](#how-it-fits-the-whole) below.

For the full architecture, read the **[Predictive Studio Guide](../../../../guides/PREDICTIVE_STUDIO_GUIDE.md)** (§3 covers this package); for the design record, [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Install

```bash
npm install @memberjunction/predictive-studio-core
```

It's a workspace package — within the monorepo it's already wired as a dependency of `@memberjunction/predictive-studio` and `@memberjunction/predictive-studio-sidecar`.

## What's here

| File | Public surface | Plan ref |
|---|---|---|
| `sidecar-contract.ts` | The Python sidecar `/predict` HTTP contract: `PredictRequest`/`PredictResponse`, `Prediction`, `PredictionContribution`, `FeatureSchemaEntry`, `PreprocessingOp`, `MatrixData`; scalars `FeatureKind`, `ProblemType`, `ModelMetrics`, `FeatureImportance`, `ImportanceKind` (derived from the `IMPORTANCE_KINDS` list), `FittedPreprocessing` (the frozen parameters of a model trained before Prediction Units); `ProblemTypes.IsRegression()` — the one problem-type predicate the trust, outcome and at-risk rules share | §3.2 |
| `trainer-contract.ts`, `trainer-result-schemas.ts` | The `POST /trainer` contract: `TrainerRequest`, `TrainerResult` (`completed`, or `failed` at a stage), `CandidateSpec`, `PreAuthDownload`, the returned artifacts, `PREDICTOR_ARTIFACT_FORMAT`; and the zod schemas that check the sidecar's answer instead of casting it | §2.3 / §5 |
| `prediction-unit.ts`, `unit-edit.ts`, `task-type.ts` | The **Prediction Unit**: what one training row is (unit rows and the decision-date rule, the label rule, censoring, the declared task type, the temporal spec, the incumbent heuristic), authoring a version from a form, and the task type with its derived score semantics | §4.3 / §8 |
| `evaluation-protocol.ts`, `evaluation-protocol-rules.ts`, `protocol-edit.ts`, `protocol-rows.ts` | The **Evaluation Protocol** column shapes and typed spec, its save-time and bind-time rules (the guard-field author rule among them), the form-editable fields, and writing a unit or protocol draft into a new version row | §5.1 / §8 |
| `holdout-carve.ts`, `selection.ts`, `incumbent-heuristic.ts` | The locked holdout carve (date-carved, rolling-origin, seeded-random), candidate ranking on inner folds, and the incumbent heuristic as a per-row score | §5.1 |
| `gate.ts`, `run-evaluation.ts`, `training-run-results.ts` | The three-outcome **gate** (`GateRules`, `GateRecords`), the gate record a run stores, and the `ps-run-results/v2` envelope (`TrainingRunResultsParser`) with its refusal shapes | §5.1 / §8 |
| `assembly-contract.ts`, `snapshot-format.ts`, `store-schemas.ts` | The as-of feature assembly contract (dated sources, encodings, read policy, refusals, provenance, the row manifest), the Training Snapshot file formats, and the zod schemas that check a stored file's lines | §4.3 / §5 |
| `legacy-pipeline.ts` | Maps a pipeline that predates Prediction Units onto a version-1 unit and the inputs of a version-1 protocol, or an archive or hold with the reason (the pipeline migration's rules) | §10.2 |
| `utc-day.ts`, `json-value.ts` | UTC day arithmetic (every decision date and cutoff is a UTC midnight) and the typed JSON values the persisted-shape parsers share | §4.3 |
| `pipeline-spec.ts` | The declarative training-pipeline shape: `SourceBinding`, `LeakageGuard`, `ValidationStrategy`, `MajorityBaselineRule`, and the retired `AsOfStrategy` (the Prediction Unit decides decision dates now) | §4.2 / §5 / §6 |
| `leakage-guard-validation.ts` | Validation of a pipeline's `LeakageGuard`: `ValidateLeakageGuard()`, `ParseDenyList()`, `SanitizeNameToken()`, `NormalizeName()`, `IsMalformedNameToken()`, `ClampDominanceThreshold()`, the `DOMINANCE_THRESHOLD_*` constants, `LeakageGuardIssue` and its field/severity types | §6 |
| `feature-steps.ts` | The visual **FeatureStep DAG** — a discriminated union on `Kind` (`select` / `windowed-aggregate` / `series` / `impute` / `standardize` / `onehot` / `bin` / `embedding` / `llm-derived` / `flow-agent` / `vision-llm`) + `FeatureStepGraph` | §4.2 / §5 / §6 |
| `modeling-plan-spec.ts` | `ModelingPlanSpec` — the Model Development Agent's strongly-typed payload — plus `Budget`, `LeaderboardEntry`, `CandidateFeatureKind`, `FeatureStepWarning` | §9.2 / §8.4 |
| `modeling-plan-schema.ts` | **Runtime** (zod) validators for the modeling plan — `ModelingPlanSpecSchema`, `BudgetSchema`, and the `ValidateModelingPlanSpec()` / `ValidateBudget()` guards that prove an untrusted JSON payload (an Action param, an agent-produced plan) well-formed before the deterministic engine executes it | §9.2 |
| `metrics-util.ts` | `MetricDirections` (`IsErrorMetric()`, `MetricDirectionOf()`) — the single source of truth for a metric's **direction**, read from `METRIC_DIRECTION` (lower-is-better RMSE/MAE/MSE/loss vs. higher-is-better AUC/F1/R²), shared by the experiment leaderboard and the maintenance challenger comparison so the two never disagree on which model is "better" | §8 / §12 |
| `trust.ts` | `TrustVerdicts` — `DeriveTrustVerdict()` (renders the gate decision stored on the model's training run: "Beats the flat guess by X [lo, hi]", a kept simple baseline, no signal, or not evaluated, with the `CanAct` gate the UI and the agent's builder share), `OutcomeTitle()`, `MemberLabel()`, `TrustEvidenceLine()`; types `TrustInput`, `TrustComparison`, `TrustVerdict`, `OutcomeTitleText`, `TrustEvidenceOptions` | business UX |
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
  TrainerRequest,
  PredictRequest,
  FeatureStepGraph,
  LeakageGuard,
} from '@memberjunction/predictive-studio-core';
```

Two contract details worth internalizing (both enforce the system's anti-skew correctness — see the guide §4):

- **`FittedPreprocessing`** is an opaque, serialized blob of *fitted* transform parameters (means/stds/vocabularies/bin edges) that a model trained before Prediction Units carries. It was produced once at the retired `/train` route and is round-tripped unchanged into every `/predict` call — the model never re-fits at inference. A model trained under a Prediction Unit carries its encoding inside its `ps-predictor/v2` artifact and stores `{}`.
- **Decision dates** come from the Prediction Unit (`DecisionDateRule`), so training "as-of-then" and scoring stay consistent; the pipeline's `AsOfStrategy` (`none` / `column` / `offset`) is retired, and training refuses one that is not `none`.

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
predictive-studio-core  (this package — types + browser-safe runtime logic; depends on zod and @memberjunction/global)
        │ imported by
        ├── predictive-studio-sidecar   → MLSidecar (trainer/predict over the contract)
        ├── predictive-studio (Engine)  → AsOfFeatureAssembler · FeatureAssemblyExecutor · TrainingEngine ·
        │                                  MLModelInferenceProcessor · ExperimentOrchestrator
        └── ng-dashboards (Studio UI) + the Model Development Agent
```

Because this is the *only* place these shapes are defined, import them from here directly (never re-export them through another package — see root `CLAUDE.md` rule 5).

## Build & test

```bash
npm run build   # tsc && tsc-alias -f
npm run test    # vitest run
```
