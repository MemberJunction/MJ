import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider, BaseEntity } from '@memberjunction/core';
import type {
  MJMLTrainingPipelineEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';
import type {
  TrainRequest,
  TrainResponse,
  MatrixData,
  FeatureStepGraph,
  SourceBinding,
  AsOfStrategy,
  LeakageGuard,
  ValidationStrategy,
} from '@memberjunction/predictive-studio-core';

import { TrainingEngine } from '../training-engine';
import { InMemoryArtifactStore } from '../artifact-store';
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

/** In-memory feature data access backing the assembler (no DB). */
class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = this.rowsByEntity[params.EntityName];
    return rows ? { Success: true, Rows: rows } : { Success: false, Rows: [], ErrorMessage: `no fixture ${params.EntityName}` };
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
  training_row_count: 8,
  duration_sec: 1.4,
  holdout_metrics: { auc: 0.79 },
};

/** Build a TrainingEngine wired to an assembler over the given member rows. */
function buildEngine(): TrainingEngine {
  const dataAccess = new InMemoryDataAccess({ Members: syntheticMembers() });
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
    contextUser: undefined,
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
    expect(req.validation).toEqual({ strategy: 'train_test_split', test_size: 0.2, k: undefined });
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

    // The holdout rows are the trailing slice and are DISJOINT from training:
    // synthetic `tenure` is 1..10 in row order, so training holds 1..8 and the
    // locked holdout holds 9..10 — no overlap (the holdout never leaks into train).
    const trainTenures = new Set(trainRows.map((r) => r[0]));
    for (const hr of holdoutRows) {
      expect(trainTenures.has(hr[0])).toBe(false);
    }
    expect(trainRows.length).toBe(8);
    expect(holdoutRows.length).toBe(2);
    expect(holdoutRows.map((r) => Number(r[0])).sort((a, b) => a - b)).toEqual([9, 10]); // trailing rows

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
