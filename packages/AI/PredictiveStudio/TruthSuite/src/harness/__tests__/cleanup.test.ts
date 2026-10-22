import { describe, it, expect } from 'vitest';
import type { BaseEntity, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { HarnessCleanup } from '../cleanup';

function makeFakeEntity(entityName: string, id: string, deletedLog: string[], shouldThrow = false): BaseEntity {
  return {
    ID: id,
    LatestResult: { CompleteMessage: 'failed' },
    Delete: async (): Promise<boolean> => {
      if (shouldThrow) throw new Error(`delete failed for ${id}`);
      deletedLog.push(`${entityName}:${id}`);
      return true;
    },
  } as unknown as BaseEntity;
}

describe('HarnessCleanup.TeardownPrefix', () => {
  it('deletes PSTruth: fixtures in child-to-parent FK-safe order and never throws on errors', async () => {
    const deletedLog: string[] = [];
    const entitiesByTable: Record<string, BaseEntity[]> = {
      'MJ: Record Processes': [makeFakeEntity('MJ: Record Processes', 'rp-1', deletedLog)],
      'MJ: ML Training Pipelines': [makeFakeEntity('MJ: ML Training Pipelines', 'pipe-1', deletedLog)],
      'MJ: Process Runs': [makeFakeEntity('MJ: Process Runs', 'pr-1', deletedLog)],
      'MJ: Process Run Details': [
        makeFakeEntity('MJ: Process Run Details', 'prd-1', deletedLog),
        makeFakeEntity('MJ: Process Run Details', 'prd-boom', deletedLog, true),
      ],
      'MJ: Record Process Watermarks': [makeFakeEntity('MJ: Record Process Watermarks', 'wm-1', deletedLog)],
      'MJ: ML Models': [makeFakeEntity('MJ: ML Models', 'model-1', deletedLog)],
      'MJ: ML Model Scoring Bindings': [makeFakeEntity('MJ: ML Model Scoring Bindings', 'bind-1', deletedLog)],
      'MJ: ML Training Runs': [makeFakeEntity('MJ: ML Training Runs', 'tr-1', deletedLog)],
    };

    const seenFilters: string[] = [];
    const provider = {
      RunView: async (params: RunViewParams): Promise<RunViewResult<BaseEntity>> => {
        if (params.ExtraFilter) seenFilters.push(params.ExtraFilter);
        return {
          Success: true,
          Results: entitiesByTable[params.EntityName] || [],
          RowCount: (entitiesByTable[params.EntityName] || []).length,
          TotalRowCount: (entitiesByTable[params.EntityName] || []).length,
          ExecutionTime: 1,
          ErrorMessage: '',
          UserViewRunID: '',
        };
      },
    } as unknown as IMetadataProvider;

    const summary = await HarnessCleanup.TeardownPrefix(provider, { ID: 'u-1' } as unknown as UserInfo, 'PSTruth:');
    expect(seenFilters[0]).toBe("Name LIKE 'PSTruth:%'");
    for (const f of seenFilters) {
      expect(f).not.toContain('\\');
    }
    expect(deletedLog).toEqual([
      'MJ: Process Run Details:prd-1',
      'MJ: Process Runs:pr-1',
      'MJ: Record Process Watermarks:wm-1',
      'MJ: ML Model Scoring Bindings:bind-1',
      'MJ: Record Processes:rp-1',
      'MJ: ML Training Runs:tr-1',
      'MJ: ML Models:model-1',
      'MJ: ML Training Pipelines:pipe-1',
    ]);
    expect(summary.PipelinesDeleted).toBe(1);
    expect(summary.ModelsDeleted).toBe(1);
    expect(summary.TrainingRunsDeleted).toBe(1);
    expect(summary.ScoringBindingsDeleted).toBe(1);
    expect(summary.RecordProcessesDeleted).toBe(1);
    expect(summary.ProcessRunsDeleted).toBe(1);
    expect(summary.ProcessRunDetailsDeleted).toBe(1);
    expect(summary.WatermarksDeleted).toBe(1);
    expect(summary.Warnings).toHaveLength(1);
    expect(summary.Warnings[0]).toMatch(/delete failed for prd-boom/);
  });
});
