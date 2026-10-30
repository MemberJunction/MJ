import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJEvaluationProtocolEntity, MJFileEntity, MJFileStorageProviderEntity, MJMLModelEntity, MJMLTrainingRunEntity, MJPredictionUnitEntity,
  MJRecordProcessEntity, MJTrainingSnapshotEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDSet } from '@memberjunction/global';
import { ResolveStorageDriver } from '@memberjunction/storage';
import { JsonParse, TRAINING_RUN_RESULTS_SCHEMA, TrainingRunResultsParser } from '@memberjunction/predictive-studio-core';
import { HarnessAgent } from './agent';
import type { AgentStepResult, CandidateModel, TruthHarness } from './types';

/**
 * The pipelines, models, Prediction Units and Evaluation Protocols one harness created, by ID: the pipelines it created,
 * the models its trainings produced, the unit and protocol versions its fixtures saved, and the pipelines (found by
 * exact name) and models of its agent runs. Cleanup deletes exactly these. A read by name
 * prefix (`LIKE`) only observes: it never adds a pipeline, and adds a model only when its pipeline is already recorded.
 */
export class RunRecords {
  public readonly PipelineIDs = new UUIDSet();
  public readonly ModelIDs = new UUIDSet();
  public readonly PredictionUnitIDs = new UUIDSet();
  public readonly EvaluationProtocolIDs = new UUIDSet();
  private readonly agentPipelineNames = new Set<string>();

  /** The exact pipeline names of every builder-agent run the harness started (cleanup looks them up again). */
  public get AgentPipelineNames(): readonly string[] {
    return [...this.agentPipelineNames];
  }

  /** Record the names an agent run's pipelines get, before the run starts, so cleanup finds them however it ends. */
  public RecordAgentPipelineNames(names: readonly string[]): void {
    for (const n of names) this.agentPipelineNames.add(n);
  }

  /** Record a pipeline the run created (or an agent run of it created). */
  public RecordPipeline(id: string): void {
    this.PipelineIDs.Add(id);
  }

  /** Record a model the run trained (or an agent run of it built). */
  public RecordModel(id: string): void {
    this.ModelIDs.Add(id);
  }

  /** Record a Prediction Unit version the run saved (every version, not only the lineage root). */
  public RecordPredictionUnit(id: string): void {
    this.PredictionUnitIDs.Add(id);
  }

  /** Record an Evaluation Protocol version the run saved. */
  public RecordEvaluationProtocol(id: string): void {
    this.EvaluationProtocolIDs.Add(id);
  }

  /** Record what a builder-agent run created: its pipelines (a failed run's too) and the model it built, if any. */
  public RecordAgentRun(run: Pick<AgentStepResult, 'PipelineIDs' | 'BuildModelID'>): void {
    for (const id of run.PipelineIDs) this.RecordPipeline(id);
    if (run.BuildModelID) this.RecordModel(run.BuildModelID);
  }

  /**
   * Record the models a name-prefix read observed, but only those whose pipeline this run already recorded (by creation
   * or by exact name). A `LIKE` read can match another run's or a person's pipelines, so nothing it alone found is ever
   * recorded for deletion; its pipelines are never recorded.
   */
  public RecordObservedModels(models: ReadonlyArray<Pick<CandidateModel, 'ModelID' | 'PipelineID'>>): void {
    for (const m of models) {
      if (this.PipelineIDs.Has(m.PipelineID)) this.RecordModel(m.ModelID);
    }
  }

  /** `h` with every member that creates or reads back run pipelines/models recording their IDs here. */
  public Recording(h: TruthHarness): TruthHarness {
    return {
      ...h,
      CreatePipeline: async (spec) => {
        const p = await h.CreatePipeline(spec);
        this.RecordPipeline(p.ID);
        return p;
      },
      Train: async (pipeline, opts) => {
        const t = await h.Train(pipeline, opts);
        if (t.ModelID) this.RecordModel(t.ModelID);
        return t;
      },
      RunBuilderAgent: async (plan) => {
        this.RecordAgentPipelineNames(HarnessAgent.BuilderPipelineNames(plan));
        const r = await h.RunBuilderAgent(plan);
        this.RecordAgentRun(r);
        return r;
      },
      ModelsForPipelineNamePrefix: async (prefix) => {
        const models = await h.ModelsForPipelineNamePrefix(prefix);
        this.RecordObservedModels(models);
        return models;
      },
    };
  }
}

/** A row cleanup deletes: its key, `Delete()`, and the result a failed delete leaves. */
export type CleanupRow = Pick<BaseEntity, 'Delete' | 'LatestResult'> & { readonly ID: string };

/** A model row: a cleanup row with the pipeline it belongs to and its stored artifact file. */
export type CleanupModelRow = CleanupRow & Pick<MJMLModelEntity, 'PipelineID' | 'ArtifactFileID'>;

/** A scoring Record Process row: a cleanup row with the configuration that names its model. */
export type CleanupRecordProcessRow = CleanupRow & Pick<MJRecordProcessEntity, 'Configuration'>;

/** A Prediction Unit row: a cleanup row with its version (later versions are deleted before their lineage root). */
export type CleanupPredictionUnitRow = CleanupRow & Pick<MJPredictionUnitEntity, 'Version'>;

/** An Evaluation Protocol row: a cleanup row with its version (later versions are deleted before their lineage root). */
export type CleanupEvaluationProtocolRow = CleanupRow & Pick<MJEvaluationProtocolEntity, 'Version'>;

/** A training run row: a cleanup row with the Training Snapshot it trained on and its stored results (which name the trainer's artifact files). */
export type CleanupTrainingRunRow = CleanupRow & Pick<MJMLTrainingRunEntity, 'TrainingSnapshotID' | 'ValidationResults'>;

/** A Training Snapshot row: a cleanup row with its three stored files. */
export type CleanupSnapshotRow = CleanupRow & Pick<MJTrainingSnapshotEntity, 'MatrixFileID' | 'RowManifestFileID' | 'ProvenanceFileID'>;

/** An `MJ: Files` row: a cleanup row with the provider and key of the object it records. */
export type CleanupFileRow = CleanupRow & Pick<MJFileEntity, 'ProviderID' | 'ProviderKey'>;

/** Where cleanup reads the rows it deletes and removes stored objects (the entity layer in a run; a fake in a unit test). */
export interface CleanupStore {
  Models(filter: string): Promise<CleanupModelRow[]>;
  PredictionUnits(filter: string): Promise<CleanupPredictionUnitRow[]>;
  /** The `MJ: Evaluation Protocols` rows matching the filter. */
  EvaluationProtocols(filter: string): Promise<CleanupEvaluationProtocolRow[]>;
  RecordProcesses(filter: string): Promise<CleanupRecordProcessRow[]>;
  TrainingRuns(filter: string): Promise<CleanupTrainingRunRow[]>;
  TrainingSnapshots(filter: string): Promise<CleanupSnapshotRow[]>;
  Files(filter: string): Promise<CleanupFileRow[]>;
  Rows(entityName: string, filter: string): Promise<CleanupRow[]>;
  /** Delete the object a file row records, through its provider's driver; null when deleted, else why not. */
  DeleteStoredObject(file: CleanupFileRow): Promise<string | null>;
}

/** Deletes the pipelines and models a run recorded, and everything hanging off them, through the entity layer. */
export class HarnessCleanup {
  /** The entity-layer store on `provider` as `user`. */
  public static EntityStore(provider: IMetadataProvider, user: UserInfo): CleanupStore {
    return {
      Models: (filter) => HarnessCleanup.load<MJMLModelEntity>(provider, user, 'MJ: ML Models', filter),
      PredictionUnits: (filter) => HarnessCleanup.load<MJPredictionUnitEntity>(provider, user, 'MJ: Prediction Units', filter),
      EvaluationProtocols: (filter) => HarnessCleanup.load<MJEvaluationProtocolEntity>(provider, user, 'MJ: Evaluation Protocols', filter),
      RecordProcesses: (filter) => HarnessCleanup.load<MJRecordProcessEntity>(provider, user, 'MJ: Record Processes', filter),
      TrainingRuns: (filter) => HarnessCleanup.load<MJMLTrainingRunEntity>(provider, user, 'MJ: ML Training Runs', filter),
      TrainingSnapshots: (filter) => HarnessCleanup.load<MJTrainingSnapshotEntity>(provider, user, 'MJ: Training Snapshots', filter),
      Files: (filter) => HarnessCleanup.load<MJFileEntity>(provider, user, 'MJ: Files', filter),
      Rows: (entityName, filter) => HarnessCleanup.load<BaseEntity & { ID: string }>(provider, user, entityName, filter),
      DeleteStoredObject: (file) => HarnessCleanup.deleteStoredObject(provider, user, file),
    };
  }

  /**
   * Delete the recorded models (and every model trained from a recorded pipeline) and the recorded pipelines (and the
   * pipelines of recorded models), children first: scoring bindings; the models' scoring Record Processes with their
   * runs, run details and watermarks; training runs; then models, the Training Snapshots the runs trained on and the
   * recorded pipelines' snapshots, each deleted snapshot's three files (stored object, then `MJ: Files` row), the models'
   * artifact files and every artifact file a run's stored trainer result names, pipelines, the recorded Evaluation
   * Protocol versions (pipelines, runs and snapshots reference them), and last the recorded Prediction Unit versions
   * (pipelines and snapshots reference them).
   * Every row is attempted; deleted IDs leave `records`. Returns one line per row whose `Delete()` failed and per stored
   * object that could not be deleted.
   */
  public static async DeleteRecorded(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const modelFilter = HarnessCleanup.anyIn([['ID', records.ModelIDs], ['PipelineID', records.PipelineIDs]]);
    const models = modelFilter ? await store.Models(modelFilter) : [];
    const modelIds = new UUIDSet(models.map((m) => m.ID));
    const pipelineIds = new UUIDSet([...records.PipelineIDs, ...models.map((m) => m.PipelineID)]);
    const modelFileIds = models.flatMap((m) => (m.ArtifactFileID ? [m.ArtifactFileID] : []));
    const processes = modelIds.Size > 0 ? await HarnessCleanup.scoringProcesses(store, modelIds) : [];
    const processIds = new UUIDSet(processes.map((p) => p.ID));
    const processFilter = HarnessCleanup.anyIn([['RecordProcessID', processIds]]);
    const processRuns = processFilter ? await store.Rows('MJ: Process Runs', processFilter) : [];
    const processRunIds = new UUIDSet(processRuns.map((r) => r.ID));
    const bindingFilter = HarnessCleanup.anyIn([['MLModelID', modelIds]]);
    const runFilter = HarnessCleanup.anyIn([['PipelineID', pipelineIds], ['ResultingModelID', modelIds]]);
    const pipelineFilter = HarnessCleanup.anyIn([['ID', pipelineIds]]);
    const detailFilter = HarnessCleanup.anyIn([['ProcessRunID', processRunIds]]);
    const bindings = bindingFilter ? await store.Rows('MJ: ML Model Scoring Bindings', bindingFilter) : [];
    const details = detailFilter ? await store.Rows('MJ: Process Run Details', detailFilter) : [];
    const watermarks = processFilter ? await store.Rows('MJ: Record Process Watermarks', processFilter) : [];
    const runs = runFilter ? await store.TrainingRuns(runFilter) : [];
    const snapshotIds = new UUIDSet(runs.flatMap((r) => (r.TrainingSnapshotID ? [r.TrainingSnapshotID] : [])));
    const snapshotFilter = HarnessCleanup.anyIn([['ID', snapshotIds], ['PipelineID', pipelineIds]]);
    const snapshots = snapshotFilter ? await store.TrainingSnapshots(snapshotFilter) : [];
    const trainerFiles = runs.map((r) => HarnessCleanup.trainerArtifactFileIds(r));
    const fileFilter = HarnessCleanup.anyIn([['ID', new UUIDSet([...modelFileIds, ...trainerFiles.flatMap((t) => t.FileIDs)])]]);
    const files = fileFilter ? await store.Rows('MJ: Files', fileFilter) : [];
    const pipelines = pipelineFilter ? await store.Rows('MJ: ML Training Pipelines', pipelineFilter) : [];
    const failures = [
      ...trainerFiles.flatMap((t) => (t.Failure === null ? [] : [t.Failure])),
      ...(await HarnessCleanup.deleteAll('MJ: ML Model Scoring Bindings', bindings)),
      ...(await HarnessCleanup.deleteAll('MJ: Process Run Details', details)),
      ...(await HarnessCleanup.deleteAll('MJ: Process Runs', processRuns)),
      ...(await HarnessCleanup.deleteAll('MJ: Record Process Watermarks', watermarks)),
      ...(await HarnessCleanup.deleteAll('MJ: Record Processes', processes)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Training Runs', runs)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Models', models, (id) => records.ModelIDs.Delete(id))),
      ...(await HarnessCleanup.deleteSnapshots(store, snapshots)),
      ...(await HarnessCleanup.deleteAll('MJ: Files', files)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Training Pipelines', pipelines, (id) => records.PipelineIDs.Delete(id))),
      ...(await HarnessCleanup.deleteEvaluationProtocols(store, records)),
      ...(await HarnessCleanup.deletePredictionUnits(store, records)),
    ];
    return failures;
  }

  /**
   * Delete the Training Snapshot rows, then the three files of each snapshot that was deleted: the stored object first,
   * then its `MJ: Files` row (the snapshot row references the file rows, so it goes first). A snapshot whose row could
   * not be deleted keeps its files, so a surviving snapshot never loses its bytes; a file whose object could not be
   * deleted keeps its row, so the object stays findable. Returns one line per failure.
   */
  private static async deleteSnapshots(store: CleanupStore, snapshots: CleanupSnapshotRow[]): Promise<string[]> {
    const fileIdsOf = new Map(snapshots.map((s) => [s.ID, [s.MatrixFileID, s.RowManifestFileID, s.ProvenanceFileID]]));
    const deletedFileIds = new UUIDSet();
    const failures = await HarnessCleanup.deleteAll('MJ: Training Snapshots', snapshots, (id) => {
      for (const fileId of fileIdsOf.get(id) || []) deletedFileIds.Add(fileId);
    });
    const fileFilter = HarnessCleanup.anyIn([['ID', deletedFileIds]]);
    const files = fileFilter ? await store.Files(fileFilter) : [];
    const objectFailures = await Promise.all(files.map(async (f) => ({ File: f, Failure: await HarnessCleanup.tryDeleteStoredObject(store, f) })));
    const objectsDeleted = objectFailures.filter((o) => o.Failure === null).map((o) => o.File);
    return [
      ...failures,
      ...objectFailures.flatMap((o) => (o.Failure === null ? [] : [`stored object of MJ: Files ${o.File.ID} (${o.File.ProviderKey || '(no key)'}): ${o.Failure}`])),
      ...(await HarnessCleanup.deleteAll('MJ: Files', objectsDeleted)),
    ];
  }

  /** The store's object delete, with a thrown error (an unresolvable or unconfigured driver) reported as the failure, so the rest of cleanup still runs. */
  private static async tryDeleteStoredObject(store: CleanupStore, file: CleanupFileRow): Promise<string | null> {
    try {
      return await store.DeleteStoredObject(file);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Delete the object a file row records through the shipped driver of the provider the row names, initialised from
   * this process's environment (the same configuration the server stored it with). Returns null when deleted.
   */
  private static async deleteStoredObject(provider: IMetadataProvider, user: UserInfo, file: CleanupFileRow): Promise<string | null> {
    if (!file.ProviderKey) return 'the file row has no ProviderKey';
    const rows = await HarnessCleanup.load<MJFileStorageProviderEntity>(provider, user, 'MJ: File Storage Providers', `ID='${EscapeSQLString(file.ProviderID)}'`);
    const row = rows[0];
    if (!row) return `no MJ: File Storage Providers row ${file.ProviderID}`;
    const driver = ResolveStorageDriver(row);
    await driver.initialize();
    if (!driver.IsConfigured) return `storage provider "${row.Name}" is not configured in this process`;
    return (await driver.DeleteObject(file.ProviderKey)) ? null : `${row.Name} refused to delete it`;
  }

  /**
   * The `MJ: Files` rows a run's stored trainer result names (one per returned artifact; the finalist's is also its
   * model's). A run whose results are not a results envelope (a legacy run, no results) or not a completed trainer run
   * names none. A results envelope that does not parse is reported as a failure line: the files it names cannot be
   * found, so they would be left behind.
   */
  private static trainerArtifactFileIds(run: CleanupTrainingRunRow): { readonly FileIDs: readonly string[]; readonly Failure: string | null } {
    const id = run.ID;
    const json = JsonParse.ParseJsonText(run.ValidationResults, 'ValidationResults');
    const isEnvelope = json.Ok && JsonParse.IsJsonObject(json.Value) && JsonParse.JsonString(json.Value, 'schema') === TRAINING_RUN_RESULTS_SCHEMA;
    if (!isEnvelope) return { FileIDs: [], Failure: null };
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (parsed.Ok === false) {
      return { FileIDs: [], Failure: `MJ: ML Training Runs ${id}: its results envelope does not parse, so the artifact files it names cannot be found: ${parsed.Errors.join('; ')}` };
    }
    if (parsed.Value.status !== 'completed' || !parsed.Value.trainer) return { FileIDs: [], Failure: null };
    return { FileIDs: parsed.Value.trainer.artifacts.map((a) => a.fileId), Failure: null };
  }

  /**
   * Delete the recorded Prediction Unit versions, newest Version first, one Version at a time: every later version
   * references its lineage root (a self-referential key), so the root goes last. Returns one line per failed delete.
   */
  private static async deletePredictionUnits(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const filter = HarnessCleanup.anyIn([['ID', records.PredictionUnitIDs]]);
    const units = filter ? await store.PredictionUnits(filter) : [];
    return HarnessCleanup.deleteNewestVersionFirst('MJ: Prediction Units', units, (id) => records.PredictionUnitIDs.Delete(id));
  }

  /** The recorded Evaluation Protocol versions, newest first: every later version references its lineage root (version 1). */
  private static async deleteEvaluationProtocols(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const filter = HarnessCleanup.anyIn([['ID', records.EvaluationProtocolIDs]]);
    const protocols = filter ? await store.EvaluationProtocols(filter) : [];
    return HarnessCleanup.deleteNewestVersionFirst('MJ: Evaluation Protocols', protocols, (id) => records.EvaluationProtocolIDs.Delete(id));
  }

  /** Delete versioned rows one Version at a time, highest first, so no row is deleted while a later version references it. */
  private static async deleteNewestVersionFirst(entityName: string, rows: ReadonlyArray<CleanupRow & { readonly Version: number }>, onDeleted: (id: string) => void): Promise<string[]> {
    const versions = [...new Set(rows.map((r) => r.Version))].sort((a, b) => b - a);
    const failures: string[] = [];
    for (const v of versions) {
      failures.push(...(await HarnessCleanup.deleteAll(entityName, rows.filter((r) => r.Version === v), onDeleted)));
    }
    return failures;
  }

  /**
   * The `WorkType='ML Model'` Record Processes whose configuration names one of `modelIds`. The model is read from the
   * parsed configuration, never matched by text, so another model's process is never selected.
   */
  private static async scoringProcesses(store: CleanupStore, modelIds: UUIDSet): Promise<CleanupRecordProcessRow[]> {
    const all = await store.RecordProcesses(`WorkType = 'ML Model'`);
    return all.filter((p) => {
      const modelId = HarnessCleanup.configuredModelId(p.Configuration);
      return modelId !== null && modelIds.Has(modelId);
    });
  }

  /** The `modelId` a scoring Record Process's configuration names, or null. */
  private static configuredModelId(configuration: string | null): string | null {
    try {
      const parsed: { modelId?: string | number | boolean | null } = JSON.parse(configuration ?? '{}');
      return typeof parsed.modelId === 'string' ? parsed.modelId : null;
    } catch {
      return null;
    }
  }

  /** `Col IN ('a','b') OR Other IN (…)` over the non-empty ID sets; null when every set is empty. */
  private static anyIn(clauses: Array<[string, UUIDSet]>): string | null {
    const parts = clauses
      .filter(([, ids]) => ids.Size > 0)
      .map(([column, ids]) => `${column} IN (${[...ids].map((id) => `'${EscapeSQLString(id)}'`).join(',')})`);
    return parts.length > 0 ? parts.join(' OR ') : null;
  }

  /** The rows of `entityName` matching `filter`, as entity objects (Delete needs a loaded entity). */
  private static async load<T extends BaseEntity>(provider: IMetadataProvider, user: UserInfo, entityName: string, filter: string): Promise<T[]> {
    const res = await RunView.FromMetadataProvider(provider).RunView<T>(
      { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true },
      user,
    );
    if (!res.Success) throw new Error(`cleanup: reading ${entityName}: ${res.ErrorMessage}`);
    return res.Results;
  }

  /** Delete each row (one stage of the FK order, so the rows are independent and run in parallel); the failures. */
  private static async deleteAll(entityName: string, rows: CleanupRow[], onDeleted: (id: string) => void = () => undefined): Promise<string[]> {
    const failures = await Promise.all(rows.map(async (row) => {
      const id = row.ID; // read before Delete(): a deleted entity object no longer carries its field values
      if (await row.Delete()) {
        onDeleted(id);
        return null;
      }
      return `${entityName} ${id}: ${row.LatestResult?.CompleteMessage || 'Delete() returned false'}`;
    }));
    return failures.filter((f): f is string => f !== null);
  }
}
