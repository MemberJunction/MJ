import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  Metadata,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
  MJMLAlgorithmEntity,
  MJMLAlgorithmUseCaseEntity,
  MJMLAlgorithmUseCaseRankingEntity,
  MJMLModelEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJExperimentEntity,
  MJExperimentSessionEntity,
  MJExperimentSessionIterationEntity,
} from '@memberjunction/core-entities';

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
}
