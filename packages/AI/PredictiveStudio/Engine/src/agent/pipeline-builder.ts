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
 * Used by the agent's builder sub-agent AND directly callable from a headless script/test, so the
 * "build a new prediction" path is verifiable without the full LLM loop.
 */

import { UUIDsEqual } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type UserInfo, type EntityInfo, LogError } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import { type ModelingPlanSpec, TrustVerdicts, type TrustVerdict, type FeatureStepWarning } from '@memberjunction/predictive-studio-core';

import { ModelingPlanToPipelineConfig, type PipelineConfig } from './modeling-plan-to-pipeline';
import { TrainingDelegation, WasTrainingLeakageFlagged } from '../operations/delegation';
import { PredictiveStudioRefusals } from '../operations/refusals';

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
 * Leaderboard entry matching MLExperimentResultsSpec. `Metric`/`score` is the candidate's measured headline metric
 * (the same one its trust verdict uses), or null when the candidate was not measured — never a stand-in number.
 */
export interface MLLeaderboardEntryPayload {
  IterationID: string;
  Metric: number | null;
  ModelID?: string;
  rank?: number;
  algorithm?: string;
  featureSet?: string;
  score?: number | null;
  /** Which headline metric `score` is (e.g. `AUC`, `R2`); null when not measured. */
  metricName?: string | null;
  modelId?: string;
  /** True only for the selected candidate, and only when it was measured. */
  isWinner?: boolean;
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
  /** Leaderboard iterations produced during the tournament. */
  leaderboard?: MLLeaderboardEntryPayload[];
  /** Structured warnings emitted during plan translation or training (e.g. dropped candidate features). */
  warnings?: FeatureStepWarning[];
}

/** One trained tournament candidate. */
export interface TrainedCandidate {
  Pipeline: MJMLTrainingPipelineEntity;
  Model: MJMLModelEntity;
  Trust: TrustVerdict;
  LeakageFlagged: boolean;
  AlgorithmName: string;
  FeatureSetName: string;
}

/** How tournament candidates are scored, ranked and reported. Pure; no I/O. */
export class TournamentRanking {
  /**
   * A candidate's leaderboard score: its trust verdict's headline metric, so the leaderboard and the headline can
   * never disagree for the same model. Null when the model was not measured.
   */
  public static HeadlineScore(trust: TrustVerdict): number | null {
    return trust.headlineMetric ? trust.headlineMetric.value : null;
  }

  /** Best-first: measured candidates by score (higher is better), unmeasured candidates last in plan order. */
  public static Rank(trained: TrainedCandidate[]): TrainedCandidate[] {
    return [...trained].sort((a, b) => {
      const sa = TournamentRanking.HeadlineScore(a.Trust);
      const sb = TournamentRanking.HeadlineScore(b.Trust);
      if (sa === null && sb === null) return 0;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sb - sa;
    });
  }

  /** Leaderboard rows for ranked candidates; the first row is the winner only when it was measured. */
  public static Leaderboard(ranked: TrainedCandidate[]): MLLeaderboardEntryPayload[] {
    return ranked.map((t, idx) => {
      const score = TournamentRanking.HeadlineScore(t.Trust);
      return {
        IterationID: t.Model.ID,
        Metric: score,
        ModelID: t.Model.ID,
        rank: idx + 1,
        algorithm: t.AlgorithmName,
        featureSet: t.FeatureSetName,
        score,
        metricName: t.Trust.headlineMetric ? t.Trust.headlineMetric.key : null,
        modelId: t.Model.ID,
        isWinner: idx === 0 && score !== null,
      };
    });
  }

  /**
   * The error a tournament throws when every candidate failed. When every candidate hit the same Predictive Studio
   * refusal, the first one is rethrown so its type and code survive; otherwise one error lists each distinct message.
   */
  public static AllCandidatesFailed(errors: Error[]): Error {
    const codes = errors.map((e) => PredictiveStudioRefusals.CodeOf(e));
    const first = codes[0];
    if (first !== null && first !== undefined && codes.every((c) => c === first)) {
      return errors[0];
    }
    const distinct = [...new Set(errors.map((e) => e.message))];
    return new Error(`All proposed experiment candidates failed to train: ${distinct.join(' | ')}`);
  }
}

/** Deterministic builder: approved {@link ModelingPlanSpec} → pipeline + trained (+ maybe published) model. */
export class PredictiveStudioPipelineBuilder {
  /**
   * Build a prediction from an approved plan: create the pipeline, train, and publish if the trust
   * verdict clears the bar. When multiple experiments are proposed, runs a multi-algorithm tournament
   * across up to 3 candidates, ranks them on each one's trust-verdict headline metric (unmeasured
   * candidates last, never the winner), and selects/publishes the winning model.
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
      const experiments = (spec.ProposedExperiments && spec.ProposedExperiments.length > 0)
        ? [...spec.ProposedExperiments].sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0))
        : [];

      if (experiments.length <= 1) {
        const config = ModelingPlanToPipelineConfig(spec);
        recordWarnings(config.warnings);
        const pipeline = await this.createPipeline(config, provider, user);
        const trainResult = await TrainingDelegation.TrainModelViaEngine({ pipelineId: pipeline.ID, sidecarVersion }, provider, user);
        const model = trainResult.model;
        const trust = TrustVerdicts.DeriveTrustVerdict(model);
        const leakageFlagged = WasTrainingLeakageFlagged(trainResult);
        const { published, heldReason } = await this.maybePublish(model, trust, leakageFlagged, autoPublish);
        const leaderboard = TournamentRanking.Leaderboard([{
          Pipeline: pipeline,
          Model: model,
          Trust: trust,
          LeakageFlagged: leakageFlagged,
          AlgorithmName: experiments[0]?.AlgorithmName ?? config.algorithmName,
          FeatureSetName: experiments[0]?.FeatureSet?.join(', ') || 'Full Feature Set',
        }]);
        return {
          success: true,
          pipelineId: pipeline.ID,
          modelId: model.ID,
          model,
          pipeline,
          trust,
          published,
          leakageFlagged,
          heldReason,
          errorMessage: null,
          leaderboard,
          warnings: collectedWarnings.length > 0 ? collectedWarnings : undefined,
        };
      }

      // Multi-algorithm tournament over up to 3 candidate experiments
      const candidatesToRun = experiments.slice(0, 3);
      const trained: TrainedCandidate[] = [];
      const candidateErrors: Error[] = [];

      for (let i = 0; i < candidatesToRun.length; i++) {
        const exp = candidatesToRun[i];
        try {
          const config = ModelingPlanToPipelineConfig(spec, i);
          recordWarnings(config.warnings);
          const pipeline = await this.createPipeline(config, provider, user);
          const trainResult = await TrainingDelegation.TrainModelViaEngine({ pipelineId: pipeline.ID, sidecarVersion }, provider, user);
          const model = trainResult.model;
          const trust = TrustVerdicts.DeriveTrustVerdict(model);
          const leakageFlagged = WasTrainingLeakageFlagged(trainResult);
          trained.push({
            Pipeline: pipeline,
            Model: model,
            Trust: trust,
            LeakageFlagged: leakageFlagged,
            AlgorithmName: exp.AlgorithmName || config.algorithmName,
            FeatureSetName: exp.FeatureSet?.join(', ') || 'Full Feature Set',
          });
        } catch (candidateErr) {
          const error = candidateErr instanceof Error ? candidateErr : new Error(String(candidateErr));
          candidateErrors.push(error);
          LogError(`PredictiveStudioPipelineBuilder: candidate '${exp.AlgorithmName}' failed: ${error.message}`);
        }
      }

      if (trained.length === 0) {
        throw TournamentRanking.AllCandidatesFailed(candidateErrors);
      }

      // Measured candidates best-first, unmeasured last. When none was measured there is no winner: the result
      // still reports the top-priority candidate (held by the trust gate, which never lets an unmeasured model act).
      const ranked = TournamentRanking.Rank(trained);
      const winner = ranked[0];
      const { published, heldReason } = await this.maybePublish(winner.Model, winner.Trust, winner.LeakageFlagged, autoPublish);
      const leaderboard = TournamentRanking.Leaderboard(ranked);

      return {
        success: true,
        pipelineId: winner.Pipeline.ID,
        modelId: winner.Model.ID,
        model: winner.Model,
        pipeline: winner.Pipeline,
        trust: winner.Trust,
        published,
        leakageFlagged: winner.LeakageFlagged,
        heldReason,
        errorMessage: null,
        leaderboard,
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

  /** Create + save the `MJ: ML Training Pipelines` row from the resolved config. */
  private async createPipeline(config: PipelineConfig, provider: IMetadataProvider, user: UserInfo): Promise<MJMLTrainingPipelineEntity> {
    // Validate the whole plan against real metadata BEFORE creating any rows or training — so an invalid
    // plan (bad entity / target / feature / algorithm) fails fast with an actionable message and leaves
    // no orphan pipeline/run rows behind, instead of erroring mid-train.
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
    const targetEntityId = entity.ID;
    const algorithmId = await this.resolveAlgorithmId(config.algorithmName, provider, user);

    const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    pipeline.NewRecord();
    pipeline.Name = config.name;
    pipeline.Description = config.description;
    pipeline.Version = 1;
    pipeline.Status = 'Draft';
    pipeline.TargetEntityID = targetEntityId;
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
   * Resolve an algorithm reference to its `MJ: ML Algorithms` id. Tolerant of LLM
   * naming variation: matches the display `Name` OR the `DriverClass`, comparing
   * case- and separator-insensitively — so `'LogisticRegression'`,
   * `'Logistic Regression'`, and `'logistic_regression'` all resolve to the same row.
   * Throws with the available algorithm list if nothing matches.
   */
  private async resolveAlgorithmId(algorithmName: string, provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID: string; Name: string; DriverClass: string }>(
      { EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name', 'DriverClass'], ResultType: 'simple' },
      user,
    );
    const algos = res.Success ? res.Results ?? [] : [];
    const normalize = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let want = normalize(algorithmName);
    const ALIASES: Record<string, string> = {
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
    if (ALIASES[want]) {
      want = ALIASES[want];
    }
    const match = algos.find((a) => normalize(a.Name) === want || normalize(a.DriverClass) === want);
    if (!match) {
      const available = algos.map((a) => a.Name).join(', ');
      throw new Error(`Algorithm '${algorithmName}' was not found in MJ: ML Algorithms. Available: ${available || '(none)'}.`);
    }
    return match.ID;
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

