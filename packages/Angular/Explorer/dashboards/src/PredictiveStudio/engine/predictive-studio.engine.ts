import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  LogError,
  Metadata,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { ActionEngineBase, type ActionParam, type ActionResult } from '@memberjunction/actions-base';
import { GraphQLActionClient, type GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { ReuseMatchRaw } from '../component-reuse.view-models';
import type { AskFindingRaw, AskObjectiveRaw, AskSignalRaw } from '../ask.view-models';

/** The action that ranks components by story similarity. Named once so a rename fails in one place. */
const REUSE_ACTION_NAME = 'Find Reusable Components';
const LIST_SIGNALS_ACTION_NAME = 'List Signals';
const FIND_FINDINGS_ACTION_NAME = 'Find Relevant Findings';
const ASSESS_CAPABILITY_ACTION_NAME = 'Assess Capability Coverage';
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
  MJMLComponentTypeEntity,
  MJMLComponentTypePropertyEntity,
  MJMLComponentTypeSlotEntity,
  MJMLComponentEntity,
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
  // The component TYPE tables only. Instances grow with every trained model, so they are loaded on
  // demand (LoadComponentInstances) with StoryVector excluded rather than bulk-cached here.
  private _ComponentTypes: MJMLComponentTypeEntity[] = [];
  private _ComponentTypeProperties: MJMLComponentTypePropertyEntity[] = [];
  private _ComponentTypeSlots: MJMLComponentTypeSlotEntity[] = [];

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
      { Type: 'entity', EntityName: 'MJ: ML Component Types', PropertyName: '_ComponentTypes', OrderBy: 'Name' },
      // Sequence order matters for the append-mode property keys; the resolver re-sorts defensively.
      { Type: 'entity', EntityName: 'MJ: ML Component Type Properties', PropertyName: '_ComponentTypeProperties', OrderBy: 'Sequence' },
      { Type: 'entity', EntityName: 'MJ: ML Component Type Slots', PropertyName: '_ComponentTypeSlots', OrderBy: 'Sequence' },
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
    return this.loadRunsForProcessIds(this.ScoringRecordProcessIDs, provider, user, options);
  }

  /**
   * Record Processes (`WorkType='ML Model'`) configured to score with `modelId` — the cached link from a
   * model to the processes that run it, idle/scheduled/bound alike (no DB hit). The `modelId` is read from
   * each Record Process's stored `Configuration` JSON.
   */
  public RecordProcessesForModel(modelId: string): MJRecordProcessEntity[] {
    return this.RecordProcesses.filter((rp) => {
      const id = this.recordProcessModelId(rp);
      return id != null && UUIDsEqual(id, modelId);
    });
  }

  /** The cached Record-Process ids scoring with `modelId`. */
  public RecordProcessIDsForModel(modelId: string): string[] {
    return this.RecordProcessesForModel(modelId).map((rp) => rp.ID);
  }

  /** Parse a Record Process's stored `modelId` (the `WorkType='ML Model'` config), or null. */
  private recordProcessModelId(rp: MJRecordProcessEntity): string | null {
    try {
      const cfg: unknown = JSON.parse(rp.Configuration ?? '{}');
      const id = (cfg as { modelId?: unknown })?.modelId;
      return typeof id === 'string' ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * Load recent process runs for ONE model's Record Processes — same DB-light, on-demand contract as
   * {@link LoadRecentScoringRuns}, scoped to a single model. Powers the "Models in Production" per-model
   * run history (a model needs no scoring binding to have runs — any `WorkType='ML Model'` Record Process
   * run persists here).
   */
  public async LoadRecentRunsForModel(
    modelId: string,
    provider: IMetadataProvider,
    user: UserInfo | undefined,
    options?: { sinceDays?: number; maxRows?: number },
  ): Promise<PSProcessRunRow[]> {
    return this.loadRunsForProcessIds(this.RecordProcessIDsForModel(modelId), provider, user, options);
  }

  /** Component TYPE nodes — the inheritance tree the Components panel renders. */
  public get ComponentTypes(): MJMLComponentTypeEntity[] {
    return this._ComponentTypes ?? [];
  }
  /** Inheritable property rows, merged root→leaf by the pure resolver in predictive-studio-core. */
  public get ComponentTypeProperties(): MJMLComponentTypePropertyEntity[] {
    return this._ComponentTypeProperties ?? [];
  }
  /** Slot declarations, inherited by name and narrowable only. */
  public get ComponentTypeSlots(): MJMLComponentTypeSlotEntity[] {
    return this._ComponentTypeSlots ?? [];
  }

  /**
   * Load component INSTANCES on demand — never bulk-cached, because they grow with every trained
   * model, and one of their columns (`StoryVector`) is an embedding that would dominate the payload.
   *
   * `StoryVector` is therefore deliberately excluded from `Fields`: the panel shows a component's
   * story as PROSE, and the vector is only ever needed server-side by the reuse search.
   *
   * @param provider the owning provider
   * @param user the acting user
   * @param options narrow to one component type and/or cap the rows
   */

  /**
   * Search the component catalogue by MEANING, via the `Find Reusable Components` action.
   *
   * Runs server-side for two reasons that are not conveniences. The embedding must come from the
   * same model that wrote every `StoryVector` — a client-chosen model yields distances against a
   * different vector space, which look plausible and mean nothing. And `StoryVector` is
   * deliberately excluded from {@link LoadComponentInstances}, so the vectors are not in the
   * browser to rank against in the first place.
   *
   * @returns the ranked matches plus how many candidates carried a usable story vector — the
   *   denominator is what separates "nothing was close enough" from "there was nothing to search"
   */
  public async FindReusableComponents(
    request: {
      QueryText: string;
      TopK?: number;
      MinSimilarity?: number;
      TrainedOnly?: boolean;
      PromotionStates?: string[];
      ForComponentTypeID?: string;
      ForSlotName?: string;
    },
    provider: IMetadataProvider,
  ): Promise<{ Matches: ReuseMatchRaw[]; CandidatesConsidered: number; Warnings: string[] }> {
    const action = ActionEngineBase.Instance.Actions.find((a) => a.Name === REUSE_ACTION_NAME);
    if (!action) {
      throw new Error(
        `The '${REUSE_ACTION_NAME}' action is not in metadata. Push the Predictive Studio action seeds and restart the server.`,
      );
    }
    const params: ActionParam[] = [{ Name: 'QueryText', Value: request.QueryText, Type: 'Input' }];
    // Only send what the caller actually set: an explicit undefined would override the action's
    // own defaults with nothing.
    const optional: Array<[string, unknown]> = [
      ['TopK', request.TopK],
      ['MinSimilarity', request.MinSimilarity],
      ['TrainedOnly', request.TrainedOnly],
      ['PromotionStates', request.PromotionStates],
      ['ForComponentTypeID', request.ForComponentTypeID],
      ['ForSlotName', request.ForSlotName],
    ];
    for (const [name, value] of optional) {
      if (value !== undefined) {
        params.push({ Name: name, Value: value, Type: 'Input' });
      }
    }

    const client = new GraphQLActionClient(provider as GraphQLDataProvider);
    const result = await client.RunAction(action.ID, params);
    if (!result.Success) {
      throw new Error(result.Message ?? 'The reuse search reported a failure.');
    }
    const output = (name: string): unknown => result.Params?.find((p) => p.Name === name)?.Value;
    const matches = output('Matches');
    const considered = output('CandidatesConsidered');
    const warnings = output('Warnings');
    return {
      Matches: Array.isArray(matches) ? (matches as ReuseMatchRaw[]) : [],
      CandidatesConsidered: typeof considered === 'number' ? considered : 0,
      Warnings: Array.isArray(warnings) ? warnings.map((w) => String(w)) : [],
    };
  }

  /**
   * Answer a plain-English question: what can be measured about it, and what has been learned.
   *
   * Both halves run server-side for the reason the reuse search does — the query has to be embedded
   * with the model that wrote every story vector, and those vectors are deliberately never loaded
   * into the browser. Run in parallel: they are independent, and the panel shows them together.
   *
   * Resilient by design. A missing action means Predictive Studio's seeds were never pushed, which
   * is a deployment state rather than an error the reader can act on — so that half comes back
   * empty and the other half still answers.
   */
  public async Ask(
    question: string,
    provider: IMetadataProvider,
    options?: { topK?: number },
  ): Promise<{ Signals: AskSignalRaw[]; Findings: AskFindingRaw[] }> {
    const topK = options?.topK ?? 6;
    const [signals, findings] = await Promise.all([
      this.runAskAction(LIST_SIGNALS_ACTION_NAME, provider, [
        { Name: 'QueryText', Value: question, Type: 'Input' },
        { Name: 'MaxRows', Value: topK, Type: 'Input' },
      ]),
      this.runAskAction(FIND_FINDINGS_ACTION_NAME, provider, [
        { Name: 'QueryText', Value: question, Type: 'Input' },
        { Name: 'TopK', Value: topK, Type: 'Input' },
      ]),
    ]);
    return {
      Signals: this.readArray<AskSignalRaw>(signals, 'Signals'),
      Findings: this.readArray<AskFindingRaw>(findings, 'Findings'),
    };
  }

  /**
   * Diagnose a pasted document — what it says the organization wants to do, against what it can
   * measure and has learned.
   *
   * Unlike {@link Ask}, a failure here is thrown rather than swallowed: the reader pasted a document
   * and is waiting for a verdict on it, so silence would read as "nothing in your plan is covered",
   * which is the exact misreading this whole feature is built to prevent.
   */
  public async AssessDocument(
    text: string,
    provider: IMetadataProvider,
  ): Promise<{ Objectives: AskObjectiveRaw[]; SignalsConsidered: number; Summary: Record<string, number>; Message: string }> {
    const action = ActionEngineBase.Instance.Actions.find((a) => a.Name === ASSESS_CAPABILITY_ACTION_NAME);
    if (!action) {
      throw new Error(
        `The '${ASSESS_CAPABILITY_ACTION_NAME}' action is not in metadata. Push the Predictive Studio action seeds and restart the server.`,
      );
    }
    const client = new GraphQLActionClient(provider as GraphQLDataProvider);
    const result = await client.RunAction(action.ID, [{ Name: 'Text', Value: text, Type: 'Input' }]);
    if (!result.Success) {
      throw new Error(result.Message ?? 'The capability assessment reported a failure.');
    }
    const considered = result.Params?.find((p) => p.Name === 'SignalsConsidered')?.Value;
    const summary = result.Params?.find((p) => p.Name === 'Summary')?.Value;
    return {
      Objectives: this.readArray<AskObjectiveRaw>(result, 'Objectives'),
      SignalsConsidered: typeof considered === 'number' ? considered : 0,
      Summary: summary && typeof summary === 'object' ? (summary as Record<string, number>) : {},
      Message: result.Message ?? '',
    };
  }

  /** Run one Ask-side action, returning `null` rather than throwing — see {@link Ask}. */
  protected async runAskAction(
    name: string,
    provider: IMetadataProvider,
    params: ActionParam[],
  ): Promise<ActionResult | null> {
    try {
      const action = ActionEngineBase.Instance.Actions.find((a) => a.Name === name);
      if (!action) {
        LogError(`PredictiveStudioEngine: the '${name}' action is not in metadata — Predictive Studio seeds may not be pushed.`);
        return null;
      }
      const result = await new GraphQLActionClient(provider as GraphQLDataProvider).RunAction(action.ID, params);
      if (!result.Success) {
        LogError(`PredictiveStudioEngine: '${name}' failed: ${result.Message ?? 'unknown error'}`);
        return null;
      }
      return result;
    } catch (e) {
      LogError(e);
      return null;
    }
  }

  /** Read a named array output off an action result, tolerating absence. */
  protected readArray<T>(result: ActionResult | null, name: string): T[] {
    const value = result?.Params?.find((p) => p.Name === name)?.Value;
    return Array.isArray(value) ? (value as T[]) : [];
  }

  public async LoadComponentInstances(
    provider: IMetadataProvider,
    user: UserInfo | undefined,
    options?: { componentTypeId?: string; mlModelId?: string; maxRows?: number },
  ): Promise<MJMLComponentEntity[]> {
    const filters: string[] = [];
    if (options?.componentTypeId) {
      filters.push(`ComponentTypeID='${options.componentTypeId}'`);
    }
    if (options?.mlModelId) {
      filters.push(`MLModelID='${options.mlModelId}'`);
    }

    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJMLComponentEntity>(
      {
        EntityName: 'MJ: ML Components',
        ExtraFilter: filters.join(' AND '),
        Fields: [
          'ID',
          'Name',
          'ComponentTypeID',
          'ComponentType',
          'MLModelID',
          'ParentComponentID',
          'SlotName',
          'IsTrained',
          'PromotionState',
          'Status',
          'Story',
          'StoryContribution',
          '__mj_UpdatedAt',
        ],
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: options?.maxRows ?? 100,
        ResultType: 'simple',
      },
      user,
    );
    return result.Success ? result.Results ?? [] : [];
  }

  /** Shared run-loader: recent `MJ: Process Runs` for a set of Record-Process ids (capped, newest-first). */
  private async loadRunsForProcessIds(
    processIds: string[],
    provider: IMetadataProvider,
    user: UserInfo | undefined,
    options?: { sinceDays?: number; maxRows?: number },
  ): Promise<PSProcessRunRow[]> {
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
