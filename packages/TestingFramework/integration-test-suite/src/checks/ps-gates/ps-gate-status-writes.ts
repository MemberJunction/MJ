/**
 * The five ways a client can try to write `MJ: ML Models.Status` outside the lifecycle gate (G3.3, §5.1), each a real
 * call against MJAPI, and the audit read that says whether a Status change ever landed without the gate:
 *
 * 1. `ui` — the Explorer form's save: the generated entity loaded and saved through `GraphQLDataProvider`. A browser
 *    does not load the Predictive Studio Engine, but this process does, and the Engine registers the status guard's
 *    `PreSave` hook, which would refuse the save here before anything is sent. So for this one save the client copy is
 *    unregistered (`PredictiveStudioStatusGuard.Unregister`) and registered again afterwards: the refusal is MJAPI's
 *    (D4-106).
 * 2. `graphql` — the raw `UpdateMJMLModel` mutation, POSTed with `fetch` to the provider's endpoint with its
 *    credentials (not through `ExecuteGQL`, whose catch logs every refusal; `graphql-request` is not a dependency here).
 * 3. `engine-call` — MJ's `Update Record` Action run through `RunAction` (`GraphQLActionClient`).
 * 4. `agent-tool` — the Model Development Agent's write tool, `Write Entity Field(s)`, through `RunAction` (D4-104;
 *    `metadata/agents/.model-development-agent.json`). It runs outside an agent run: the status hook does not read the
 *    caller, so the path proves the agent's tool cannot move Status (OF4-13 owns an in-run variant).
 * 5. `maintenance` — an `ActionScheduledJobDriver` job running the same Action: a one-off `MJ: Scheduled Jobs` row of
 *    the type whose driver is `ActionScheduledJobDriver`, run once through MJAPI's scheduling engine
 *    (`Execute Scheduled Job Now`, which awaits the job), then deleted with its job runs by ID.
 */
import { CompositeKey, RunView } from '@memberjunction/core';
import type {
  MJActionEntity, MJActionParamEntity, MJMLModelEntity, MJMLModelPublishRecordEntity, MJRecordChangeEntity, MJScheduledJobEntity,
  MJScheduledJobRunEntity, MJScheduledJobTypeEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import type { ActionParam } from '@memberjunction/actions-base';
import { JsonParse } from '@memberjunction/predictive-studio-core';
import { PreSaveHookRegistration, PredictiveStudioStatusGuard } from '@memberjunction/predictive-studio';
import type { TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** One of the five out-of-gate writers. */
export type StatusWritePath = 'ui' | 'graphql' | 'engine-call' | 'agent-tool' | 'maintenance';

/** One writer's attempt: whether the write saved and what the platform answered. */
export interface StatusWriteAttempt {
  readonly Path: StatusWritePath;
  readonly Saved: boolean;
  /** The refusal (or error) the writer reported; empty when it saved. */
  readonly Message: string;
  /**
   * Whether this process's copy of the status guard was registered during the write: false only for `ui`, whose save
   * runs with it removed so MJAPI decides; true for the other four, which never run the client's `PreSave` hooks
   * (they send a mutation or an Action that saves on MJAPI).
   */
  readonly ClientGuardRegistered: boolean;
}

/** A `MJ: Record Changes` entry of a field: its value before and after. */
interface FieldChange {
  readonly OldValue: string | null;
  readonly NewValue: string | null;
}

/** The five out-of-gate Status writers, and the audit of Status changes against the gate's publish records. */
export class StatusWritePaths {
  /** MJ's generic update Action (`metadata/actions/.actions.json`). */
  public static readonly UPDATE_RECORD_ACTION = 'Update Record';
  /** The write tool of the Model Development Agent (its only entity-write Action). */
  public static readonly AGENT_WRITE_TOOL_ACTION = 'Write Entity Field(s)';
  /** The scheduling Action that runs a job now through the scheduling engine and awaits it. */
  public static readonly EXECUTE_JOB_NOW_ACTION = 'Execute Scheduled Job Now';
  /** The scheduled-job driver of Action jobs. */
  public static readonly ACTION_JOB_DRIVER = 'ActionScheduledJobDriver';
  /**
   * How far a Status change may sit from the gate's publish record and still be the gate's: the gate saves the model
   * and writes its record in one transaction, which holds its row locks at most `SET LOCK_TIMEOUT 30000` (30 s).
   */
  public static readonly GATE_TRANSACTION_WINDOW_MS = 30_000;

  /** Every writer's attempt to set `status` on the model, in the order of {@link StatusWritePath}, one after another. */
  public static async All(h: TruthHarness, modelId: string, status: MJMLModelEntity['Status']): Promise<StatusWriteAttempt[]> {
    return [
      await StatusWritePaths.ViaEntitySave(h, modelId, status),
      await StatusWritePaths.ViaGraphQLMutation(h, modelId, status),
      await StatusWritePaths.ViaRunAction(h, modelId, status),
      await StatusWritePaths.ViaAgentTool(h, modelId, status),
      await StatusWritePaths.ViaScheduledJob(h, modelId, status),
    ];
  }

  /**
   * The model's `MJ: Record Changes` updates that change `Status` with no gate publish record (`Kind = 'publish'`, any
   * purpose: evaluate, publish, rollback, adopt) of the model created within {@link GATE_TRANSACTION_WINDOW_MS} of the
   * change's `ChangedAt`.
   */
  public static async StatusChangesWithoutGate(h: TruthHarness, modelId: string): Promise<number> {
    const entity = h.Provider.EntityByName('MJ: ML Models');
    if (!entity) throw new Error('MJ: ML Models is not in the client metadata');
    const recordId = CompositeKey.FromID(modelId).ToURLSegment(); // 'MJ: ML Models' — an MJ core entity keyed by ID
    const rv = RunView.FromMetadataProvider(h.Provider);
    const changes = await rv.RunView<Pick<MJRecordChangeEntity, 'ID' | 'ChangedAt' | 'ChangesJSON'>>({
      EntityName: 'MJ: Record Changes', ExtraFilter: `EntityID='${EscapeSQLString(entity.ID)}' AND RecordID='${EscapeSQLString(recordId)}' AND Type='Update'`,
      Fields: ['ID', 'ChangedAt', 'ChangesJSON'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
    }, h.User);
    if (!changes.Success) throw new Error(`reading the Record Changes of ML Model ${modelId}: ${changes.ErrorMessage}`);
    const records = await rv.RunView<Pick<MJMLModelPublishRecordEntity, 'ID' | '__mj_CreatedAt'>>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND Kind='publish'`,
      Fields: ['ID', '__mj_CreatedAt'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
    }, h.User);
    if (!records.Success) throw new Error(`reading the publish records of ML Model ${modelId}: ${records.ErrorMessage}`);
    const gateTimes = records.Results.map((r) => new Date(r.__mj_CreatedAt).getTime());
    return changes.Results.filter((c) => {
      const change = StatusWritePaths.statusChange(c.ChangesJSON);
      if (change === null || change.OldValue === change.NewValue) return false;
      const at = new Date(c.ChangedAt).getTime();
      return !gateTimes.some((t) => Math.abs(t - at) <= StatusWritePaths.GATE_TRANSACTION_WINDOW_MS);
    }).length;
  }

  /**
   * `ui`: the generated entity, loaded and saved through the client provider as the Explorer form saves it, with this
   * process's status-guard hook removed for the save (a browser has none) and registered again in `finally`. The
   * message is the provider's `LatestResult`, which carries the server's `SAVE_ENTITY_ERROR` text.
   *
   * @throws Error when the guard is still registered during the save, or not registered again after it
   */
  public static async ViaEntitySave(h: TruthHarness, modelId: string, status: MJMLModelEntity['Status']): Promise<StatusWriteAttempt> {
    const model = await h.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', h.User);
    if (!(await model.Load(modelId))) return { Path: 'ui', Saved: false, Message: `ML Model ${modelId} did not load: ${model.LatestResult?.CompleteMessage || 'not found'}`, ClientGuardRegistered: true };
    model.Status = status;
    let saved: boolean;
    try {
      PredictiveStudioStatusGuard.Unregister();
      if (PreSaveHookRegistration.IsRegistered(PredictiveStudioStatusGuard.HookMark)) throw new Error('the client copy of the status guard is still registered');
      saved = await model.Save();
    } finally {
      PredictiveStudioStatusGuard.Register();
    }
    if (!PreSaveHookRegistration.IsRegistered(PredictiveStudioStatusGuard.HookMark)) throw new Error('the client copy of the status guard was not registered again');
    return { Path: 'ui', Saved: saved, Message: saved ? '' : model.LatestResult?.CompleteMessage || 'Save() returned false', ClientGuardRegistered: false };
  }

  /**
   * `graphql`: the raw `UpdateMJMLModel` mutation with only `ID` and `Status`, POSTed to the provider's endpoint with its
   * credentials. Saved when the response has data and no `errors`; else the first error's message.
   */
  public static async ViaGraphQLMutation(h: TruthHarness, modelId: string, status: MJMLModelEntity['Status']): Promise<StatusWriteAttempt> {
    const mutation = 'mutation UpdateMJMLModel($input: UpdateMJMLModelInput!) { UpdateMJMLModel(input: $input) { ID Status } }';
    const config = h.Provider.ConfigData;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.Token) headers.authorization = `Bearer ${config.Token}`;
    if (config.MJAPIKey) headers['x-mj-api-key'] = config.MJAPIKey;
    if (config.UserAPIKey) headers['x-api-key'] = config.UserAPIKey;
    try {
      const response = await fetch(config.URL, { method: 'POST', headers, body: JSON.stringify({ query: mutation, variables: { input: { ID: modelId, Status: status } } }) });
      const error = StatusWritePaths.firstGraphQLError(await response.text());
      const saved = response.ok && error === null;
      return { Path: 'graphql', Saved: saved, Message: saved ? '' : error || `HTTP ${response.status}`, ClientGuardRegistered: true };
    } catch (e) {
      return { Path: 'graphql', Saved: false, Message: e instanceof Error ? e.message : String(e), ClientGuardRegistered: true };
    }
  }

  /** The first `errors[].message` of a GraphQL response body, or null when it has none. */
  private static firstGraphQLError(body: string): string | null {
    const parsed = JsonParse.ParseJsonText(body, 'response');
    if (!parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return `the response is not JSON: ${body.slice(0, 200)}`;
    const errors = JsonParse.JsonArrayField(parsed.Value, 'errors');
    if (errors === null || errors.length === 0) return null;
    const first = errors[0];
    return (JsonParse.IsJsonObject(first) ? JsonParse.JsonString(first, 'message') : null) || 'a GraphQL error without a message';
  }

  /** `engine-call`: `Update Record` run through `RunAction` on MJAPI (no action log row). */
  public static async ViaRunAction(h: TruthHarness, modelId: string, status: MJMLModelEntity['Status']): Promise<StatusWriteAttempt> {
    const action = await StatusWritePaths.actionNamed(h, StatusWritePaths.UPDATE_RECORD_ACTION);
    const params: ActionParam[] = [
      { Name: 'EntityName', Value: 'MJ: ML Models', Type: 'Input' },
      { Name: 'PrimaryKey', Value: { ID: modelId }, Type: 'Input' },
      { Name: 'Fields', Value: { Status: status }, Type: 'Input' },
    ];
    const r = await new GraphQLActionClient(h.Provider).RunAction(action.ID, params, true);
    return { Path: 'engine-call', Saved: r.Success, Message: r.Success ? '' : r.Message || 'RunAction failed without a message', ClientGuardRegistered: true };
  }

  /** `agent-tool`: the Model Development Agent's write tool, `Write Entity Field(s)`, through `RunAction`. */
  public static async ViaAgentTool(h: TruthHarness, modelId: string, status: MJMLModelEntity['Status']): Promise<StatusWriteAttempt> {
    const r = await StatusWritePaths.RunAgentWriteTool(h, 'MJ: ML Models', { ID: modelId }, { Status: status });
    return { Path: 'agent-tool', ...r, ClientGuardRegistered: true };
  }

  /**
   * One call of the Model Development Agent's write tool (`Write Entity Field(s)`) through `RunAction` on MJAPI (no
   * action log row): `Saved` when it reported `SUCCESS`, else its message.
   */
  public static async RunAgentWriteTool(
    h: TruthHarness, entityName: string, primaryKey: Readonly<Record<string, string>>, fields: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<Pick<StatusWriteAttempt, 'Saved' | 'Message'>> {
    const tool = await StatusWritePaths.actionNamed(h, StatusWritePaths.AGENT_WRITE_TOOL_ACTION);
    const r = await new GraphQLActionClient(h.Provider).RunAction(tool.ID, [
      { Name: 'EntityName', Value: entityName, Type: 'Input' },
      { Name: 'PrimaryKey', Value: primaryKey, Type: 'Input' },
      { Name: 'Fields', Value: fields, Type: 'Input' },
    ], true);
    return { Saved: r.Success, Message: r.Success ? '' : r.Message || 'the tool failed without a message' };
  }

  /**
   * `maintenance`: a one-off Action job whose configuration runs `Update Record` on the model, run once through MJAPI's
   * scheduling engine and awaited; the job and its runs are deleted by ID afterwards, whatever the outcome.
   */
  public static async ViaScheduledJob(h: TruthHarness, modelId: string, status: MJMLModelEntity['Status']): Promise<StatusWriteAttempt> {
    const job = await StatusWritePaths.createUpdateRecordJob(h, modelId, status);
    try {
      const runNow = await StatusWritePaths.actionNamed(h, StatusWritePaths.EXECUTE_JOB_NOW_ACTION);
      const r = await new GraphQLActionClient(h.Provider).RunAction(runNow.ID, [
        { Name: 'JobID', Value: job.ID, Type: 'Input' },
        { Name: 'Wait', Value: 'true', Type: 'Input' },
      ], true);
      return { Path: 'maintenance', Saved: r.Success, Message: r.Success ? '' : r.Message || 'the job run failed without a message', ClientGuardRegistered: true };
    } finally {
      await StatusWritePaths.deleteJob(h, job);
    }
  }

  /** The `Status` entry of a Record Change's `ChangesJSON` (`{ Status: { field, oldValue, newValue } }`), or null. */
  private static statusChange(changesJson: string | null): FieldChange | null {
    const parsed = JsonParse.ParseJsonText(changesJson, 'ChangesJSON');
    if (!parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return null;
    const entry = JsonParse.JsonObjectField(parsed.Value, 'Status');
    if (entry === null) return null;
    return { OldValue: JsonParse.JsonString(entry, 'oldValue'), NewValue: JsonParse.JsonString(entry, 'newValue') };
  }

  /** The active `MJ: Actions` row with this name. */
  private static async actionNamed(h: TruthHarness, name: string): Promise<Pick<MJActionEntity, 'ID' | 'Name'>> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJActionEntity, 'ID' | 'Name'>>(
      { EntityName: 'MJ: Actions', ExtraFilter: `Name='${EscapeSQLString(name)}' AND Status='Active'`, Fields: ['ID', 'Name'], ResultType: 'simple', MaxRows: 1 },
      h.User,
    );
    if (!r.Success || !r.Results[0]) throw new Error(`the '${name}' Action is not active: ${r.ErrorMessage || 'no row'}`);
    return r.Results[0];
  }

  /** The one-off Action job: `Update Record` with the model's key and `{ Status }` as static params, never due on its own. */
  private static async createUpdateRecordJob(h: TruthHarness, modelId: string, status: MJMLModelEntity['Status']): Promise<MJScheduledJobEntity> {
    const action = await StatusWritePaths.actionNamed(h, StatusWritePaths.UPDATE_RECORD_ACTION);
    const rv = RunView.FromMetadataProvider(h.Provider);
    const types = await rv.RunView<Pick<MJScheduledJobTypeEntity, 'ID'>>(
      { EntityName: 'MJ: Scheduled Job Types', ExtraFilter: `DriverClass='${EscapeSQLString(StatusWritePaths.ACTION_JOB_DRIVER)}'`, Fields: ['ID'], ResultType: 'simple' }, h.User);
    const type = types.Results[0];
    if (!types.Success || !type) throw new Error(`no scheduled-job type has the driver ${StatusWritePaths.ACTION_JOB_DRIVER}: ${types.ErrorMessage || 'no row'}`);
    const params = await rv.RunView<Pick<MJActionParamEntity, 'ID' | 'Name'>>(
      { EntityName: 'MJ: Action Params', ExtraFilter: `ActionID='${EscapeSQLString(action.ID)}' AND Type='Input'`, Fields: ['ID', 'Name'], ResultType: 'simple' }, h.User);
    const values: Record<string, string> = { EntityName: 'MJ: ML Models', PrimaryKey: JSON.stringify({ ID: modelId }), Fields: JSON.stringify({ Status: status }) };
    const configured = params.Results.filter((p) => p.Name in values);
    if (!params.Success || configured.length !== 3) throw new Error(`the '${action.Name}' Action's EntityName, PrimaryKey and Fields params were not all found: ${params.ErrorMessage || `${configured.length} of 3`}`);
    const job = await h.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', h.User);
    job.NewRecord();
    job.JobTypeID = type.ID;
    job.Name = `PSTruth: status write ${modelId} ${h.RunID}`;
    job.Description = 'Predictive Studio truth suite: one out-of-gate Status write (safe to delete)';
    job.CronExpression = '0 0 1 1 *';
    job.Timezone = 'UTC';
    job.Status = 'Active';
    job.OwnerUserID = h.User.ID;
    job.RunImmediatelyIfNeverRun = false;
    job.MissedRunPolicy = 'Skip';
    job.ConcurrencyMode = 'Skip';
    job.Configuration = JSON.stringify({ ActionID: action.ID, Params: configured.map((p) => ({ ActionParamID: p.ID, ValueType: 'Static', Value: values[p.Name] })) });
    if (!(await job.Save())) throw new Error(`saving the one-off Action job failed: ${job.LatestResult?.CompleteMessage || 'Save() returned false'}`);
    return job;
  }

  /** Deletes the job's runs, then the job; throws naming every row that could not be deleted. */
  private static async deleteJob(h: TruthHarness, job: MJScheduledJobEntity): Promise<void> {
    const jobId = job.ID;
    const runs = await RunView.FromMetadataProvider(h.Provider).RunView<MJScheduledJobRunEntity>(
      { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ScheduledJobID='${EscapeSQLString(jobId)}'`, ResultType: 'entity_object', BypassCache: true, IgnoreMaxRows: true },
      h.User,
    );
    if (!runs.Success) throw new Error(`reading the runs of scheduled job ${jobId}: ${runs.ErrorMessage}`);
    const failures: string[] = [];
    for (const run of runs.Results.filter((r) => UUIDsEqual(r.ScheduledJobID, jobId))) {
      const runId = run.ID;
      if (!(await run.Delete())) failures.push(`MJ: Scheduled Job Runs ${runId}: ${run.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
    }
    if (!(await job.Delete())) failures.push(`MJ: Scheduled Jobs ${jobId}: ${job.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
    if (failures.length > 0) throw new Error(`the one-off Action job was not cleaned up: ${failures.join('; ')}`);
  }
}
