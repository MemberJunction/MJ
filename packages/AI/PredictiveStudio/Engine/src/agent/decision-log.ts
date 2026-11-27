/**
 * @module agent/decision-log
 *
 * `AgentDecisionLog` — `MJ: Agent Decision Logs` (PR 5, A4; §5.1.6, D5-24, D5-38). Every control-path transition of a
 * Model Development Agent session appends one row **before** its effect, carrying what the effect needs (the
 * resulting plan hash, the draft, the claim), so a crash between the two leaves a log the next run can rebuild the
 * payload from (`AgentSessionReplay`).
 *
 * - **Session.** A session spans several runs (a resume is a new run with `LastRunID`). Its `SessionRunID` is the run
 *   that wrote its first row; a run continues the session of the nearest run of its `LastRunID` chain that wrote rows
 *   while that session's newest row is not terminal (`report`, `decline-*`), else it starts its own.
 * - **Compare-and-append (D5-38).** Inside the session lock (`AgentSessionLease.WithSessionLock`: a live sibling run →
 *   `session-busy`), `Append` inserts only when the entry's `payloadHash` is the newest row's `ResultingPayloadHash` and
 *   its `step` is that row's `Step + 1` (the first row is Step 1), else `log-diverged`; the unique (`SessionRunID`,
 *   `Step`) index backs it against a second process.
 * - **Guard.** A `PreSave` and a `PreDelete` hook (through `PreSaveHookRegistration`) refuse every update and delete of a
 *   saved row and every create that is not `Append`'s own authorised save (`AgentDecisionLogWriteAuthorisations`,
 *   instance-keyed): GraphQL, Actions, agents and server code cannot write the log.
 */
import { RunView, type BaseEntity, type IMetadataProvider, type PreDeleteHook, type PreSaveHook, type UserInfo } from '@memberjunction/core';
import { MJAgentDecisionLogEntity, type MJAIAgentRunEntity, type MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, GroupByUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
  JsonParse,
  type AgentDecisionLogEntry, type AgentDecisionReplay, type AgentDecisionToolCall, type JsonValue,
} from '@memberjunction/predictive-studio-core';

import { PreSaveHookRegistration } from '../registry/pre-save-hook-registration';
import { SnapshotHash } from '../snapshot/snapshot-hash';
import { AgentSessionLease, type SessionBusy } from './agent-session-lease';
import { BuildApprovalResolver } from './build-approval-resolver';
import { AgentDecisionLogWriteAuthorisations } from './decision-log-write-authorisations';

/** A `Decision` value, bound to the generated field. */
export type AgentDecision = MJAgentDecisionLogEntity['Decision'];

/** One stored row, its JSON columns parsed. */
export interface LoggedDecision {
  readonly ID: string;
  readonly SessionRunID: string;
  readonly AgentRunID: string;
  readonly AgentRunStepID: string | null;
  readonly Step: number;
  readonly Decision: AgentDecision;
  readonly PromptRunID: string | null;
  readonly ToolCalls: readonly AgentDecisionToolCall[];
  readonly PayloadHash: string;
  readonly ResultingPayloadHash: string;
  readonly Rationale: string;
  readonly BuildApprovalRequestID: string | null;
}

/** The log is behind the entry: another run appended first, or the entry was made from another payload. */
export type LogDiverged = { readonly kind: 'log-diverged'; readonly newestStep: number };  // case-violation-ok-legacy-back-compat: refusal JSON shape

/** What `Append` returns: the new row's ID, or why nothing was written. */
export type AgentDecisionAppendResult = string | LogDiverged | SessionBusy;

/** The newest prompt run of a run tree and how it was sent (what a row records as its prompt result). */
export interface RecordedPrompt {
  readonly PromptRunID: string;
  readonly Replay: AgentDecisionReplay;
}

/** The stored columns a log read returns. */
type LogRow = Pick<MJAgentDecisionLogEntity, 'ID' | 'SessionRunID' | 'AgentRunID' | 'AgentRunStepID' | 'Step' | 'Decision' | 'PromptRunID' | 'ToolCalls' | 'PayloadHash' | 'ResultingPayloadHash' | 'Rationale' | 'BuildApprovalRequestID'>;
/** The prompt-run columns a recorded prompt needs. */
type PromptRunRow = Pick<MJAIPromptRunEntity, 'ID' | 'PromptID' | 'Messages' | 'Temperature' | 'Seed' | 'ModelID' | 'VendorID'>;

const LOG_FIELDS: (keyof LogRow)[] = ['ID', 'SessionRunID', 'AgentRunID', 'AgentRunStepID', 'Step', 'Decision', 'PromptRunID', 'ToolCalls', 'PayloadHash', 'ResultingPayloadHash', 'Rationale', 'BuildApprovalRequestID'];

/** Set once this copy of the module has registered (or found) its hooks. */
let registered = false;

/** The decision log: the session rule, compare-and-append, reads, and the guard on its rows. */
export class AgentDecisionLog {
  /** The entity the rows live in (kept as `MJ: Agent Decision Logs`: the migration names the entity, D5-A4-1). */
  public static readonly EntityName = 'MJ: Agent Decision Logs';
  /** The global mark the registered `PreSave` hook carries. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:agent-decision-log-guard');
  /** The global mark the registered `PreDelete` hook carries. */
  public static readonly DeleteHookMark: symbol = Symbol.for('@memberjunction/predictive-studio:agent-decision-log-delete-guard');
  /** The decisions that end a session: a later request in the conversation starts a new one. */
  public static readonly TERMINAL_DECISIONS: readonly AgentDecision[] = ['report', 'decline-no-signal', 'decline-small-data', 'decline-unresolved-reference'];

  /** True when `decision` ends its session. */
  public static IsTerminal(decision: AgentDecision): boolean {
    return AgentDecisionLog.TERMINAL_DECISIONS.includes(decision);
  }

  /**
   * The session `run` belongs to (D5-24): the session of the nearest run of its `LastRunID` chain that wrote rows, when
   * that session's newest row is not terminal; else `run`'s own ID (it starts a session).
   */
  public static async SessionOf(run: MJAIAgentRunEntity, provider: IMetadataProvider, contextUser: UserInfo): Promise<string> {
    if (!run.LastRunID) return run.ID;
    const chain = (await BuildApprovalResolver.SessionRuns(run, provider, contextUser)).map((r) => r.ID).filter((id) => !UUIDsEqual(id, run.ID));
    if (chain.length === 0) return run.ID;
    const written = await AgentDecisionLog.read(`AgentRunID IN (${AgentDecisionLog.inList(chain)})`, provider, contextUser);
    const byRun = GroupByUUID(written, (r) => r.AgentRunID);
    const nearest = chain.find((id) => (byRun.Get(id) ?? []).length > 0);
    const session = nearest ? [...(byRun.Get(nearest) ?? [])].sort((a, b) => b.Step - a.Step)[0]?.SessionRunID : undefined;
    if (!session) return run.ID;
    const rows = await AgentDecisionLog.Rows(session, provider, contextUser);
    const newest = rows[rows.length - 1];
    return newest && !AgentDecisionLog.IsTerminal(newest.Decision) ? session : run.ID;
  }

  /** Every row of a session, across all its runs, in `Step` order (read from the database, not a cache). */
  public static async Rows(sessionRunId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<LoggedDecision[]> {
    const rows = await AgentDecisionLog.read(`SessionRunID='${EscapeSQLString(sessionRunId)}'`, provider, contextUser);
    return rows.map((r) => AgentDecisionLog.parse(r)).sort((a, b) => a.Step - b.Step);
  }

  /**
   * Appends `entry` under the session lock, before the transition's effect: only when its `payloadHash` is the newest
   * row's `ResultingPayloadHash` and its `step` is that row's `Step + 1` (D5-38).
   *
   * @returns the new row's ID; `log-diverged` when the log is not where the entry was made from (nothing written);
   *          `session-busy` when a live sibling run holds the session (nothing written)
   * @throws Error when the insert fails for any other reason (a database or permission failure)
   */
  public static async Append(entry: AgentDecisionLogEntry, provider: IMetadataProvider, contextUser: UserInfo): Promise<AgentDecisionAppendResult> {
    const prior = await AgentDecisionLog.Rows(entry.sessionRunId, provider, contextUser);
    const runs = AgentDecisionLog.distinct([entry.sessionRunId, entry.agentRunId, ...prior.map((r) => r.AgentRunID)]);
    return AgentSessionLease.WithSessionLock(entry.sessionRunId, async () => {
      const rows = await AgentDecisionLog.Rows(entry.sessionRunId, provider, contextUser);
      return AgentDecisionLog.appendUnderLock(entry, rows, provider, contextUser);
    }, { Provider: provider, ContextUser: contextUser }, { CurrentRunID: entry.agentRunId, SessionRunIDs: runs });
  }

  /**
   * The newest prompt run of `runId`'s run tree (the run and every run under it) and how it was sent, or null when the
   * tree ran no prompt. A row records it as the prompt result its plan came from.
   */
  public static async LatestPrompt(runId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<RecordedPrompt | null> {
    const tree = await AgentDecisionLog.runTree(runId, provider, contextUser);
    const steps = await RunView.FromMetadataProvider(provider).RunView<{ readonly TargetLogID: string | null; readonly StartedAt: Date | string | null }>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID IN (${AgentDecisionLog.inList(tree)}) AND StepType='Prompt' AND TargetLogID IS NOT NULL`,
      Fields: ['TargetLogID', 'StartedAt'],
      OrderBy: 'StartedAt DESC',
      ResultType: 'simple',
      BypassCache: true,
    }, contextUser);
    if (!steps.Success) throw new Error(`Predictive Studio: reading the prompt steps of run ${runId} failed: ${steps.ErrorMessage || 'unknown error'}`);
    const newest = [...steps.Results].sort((a, b) => new Date(b.StartedAt ?? 0).getTime() - new Date(a.StartedAt ?? 0).getTime())[0]?.TargetLogID;
    return newest ? AgentDecisionLog.recordedPrompt(newest, provider, contextUser) : null;
  }

  /** Registers the log guard's `PreSave` and `PreDelete` hooks once per process. */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const save: PreSaveHook = (entity) => AgentDecisionLog.CheckSave(entity);
    const del: PreDeleteHook = (entity) => AgentDecisionLog.CheckDelete(entity);
    PreSaveHookRegistration.RegisterOnce(AgentDecisionLog.HookMark, save);
    PreSaveHookRegistration.RegisterPreDeleteOnce(AgentDecisionLog.DeleteHookMark, del);
  }

  /**
   * Removes this process's hooks and resets the registered flag, so a later {@link Register} registers again. For a
   * test; nothing in production calls it.
   */
  public static Unregister(): boolean {
    registered = false;
    const save = PreSaveHookRegistration.Unregister(AgentDecisionLog.HookMark);
    const del = PreSaveHookRegistration.UnregisterPreDelete(AgentDecisionLog.DeleteHookMark);
    return save || del;
  }

  /**
   * The `PreSave` hook's body: `true` for `Append`'s authorised create (and for every other entity), else the refusal.
   * A saved row is never changed.
   */
  public static CheckSave(entity: BaseEntity): boolean | string {
    if (entity.EntityInfo?.Name !== AgentDecisionLog.EntityName) return true;
    if (!(entity instanceof MJAgentDecisionLogEntity)) return AgentDecisionLog.refusal('(unknown)', 'the entity object is not an MJAgentDecisionLogEntity, so its writer cannot be checked');
    const write = AgentDecisionLogWriteAuthorisations.Instance.Take(entity);
    if (entity.IsSaved) return AgentDecisionLog.refusal(entity.ID, 'a decision row is never changed after it is appended');
    if (write !== 'append') return AgentDecisionLog.refusal('(new)', 'a decision row is appended only by AgentDecisionLog.Append, never by a direct save');
    return true;
  }

  /** The `PreDelete` hook's body: a decision row is never deleted (replay and the approval rule read it). */
  public static CheckDelete(entity: BaseEntity): boolean | string {
    if (entity.EntityInfo?.Name !== AgentDecisionLog.EntityName) return true;
    const id = entity instanceof MJAgentDecisionLogEntity ? entity.ID : '(unknown)';
    return AgentDecisionLog.refusal(id, 'a decision row is never deleted');
  }

  /** The tool calls a stored `ToolCalls` column holds (malformed elements dropped). */
  public static ParseToolCalls(text: string | null): AgentDecisionToolCall[] {
    const parsed = JsonParse.ParseJsonText(text, 'ToolCalls');
    if (!parsed.Ok || !Array.isArray(parsed.Value)) return [];
    return parsed.Value.flatMap((c: JsonValue) => {
      if (!JsonParse.IsJsonObject(c)) return [];
      const action = JsonParse.JsonString(c, 'action');
      const result = c['result'];
      return action === null || result === undefined ? [] : [{ action, paramsHash: JsonParse.JsonString(c, 'paramsHash'), result }];
    });
  }

  /** The compare, then the insert (under the lock). */
  private static async appendUnderLock(entry: AgentDecisionLogEntry, rows: readonly LoggedDecision[], provider: IMetadataProvider, contextUser: UserInfo): Promise<AgentDecisionAppendResult> {
    const newest = rows[rows.length - 1];
    const newestStep = newest ? newest.Step : 0;
    if (entry.step !== newestStep + 1 || (newest && entry.inputs.payloadHash !== newest.ResultingPayloadHash)) return { kind: 'log-diverged', newestStep };
    const row = await provider.GetEntityObject<MJAgentDecisionLogEntity>(AgentDecisionLog.EntityName, contextUser);
    row.NewRecord();
    AgentDecisionLog.fill(row, entry);
    if (await AgentDecisionLogWriteAuthorisations.SaveAuthorised(row)) return row.ID;
    const after = await AgentDecisionLog.Rows(entry.sessionRunId, provider, contextUser);
    const now = after[after.length - 1];
    if (now && now.Step >= entry.step) return { kind: 'log-diverged', newestStep: now.Step };
    throw new Error(`Predictive Studio: decision ${entry.step} (${entry.decision}) of session ${entry.sessionRunId} could not be appended: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /** The entry's values on a new row. */
  private static fill(row: MJAgentDecisionLogEntity, entry: AgentDecisionLogEntry): void {
    row.SessionRunID = entry.sessionRunId;
    row.AgentRunID = entry.agentRunId;
    row.AgentRunStepID = entry.agentRunStepId;
    row.Step = entry.step;
    row.Decision = entry.decision;
    row.PromptRunID = entry.inputs.promptRunId;
    row.ToolCalls = JSON.stringify(entry.inputs.toolCalls);
    row.PayloadHash = entry.inputs.payloadHash;
    row.ResultingPayloadHash = entry.resultingPayloadHash;
    row.Rationale = entry.rationale;
    row.Replay = JSON.stringify(entry.replay);
    row.BuildApprovalRequestID = entry.buildApprovalRequestId;
  }

  /** Log rows matching `filter`, read fresh. */
  private static async read(filter: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<LogRow[]> {
    const result = await RunView.FromMetadataProvider(provider).RunView<LogRow>({
      EntityName: AgentDecisionLog.EntityName,
      ExtraFilter: filter,
      Fields: LOG_FIELDS,
      OrderBy: 'Step ASC',
      ResultType: 'simple',
      BypassCache: true,
    }, contextUser);
    if (!result.Success) throw new Error(`Predictive Studio: reading the agent decision log failed: ${result.ErrorMessage || 'unknown error'}`);
    return result.Results;
  }

  /** A stored row with its JSON columns parsed. */
  private static parse(r: LogRow): LoggedDecision {
    return {
      ID: r.ID, SessionRunID: r.SessionRunID, AgentRunID: r.AgentRunID, AgentRunStepID: r.AgentRunStepID, Step: r.Step, Decision: r.Decision,
      PromptRunID: r.PromptRunID, ToolCalls: AgentDecisionLog.ParseToolCalls(r.ToolCalls), PayloadHash: r.PayloadHash.trim(),
      ResultingPayloadHash: r.ResultingPayloadHash.trim(), Rationale: r.Rationale, BuildApprovalRequestID: r.BuildApprovalRequestID,
    };
  }

  /** `runId` and every run under it (any depth). */
  private static async runTree(runId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<string[]> {
    const seen = new UUIDSet([runId]);
    const tree = [runId];
    let frontier = [runId];
    while (frontier.length > 0) {
      const result = await RunView.FromMetadataProvider(provider).RunView<{ readonly ID: string }>({
        EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ParentRunID IN (${AgentDecisionLog.inList(frontier)})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
      }, contextUser);
      if (!result.Success) throw new Error(`Predictive Studio: reading the runs under ${runId} failed: ${result.ErrorMessage || 'unknown error'}`);
      frontier = AgentDecisionLog.distinct(result.Results.map((r) => r.ID)).filter((id) => !seen.Has(id));
      for (const id of frontier) seen.Add(id);
      tree.push(...frontier);
    }
    return tree;
  }

  /** `ids` without repeats (compared as UUIDs), each as given. */
  private static distinct(ids: readonly string[]): string[] {
    const seen = new UUIDSet();
    return ids.filter((id) => {
      if (seen.Has(id)) return false;
      seen.Add(id);
      return true;
    });
  }

  /** A prompt run as a row records it: its ID, its prompt, the hash of its rendered messages and its parameters. */
  private static async recordedPrompt(promptRunId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<RecordedPrompt> {
    const view = RunView.FromMetadataProvider(provider);
    const runs = await view.RunView<PromptRunRow>({
      EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `ID='${EscapeSQLString(promptRunId)}'`,
      Fields: ['ID', 'PromptID', 'Messages', 'Temperature', 'Seed', 'ModelID', 'VendorID'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    const run = runs.Success ? runs.Results[0] : undefined;
    if (!run) return { PromptRunID: promptRunId, Replay: { promptId: null, promptVersionHash: null, parameters: null } };
    const vendor = await view.RunView<{ readonly APIName: string | null }>({
      EntityName: 'MJ: AI Model Vendors', ExtraFilter: `ModelID='${EscapeSQLString(run.ModelID)}' AND VendorID='${EscapeSQLString(run.VendorID)}'`,
      Fields: ['APIName'], ResultType: 'simple', MaxRows: 1,
    }, contextUser);
    const apiName = vendor.Success ? vendor.Results[0]?.APIName ?? null : null;
    return {
      PromptRunID: promptRunId,
      Replay: {
        promptId: run.PromptID, promptVersionHash: SnapshotHash.Sha256Hex(run.Messages || ''),
        // MaxTokens: the prompt run does not record the cap it was sent with
        parameters: { VendorModelName: apiName, Temperature: run.Temperature, MaxTokens: null, Seed: run.Seed },
      },
    };
  }

  /** IDs as a quoted, escaped SQL list. */
  private static inList(ids: readonly string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  }

  private static refusal(id: string, why: string): string {
    return `Predictive Studio decision log guard: the write of ${AgentDecisionLog.EntityName} record ${id} is refused: ${why}.`;
  }
}
