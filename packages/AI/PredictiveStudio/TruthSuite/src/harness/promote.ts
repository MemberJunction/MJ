import { RunView } from '@memberjunction/core';
import {
  type MJMLModelEntity,
  type MJMLTrainingRunEntity,
  PredictiveStudioPromoteModelOperation,
  type PredictiveStudioModelTargetStatus,
} from '@memberjunction/core-entities';
import { IndexByUUID, SafeJSONParse, type UUIDMap } from '@memberjunction/global';
import { TrustVerdicts } from '@memberjunction/predictive-studio-core';
import type { AlgorithmRow } from './pipelines';
import type { RunContext } from './run-fixtures';
import type { AlgorithmKey, CandidateModel, PromoteAttempt } from './types';

function parseMetricsObject(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  const parsed = SafeJSONParse<Record<string, unknown>>(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function parseHoldoutRowCount(lineageRaw: string | null | undefined): number | null {
  if (!lineageRaw) return null;
  const parsed = SafeJSONParse<{ lockedHoldoutRowCount?: unknown }>(lineageRaw);
  const count = parsed?.lockedHoldoutRowCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : null;
}

/** Model read-back and lifecycle promotion wrappers for the truth harness. */
export class HarnessModels {
  private static toCandidateModel(
    m: MJMLModelEntity,
    run: MJMLTrainingRunEntity | undefined,
    algosByID: UUIDMap<AlgorithmRow>,
  ): CandidateModel {
    const algoDriver = algosByID.Get(m.AlgorithmID)?.DriverClass || m.AlgorithmID;
    return {
      ModelID: m.ID,
      PipelineID: m.PipelineID,
      Algorithm: algoDriver as AlgorithmKey,
      Status: m.Status,
      TrainingRowCount: m.TrainingRowCount,
      HoldoutRowCount: parseHoldoutRowCount(m.Lineage),
      Metrics: parseMetricsObject(m.Metrics),
      HoldoutMetrics: parseMetricsObject(m.HoldoutMetrics),
      Trust: TrustVerdicts.DeriveTrustVerdict(m),
      TrainingRunStatus: run?.Status ?? null,
      TrainingRunNotes: run?.Notes ?? null,
      LineageJSON: m.Lineage ?? null,
      ValidationResultsJSON: run?.ValidationResults ?? null,
    };
  }

  /** Read one `MJ: ML Models` row and its training run into a `CandidateModel`. */
  public static async ReadModel(ctx: RunContext, modelId: string): Promise<CandidateModel> {
    const m = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
    if (!(await m.Load(modelId))) {
      throw new Error(`ML Model ${modelId} not found`);
    }
    const runsRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJMLTrainingRunEntity>(
      {
        EntityName: 'MJ: ML Training Runs',
        ExtraFilter: `ResultingModelID='${modelId.replace(/'/g, "''")}'`,
        ResultType: 'entity_object',
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
        ExtraFilter: `Name LIKE '${prefix.replace(/'/g, "''")}%'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
      },
      ctx.User,
    );
    if (!pipeRes.Success) throw new Error(`read pipelines by prefix: ${pipeRes.ErrorMessage}`);
    if (pipeRes.Results.length === 0) return [];

    const inList = pipeRes.Results.map((p) => `'${p.ID.replace(/'/g, "''")}'`).join(',');
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
      rv.RunView<MJMLTrainingRunEntity>(
        {
          EntityName: 'MJ: ML Training Runs',
          ExtraFilter: `PipelineID IN (${inList})`,
          ResultType: 'entity_object',
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
    if (r.Success && r.Output) {
      return {
        Promoted: r.Output.promoted,
        Status: r.Output.status as MJMLModelEntity['Status'],
      };
    }
    const m = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
    if (!(await m.Load(modelId))) {
      throw new Error(`ML Model ${modelId} not found after failed Promote: ${r.ErrorMessage || 'no message'}`);
    }
    return {
      Promoted: false,
      Status: m.Status,
    };
  }
}
