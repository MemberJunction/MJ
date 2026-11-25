import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJActionParamEntity, MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJAIPromptRunEntity, MJConversationDetailEntity, MJMLEvaluationProtocolEntity, MJFileEntity, MJFileStorageProviderEntity, MJMLModelEntity, MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity, MJMLPredictionUnitEntity, MJRecordProcessEntity, MJMLTrainingSnapshotEntity, MJScheduledJobEntity, MJMLModelScoringBindingEntity,
} from '@memberjunction/core-entities';
import { MJMLModelPublishRecordEntity, PredictiveStudioWithdrawScoringBindingOperation } from '@memberjunction/core-entities';
import { MonitoringJobs, PublishRecordWriteAuthorisations } from '@memberjunction/predictive-studio';
import { EscapeSQLString, UUIDMap } from '@memberjunction/global';
import { ResolveStorageDriver } from '@memberjunction/storage';
import { JsonParse, TRAINING_RUN_RESULTS_SCHEMA, TrainingRunResultsParser } from '@memberjunction/predictive-studio-core';
import { HarnessAgent } from './agent';
import type { AgentStepResult, CandidateModel, TruthHarness } from './types';

/**
 * A set of record IDs that matches case-insensitively, as `UUIDSet` does, but iterates each ID as it was first recorded
 * (the value the database or a saved entity returned), so cleanup's `IN (…)` filters never carry a normalized ID.
 */
export class RecordIDSet implements Iterable<string> {
  private readonly ids = new UUIDMap<string>();

  public constructor(ids: Iterable<string> = []) {
    for (const id of ids) this.Add(id);
  }

  /** Adds an ID; a case variant of an ID already in the set keeps the first spelling. */
  public Add(id: string): this {
    if (!this.ids.Has(id)) this.ids.Set(id, id);
    return this;
  }

  /** True when the ID (any case) is in the set. */
  public Has(id: string): boolean {
    return this.ids.Has(id);
  }

  /** Removes the ID (any case); true when it was present. */
  public Delete(id: string): boolean {
    return this.ids.Delete(id);
  }

  /** Number of distinct IDs. */
  public get Size(): number {
    return this.ids.Size;
  }

  public [Symbol.iterator](): Iterator<string> {
    return this.ids.Values();
  }
}

/**
 * The pipelines, models, Prediction Units and Evaluation Protocols one harness created, by ID: the pipelines it created,
 * the models its trainings produced, the unit and protocol versions its fixtures saved, and the pipelines (found by
 * exact name) and models of its agent runs. Cleanup deletes exactly these. A read by name
 * prefix (`LIKE`) only observes: it never adds a pipeline, and adds a model only when its pipeline is already recorded.
 */
export class RunRecords {
  public readonly PipelineIDs = new RecordIDSet();
  public readonly ModelIDs = new RecordIDSet();
  public readonly PredictionUnitIDs = new RecordIDSet();
  public readonly EvaluationProtocolIDs = new RecordIDSet();
  /** The `MJ: AI Agent Runs` the harness started (each builder-agent run's root run). */
  public readonly AgentRunIDs = new RecordIDSet();
  /**
   * The `MJ: Scheduled Jobs` a check of the run created and deletes itself (a one-off job); recorded so cleanup deletes
   * the notifications the scheduler sent about them (D4-146).
   */
  public readonly ScheduledJobIDs = new RecordIDSet();
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

  /** Record a scheduled job a check of the run created (the check deletes the job; cleanup deletes its notifications). */
  public RecordScheduledJob(id: string): void {
    this.ScheduledJobIDs.Add(id);
  }

  /** Record a Prediction Unit version the run saved (every version, not only the lineage root). */
  public RecordPredictionUnit(id: string): void {
    this.PredictionUnitIDs.Add(id);
  }

  /** Record an Evaluation Protocol version the run saved. */
  public RecordEvaluationProtocol(id: string): void {
    this.EvaluationProtocolIDs.Add(id);
  }

  /** Records the Prediction Unit and Evaluation Protocol a pipeline is bound to (each when set). */
  public RecordPipelineBindings(p: Pick<MJMLTrainingPipelineEntity, 'PredictionUnitID' | 'EvaluationProtocolID'>): void {
    if (p.PredictionUnitID) this.RecordPredictionUnit(p.PredictionUnitID);
    if (p.EvaluationProtocolID) this.RecordEvaluationProtocol(p.EvaluationProtocolID);
  }

  /** Record what a builder-agent run created: the agent run itself, its pipelines (a failed run's too) and the model it built, if any. */
  public RecordAgentRun(run: Pick<AgentStepResult, 'AgentRunID' | 'PipelineIDs' | 'BuildModelID'>): void {
    if (run.AgentRunID) this.AgentRunIDs.Add(run.AgentRunID);
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
      RunBuilderAgent: async (plan, options) => {
        this.RecordAgentPipelineNames(HarnessAgent.BuilderPipelineNames(plan));
        const r = await h.RunBuilderAgent(plan, options);
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
export type CleanupPredictionUnitRow = CleanupRow & Pick<MJMLPredictionUnitEntity, 'Version'>;

/** An Evaluation Protocol row: a cleanup row with its version (later versions are deleted before their lineage root). */
export type CleanupEvaluationProtocolRow = CleanupRow & Pick<MJMLEvaluationProtocolEntity, 'Version'>;

/**
 * A training run row: a cleanup row with the Training Snapshot it trained on, its stored results (which name the
 * trainer's artifact files), and the model it produced, which cleanup clears and saves before that model is deleted.
 */
export type CleanupTrainingRunRow = CleanupRow & Pick<BaseEntity, 'Save'> & Pick<MJMLTrainingRunEntity, 'TrainingSnapshotID' | 'ValidationResults' | 'ResultingModelID'>;

/** A Training Snapshot row: a cleanup row with its three stored files. */
export type CleanupSnapshotRow = CleanupRow & Pick<MJMLTrainingSnapshotEntity, 'MatrixFileID' | 'RowManifestFileID' | 'ProvenanceFileID'>;

/** A scoring binding row: a cleanup row with its status (an active binding is withdrawn before it is deleted). */
export type CleanupBindingRow = CleanupRow & Pick<MJMLModelScoringBindingEntity, 'Status'>;

/** A scheduled job row: a cleanup row with the configuration that names the model a monitoring job watches. */
export type CleanupScheduledJobRow = CleanupRow & Pick<MJScheduledJobEntity, 'Configuration'>;

/** An `MJ: ML Model Publish Records` row: a cleanup row with the sign-off record it consumed (a record naming a sign-off references it). */
export type CleanupPublishRecordRow = CleanupRow & Pick<MJMLModelPublishRecordEntity, 'SignOffID'>;

/** An `MJ: Action Params` row: a cleanup row with the Action it belongs to. */
export type CleanupActionParamRow = CleanupRow & Pick<MJActionParamEntity, 'ActionID'>;

/** An `MJ: Files` row: a cleanup row with the provider and key of the object it records. */
export type CleanupFileRow = CleanupRow & Pick<MJFileEntity, 'ProviderID' | 'ProviderKey'>;

/** An `MJ: AI Agent Runs` row: a cleanup row with its parent run (a sub-agent run names it) and the conversation it ran in. */
export type CleanupAgentRunRow = CleanupRow & Pick<MJAIAgentRunEntity, 'ParentRunID' | 'ConversationID'>;

/** An `MJ: AI Agent Run Steps` row: a cleanup row with its number, its type and the log row it names (a Prompt step names its prompt run). */
export type CleanupAgentRunStepRow = CleanupRow & Pick<MJAIAgentRunStepEntity, 'StepNumber' | 'StepType' | 'TargetLogID'>;

/** An `MJ: AI Prompt Runs` row: a cleanup row with its parent prompt run. */
export type CleanupPromptRunRow = CleanupRow & Pick<MJAIPromptRunEntity, 'ParentID'>;

/** An `MJ: Conversation Details` row: a cleanup row with the detail it replies to. */
export type CleanupConversationDetailRow = CleanupRow & Pick<MJConversationDetailEntity, 'ParentID'>;

/** Where cleanup reads the rows it deletes and removes stored objects (the entity layer in a run; a fake in a unit test). */
export interface CleanupStore {
  Models(filter: string): Promise<CleanupModelRow[]>;
  PredictionUnits(filter: string): Promise<CleanupPredictionUnitRow[]>;
  /** The `MJ: ML Evaluation Protocols` rows matching the filter. */
  EvaluationProtocols(filter: string): Promise<CleanupEvaluationProtocolRow[]>;
  RecordProcesses(filter: string): Promise<CleanupRecordProcessRow[]>;
  /** The `MJ: ML Model Scoring Bindings` rows matching the filter, with their status. */
  ScoringBindings(filter: string): Promise<CleanupBindingRow[]>;
  /** Withdraw a scoring binding (`PredictiveStudio.WithdrawScoringBinding`); null when withdrawn, else why not. */
  WithdrawBinding(bindingId: string): Promise<string | null>;
  TrainingRuns(filter: string): Promise<CleanupTrainingRunRow[]>;
  TrainingSnapshots(filter: string): Promise<CleanupSnapshotRow[]>;
  Files(filter: string): Promise<CleanupFileRow[]>;
  Rows(entityName: string, filter: string): Promise<CleanupRow[]>;
  /** The lifecycle gate's model-monitoring jobs (`MonitoringJobs.JOB_TYPE_NAME`), every status, with their configuration. */
  MonitoringJobs(): Promise<CleanupScheduledJobRow[]>;
  /** The `MJ: Action Params` rows matching the filter, with their Action. */
  ActionParams(filter: string): Promise<CleanupActionParamRow[]>;
  /** The `MJ: ML Model Publish Records` rows matching the filter, with the sign-off each consumed. */
  PublishRecords(filter: string): Promise<CleanupPublishRecordRow[]>;
  /** The `MJ: AI Agent Runs` rows matching the filter, with their parent run and conversation. */
  AgentRuns(filter: string): Promise<CleanupAgentRunRow[]>;
  /** The `MJ: AI Agent Run Steps` rows matching the filter, with their number, type and target log row. */
  AgentRunSteps(filter: string): Promise<CleanupAgentRunStepRow[]>;
  /** The `MJ: AI Prompt Runs` rows matching the filter, with their parent prompt run. */
  PromptRuns(filter: string): Promise<CleanupPromptRunRow[]>;
  /** The `MJ: Conversation Details` rows matching the filter, with the detail each replies to. */
  ConversationDetails(filter: string): Promise<CleanupConversationDetailRow[]>;
  /** Delete the object a file row records, through its provider's driver; null when deleted, else why not. */
  DeleteStoredObject(file: CleanupFileRow): Promise<string | null>;
}

/**
 * What the recorded agent runs left: the rows that reference a run or its conversation (agent examples and notes drawn
 * from them, run media), the runs' steps, the prompt runs their Prompt steps name, the runs (sub-agent runs before the
 * run that started them) and the conversations they ran in with their details.
 */
interface AgentRows {
  readonly Examples: CleanupRow[];
  readonly Notes: CleanupRow[];
  readonly Media: CleanupRow[];
  readonly Steps: CleanupAgentRunStepRow[];
  readonly PromptRuns: CleanupPromptRunRow[];
  /** Deepest sub-agent runs first, the recorded runs last. */
  readonly RunsByDepth: CleanupAgentRunRow[][];
  readonly Details: CleanupConversationDetailRow[];
  readonly Conversations: CleanupRow[];
}

/** The scoring rows hanging off the recorded pipelines and models. */
interface ScoringRows {
  readonly Processes: CleanupRecordProcessRow[];
  readonly ProcessRuns: CleanupRow[];
  /** The pipelines' scoring bindings. */
  readonly Bindings: CleanupBindingRow[];
  /** Every Feature Value a binding names (its `Model` rows, and `Human` rows entered against it). */
  readonly BindingFeatureValues: CleanupRow[];
  /** The `MJ: ML Scoring Runs` of the bindings and the models. */
  readonly ScoringRuns: CleanupRow[];
  readonly Details: CleanupRow[];
  readonly Watermarks: CleanupRow[];
}

/**
 * What the lifecycle gate wrote for the recorded models and runs: their publish records (a published model's record, a
 * sign-off, a refusal record, a run-level refusal), split into the records that name a sign-off and the rest (a record
 * references the sign-off it consumed, `FK_MLModelPublishRecord_SignOff`); the models' monitoring jobs with their job
 * runs; the per-model scoring Actions generated on publish with their params; and the models' output bindings, which
 * Evaluate creates. All reference the models or runs, so they are deleted first.
 */
interface GateRows {
  readonly SignOffConsumers: CleanupRow[];
  readonly OtherPublishRecords: CleanupRow[];
  readonly MonitoringJobRuns: CleanupRow[];
  readonly MonitoringJobs: CleanupRow[];
  readonly ScoringActionParams: CleanupRow[];
  readonly ScoringActions: CleanupRow[];
  readonly OutputBindings: CleanupRow[];
  /** The models' `MJ: ML Monitoring Results` rows (they reference the model, its monitoring job's run and a challenger run). */
  readonly MonitoringResults: CleanupRow[];
}

/** Every row `HarnessCleanup.DeleteRecorded` deletes before the recorded protocol and unit versions. */
interface RecordedRows extends ScoringRows, GateRows {
  readonly Models: CleanupModelRow[];
  readonly Runs: CleanupTrainingRunRow[];
  readonly Snapshots: CleanupSnapshotRow[];
  readonly TrainerFiles: ReadonlyArray<{ readonly FileIDs: readonly string[]; readonly Failure: string | null }>;
  readonly Files: CleanupFileRow[];
  readonly Pipelines: CleanupRow[];
}

/** Deletes the pipelines and models a run recorded, and everything hanging off them, through the entity layer. */
export class HarnessCleanup {
  /**
   * The most deletes one stage runs at once. Each delete is a GraphQL request, and the client's HTTP agent (undici,
   * Node's `fetch`) opens a socket for every request in flight with no per-origin cap. A stage of hundreds of Process
   * Run Details deleted all at once put ~1,600 requests in flight and opened over 1,100 sockets: MJAPI's accept queue
   * stayed at its 128 limit (macOS `kern.ipc.somaxconn`) for ~10 s while it served them, so the connects of hundreds of
   * them timed out client-side (`ETIMEDOUT` on both `::1` and `127.0.0.1`), the request was never sent (MJAPI logged
   * nothing), and each of those rows' `Delete()` failed with "GraphQL Error (Code: unknown)".
   */
  public static readonly MAX_CONCURRENT_DELETES = 8;

  /**
   * The in-flight limit of a stage whose rows' generated `Delete()` opens its own transaction on the shared provider
   * (`CascadeDeletes`: `MJ: Actions` and every agent-run-stage entity but the examples, notes and media). Two such deletes
   * in flight at once make the second join the first's transaction as a savepoint, which the provider reports on stderr
   * (#4786), so these stages delete one row at a time — the agent-run stage whole, in D4-62's order.
   */
  public static readonly SERIAL_DELETES = 1;

  /** The entity-layer store on `provider` as `user`. */
  public static EntityStore(provider: IMetadataProvider, user: UserInfo): CleanupStore {
    return {
      Models: (filter) => HarnessCleanup.load<MJMLModelEntity>(provider, user, 'MJ: ML Models', filter),
      PredictionUnits: (filter) => HarnessCleanup.load<MJMLPredictionUnitEntity>(provider, user, 'MJ: ML Prediction Units', filter),
      EvaluationProtocols: (filter) => HarnessCleanup.load<MJMLEvaluationProtocolEntity>(provider, user, 'MJ: ML Evaluation Protocols', filter),
      RecordProcesses: (filter) => HarnessCleanup.load<MJRecordProcessEntity>(provider, user, 'MJ: Record Processes', filter),
      ScoringBindings: (filter) => HarnessCleanup.load<MJMLModelScoringBindingEntity>(provider, user, 'MJ: ML Model Scoring Bindings', filter),
      WithdrawBinding: async (bindingId) => {
        const r = await new PredictiveStudioWithdrawScoringBindingOperation().Execute({ bindingId }, { provider, user });
        return r.Success ? null : r.ErrorMessage || r.ResultCode || 'the withdrawal returned no result';
      },
      TrainingRuns: (filter) => HarnessCleanup.load<MJMLTrainingRunEntity>(provider, user, 'MJ: ML Training Runs', filter),
      TrainingSnapshots: (filter) => HarnessCleanup.load<MJMLTrainingSnapshotEntity>(provider, user, 'MJ: ML Training Snapshots', filter),
      Files: (filter) => HarnessCleanup.load<MJFileEntity>(provider, user, 'MJ: Files', filter),
      Rows: (entityName, filter) => HarnessCleanup.load<BaseEntity & { ID: string }>(provider, user, entityName, filter),
      MonitoringJobs: async () => {
        const types = await HarnessCleanup.load<BaseEntity & { ID: string }>(provider, user, 'MJ: Scheduled Job Types', `Name = '${EscapeSQLString(MonitoringJobs.JOB_TYPE_NAME)}'`);
        const typeIds = new RecordIDSet(types.map((t) => t.ID));
        const filter = HarnessCleanup.anyIn([['JobTypeID', typeIds]]);
        return filter ? HarnessCleanup.load<MJScheduledJobEntity>(provider, user, 'MJ: Scheduled Jobs', filter) : [];
      },
      ActionParams: (filter) => HarnessCleanup.load<MJActionParamEntity>(provider, user, 'MJ: Action Params', filter),
      PublishRecords: (filter) => HarnessCleanup.load<MJMLModelPublishRecordEntity>(provider, user, 'MJ: ML Model Publish Records', filter),
      AgentRuns: (filter) => HarnessCleanup.load<MJAIAgentRunEntity>(provider, user, 'MJ: AI Agent Runs', filter),
      AgentRunSteps: (filter) => HarnessCleanup.load<MJAIAgentRunStepEntity>(provider, user, 'MJ: AI Agent Run Steps', filter),
      PromptRuns: (filter) => HarnessCleanup.load<MJAIPromptRunEntity>(provider, user, 'MJ: AI Prompt Runs', filter),
      ConversationDetails: (filter) => HarnessCleanup.load<MJConversationDetailEntity>(provider, user, 'MJ: Conversation Details', filter),
      DeleteStoredObject: (file) => HarnessCleanup.deleteStoredObject(provider, user, file),
    };
  }

  /**
   * Delete the recorded models (and every model trained from a recorded pipeline) and the recorded pipelines (and the
   * pipelines of recorded models), children first: the pipelines' scoring bindings (an active one withdrawn first, then
   * the Feature Values and scoring runs that name a binding, then the bindings); the models' scoring Record Processes with their
   * runs, run details and watermarks; the models' monitoring period rows; what the lifecycle gate wrote for the models and runs (publish records — those
   * naming a sign-off before the rest, run-level refusals included —, the monitoring jobs' runs, the jobs, the generated
   * scoring Actions and their params, the models' output bindings); then the run/model cycle (a run names the model it produced in `ResultingModelID`,
   * and the model names the run in `TrainingRunID`): each run's `ResultingModelID` that names a model being deleted is
   * cleared and saved, then the models, then the training runs; then the Training Snapshots the runs trained on and the
   * recorded pipelines' snapshots, each deleted snapshot's three files (stored object, then `MJ: Files` row), the models'
   * artifact files and every artifact file a run's stored trainer result names (stored object, then row), pipelines,
   * the recorded Evaluation Protocol versions (pipelines, runs and snapshots reference them), and last the recorded
   * Prediction Unit versions (pipelines and snapshots reference them); and last the recorded agent runs
   * ({@link deleteAgentRuns}: what references them, their steps, their prompt runs, the runs, their conversations).
   * Every row is attempted, at most {@link MAX_CONCURRENT_DELETES} at a time; deleted IDs leave `records`. Returns one
   * line per row whose `Delete()` failed and per stored object that could not be deleted.
   */
  public static async DeleteRecorded(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const r = await HarnessCleanup.readRecorded(store, records);
    return [
      ...r.TrainerFiles.flatMap((t) => (t.Failure === null ? [] : [t.Failure])),
      ...(await HarnessCleanup.deleteBindings(store, r)),
      ...(await HarnessCleanup.deleteAll('MJ: Process Run Details', r.Details)),
      ...(await HarnessCleanup.deleteAll('MJ: Process Runs', r.ProcessRuns)),
      ...(await HarnessCleanup.deleteAll('MJ: Record Process Watermarks', r.Watermarks)),
      ...(await HarnessCleanup.deleteAll('MJ: Record Processes', r.Processes)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Monitoring Results', r.MonitoringResults)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Model Publish Records', r.SignOffConsumers)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Model Publish Records', r.OtherPublishRecords)),
      ...(await HarnessCleanup.deleteAll('MJ: Scheduled Job Runs', r.MonitoringJobRuns)),
      ...(await HarnessCleanup.deleteAll('MJ: Scheduled Jobs', r.MonitoringJobs)),
      ...(await HarnessCleanup.deleteAll('MJ: Action Params', r.ScoringActionParams)),
      ...(await HarnessCleanup.deleteAll('MJ: Actions', r.ScoringActions, undefined, HarnessCleanup.SERIAL_DELETES)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Output Bindings', r.OutputBindings)),
      ...(await HarnessCleanup.detachRunsFromModels(r.Runs, new RecordIDSet(r.Models.map((m) => m.ID)))),
      ...(await HarnessCleanup.deleteAll('MJ: ML Models', r.Models, (id) => records.ModelIDs.Delete(id))),
      ...(await HarnessCleanup.deleteAll('MJ: ML Training Runs', r.Runs)),
      ...(await HarnessCleanup.deleteSnapshots(store, r.Snapshots)),
      ...(await HarnessCleanup.deleteStoredFiles(store, r.Files)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Training Pipelines', r.Pipelines, (id) => records.PipelineIDs.Delete(id))),
      ...(await HarnessCleanup.deleteEvaluationProtocols(store, records)),
      ...(await HarnessCleanup.deletePredictionUnits(store, records)),
      ...(await HarnessCleanup.deleteAgentRuns(store, records)),
    ];
  }

  /**
   * Delete the recorded agent runs and every row they left, children first (D4-62): the agent examples and notes drawn
   * from a run or its conversation and the runs' media (each references a run or the conversation); the runs' steps,
   * highest step number first (a step references earlier steps as its parent or payload source); the prompt runs the
   * Prompt steps name, child prompt runs before their parent; the runs, sub-agent runs before the run that started
   * them; then the conversations the runs ran in (a run names its conversation and detail), replies before the details
   * they reply to, then the conversations. Every delete is serial ({@link SERIAL_DELETES}): most of these entities'
   * generated `Delete()` opens its own transaction on the shared provider. Deleted run IDs leave `records`. Returns one
   * line per failed delete.
   */
  private static async deleteAgentRuns(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const a = await HarnessCleanup.readAgentRows(store, records.AgentRunIDs);
    const serial = HarnessCleanup.SERIAL_DELETES;
    const failures = [
      ...(await HarnessCleanup.deleteAll('MJ: AI Agent Examples', a.Examples, undefined, serial)),
      ...(await HarnessCleanup.deleteAll('MJ: AI Agent Notes', a.Notes, undefined, serial)),
      ...(await HarnessCleanup.deleteAll('MJ: AI Agent Run Medias', a.Media, undefined, serial)),
      ...(await HarnessCleanup.deleteHighestFirst('MJ: AI Agent Run Steps', a.Steps, (step) => step.StepNumber, () => undefined, serial)),
      ...(await HarnessCleanup.deleteChildrenFirst('MJ: AI Prompt Runs', a.PromptRuns, serial)),
    ];
    for (const level of a.RunsByDepth) failures.push(...(await HarnessCleanup.deleteAll('MJ: AI Agent Runs', level, (id) => records.AgentRunIDs.Delete(id), serial)));
    failures.push(...(await HarnessCleanup.deleteChildrenFirst('MJ: Conversation Details', a.Details, serial)));
    failures.push(...(await HarnessCleanup.deleteAll('MJ: Conversations', a.Conversations, undefined, serial)));
    return failures;
  }

  /** The rows {@link deleteAgentRuns} deletes, read before any is deleted. */
  private static async readAgentRows(store: CleanupStore, recorded: RecordIDSet): Promise<AgentRows> {
    const runsByDepth = await HarnessCleanup.agentRunsByDepth(store, recorded);
    const runs = runsByDepth.flat();
    const runIds = new RecordIDSet(runs.map((r) => r.ID));
    const conversationIds = new RecordIDSet(runs.flatMap((r) => (r.ConversationID ? [r.ConversationID] : [])));
    const runFilter = HarnessCleanup.anyIn([['AgentRunID', runIds]]);
    const steps = runFilter ? await store.AgentRunSteps(runFilter) : [];
    const promptIds = new RecordIDSet(steps.flatMap((s) => (s.StepType === 'Prompt' && s.TargetLogID ? [s.TargetLogID] : [])));
    const promptFilter = HarnessCleanup.anyIn([['ID', promptIds], ['ParentID', promptIds]]);
    const derivedFilter = HarnessCleanup.anyIn([['SourceAIAgentRunID', runIds], ['SourceConversationID', conversationIds]]);
    const conversationFilter = HarnessCleanup.anyIn([['ConversationID', conversationIds]]);
    const idFilter = HarnessCleanup.anyIn([['ID', conversationIds]]);
    return {
      Examples: derivedFilter ? await store.Rows('MJ: AI Agent Examples', derivedFilter) : [],
      Notes: derivedFilter ? await store.Rows('MJ: AI Agent Notes', derivedFilter) : [],
      Media: runFilter ? await store.Rows('MJ: AI Agent Run Medias', runFilter) : [],
      Steps: steps,
      PromptRuns: promptFilter ? await store.PromptRuns(promptFilter) : [],
      RunsByDepth: runsByDepth,
      Details: conversationFilter ? await store.ConversationDetails(conversationFilter) : [],
      Conversations: idFilter ? await store.Rows('MJ: Conversations', idFilter) : [],
    };
  }

  /** The recorded runs and their sub-agent runs (any depth), deepest level first; empty when nothing was recorded. */
  private static async agentRunsByDepth(store: CleanupStore, recorded: RecordIDSet): Promise<CleanupAgentRunRow[][]> {
    const rootFilter = HarnessCleanup.anyIn([['ID', recorded]]);
    if (rootFilter === null) return [];
    const levels: CleanupAgentRunRow[][] = [await store.AgentRuns(rootFilter)];
    const seen = new RecordIDSet(levels[0].map((r) => r.ID));
    for (let parents = levels[0]; parents.length > 0;) {
      const childFilter = HarnessCleanup.anyIn([['ParentRunID', new RecordIDSet(parents.map((r) => r.ID))]]);
      const children = childFilter ? (await store.AgentRuns(childFilter)).filter((r) => !seen.Has(r.ID)) : [];
      for (const c of children) seen.Add(c.ID);
      if (children.length > 0) levels.push(children);
      parents = children;
    }
    return levels.reverse();
  }

  /** Rows that may reference another row of the same set as their `ParentID`: the children first, then their parents, at most `maxInFlight` at a time. */
  private static async deleteChildrenFirst(
    entityName: string, rows: ReadonlyArray<CleanupRow & { readonly ParentID: string | null }>, maxInFlight: number = HarnessCleanup.MAX_CONCURRENT_DELETES,
  ): Promise<string[]> {
    const ids = new RecordIDSet(rows.map((r) => r.ID));
    const children = rows.filter((r) => r.ParentID !== null && ids.Has(r.ParentID));
    const parents = rows.filter((r) => !(r.ParentID !== null && ids.Has(r.ParentID)));
    return [...(await HarnessCleanup.deleteAll(entityName, children, undefined, maxInFlight)), ...(await HarnessCleanup.deleteAll(entityName, parents, undefined, maxInFlight))];
  }


  /**
   * Deletes the pipelines' scoring bindings, D4-62's order: the active ones withdrawn, the Feature Values and scoring runs
   * that name a binding deleted, then the bindings — read again first, because a binding row read before its withdrawal
   * still says `Active` and its `Delete()` is refused on that copy. Returns one line per failure.
   */
  private static async deleteBindings(store: CleanupStore, r: RecordedRows): Promise<string[]> {
    const failures = [
      ...(await HarnessCleanup.withdrawActive(store, r.Bindings)),
      ...(await HarnessCleanup.deleteAll('MJ: Feature Values', r.BindingFeatureValues)),
      ...(await HarnessCleanup.deleteAll('MJ: ML Scoring Runs', r.ScoringRuns)),
    ];
    const idFilter = HarnessCleanup.anyIn([['ID', new RecordIDSet(r.Bindings.map((b) => b.ID))]]);
    const fresh = idFilter ? await store.ScoringBindings(idFilter) : [];
    return [...failures, ...(await HarnessCleanup.deleteAll('MJ: ML Model Scoring Bindings', fresh))];
  }

  /**
   * Withdraws every active binding through `PredictiveStudio.WithdrawScoringBinding` (a binding deletes only once
   * withdrawn, D4-62), so its column copies are cleared through the entity layer. Returns one line per failure; that
   * binding's delete then fails too and is reported on its own line.
   */
  private static async withdrawActive(store: CleanupStore, bindings: readonly CleanupBindingRow[]): Promise<string[]> {
    const active = bindings.filter((b) => b.Status === 'Active');
    const failures = await HarnessCleanup.mapBounded(active, HarnessCleanup.SERIAL_DELETES, async (b) => {
      const failure = await store.WithdrawBinding(b.ID);
      return failure === null ? null : `MJ: ML Model Scoring Bindings ${b.ID}: could not be withdrawn before it is deleted: ${failure}`;
    });
    return failures.filter((f): f is string => f !== null);
  }

  /**
   * Clears and saves `ResultingModelID` on every run that names one of `modelIds`, so the models can be deleted before
   * the runs they reference (`MJ: ML Models.TrainingRunID`). Returns one line per run whose save failed; its model's
   * delete then fails too and is reported on its own line.
   */
  private static async detachRunsFromModels(runs: readonly CleanupTrainingRunRow[], modelIds: RecordIDSet): Promise<string[]> {
    const attached = runs.filter((r) => r.ResultingModelID !== null && modelIds.Has(r.ResultingModelID));
    const failures = await HarnessCleanup.mapBounded(attached, HarnessCleanup.MAX_CONCURRENT_DELETES, async (run) => {
      run.ResultingModelID = null;
      if (await run.Save()) return null;
      return `MJ: ML Training Runs ${run.ID}: could not clear ResultingModelID before its model is deleted: ${run.LatestResult?.CompleteMessage || 'Save() returned false'}`;
    });
    return failures.filter((f): f is string => f !== null);
  }

  /** Every row `DeleteRecorded` deletes before the protocol and unit versions: the models' side, then the runs' side. */
  private static async readRecorded(store: CleanupStore, records: RunRecords): Promise<RecordedRows> {
    const modelFilter = HarnessCleanup.anyIn([['ID', records.ModelIDs], ['PipelineID', records.PipelineIDs]]);
    const models = modelFilter ? await store.Models(modelFilter) : [];
    // The recorded model IDs too: a model deleted by SQL (the delete procedure's model step) leaves its monitoring job.
    const modelIds = new RecordIDSet([...models.map((m) => m.ID), ...records.ModelIDs]);
    const pipelineIds = new RecordIDSet([...records.PipelineIDs, ...models.map((m) => m.PipelineID)]);
    const scoring = await HarnessCleanup.readScoring(store, modelIds, pipelineIds);
    const runFilter = HarnessCleanup.anyIn([['PipelineID', pipelineIds], ['ResultingModelID', modelIds]]);
    const pipelineFilter = HarnessCleanup.anyIn([['ID', pipelineIds]]);
    const runs = runFilter ? await store.TrainingRuns(runFilter) : [];
    const snapshotIds = new RecordIDSet(runs.flatMap((r) => (r.TrainingSnapshotID ? [r.TrainingSnapshotID] : [])));
    const snapshotFilter = HarnessCleanup.anyIn([['ID', snapshotIds], ['PipelineID', pipelineIds]]);
    const snapshots = snapshotFilter ? await store.TrainingSnapshots(snapshotFilter) : [];
    const trainerFiles = runs.map((r) => HarnessCleanup.trainerArtifactFileIds(r));
    const modelFileIds = models.flatMap((m) => (m.ArtifactFileID ? [m.ArtifactFileID] : []));
    const fileFilter = HarnessCleanup.anyIn([['ID', new RecordIDSet([...modelFileIds, ...trainerFiles.flatMap((t) => t.FileIDs)])]]);
    const files = fileFilter ? await store.Files(fileFilter) : [];
    const pipelines = pipelineFilter ? await store.Rows('MJ: ML Training Pipelines', pipelineFilter) : [];
    const gate = await HarnessCleanup.readGateRows(store, modelIds, new RecordIDSet(runs.map((r) => r.ID)));
    return { ...scoring, ...gate, Models: models, Runs: runs, Snapshots: snapshots, TrainerFiles: trainerFiles, Files: files, Pipelines: pipelines };
  }

  /**
   * What the lifecycle gate wrote for the models and runs: publish records naming either (as the model, the model it
   * replaced, or the run — a run-level refusal names only the run), split by whether they name a sign-off; the
   * monitoring jobs whose configuration names a model, every status, with their job runs; and the generated scoring
   * Actions (child Actions whose `ModelID` param defaults to a model) with all their params; and the models' output
   * bindings.
   */
  private static async readGateRows(store: CleanupStore, modelIds: RecordIDSet, runIds: RecordIDSet): Promise<GateRows> {
    const recordFilter = HarnessCleanup.anyIn([['ModelID', modelIds], ['ReplacesModelID', modelIds], ['TrainingRunID', runIds]]);
    const jobs = modelIds.Size > 0 ? (await store.MonitoringJobs()).filter((j) => HarnessCleanup.namesModel(j.Configuration, modelIds)) : [];
    const jobRunFilter = HarnessCleanup.anyIn([['ScheduledJobID', new RecordIDSet(jobs.map((j) => j.ID))]]);
    const jobRuns = jobRunFilter ? await store.Rows('MJ: Scheduled Job Runs', jobRunFilter) : [];
    const defaultFilter = HarnessCleanup.anyIn([['DefaultValue', modelIds]]);
    const modelParams = defaultFilter ? await store.ActionParams(`Name = 'ModelID' AND Type = 'Input' AND (${defaultFilter})`) : [];
    const actionIds = new RecordIDSet(modelParams.map((p) => p.ActionID));
    const paramFilter = HarnessCleanup.anyIn([['ActionID', actionIds]]);
    const actionFilter = HarnessCleanup.anyIn([['ID', actionIds]]);
    const records = recordFilter ? await store.PublishRecords(recordFilter) : [];
    const bindingFilter = HarnessCleanup.anyIn([['ModelID', modelIds]]);
    return {
      SignOffConsumers: records.filter((r) => r.SignOffID !== null),
      OtherPublishRecords: records.filter((r) => r.SignOffID === null),
      MonitoringJobRuns: jobRuns,
      MonitoringJobs: jobs,
      ScoringActionParams: paramFilter ? await store.ActionParams(paramFilter) : [],
      ScoringActions: actionFilter ? await store.Rows('MJ: Actions', `ParentID IS NOT NULL AND (${actionFilter})`) : [],
      OutputBindings: bindingFilter ? await store.Rows('MJ: ML Output Bindings', bindingFilter) : [],
      MonitoringResults: bindingFilter ? await store.Rows('MJ: ML Monitoring Results', bindingFilter) : [],
    };
  }

  /** True when a monitoring job's configuration names one of `modelIds` as its `modelId`. */
  private static namesModel(configuration: string | null, modelIds: RecordIDSet): boolean {
    const json = JsonParse.ParseJsonText(configuration, 'Configuration');
    const modelId = json.Ok && JsonParse.IsJsonObject(json.Value) ? JsonParse.JsonString(json.Value, 'modelId') : null;
    return modelId !== null && modelIds.Has(modelId);
  }

  /**
   * The scoring rows: the pipelines' bindings with every Feature Value naming one and the bindings' and models' scoring
   * runs; the models' Record Processes, with the processes' runs, run details and watermarks.
   */
  private static async readScoring(store: CleanupStore, modelIds: RecordIDSet, pipelineIds: RecordIDSet): Promise<ScoringRows> {
    const processes = modelIds.Size > 0 ? await HarnessCleanup.scoringProcesses(store, modelIds) : [];
    const processFilter = HarnessCleanup.anyIn([['RecordProcessID', new RecordIDSet(processes.map((p) => p.ID))]]);
    const processRuns = processFilter ? await store.Rows('MJ: Process Runs', processFilter) : [];
    const bindingFilter = HarnessCleanup.anyIn([['MLTrainingPipelineID', pipelineIds]]);
    const bindings = bindingFilter ? await store.ScoringBindings(bindingFilter) : [];
    const bindingIds = new RecordIDSet(bindings.map((b) => b.ID));
    const valueFilter = HarnessCleanup.anyIn([['MLModelScoringBindingID', bindingIds]]);
    const scoringRunFilter = HarnessCleanup.anyIn([['MLModelScoringBindingID', bindingIds], ['ModelID', modelIds]]);
    const detailFilter = HarnessCleanup.anyIn([['ProcessRunID', new RecordIDSet(processRuns.map((r) => r.ID))]]);
    return {
      Processes: processes, ProcessRuns: processRuns,
      Bindings: bindings,
      BindingFeatureValues: valueFilter ? await store.Rows('MJ: Feature Values', valueFilter) : [],
      ScoringRuns: scoringRunFilter ? await store.Rows('MJ: ML Scoring Runs', scoringRunFilter) : [],
      Details: detailFilter ? await store.Rows('MJ: Process Run Details', detailFilter) : [],
      Watermarks: processFilter ? await store.Rows('MJ: Record Process Watermarks', processFilter) : [],
    };
  }

  /**
   * Delete the Training Snapshot rows, then the three files of each snapshot that was deleted: the stored object first,
   * then its `MJ: Files` row (the snapshot row references the file rows, so it goes first). A snapshot whose row could
   * not be deleted keeps its files, so a surviving snapshot never loses its bytes; a file whose object could not be
   * deleted keeps its row, so the object stays findable. Returns one line per failure.
   */
  private static async deleteSnapshots(store: CleanupStore, snapshots: CleanupSnapshotRow[]): Promise<string[]> {
    const fileIdsOf = new UUIDMap(snapshots.map((s) => [s.ID, [s.MatrixFileID, s.RowManifestFileID, s.ProvenanceFileID]]));
    const deletedFileIds = new RecordIDSet();
    const failures = await HarnessCleanup.deleteAll('MJ: ML Training Snapshots', snapshots, (id) => {
      for (const fileId of fileIdsOf.Get(id) || []) deletedFileIds.Add(fileId);
    });
    const fileFilter = HarnessCleanup.anyIn([['ID', deletedFileIds]]);
    const files = fileFilter ? await store.Files(fileFilter) : [];
    return [...failures, ...(await HarnessCleanup.deleteStoredFiles(store, files))];
  }

  /**
   * Delete each file's stored object, then the `MJ: Files` rows of the objects that were deleted: a file whose object
   * could not be deleted keeps its row, so the object stays findable. Returns one line per failure.
   */
  private static async deleteStoredFiles(store: CleanupStore, files: CleanupFileRow[]): Promise<string[]> {
    const objectFailures = await Promise.all(files.map(async (f) => ({ File: f, Failure: await HarnessCleanup.tryDeleteStoredObject(store, f) })));
    const objectsDeleted = objectFailures.filter((o) => o.Failure === null).map((o) => o.File);
    return [
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
   * Delete the recorded Prediction Unit versions and every version in their lineages (a decision-date advance saves
   * version 2 of a harness unit when a run crosses UTC midnight, and nothing records it), newest Version first, one
   * Version at a time: every later version references its lineage root (a self-referential key), so the root goes
   * last. Returns one line per failed delete.
   */
  private static async deletePredictionUnits(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const filter = HarnessCleanup.anyIn([['ID', records.PredictionUnitIDs], ['LineageRootID', records.PredictionUnitIDs]]);
    const units = filter ? await store.PredictionUnits(filter) : [];
    return HarnessCleanup.deleteNewestVersionFirst('MJ: ML Prediction Units', units, (id) => records.PredictionUnitIDs.Delete(id));
  }

  /**
   * The recorded Evaluation Protocol versions and every later version of their lineages (a monitoring challenger saves
   * one, D4-180), newest first: every later version references its lineage root (version 1).
   */
  private static async deleteEvaluationProtocols(store: CleanupStore, records: RunRecords): Promise<string[]> {
    const filter = HarnessCleanup.anyIn([['ID', records.EvaluationProtocolIDs], ['LineageRootID', records.EvaluationProtocolIDs]]);
    const protocols = filter ? await store.EvaluationProtocols(filter) : [];
    return HarnessCleanup.deleteNewestVersionFirst('MJ: ML Evaluation Protocols', protocols, (id) => records.EvaluationProtocolIDs.Delete(id));
  }

  /** Delete versioned rows one Version at a time, highest first, so no row is deleted while a later version references it. */
  private static async deleteNewestVersionFirst(entityName: string, rows: ReadonlyArray<CleanupRow & { readonly Version: number }>, onDeleted: (id: string) => void): Promise<string[]> {
    return HarnessCleanup.deleteHighestFirst(entityName, rows, (r) => r.Version, onDeleted);
  }

  /** Delete rows one `orderOf` value at a time, highest first (at most `maxInFlight` at a time), so no row is deleted while a higher-numbered row references it. */
  private static async deleteHighestFirst<T extends CleanupRow>(
    entityName: string, rows: readonly T[], orderOf: (row: T) => number, onDeleted: (id: string) => void, maxInFlight: number = HarnessCleanup.MAX_CONCURRENT_DELETES,
  ): Promise<string[]> {
    const orders = [...new Set(rows.map(orderOf))].sort((a, b) => b - a);
    const failures: string[] = [];
    for (const o of orders) {
      failures.push(...(await HarnessCleanup.deleteAll(entityName, rows.filter((r) => orderOf(r) === o), onDeleted, maxInFlight)));
    }
    return failures;
  }

  /**
   * The `WorkType='ML Model'` Record Processes whose configuration names one of `modelIds`. The model is read from the
   * parsed configuration, never matched by text, so another model's process is never selected.
   */
  private static async scoringProcesses(store: CleanupStore, modelIds: RecordIDSet): Promise<CleanupRecordProcessRow[]> {
    const all = await store.RecordProcesses(`WorkType = 'ML Model'`);
    return all.filter((p) => {
      const modelId = HarnessCleanup.configuredModelId(p.Configuration);
      return modelId !== null && modelIds.Has(modelId);
    });
  }

  /** The `modelId` a scoring Record Process's configuration names, or null (also for absent or malformed configuration). */
  private static configuredModelId(configuration: string | null): string | null {
    const json = JsonParse.ParseJsonText(configuration, 'Configuration');
    return json.Ok && JsonParse.IsJsonObject(json.Value) ? JsonParse.JsonString(json.Value, 'modelId') : null;
  }

  /** `Col IN ('a','b') OR Other IN (…)` over the non-empty ID sets, each ID as recorded; null when every set is empty. */
  private static anyIn(clauses: Array<[string, RecordIDSet]>): string | null {
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

  /**
   * Delete each row (one stage of the FK order, so the rows are independent), at most `maxInFlight` at a time
   * ({@link MAX_CONCURRENT_DELETES} by default, {@link SERIAL_DELETES} for a stage whose deletes open transactions); the
   * failures.
   */
  private static async deleteAll(
    entityName: string, rows: CleanupRow[], onDeleted: (id: string) => void = () => undefined, maxInFlight: number = HarnessCleanup.MAX_CONCURRENT_DELETES,
  ): Promise<string[]> {
    const failures = await HarnessCleanup.mapBounded(rows, maxInFlight, async (row) => {
      const id = row.ID; // read before Delete(): a deleted entity object no longer carries its field values
      // The publish ledger is append-only (PredictiveStudioPublishRecordGuard): the harness authorises the delete of
      // each fixture record it created, one-shot.
      if (row instanceof MJMLModelPublishRecordEntity) PublishRecordWriteAuthorisations.Instance.AuthoriseDelete(row);
      if (await row.Delete()) {
        onDeleted(id);
        return null;
      }
      return `${entityName} ${id}: ${row.LatestResult?.CompleteMessage || 'Delete() returned false'}`;
    });
    return failures.filter((f): f is string => f !== null);
  }

  /**
   * `fn` over every item with at most `maxInFlight` calls in flight; the results in item order. Each
   * worker takes the next item when its call settles, so one slow request never holds back the rest of the stage.
   */
  private static async mapBounded<T, R>(items: readonly T[], maxInFlight: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxInFlight, items.length) }, () => worker()));
    return results;
  }
}
