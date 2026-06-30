/**
 * @module experiment/seams
 *
 * Production implementations of the {@link ExperimentDeps} seams — the
 * {@link IClock} (real wall-clock), the {@link IExperimentEntityFactory}
 * (over `Metadata.GetEntityObject`), and the {@link IExperimentTrainer} that
 * bridges the orchestrator's per-iteration training contract to the
 * {@link TrainingEngine}. These are the only place the experiment engine touches
 * MJ's live plumbing; the orchestrator itself depends solely on the narrow
 * interfaces, so unit tests substitute in-memory fakes and a fake clock.
 */

import {
  Metadata,
  type BaseEntity,
  type UserInfo,
  type IMetadataProvider,
} from '@memberjunction/core';
import { isErrorMetric } from '@memberjunction/predictive-studio-core';

import { TrainingEngine } from '../training';
import type { TrainingDeps } from '../training';
import type {
  IClock,
  IExperimentEntityFactory,
  IExperimentTrainer,
  TrainExperimentInput,
  TrainExperimentResult,
} from './types';

/** Real wall-clock {@link IClock}. Tests inject a controllable fake instead. */
export class SystemClock implements IClock {
  /** @inheritdoc */
  public now(): number {
    return Date.now();
  }
}

/**
 * `Metadata.GetEntityObject`-backed {@link IExperimentEntityFactory}. Optionally
 * bound to a specific provider for multi-provider correctness.
 */
export class MetadataExperimentEntityFactory implements IExperimentEntityFactory {
  /**
   * @param provider optional provider; when supplied it (and its `CurrentUser`)
   *   is honored so multi-provider callers create entities on the RIGHT server.
   *   When omitted the global default `Metadata` provider is used.
   */
  constructor(private readonly provider?: IMetadataProvider) {}

  /** @inheritdoc */
  public async getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
    if (this.provider) {
      return this.provider.GetEntityObject<T>(entityName, contextUser ?? this.provider.CurrentUser);
    }
    return new Metadata().GetEntityObject<T>(entityName, contextUser);
  }
}

/**
 * How the production trainer maps an approved plan's experiment to a concrete
 * `MJ: ML Training Pipelines` row. The orchestrator carries algorithm × feature
 * set × hyperparameters on the experiment, but `TrainingEngine.trainModel`
 * trains by **pipeline id** (an immutable, versioned pipeline definition). This
 * resolver bridges the two: given an experiment + plan, it returns the pipeline
 * id to train (materializing/looking up a pipeline that encodes that
 * experiment's algorithm + feature set + hyperparameters).
 *
 * It is itself a seam so the materialization strategy (reuse an existing
 * pipeline vs. create one per experiment) can vary without touching the
 * orchestrator or the training engine.
 */
export interface IPipelineResolver {
  /**
   * Resolve (or materialize) the `MJ: ML Training Pipelines` id that encodes the
   * given experiment under the plan.
   *
   * @param input the experiment + plan + iteration/session context
   * @returns the pipeline id to hand to `TrainingEngine.trainModel`
   */
  resolvePipelineId(input: TrainExperimentInput): Promise<string>;
}

/**
 * {@link IExperimentTrainer} backed by the {@link TrainingEngine}. For each
 * iteration it resolves the pipeline (via an injected {@link IPipelineResolver}),
 * trains it through the engine (producing an immutable Draft `MJ: ML Models` +
 * its `MJ: ML Training Runs` leaf linked to the iteration via
 * `experimentSessionIterationId`), and extracts the normalized holdout Score for
 * the plan's `SuccessMetric` to drive the leaderboard.
 */
export class TrainingEngineExperimentTrainer implements IExperimentTrainer {
  /**
   * @param trainingDeps the training engine's injected dependency bundle
   * @param pipelineResolver maps experiment → pipeline id
   * @param engine optional TrainingEngine override (defaults to a fresh instance)
   */
  constructor(
    private readonly trainingDeps: TrainingDeps,
    private readonly pipelineResolver: IPipelineResolver,
    private readonly engine: TrainingEngine = new TrainingEngine(),
  ) {}

  /** @inheritdoc */
  public async train(input: TrainExperimentInput): Promise<TrainExperimentResult> {
    const pipelineId = await this.pipelineResolver.resolvePipelineId(input);
    const { model, run } = await this.engine.trainModel(
      {
        pipelineId,
        experimentSessionIterationId: input.iterationId,
      },
      this.trainingDeps,
    );
    const score = extractNormalizedScore(model.HoldoutMetrics, model.Metrics, input.plan.TargetDefinition.SuccessMetric, input.plan.TargetDefinition.ProblemType);
    return {
      model,
      run,
      Score: score,
      ComputeCost: run.ComputeCost ?? 0,
      TokensUsed: 0,
    };
  }
}

/**
 * Extract the **normalized** leaderboard score from a model's holdout metrics
 * (preferred — the honest, search-never-saw-it number, §8.2), falling back to
 * the training metrics. The score is normalized so **higher is always better**:
 * error metrics (RMSE/MAE/loss) are negated, ranking metrics (AUC/F1/accuracy)
 * pass through. Returns `0` when the metric is absent (a failed/empty run).
 *
 * Exported for unit testing the normalization in isolation.
 *
 * @param holdoutMetricsJson the model's `HoldoutMetrics` JSON (preferred)
 * @param trainMetricsJson the model's `Metrics` JSON (fallback)
 * @param successMetric the plan's `SuccessMetric` (e.g. `AUC`, `RMSE`)
 * @param problemType classification vs. regression (informs the error-metric direction)
 */
export function extractNormalizedScore(
  holdoutMetricsJson: string | null,
  trainMetricsJson: string | null,
  successMetric: string,
  problemType: 'classification' | 'regression',
): number {
  const metrics = parseMetrics(holdoutMetricsJson) ?? parseMetrics(trainMetricsJson) ?? {};
  const key = successMetric.toLowerCase();
  const raw = metrics[key];
  if (raw == null || !Number.isFinite(raw)) {
    return 0;
  }
  // `problemType` is retained on the signature for callers/back-compat; the
  // error-metric direction is metric-name driven (shared with maintenance via
  // the Core `isErrorMetric`) so the two consumers can never drift apart.
  void problemType;
  return isErrorMetric(key) ? -raw : raw;
}

/** Parse a metrics JSON column into a lower-cased numeric record, or null. */
function parseMetrics(json: string | null): Record<string, number> | null {
  if (json == null || json.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number') {
        out[k.toLowerCase()] = v;
      }
    }
    return out;
  } catch {
    return null;
  }
}
