import { describe, it, expect } from 'vitest';
import { BaseEntityResult } from '@memberjunction/core';
import { TRAINING_RUN_RESULTS_SCHEMA, type MetricWithInterval, type StoredTrainerResult, type TrainingRunResults } from '@memberjunction/predictive-studio-core';
import {
  HarnessCleanup, RunRecords, type CleanupFileRow, type CleanupModelRow, type CleanupPredictionUnitRow, type CleanupRecordProcessRow, type CleanupRow,
  type CleanupSnapshotRow, type CleanupStore, type CleanupTrainingRunRow,
} from '../cleanup';

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
const TS1 = '22222222-0000-0000-0000-000000000001'; // the snapshot RUN-1 trained on
const TS2 = '22222222-0000-0000-0000-000000000002'; // a snapshot of P1 no remaining run references
const fileOf = (snapshot: string, n: number): string => `${snapshot}-file-${n}`; // each snapshot's three file IDs
const EP1 = '33333333-0000-0000-0000-000000000001'; // an Evaluation Protocol the run saved
const TF_GLM = '44444444-0000-0000-0000-000000000001'; // a trainer run's member artifact file (not a model's)
const RUN_UUID = '55555555-0000-0000-0000-000000000001';

/** A completed protocol-bound run's stored results naming its finalist's file (F1, also the model's) and a member's. */
function trainerResults(): string {
  const mwi = (metric: MetricWithInterval['metric'], value: number): MetricWithInterval => ({ metric, value, interval: { level: 0.95, lower: value - 0.01, upper: value + 0.01 }, n: 100 });
  const artifact = (candidate: string, fileId: string) => ({ candidate, sha256: 'a'.repeat(64), featureSchemaHash: 'f'.repeat(64), classOrder: ['0', '1'], fileId });
  const trainer: StoredTrainerResult = {
    status: 'completed', trainingRunId: RUN_UUID, computeSeconds: 1,
    codeVersion: { psGitSha: 'abc', sidecarVersion: '6.2.0', libraryVersions: { python: '3.11' }, threads: 1, seed: 0 },
    innerScores: [], finalist: 'xgb', holdoutAccess: { accessedAt: '2026-10-12T00:00:00.000Z', count: 1, finalist: 'xgb' },
    holdout: { primary: mwi('log-loss', 0.45), secondary: [] }, baselines: [], comparisons: {},
    gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
    artifacts: [artifact('xgb', F1), artifact('glm', TF_GLM)],
    incumbentDiff: null, calibration: null, slices: [], operatingPoint: null,
    cost: { computeSeconds: 1, tokens: 0, usd: 0, budget: { maxComputeSeconds: 60, maxTokens: 0, maxCandidates: 1, hardStop: true }, stoppedByBudget: false },
    importance: [], leakageFlags: [], predictionIntervalCoverage: [], residualDiagnostics: null, forecast: null, innerSplitContrast: null,
  };
  const results: TrainingRunResults = {
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 1, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 1, dataCutoff: '2026-01-01' },
    legacy: null, legacyRequest: null, trainer, trainerRequest: null,
  };
  return JSON.stringify(results);
}

/** What the fake store holds besides the fixed rows: RUN-1's snapshot, the snapshots it answers, failing object deletes. */
interface FakeStoreOptions {
  readonly RunSnapshotID?: string | null;
  readonly RunValidationResults?: string | null;
  readonly Snapshots?: readonly string[];
  readonly FailObjects?: ReadonlySet<string>;
  readonly ThrowObjects?: ReadonlySet<string>;
}

/** A fake store: answers from fixed rows, records each filter and every delete in order. */
class FakeStore implements CleanupStore {
  public readonly Filters: string[] = [];
  public readonly Deleted: string[] = [];
  constructor(private readonly fail: ReadonlySet<string> = new Set(), private readonly options: FakeStoreOptions = {}) {}
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
  public async TrainingRuns(filter: string): Promise<CleanupTrainingRunRow[]> {
    this.Filters.push(`MJ: ML Training Runs | ${filter}`);
    return [{ ...this.row('MJ: ML Training Runs', 'RUN-1'), TrainingSnapshotID: this.options.RunSnapshotID ?? null, ValidationResults: this.options.RunValidationResults ?? null }];
  }
  public async TrainingSnapshots(filter: string): Promise<CleanupSnapshotRow[]> {
    this.Filters.push(`MJ: Training Snapshots | ${filter}`);
    return (this.options.Snapshots || []).map((id) => ({ ...this.row('MJ: Training Snapshots', id), MatrixFileID: fileOf(id, 1), RowManifestFileID: fileOf(id, 2), ProvenanceFileID: fileOf(id, 3) }));
  }
  public async Files(filter: string): Promise<CleanupFileRow[]> {
    this.Filters.push(`MJ: Files | ${filter}`);
    const ids = [...filter.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    return ids.map((id) => ({ ...this.row('MJ: Files', id), ProviderID: 'provider-local', ProviderKey: `key/${id}` }));
  }
  public async DeleteStoredObject(file: CleanupFileRow): Promise<string | null> {
    if (this.options.FailObjects?.has(file.ID)) return 'the storage root is not writable';
    if (this.options.ThrowObjects?.has(file.ID)) throw new Error('no driver registered for "Local File System Storage"');
    this.Deleted.push(`object:${file.ProviderKey}`);
    return null;
  }
  public async Rows(entityName: string, filter: string): Promise<CleanupRow[]> {
    this.Filters.push(`${entityName} | ${filter}`);
    if (entityName === 'MJ: ML Training Pipelines') return [this.row(entityName, P1), this.row(entityName, AGENT_P)];
    if (entityName === 'MJ: Process Runs') return [this.row(entityName, PR1)];
    if (entityName === 'MJ: Process Run Details') return [this.row(entityName, 'DETAIL-1')];
    if (entityName === 'MJ: Record Process Watermarks') return [];
    if (entityName === 'MJ: Files') return [...filter.matchAll(/'([^']+)'/g)].map((m) => this.row(entityName, m[1]));
    if (entityName === 'MJ: Evaluation Protocols') return [this.row(entityName, EP1)];
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
      `MJ: Training Snapshots | PipelineID IN ('${P1}','${AGENT_P}')`,
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

  it("deletes the runs' and the pipelines' Training Snapshots after the runs, then each snapshot's stored objects and file rows", async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    records.RecordPredictionUnit(U1);
    const store = new FakeStore(new Set(), { RunSnapshotID: TS1, Snapshots: [TS1, TS2] });
    expect(await HarnessCleanup.DeleteRecorded(store, records)).toEqual([]);
    expect(store.Filters).toContain(`MJ: Training Snapshots | ID IN ('${TS1}') OR PipelineID IN ('${P1}','${AGENT_P}')`);
    const files = [TS1, TS2].flatMap((s) => [1, 2, 3].map((n) => fileOf(s, n)));
    expect(store.Filters).toContain(`MJ: Files | ID IN (${files.map((f) => `'${f}'`).join(',')})`);
    const at = (entry: string): number => store.Deleted.indexOf(entry);
    expect(at('MJ: ML Training Runs:RUN-1')).toBeLessThan(at(`MJ: Training Snapshots:${TS1}`));
    for (const f of files) {
      expect(at(`MJ: Training Snapshots:${TS2}`)).toBeLessThan(at(`object:key/${f}`));
      expect(at(`object:key/${f}`)).toBeLessThan(at(`MJ: Files:${f}`));
      expect(at(`MJ: Files:${f}`)).toBeLessThan(at(`MJ: ML Training Pipelines:${P1}`));
    }
    expect(at(`MJ: ML Training Pipelines:${AGENT_P}`)).toBeLessThan(at(`MJ: Prediction Units:${U1}`));
  });

  it("keeps a snapshot's files when its row survives, and a file's row when its stored object survives, reporting both", async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    const store = new FakeStore(new Set([TS1]), { Snapshots: [TS1, TS2], FailObjects: new Set([fileOf(TS2, 1)]), ThrowObjects: new Set([fileOf(TS2, 3)]) });
    const failures = await HarnessCleanup.DeleteRecorded(store, records);
    expect(failures).toEqual([
      `MJ: Training Snapshots ${TS1}: ${TS1} is still referenced`,
      `stored object of MJ: Files ${fileOf(TS2, 1)} (key/${fileOf(TS2, 1)}): the storage root is not writable`,
      `stored object of MJ: Files ${fileOf(TS2, 3)} (key/${fileOf(TS2, 3)}): no driver registered for "Local File System Storage"`,
    ]);
    expect(store.Deleted).toContain(`MJ: ML Training Pipelines:${P1}`); // a failed object delete never stops the rest of cleanup
    expect(store.Deleted.filter((d) => d.includes(TS1))).toEqual([]);
    expect(store.Deleted).not.toContain(`MJ: Files:${fileOf(TS2, 1)}`);
    expect(store.Deleted).toContain(`MJ: Files:${fileOf(TS2, 2)}`);
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

  it("deletes every artifact file a run's stored trainer result names, the model's and its members'", async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    records.RecordModel(M1);
    const store = new FakeStore(new Set(), { RunValidationResults: trainerResults() });
    expect(await HarnessCleanup.DeleteRecorded(store, records)).toEqual([]);
    expect(store.Filters).toContain(`MJ: Files | ID IN ('${F1}','${TF_GLM}')`);
    expect(store.Deleted).toContain(`MJ: Files:${TF_GLM}`);
    expect(store.Deleted.indexOf('MJ: ML Training Runs:RUN-1')).toBeLessThan(store.Deleted.indexOf(`MJ: Files:${TF_GLM}`));
  });

  it('reports a run whose results envelope does not parse, naming the run, and still deletes the rest', async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    const unreadable = JSON.stringify({ ...JSON.parse(trainerResults()), trainer: { finalist: 'xgb', artifacts: [{ fileId: TF_GLM }] } });
    const store = new FakeStore(new Set(), { RunValidationResults: unreadable });
    const failures = await HarnessCleanup.DeleteRecorded(store, records);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^MJ: ML Training Runs RUN-1: its results envelope does not parse, so the artifact files it names cannot be found: .*trainer\./);
    expect(store.Deleted).toContain(`MJ: ML Training Pipelines:${P1}`);
  });

  it('reads no artifact files from a run whose results are not a results envelope (a legacy run)', async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    const store = new FakeStore(new Set(), { RunValidationResults: JSON.stringify({ metrics: { auc: 0.7 } }) });
    expect(await HarnessCleanup.DeleteRecorded(store, records)).toEqual([]);
  });

  it('deletes recorded Evaluation Protocols after the pipelines and before the Prediction Units', async () => {
    const records = new RunRecords();
    records.RecordPipeline(P1);
    records.RecordPredictionUnit(U1);
    records.RecordEvaluationProtocol(EP1);
    const store = new FakeStore();
    expect(await HarnessCleanup.DeleteRecorded(store, records)).toEqual([]);
    expect(store.Filters).toContain(`MJ: Evaluation Protocols | ID IN ('${EP1}')`);
    const at = (entry: string): number => store.Deleted.indexOf(entry);
    expect(at(`MJ: ML Training Pipelines:${P1}`)).toBeLessThan(at(`MJ: Evaluation Protocols:${EP1}`));
    expect(at(`MJ: Evaluation Protocols:${EP1}`)).toBeLessThan(at(`MJ: Prediction Units:${U1}`));
    expect(records.EvaluationProtocolIDs.Size).toBe(0);
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
