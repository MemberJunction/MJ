import { RunView } from '@memberjunction/core';
import {
  type MJMLModelEntity,
  type MJMLTrainingRunEntity,
  PredictiveStudioPromoteModelOperation,
  type PredictiveStudioModelTargetStatus,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, SafeJSONParse, type UUIDMap } from '@memberjunction/global';
import { TrustVerdicts, type ModelMetrics } from '@memberjunction/predictive-studio-core';
import type { AlgorithmRow } from './pipelines';
import type { RunContext } from './run-fixtures';
import type { AlgorithmKey, CandidateModel, PromoteAttempt } from './types';

/** The counts the training engine writes into a model's `Lineage` (`TrainingEngine.buildLineage`). */
interface TrainingLineageCounts {
  lockedHoldoutRowCount?: number;
}

/** The training-run columns a `CandidateModel` reads. */
type TrainingRunRow = Pick<MJMLTrainingRunEntity, 'Status' | 'Notes' | 'ValidationResults'>;

/** Model read-back and lifecycle promotion wrappers for the truth harness. */
export class HarnessModels {
  private static readonly algorithmKeys: ReadonlySet<string> = new Set<AlgorithmKey>([
    'logistic_regression', 'xgboost', 'lightgbm', 'random_forest', 'ridge', 'mlp',
  ]);

  /** True when `v` is one of the six algorithm driver keys the suite trains with. */
  public static IsAlgorithmKey(v: string): v is AlgorithmKey {
    return HarnessModels.algorithmKeys.has(v);
  }

  /** A stored metrics JSON as name → finite number; keys whose value is not a finite number are dropped. */
  private static parseMetrics(raw: string | null | undefined): ModelMetrics {
    if (!raw) return {};
    const parsed = SafeJSONParse<ModelMetrics>(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ModelMetrics = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
      }
    }
    return out;
  }

  /** The locked-holdout row count the training engine recorded in the model's lineage, or null when absent. */
  private static parseHoldoutRowCount(lineageRaw: string | null | undefined): number | null {
    if (!lineageRaw) return null;
    const count = SafeJSONParse<TrainingLineageCounts>(lineageRaw)?.lockedHoldoutRowCount;
    return typeof count === 'number' && Number.isFinite(count) ? count : null;
  }

  private static toCandidateModel(
    m: MJMLModelEntity,
    run: TrainingRunRow | undefined,
    algosByID: UUIDMap<AlgorithmRow>,
  ): CandidateModel {
    const algoDriver = algosByID.Get(m.AlgorithmID)?.DriverClass || m.AlgorithmID;
    if (!HarnessModels.IsAlgorithmKey(algoDriver)) {
      throw new Error(`ML Model ${m.ID} uses algorithm '${algoDriver}', which is not one of the suite's algorithm keys`);
    }
    return {
      ModelID: m.ID,
      PipelineID: m.PipelineID,
      Algorithm: algoDriver,
      Status: m.Status,
      TrainingRowCount: m.TrainingRowCount,
      HoldoutRowCount: HarnessModels.parseHoldoutRowCount(m.Lineage),
      Metrics: HarnessModels.parseMetrics(m.Metrics),
      HoldoutMetrics: HarnessModels.parseMetrics(m.HoldoutMetrics),
      Trust: TrustVerdicts.DeriveTrustVerdict(m),
      TrainingRunStatus: run?.Status ?? null,
      TrainingRunNotes: run?.Notes ?? null,
      LineageJSON: m.Lineage ?? null,
      ValidationResultsJSON: run?.ValidationResults ?? null,
    };
  }

  /** Escape a string for a SQL Server `LIKE '<prefix>%'` filter (escapes `[`, `%`, `_` with bracket classes and `'` via `EscapeSQLString`). */
  public static EscapeLikePrefix(prefix: string): string {
    const likeEscaped = prefix.replace(/[[%_]/g, (ch) => `[${ch}]`);
    return EscapeSQLString(likeEscaped);
  }

  /** Read one `MJ: ML Models` row and its training run into a `CandidateModel`. */
  public static async ReadModel(ctx: RunContext, modelId: string): Promise<CandidateModel> {
    const m = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
    if (!(await m.Load(modelId))) {
      throw new Error(`ML Model ${modelId} not found`);
    }
    const runsRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<TrainingRunRow>(
      {
        EntityName: 'MJ: ML Training Runs',
        ExtraFilter: `ResultingModelID='${EscapeSQLString(modelId)}'`,
        ResultType: 'simple',
        Fields: ['Status', 'Notes', 'ValidationResults'],
        BypassCache: true,
      },
      ctx.User,
    );
    if (!runsRes.Success) throw new Error(`read training run for ${modelId}: ${runsRes.ErrorMessage}`);
    return HarnessModels.toCandidateModel(m, runsRes.Results[0], IndexByUUID(ctx.Algorithms));
  }

  /** Read all `CandidateModel`s trained under pipelines whose `Name` starts with `prefix`. */
  public static async ModelsForPipelineNamePrefix(ctx: RunContext, prefix: string): Promise<CandidateModel[]> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const pipeRes = await rv.RunView<{ ID: string }>(
      {
        EntityName: 'MJ: ML Training Pipelines',
        ExtraFilter: `Name LIKE '${HarnessModels.EscapeLikePrefix(prefix)}%'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
      },
      ctx.User,
    );
    if (!pipeRes.Success) throw new Error(`read pipelines by prefix: ${pipeRes.ErrorMessage}`);
    if (pipeRes.Results.length === 0) return [];

    const inList = pipeRes.Results.map((p) => `'${EscapeSQLString(p.ID)}'`).join(',');
    const [modelsRes, runsRes] = await Promise.all([
      rv.RunView<MJMLModelEntity>(
        {
          EntityName: 'MJ: ML Models',
          ExtraFilter: `PipelineID IN (${inList})`,
          OrderBy: 'TrainedAt',
          ResultType: 'entity_object',
          BypassCache: true,
        },
        ctx.User,
      ),
      rv.RunView<TrainingRunRow & Pick<MJMLTrainingRunEntity, 'ResultingModelID'>>(
        {
          EntityName: 'MJ: ML Training Runs',
          ExtraFilter: `PipelineID IN (${inList})`,
          ResultType: 'simple',
          // ResultingModelID as well: it keys the runs to their models.
          Fields: ['ResultingModelID', 'Status', 'Notes', 'ValidationResults'],
          BypassCache: true,
        },
        ctx.User,
      ),
    ]);
    if (!modelsRes.Success) throw new Error(`read models: ${modelsRes.ErrorMessage}`);
    if (!runsRes.Success) throw new Error(`read runs: ${runsRes.ErrorMessage}`);

    const runsByModelID = IndexByUUID(runsRes.Results, (r) => r.ResultingModelID);
    const algosByID = IndexByUUID(ctx.Algorithms);
    return modelsRes.Results.map((m) => HarnessModels.toCandidateModel(m, runsByModelID.Get(m.ID), algosByID));
  }

  /** Promote a model via `PredictiveStudio.PromoteModel` and return whether it transitioned and its status after. */
  public static async Promote(
    ctx: RunContext,
    modelId: string,
    target: PredictiveStudioModelTargetStatus,
    reason: string,
  ): Promise<PromoteAttempt> {
    const r = await new PredictiveStudioPromoteModelOperation().Execute(
      { modelId, targetStatus: target, reason },
      { provider: ctx.Provider, user: ctx.User },
    );
    // A promotion that applied leaves the model at the target status (the operation's documented contract); any other
    // outcome reads the status from the model itself, so the status always comes from a typed source.
    if (r.Success && r.Output?.promoted) {
      return { Promoted: true, Status: target };
    }
    const m = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
    if (!(await m.Load(modelId))) {
      throw new Error(`ML Model ${modelId} not found after Promote: ${r.ErrorMessage || 'no message'}`);
    }
    return {
      Promoted: false,
      Status: m.Status,
    };
  }
}
