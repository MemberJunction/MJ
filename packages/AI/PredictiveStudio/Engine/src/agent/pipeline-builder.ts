/**
 * @module agent/pipeline-builder
 *
 * The **deterministic builder** behind the Predictive Studio Agent — the Predictive Studio analogue
 * of Database Designer's schema builder and Agent Manager's `AgentSpecSync`. It takes an approved,
 * strongly-typed {@link ModelingPlanSpec} and, in pure code (NO LLM), crafts the actual metadata:
 * creates the `MJ: ML Training Pipelines` row, kicks off training, then **publishes the model only
 * if the trust verdict clears the bar** — the same `TrustVerdicts.DeriveTrustVerdict` rendering of the training run's
 * stored gate decision the business UI uses, so a model the gate did not ship, a model trained without an Evaluation
 * Protocol (not evaluated), a leakage-flagged model or a calibration-held model is never silently published into the
 * catalog. A build that may publish evaluates its model through the lifecycle gate (`LifecycleGate.Evaluate({
 * trainingRunId })`: Draft → Validated or KeepBaseline from the run's stored gate decision) and stops there: nothing
 * publishes it until M4b routes automatic publishing through the gate's automated publisher, so the model is ready for a
 * person to publish (Promote ML Model, `publish`). A refusal holds the model with the gate's reason.
 *
 * Every approved experiment is a candidate of ONE search on ONE pipeline. The saved pipeline is bound to version 1 of
 * a Prediction Unit mapped from the plan's target (the pipeline migration's mapping; a target the mapping would archive
 * or hold is refused) and to an Evaluation Protocol before it trains, and the trainer picks the finalist on inner-fold
 * scores (the simplest candidate within one standard error of the best), reading the held-back rows once, for the
 * finalist.
 *
 * Used by the agent's builder sub-agent AND directly callable from a headless script/test, so the
 * "build a new prediction" path is verifiable without the full LLM loop.
 */

import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type UserInfo, type EntityInfo, LogError, LogStatus } from '@memberjunction/core';
import type { MJMLAlgorithmEntity, MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLPredictionUnitEntity } from '@memberjunction/core-entities';
import {
  CALIBRATION_SLOPE_RANGE,
  EvaluationProtocolRules,
  InnerScoreSelection,
  UtcDay,
  PredictionUnit,
  TrainingRunResultsParser,
  TrustVerdicts,
  type CandidateSpec,
  type FeatureStepWarning,
  type GateOutcome,
  type HyperparameterValue,
  type Actor,
  type ModelingPlanSpec,
  type TrustVerdict,
} from '@memberjunction/predictive-studio-core';

import { ModelingPlanToPipelineConfig, type PipelineConfig } from './modeling-plan-to-pipeline';
import { TrainingDelegation, WasTrainingLeakageFlagged } from '../operations/delegation';
import { LifecycleGate } from '../registry/lifecycle-gate';
import { GateContexts } from '../registry/gate-seams';
import { GateRefusals } from '../registry/gate-refusals';
import type { EvaluateOutcome } from '../registry/gate-context';
import { TrainerModelLineageReader } from '../training/trainer-model-lineage';
import { TrainingEngine } from '../training/training-engine';
import type { ProposedExperiment } from '../experiment/types';
import type { TrainModelResult } from '../training/types';
import { MetadataEntityFactory } from '../training/seams';
import { EvaluationProtocolVersioning } from '../protocol/protocol-versioning';
import { ProtocolDefaults } from '../protocol/protocol-defaults';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { PipelineMigration, type MigrationDeps } from '../migration/legacy-pipeline-migration';

/** Baseline member names a candidate may not take (with the `heuristic:` prefix); the sidecar refuses them too. */
export const RESERVED_CANDIDATE_NAMES: readonly string[] = ['dummy', 'oneFeature', 'glm', 'naive', 'seasonalNaive'];
/** The prefix of the incumbent-heuristic baseline members' names, reserved like {@link RESERVED_CANDIDATE_NAMES}. */
export const RESERVED_CANDIDATE_PREFIX = 'heuristic:';

/** Common short names an LLM writes for an algorithm, read as the normalized name of the algorithm they mean. */
const ALGORITHM_ALIASES: Readonly<Record<string, string>> = {
  linearregression: 'ridgeregression',
  linear: 'ridgeregression',
  ols: 'ridgeregression',
  ridge: 'ridgeregression',
  logistic: 'logisticregression',
  rf: 'randomforest',
  lgb: 'lightgbm',
  lgbm: 'lightgbm',
  xgb: 'xgboost',
  mlp: 'multilayerperceptron',
  neuralnet: 'multilayerperceptron',
  neuralnetwork: 'multilayerperceptron',
};

/** A name as the tolerant matchers compare it: lower-case letters and digits only (`Random Forest` → `randomforest`). */
function normalizeName(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** An `MJ: ML Algorithms` row an experiment's algorithm name resolved to. */
export type ResolvedAlgorithm = Pick<MJMLAlgorithmEntity, 'ID' | 'DriverClass'>;
/** The `MJ: ML Algorithms` columns an algorithm name is matched on. */
export type AlgorithmRow = Pick<MJMLAlgorithmEntity, 'ID' | 'Name' | 'DriverClass'>;

/** Inputs for {@link PredictiveStudioPipelineBuilder.build}. */
export interface BuildPredictionInput {
  /** The approved modeling plan the agent accumulated. */
  spec: ModelingPlanSpec;
  /** The owning provider (multi-provider correctness). */
  provider: IMetadataProvider;
  /** The acting user (isolation/audit). */
  user: UserInfo;
  /**
   * Evaluate the trained model through the lifecycle gate when the trust verdict clears the bar. Default true. The
   * Model Development Agent's build turns it off, so the model it trains stays in Draft until the user asks for it to be
   * published. Nothing is published by the build (M4b routes automatic publishing through the gate's automated publisher).
   */
  autoPublish?: boolean;
  /** Who started the build, recorded by the lifecycle gate: the agent run when the agent builds; default the user. */
  initiator?: Actor;
  /** Sidecar version marker recorded in lineage. */
  sidecarVersion?: string;
}

/**
 * Leaderboard entry matching MLExperimentResultsSpec (its keys are the artifact's JSON keys). For a search, a row is a
 * candidate's inner-fold mean with its interval, labelled optimistic, and the trainer's finalist is the winner even
 * when it is not rank 1. For a pipeline trained without a search, the one row is the stored comparison with the flat
 * guess its trust verdict quotes, or null when the run stores none (not evaluated) — never a stand-in number.
 */
export interface MLLeaderboardEntryPayload {
  /** The experiment iteration (or training run) the row came from. */
  IterationID: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The row's score, as `score`; null when not measured. */
  Metric: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The model trained for the row: the one model of a build without a search, or a search's finalist (other candidates have none). */
  ModelID?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** 1 for the best row. */
  rank?: number;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The algorithm's display name. */
  algorithm?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The experiment's feature-set label. */
  featureSet?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The score in `metricName`; null when not measured. */
  score?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** Which metric `score` is (an inner-fold score such as `log-loss`, or the gain over the flat guess in a metric); null when not measured. */
  metricName?: string | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The lower bound of the inner-fold mean's interval; null when the row is not an inner-fold score. */
  innerLower?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The upper bound of the inner-fold mean's interval; null when the row is not an inner-fold score. */
  innerUpper?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** True for an inner-fold score: the search chose among these numbers, so they are optimistic. */
  optimistic?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The older lowercase spelling of `ModelID`. */
  modelId?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** True only for the selected candidate, and only when it was measured. */
  isWinner?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
}

/** The training run's stored gate decision: what shipped (a trained model, a simple baseline, or nothing) and why. */
export interface BuildGateDecision {
  readonly Outcome: GateOutcome;
  /** The stored reason, in words. */
  readonly Reason: string;
}

/** The outcome of building a prediction from a plan. */
export interface BuildPredictionResult {
  /** Whether the build (pipeline create + train) succeeded. */
  success: boolean;
  /** The created `MJ: ML Training Pipelines` id (present once the pipeline is created). */
  pipelineId?: string;
  /** The trained `MJ: ML Models` id (present once training completes). */
  modelId?: string;
  /** The plain-language trust verdict: the training run's stored gate decision rendered as copy. */
  trust?: TrustVerdict;
  /** Whether the model was published into the business catalog. */
  published: boolean;
  /**
   * True when the model was not published only because auto-publish was off: it shipped under its protocol, training
   * flagged no leakage and it holds no calibration hold, so the lifecycle gate may be asked to evaluate and publish it.
   */
  readyToPublish: boolean;
  /** Whether training flagged a leakage warning (held for analyst review). */
  leakageFlagged: boolean;
  /**
   * When not published, the plain reason (leakage, a calibration hold, the trust verdict, auto-publish off, or the
   * lifecycle gate's refusal); else null.
   */
  heldReason: string | null;
  /** A clean error message when the build failed; else null. */
  errorMessage: string | null;
  /** The trained model entity (present on successful build). */
  model?: MJMLModelEntity;
  /** The created pipeline entity (present once pipeline is created). */
  pipeline?: MJMLTrainingPipelineEntity;
  /** The leaderboard of the build's one training run. */
  leaderboard?: MLLeaderboardEntryPayload[];
  /** The training run's stored gate decision; absent when the build failed before a run stored one. */
  Gate?: BuildGateDecision;
  /** Structured warnings emitted during plan translation or training (e.g. dropped candidate features). */
  warnings?: FeatureStepWarning[];
}

/** One training of the build's pipeline: the engine's result, the leaderboard it produced and its stored gate decision. */
interface BuildTraining {
  readonly Train: TrainModelResult;
  readonly Leaderboard: MLLeaderboardEntryPayload[];
  /** Null when the completed run stores no gate record. */
  readonly Gate: BuildGateDecision | null;
}

/** What the publish step of a build decides on. */
interface PublishInputs {
  readonly Model: MJMLModelEntity;
  /** The build's training run: what the lifecycle gate evaluates. */
  readonly TrainingRunID: string;
  readonly Trust: TrustVerdict;
  readonly LeakageFlagged: boolean;
  readonly AutoPublish: boolean;
  readonly Initiator: Actor;
  readonly Provider: IMetadataProvider;
  readonly User: UserInfo;
}

/** Whether the build published its model and, when not, why. */
interface PublishResult {
  readonly published: boolean;  // case-violation-ok-legacy-back-compat: spread into BuildPredictionResult, whose members are camelCase
  readonly heldReason: string | null;  // case-violation-ok-legacy-back-compat: spread into BuildPredictionResult, whose members are camelCase
  readonly readyToPublish: boolean;  // case-violation-ok-legacy-back-compat: spread into BuildPredictionResult, whose members are camelCase
}

/** Deterministic builder: approved {@link ModelingPlanSpec} → pipeline + trained (+ maybe published) model. */
export class PredictiveStudioPipelineBuilder {
  /**
   * Build a prediction from an approved plan: create one pipeline, bind its Prediction Unit, train it — one search
   * over every approved experiment — and publish if the trust verdict clears the bar. Every experiment's name and algorithm are checked before any row is written.
   * Never throws — returns a typed result with `success`/`errorMessage`.
   */
  public async Build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const warnings: FeatureStepWarning[] = [];
    try {
      return await this.runBuild(input, warnings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      LogError(`PredictiveStudioPipelineBuilder.build failed: ${errorMessage}`);
      return {
        success: false,
        published: false,
        readyToPublish: false,
        leakageFlagged: false,
        heldReason: null,
        errorMessage,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  /**
   * The build's steps — resolve the plan, save and bind the pipeline, train one search, publish when the verdict
   * clears the bar. Throws on any failure; the plan's feature-step warnings go into `warnings` first, so the failure
   * result {@link Build} returns still carries them.
   */
  protected async runBuild(input: BuildPredictionInput, warnings: FeatureStepWarning[]): Promise<BuildPredictionResult> {
    const { spec, provider, user, autoPublish = true, sidecarVersion = 'predictive-studio-agent' } = input;
    const initiator: Actor = input.initiator || { kind: 'human', userId: user.ID };
    const config = ModelingPlanToPipelineConfig(spec);
    warnings.push(...PredictiveStudioPipelineBuilder.DistinctWarnings(config.warnings));
    const { Pipeline: pipeline, Candidates: candidates } = await this.createBoundPipeline(spec, config, provider, user);
    const training = await this.trainSearch(pipeline, candidates, sidecarVersion, provider, user);
    const model = training.Train.model;
    if (model === null) {
      const runOutcome = autoPublish ? await this.evaluateRunWithoutModel(training.Train.run.ID, initiator, provider, user) : null;
      return PredictiveStudioPipelineBuilder.heldWithoutModel(pipeline, training, warnings, runOutcome);
    }
    const trust = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: training.Train.run.ValidationResults, Lineage: model.Lineage });
    const leakageFlagged = WasTrainingLeakageFlagged(training.Train);
    const { published, heldReason, readyToPublish } = await this.maybePublish({ Model: model, TrainingRunID: training.Train.run.ID, Trust: trust, LeakageFlagged: leakageFlagged, AutoPublish: autoPublish, Initiator: initiator, Provider: provider, User: user });
    return {
      success: true, pipelineId: pipeline.ID, modelId: model.ID, model, pipeline, trust, published, readyToPublish, leakageFlagged, heldReason,
      errorMessage: null, leaderboard: training.Leaderboard, Gate: training.Gate || undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /** The warnings with one entry per feature and kind, first occurrence kept. */
  public static DistinctWarnings(warnings: readonly FeatureStepWarning[]): FeatureStepWarning[] {
    const seen = new Set<string>();
    return warnings.filter((w) => {
      const key = `${w.FeatureName}:${w.Kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Checks every approved experiment's name and algorithm, then saves the pipeline and binds its Prediction Unit; no
   * row is written before the checks pass. Returns the saved pipeline and the search's candidates.
   */
  protected async createBoundPipeline(
    spec: ModelingPlanSpec, config: PipelineConfig, provider: IMetadataProvider, user: UserInfo,
  ): Promise<{ readonly Pipeline: MJMLTrainingPipelineEntity; readonly Candidates: readonly CandidateSpec[] }> {
    const entity = this.preparePipelineConfig(config, provider);
    const approved = PredictiveStudioPipelineBuilder.ApprovedExperiments(spec);
    const algorithms = await this.resolveAlgorithms([config.algorithmName, ...approved.map((e) => e.AlgorithmName)], provider, user);
    const candidates = PredictiveStudioPipelineBuilder.BuildCandidateSpecs(approved, algorithms);
    if (approved.some((e) => (e.FeatureSet || []).length > 0)) {
      LogStatus('PredictiveStudioPipelineBuilder: per-experiment feature sets are not candidates of one search; every candidate uses the pipeline feature schema.');
    }
    const pipeline = await this.savePipeline(config, entity, PredictiveStudioPipelineBuilder.algorithmOf(algorithms, config.algorithmName).ID, provider, user);
    await PredictiveStudioPipelineBuilder.bindUnit(pipeline, provider, user);
    return { Pipeline: pipeline, Candidates: candidates };
  }

  /**
   * The result of a build whose training run shipped no model (the gate decided `no-signal`, or kept the unit's existing
   * rule): built, not published, held with the run's stored reason, and no trust verdict (there is no model to judge).
   * `runOutcome` is the lifecycle gate's answer when the build evaluated the run (auto-publish on): its run-level record
   * holds the same stored reason; a refusal of the evaluation is the held reason instead.
   */
  private static heldWithoutModel(
    pipeline: MJMLTrainingPipelineEntity, training: BuildTraining, warnings: FeatureStepWarning[], runOutcome: EvaluateOutcome | null,
  ): BuildPredictionResult {
    const heldReason = runOutcome?.Kind === 'refused'
      ? `Not evaluated — the lifecycle gate refused: ${GateRefusals.Describe(runOutcome.Refusal)}`
      : `Not published — the training run shipped no model: ${TrainingEngine.NoModelReason(training.Train)}`;
    return {
      success: true, pipelineId: pipeline.ID, pipeline, published: false, readyToPublish: false, leakageFlagged: WasTrainingLeakageFlagged(training.Train),
      heldReason,
      errorMessage: null, leaderboard: training.Leaderboard, Gate: training.Gate || undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /** The plan's proposed experiments, highest priority (lowest `Priority`) first; ties keep plan order. */
  public static ApprovedExperiments(spec: ModelingPlanSpec): ProposedExperiment[] {
    return [...(spec.ProposedExperiments || [])]
      .sort((a, b) => (a.Priority || 0) - (b.Priority || 0))
      .map((e) => ({ ...e, AlgorithmName: e.AlgorithmName.trim() }));
  }

  /**
   * Every approved experiment becomes one candidate of the single search, in plan-priority order. A label a baseline
   * member uses (or one with the heuristic prefix) and a label used twice are refused, as is an algorithm name that
   * was not resolved. Hyperparameters keep their scalar values; nested objects are dropped.
   *
   * @throws Error naming the experiment
   */
  public static BuildCandidateSpecs(experiments: readonly ProposedExperiment[], algorithms: ReadonlyMap<string, ResolvedAlgorithm>): readonly CandidateSpec[] {
    const seen = new Set<string>();
    return experiments.map((e) => {
      if (RESERVED_CANDIDATE_NAMES.includes(e.Label) || e.Label.startsWith(RESERVED_CANDIDATE_PREFIX)) {
        throw new Error(`Experiment label '${e.Label}' is reserved for a baseline member; rename the experiment.`);
      }
      if (seen.has(e.Label)) throw new Error(`Experiment label '${e.Label}' is used by two experiments; every candidate of a search needs its own name.`);
      seen.add(e.Label);
      const algorithm = PredictiveStudioPipelineBuilder.algorithmOf(algorithms, e.AlgorithmName);
      return { name: e.Label, algorithmId: algorithm.ID, driverKey: algorithm.DriverClass, hyperparameters: PredictiveStudioPipelineBuilder.scalarHyperparameters(e.Hyperparameters) };
    });
  }

  /**
   * The `MJ: ML Algorithms` row an algorithm name means. Tolerant of LLM naming variation: the display `Name` or the
   * `DriverClass` matches case- and separator-insensitively, and common short names (`rf`, `xgb`, `linear`, …) are
   * read as the algorithm they name. Two different rows that both match are refused rather than one being picked.
   *
   * @throws Error listing the available algorithms when nothing matches, or naming both rows when two match
   */
  public static MatchAlgorithm(algorithmName: string, rows: readonly AlgorithmRow[]): ResolvedAlgorithm {
    const normalized = normalizeName(algorithmName);
    const want = ALGORITHM_ALIASES[normalized] || normalized;
    const matches = rows.filter((a) => normalizeName(a.Name) === want || normalizeName(a.DriverClass) === want);
    if (matches.length === 0) {
      const available = rows.map((a) => a.Name).join(', ');
      throw new Error(`Algorithm '${algorithmName}' was not found in MJ: ML Algorithms. Available: ${available || '(none)'}.`);
    }
    if (matches.length > 1) {
      const named = matches.map((a) => `'${a.Name}' (${a.DriverClass}, ${NormalizeUUID(a.ID)})`).join(' and ');
      throw new Error(`Algorithm '${algorithmName}' matches more than one MJ: ML Algorithms row: ${named}; name the algorithm by one of them.`);
    }
    return { ID: matches[0].ID, DriverClass: matches[0].DriverClass };
  }

  /** The resolved algorithm of a name, which {@link resolveAlgorithms} resolved before any row was written. */
  private static algorithmOf(algorithms: ReadonlyMap<string, ResolvedAlgorithm>, name: string): ResolvedAlgorithm {
    const algorithm = algorithms.get(name);
    if (algorithm === undefined) throw new Error(`Algorithm '${name}' was not resolved.`);
    return algorithm;
  }

  /** A plan experiment's hyperparameters as candidate values: scalars and null kept, nested objects and arrays dropped. */
  private static scalarHyperparameters(raw: Record<string, unknown> | undefined): Record<string, HyperparameterValue> {
    const hyperparameters: Record<string, HyperparameterValue> = {};
    for (const [key, value] of Object.entries(raw || {})) {
      if (PredictiveStudioPipelineBuilder.isHyperparameterValue(value)) hyperparameters[key] = value;
    }
    return hyperparameters;
  }

  /** A scalar or null: the values a candidate's hyperparameter can hold. */
  private static isHyperparameterValue(value: unknown): value is HyperparameterValue {
    return value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
  }

  /**
   * Bind version 1 of the pipeline's Prediction Unit, mapped from the columns the plan wrote (the pipeline migration's
   * mapping), right after the pipeline is saved; its search protocol is bound later, for every candidate. A pipeline
   * the mapping would archive or hold is refused with the mapping's reason, and the pipeline just saved is deleted: no
   * pipeline trains without a unit, and the build leaves no unit-less Draft behind.
   *
   * @throws Error naming why the pipeline gets no unit (and the pipeline's ID when deleting it failed)
   */
  private static async bindUnit(pipeline: MJMLTrainingPipelineEntity, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const deps: MigrationDeps = { Provider: provider, User: user, EntityFactory: new MetadataEntityFactory(provider), Today: UtcDay.UtcDayIso(new Date()) };
    const bound = await PipelineMigration.BindMigratedUnit(pipeline, deps);
    if (bound.Ok === true) return;
    const id = pipeline.ID;
    if (await pipeline.Delete()) throw new Error(`The pipeline gets no Prediction Unit, so it cannot train and was not kept: ${bound.Reason}`);
    throw new Error(`The pipeline gets no Prediction Unit, so it cannot train (${bound.Reason}); deleting pipeline ${id} failed: ${pipeline.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
  }

  /**
   * Train a pipeline with a Prediction Unit: bind its default Evaluation Protocol (before the run row), run ONE search
   * over every candidate, and read the leaderboard from the stored inner-fold scores and the gate decision from the stored record.
   */
  private async trainSearch(pipeline: MJMLTrainingPipelineEntity, candidates: readonly CandidateSpec[], sidecarVersion: string, provider: IMetadataProvider, user: UserInfo): Promise<BuildTraining> {
    await this.ensureProtocol(pipeline, candidates.length, provider, user);
    const train = await TrainingDelegation.TrainModelViaEngine({ pipelineId: pipeline.ID, candidates, sidecarVersion }, provider, user);
    return { Train: train, ...PredictiveStudioPipelineBuilder.searchResults(train) };
  }

  /**
   * A search's leaderboard from the run's stored trainer result: every candidate best-first by inner-fold mean with its
   * interval, each optimistic, the trainer's finalist the winner. The finalist's row links the model only when the gate
   * shipped the finalist; a kept baseline member's model, or no model, links no candidate row. With it, the stored
   * gate decision (outcome and reason), so a reader of the leaderboard knows whether the finalist shipped.
   *
   * @throws Error when the completed run stores no trainer result
   */
  private static searchResults(train: TrainModelResult): Pick<BuildTraining, 'Leaderboard' | 'Gate'> {
    const results = TrainingRunResultsParser.ParseTrainingRunResults(train.run.ValidationResults);
    if (!results.Ok || results.Value.status !== 'completed' || results.Value.trainer === null) {
      throw new Error(`Training run ${train.run.ID} completed without a stored trainer result; its search has no leaderboard.`);
    }
    const trainer = results.Value.trainer;
    const gate = results.Value.gate;
    const finalistModelId = train.model !== null && gate !== null && gate.decision.outcome === 'model' ? train.model.ID : undefined;
    const leaderboard = InnerScoreSelection.LeaderboardFromInnerScores(trainer.innerScores, trainer.finalist).map((row) => ({
      IterationID: train.run.ID, Metric: row.Mean, ModelID: row.IsFinalist ? finalistModelId : undefined, rank: row.Rank, algorithm: row.Candidate,
      featureSet: 'Pipeline feature set', score: row.Mean, metricName: row.Metric, innerLower: row.Lower, innerUpper: row.Upper,
      optimistic: row.Optimistic, modelId: row.IsFinalist ? finalistModelId : undefined, isWinner: row.IsFinalist,
    }));
    return { Leaderboard: leaderboard, Gate: gate === null ? null : { Outcome: gate.decision.outcome, Reason: gate.reason.text } };
  }

  /**
   * Resolve each distinct algorithm name once over one read of `MJ: ML Algorithms` (keys are the names as written in
   * the plan), so a bad name fails before any row is written.
   */
  private async resolveAlgorithms(names: readonly string[], provider: IMetadataProvider, user: UserInfo): Promise<ReadonlyMap<string, ResolvedAlgorithm>> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<AlgorithmRow>({ EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name', 'DriverClass'], ResultType: 'simple' }, user);
    if (!res.Success) throw new Error(`Loading MJ: ML Algorithms failed: ${res.ErrorMessage}`);
    return new Map([...new Set(names)].map((name) => [name, PredictiveStudioPipelineBuilder.MatchAlgorithm(name, res.Results)] as const));
  }

  /**
   * Bind version 1 of a default Evaluation Protocol when the pipeline has none — always before the first candidate
   * trains, so the protocol row precedes the run row. The holdout is the unit's default ({@link ProtocolDefaults}).
   */
  private async ensureProtocol(pipeline: MJMLTrainingPipelineEntity, candidates: number, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    if (pipeline.EvaluationProtocolID) return;
    const unitRow = await provider.GetEntityObject<MJMLPredictionUnitEntity>('MJ: ML Prediction Units', user);
    if (!pipeline.PredictionUnitID || !(await unitRow.Load(pipeline.PredictionUnitID))) throw new Error(`Prediction Unit ${pipeline.PredictionUnitID || '(none)'} not found.`);
    const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
    if (parsed.Ok === false) throw new Error(`Prediction Unit cannot be read: ${parsed.Errors.join('; ')}`);
    const holdout = await ProtocolDefaults.DefaultHoldoutFor(parsed.Value, { DataAccess: new RunViewDataAccess(user, provider), Metadata: new ProviderAssemblyMetadata(provider), Now: new Date() });
    const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: parsed.Value, Holdout: holdout, Candidates: candidates, Seed: ProtocolDefaults.DEFAULT_SEED, Name: `${pipeline.Name} — protocol` });
    const row = await EvaluationProtocolVersioning.CreateEvaluationProtocolV1(draft, { kind: 'system', component: 'pipeline-builder' }, new MetadataEntityFactory(provider), user);
    pipeline.EvaluationProtocolID = row.ID;
    if (!(await pipeline.Save())) throw new Error(`Binding the Evaluation Protocol failed: ${pipeline.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /**
   * Validate the whole plan against real metadata BEFORE any row is written or anything trains — so an invalid plan
   * (bad entity / target / feature) fails fast with an actionable message and leaves no orphan pipeline or run rows
   * behind — and canonicalize its names. Returns the target entity.
   */
  private preparePipelineConfig(config: PipelineConfig, provider: IMetadataProvider): EntityInfo {
    const entity = ResolveEntity(config.targetEntityName, provider);
    if (!entity) {
      throw new Error(`Target entity '${config.targetEntityName}' was not found in metadata. The plan must reference a real entity.`);
    }
    // Canonicalize target entity name so all downstream steps (FeatureAssembly, TrainingEngine, RunView) find it
    config.targetEntityName = entity.Name;

    // Canonicalize any source bindings referencing target entity view or aliases
    for (const sb of config.sourceBindings ?? []) {
      if (UUIDsEqual(ResolveEntity(sb.Ref, provider)?.ID, entity.ID)) {
        sb.Ref = entity.Name;
      }
    }

    // Sanitize leakage guard deny fields against real entity schema
    this.sanitizeLeakageGuard(config, entity, provider);
    this.validatePlanFields(config, entity);
    return entity;
  }

  /** Create + save the `MJ: ML Training Pipelines` row from the validated config. */
  private async savePipeline(config: PipelineConfig, entity: EntityInfo, algorithmId: string, provider: IMetadataProvider, user: UserInfo): Promise<MJMLTrainingPipelineEntity> {
    const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    pipeline.NewRecord();
    pipeline.Name = config.name;
    pipeline.Description = config.description;
    pipeline.Version = 1;
    pipeline.Status = 'Draft';
    pipeline.TargetEntityID = entity.ID;
    pipeline.TargetVariable = config.targetVariable;
    pipeline.ProblemType = config.problemType;
    pipeline.AlgorithmID = algorithmId;
    pipeline.SourceBindings = JSON.stringify(config.sourceBindings);
    pipeline.FeatureSteps = JSON.stringify(config.featureSteps);
    pipeline.AsOfStrategy = JSON.stringify(config.asOf);
    pipeline.LeakageGuard = JSON.stringify(config.leakageGuard);
    pipeline.ValidationStrategy = JSON.stringify(config.validation);
    if (!(await pipeline.Save())) {
      throw new Error(`Failed to create training pipeline: ${pipeline.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return pipeline;
  }

  /**
   * Ensure LeakageGuard.DenyFields entries exist as real columns on the target entity or bound sources,
   * mapping common synonyms (e.g. EndTime -> CompletedAt) and omitting non-existent column names that
   * would fail server validation with a false-alarm typo error.
   */
  private sanitizeLeakageGuard(config: PipelineConfig, entity: EntityInfo, provider: IMetadataProvider): void {
    if (!config.leakageGuard?.DenyFields || !Array.isArray(config.leakageGuard.DenyFields)) {
      return;
    }

    const fieldMap = new Map(entity.Fields.map((f) => [f.Name.toLowerCase(), f.Name]));
    const aliases: Record<string, string> = {
      endtime: 'completedat',
      enddate: 'completedat',
      finishedat: 'completedat',
    };

    const validDenyFields: string[] = [];
    for (const entry of config.leakageGuard.DenyFields) {
      const lower = entry.trim().toLowerCase();
      if (fieldMap.has(lower)) {
        validDenyFields.push(fieldMap.get(lower)!);
      } else if (aliases[lower] && fieldMap.has(aliases[lower])) {
        validDenyFields.push(fieldMap.get(aliases[lower])!);
      } else {
        // Check if field exists on any other bound source entity
        let foundOnBoundSource = false;
        for (const sb of config.sourceBindings ?? []) {
          if (sb.Kind === 'Entity') {
            const srcEntity = ResolveEntity(sb.Ref, provider);
            if (srcEntity?.Fields.some((f) => f.Name.toLowerCase() === lower)) {
              foundOnBoundSource = true;
              break;
            }
          }
        }
        if (foundOnBoundSource) {
          validDenyFields.push(entry);
        }
      }
    }
    config.leakageGuard.DenyFields = validDenyFields;
  }

  /**
   * Validate that the plan's target variable and its `select` feature columns actually exist as fields on
   * the target entity — throwing a single actionable error (with a sample of the real field names) when
   * they don't. This turns a would-be mid-train failure (or a garbage model trained on missing columns)
   * into a fast, correctable "the plan references fields that don't exist" message.
   *
   * Also canonicalizes casing to match the real field names on the entity.
   */
  private validatePlanFields(config: PipelineConfig, entity: EntityInfo): void {
    const fieldMap = new Map(entity.Fields.map((f) => [f.Name.toLowerCase(), f.Name]));
    const missing: string[] = [];
    if (config.targetVariable) {
      const canonicalTarget = fieldMap.get(config.targetVariable.toLowerCase());
      if (canonicalTarget) {
        config.targetVariable = canonicalTarget;
      } else {
        missing.push(`target field '${config.targetVariable}'`);
      }
    }
    const steps = (config.featureSteps?.Steps ?? []) as Array<{ Kind?: string; Columns?: string[]; Column?: string }>;
    for (const s of steps) {
      if (s.Kind === 'select' && Array.isArray(s.Columns)) {
        s.Columns = s.Columns.map((c) => {
          const canonical = fieldMap.get(c.toLowerCase());
          if (canonical) return canonical;
          missing.push(`feature '${c}'`);
          return c;
        });
      }
      if (s.Kind === 'onehot' && typeof s.Column === 'string') {
        const canonical = fieldMap.get(s.Column.toLowerCase());
        if (canonical) {
          s.Column = canonical;
        } else {
          missing.push(`feature '${s.Column}'`);
        }
      }
    }
    if (missing.length > 0) {
      const available = entity.Fields.map((f) => f.Name).slice(0, 25).join(', ');
      throw new Error(
        `The plan references field(s) that don't exist on '${entity.Name}': ${missing.join(', ')}. Available fields include: ${available}.`,
      );
    }
  }

  /**
   * Take the trained model as far as the build may (D4-102). With auto-publish on, every model is evaluated through the
   * lifecycle gate first ({@link evaluateThroughGate}), so it carries the gate's status and `StatusReason` whatever
   * holds it; then a leakage flag, a calibration hold or a trust verdict that does not clear the bar is the held reason
   * (why it is not published), else the gate's answer. Nothing is published here (M4b). With auto-publish off the model
   * stays in Draft: the plain held reason, or that it waits for a person.
   */
  private async maybePublish(p: PublishInputs): Promise<PublishResult> {
    const held = PredictiveStudioPipelineBuilder.heldBeforePromotion(p);
    if (!p.AutoPublish) {
      return held !== null
        ? { published: false, heldReason: held, readyToPublish: false }
        : { published: false, heldReason: PredictiveStudioPipelineBuilder.KeptInDraftReason, readyToPublish: true };
    }
    const evaluated = await this.evaluateThroughGate(p);
    if (held === null) return evaluated;
    // A held model whose evaluation the gate also refused keeps both answers (the gate's is lost otherwise).
    const heldReason = evaluated.readyToPublish ? held : `${held} — lifecycle gate: ${evaluated.heldReason}`;
    return { published: false, heldReason, readyToPublish: false };
  }

  /**
   * Evaluate a training run that shipped no model through the lifecycle gate (`Evaluate({ trainingRunId })`): the gate
   * writes the run's one run-level refusal record with the stored reason. A thrown gate error is not caught here: it
   * fails the build.
   */
  private async evaluateRunWithoutModel(trainingRunId: string, initiator: Actor, provider: IMetadataProvider, user: UserInfo): Promise<EvaluateOutcome> {
    const ctx = GateContexts.ForRequest({ ContextUser: user, Provider: provider });
    return this.CreateLifecycleGate().Evaluate({ trainingRunId }, initiator, ctx);
  }

  /** The held reason of a model that clears the bar to publish and stays in Draft only because auto-publish was off. */
  public static readonly KeptInDraftReason = 'Kept in Draft — it clears the bar to publish, and is published only when you ask.';

  /**
   * The held reason of a model the build evaluated, naming the status the lifecycle gate moved it to (nothing publishes
   * it): `Validated` clears the bar to publish; `KeepBaseline` means the gate kept the simple baseline, with the stored
   * decision's reason (the `StatusReason` the gate wrote).
   */
  public static EvaluatedReason(to: Extract<MJMLModelEntity['Status'], 'Validated' | 'KeepBaseline'>, storedReason: string | null): string {
    if (to === 'Validated') return 'Evaluated to Validated through the lifecycle gate — it clears the bar to publish, and is published only when you ask.';
    const why = storedReason && storedReason.trim().length > 0 ? ` ${storedReason.trim()}` : '';
    return `Evaluated to KeepBaseline through the lifecycle gate — the gate kept the simple baseline.${why} It is published only when you ask.`;
  }

  /**
   * Why a trained model cannot be published; null when the lifecycle gate may be asked to evaluate it. Auto-publish is
   * not one of these reasons: a model that is off only for that is ready to publish ({@link maybePublish}).
   */
  private static heldBeforePromotion(p: PublishInputs): string | null {
    if (p.LeakageFlagged) return 'Held for analyst review — training flagged a possible data-leakage issue.';
    const hold = TrainerModelLineageReader.CalibrationHoldOf(p.Model.Lineage);
    if (hold !== null) return `Held — ${PredictiveStudioPipelineBuilder.calibrationHoldText(hold.slope)}; a hidden family is never published.`;
    return p.Trust.CanAct ? null : p.Trust.Reason;
  }

  /** The calibration hold in words: the slope outside the accepted range, or that it could not be measured. */
  private static calibrationHoldText(slope: number | null): string {
    const range = `${CALIBRATION_SLOPE_RANGE[0]}–${CALIBRATION_SLOPE_RANGE[1]}`;
    return slope === null
      ? 'its calibration slope could not be measured, so its family is hidden (calibration hold)'
      : `its calibration slope ${slope.toFixed(2)} is outside ${range}, so its family is hidden (calibration hold)`;
  }

  /**
   * Evaluate the build's training run through the lifecycle gate (`Evaluate({ trainingRunId })`): Draft → Validated or
   * KeepBaseline as the run's stored gate decision says, the build's initiator recorded. The model is not published:
   * it is ready for a person to publish until M4b's automated publisher. A refusal holds the model at Draft with the
   * gate's reason. The gate saves its own copy of the row, so the returned model is reloaded once it moved.
   */
  private async evaluateThroughGate(p: PublishInputs): Promise<PublishResult> {
    const ctx = GateContexts.ForRequest({ ContextUser: p.User, Provider: p.Provider });
    const outcome = await this.CreateLifecycleGate().Evaluate({ trainingRunId: p.TrainingRunID }, p.Initiator, ctx);
    if (outcome.Kind !== 'evaluated') {
      return { published: false, heldReason: `Not evaluated — the lifecycle gate refused: ${GateRefusals.Describe(outcome.Refusal)}`, readyToPublish: false };
    }
    await PredictiveStudioPipelineBuilder.reloadModel(p.Model);
    return { published: false, heldReason: PredictiveStudioPipelineBuilder.EvaluatedReason(outcome.To, p.Model.StatusReason), readyToPublish: true };
  }

  /** Read the model row back after the gate changed it; a failed read is logged (the evaluation itself succeeded). */
  private static async reloadModel(model: MJMLModelEntity): Promise<void> {
    if (!(await model.Load(model.ID))) {
      LogError(`PredictiveStudioPipelineBuilder: model ${model.ID} was evaluated but could not be read back: ${model.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
  }

  /** The lifecycle gate the build evaluates through (production: {@link LifecycleGate}). Overridable so tests inject one. */
  protected CreateLifecycleGate(): LifecycleGate {
    return new LifecycleGate();
  }
}

/**
 * Resolve an entity identifier to an `EntityInfo`. Tolerant of LLM variations:
 * matches entity Name (e.g. 'MJ: AI Prompt Runs'), BaseView ('vwAIPromptRuns'),
 * BaseTable ('AIPromptRun'), schema prefixes ('__mj.vwAIPromptRuns'), and name without
 * app prefix ('AI Prompt Runs').
 */
export function ResolveEntity(nameOrView: string, provider: IMetadataProvider): EntityInfo | undefined {
  if (!nameOrView) return undefined;
  const direct = provider.EntityByName(nameOrView);
  if (direct) return direct;

  const trimmed = nameOrView.trim().toLowerCase();
  const normalizedTarget = normalizeName(nameOrView);

  for (const e of provider.Entities) {
    if (e.Name.trim().toLowerCase() === trimmed) return e;
    if (e.BaseView && e.BaseView.trim().toLowerCase() === trimmed) return e;
    if (e.BaseTable && e.BaseTable.trim().toLowerCase() === trimmed) return e;

    if (e.SchemaName && e.BaseView && `${e.SchemaName}.${e.BaseView}`.trim().toLowerCase() === trimmed) return e;
    if (e.SchemaName && e.BaseTable && `${e.SchemaName}.${e.BaseTable}`.trim().toLowerCase() === trimmed) return e;

    if (normalizeName(e.Name) === normalizedTarget) return e;
    if (e.BaseView && normalizeName(e.BaseView) === normalizedTarget) return e;
    if (e.BaseTable && normalizeName(e.BaseTable) === normalizedTarget) return e;

    const strippedPrefix = e.Name.replace(/^[^:]+:\s*/, '').trim().toLowerCase();
    if (strippedPrefix === trimmed || normalizeName(strippedPrefix) === normalizedTarget) return e;
  }
  return undefined;
}


