/**
 * In-memory training fakes shared by the training-engine and snapshot-retrainer tests: field-bag entity fakes served by
 * an entity-factory fake, a record loader, a trainer and a protocol store, a snapshot store over
 * the saved fakes, and the harness for a pipeline that points at the `UnitYearsWorld` Prediction Unit and is bound to
 * the `ProtocolRowFixture` protocol. No live database, no live sidecar.
 */
import { vi } from 'vitest';
import { EntityInfo, type UserInfo, type IMetadataProvider, type BaseEntity, type EntityTransactionScope, type RunQueryParams, type RunQueryResult, type RunViewParams } from '@memberjunction/core';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import { UUIDsEqual } from '@memberjunction/global';
import type {
  MJMLModelEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJMLTrainingSnapshotEntity,
} from '@memberjunction/core-entities';
import type {
  FeatureStepGraph,
  SourceBinding,
  AsOfStrategy,
  LeakageGuard,
  ValidationStrategy,
  PredictionUnitColumns,
  EvaluationProtocolColumns,
  EvaluationProtocolSpec,
  TrainerRequest,
  TrainerResult,
} from '@memberjunction/predictive-studio-core';
import { EvaluationProtocol, type JsonValue } from '@memberjunction/predictive-studio-core';
import { TrainingEngine } from '../../training/training-engine';
import { InMemoryArtifactStore } from '../../training/artifact-store';
import type { IEntityFactory, IRecordLoader, ITrainerEvaluator, TrainModelResult, TrainingDeps } from '../../training/types';
import type { IEvaluationProtocolStore, StoredEvaluationProtocol } from '../../training/evaluation-protocol-store';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
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

  /** True once `Delete()` succeeded. */
  public Deleted = false;

  public async Delete(): Promise<boolean> {
    this.Deleted = true;
    return true;
  }
}

export class FakeMLModel extends FakeEntity {
  public PipelineID = '';
  public Version = 0;
  public AlgorithmID = '';
  public ArtifactFileID: string | null = null;
  /** The registered SHA-256 of the model's artifact (the training engine records the stored file's). */
  public ArtifactSha256: string | null = null;
  /** The registry entry's lineage and delivery columns (§5.1), which the training engine records on a trainer model row. */
  public TrainingRunID: string | null = null;
  public TrainingSnapshotID: string | null = null;
  public EvaluationProtocolID: string | null = null;
  public PredictionUnitID: string | null = null;
  public SnapshotHash: string | null = null;
  public FeatureSchemaHash: string | null = null;
  public CodeVersion: string | null = null;
  public OutputSemantics: string | null = null;
  public Delivery: string | null = null;
  public ArtifactStatus: MJMLModelEntity['ArtifactStatus'] = 'unverified';
  public ArtifactCheckedAt: Date | null = null;

  /** `Delivery` read as the generated `DeliveryObject` accessor reads it ({@link FakeMLModel.ReadJSONField}). */
  public get DeliveryObject(): MJMLModelEntity['DeliveryObject'] {
    return FakeMLModel.ReadJSONField<NonNullable<MJMLModelEntity['DeliveryObject']>>('Delivery', this.Delivery);
  }

  /** `CodeVersion` read as the generated `CodeVersionObject` accessor reads it ({@link FakeMLModel.ReadJSONField}). */
  public get CodeVersionObject(): MJMLModelEntity['CodeVersionObject'] {
    return FakeMLModel.ReadJSONField<NonNullable<MJMLModelEntity['CodeVersionObject']>>('CodeVersion', this.CodeVersion);
  }

  /**
   * Exactly what a generated `<Field>Object` accessor does (`BaseEntity.GetJSONFieldObject` → `JSONFieldBinding.GetValue`,
   * `MJCore/src/generic/jsonFieldBinding.ts` `parseRaw`): null for a null or empty column, a throw naming the field for
   * text that is not JSON, and otherwise the parsed value, typed as the field's JSONType with no shape check (the
   * accessor's own `as TObject`; this one deliberate test-double cast mirrors it). The accessor validates nothing, which
   * is why `RegistryEntries.Load` checks the value it returns against Core's zod schemas (`RegistrySchemas`).
   */
  public static ReadJSONField<T>(fieldName: string, raw: string | null): T | null {
    if (raw === null || raw === '') return null;
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`JSON field '${fieldName}' does not contain valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    return parsed as unknown as T;
  }
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
  public ComputeSeconds: number | null = null;
  public ComputeCost: number | null = null;
  public EvaluationProtocolID: string | null = null;
  public TrainingSnapshotID: string | null = null;
  public TokensUsed: number | null = null;
  public Notes: string | null = null;
  /** The row's creation instant, as the database stamps it on the first save. */
  public __mj_CreatedAt: Date = FakeMLRun.DefaultCreatedAt;

  /** When every fake run row is created unless a test says otherwise (after the fake protocol row). */
  public static readonly DefaultCreatedAt = new Date('2026-06-01T00:00:00.000Z');
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
  /** The protocol version the snapshot was frozen under (the builder sets it). */
  public EvaluationProtocolID: string | null = null;
  /** The data cutoff day at UTC midnight (the builder sets it). */
  public DataCutoff = new Date(0);
  /** The assembly's per-column provenance JSON (the builder sets it). */
  public ColumnProvenance = '';

  public override async Save(): Promise<boolean> {
    const ok = await super.Save();
    // A UUID-shaped ID, as the database assigns: the trainer's request schema validates snapshot IDs as UUIDs.
    if (ok && this.ID === '') this.ID = `00000000-0000-4000-8000-${String(FakeTrainingSnapshot.saved++).padStart(12, '0')}`;
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
    if (entityName === 'MJ: ML Training Snapshots') {
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

/** Record-loader fake — returns a configured pipeline, and resolves driver keys from a small catalog. */
export class FakeRecordLoader implements IRecordLoader {
  /** The algorithm catalog by driver key: the two GLM drivers the baselines fit that have a catalog row. */
  public static readonly DefaultCatalog: Readonly<Record<string, string>> = { logistic_regression: 'algo-logreg', ridge: 'algo-ridge' };
  /** Every driver key looked up, in order. */
  public readonly DriverLookups: string[] = [];
  constructor(
    private readonly pipeline: FakeMLPipeline | null,
    private readonly catalog: Readonly<Record<string, string>> = FakeRecordLoader.DefaultCatalog,
  ) {}

  async resolveAlgorithmIDForDriver(driverKey: string, _u?: UserInfo, _p?: IMetadataProvider): Promise<string | null> {
    this.DriverLookups.push(driverKey);
    return Object.prototype.hasOwnProperty.call(this.catalog, driverKey) ? this.catalog[driverKey] : null;
  }

  async loadPipeline(_pipelineId: string, _u?: UserInfo, _p?: IMetadataProvider): Promise<MJMLTrainingPipelineEntity | null> {
    return this.pipeline as unknown as MJMLTrainingPipelineEntity | null;
  }
}

/**
 * The provider slice training uses: `EntityByName` for the target's primary key (the training read is ordered by it),
 * and the transaction and stored-Query members the model-row save runs on (`ProviderTransactions.Run` around
 * `ModelVersions.SaveUnderLock`: the pipeline lock, then `Predictive Studio: Next Model Version`, which answers
 * {@link TrainingProviderFake.NextVersion}). Every transaction event and query is appended to {@link Log}.
 */
export class TrainingProviderFake extends DatabaseProviderStub {
  /** The version `Predictive Studio: Next Model Version` answers. */
  public NextVersion = 5;
  /** `begin`, `commit`, `rollback` and `query <name>`, in order. */
  public readonly Log: string[] = [];

  /**
   * Rows `RunView` answers, by entity name (the trainer reads the pipeline's Published model, D4-93); default none, so a
   * run has no incumbent. Tests that set it reset it.
   */
  public ViewRows: Record<string, object[]> = {};

  constructor() {
    super();
    this.RunView = vi.fn().mockImplementation(async (params: RunViewParams) => ({ Success: true, Results: this.ViewRows[params.EntityName || ''] || [], TotalRowCount: 0, ErrorMessage: '' }));
  }

  public override EntityByName(name: string): EntityInfo | undefined {
    return name === 'Members' ? new EntityInfo({ ID: 'ENT-MEMBERS', Name: 'Members', Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }] }) : undefined;
  }

  public override async BeginEntityTransaction(): Promise<EntityTransactionScope> {
    this.Log.push('begin');
    return { IsNested: false, Commit: async () => { this.Log.push('commit'); }, Rollback: async () => { this.Log.push('rollback'); } };
  }

  public override async RunQuery(params: RunQueryParams): Promise<RunQueryResult> {
    const name = params.QueryName || '';
    this.Log.push(`query ${name}`);
    const row = name === 'Predictive Studio: Next Model Version' ? { NextVersion: this.NextVersion } : { ID: 'pipeline' };
    return { QueryID: '', QueryName: name, Success: true, Results: [row], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '' };
  }
}

/** The one training provider fake the shared harness uses. */
export const trainingProvider = new TrainingProviderFake();
/** {@link trainingProvider} as the engine's provider (a real `DatabaseProviderBase`: no cast). */
export const fakeProvider: IMetadataProvider = trainingProvider;
export const fakeUser = { ID: 'user-1', Email: 'trainer@example.com' } as UserInfo;


/** Trainer fake: records every request and answers with the given function of it. */
export class FakeTrainer implements ITrainerEvaluator {
  public readonly Requests: TrainerRequest[] = [];
  constructor(private readonly answer: (req: TrainerRequest) => TrainerResult) {}
  public async RunTrainer(req: TrainerRequest): Promise<TrainerResult> {
    this.Requests.push(req);
    return this.answer(req);
  }
}

/** Serves the given Evaluation Protocol rows by ID, each created at `createdAt`; counts the reads. */
export class FakeEvaluationProtocolStore implements IEvaluationProtocolStore {
  /** When every served protocol row was created unless a test says otherwise (before the fake run rows). */
  public static readonly DefaultCreatedAt = new Date('2026-01-01T00:00:00.000Z');
  public Reads = 0;
  constructor(private readonly rows: readonly EvaluationProtocolColumns[], private readonly createdAt: Date = FakeEvaluationProtocolStore.DefaultCreatedAt) {}
  public async Load(protocolId: string): Promise<StoredEvaluationProtocol | null> {
    this.Reads++;
    const row = this.rows.find((r) => UUIDsEqual(r.ID, protocolId));
    return row ? { ...row, __mj_CreatedAt: this.createdAt } : null;
  }
}

/** The trainer answers the fake harness accepts: a completed run for the request's run and snapshot. */
export class TrainerAnswers {
  /** The completed answer for a request: its run, its snapshot's feature-schema hash, real artifact hashes. */
  public static CannedFor(r: TrainerRequest): TrainerResult {
    return TrainerResultFixtures.CannedCompleted(r.trainingRunId, TrainerAnswers.protocolSpec(), r.snapshot.featureSchemaHash);
  }

  private static protocolSpec(): EvaluationProtocolSpec {
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(ProtocolRowFixture.Row());
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    return parsed.Value;
  }
}

// ---------------------------------------------------------------------------
// Prediction Unit pipelines: the unit store, the assembly metadata and a counting data access over the unit world.
// ---------------------------------------------------------------------------

/** Builders for a TrainingEngine's dependencies over the fakes in this module. */
export class TrainingHarness {
  /**
   * A typed engine result over the fake rows: the run (and the model, when given) with the given fields, typed as
   * entities by the factory seam.
   */
  public static async ResultOf(run: Partial<FakeMLRun>, model: Partial<FakeMLModel> | null): Promise<TrainModelResult> {
    const r = Object.assign(new FakeMLRun('run-1'), run);
    const m = model === null ? null : Object.assign(new FakeMLModel('model-1'), model);
    const factory = new FakeEntityFactory(() => m || new FakeMLModel('unused'), () => r);
    return {
      model: m === null ? null : await factory.getEntityObject<MJMLModelEntity>('MJ: ML Models'),
      run: await factory.getEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs'),
    };
  }

  /**
   * The model a training run created; throws when the run shipped none. For tests of paths that always create one (a
   * pipeline without a Prediction Unit, or a gate decision that ships an artifact).
   */
  public static ModelOf(result: TrainModelResult): MJMLModelEntity {
    if (result.model === null) throw new Error(`training run ${result.run.ID} shipped no model`);
    return result.model;
  }

  /**
   * The protocol row a unit harness serves: {@link ProtocolRowFixture.Row} with a minority-class minimum of 1. The
   * unit-years world's locked holdout holds one row of its rarer class, so the default minimum (20) would refuse every
   * shipped outcome; a test of that guard binds the default row itself.
   */
  public static UnitProtocolRow(): EvaluationProtocolColumns {
    return ProtocolRowFixture.Row({ MinMinorityClassRows: 1 });
  }

  /** Deps over the fakes: a pipeline (default `FakeMLPipeline`, `null` for none) and an in-memory artifact store. */
  public static BuildDeps(overrides?: Partial<TrainingDeps> & { pipeline?: FakeMLPipeline | null }): {
    deps: TrainingDeps;
    factory: FakeEntityFactory;
    store: InMemoryArtifactStore;
  } {
    const factory = (overrides?.entityFactory as FakeEntityFactory) || new FakeEntityFactory();
    const store = new InMemoryArtifactStore();
    const pipeline = overrides?.pipeline === undefined ? new FakeMLPipeline() : overrides.pipeline;
    const deps: TrainingDeps = {
      entityFactory: factory,
      recordLoader: new FakeRecordLoader(pipeline),
      artifactStore: store,
      contextUser: fakeUser,
      provider: fakeProvider,
    };
    return { deps, factory, store };
  }

  /**
   * A TrainingEngine plus deps for a pipeline that points at Prediction Unit `U-1` over the `Years` rows and is bound
   * to the `ProtocolRowFixture` protocol (served by a protocol store), trained by a fake trainer answering
   * `TrainerAnswers.CannedFor`; every run row gets `runId` (a 36-character ID: the trainer contract's run IDs are
   * database UUIDs).
   */
  public static ForUnit(
    rows: SourceRow[],
    unitColumns: PredictionUnitColumns,
    featureSteps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }] },
    runId = '00000000-0000-0000-0000-0000000000a1',
  ): {
    engine: TrainingEngine;
    deps: TrainingDeps;
    trainer: FakeTrainer;
    protocols: FakeEvaluationProtocolStore;
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
    pipeline.EvaluationProtocolID = ProtocolRowFixture.ID;
    const { deps, factory } = TrainingHarness.BuildDeps({ pipeline, entityFactory: new FakeEntityFactory(undefined, () => new FakeMLRun(runId)) });
    const trainer = new FakeTrainer((r) => TrainerAnswers.CannedFor(r));
    const protocols = new FakeEvaluationProtocolStore([TrainingHarness.UnitProtocolRow()]);
    deps.trainer = trainer;
    deps.protocols = protocols;
    deps.predictionUnits = new FakePredictionUnitStore(unitColumns);
    deps.assemblyMetadata = UnitYearsWorld.Metadata();
    deps.dataAccess = new TableDataAccess(UnitYearsWorld.Tables(rows));
    const files = new InMemorySnapshotFileStore('provider-local');
    deps.snapshotFiles = files;
    const snapshotStore = new FakeTrainingSnapshotStore(factory);
    deps.snapshots = snapshotStore;
    return { engine: new TrainingEngine(), deps, trainer, protocols, pipeline, runs: factory.Runs, models: factory.Models, snapshots: factory.Snapshots, files, snapshotStore };
  }
}

/** Finds the snapshots the factory saved by content hash, as the RunView store finds the saved rows. */
export class FakeTrainingSnapshotStore implements ITrainingSnapshotStore {
  /** Content-hash lookups that found a saved snapshot: each one is a build that reused it instead of writing. */
  public ReusedLookups = 0;
  constructor(private readonly factory: FakeEntityFactory) {}
  public async FindByContentHash(contentHash: string): Promise<MJMLTrainingSnapshotEntity | null> {
    const found = this.factory.Snapshots.find((s) => s.ID !== '' && s.ContentHash === contentHash);
    if (found) this.ReusedLookups++;
    return found ? (found as unknown as MJMLTrainingSnapshotEntity) : null;
  }
  public async LoadSnapshot(id: string): Promise<MJMLTrainingSnapshotEntity | null> {
    const found = this.factory.Snapshots.find((s) => s.ID === id);
    return found ? (found as unknown as MJMLTrainingSnapshotEntity) : null;
  }
  public async LoadRun(id: string): Promise<MJMLTrainingRunEntity | null> {
    const found = this.factory.Runs.find((r) => r.ID === id);
    return found ? (found as unknown as MJMLTrainingRunEntity) : null;
  }
  public async FindRunForIteration(iterationId: string): Promise<MJMLTrainingRunEntity | null> {
    const found = this.factory.Runs.find((r) => r.ExperimentSessionIterationID !== null && UUIDsEqual(r.ExperimentSessionIterationID, iterationId));
    return found ? (found as unknown as MJMLTrainingRunEntity) : null;
  }
}
