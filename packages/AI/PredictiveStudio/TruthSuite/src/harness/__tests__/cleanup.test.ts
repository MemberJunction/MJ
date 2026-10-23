import { describe, it, expect } from 'vitest';
import { BaseEntityResult } from '@memberjunction/core';
import { HarnessCleanup, RunRecords, type CleanupModelRow, type CleanupRow, type CleanupStore } from '../cleanup';

const P1 = 'aaaaaaaa-0000-0000-0000-000000000001'; // lower case: UUIDSet normalises IDs to lower case
const M1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const M2 = 'bbbbbbbb-0000-0000-0000-000000000002'; // trained from P1, never recorded itself
const AGENT_P = 'aaaaaaaa-0000-0000-0000-000000000002'; // the pipeline of an observed agent-built model

/** A fake store: answers from fixed rows, records each filter and every delete in order. */
class FakeStore implements CleanupStore {
  public readonly Filters: string[] = [];
  public readonly Deleted: string[] = [];
  constructor(private readonly fail: ReadonlySet<string> = new Set()) {}
  private row(entity: string, id: string): CleanupRow {
    return {
      ID: id,
      LatestResult: new BaseEntityResult(false, `${id} is still referenced`, 'delete'),
      Delete: async () => {
        if (this.fail.has(id)) return false;
        this.Deleted.push(`${entity}:${id}`);
        return true;
      },
    };
  }
  public async Models(filter: string): Promise<CleanupModelRow[]> {
    this.Filters.push(`MJ: ML Models | ${filter}`);
    return [{ ...this.row('MJ: ML Models', M1), PipelineID: AGENT_P }, { ...this.row('MJ: ML Models', M2), PipelineID: P1 }];
  }
  public async Rows(entityName: string, filter: string): Promise<CleanupRow[]> {
    this.Filters.push(`${entityName} | ${filter}`);
    if (entityName === 'MJ: ML Training Pipelines') return [this.row(entityName, P1), this.row(entityName, AGENT_P)];
    if (entityName === 'MJ: ML Training Runs') return [this.row(entityName, 'RUN-1')];
    return [this.row(entityName, 'BINDING-1')];
  }
}

describe('HarnessCleanup.DeleteRecorded', () => {
  it('targets only the recorded IDs (no name matching) and deletes children first', async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    records.RecordModel(M1);
    const store = new FakeStore();
    expect(await HarnessCleanup.DeleteRecorded(store, records)).toEqual([]);
    expect(store.Filters).toEqual([
      `MJ: ML Models | ID IN ('${M1}') OR PipelineID IN ('${P1}')`,
      `MJ: ML Model Scoring Bindings | MLModelID IN ('${M1}','${M2}')`,
      `MJ: ML Training Runs | PipelineID IN ('${P1}','${AGENT_P}') OR ResultingModelID IN ('${M1}','${M2}')`,
      `MJ: ML Training Pipelines | ID IN ('${P1}','${AGENT_P}')`,
    ]);
    expect(store.Filters.join(' ')).not.toMatch(/LIKE/i);
    expect(store.Deleted).toEqual([
      'MJ: ML Model Scoring Bindings:BINDING-1', 'MJ: ML Training Runs:RUN-1',
      `MJ: ML Models:${M1}`, `MJ: ML Models:${M2}`, `MJ: ML Training Pipelines:${P1}`, `MJ: ML Training Pipelines:${AGENT_P}`,
    ]);
    expect(records.ModelIDs.Size + records.PipelineIDs.Size).toBe(0);
  });

  it('reads nothing when nothing was recorded', async () => {
    const store = new FakeStore();
    expect(await HarnessCleanup.DeleteRecorded(store, new RunRecords())).toEqual([]);
    expect(store.Filters).toEqual([]);
  });

  it('reports every failed delete and keeps its ID recorded', async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    const failures = await HarnessCleanup.DeleteRecorded(new FakeStore(new Set([P1])), records);
    expect(failures).toEqual([`MJ: ML Training Pipelines ${P1}: ${P1} is still referenced`]);
    expect(records.PipelineIDs.Has(P1)).toBe(true);
  });
});
