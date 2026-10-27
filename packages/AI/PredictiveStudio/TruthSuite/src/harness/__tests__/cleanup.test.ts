import { describe, it, expect } from 'vitest';
import { BaseEntityResult } from '@memberjunction/core';
import { HarnessCleanup, RunRecords, type CleanupModelRow, type CleanupPredictionUnitRow, type CleanupRecordProcessRow, type CleanupRow, type CleanupStore } from '../cleanup';

const P1 = 'aaaaaaaa-0000-0000-0000-000000000001'; // lower case: UUIDSet normalises IDs to lower case
const M1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const M2 = 'bbbbbbbb-0000-0000-0000-000000000002'; // trained from P1, never recorded itself
const AGENT_P = 'aaaaaaaa-0000-0000-0000-000000000002'; // the pipeline of an observed agent-built model
const F1 = 'cccccccc-0000-0000-0000-000000000001'; // M1's artifact file
const RP1 = 'dddddddd-0000-0000-0000-000000000001'; // M2's scoring Record Process
const RP_OTHER = 'dddddddd-0000-0000-0000-000000000002'; // another model's process: never touched
const PR1 = 'eeeeeeee-0000-0000-0000-000000000001'; // RP1's process run
const U1 = '11111111-0000-0000-0000-000000000001'; // a unit's lineage root (Version 1)
const U2 = '11111111-0000-0000-0000-000000000002'; // its Version 2
const U3 = '11111111-0000-0000-0000-000000000003'; // its Version 3

/** A fake store: answers from fixed rows, records each filter and every delete in order. */
class FakeStore implements CleanupStore {
  public readonly Filters: string[] = [];
  public readonly Deleted: string[] = [];
  constructor(private readonly fail: ReadonlySet<string> = new Set()) {}
  /** A row whose ID reads empty once deleted, as a deleted entity object's fields do. */
  private row(entity: string, id: string, pipelineId = '', artifactFileId: string | null = null): CleanupModelRow & CleanupRecordProcessRow {
    let deleted = false;
    return {
      get ID(): string { return deleted ? '' : id; },
      PipelineID: pipelineId,
      ArtifactFileID: artifactFileId,
      Configuration: null,
      LatestResult: new BaseEntityResult(false, `${id} is still referenced`, 'delete'),
      Delete: async () => {
        if (this.fail.has(id)) return false;
        this.Deleted.push(`${entity}:${id}`);
        deleted = true;
        return true;
      },
    };
  }
  public async Models(filter: string): Promise<CleanupModelRow[]> {
    this.Filters.push(`MJ: ML Models | ${filter}`);
    return [this.row('MJ: ML Models', M1, AGENT_P, F1), this.row('MJ: ML Models', M2, P1)];
  }
  public async PredictionUnits(filter: string): Promise<CleanupPredictionUnitRow[]> {
    this.Filters.push(`MJ: Prediction Units | ${filter}`);
    return [{ ...this.row('MJ: Prediction Units', U1), Version: 1 }, { ...this.row('MJ: Prediction Units', U3), Version: 3 }, { ...this.row('MJ: Prediction Units', U2), Version: 2 }];
  }
  public async RecordProcesses(filter: string): Promise<CleanupRecordProcessRow[]> {
    this.Filters.push(`MJ: Record Processes | ${filter}`);
    const process = (id: string, modelId: string): CleanupRecordProcessRow => ({ ...this.row('MJ: Record Processes', id), Configuration: JSON.stringify({ modelId: modelId.toUpperCase() }) });
    return [process(RP1, M2), process(RP_OTHER, 'ffffffff-0000-0000-0000-000000000009')];
  }
  public async Rows(entityName: string, filter: string): Promise<CleanupRow[]> {
    this.Filters.push(`${entityName} | ${filter}`);
    if (entityName === 'MJ: ML Training Pipelines') return [this.row(entityName, P1), this.row(entityName, AGENT_P)];
    if (entityName === 'MJ: ML Training Runs') return [this.row(entityName, 'RUN-1')];
    if (entityName === 'MJ: Process Runs') return [this.row(entityName, PR1)];
    if (entityName === 'MJ: Process Run Details') return [this.row(entityName, 'DETAIL-1')];
    if (entityName === 'MJ: Record Process Watermarks') return [];
    if (entityName === 'MJ: Files') return [this.row(entityName, F1)];
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
      `MJ: Record Processes | WorkType = 'ML Model'`,
      `MJ: Process Runs | RecordProcessID IN ('${RP1}')`,
      `MJ: ML Model Scoring Bindings | MLModelID IN ('${M1}','${M2}')`,
      `MJ: Process Run Details | ProcessRunID IN ('${PR1}')`,
      `MJ: Record Process Watermarks | RecordProcessID IN ('${RP1}')`,
      `MJ: ML Training Runs | PipelineID IN ('${P1}','${AGENT_P}') OR ResultingModelID IN ('${M1}','${M2}')`,
      `MJ: Files | ID IN ('${F1}')`,
      `MJ: ML Training Pipelines | ID IN ('${P1}','${AGENT_P}')`,
    ]);
    expect(store.Filters.join(' ')).not.toMatch(/LIKE/i);
    expect(store.Deleted).toEqual([
      'MJ: ML Model Scoring Bindings:BINDING-1', 'MJ: Process Run Details:DETAIL-1', `MJ: Process Runs:${PR1}`,
      `MJ: Record Processes:${RP1}`, 'MJ: ML Training Runs:RUN-1',
      `MJ: ML Models:${M1}`, `MJ: ML Models:${M2}`, `MJ: Files:${F1}`, `MJ: ML Training Pipelines:${P1}`, `MJ: ML Training Pipelines:${AGENT_P}`,
    ]);
    expect(store.Deleted.join(' ')).not.toContain(RP_OTHER);
    expect(records.ModelIDs.Size + records.PipelineIDs.Size).toBe(0);
  });

  it('reads nothing when nothing was recorded', async () => {
    const store = new FakeStore();
    expect(await HarnessCleanup.DeleteRecorded(store, new RunRecords())).toEqual([]);
    expect(store.Filters).toEqual([]);
  });

  it('deletes recorded Prediction Units after the pipelines, newest Version first', async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    for (const id of [U1, U2, U3]) records.RecordPredictionUnit(id);
    const store = new FakeStore();
    expect(await HarnessCleanup.DeleteRecorded(store, records)).toEqual([]);
    expect(store.Filters[store.Filters.length - 1]).toBe(`MJ: Prediction Units | ID IN ('${U1}','${U2}','${U3}')`);
    expect(store.Deleted.slice(-4)).toEqual([`MJ: ML Training Pipelines:${AGENT_P}`, `MJ: Prediction Units:${U3}`, `MJ: Prediction Units:${U2}`, `MJ: Prediction Units:${U1}`]);
    expect(records.PredictionUnitIDs.Size).toBe(0);
  });

  it('reports every failed delete and keeps its ID recorded', async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    const failures = await HarnessCleanup.DeleteRecorded(new FakeStore(new Set([P1])), records);
    expect(failures).toEqual([`MJ: ML Training Pipelines ${P1}: ${P1} is still referenced`]);
    expect(records.PipelineIDs.Has(P1)).toBe(true);
  });
});

describe('RunRecords.RecordAgentRun', () => {
  it("records a failed run's pipelines even though it built no model", () => {
    const records = new RunRecords();
    records.RecordAgentRun({ PipelineIDs: [P1, AGENT_P], BuildModelID: null });
    expect([...records.PipelineIDs].sort()).toEqual([P1, AGENT_P].sort());
    expect(records.ModelIDs.Size).toBe(0);
  });
  it("records a successful run's pipeline and model", () => {
    const records = new RunRecords();
    records.RecordAgentRun({ PipelineIDs: [AGENT_P], BuildModelID: M1 });
    expect([...records.PipelineIDs]).toEqual([AGENT_P]);
    expect([...records.ModelIDs]).toEqual([M1]);
  });
});

describe('RunRecords.RecordObservedModels (a name-prefix read only observes)', () => {
  const OTHER_P = 'aaaaaaaa-0000-0000-0000-000000000003'; // a pipeline the LIKE read matched but this run never recorded
  const OTHER_M = 'bbbbbbbb-0000-0000-0000-000000000003';

  it('records a model only when its pipeline was already recorded, and never records a pipeline', () => {
    const records = new RunRecords();
    records.RecordAgentRun({ PipelineIDs: [AGENT_P], BuildModelID: null });
    records.RecordObservedModels([
      { ModelID: M1, PipelineID: AGENT_P.toUpperCase() }, // SQL Server spelling of a recorded pipeline
      { ModelID: OTHER_M, PipelineID: OTHER_P },
    ]);
    expect([...records.ModelIDs]).toEqual([M1]);
    expect([...records.PipelineIDs]).toEqual([AGENT_P]);
  });

  it('records nothing when no pipeline was recorded', () => {
    const records = new RunRecords();
    records.RecordObservedModels([{ ModelID: OTHER_M, PipelineID: OTHER_P }]);
    expect(records.ModelIDs.Size + records.PipelineIDs.Size).toBe(0);
  });

  it('so cleanup never reads or deletes by an unrecorded pipeline', async () => {
    const records = new RunRecords();
    records.RecordObservedModels([{ ModelID: OTHER_M, PipelineID: OTHER_P }]);
    const store = new FakeStore();
    expect(await HarnessCleanup.DeleteRecorded(store, records)).toEqual([]);
    expect(store.Deleted).toEqual([]);
  });
});

describe('RunRecords.RecordAgentPipelineNames', () => {
  it('keeps each agent pipeline name once, for cleanup to look up again', () => {
    const records = new RunRecords();
    records.RecordAgentPipelineNames(['PSTruth: G0.12 W7 s42 r', 'PSTruth: G0.12 W7 s42 r (xgboost)']);
    records.RecordAgentPipelineNames(['PSTruth: G0.12 W7 s42 r']);
    expect(records.AgentPipelineNames).toEqual(['PSTruth: G0.12 W7 s42 r', 'PSTruth: G0.12 W7 s42 r (xgboost)']);
  });
});
