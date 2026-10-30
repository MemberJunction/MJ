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
  LogError,
  Metadata,
  type BaseEntity,
  type UserInfo,
  type IMetadataProvider,
} from '@memberjunction/core';
import { JsonParse, MetricDirections } from '@memberjunction/predictive-studio-core';

import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { TrainingEngine } from '../training';
import type { TrainingDeps, TrainModelInput, TrainModelResult } from '../training';
import { RunViewTrainingSnapshotStore } from '../snapshot/training-snapshot-store';
import { TrainingAttemptFailedError } from './budget';
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
    const md = this.provider ?? new Metadata();
    return md.GetEntityObject<T>(entityName, contextUser);
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
  resolvePipelineId(input: TrainExperimentInput): Promise<string>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * {@link IExperimentTrainer} backed by the {@link TrainingEngine}. For each
 * iteration it resolves the pipeline (via an injected {@link IPipelineResolver}),
 * trains it through the engine (producing an immutable Draft `MJ: ML Models` +
 * its `MJ: ML Training Runs` leaf linked to the iteration via
 * `experimentSessionIterationId`), and extracts the normalized holdout Score for
 * the plan's `SuccessMetric` to drive the leaderboard (null when the holdout did not measure it).
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

  /**
   * @inheritdoc
   * The session's remaining compute seconds become the run's timeout (the engine takes the smaller of them and the
   * protocol's compute budget); a session with no seconds bound leaves the protocol's.
   *
   * @throws TrainingAttemptFailedError when the attempt failed after its run row existed, carrying the run's compute
   */
  public async train(input: TrainExperimentInput): Promise<TrainExperimentResult> {
    const pipelineId = await this.pipelineResolver.resolvePipelineId(input);
    const { model, run } = await this.trainPipeline({
      pipelineId,
      experimentSessionIterationId: input.iterationId,
      ...(input.timeoutSeconds === null ? {} : { timeoutSeconds: input.timeoutSeconds }),
    }, input.iterationId);
    return {
      model,
      run,
      Score: ExtractNormalizedScore(model.HoldoutMetrics, input.plan.TargetDefinition.SuccessMetric),
      // A NULL run ComputeCost (no PS_COMPUTE_USD_PER_SECOND rate configured) is unbudgeted: it adds 0 to the
      // session's MaxComputeCost sum.
      ComputeCost: run.ComputeCost ?? 0,
      ComputeSeconds: run.ComputeSeconds ?? 0,
      TokensUsed: 0,
    };
  }

  /**
   * Train through the engine. When the attempt fails after its run row was written (a refusal at any stage after the
   * run exists, or any other error), the run already recorded the compute it spent; the failure becomes a
   * {@link TrainingAttemptFailedError} carrying that run's seconds and USD (the engine's error as its `cause`, its
   * message unchanged), so the session charges the failed attempt what it spent. A failure before any run row exists
   * spent nothing and passes through unchanged.
   */
  private async trainPipeline(trainInput: TrainModelInput, iterationId: string): Promise<TrainModelResult> {
    try {
      return await this.engine.trainModel(trainInput, this.trainingDeps);
    } catch (err) {
      const run = await this.failedAttemptRun(iterationId);
      if (run === null || !(err instanceof Error)) throw err;
      throw new TrainingAttemptFailedError(err.message, run.ComputeSeconds ?? 0, run.ComputeCost ?? 0, err);
    }
  }

  /**
   * The run the failed attempt wrote, read through the training deps' run reader, or null when it wrote none. A failed
   * read is logged and treated as no run, so it never masks the attempt's own error.
   */
  private async failedAttemptRun(iterationId: string): Promise<MJMLTrainingRunEntity | null> {
    const runs = this.trainingDeps.snapshots || new RunViewTrainingSnapshotStore(this.trainingDeps.provider, this.trainingDeps.contextUser);
    try {
      return await runs.FindRunForIteration(iterationId);
    } catch (readErr) {
      LogError(`TrainingEngineExperimentTrainer: reading the run of failed iteration ${iterationId} failed: ${readErr instanceof Error ? readErr.message : String(readErr)}`);
      return null;
    }
  }
}

/**
 * The **normalized** leaderboard score of a model: the plan's success metric read from its holdout metrics only, so
 * that higher is always better (a lower-is-better metric is negated, a closer-to-one metric is minus its distance from
 * one). Null when the holdout metrics do not hold the metric, or when the metric's direction is not known: a missing
 * score is never a stand-in number, and an unmeasured model never takes a place on the leaderboard.
 *
 * @param holdoutMetricsJson the model's `HoldoutMetrics` JSON
 * @param successMetric the plan's `SuccessMetric` (e.g. `AUC`, `RMSE`)
 */
export function ExtractNormalizedScore(holdoutMetricsJson: string | null, successMetric: string): number | null {
  const key = successMetric.trim().toLowerCase();
  const raw = parseMetrics(holdoutMetricsJson)?.get(key);
  if (raw === undefined || !Number.isFinite(raw)) return null;
  switch (MetricDirections.MetricDirectionOf(key)) {
    case 'higher-is-better': return raw;
    case 'lower-is-better': return -raw;
    case 'closer-to-one': return -Math.abs(1 - raw);
    case null: return null;
  }
}

/** A metrics JSON column as its numeric members by lower-cased key; null when the column is empty or not a JSON object. */
function parseMetrics(json: string | null): ReadonlyMap<string, number> | null {
  if (json === null || json.trim().length === 0) return null;
  const parsed = JsonParse.ParseJsonText(json, 'HoldoutMetrics');
  if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return null;
  const out = new Map<string, number>();
  for (const [k, v] of Object.entries(parsed.Value)) {
    if (typeof v === 'number') out.set(k.toLowerCase(), v);
  }
  return out;
}
