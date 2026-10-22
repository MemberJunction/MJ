import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BaseEntity, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJProcessRunDetailEntity,
  MJProcessRunEntity,
  MJRecordProcessEntity,
  MJRecordProcessWatermarkEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import { MJAPIConnection } from './connect';
import { HarnessModels } from './promote';

const IN_CHUNK_SIZE = 100;

type EntityWithID = BaseEntity & { ID: string };

export interface CleanupSummary {
  ProcessRunDetailsDeleted: number;
  ProcessRunsDeleted: number;
  WatermarksDeleted: number;
  ScoringBindingsDeleted: number;
  RecordProcessesDeleted: number;
  TrainingRunsDeleted: number;
  ModelsDeleted: number;
  PipelinesDeleted: number;
  Warnings: string[];
}

function chunkIds(ids: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    out.push(ids.slice(i, i + IN_CHUNK_SIZE));
  }
  return out;
}

function deduplicateById<T extends { ID: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = NormalizeUUID(row.ID);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/** Prefix-keyed best-effort fixture teardown for the truth harness (never throws). */
export class HarnessCleanup {
  private static async loadByFilter<T extends EntityWithID>(
    rv: RunView,
    user: UserInfo,
    entityName: string,
    extraFilter: string,
    warnings: string[],
  ): Promise<T[]> {
    try {
      const res = await rv.RunView<T>(
        {
          EntityName: entityName,
          ExtraFilter: extraFilter,
          ResultType: 'entity_object',
          IgnoreMaxRows: true,
          BypassCache: true,
        },
        user,
      );
      if (!res.Success) {
        warnings.push(`${entityName} query failed: ${res.ErrorMessage || 'RunView returned Success=false'}`);
        return [];
      }
      return res.Results || [];
    } catch (e) {
      warnings.push(`${entityName} query threw: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  private static async loadByColumnIn<T extends EntityWithID>(
    rv: RunView,
    user: UserInfo,
    entityName: string,
    column: string,
    ids: readonly string[],
    warnings: string[],
  ): Promise<T[]> {
    if (ids.length === 0) return [];
    const chunks = chunkIds(ids);
    const batches = await Promise.all(
      chunks.map((chunk) => {
        const list = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        return HarnessCleanup.loadByFilter<T>(rv, user, entityName, `${column} IN (${list})`, warnings);
      }),
    );
    return deduplicateById(batches.flat());
  }

  private static async deleteEntities<T extends EntityWithID>(
    entityName: string,
    entities: readonly T[],
    warnings: string[],
  ): Promise<number> {
    let deleted = 0;
    for (const entity of entities) {
      try {
        const ok = await entity.Delete();
        if (ok) {
          deleted += 1;
        } else {
          warnings.push(
            `${entityName} ${entity.ID} delete returned false: ${entity.LatestResult?.CompleteMessage || 'no message'}`,
          );
        }
      } catch (e) {
        warnings.push(`${entityName} ${entity.ID} delete threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return deleted;
  }

  /**
   * Best-effort delete of all `PSTruth:` fixtures in FK-safe order:
   * Process Run Details → Process Runs → Record Process Watermarks → ML Model Scoring Bindings →
   * Record Processes → ML Training Runs → ML Models → ML Training Pipelines. Never throws.
   */
  public static async TeardownPrefix(
    provider: IMetadataProvider,
    user: UserInfo,
    prefix = 'PSTruth:',
  ): Promise<CleanupSummary> {
    const summary: CleanupSummary = {
      ProcessRunDetailsDeleted: 0,
      ProcessRunsDeleted: 0,
      WatermarksDeleted: 0,
      ScoringBindingsDeleted: 0,
      RecordProcessesDeleted: 0,
      TrainingRunsDeleted: 0,
      ModelsDeleted: 0,
      PipelinesDeleted: 0,
      Warnings: [],
    };

    try {
      const rv = RunView.FromMetadataProvider(provider);
      const likeFilter = `Name LIKE '${HarnessModels.EscapeLikePrefix(prefix)}%'`;

      const [recordProcesses, pipelines] = await Promise.all([
        HarnessCleanup.loadByFilter<MJRecordProcessEntity>(
          rv,
          user,
          'MJ: Record Processes',
          likeFilter,
          summary.Warnings,
        ),
        HarnessCleanup.loadByFilter<MJMLTrainingPipelineEntity>(
          rv,
          user,
          'MJ: ML Training Pipelines',
          likeFilter,
          summary.Warnings,
        ),
      ]);

      const rpIds = recordProcesses.map((rp) => rp.ID);
      const pipelineIds = pipelines.map((p) => p.ID);

      const processRuns = await HarnessCleanup.loadByColumnIn<MJProcessRunEntity>(
        rv,
        user,
        'MJ: Process Runs',
        'RecordProcessID',
        rpIds,
        summary.Warnings,
      );
      const processRunIds = processRuns.map((pr) => pr.ID);

      const processRunDetails = await HarnessCleanup.loadByColumnIn<MJProcessRunDetailEntity>(
        rv,
        user,
        'MJ: Process Run Details',
        'ProcessRunID',
        processRunIds,
        summary.Warnings,
      );
      summary.ProcessRunDetailsDeleted = await HarnessCleanup.deleteEntities(
        'MJ: Process Run Details',
        processRunDetails,
        summary.Warnings,
      );
      summary.ProcessRunsDeleted = await HarnessCleanup.deleteEntities(
        'MJ: Process Runs',
        processRuns,
        summary.Warnings,
      );

      const watermarks = await HarnessCleanup.loadByColumnIn<MJRecordProcessWatermarkEntity>(
        rv,
        user,
        'MJ: Record Process Watermarks',
        'RecordProcessID',
        rpIds,
        summary.Warnings,
      );
      summary.WatermarksDeleted = await HarnessCleanup.deleteEntities(
        'MJ: Record Process Watermarks',
        watermarks,
        summary.Warnings,
      );

      const models = await HarnessCleanup.loadByColumnIn<MJMLModelEntity>(
        rv,
        user,
        'MJ: ML Models',
        'PipelineID',
        pipelineIds,
        summary.Warnings,
      );
      const modelIds = models.map((m) => m.ID);

      const [bindingsByRp, bindingsByModel] = await Promise.all([
        HarnessCleanup.loadByColumnIn<MJMLModelScoringBindingEntity>(
          rv,
          user,
          'MJ: ML Model Scoring Bindings',
          'RecordProcessID',
          rpIds,
          summary.Warnings,
        ),
        HarnessCleanup.loadByColumnIn<MJMLModelScoringBindingEntity>(
          rv,
          user,
          'MJ: ML Model Scoring Bindings',
          'MLModelID',
          modelIds,
          summary.Warnings,
        ),
      ]);
      const bindings = deduplicateById([...bindingsByRp, ...bindingsByModel]);
      summary.ScoringBindingsDeleted = await HarnessCleanup.deleteEntities(
        'MJ: ML Model Scoring Bindings',
        bindings,
        summary.Warnings,
      );

      summary.RecordProcessesDeleted = await HarnessCleanup.deleteEntities(
        'MJ: Record Processes',
        recordProcesses,
        summary.Warnings,
      );

      const [runsByPipeline, runsByModel] = await Promise.all([
        HarnessCleanup.loadByColumnIn<MJMLTrainingRunEntity>(
          rv,
          user,
          'MJ: ML Training Runs',
          'PipelineID',
          pipelineIds,
          summary.Warnings,
        ),
        HarnessCleanup.loadByColumnIn<MJMLTrainingRunEntity>(
          rv,
          user,
          'MJ: ML Training Runs',
          'ResultingModelID',
          modelIds,
          summary.Warnings,
        ),
      ]);
      const trainingRuns = deduplicateById([...runsByPipeline, ...runsByModel]);
      summary.TrainingRunsDeleted = await HarnessCleanup.deleteEntities(
        'MJ: ML Training Runs',
        trainingRuns,
        summary.Warnings,
      );

      summary.ModelsDeleted = await HarnessCleanup.deleteEntities('MJ: ML Models', models, summary.Warnings);
      summary.PipelinesDeleted = await HarnessCleanup.deleteEntities(
        'MJ: ML Training Pipelines',
        pipelines,
        summary.Warnings,
      );
    } catch (e) {
      summary.Warnings.push(`TeardownPrefix unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    }

    return summary;
  }

  /** CLI entry point for `pnpm run truth:clean [-- --prefix <prefix>]`. Never throws or exits non-zero. */
  public static async RunCli(rawArgs: readonly string[] = process.argv.slice(2)): Promise<void> {
    try {
      const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
      const { values } = parseArgs({
        args: [...args],
        options: {
          prefix: { type: 'string', default: 'PSTruth:' },
        },
      });
      const prefix = values.prefix || 'PSTruth:';
      const { Provider: provider, User: user } = await MJAPIConnection.Connect();
      const s = await HarnessCleanup.TeardownPrefix(provider, user, prefix);
      for (const warning of s.Warnings) {
        console.warn(`truth:clean warning: ${warning}`);
      }
      console.log(
        `truth:clean (${prefix}): deleted ${s.PipelinesDeleted} pipeline(s), ${s.ModelsDeleted} model(s), ` +
          `${s.TrainingRunsDeleted} training run(s), ${s.ScoringBindingsDeleted} binding(s), ` +
          `${s.RecordProcessesDeleted} record process(es), ${s.ProcessRunsDeleted} process run(s), ` +
          `${s.ProcessRunDetailsDeleted} run detail(s), ${s.WatermarksDeleted} watermark(s)` +
          (s.Warnings.length > 0 ? ` (${s.Warnings.length} warning(s))` : ''),
      );
    } catch (e) {
      console.warn(`truth:clean skipped (best-effort): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await HarnessCleanup.RunCli();
}
