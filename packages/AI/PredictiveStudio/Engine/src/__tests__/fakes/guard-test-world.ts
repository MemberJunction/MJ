/**
 * `GuardTestWorld` — the fixtures of the registry's `PreSave` guard tests (Task M3.3). The guards act on REAL generated
 * entity objects (`MJMLModelEntity`, `MJMLTrainingRunEntity`) built over hand-written `EntityInfo`s, so dirty tracking,
 * `SetMany`, `ResetOldValue`, `IsSaved` and `TransactionGroup` are `BaseEntity`'s own; their provider is the gate
 * tests' `GateTestProvider` (a real `DatabaseProviderBase`) over a `GateTestStore` and a `GateWorld`, so the guards'
 * reads, and the publish re-derivation's, are served from the same in-memory rows the lifecycle-gate tests use.
 */
import { EntityInfo, TransactionGroupBase, UserInfo, type IEntityDataProvider, type TransactionResult } from '@memberjunction/core';
import { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { TrainingRunResultsParser, type LeakageFlag, type TrainerCompleted } from '@memberjunction/predictive-studio-core';

import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { GateTestProvider, GateTestStore, GateWorld, type Cell, type Row, type WorldModel } from './gate-test-store';
import { MemoryStorageAccount } from './storage-fakes';

/** A column of a hand-written entity: its name, SQL type and nullability. */
type Column = readonly [name: string, type: string, nullable: boolean];

const MODEL_COLUMNS: readonly Column[] = [
  ['PipelineID', 'uniqueidentifier', false], ['Version', 'int', false], ['AlgorithmID', 'uniqueidentifier', false], ['ArtifactFileID', 'uniqueidentifier', true], ['ArtifactSha256', 'nvarchar', true],
  ['FittedPreprocessing', 'nvarchar', true], ['FeatureSchema', 'nvarchar', false], ['TargetVariable', 'nvarchar', false], ['ProblemType', 'nvarchar', false],
  ['Metrics', 'nvarchar', true], ['HoldoutMetrics', 'nvarchar', true], ['FeatureImportance', 'nvarchar', true], ['Lineage', 'nvarchar', true],
  ['TrainedAt', 'datetimeoffset', true], ['TrainingDurationSec', 'int', true], ['TrainingRowCount', 'int', true], ['Status', 'nvarchar', false],
  ['PredictionUnitID', 'uniqueidentifier', true], ['EvaluationProtocolID', 'uniqueidentifier', true], ['TrainingSnapshotID', 'uniqueidentifier', true],
  ['TrainingRunID', 'uniqueidentifier', true], ['SnapshotHash', 'nvarchar', true], ['CodeVersion', 'nvarchar', true], ['FeatureSchemaHash', 'nvarchar', true],
  ['OutputSemantics', 'nvarchar', true], ['Delivery', 'nvarchar', true], ['StatusReason', 'nvarchar', true], ['ArtifactStatus', 'nvarchar', false],
  ['ArtifactCheckedAt', 'datetimeoffset', true], ['ServingWhileUnevaluated', 'bit', false],
];

const RUN_COLUMNS: readonly Column[] = [
  ['PipelineID', 'uniqueidentifier', false], ['ResultingModelID', 'uniqueidentifier', true], ['ExperimentSessionIterationID', 'uniqueidentifier', true],
  ['FeaturesUsed', 'nvarchar', true], ['AlgorithmID', 'uniqueidentifier', false], ['Hyperparameters', 'nvarchar', true], ['ValidationResults', 'nvarchar', true],
  ['Status', 'nvarchar', false], ['StartedAt', 'datetimeoffset', true], ['CompletedAt', 'datetimeoffset', true], ['ComputeCost', 'decimal', true],
  ['TokensUsed', 'int', true], ['Notes', 'nvarchar', true], ['TrainingSnapshotID', 'uniqueidentifier', true], ['EvaluationProtocolID', 'uniqueidentifier', true],
  ['CodeVersion', 'nvarchar', true], ['ComputeSeconds', 'decimal', true],
];

/** A hand-written `EntityInfo` with an `ID` key and `columns`, every API flag open. */
function entityInfo(id: string, name: string, baseTable: string, columns: readonly Column[]): EntityInfo {
  const fields = [['ID', 'uniqueidentifier', false] as const, ...columns].map(([Name, Type, AllowsNull], i) => ({
    ID: `${id.slice(0, 24)}${(100 + i).toString().padStart(12, '0')}`, EntityID: id, Name, Type, AllowsNull, IsPrimaryKey: Name === 'ID',
    Sequence: i + 1, Length: 0, Precision: 0, Scale: 0, AllowUpdateAPI: true,
  }));
  return new EntityInfo({
    ID: id, Name: name, SchemaName: '__mj', BaseTable: baseTable, BaseView: `vw${baseTable}s`, Status: 'Active', IncludeInAPI: true,
    AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false, EnableFieldLevelSecurity: false, EntityFields: fields,
  });
}

const MODEL_ENTITY = entityInfo('7B000000-0000-4000-8000-0000000000E1', 'MJ: ML Models', 'MLModel', MODEL_COLUMNS);
const RUN_ENTITY = entityInfo('7B000000-0000-4000-8000-0000000000E2', 'MJ: ML Training Runs', 'MLTrainingRun', RUN_COLUMNS);

/**
 * The gate tests' provider as an entity data provider too (what a server provider is: `GenericDatabaseProvider` adds
 * `Load`). The guard tests never load through it: rows are set as loaded values.
 */
export class GuardTestProvider extends GateTestProvider implements IEntityDataProvider {
  public async Load(): Promise<{}> {
    throw new Error('GuardTestProvider: Load is not used by the guard tests');
  }
}

/** A transaction group that never submits: a save made with it set is a deferred save. */
export class FakeTransactionGroup extends TransactionGroupBase {
  protected async HandleSubmit(): Promise<TransactionResult[]> {
    return [];
  }
}

/** The stored scheduled-job rows the R9 check resolves: a run of a monitoring job and a run of a Registry Check job. */
export interface JobRuns {
  readonly monitoringRun: { readonly ID: string };
  readonly registryCheckRun: { readonly ID: string };
}

/** The guard tests' world: real entities over the gate tests' in-memory rows. */
export class GuardTestWorld {
  public static readonly RegistryCheckJobTypeID = '7B000000-0000-4000-8000-0000000000F1';
  public readonly Store = new GateTestStore();
  public readonly World: GateWorld;
  public readonly Provider: GuardTestProvider;
  private next = 0;

  constructor(public readonly User: UserInfo) {
    this.World = new GateWorld(this.Store, new MemoryStorageAccount('guard-tests', []));
    this.Provider = new GuardTestProvider(this.Store);
  }

  /** A saved model row of the world (its run, protocol row, delivery and artifact stored) as a real entity. */
  public SavedModel(status: string, outcome: 'model' | 'keep' = 'keep'): MJMLModelEntity {
    return this.LoadModel(this.World.Model(status, outcome).ID);
  }

  /** The world model's id and run. */
  public WorldModel(status: string, outcome: 'model' | 'keep' = 'keep'): WorldModel {
    return this.World.Model(status, outcome);
  }

  /** A saved copy of `base`'s row under a new ID with `fields` replaced, as a real entity. */
  public PersistedCopy(base: WorldModel, fields: Row): MJMLModelEntity {
    const row = this.Store.Row('MJ: ML Models', base.ID);
    if (!row) throw new Error(`GuardTestWorld: no model ${base.ID}`);
    const id = this.id();
    this.Store.Insert('MJ: ML Models', { ...row, ID: id, Version: 900 + this.next, ...fields });
    return this.LoadModel(id);
  }

  /**
   * The stored model row with this ID as a real, saved entity: its values set as loaded values (`SetMany` with
   * `replaceOldValues`, which marks a row with its key set as saved), synchronously, as the fixtures are used.
   */
  public LoadModel(id: string): MJMLModelEntity {
    const model = new MJMLModelEntity(MODEL_ENTITY, this.provider());
    model.ContextCurrentUser = this.User;
    model.SetMany({ ...this.row('MJ: ML Models', id) }, false, true);
    if (!model.IsSaved) throw new Error(`GuardTestWorld: model ${id} did not load`);
    return model;
  }

  /** An unsaved model row with `fields` set. */
  public NewModel(fields: Row): MJMLModelEntity {
    const model = new MJMLModelEntity(MODEL_ENTITY, this.provider());
    model.ContextCurrentUser = this.User;
    model.NewRecord();
    model.SetMany(fields);
    return model;
  }

  /** The stored training run with this ID as a real, saved entity (loaded as {@link LoadModel} loads a model). */
  public LoadRun(id: string): MJMLTrainingRunEntity {
    const run = new MJMLTrainingRunEntity(RUN_ENTITY, this.provider());
    run.ContextCurrentUser = this.User;
    run.SetMany({ ...this.row('MJ: ML Training Runs', id) }, false, true);
    if (!run.IsSaved) throw new Error(`GuardTestWorld: run ${id} did not load`);
    return run;
  }

  /** A field of the stored model row. */
  public ModelCell(id: string, field: string): Cell {
    return this.row('MJ: ML Models', id)[field] ?? null;
  }

  /** Sets a field of the stored model row (what another session committed). */
  public SetModelCell(id: string, field: string, value: Cell): void {
    this.row('MJ: ML Models', id)[field] = value;
  }

  /** Sets a field of the stored training-run row (what another session committed). */
  public SetRunCell(id: string, field: string, value: Cell): void {
    this.row('MJ: ML Training Runs', id)[field] = value;
  }

  /** The completed trainer result whose stored gate intervals re-derive to `outcome` under the world's protocol. */
  public ResultThatRecomputesTo(outcome: 'no-signal' | 'model', runId: string): TrainerCompleted {
    const spec = ProtocolRowFixture.Spec();
    return outcome === 'no-signal' ? TrainerResultFixtures.CannedNoSignal(runId, spec) : TrainerResultFixtures.CannedModelWins(runId, spec);
  }

  /** Stores two scheduled-job runs: one of a Model Monitoring job, one of a Registry Check job (the R9 initiators). */
  public StoreJobRuns(): JobRuns {
    this.Store.Insert('MJ: Scheduled Job Types', { ID: GuardTestWorld.RegistryCheckJobTypeID, Name: 'Predictive Studio Registry Check' });
    const run = (jobTypeId: string): { readonly ID: string } => {
      const jobId = this.id();
      const runId = this.id();
      this.Store.Insert('MJ: Scheduled Jobs', { ID: jobId, JobTypeID: jobTypeId, Name: `job ${jobId}` });
      this.Store.Insert('MJ: Scheduled Job Runs', { ID: runId, ScheduledJobID: jobId, Status: 'Running' });
      return { ID: runId };
    };
    return { monitoringRun: run(GateWorld.JobTypeID), registryCheckRun: run(GuardTestWorld.RegistryCheckJobTypeID) };
  }

  /** The model's training run, finished: its stored leakage audit flags `flags`, as a real saved entity. */
  public FinishedRunOf(model: WorldModel, flags: readonly LeakageFlag[]): MJMLTrainingRunEntity {
    this.World.FlagLeakage(model.ID, flags);
    return this.LoadRun(model.RunID);
  }

  /** `validationResults` with the trainer result's leakage audit replaced by `flags` (an edit of stored evidence). */
  public static WithLeakageFlags(validationResults: string | null, flags: readonly LeakageFlag[]): string {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults || '');
    if (!parsed.Ok || parsed.Value.status !== 'completed') throw new Error('GuardTestWorld: not a completed training-run envelope');
    return JSON.stringify({ ...parsed.Value, trainer: { ...parsed.Value.trainer, leakageFlags: flags } });
  }

  private provider(): IEntityDataProvider {
    return this.Provider;
  }

  private row(entityName: string, id: string): Row {
    const row = this.Store.Row(entityName, id);
    if (!row) throw new Error(`GuardTestWorld: no ${entityName} row ${id}`);
    return row;
  }

  private id(): string {
    this.next++;
    return `7B000000-0000-4000-8000-${this.next.toString(16).padStart(12, '0').toUpperCase()}`;
  }
}
