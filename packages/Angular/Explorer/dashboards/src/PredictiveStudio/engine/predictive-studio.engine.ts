import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  Metadata,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
  MJMLAlgorithmEntity,
  MJMLAlgorithmUseCaseEntity,
  MJMLAlgorithmUseCaseRankingEntity,
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJExperimentEntity,
  MJExperimentSessionEntity,
  MJExperimentSessionIterationEntity,
  MJProcessRunEntity,
  MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import { PSIterationRow, PSProcessRunRow } from '../predictive-studio.view-models';

/**
 * Recommendation levels used by the Algorithm Use Case Rankings matrix, ordered weakest → strongest.
 * Used to rank algorithms within a chosen scenario in the catalog "Guide me" picker.
 */
export type RecommendationLevel = 'NotRecommended' | 'Weak' | 'Viable' | 'Strong' | 'Primary';

/** Numeric rank for each {@link RecommendationLevel} (higher = better fit). */
export const RECOMMENDATION_RANK: Record<RecommendationLevel, number> = {
  NotRecommended: 0,
  Weak: 1,
  Viable: 2,
  Strong: 3,
  Primary: 4,
};

/** Minimal shape of a ranking row consumed by {@link computeBestLevels} (decoupled from the entity). */
export interface RankingRow {
  MLAlgorithmID: string;
  MLAlgorithmUseCaseID: string;
  RecommendationLevel: RecommendationLevel;
}

/**
 * Pure ranking-matrix reducer: given ranking rows and a set of selected use-case IDs, returns each
 * algorithm's BEST recommendation level (max by rank) across those scenarios. Extracted from the
 * engine so it is unit-testable without a metadata provider / DB.
 */
export function computeBestLevels(rankings: RankingRow[], useCaseIds: string[]): Map<string, RecommendationLevel> {
  const out = new Map<string, RecommendationLevel>();
  if (useCaseIds.length === 0) return out;
  for (const ranking of rankings) {
    if (!useCaseIds.some((id) => UUIDsEqual(id, ranking.MLAlgorithmUseCaseID))) continue;
    const current = out.get(ranking.MLAlgorithmID);
    if (!current || RECOMMENDATION_RANK[ranking.RecommendationLevel] > RECOMMENDATION_RANK[current]) {
      out.set(ranking.MLAlgorithmID, ranking.RecommendationLevel);
    }
  }
  return out;
}

/**
 * PredictiveStudioEngine — the single, process-wide cache + domain-logic layer for the Predictive
 * Studio dashboard. Follows the canonical MJ BaseEngine pattern (Config() declaring
 * BaseEnginePropertyConfig[], lazy-loaded, ObserveProperty reactivity for free).
 *
 * It caches the SMALL Predictive Studio reference entities (algorithms, use cases, the rankings
 * matrix, models, pipelines, training runs, experiments + sessions + iterations) via RunView so
 * the panels bind to in-memory arrays and stay reactive to saves/deletes. Large columns
 * (serialized model artifacts, feature schemas) live on the entities themselves but these tables
 * are small enough to fully cache.
 */
export class PredictiveStudioEngine extends BaseEngine<PredictiveStudioEngine> {
  /** Singleton accessor — never `new` this class directly. */
  public static get Instance(): PredictiveStudioEngine {
    return super.getInstance<PredictiveStudioEngine>();
  }

  private _Algorithms: MJMLAlgorithmEntity[] = [];
  private _UseCases: MJMLAlgorithmUseCaseEntity[] = [];
  private _Rankings: MJMLAlgorithmUseCaseRankingEntity[] = [];
  private _Models: MJMLModelEntity[] = [];
  private _ScoringBindings: MJMLModelScoringBindingEntity[] = [];
  private _RecordProcesses: MJRecordProcessEntity[] = [];
  private _Pipelines: MJMLTrainingPipelineEntity[] = [];
  private _TrainingRuns: MJMLTrainingRunEntity[] = [];
  private _Experiments: MJExperimentEntity[] = [];
  private _Sessions: MJExperimentSessionEntity[] = [];
  private _Iterations: MJExperimentSessionIterationEntity[] = [];

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const c: Partial<BaseEnginePropertyConfig>[] = [
      { Type: 'entity', EntityName: 'MJ: ML Algorithms', PropertyName: '_Algorithms', OrderBy: 'Name' },
      { Type: 'entity', EntityName: 'MJ: ML Algorithm Use Cases', PropertyName: '_UseCases', OrderBy: 'DisplayOrder' },
      { Type: 'entity', EntityName: 'MJ: ML Algorithm Use Case Rankings', PropertyName: '_Rankings' },
      { Type: 'entity', EntityName: 'MJ: ML Models', PropertyName: '_Models', OrderBy: '__mj_UpdatedAt DESC' },
      { Type: 'entity', EntityName: 'MJ: ML Model Scoring Bindings', PropertyName: '_ScoringBindings', OrderBy: '__mj_UpdatedAt DESC' },
      { Type: 'entity', EntityName: 'MJ: Record Processes', PropertyName: '_RecordProcesses', OrderBy: 'Name' },
      { Type: 'entity', EntityName: 'MJ: ML Training Pipelines', PropertyName: '_Pipelines', OrderBy: 'Name' },
      { Type: 'entity', EntityName: 'MJ: ML Training Runs', PropertyName: '_TrainingRuns', OrderBy: '__mj_CreatedAt DESC' },
      { Type: 'entity', EntityName: 'MJ: Experiments', PropertyName: '_Experiments', OrderBy: 'Name' },
      { Type: 'entity', EntityName: 'MJ: Experiment Sessions', PropertyName: '_Sessions', OrderBy: '__mj_CreatedAt DESC' },
      { Type: 'entity', EntityName: 'MJ: Experiment Session Iterations', PropertyName: '_Iterations', OrderBy: 'Sequence' },
    ];
    await super.Load(c, provider ?? Metadata.Provider, forceRefresh, contextUser);
  }

  // ---- Cached arrays (sync getters; observe via ObserveProperty for reactive UI) ----

  public get Algorithms(): MJMLAlgorithmEntity[] {
    return this._Algorithms ?? [];
  }
  public get UseCases(): MJMLAlgorithmUseCaseEntity[] {
    return this._UseCases ?? [];
  }
  public get Rankings(): MJMLAlgorithmUseCaseRankingEntity[] {
    return this._Rankings ?? [];
  }
  public get Models(): MJMLModelEntity[] {
    return this._Models ?? [];
  }
  /** Scoring bindings — a model → (target entity + column, optional Record Process) deployment link. */
  public get ScoringBindings(): MJMLModelScoringBindingEntity[] {
    return this._ScoringBindings ?? [];
  }
  /** Record Processes — used to resolve the schedule (cron) + status of a binding's bound process. */
  public get RecordProcesses(): MJRecordProcessEntity[] {
    return this._RecordProcesses ?? [];
  }
  public get Pipelines(): MJMLTrainingPipelineEntity[] {
    return this._Pipelines ?? [];
  }
  public get TrainingRuns(): MJMLTrainingRunEntity[] {
    return this._TrainingRuns ?? [];
  }
  public get Experiments(): MJExperimentEntity[] {
    return this._Experiments ?? [];
  }
  public get Sessions(): MJExperimentSessionEntity[] {
    return this._Sessions ?? [];
  }
  public get Iterations(): MJExperimentSessionIterationEntity[] {
    return this._Iterations ?? [];
  }

  // ---- Domain helpers ----

  /** Look up an ML Model by ID (for joining a scoring binding to its model). */
  public ModelByID(modelId: string | null | undefined): MJMLModelEntity | undefined {
    if (!modelId) return undefined;
    return this.Models.find((m) => UUIDsEqual(m.ID, modelId));
  }

  /** Look up a Record Process by ID (for resolving a binding's schedule/status). */
  public RecordProcessByID(processId: string | null | undefined): MJRecordProcessEntity | undefined {
    if (!processId) return undefined;
    return this.RecordProcesses.find((p) => UUIDsEqual(p.ID, processId));
  }

  /** Look up an algorithm name by ID (for joining iterations/runs/models to a display name). */
  public AlgorithmName(algorithmId: string | null | undefined): string {
    if (!algorithmId) return 'Unknown';
    return this.Algorithms.find((a) => UUIDsEqual(a.ID, algorithmId))?.Name ?? 'Unknown';
  }

  /** All ranking rows for a given use case, joined to their algorithm and ranked best-first. */
  public RankingsForUseCase(useCaseId: string): MJMLAlgorithmUseCaseRankingEntity[] {
    return this.Rankings.filter((r) => UUIDsEqual(r.MLAlgorithmUseCaseID, useCaseId)).sort(
      (a, b) => RECOMMENDATION_RANK[b.RecommendationLevel] - RECOMMENDATION_RANK[a.RecommendationLevel],
    );
  }

  /**
   * Given a set of selected use-case IDs, compute each algorithm's BEST recommendation level
   * across those scenarios (max by rank) — the core of the catalog "Guide me" picker.
   * Returns a map of algorithmId → best level, omitting algorithms with no ranking row.
   */
  public BestLevelsForScenarios(useCaseIds: string[]): Map<string, RecommendationLevel> {
    return computeBestLevels(this.Rankings, useCaseIds);
  }

  /** Iterations belonging to a session, in sequence order. */
  public IterationsForSession(sessionId: string): MJExperimentSessionIterationEntity[] {
    return this.Iterations.filter((i) => UUIDsEqual(i.ExperimentSessionID, sessionId)).sort(
      (a, b) => a.Sequence - b.Sequence,
    );
  }

  /** Published models only — the production-quality set used for headline KPIs. */
  public get PublishedModels(): MJMLModelEntity[] {
    return this.Models.filter((m) => m.Status === 'Published');
  }

  /** Sessions whose status is `Running` — the active experiment count. */
  public get RunningSessions(): MJExperimentSessionEntity[] {
    return this.Sessions.filter((s) => s.Status === 'Running');
  }

  /**
   * Resolve a model's human-readable display name generically: the producing pipeline's name when
   * available (the most meaningful label — what the model predicts), else the model's denormalized
   * `Pipeline` view field, else a version-stamped fallback. Entity-agnostic — never hardcodes any
   * business entity.
   */
  public ModelDisplayName(model: MJMLModelEntity): string {
    const pipeline = this.Pipelines.find((p) => UUIDsEqual(p.ID, model.PipelineID));
    return pipeline?.Name ?? model.Pipeline ?? `Model v${model.Version}`;
  }

  /**
   * Map the engine's cached iterations for a session into the pure {@link PSIterationRow} shape the
   * view-model derivations consume — joining each iteration to its algorithm name via the resulting
   * training run (iteration → run → algorithm), since iterations don't carry the algorithm directly.
   */
  public IterationRowsForSession(sessionId: string): PSIterationRow[] {
    return this.IterationsForSession(sessionId).map((it) => ({
      ID: it.ID,
      ExperimentSessionID: it.ExperimentSessionID,
      Sequence: it.Sequence,
      Label: it.Label,
      Status: it.Status,
      Score: it.Score,
      ComputeCost: it.ComputeCost,
      TokensUsed: it.TokensUsed,
      Rationale: it.Rationale,
      AlgorithmName: this.AlgorithmForIteration(it.ID),
    }));
  }

  /** Resolve an iteration's algorithm display name via its training run (or 'Unknown'). */
  public AlgorithmForIteration(iterationId: string): string {
    const run = this.TrainingRuns.find((r) => UUIDsEqual(r.ExperimentSessionIterationID, iterationId));
    return run ? this.AlgorithmName(run.AlgorithmID) : 'Unknown';
  }

  /**
   * The `MJ: Record Processes` IDs that ML scoring write-backs run through — every scoring binding's
   * bound Record Process. Used to scope the Home activity feed to ML-scoring runs without depending
   * on a typed `WorkType='ML Model'` enum value (which is registered at runtime, not in the type).
   */
  public get ScoringRecordProcessIDs(): string[] {
    const ids = this.ScoringBindings.map((b) => b.RecordProcessID).filter((id): id is string => !!id);
    return [...new Set(ids)];
  }

  /**
   * Load recent ML-scoring process runs on demand (NOT bulk-cached — `MJ: Process Runs` grows
   * unbounded). Scopes to runs whose `RecordProcessID` is one of the ML scoring bindings'
   * processes, optionally to the last `sinceDays`, capped at `maxRows`, newest first. Returns the
   * pure {@link PSProcessRunRow} shape for the Home derivations. Returns `[]` (never throws) on any
   * failure or when there are no scoring bindings to scope to.
   *
   * @param provider The provider to run against (multi-provider correctness).
   * @param user The acting user (server-side audit/security).
   * @param options.sinceDays Only runs started within this many days (default 7).
   * @param options.maxRows Row cap (default 50).
   */
  public async LoadRecentScoringRuns(
    provider: IMetadataProvider,
    user: UserInfo | undefined,
    options?: { sinceDays?: number; maxRows?: number },
  ): Promise<PSProcessRunRow[]> {
    const processIds = this.ScoringRecordProcessIDs;
    if (processIds.length === 0) return [];
    const sinceDays = options?.sinceDays ?? 7;
    const maxRows = options?.maxRows ?? 50;
    const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const idList = processIds.map((id) => `'${id}'`).join(',');

    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJProcessRunEntity>(
      {
        EntityName: 'MJ: Process Runs',
        ExtraFilter: `RecordProcessID IN (${idList}) AND __mj_CreatedAt >= '${sinceIso}'`,
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: maxRows,
        ResultType: 'entity_object',
      },
      user,
    );
    if (!result.Success) return [];
    return (result.Results ?? []).map((r) => ({
      ID: r.ID,
      Status: r.Status,
      StartTime: r.StartTime,
      CreatedAt: r.__mj_CreatedAt,
      SuccessCount: r.SuccessCount,
      TotalItemCount: r.TotalItemCount,
      ProcessName: r.RecordProcess,
      EntityName: r.Entity,
      DryRun: r.DryRun,
    }));
  }
}
