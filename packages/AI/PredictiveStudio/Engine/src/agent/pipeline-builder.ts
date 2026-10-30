/**
 * @module agent/pipeline-builder
 *
 * The **deterministic builder** behind the Predictive Studio Agent — the Predictive Studio analogue
 * of Database Designer's schema builder and Agent Manager's `AgentSpecSync`. It takes an approved,
 * strongly-typed {@link ModelingPlanSpec} and, in pure code (NO LLM), crafts the actual metadata:
 * creates the `MJ: ML Training Pipelines` row, kicks off training, then **publishes the model only
 * if the trust verdict clears the bar** — the same `TrustVerdicts.DeriveTrustVerdict` gate the business UI uses, so
 * a coin-flip / unmeasured / leakage-flagged model is never silently published into the catalog.
 *
 * Every approved experiment is a candidate of ONE search on ONE pipeline. A pipeline with a Prediction Unit is bound
 * to an Evaluation Protocol before it trains, and the trainer picks the finalist on inner-fold scores (the simplest
 * candidate within one standard error of the best), reading the held-back rows once, for the finalist. A pipeline
 * without a Prediction Unit trains the plan's highest-priority experiment only, and the result names the experiments
 * it did not train.
 *
 * Used by the agent's builder sub-agent AND directly callable from a headless script/test, so the
 * "build a new prediction" path is verifiable without the full LLM loop.
 */

import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type UserInfo, type EntityInfo, LogError, LogStatus } from '@memberjunction/core';
import type { MJMLAlgorithmEntity, MJMLTrainingPipelineEntity, MJMLModelEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import {
  EvaluationProtocolRules,
  InnerScoreSelection,
  PredictionUnit,
  TrainingRunResultsParser,
  TrustVerdicts,
  type CandidateSpec,
  type FeatureStepWarning,
  type HyperparameterValue,
  type ModelingPlanSpec,
  type TrustVerdict,
} from '@memberjunction/predictive-studio-core';

import { ModelingPlanToPipelineConfig, type PipelineConfig } from './modeling-plan-to-pipeline';
import { TrainingDelegation, WasTrainingLeakageFlagged } from '../operations/delegation';
import type { ProposedExperiment } from '../experiment/types';
import type { TrainModelResult } from '../training/types';
import { MetadataEntityFactory } from '../training/seams';
import { EvaluationProtocolVersioning } from '../protocol/protocol-versioning';
import { ProtocolDefaults } from '../protocol/protocol-defaults';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';

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
  /** Publish the trained model when the trust verdict clears the bar. Default true. */
  autoPublish?: boolean;
  /** Sidecar version marker recorded in lineage. */
  sidecarVersion?: string;
}

/**
 * Leaderboard entry matching MLExperimentResultsSpec (its keys are the artifact's JSON keys). For a search, a row is a
 * candidate's inner-fold mean with its interval, labelled optimistic, and the trainer's finalist is the winner even
 * when it is not rank 1. For a pipeline trained without a search, the one row is the model's trust-verdict headline
 * metric, or null when it was not measured — never a stand-in number.
 */
export interface MLLeaderboardEntryPayload {
  IterationID: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  Metric: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  ModelID?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  rank?: number;  // case-violation-ok-legacy-back-compat: artifact JSON key
  algorithm?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  featureSet?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  score?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** Which metric `score` is (an inner-fold score such as `log-loss`, or a headline metric such as `AUC`); null when not measured. */
  metricName?: string | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The lower bound of the inner-fold mean's interval; null when the row is not an inner-fold score. */
  innerLower?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The upper bound of the inner-fold mean's interval; null when the row is not an inner-fold score. */
  innerUpper?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** True for an inner-fold score: the search chose among these numbers, so they are optimistic. */
  optimistic?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
  modelId?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** True only for the selected candidate, and only when it was measured. */
  isWinner?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
}

/** The outcome of building a prediction from a plan. */
export interface BuildPredictionResult {
  /** Whether the build (pipeline create + train) succeeded. */
  success: boolean;
  /** The created `MJ: ML Training Pipelines` id (present once the pipeline is created). */
  pipelineId?: string;
  /** The trained `MJ: ML Models` id (present once training completes). */
  modelId?: string;
  /** The plain-language trust verdict for the trained model. */
  trust?: TrustVerdict;
  /** Whether the model was published into the business catalog. */
  published: boolean;
  /** Whether training flagged a leakage warning (held for analyst review). */
  leakageFlagged: boolean;
  /** When not published, the plain reason (trust gate or leakage); else null. */
  heldReason: string | null;
  /** A clean error message when the build failed; else null. */
  errorMessage: string | null;
  /** The trained model entity (present on successful build). */
  model?: MJMLModelEntity;
  /** The created pipeline entity (present once pipeline is created). */
  pipeline?: MJMLTrainingPipelineEntity;
  /** The leaderboard of the build's one training run. */
  leaderboard?: MLLeaderboardEntryPayload[];
  /**
   * The labels of the approved experiments the build did not train: without a Prediction Unit on the pipeline there is
   * no search, so only the highest-priority experiment trains. Empty when every experiment was a candidate.
   */
  untrainedExperiments?: string[];
  /** Structured warnings emitted during plan translation or training (e.g. dropped candidate features). */
  warnings?: FeatureStepWarning[];
}

/** One training of the build's pipeline: the engine's result and the leaderboard it produced. */
interface BuildTraining {
  readonly Train: TrainModelResult;
  readonly Leaderboard: MLLeaderboardEntryPayload[];
  readonly Untrained: string[];
}

/** Deterministic builder: approved {@link ModelingPlanSpec} → pipeline + trained (+ maybe published) model. */
export class PredictiveStudioPipelineBuilder {
  /**
   * Build a prediction from an approved plan: create one pipeline, train it — one search over every approved
   * experiment when the pipeline has a Prediction Unit, else the highest-priority experiment — and publish if the
   * trust verdict clears the bar. Every experiment's name and algorithm are checked before any row is written.
   * Never throws — returns a typed result with `success`/`errorMessage`.
   */
  public async Build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const { spec, provider, user, autoPublish = true, sidecarVersion = 'predictive-studio-agent' } = input;
    const collectedWarnings: FeatureStepWarning[] = [];
    const seenWarningKeys = new Set<string>();

    const recordWarnings = (warnings: FeatureStepWarning[]) => {
      for (const w of warnings) {
        const key = `${w.FeatureName}:${w.Kind}`;
        if (!seenWarningKeys.has(key)) {
          seenWarningKeys.add(key);
          collectedWarnings.push(w);
        }
      }
    };

    try {
      const config = ModelingPlanToPipelineConfig(spec);
      recordWarnings(config.warnings);
      const entity = this.preparePipelineConfig(config, provider);
      const approved = PredictiveStudioPipelineBuilder.ApprovedExperiments(spec);
      const algorithms = await this.resolveAlgorithms([config.algorithmName, ...approved.map((e) => e.AlgorithmName)], provider, user);
      const candidates = PredictiveStudioPipelineBuilder.BuildCandidateSpecs(approved, algorithms);
      if (approved.some((e) => (e.FeatureSet ?? []).length > 0)) {
        LogStatus('PredictiveStudioPipelineBuilder: per-experiment feature sets are not candidates of one search; every candidate uses the pipeline feature schema.');
      }
      const pipeline = await this.savePipeline(config, entity, PredictiveStudioPipelineBuilder.algorithmOf(algorithms, config.algorithmName).ID, provider, user);
      const training = pipeline.PredictionUnitID
        ? await this.trainSearch(pipeline, candidates, sidecarVersion, provider, user)
        : await this.trainWithoutUnit(pipeline, approved, sidecarVersion, provider, user);
      const model = training.Train.model;
      const trust = TrustVerdicts.DeriveTrustVerdict(model);
      const leakageFlagged = WasTrainingLeakageFlagged(training.Train);
      const { published, heldReason } = await this.maybePublish(model, trust, leakageFlagged, autoPublish);
      return {
        success: true, pipelineId: pipeline.ID, modelId: model.ID, model, pipeline, trust, published, leakageFlagged, heldReason,
        errorMessage: null, leaderboard: training.Leaderboard, untrainedExperiments: training.Untrained,
        warnings: collectedWarnings.length > 0 ? collectedWarnings : undefined,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      LogError(`PredictiveStudioPipelineBuilder.build failed: ${errorMessage}`);
      return {
        success: false,
        published: false,
        leakageFlagged: false,
        heldReason: null,
        errorMessage,
        warnings: collectedWarnings.length > 0 ? collectedWarnings : undefined,
      };
    }
  }

  /** The plan's proposed experiments, highest priority (lowest `Priority`) first; ties keep plan order. */
  public static ApprovedExperiments(spec: ModelingPlanSpec): ProposedExperiment[] {
    return [...(spec.ProposedExperiments ?? [])]
      .sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0))
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
    const normalize = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = normalize(algorithmName);
    const want = ALGORITHM_ALIASES[normalized] ?? normalized;
    const matches = rows.filter((a) => normalize(a.Name) === want || normalize(a.DriverClass) === want);
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
    for (const [key, value] of Object.entries(raw ?? {})) {
      if (PredictiveStudioPipelineBuilder.isHyperparameterValue(value)) hyperparameters[key] = value;
    }
    return hyperparameters;
  }

  /** A scalar or null: the values a candidate's hyperparameter can hold. */
  private static isHyperparameterValue(value: unknown): value is HyperparameterValue {
    return value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
  }

  /**
   * The one leaderboard row of a pipeline trained without a search: the model's trust-verdict headline metric (the
   * number the headline shows), the winner only when it was measured.
   */
  public static SingleModelLeaderboard(runId: string, model: MJMLModelEntity, trust: TrustVerdict, algorithm: string): MLLeaderboardEntryPayload[] {
    const score = trust.headlineMetric ? trust.headlineMetric.value : null;
    return [{
      IterationID: runId, Metric: score, ModelID: model.ID, rank: 1, algorithm, featureSet: 'Pipeline feature set', score,
      metricName: trust.headlineMetric ? trust.headlineMetric.key : null, innerLower: null, innerUpper: null, optimistic: false,
      modelId: model.ID, isWinner: score !== null,
    }];
  }

  /**
   * Train a pipeline without a Prediction Unit: there is no protocol and no search, so it trains the plan's
   * highest-priority experiment (the pipeline's own algorithm) and names the rest as untrained.
   */
  private async trainWithoutUnit(pipeline: MJMLTrainingPipelineEntity, approved: readonly ProposedExperiment[], sidecarVersion: string, provider: IMetadataProvider, user: UserInfo): Promise<BuildTraining> {
    const train = await TrainingDelegation.TrainModelViaEngine({ pipelineId: pipeline.ID, sidecarVersion }, provider, user);
    const first = approved[0];
    const leaderboard = PredictiveStudioPipelineBuilder.SingleModelLeaderboard(train.run.ID, train.model, TrustVerdicts.DeriveTrustVerdict(train.model), first ? first.Label : pipeline.Name);
    return { Train: train, Leaderboard: leaderboard, Untrained: approved.slice(1).map((e) => e.Label) };
  }

  /**
   * Train a pipeline with a Prediction Unit: bind its default Evaluation Protocol (before the run row), run ONE search
   * over every candidate, and read the leaderboard from the stored inner-fold scores.
   */
  private async trainSearch(pipeline: MJMLTrainingPipelineEntity, candidates: readonly CandidateSpec[], sidecarVersion: string, provider: IMetadataProvider, user: UserInfo): Promise<BuildTraining> {
    await this.ensureProtocol(pipeline, candidates.length, provider, user);
    const train = await TrainingDelegation.TrainModelViaEngine({ pipelineId: pipeline.ID, candidates, sidecarVersion }, provider, user);
    return { Train: train, Leaderboard: PredictiveStudioPipelineBuilder.searchLeaderboard(train), Untrained: [] };
  }

  /**
   * A search's leaderboard from the run's stored trainer result: every candidate best-first by inner-fold mean with its
   * interval, each optimistic, the trainer's finalist the winner. The model is the finalist's, so only its row links it.
   *
   * @throws Error when the completed run stores no trainer result
   */
  private static searchLeaderboard(train: TrainModelResult): MLLeaderboardEntryPayload[] {
    const results = TrainingRunResultsParser.ParseTrainingRunResults(train.run.ValidationResults);
    if (!results.Ok || results.Value.status !== 'completed' || results.Value.trainer === null) {
      throw new Error(`Training run ${train.run.ID} completed without a stored trainer result; its search has no leaderboard.`);
    }
    const trainer = results.Value.trainer;
    return InnerScoreSelection.LeaderboardFromInnerScores(trainer.innerScores, trainer.finalist).map((row) => ({
      IterationID: train.run.ID, Metric: row.Mean, ModelID: row.IsFinalist ? train.model.ID : undefined, rank: row.Rank, algorithm: row.Candidate,
      featureSet: 'Pipeline feature set', score: row.Mean, metricName: row.Metric, innerLower: row.Lower, innerUpper: row.Upper,
      optimistic: row.Optimistic, modelId: row.IsFinalist ? train.model.ID : undefined, isWinner: row.IsFinalist,
    }));
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
    const unitRow = await provider.GetEntityObject<MJPredictionUnitEntity>('MJ: Prediction Units', user);
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
   * Publish the trained model into the business catalog ONLY if the trust verdict clears the bar and
   * training wasn't leakage-flagged. Otherwise leave it Draft and return the plain held-reason.
   */
  private async maybePublish(
    model: MJMLModelEntity,
    trust: TrustVerdict,
    leakageFlagged: boolean,
    autoPublish: boolean,
  ): Promise<{ published: boolean; heldReason: string | null }> {
    if (!autoPublish) {
      return { published: false, heldReason: 'Not published — auto-publish was off; review and publish when ready.' };
    }
    if (leakageFlagged) {
      return { published: false, heldReason: 'Held for analyst review — training flagged a possible data-leakage issue.' };
    }
    if (!trust.canAct) {
      return { published: false, heldReason: trust.gateReason ?? 'Held — this prediction is not reliable enough to publish yet.' };
    }
    model.Status = 'Published';
    if (!(await model.Save())) {
      throw new Error(`Trained model could not be published: ${model.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return { published: true, heldReason: null };
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
  const normalize = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedTarget = normalize(nameOrView);

  for (const e of provider.Entities) {
    if (e.Name.trim().toLowerCase() === trimmed) return e;
    if (e.BaseView && e.BaseView.trim().toLowerCase() === trimmed) return e;
    if (e.BaseTable && e.BaseTable.trim().toLowerCase() === trimmed) return e;

    if (e.SchemaName && e.BaseView && `${e.SchemaName}.${e.BaseView}`.trim().toLowerCase() === trimmed) return e;
    if (e.SchemaName && e.BaseTable && `${e.SchemaName}.${e.BaseTable}`.trim().toLowerCase() === trimmed) return e;

    if (normalize(e.Name) === normalizedTarget) return e;
    if (e.BaseView && normalize(e.BaseView) === normalizedTarget) return e;
    if (e.BaseTable && normalize(e.BaseTable) === normalizedTarget) return e;

    const strippedPrefix = e.Name.replace(/^[^:]+:\s*/, '').trim().toLowerCase();
    if (strippedPrefix === trimmed || normalize(strippedPrefix) === normalizedTarget) return e;
  }
  return undefined;
}


