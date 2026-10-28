/**
 * In-memory training fakes shared by the training-engine and snapshot-retrainer tests: field-bag entity fakes served by
 * an entity-factory fake, a record loader, a capturing sidecar, a snapshot store over the saved fakes, and the harness
 * for a pipeline that points at the `UnitYearsWorld` Prediction Unit. No live database, no live sidecar.
 */
import type { UserInfo, IMetadataProvider, BaseEntity } from '@memberjunction/core';
import type {
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJTrainingSnapshotEntity,
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
  PredictionUnitColumns,
} from '@memberjunction/predictive-studio-core';
import { TrainingEngine } from '../../training/training-engine';
import { InMemoryArtifactStore } from '../../training/artifact-store';
import type { IEntityFactory, IRecordLoader, ISidecarTrainer, TrainingDeps } from '../../training/types';
import type { SourceRow } from '../../feature-assembly';
import { InMemorySnapshotFileStore } from '../../snapshot/snapshot-file-store';
import type { ITrainingSnapshotStore } from '../../snapshot/training-snapshot-store';
import { TableDataAccess } from './table-data-access';
import { FakePredictionUnitStore, UnitYearsWorld } from './unit-years-world';

// ---------------------------------------------------------------------------
// In-memory entity fakes. BaseEntity uses getter/setters and can't be
// constructed without a provider, so tests use plain field-bag fakes exposing
// exactly the typed members the engine touches, plus Save() / LatestResult.
// They are handed to the engine through the IEntityFactory seam via a single,
// deliberate test-double cast at the boundary (the engine only ever calls the
// strongly-typed properties below — never .Get()/.Set()).
// ---------------------------------------------------------------------------

export interface FakeSaveResult {
  CompleteMessage: string;
}

export class FakeEntity {
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

export class FakeMLModel extends FakeEntity {
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

export class FakeMLRun extends FakeEntity {
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
  public EvaluationProtocolID: string | null = null;
  public TrainingSnapshotID: string | null = null;
  public TokensUsed: number | null = null;
  public Notes: string | null = null;
}

/**
 * A Training Snapshot row: the counts the tests read as typed fields; the builder sets the other columns on the same
 * object. Save() assigns the next ID, as the database does.
 */
export class FakeTrainingSnapshot extends FakeEntity {
  public ContentHash = '';
  public MatrixFileID = '';
  public RowManifestFileID = '';
  public ProvenanceFileID = '';
  public ManifestRowCount = 0;
  public HoldoutRowCount = 0;
  public CensoredRowsExcluded = 0;

  public override async Save(): Promise<boolean> {
    const ok = await super.Save();
    if (ok && this.ID === '') this.ID = `snapshot-${FakeTrainingSnapshot.saved++}`;
    return ok;
  }

  private static saved = 1;
}

/** An `MJ: Files` row (the in-memory snapshot file store writes none; served so the factory covers every entity training creates). */
export class FakeFileRow extends FakeEntity {}

/** A pipeline fake exposing the JSON config columns + denormalized view fields. */
export class FakeMLPipeline {
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
  public PredictionUnitID: string | null = null;
  public EvaluationProtocolID: string | null = null;
  public LeakageGuard: string | null = JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 } as LeakageGuard);
  public ValidationStrategy: string | null = JSON.stringify({
    Strategy: 'train_test_split',
    TestSize: 0.2,
    LockedHoldoutFraction: 0.2,
  } as ValidationStrategy);
}

/** Entity-factory fake — hands back the queued model/run fakes per entity name. */
export class FakeEntityFactory implements IEntityFactory {
  public readonly Models: FakeMLModel[] = [];
  public readonly Runs: FakeMLRun[] = [];
  public readonly Snapshots: FakeTrainingSnapshot[] = [];
  public readonly Files: FakeFileRow[] = [];

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
    if (entityName === 'MJ: Training Snapshots') {
      const snapshot = new FakeTrainingSnapshot('');
      this.Snapshots.push(snapshot);
      return snapshot as unknown as T;
    }
    if (entityName === 'MJ: Files') {
      const file = new FakeFileRow(`file-${this.Files.length + 1}`);
      this.Files.push(file);
      return file as unknown as T;
    }
    throw new Error(`FakeEntityFactory: unexpected entity ${entityName}`);
  }
}

/** Record-loader fake — returns a configured pipeline + next version. */
export class FakeRecordLoader implements IRecordLoader {
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
export class FakeSidecar implements ISidecarTrainer {
  public LastRequest: TrainRequest | null = null;
  public LastHoldout: MatrixData | null = null;
  public CallCount = 0;

  constructor(private readonly response: TrainResponse) {}

  async train(req: TrainRequest, lockedHoldout?: MatrixData): Promise<TrainResponse> {
    this.CallCount++;
    this.LastRequest = req;
    this.LastHoldout = lockedHoldout ?? null;
    return this.response;
  }
}

export const cleanResponse: TrainResponse = {
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
export const fakeProvider = {
  EntityByName: (name: string) => (name === 'Members' ? { PrimaryKeys: [{ Name: 'ID' }] } : undefined),
} as unknown as IMetadataProvider;
export const fakeUser = { ID: 'user-1', Email: 'trainer@example.com' } as UserInfo;

export function buildDeps(overrides?: Partial<TrainingDeps> & { pipeline?: FakeMLPipeline | null; response?: TrainResponse }): {
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

// ---------------------------------------------------------------------------
// Prediction Unit pipelines: the unit store, the assembly metadata and a counting data access over the unit world.
// ---------------------------------------------------------------------------

/** A TrainingEngine plus deps for a pipeline that points at Prediction Unit `U-1` over the `Years` rows. */
export function unitHarness(rows: SourceRow[], unitColumns: PredictionUnitColumns, featureSteps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }] }): {
  engine: TrainingEngine;
  deps: TrainingDeps;
  sidecar: FakeSidecar;
  pipeline: FakeMLPipeline;
  runs: FakeMLRun[];
  models: FakeMLModel[];
  snapshots: FakeTrainingSnapshot[];
  files: InMemorySnapshotFileStore;
  snapshotStore: FakeTrainingSnapshotStore;
} {
  const pipeline = new FakeMLPipeline();
  pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
  pipeline.TargetEntity = 'Years';
  pipeline.SourceBindings = JSON.stringify([{ Kind: 'Entity', Ref: 'Years' }] satisfies SourceBinding[]);
  pipeline.FeatureSteps = JSON.stringify(featureSteps);
  const { deps, factory, sidecar } = buildDeps({ pipeline });
  deps.predictionUnits = new FakePredictionUnitStore(unitColumns);
  deps.assemblyMetadata = UnitYearsWorld.Metadata();
  deps.dataAccess = new TableDataAccess(UnitYearsWorld.Tables(rows));
  const files = new InMemorySnapshotFileStore('provider-local');
  deps.snapshotFiles = files;
  const snapshotStore = new FakeTrainingSnapshotStore(factory);
  deps.snapshots = snapshotStore;
  return { engine: new TrainingEngine(), deps, sidecar, pipeline, runs: factory.Runs, models: factory.Models, snapshots: factory.Snapshots, files, snapshotStore };
}

/** Finds the snapshots the factory saved by content hash, as the RunView store finds the saved rows. */
export class FakeTrainingSnapshotStore implements ITrainingSnapshotStore {
  /** Content-hash lookups that found a saved snapshot: each one is a build that reused it instead of writing. */
  public ReusedLookups = 0;
  constructor(private readonly factory: FakeEntityFactory) {}
  public async FindByContentHash(contentHash: string): Promise<MJTrainingSnapshotEntity | null> {
    const found = this.factory.Snapshots.find((s) => s.ID !== '' && s.ContentHash === contentHash);
    if (found) this.ReusedLookups++;
    return found ? (found as unknown as MJTrainingSnapshotEntity) : null;
  }
  public async LoadSnapshot(id: string): Promise<MJTrainingSnapshotEntity | null> {
    const found = this.factory.Snapshots.find((s) => s.ID === id);
    return found ? (found as unknown as MJTrainingSnapshotEntity) : null;
  }
  public async LoadRun(id: string): Promise<MJMLTrainingRunEntity | null> {
    const found = this.factory.Runs.find((r) => r.ID === id);
    return found ? (found as unknown as MJMLTrainingRunEntity) : null;
  }
}
