import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import {
  EvaluationLineage,
  EvaluationProtocol,
  InvalidMajorityBaselineRuleError,
  TrainingRunResultsParser,
  TrustVerdicts,
  type EvaluationProtocolSpec,
  type TrainingRunResults,
  type TrainResponse,
  type MatrixData,
  type FeatureStepGraph,
  type AsOfStrategy,
  type ValidationStrategy,
} from '@memberjunction/predictive-studio-core';

import { TrainerResultMalformedError } from '@memberjunction/predictive-studio-sidecar';
import { TrainingEngine } from '../training-engine';
import { TrainingRefusedError } from '../training-refusal';
import { SnapshotRetrainer } from '../../snapshot/snapshot-retrainer';
import { InMemoryArtifactStore } from '../artifact-store';
import { ProtocolRowFixture } from './fixtures/protocol-row';
import { TrainerResultFixtures } from './fixtures/trainer-result';
import { DEFAULT_SPLIT_SEED } from '../locked-holdout';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import type {
  IFeatureDataAccess,
  FetchRowsParams,
  FetchRowsResult,
  SourceRow,
} from '../../feature-assembly';
import { MLModelInferenceProcessor } from '../../scoring/ml-model-inference-processor';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import type { MLInferenceDeps } from '../../scoring/types';
import type { RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import {
  FakeEntityFactory,
  FakeEvaluationProtocolStore,
  FakeMLModel,
  FakeMLPipeline,
  FakeSidecar,
  FakeTrainer,
  FakeTrainingSnapshot,
  buildDeps,
  cleanResponse,
  fakeProvider,
  fakeUser,
  unitHarness,
} from '../../__tests__/fakes/training-fakes';
import type { InMemorySnapshotFileStore } from '../../snapshot/snapshot-file-store';
import { SnapshotFiles, type SnapshotContent } from '../../snapshot/snapshot-serialization';

/**
 * Unit tests for the TrainingEngine. NO live DB, NO live sidecar — every seam is
 * an in-memory fake. These tests prove the orchestration flow (plan §3 / §4.3 /
 * §4.4 / §8.2 / §6.4 / §11): the assembled matrix → carved locked holdout →
 * correctly-shaped TrainRequest → immutable Draft ML Model + Completed Training
 * Run, leakage-dominance handling, and Save-failure surfacing. The fakes are shared
 * (`__tests__/fakes/training-fakes`).
 */

// No compute rate unless a test sets one, whatever the shell exports: an unpriced run records a NULL cost.
beforeEach(() => {
  vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** In-memory feature data access backing the assembler (no DB); records every read so tests can check its ORDER BY. */
class InMemoryDataAccess implements IFeatureDataAccess {
  public readonly Reads: FetchRowsParams[] = [];
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    this.Reads.push(params);
    const rows = this.rowsByEntity[params.EntityName];
    return rows
      ? { Success: true, Rows: rows, TotalRowCount: rows.length }
      : { Success: false, Rows: [], TotalRowCount: 0, ErrorMessage: `no fixture ${params.EntityName}` };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

/** 10 synthetic member rows for a classification pipeline. */
function syntheticMembers(): SourceRow[] {
  const rows: SourceRow[] = [];
  for (let i = 0; i < 10; i++) {
    rows.push({
      ID: `m${i}`,
      tenure: i + 1,
      events_at_signup: (i % 3) + 1,
      city: i % 2 === 0 ? 'NYC' : 'LA',
      Renewed: i % 2,
    });
  }
  return rows;
}



/** Build a TrainingEngine wired to an assembler over the given member rows. */
function buildEngine(dataAccess: InMemoryDataAccess = new InMemoryDataAccess({ Members: syntheticMembers() })): TrainingEngine {
  // Inject the data-access into the assembler by wrapping assemble defaults:
  // FeatureAssemblyExecutor reads dataAccess from params, so we pass it via a
  // subclass that always supplies our in-memory access.
  class TestAssembler extends FeatureAssemblyExecutor {
    public override assemble(params: Parameters<FeatureAssemblyExecutor['assemble']>[0]) {
      return super.assemble({ ...params, dataAccess });
    }
  }
  return new TrainingEngine(new TestAssembler());
}


describe('TrainingEngine.trainModel — happy path', () => {
  it('produces a Draft ML Model + Completed Training Run with a correctly-shaped TrainRequest', async () => {
    const engine = buildEngine();
    const { deps, factory, sidecar, store } = buildDeps();

    const { model, run } = await engine.trainModel({ pipelineId: 'pipe-1', sidecarVersion: 'sidecar-1.0' }, deps);

    // --- Model is an immutable Draft with all the payloads (§4.3) ---
    expect(model.Status).toBe('Draft');
    expect(model.Version).toBe(5); // from FakeRecordLoader.nextModelVersion
    expect(model.PipelineID).toBe('pipe-1');
    expect(model.AlgorithmID).toBe('algo-xgb');
    expect(model.TargetVariable).toBe('Renewed');
    expect(model.ProblemType).toBe('classification');
    expect(JSON.parse(model.FittedPreprocessing!)).toEqual(cleanResponse.fitted_preprocessing);
    expect(JSON.parse(model.Metrics!)).toEqual(cleanResponse.metrics);
    expect(JSON.parse(model.HoldoutMetrics!)).toEqual(cleanResponse.holdout_metrics);
    expect(JSON.parse(model.FeatureImportance!)).toEqual(cleanResponse.feature_importance);
    // FeatureSchema = select cols (city stays a single raw col — preprocessing not applied)
    expect(JSON.parse(model.FeatureSchema!).map((s: { Name: string }) => s.Name)).toEqual([
      'tenure',
      'events_at_signup',
      'city',
    ]);
    // Lineage provenance present
    const lineage = JSON.parse(model.Lineage!);
    expect(lineage.pipelineId).toBe('pipe-1');
    expect(lineage.sidecarVersion).toBe('sidecar-1.0');
    expect(model.ArtifactFileID).toBeTruthy();

    // --- Artifact persisted to the (in-memory) store ---
    expect(store.Saved.size).toBe(1);
    const savedFile = store.Saved.get(model.ArtifactFileID!);
    expect(savedFile?.Name).toBe('model-pipe-1-v5.bin');
    expect(Buffer.from(savedFile!.Bytes).toString()).toBe('fake-model-bytes');

    // --- Run points at the model, Completed, no dominance note ---
    expect(run.Status).toBe('Completed');
    expect(run.ResultingModelID).toBe(model.ID);
    expect(run.PipelineID).toBe('pipe-1');
    expect(run.StartedAt).toBeInstanceOf(Date);
    expect(run.CompletedAt).toBeInstanceOf(Date);
    expect(JSON.parse(run.FeaturesUsed!)).toEqual(['tenure', 'events_at_signup', 'city']);
    expect(run.Notes).toContain('No single-feature dominance');
    expect(run.ComputeSeconds).toBe(cleanResponse.duration_sec); // real compute, never 0
    expect(run.ComputeCost).toBeNull(); // no PS_COMPUTE_USD_PER_SECOND rate in unit tests: cost unknown

    // --- TrainRequest shape: preprocessing ops present, holdout fraction respected ---
    const req = sidecar.LastRequest!;
    expect(req.algorithm).toBe('xgboost');
    expect(req.problem_type).toBe('classification');
    expect(req.target).toBe('Renewed');
    expect(req.hyperparameters).toEqual({ max_depth: 4 });
    // The split seed is sent explicitly so the sidecar's splits share the locked-holdout carve's seed.
    expect(req.validation).toEqual({ strategy: 'train_test_split', test_size: 0.2, k: undefined, random_state: DEFAULT_SPLIT_SEED });
    // preprocessing ops carried through (impute/standardize/onehot)
    expect(req.preprocessing).toEqual([
      { op: 'impute', col: 'tenure', strategy: 'mean', fillValue: undefined },
      { op: 'standardize', cols: ['tenure', 'events_at_signup'] },
      { op: 'onehot', col: 'city' },
    ]);
    // 10 rows, 20% locked holdout → 8 train / 2 holdout
    expect(req.data!.rows.length).toBe(8);
    expect(sidecar.LastHoldout!.rows.length).toBe(2);
    // both factories used exactly once
    expect(factory.Models.length).toBe(1);
    expect(factory.Runs.length).toBe(1);
  });
});

describe('TrainingEngine.trainModel — locked holdout (§8.2)', () => {
  it('excludes the locked holdout from the training data and scores it once into HoldoutMetrics', async () => {
    const engine = buildEngine();
    const { deps, sidecar } = buildDeps();

    const { model } = await engine.trainModel({ pipelineId: 'pipe-1' }, deps);

    // Training data and holdout are disjoint and together cover all 10 rows.
    const trainRows = sidecar.LastRequest!.data!.rows;
    const holdoutRows = sidecar.LastHoldout!.rows;
    expect(trainRows.length + holdoutRows.length).toBe(10);

    // The holdout rows are DISJOINT from training (synthetic `tenure` is unique per row) — the holdout never leaks
    // into train — and the seeded stratified carve keeps both Renewed classes in the 2-row holdout.
    const trainTenures = new Set(trainRows.map((r) => r[0]));
    for (const hr of holdoutRows) {
      expect(trainTenures.has(hr[0])).toBe(false);
    }
    expect(trainRows.length).toBe(8);
    expect(holdoutRows.length).toBe(2);
    const renewedIdx = sidecar.LastHoldout!.columns.indexOf('Renewed');
    expect(new Set(holdoutRows.map((r) => r[renewedIdx]))).toEqual(new Set([0, 1]));

    // HoldoutMetrics scored exactly once (from the single sidecar response).
    expect(JSON.parse(model.HoldoutMetrics!)).toEqual({ auc: 0.79 });
    expect(sidecar.LastHoldout).not.toBeNull();
  });
});

describe('TrainingEngine.trainModel — leakage dominance (§6.4)', () => {
  it('flags dominance, keeps the model Draft, and writes a plain-language note — never auto-promotes', async () => {
    const leaky: TrainResponse = {
      ...cleanResponse,
      feature_importance: { cancelled_flag: 0.92, tenure: 0.05, city: 0.03 },
    };
    const engine = buildEngine();
    const { deps } = buildDeps({ response: leaky });

    const { model, run } = await engine.trainModel({ pipelineId: 'pipe-1' }, deps);

    expect(model.Status).toBe('Draft'); // never auto-promoted
    expect(run.Status).toBe('Completed');
    expect(run.Notes).toContain('LEAKAGE WARNING');
    expect(run.Notes).toContain('cancelled_flag');
    expect(run.Notes).toContain('Draft');
  });
});

describe('TrainingEngine.trainModel — failures', () => {
  it('surfaces the Save-failure CompleteMessage when the model fails to save', async () => {
    const engine = buildEngine();
    const factory = new FakeEntityFactory(() => {
      const m = new FakeMLModel('model-x');
      m.failNextSaveWith('FK violation on PipelineID');
      return m;
    });
    const { deps } = buildDeps({ entityFactory: factory });

    await expect(engine.trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toThrow(/FK violation on PipelineID/);
    // The run was created (Running) then marked Failed by the catch path.
    expect(factory.Runs[0].Status).toBe('Failed');
    expect(factory.Runs[0].Notes).toContain('Training failed');
  });

  it('throws when the pipeline is not found', async () => {
    const engine = buildEngine();
    const { deps } = buildDeps({ pipeline: null });
    await expect(engine.trainModel({ pipelineId: 'missing' }, deps)).rejects.toThrow(/not found/);
  });
});

describe('TrainingEngine.trainModel — experiment session iteration linkage (§4.4)', () => {
  it('hangs the run off an ExperimentSessionIteration when provided', async () => {
    const engine = buildEngine();
    const { deps, factory } = buildDeps();
    await engine.trainModel({ pipelineId: 'pipe-1', experimentSessionIterationId: 'iter-7' }, deps);
    expect(factory.Runs[0].ExperimentSessionIterationID).toBe('iter-7');
  });
});

describe('TrainingEngine.trainModel — a legacy pipeline with a point-in-time as-of strategy is refused', () => {
  const pointInTime: ReadonlyArray<AsOfStrategy> = [{ Mode: 'column', Column: 'StartDate' }, { Mode: 'offset', OffsetDays: 30 }];
  for (const asOf of pointInTime) {
    it(`refuses AsOfStrategy.Mode='${asOf.Mode}' with unit-required, records it on the run, and never calls the sidecar`, async () => {
      const pipeline = new FakeMLPipeline();
      pipeline.AsOfStrategy = JSON.stringify(asOf);
      const { deps, factory, sidecar } = buildDeps({ pipeline });
      await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toMatchObject({
        name: 'TrainingRefusedError',
        Refusal: { stage: 'pipeline', reason: { kind: 'unit-required', pipelineId: 'pipe-1' } },
      });
      expect(factory.Runs).toHaveLength(1);
      expect(factory.Runs[0].Status).toBe('Failed');
      expect(JSON.parse(factory.Runs[0].ValidationResults!)).toMatchObject({ status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'unit-required' } } });
      expect(factory.Models).toHaveLength(0);
      expect(sidecar.LastRequest).toBeNull();
    });
  }

  it("still trains Mode='none'", async () => {
    const { deps } = buildDeps();
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(model.Status).toBe('Draft');
  });

  it("trains a stored AsOfStrategy of {} as Mode='none'", async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.AsOfStrategy = '{}';
    const { deps } = buildDeps({ pipeline });
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(model.Status).toBe('Draft');
    expect(JSON.parse(model.Lineage!).asOfStrategy).toEqual({ Mode: 'none' });
  });
});

describe('TrainingEngine — evaluation record and the time-index containment (T4 → S6.5, F-SCN-1)', () => {
  it('stores an out-of-sample evaluation record with no withheld reason by default', async () => {
    const { deps } = buildDeps();
    const { model, run } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(EvaluationLineage.Read(model.Lineage)).toEqual({ ValidationOutOfSample: true, TimeIndexColumn: null, WithheldReason: null, MajorityBaselineRule: 'enforce', ImportanceKind: 'split_or_impurity' });
    expect(run.Notes).not.toContain('Trust withheld');
  });

  it("records the pipeline's majority-baseline rule in Lineage.evaluation (D2-C5d)", async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'warn' });
    const { deps } = buildDeps({ pipeline });
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(EvaluationLineage.Read(model.Lineage)?.MajorityBaselineRule).toBe('warn');
  });

  it('refuses an unknown majority-baseline rule before any row is written', async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'off' });
    const { deps, factory, sidecar } = buildDeps({ pipeline });
    await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toBeInstanceOf(InvalidMajorityBaselineRuleError);
    expect(factory.Runs).toHaveLength(0);
    expect(factory.Models).toHaveLength(0);
    expect(sidecar.LastRequest).toBeNull();
  });

  it('withholds trust for a pipeline that declares a time index, and stores the reason on the model and the run', async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
    const { deps } = buildDeps({ pipeline });
    const { model, run } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(EvaluationLineage.Read(model.Lineage)?.WithheldReason).toBe(EvaluationLineage.NotEvaluatedAsForecast);
    expect(run.Notes).toContain('Trust withheld — not evaluated as a forecast');
    expect(TrustVerdicts.DeriveTrustVerdict(model)).toMatchObject({ grade: 'Poor', canAct: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast });
  });

  it('records ValidationOutOfSample=false when the sidecar response does not confirm out-of-sample scoring', async () => {
    const legacySidecarResponse: TrainResponse = { ...cleanResponse, validation_out_of_sample: undefined };
    const { deps } = buildDeps({ response: legacySidecarResponse });
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(EvaluationLineage.Read(model.Lineage)?.ValidationOutOfSample).toBe(false);
  });
});

describe('TrainingEngine — deterministic training read and locked holdout (I1)', () => {
  it("orders the target read by the entity's primary key, with or without maxRows", async () => {
    for (const maxRows of [undefined, 1000]) {
      const dataAccess = new InMemoryDataAccess({ Members: syntheticMembers() });
      const { deps } = buildDeps();
      await buildEngine(dataAccess).trainModel({ pipelineId: 'pipe-1', maxRows }, deps);
      expect(dataAccess.Reads[0]).toMatchObject({ EntityName: 'Members', OrderBy: 'ID', MaxRows: maxRows });
    }
  });

  it('refuses before reading when the target entity has no primary key in metadata', async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.TargetEntity = 'Unknown Entity';
    const { deps } = buildDeps({ pipeline });
    await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toThrow(/no primary key/);
  });

  it('holds out the same rows on every run of the same data', async () => {
    const first = buildDeps();
    const second = buildDeps();
    await buildEngine().trainModel({ pipelineId: 'pipe-1' }, first.deps);
    await buildEngine().trainModel({ pipelineId: 'pipe-1' }, second.deps);
    expect(second.sidecar.LastHoldout!.rows).toEqual(first.sidecar.LastHoldout!.rows);
  });

  it('writes the locked holdout class counts into the model Lineage next to lockedHoldoutRowCount', async () => {
    const { deps } = buildDeps();
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    const lineage = JSON.parse(model.Lineage!);
    expect(lineage.lockedHoldoutRowCount).toBe(2);
    expect(lineage.lockedHoldoutClassCounts).toEqual({ '0': 1, '1': 1 });
  });

  it('writes empty locked holdout class counts for a regression model', async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.ProblemType = 'regression';
    const { deps } = buildDeps({ pipeline });
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(JSON.parse(model.Lineage!).lockedHoldoutClassCounts).toEqual({});
  });
});


/** The stored snapshot's content, read back from the in-memory file store. */
async function storedContent(files: InMemorySnapshotFileStore, s: FakeTrainingSnapshot): Promise<SnapshotContent> {
  return SnapshotFiles.ParseSnapshotFiles(await files.Get(s.MatrixFileID), await files.Get(s.RowManifestFileID), await files.Get(s.ProvenanceFileID));
}

/** The snapshot rows of one manifest role, cut to the columns the trainer is sent (feature-schema columns, then the label). */
function rowsOfRole(content: SnapshotContent, role: SnapshotContent['Manifest'][number]['role']): MatrixData {
  const columns = [...content.Header.featureSchema.map((f) => f.Name), content.Header.labelColumn];
  const at = columns.map((c) => content.Header.columns.indexOf(c));
  const rows = content.Rows.filter((_r, i) => content.Manifest[i].role === role).map((r) => at.map((k) => r[k] ?? null));
  return { columns, rows };
}

/** Every matrix row the sidecar saw (training data and the locked holdout), as column → value. */
function sentRows(sidecar: FakeSidecar): Array<Record<string, string | number | boolean | null>> {
  const out: Array<Record<string, string | number | boolean | null>> = [];
  for (const m of [sidecar.LastRequest?.data, sidecar.LastHoldout]) {
    if (!m) continue;
    for (const r of m.rows) out.push(Object.fromEntries(m.columns.map((c, i) => [c, r[i] ?? null])));
  }
  return out;
}

describe('TrainingEngine — Prediction Unit pipelines', () => {
  const years = UnitYearsWorld.Years();
  const unitColumns = UnitYearsWorld.UnitColumns();

  it('excludes the unresolved 2026 cycle, stores the counts, and records the unit in the model lineage', async () => {
    const { engine, deps, sidecar, pipeline } = unitHarness(years, unitColumns);
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const data = sidecar.LastRequest?.data ?? { columns: [], rows: [] };
    const labelIdx = data.columns.indexOf('__ps_label');
    expect(data.rows.length + (sidecar.LastHoldout?.rows.length ?? 0)).toBe(8);   // 2024 + 2025 only
    expect(data.rows.every((r) => r[labelIdx] === '0' || r[labelIdx] === '1')).toBe(true);
    const results = JSON.parse(run.ValidationResults!);
    expect(results.schema).toBe('ps-run-results/v2');
    expect(results.unitResolution).toMatchObject({ rowsRead: 12, censoredRowsExcluded: 4, resolvedRows: 8, dataCutoff: '2026-01-01' });
    expect(JSON.parse(model.Lineage!)).toMatchObject({ predictionUnitId: 'U-1', predictionUnitVersion: 1, labelVersion: 1, unitRowEntity: 'Years' });
  });

  it('reads an updatable field of another entity as of each decision date, and stores the feature spec and levels in the lineage', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const { engine, deps, sidecar, pipeline, models } = unitHarness(years, unitColumns, steps);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const sent = sentRows(sidecar);
    expect(sent).toHaveLength(8);
    const statusOf = (person: number, cycle: number) => sent.find((r) => r.EventsAttended === UnitYearsWorld.EventsAttended(person, cycle))?.Status;
    // The lapsed person's stored Status is Lapsed, but on the 2024 decision date it was still Active.
    expect(statusOf(2, 2024)).toBe('Active');
    expect(statusOf(2, 2025)).toBe('Lapsed');
    for (const p of [0, 1, 3]) for (const c of [2024, 2025]) expect(statusOf(p, c)).toBe('Active');
    const lineage = JSON.parse(models[0].Lineage!);
    expect(lineage.featureSpec.map((f: { name: string }) => f.name)).toEqual(['EventsAttended', 'Status']);
    expect(lineage.categoryLevels).toEqual({ Status: ['Active', 'Lapsed'] });
  });

  it('refuses a text column declared numeric at the assembly stage, naming the column, before calling the sidecar', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended', 'Region'], Encodings: { Region: 'numeric' } }] };
    const { engine, deps, sidecar, pipeline, runs, models } = unitHarness(years, unitColumns, steps);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'assembly', reason: { kind: 'non-numeric-in-numeric-column', column: 'Region' } } });
    expect(sidecar.CallCount).toBe(0);
    expect(models).toHaveLength(0);
    const results = JSON.parse(runs[0].ValidationResults!);
    expect(results.refusal.stage).toBe('assembly');
    expect(results.refusal.reason.kind).toBe('non-numeric-in-numeric-column');
  });

  it('assembles the same matrix on its own (pipeline ID and deps only) as the training run sends', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const { engine, deps, pipeline } = unitHarness(years, unitColumns, steps);
    const assembly = await engine.AssembleForTraining(pipeline.ID, deps);
    expect(assembly.Assembled.Status).toBe('assembled');
    if (assembly.Assembled.Status !== 'assembled') return;
    expect(assembly.Unit.id).toBe('U-1');
    expect(assembly.Features.map((f) => f.name)).toEqual(['EventsAttended', 'Status']);
    expect(assembly.UnitRead.Rows).toHaveLength(8);
    const byId = new Map(assembly.Assembled.Rows.map((r) => [r.RowId, r.Values]));
    expect(byId.get('y2024-2')).toEqual([UnitYearsWorld.EventsAttended(2, 2024), 'Active']);
    expect(byId.get('y2025-2')).toEqual([UnitYearsWorld.EventsAttended(2, 2025), 'Lapsed']);
  });

  it('round-trips the stored lineage: the scoring path reads back what training wrote and assembles the same values', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const { engine, deps, pipeline, models } = unitHarness(years, unitColumns, steps);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const trained = models[0];
    trained.Status = 'Validated';
    trained.ArtifactFileID = 'file-1';
    const artifacts = new InMemoryArtifactLoader();
    artifacts.set('file-1', new TextEncoder().encode('model-bytes'));
    const scoringDeps: MLInferenceDeps = {
      // The model row training wrote (it carries the pipeline ID), read back as scoring loads it: one deliberate
      // test-double cast at the seam, as this file's entity factory does (a field-bag fake is not a BaseEntity).
      modelLoader: { loadModel: async () => trained as unknown as MJMLModelEntity },
      artifactLoader: artifacts,
      sidecar: { predict: async () => ({ predictions: [] }) },
      pipelineUnits: { PredictionUnitIDOf: async (id: string) => (id === pipeline.ID ? UnitYearsWorld.UnitID : null) },
      predictionUnits: deps.predictionUnits,
      assemblyMetadata: deps.assemblyMetadata,
      dataAccess: deps.dataAccess,
    };
    const context: RecordProcessorContext = { ContextUser: fakeUser, Provider: fakeProvider };
    const scored = await new MLModelInferenceProcessor({ modelId: trained.ID, deps: scoringDeps }).AssembleForScoring([{ ID: 'y2024-2' }, { ID: 'y2025-2' }], context, 'unit-rule');
    const training = await engine.AssembleForTraining(pipeline.ID, deps);
    expect(scored.Status).toBe('assembled');
    if (scored.Status !== 'assembled' || training.Assembled.Status !== 'assembled') return;
    const byId = new Map(training.Assembled.Rows.map((r) => [r.RowId, r.Values]));
    expect(scored.Rows.map((r) => r.Values)).toEqual([byId.get('y2024-2'), byId.get('y2025-2')]);
    expect(scored.Rows[0].Values[1]).toBe('Active');
  });

  it('refuses a one-class target before calling the sidecar and records the refusal on the run', async () => {
    const { engine, deps, sidecar, pipeline, runs } = unitHarness(years.filter((y) => y.Renewed === true), { ...unitColumns, Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2030-01-01' } }) });
    // Typed: the refusal is identified by its structured fields, never by the message text.
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ name: 'TrainingRefusedError', Refusal: { stage: 'unit', reason: { kind: 'single-valued-target' } } });
    expect(sidecar.CallCount).toBe(0);
    const run = runs[0];
    expect(run.Status).toBe('Failed');
    expect(JSON.parse(run.ValidationResults!)).toMatchObject({ status: 'refused', refusal: { stage: 'unit', reason: { kind: 'single-valued-target', value: '1' } } });
  });

  it('refuses maxRows for a unit pipeline (a capped read is not a complete read)', async () => {
    const { engine, deps, pipeline } = unitHarness(years, unitColumns);
    await expect(engine.trainModel({ pipelineId: pipeline.ID, maxRows: 5 }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'maxRows' } } });
  });

  it('refuses an as-of strategy for a unit pipeline before calling the sidecar (decision dates come from the unit)', async () => {
    const { engine, deps, sidecar, pipeline } = unitHarness(years, unitColumns);
    pipeline.AsOfStrategy = JSON.stringify({ Mode: 'column', Column: 'StartDate' } satisfies AsOfStrategy);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf' } } });
    expect(sidecar.CallCount).toBe(0);
  });

  it("records the sidecar's measured seconds as the run's compute, unpriced when no rate is configured", async () => {
    const { engine, deps, pipeline } = unitHarness(years, unitColumns);
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(run.Status).toBe('Completed');
    expect(run.ComputeSeconds).toBe(cleanResponse.duration_sec); // real compute, never 0
    expect(run.ComputeCost).toBeNull();
  });

  it("copies the pipeline's EvaluationProtocolID onto the run and trains it through the trainer", async () => {
    const { engine, deps, sidecar, pipeline, runs } = protocolHarness((r) => TrainerResultFixtures.CannedCompleted(r.trainingRunId, protocolSpec()));
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(runs[0].EvaluationProtocolID).toBe(ProtocolRowFixture.ID);
    expect(sidecar.CallCount).toBe(0);
  });

  it('freezes the unit rows into one Training Snapshot and trains from its development and locked-holdout rows', async () => {
    const { engine, deps, sidecar, pipeline, runs, models, snapshots, files } = unitHarness(years, unitColumns);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(snapshots).toHaveLength(1);
    const s = snapshots[0];
    expect([s.ManifestRowCount, s.CensoredRowsExcluded]).toEqual([8, 4]);
    expect(runs[0].TrainingSnapshotID).toBe(s.ID);
    expect(JSON.parse(models[0].Lineage!)).toMatchObject({ trainingSnapshotId: s.ID, snapshotContentHash: s.ContentHash });
    const content = await storedContent(files, s);
    const holdout = rowsOfRole(content, 'locked-holdout');
    expect(holdout.rows.length).toBe(s.HoldoutRowCount);
    expect(holdout.rows.length).toBeGreaterThan(0);
    expect(sidecar.LastRequest?.data).toEqual(rowsOfRole(content, 'development'));
    expect(sidecar.LastHoldout).toEqual(holdout);
    const results = JSON.parse(runs[0].ValidationResults!);
    expect(results.legacyRequest).toMatchObject({ algorithm: 'xgboost', problemType: 'classification', hyperparameters: { max_depth: 4 } });
    expect(results.legacy).toMatchObject({ trainingRowCount: 8 - s.HoldoutRowCount, holdoutRowCount: s.HoldoutRowCount });
  });

  it('reuses the snapshot for a second training of identical data: one snapshot row, two runs pointing at it', async () => {
    const { engine, deps, pipeline, runs, snapshots, files, snapshotStore } = unitHarness(years, unitColumns);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const objectsAfterFirst = files.Saved.size;
    expect(snapshotStore.ReusedLookups).toBe(0);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(files.Saved.size).toBe(objectsAfterFirst); // the second training wrote no files
    expect(snapshotStore.ReusedLookups).toBe(1); // it found the saved snapshot and reused it
    expect(snapshots).toHaveLength(1);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.TrainingSnapshotID)).toEqual([snapshots[0].ID, snapshots[0].ID]);
  });

  it('refuses to train a unit pipeline without a snapshot file store, before calling the sidecar', async () => {
    const { engine, deps, sidecar, pipeline, snapshots, runs } = unitHarness(years, unitColumns);
    delete deps.snapshotFiles;
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(/snapshot file store/);
    expect(sidecar.CallCount).toBe(0);
    expect(snapshots).toHaveLength(0);
    expect(runs[0].Status).toBe('Failed');
    expect(runs[0].Notes).toMatch(/^Training failed: .*training deps are incomplete.*snapshot file store/);
  });

  it("records on the run the same hyperparameters the trainer was sent (a column that is not a JSON object sends none)", async () => {
    const { engine, deps, sidecar, pipeline, runs } = unitHarness(years, unitColumns);
    pipeline.Hyperparameters = JSON.stringify([3, 4]);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const results = JSON.parse(runs[0].ValidationResults!);
    expect(sidecar.LastRequest?.hyperparameters).toEqual({});
    expect(results.legacyRequest.hyperparameters).toEqual({});
    expect(JSON.parse(runs[0].Hyperparameters!)).toEqual(results.legacyRequest.hyperparameters);
  });

  it('refuses labelEventDates for a unit pipeline (decision dates come from the unit)', async () => {
    const { engine, deps, pipeline } = unitHarness(years, unitColumns);
    await expect(engine.trainModel({ pipelineId: pipeline.ID, labelEventDates: { p0: new Date('2024-01-01T00:00:00Z') } }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'labelEventDates' } } });
  });
});

/** A 36-character run ID: the trainer contract's run IDs are database UUIDs. */
const TRAINER_RUN_ID = '00000000-0000-0000-0000-0000000000a1';

/** The parsed protocol row the protocol harness serves. */
function protocolSpec(): EvaluationProtocolSpec {
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(ProtocolRowFixture.Row());
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

/** The unit harness with its pipeline bound to the protocol row, the protocol store serving it and a fake trainer. */
function protocolHarness(answer: ConstructorParameters<typeof FakeTrainer>[0]): ReturnType<typeof unitHarness> & { trainer: FakeTrainer; artifacts: InMemoryArtifactStore } {
  const harness = unitHarness(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns(), undefined, TRAINER_RUN_ID);
  harness.pipeline.EvaluationProtocolID = ProtocolRowFixture.ID;
  const trainer = new FakeTrainer(answer);
  const artifacts = new InMemoryArtifactStore();
  harness.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row()]);
  harness.deps.trainer = trainer;
  harness.deps.artifactStore = artifacts;
  return { ...harness, trainer, artifacts };
}

/** The run's stored envelope, parsed through its schema. */
function storedResults(validationResults: string | null): TrainingRunResults {
  const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults);
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

describe('TrainingEngine — a unit pipeline bound to an Evaluation Protocol trains through the trainer', () => {
  it('trains a protocol-bound unit pipeline through /trainer', async () => {
    const { engine, deps, sidecar, pipeline, trainer, artifacts } = protocolHarness((r) => TrainerResultFixtures.CannedCompleted(r.trainingRunId, protocolSpec()));
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(trainer.Requests).toHaveLength(1);
    const request = trainer.Requests[0];
    expect(request.snapshot.id).toBe(run.TrainingSnapshotID);
    expect(request.protocol.id).toBe(ProtocolRowFixture.ID);
    expect([run.Status, run.EvaluationProtocolID, run.ComputeSeconds, run.ComputeCost]).toEqual(['Completed', ProtocolRowFixture.ID, 12.5, null]);
    const results = storedResults(run.ValidationResults);
    expect(results.status).toBe('completed');
    if (results.status !== 'completed') return;
    expect(results.trainer?.finalist).toBe('xgb');
    expect(results.trainer?.artifacts.map((a) => a.fileId).every((id) => id.length > 0)).toBe(true);
    expect(run.ValidationResults).not.toContain('bytesBase64');
    expect(results.trainerRequest?.evaluationProtocolId).toBe(ProtocolRowFixture.ID);
    expect(results.legacy).toBeNull();
    expect(artifacts.Saved.size).toBe(3);
    const xgbFile = results.trainer?.artifacts.find((a) => a.candidate === 'xgb')?.fileId;
    expect(model.ArtifactFileID).toBe(xgbFile);
    expect(JSON.parse(model.Lineage || '{}')).toMatchObject({ evaluationProtocolId: ProtocolRowFixture.ID, artifactFormat: 'ps-predictor/v2', trainingSnapshotId: run.TrainingSnapshotID });
    expect(sidecar.CallCount).toBe(0);
  });

  it('stores a failed trainer result as a trainer refusal', async () => {
    const { engine, deps, pipeline, runs, models } = protocolHarness((r) => TrainerResultFixtures.CannedFailed(r.trainingRunId));
    const training = engine.trainModel({ pipelineId: pipeline.ID }, deps);
    await expect(training).rejects.toBeInstanceOf(TrainingRefusedError);
    await expect(training).rejects.toThrow(/trainer-failed.*inner-cv/);
    expect([runs[0].Status, runs[0].ComputeSeconds]).toEqual(['Failed', 3.25]);
    expect(storedResults(runs[0].ValidationResults)).toEqual({
      schema: 'ps-run-results/v2', status: 'refused',
      refusal: { stage: 'trainer', reason: { kind: 'trainer-failed', stage: 'inner-cv', message: "candidate 'xgb': only one class in a fold", computeSeconds: 3.25 } },
    });
    expect(models).toHaveLength(0);
  });

  it('retrains a trainer run from its snapshot and reproduces the holdout metrics', async () => {
    const { engine, deps, pipeline, trainer } = protocolHarness((r) => TrainerResultFixtures.CannedCompleted(r.trainingRunId, protocolSpec()));
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const retrained = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect(retrained).toMatchObject({ FilesVerified: true, ContentHashVerified: true, MaxAbsDiff: 0, Reproduced: true });
    expect(retrained.Original).toEqual({ 'log-loss': 0.452, auc: 0.67, brier: 0.15 });
    expect(retrained.Retrained).toEqual({ 'log-loss': 0.452, auc: 0.67, brier: 0.15 });
    expect(trainer.Requests).toHaveLength(2);
    const [first, second] = trainer.Requests;
    expect([second.candidates, second.seed, second.threads, second.timeoutSeconds, second.maxRetries]).toEqual([first.candidates, first.seed, first.threads, first.timeoutSeconds, first.maxRetries]);
    expect(second.snapshot.matrix).not.toBe(first.snapshot.matrix);
    expect([second.snapshot.matrix.fileId, second.snapshot.rowManifest.fileId]).toEqual([first.snapshot.matrix.fileId, first.snapshot.rowManifest.fileId]);
  });

  it('records a malformed trainer answer as a failed run naming the mismatch, with no model', async () => {
    const { engine, deps, pipeline, runs, models } = protocolHarness(() => { throw new TrainerResultMalformedError(['holdout.primary.metric: Invalid enum value']); });
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toBeInstanceOf(TrainerResultMalformedError);
    expect(runs[0].Status).toBe('Failed');
    expect(runs[0].Notes).toBe("Training failed: The sidecar's /trainer answer is not a TrainerResult: holdout.primary.metric: Invalid enum value");
    expect(models).toHaveLength(0);
  });

  it('refuses a pipeline whose Evaluation Protocol row does not exist (protocol-required), before calling the trainer', async () => {
    const { engine, deps, pipeline, trainer, runs } = protocolHarness((r) => TrainerResultFixtures.CannedFailed(r.trainingRunId));
    deps.protocols = new FakeEvaluationProtocolStore([]);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: pipeline.ID } } });
    expect(trainer.Requests).toHaveLength(0);
    expect(runs[0].Status).toBe('Failed');
  });

  it('fails a protocol-bound run whose deps carry no trainer, before any snapshot is written', async () => {
    const { engine, deps, pipeline, runs, snapshots } = protocolHarness((r) => TrainerResultFixtures.CannedFailed(r.trainingRunId));
    delete deps.trainer;
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(/no trainer \(trainer\) was supplied/);
    expect(snapshots).toHaveLength(0);
    expect(runs[0].Status).toBe('Failed');
  });
});

describe('TrainingEngine — compute pricing on the run', () => {
  it('prices the measured seconds at the configured rate per second', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '0.5');
    const { deps } = buildDeps();
    const { run } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(run.ComputeSeconds).toBe(cleanResponse.duration_sec);
    expect(run.ComputeCost).toBeCloseTo(cleanResponse.duration_sec * 0.5, 12);
  });

  it('prices a Prediction Unit run by the same rule', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '0');
    const { engine, deps, pipeline } = unitHarness(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect([run.ComputeSeconds, run.ComputeCost]).toEqual([cleanResponse.duration_sec, 0]);
  });

  it('keeps the measured compute on a run that fails after the sidecar returned', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '0.5');
    const factory = new FakeEntityFactory(() => {
      const m = new FakeMLModel('model-x');
      m.failNextSaveWith('FK violation on PipelineID');
      return m;
    });
    const { deps } = buildDeps({ entityFactory: factory });
    await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toThrow(/FK violation on PipelineID/);
    expect(factory.Runs[0].Status).toBe('Failed');
    expect([factory.Runs[0].ComputeSeconds, factory.Runs[0].ComputeCost]).toEqual([cleanResponse.duration_sec, cleanResponse.duration_sec * 0.5]);
  });

  it('refuses a malformed rate before any row is written or any model is trained', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', 'cheap');
    const { deps, factory, sidecar } = buildDeps();
    await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toThrow(RangeError);
    expect(sidecar.CallCount).toBe(0);
    expect(factory.Runs.length).toBe(0);
    expect(factory.Models.length).toBe(0);
  });
});
