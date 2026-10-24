import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider, BaseEntity } from '@memberjunction/core';
import type {
  MJMLTrainingPipelineEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';
import {
  EvaluationLineage,
  InvalidMajorityBaselineRuleError,
  TrustVerdicts,
  type TrainRequest,
  type TrainResponse,
  type MatrixData,
  type FeatureStepGraph,
  type SourceBinding,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
} from '@memberjunction/predictive-studio-core';

import { TrainingEngine } from '../training-engine';
import { AsOfSettingHasNoEffectError } from '../as-of-refusal';
import { InMemoryArtifactStore } from '../artifact-store';
import { DEFAULT_SPLIT_SEED } from '../locked-holdout';
import type {
  IEntityFactory,
  IRecordLoader,
  ISidecarTrainer,
  TrainingDeps,
} from '../types';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import type {
  IFeatureDataAccess,
  FetchRowsParams,
  FetchRowsResult,
  SourceRow,
} from '../../feature-assembly';

/**
 * Unit tests for the TrainingEngine. NO live DB, NO live sidecar — every seam is
 * an in-memory fake. These tests prove the orchestration flow (plan §3 / §4.3 /
 * §4.4 / §8.2 / §6.4 / §11): the assembled matrix → carved locked holdout →
 * correctly-shaped TrainRequest → immutable Draft ML Model + Completed Training
 * Run, leakage-dominance handling, and Save-failure surfacing.
 */

// ---------------------------------------------------------------------------
// In-memory entity fakes. BaseEntity uses getter/setters and can't be
// constructed without a provider, so tests use plain field-bag fakes exposing
// exactly the typed members the engine touches, plus Save() / LatestResult.
// They are handed to the engine through the IEntityFactory seam via a single,
// deliberate test-double cast at the boundary (the engine only ever calls the
// strongly-typed properties below — never .Get()/.Set()).
// ---------------------------------------------------------------------------

interface FakeSaveResult {
  CompleteMessage: string;
}

class FakeEntity {
  public ID = '';
  private saveOk: boolean;
  public LatestResult: FakeSaveResult | null = null;
  public SaveCallCount = 0;

  constructor(idSeed: string, saveOk = true) {
    this.ID = idSeed;
    this.saveOk = saveOk;
  }

  public failNextSaveWith(message: string): void {
    this.saveOk = false;
    this.LatestResult = { CompleteMessage: message };
  }

  public async Save(): Promise<boolean> {
    this.SaveCallCount++;
    if (!this.saveOk) {
      return false;
    }
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }
}

class FakeMLModel extends FakeEntity {
  public PipelineID = '';
  public Version = 0;
  public AlgorithmID = '';
  public ArtifactFileID: string | null = null;
  public FittedPreprocessing: string | null = null;
  public FeatureSchema = '';
  public TargetVariable = '';
  public ProblemType: 'classification' | 'regression' = 'classification';
  public Metrics: string | null = null;
  public HoldoutMetrics: string | null = null;
  public FeatureImportance: string | null = null;
  public Lineage: string | null = null;
  public TrainedAt: Date | null = null;
  public TrainingDurationSec: number | null = null;
  public TrainingRowCount: number | null = null;
  public Status: 'Archived' | 'Draft' | 'Published' | 'Validated' = 'Draft';
}

class FakeMLRun extends FakeEntity {
  public PipelineID = '';
  public ResultingModelID: string | null = null;
  public ExperimentSessionIterationID: string | null = null;
  public FeaturesUsed: string | null = null;
  public AlgorithmID = '';
  public Hyperparameters: string | null = null;
  public ValidationResults: string | null = null;
  public Status: 'Completed' | 'Failed' | 'Pending' | 'Pruned' | 'Running' = 'Pending';
  public StartedAt: Date | null = null;
  public CompletedAt: Date | null = null;
  public ComputeCost: number | null = null;
  public TokensUsed: number | null = null;
  public Notes: string | null = null;
}

/** A pipeline fake exposing the JSON config columns + denormalized view fields. */
class FakeMLPipeline {
  public ID = 'pipe-1';
  public Name = 'Member Renewal Predictor';
  public Version = 3;
  public TargetEntity = 'Members';
  public TargetVariable = 'Renewed';
  public ProblemType: 'classification' | 'regression' = 'classification';
  public Algorithm = 'xgboost';
  public AlgorithmID = 'algo-xgb';
  public Hyperparameters: string | null = JSON.stringify({ max_depth: 4 });
  public SourceBindings: string | null = JSON.stringify([{ Kind: 'Entity', Ref: 'Members' }] as SourceBinding[]);
  public FeatureSteps: string | null = JSON.stringify({
    Steps: [
      { Id: 's1', Kind: 'select', Columns: ['tenure', 'events_at_signup', 'city'] },
      { Id: 's2', Kind: 'impute', Column: 'tenure', Strategy: 'mean' },
      { Id: 's3', Kind: 'standardize', Columns: ['tenure', 'events_at_signup'] },
      { Id: 's4', Kind: 'onehot', Column: 'city' },
    ],
  } satisfies FeatureStepGraph);
  public AsOfStrategy: string | null = JSON.stringify({ Mode: 'none' } as AsOfStrategy);
  public LeakageGuard: string | null = JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 } as LeakageGuard);
  public ValidationStrategy: string | null = JSON.stringify({
    Strategy: 'train_test_split',
    TestSize: 0.2,
    LockedHoldoutFraction: 0.2,
  } as ValidationStrategy);
}

/** Entity-factory fake — hands back the queued model/run fakes per entity name. */
class FakeEntityFactory implements IEntityFactory {
  public readonly Models: FakeMLModel[] = [];
  public readonly Runs: FakeMLRun[] = [];

  constructor(
    private readonly modelFactory: () => FakeMLModel = () => new FakeMLModel('model-1'),
    private readonly runFactory: () => FakeMLRun = () => new FakeMLRun('run-1'),
  ) {}

  async getEntityObject<T extends BaseEntity>(entityName: string, _contextUser?: UserInfo): Promise<T> {
    if (entityName === 'MJ: ML Models') {
      const m = this.modelFactory();
      this.Models.push(m);
      // Single deliberate test-double cast at the seam boundary (see header note).
      return m as unknown as T;
    }
    if (entityName === 'MJ: ML Training Runs') {
      const r = this.runFactory();
      this.Runs.push(r);
      return r as unknown as T;
    }
    throw new Error(`FakeEntityFactory: unexpected entity ${entityName}`);
  }
}

/** Record-loader fake — returns a configured pipeline + next version. */
class FakeRecordLoader implements IRecordLoader {
  constructor(
    private readonly pipeline: FakeMLPipeline | null,
    private readonly nextVersion = 5,
  ) {}

  async loadPipeline(_pipelineId: string, _u?: UserInfo, _p?: IMetadataProvider): Promise<MJMLTrainingPipelineEntity | null> {
    return this.pipeline as unknown as MJMLTrainingPipelineEntity | null;
  }

  async nextModelVersion(_pipelineId: string, _u?: UserInfo, _p?: IMetadataProvider): Promise<number> {
    return this.nextVersion;
  }
}

/** Sidecar fake — captures the request + holdout, returns a canned response. */
class FakeSidecar implements ISidecarTrainer {
  public LastRequest: TrainRequest | null = null;
  public LastHoldout: MatrixData | null = null;

  constructor(private readonly response: TrainResponse) {}

  async train(req: TrainRequest, lockedHoldout?: MatrixData): Promise<TrainResponse> {
    this.LastRequest = req;
    this.LastHoldout = lockedHoldout ?? null;
    return this.response;
  }
}

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

const cleanResponse: TrainResponse = {
  artifact_b64: Buffer.from('fake-model-bytes').toString('base64'),
  fitted_preprocessing: { 'standardize.tenure': { mean: 5, std: 2.5 } },
  metrics: { auc: 0.82, f1: 0.78 },
  feature_importance: { tenure: 0.3, events_at_signup: 0.25, city: 0.2, emb_0: 0.25 },
  feature_importance_kind: 'split_or_impurity',
  training_row_count: 8,
  duration_sec: 1.4,
  holdout_metrics: { auc: 0.79 },
  validation_out_of_sample: true,
};

/**
 * The provider slice training uses: `EntityByName` for the target's primary key (the training read is ordered by it).
 * Handed to the engine through one deliberate test-double cast at the seam boundary.
 */
const fakeProvider = {
  EntityByName: (name: string) => (name === 'Members' ? { PrimaryKeys: [{ Name: 'ID' }] } : undefined),
} as unknown as IMetadataProvider;
const fakeUser = { ID: 'user-1', Email: 'trainer@example.com' } as UserInfo;

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

function buildDeps(overrides?: Partial<TrainingDeps> & { pipeline?: FakeMLPipeline | null; response?: TrainResponse }): {
  deps: TrainingDeps;
  factory: FakeEntityFactory;
  sidecar: FakeSidecar;
  store: InMemoryArtifactStore;
} {
  const factory = (overrides?.entityFactory as FakeEntityFactory) ?? new FakeEntityFactory();
  const sidecar = new FakeSidecar(overrides?.response ?? cleanResponse);
  const store = new InMemoryArtifactStore();
  const pipeline = overrides?.pipeline === undefined ? new FakeMLPipeline() : overrides.pipeline;
  const deps: TrainingDeps = {
    entityFactory: factory,
    recordLoader: new FakeRecordLoader(pipeline),
    sidecar,
    artifactStore: store,
    contextUser: fakeUser,
    provider: fakeProvider,
  };
  return { deps, factory, sidecar, store };
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

describe('TrainingEngine.trainModel — as-of settings that change nothing are refused (W4 → S2.1, F-PIT-3)', () => {
  const ignored: ReadonlyArray<AsOfStrategy> = [{ Mode: 'column', Column: 'StartDate' }, { Mode: 'offset', OffsetDays: 30 }];
  for (const asOf of ignored) {
    it(`refuses AsOfStrategy.Mode='${asOf.Mode}' before any row is written`, async () => {
      const pipeline = new FakeMLPipeline();
      pipeline.AsOfStrategy = JSON.stringify(asOf);
      const { deps, factory, sidecar } = buildDeps({ pipeline });
      await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toBeInstanceOf(AsOfSettingHasNoEffectError);
      await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toMatchObject({ Source: 'pipeline', Mode: asOf.Mode });
      expect(factory.Runs).toHaveLength(0);
      expect(factory.Models).toHaveLength(0);
      expect(sidecar.LastRequest).toBeNull();
    });
  }

  it('names the setting to change: the pipeline for a pipeline refusal, the Train input for a train-input refusal', () => {
    expect(new AsOfSettingHasNoEffectError('pipeline', 'column', 'p1').message).toMatch(/Set the pipeline's AsOfStrategy to \{"Mode":"none"\} \(pipeline p1\)\.$/);
    const trainInput = new AsOfSettingHasNoEffectError('train-input', 'column', 'p1').message;
    expect(trainInput).toMatch(/Remove the asOf input from the Train request \(pipeline p1\)\.$/);
    expect(trainInput).not.toContain("Set the pipeline's AsOfStrategy");
  });

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
