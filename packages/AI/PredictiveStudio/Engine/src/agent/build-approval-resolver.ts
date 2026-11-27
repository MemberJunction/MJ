/**
 * @module agent/build-approval-resolver
 *
 * `BuildApprovalResolver` — the rule that decides whether a person approved a build (D-090; design §5.1.1). `Resolve`
 * reads, through the passed provider, the newest `MJ: AI Agent Requests` row of the session (the runs reached by walking
 * `LastRunID` from the current run, D5-24) and returns a {@link BuildApproval} only when all five rules hold, else the
 * first rule that fails as a typed refusal:
 *
 *  1. created by the session's own orchestrator Plan step (the request's `OriginatingAgentRunID` is a session run of this
 *     agent, its `OriginatingAgentRunStepID` that run's `Plan Presented for Approval` step, and it is that step's first
 *     request) — `not-agent-created`;
 *  2. created `Requested` with no responder and answered by a separate save (`MJ: Record Changes`) — `not-two-step`;
 *  3. the answering save is the session person's own (`ResponseByUserID` = `RequestForUserID` = the run's user = the Record
 *     Change's user, not the MJ system user) — `not-human`. `ResponseSource` is never read;
 *  4. that person may create `MJ: ML Training Pipelines` and `MJ: ML Models` rows — `responder-not-permitted`;
 *  5. the plan is the one presented: the presenting run's stored `PlanHash` equals the current payload's, and the
 *     answering save's `ResponseData.plan`, when present, equals the presented text — `plan-changed`, `plan-edited`;
 *
 * plus consumption: a claim of the request exists — `consumed`. The approval is read from the answering save's Record
 * Change, never the current row, so a later save of `ResponseData`, `ResponseByUserID` or `ResumingAgentRunID` changes
 * nothing.
 *
 * Rule 3 needs to know that a save was a person's: the answering-save hook (`CheckAnsweringSave`, a PS `PreSave` hook)
 * records an answer to the orchestrator's request made by anything else — an API-key session, the MJ system user, server
 * code acting as the person (an agent run's Update Record) — with no responder, so its Record Change says so.
 */
import {
  CompositeKey, RunView, ServerOperationScopeManager, WellKnownUserSource,
  type BaseEntity, type IMetadataProvider, type PreSaveHook, type UserInfo,
} from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJAIAgentRequestEntity, type MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { JsonParse, type BuildApproval, type BuildApprovalPermissionEntity, type JsonObject } from '@memberjunction/predictive-studio-core';

import { PreSaveHookRegistration } from '../registry/pre-save-hook-registration';
import { BuildApprovalClaims } from './build-approval-claims';
import type { AgentBuildApprovalRefusal } from './control-path';

/** The run columns the session walk reads. */
export type SessionRun = Pick<MJAIAgentRunEntity, 'ID' | 'AgentID' | 'LastRunID' | 'UserID' | 'Status' | 'StartedAt' | 'LastHeartbeatAt' | 'FinalPayload'>;

/** The request columns the rule reads. */
type RequestRow = Pick<MJAIAgentRequestEntity,
  'ID' | 'Status' | 'RequestForUserID' | 'OriginatingAgentRunID' | 'OriginatingAgentRunStepID' | 'RespondedAt'> & { readonly __mj_CreatedAt: Date | string };

/** The Plan step columns the rule reads. */
interface PlanStepRow { readonly ID: string; readonly AgentRunID: string; readonly StepName: string; readonly StepType: string; readonly InputData: string | null }

/** A Record Change of the request, as stored. */
interface RequestChangeRow { readonly Type: string; readonly UserID: string; readonly ChangedAt: Date | string; readonly FullRecordJSON: string | null }

/** The save that answered the request: who made it and the row as it saved it. */
interface AnsweringSave { readonly UserID: string; readonly Row: JsonObject; readonly ChangedAt: Date | string }

/** The request rows of a session and what the rules read beside them. */
interface RequestEvidence {
  readonly Step: PlanStepRow | null;
  readonly Changes: readonly RequestChangeRow[];
}

/** Set once this copy of the module has registered (or found) its hook. */
let registered = false;

/** The approval rule (D-090 rules 1–5 and consumption), as statics. */
export class BuildApprovalResolver {
  /** The orchestrator agent whose Plan-step requests the rule reads (and the hook guards). */
  public static readonly ORCHESTRATOR_AGENT_NAME = 'Model Development Agent';
  /** The run step `BaseAgent.executePlanStep` writes for a presented plan. */
  public static readonly PLAN_STEP_NAME = 'Plan Presented for Approval';
  /** The global mark of the answering-save hook. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:agent-request-answer-guard');
  /** The entities a responder must be able to create rows of (D-090 rule 4). */
  public static readonly PERMISSION_ENTITIES: readonly BuildApprovalPermissionEntity[] = ['MJ: ML Training Pipelines', 'MJ: ML Models'];
  /** The statuses that answer a request. */
  private static readonly answeredStatuses: readonly MJAIAgentRequestEntity['Status'][] = ['Approved', 'Rejected', 'Responded'];

  /**
   * The approval the session holds for the plan whose hash is `planHash` (the current payload's), or why it holds none.
   *
   * @throws Error when a read fails (a database failure is not a refusal)
   */
  public static async Resolve(run: MJAIAgentRunEntity, planHash: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<BuildApproval | AgentBuildApprovalRefusal> {
    const session = await BuildApprovalResolver.SessionRuns(run, provider, contextUser);
    const requests = await BuildApprovalResolver.sessionRequests(session, provider, contextUser);
    const request = requests[requests.length - 1];
    if (!request) return { kind: 'no-request' };
    const evidence = await BuildApprovalResolver.evidenceFor(request, provider, contextUser);
    if (!BuildApprovalResolver.CreatedByOrchestratorRun(request, requests, session, evidence.Step, run)) return { kind: 'not-agent-created', requestId: request.ID };
    if (request.Status !== 'Approved') return { kind: 'not-approved', status: request.Status };
    const answer = BuildApprovalResolver.AnsweredInSeparateSave(evidence.Changes);
    if (!answer) return { kind: 'not-two-step', requestId: request.ID };
    const notHuman = BuildApprovalResolver.ResponderIsSessionPerson(answer, request, run);
    if (notHuman !== null) return { kind: 'not-human', userId: notHuman };
    const responder = UserCache.Instance.UserByID(answer.UserID);
    if (!responder) return { kind: 'not-human', userId: answer.UserID };
    const missing = BuildApprovalResolver.ResponderMayBuild(responder, provider);
    if (missing !== null) return { kind: 'responder-not-permitted', userId: responder.ID, entity: missing };
    const presenting = session.find((r) => UUIDsEqual(r.ID, request.OriginatingAgentRunID ?? ''));
    const planRefusal = BuildApprovalResolver.PlanHashMatches(presenting?.FinalPayload ?? null, planHash, answer, evidence.Step, request.ID);
    if (planRefusal !== null) return planRefusal;
    const claimId = await BuildApprovalResolver.NotClaimed(request.ID, provider, contextUser);
    if (claimId !== null) return { kind: 'consumed', claimId };
    return BuildApprovalResolver.approvalOf(request, answer, presenting?.FinalPayload ?? null, planHash, run);
  }

  /**
   * The session's runs: the current run, then each `LastRunID` predecessor in turn (D5-24). Each hop's ID is known only
   * once the previous run is read, so the walk reads one run at a time; a repeated ID ends it.
   */
  public static async SessionRuns(run: MJAIAgentRunEntity, provider: IMetadataProvider, contextUser: UserInfo): Promise<SessionRun[]> {
    const runs: SessionRun[] = [run];
    const seen = new UUIDSet([run.ID]);
    let next = run.LastRunID;
    while (next && !seen.Has(next)) {
      seen.Add(next);
      const found = await BuildApprovalResolver.readRun(next, provider, contextUser);
      if (!found) break;
      runs.push(found);
      next = found.LastRunID;
    }
    return runs;
  }

  /** True when the agent named on a request is the orchestrator (the request view's `Agent` name). */
  public static IsOrchestratorAgent(agentId: string, agentName?: string | null): boolean {
    return Boolean(agentId) && agentName === BuildApprovalResolver.ORCHESTRATOR_AGENT_NAME;
  }

  /** Registers the answering-save hook once per process. */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const hook: PreSaveHook = (entity) => BuildApprovalResolver.CheckAnsweringSave(entity);
    PreSaveHookRegistration.RegisterOnce(BuildApprovalResolver.HookMark, hook);
  }

  /**
   * The answering-save hook's body. A save that answers the orchestrator's request keeps its responder only when it is
   * the person's own client save (inside a client CRUD boundary, not the MJ system user, not an API-key session); any
   * other answering save is recorded with no responder (rule 3 then refuses it). Always allows the save.
   */
  public static async CheckAnsweringSave(entity: BaseEntity): Promise<boolean> {
    if (entity.EntityInfo?.Name !== 'MJ: AI Agent Requests' || !(entity instanceof MJAIAgentRequestEntity)) return true;
    if (entity.OriginatingTaskID != null || !BuildApprovalResolver.IsOrchestratorAgent(entity.AgentID, entity.Agent)) return true;
    if (!BuildApprovalResolver.answers(entity)) return true;
    if (!BuildApprovalResolver.IsPersonSave(entity.ContextCurrentUser)) entity.ResponseByUserID = null;
    return true;
  }

  /** True when the code running now is `user`'s own client save: a person, not a key, not the MJ system user. */
  public static IsPersonSave(user: UserInfo | null | undefined): boolean {
    if (!user || WellKnownUserSource.Instance.IsSystemUser(user)) return false;
    if (user.APIKeyRowFilters !== undefined) return false;
    return ServerOperationScopeManager.Instance.IsInDirectClientCrud();
  }

  /** Rule 1: the request is the first one the session's orchestrator Plan step raised. */
  protected static CreatedByOrchestratorRun(request: RequestRow, requests: readonly RequestRow[], session: readonly SessionRun[], step: PlanStepRow | null, run: MJAIAgentRunEntity): boolean {
    const origin = session.find((r) => UUIDsEqual(r.ID, request.OriginatingAgentRunID ?? ''));
    if (!origin || !UUIDsEqual(origin.AgentID, run.AgentID) || !step) return false;
    if (!UUIDsEqual(step.AgentRunID, origin.ID) || step.StepName !== BuildApprovalResolver.PLAN_STEP_NAME || step.StepType !== 'Plan') return false;
    const first = requests.find((r) => UUIDsEqual(r.OriginatingAgentRunStepID ?? '', step.ID));
    return first !== undefined && UUIDsEqual(first.ID, request.ID);
  }

  /**
   * Rule 2: the request's Record Changes open with a create of a `Requested` row with no responder, and a later update
   * moved it to `Approved`. Returns the newest such update (the answering save), or null.
   */
  protected static AnsweredInSeparateSave(changes: readonly RequestChangeRow[]): AnsweringSave | null {
    const ordered = [...changes].sort((a, b) => new Date(a.ChangedAt).getTime() - new Date(b.ChangedAt).getTime());
    const create = ordered[0];
    const created = create ? BuildApprovalResolver.rowOf(create) : null;
    if (!create || create.Type !== 'Create' || !created || created.Status !== 'Requested' || created.ResponseByUserID) return null;
    let status = 'Requested';
    let answer: AnsweringSave | null = null;
    for (const change of ordered.slice(1)) {
      const row = BuildApprovalResolver.rowOf(change);
      if (!row || change.Type !== 'Update') continue;
      const next = JsonParse.JsonString(row, 'Status') ?? status;
      if (next === 'Approved' && status !== 'Approved') answer = { UserID: change.UserID, Row: row, ChangedAt: change.ChangedAt };
      status = next;
    }
    return answer;
  }

  /** Rule 3: null when the answering save is the session person's own, else the user it names (or the saver). */
  protected static ResponderIsSessionPerson(answer: AnsweringSave, request: RequestRow, run: MJAIAgentRunEntity): string | null {
    const responder = JsonParse.JsonString(answer.Row, 'ResponseByUserID');
    if (!responder) return answer.UserID;
    const person = request.RequestForUserID;
    const sameUser = Boolean(person) && UUIDsEqual(responder, person ?? '') && UUIDsEqual(responder, answer.UserID) && UUIDsEqual(responder, run.UserID ?? '');
    if (!sameUser) return responder;
    const user = UserCache.Instance.UserByID(responder);
    return user && !WellKnownUserSource.Instance.IsSystemUser(user) ? null : responder;
  }

  /** Rule 4: null when `user` may create rows of both entities, else the first one it may not. */
  protected static ResponderMayBuild(user: UserInfo, provider: IMetadataProvider): BuildApprovalPermissionEntity | null {
    for (const name of BuildApprovalResolver.PERMISSION_ENTITIES) {
      const entity = provider.EntityByName(name);
      if (!entity || !entity.GetUserPermisions(user).CanCreate) return name;
    }
    return null;
  }

  /** Rule 5: null when the presented plan is the current one and the card was not edited, else the refusal. */
  protected static PlanHashMatches(finalPayload: string | null, planHash: string, answer: AnsweringSave, step: PlanStepRow | null, requestId: string): AgentBuildApprovalRefusal | null {
    const presented = BuildApprovalResolver.jsonObject(finalPayload);
    const approvedHash = presented ? JsonParse.JsonString(presented, 'PlanHash') ?? '' : '';
    if (approvedHash !== planHash) return { kind: 'plan-changed', approvedHash, currentHash: planHash };
    const answered = BuildApprovalResolver.jsonObject(JsonParse.JsonString(answer.Row, 'ResponseData'));
    const editedPlan = answered ? JsonParse.JsonString(answered, 'plan') : null;
    if (editedPlan === null) return null;
    const stepInput = BuildApprovalResolver.jsonObject(step?.InputData ?? null);
    const presentedText = stepInput ? JsonParse.JsonString(stepInput, 'plan') : null;
    return BuildApprovalResolver.sameText(editedPlan, presentedText) ? null : { kind: 'plan-edited', requestId };
  }

  /** Consumption: the ID of the request's claim, or null when it is unclaimed. */
  protected static async NotClaimed(requestId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<string | null> {
    return (await BuildApprovalClaims.ForRequest(requestId, provider, contextUser))?.ID ?? null;
  }

  /** The approval of a request that met every rule. */
  private static approvalOf(request: RequestRow, answer: AnsweringSave, finalPayload: string | null, planHash: string, run: MJAIAgentRunEntity): BuildApproval {
    const presented = BuildApprovalResolver.jsonObject(finalPayload);
    const respondedAt = JsonParse.JsonString(answer.Row, 'RespondedAt');
    return {
      planId: (presented ? JsonParse.JsonString(presented, 'PlanId') : null) || request.OriginatingAgentRunID || request.ID,
      planHash,
      approvedBy: { kind: 'human', userId: JsonParse.JsonString(answer.Row, 'ResponseByUserID') ?? answer.UserID },
      conversationDetailId: run.ConversationDetailID ?? null,
      approvedAt: new Date(respondedAt ?? answer.ChangedAt).toISOString(),
      requestId: request.ID,
    };
  }

  /** The session's requests (not a workflow step's), oldest first. */
  private static async sessionRequests(session: readonly SessionRun[], provider: IMetadataProvider, contextUser: UserInfo): Promise<RequestRow[]> {
    const ids = session.map((r) => `'${EscapeSQLString(r.ID)}'`).join(', ');
    const result = await RunView.FromMetadataProvider(provider).RunView<RequestRow>({
      EntityName: 'MJ: AI Agent Requests',
      ExtraFilter: `OriginatingAgentRunID IN (${ids}) AND OriginatingTaskID IS NULL`,
      Fields: ['ID', 'Status', 'RequestForUserID', 'OriginatingAgentRunID', 'OriginatingAgentRunStepID', 'RespondedAt', '__mj_CreatedAt'],
      OrderBy: '__mj_CreatedAt ASC',
      ResultType: 'simple',
      BypassCache: true,
    }, contextUser);
    if (!result.Success) throw new Error(`Predictive Studio: reading the session's agent requests failed: ${result.ErrorMessage || 'unknown error'}`);
    return [...result.Results].sort((a, b) => new Date(a.__mj_CreatedAt).getTime() - new Date(b.__mj_CreatedAt).getTime());
  }

  /** The request's Plan step and Record Changes, in one batch. */
  private static async evidenceFor(request: RequestRow, provider: IMetadataProvider, contextUser: UserInfo): Promise<RequestEvidence> {
    const requestEntity = provider.EntityByName('MJ: AI Agent Requests');
    if (!requestEntity) throw new Error('Predictive Studio: the MJ: AI Agent Requests entity is not in this provider\'s metadata');
    const recordId = CompositeKey.FromID(request.ID).ToURLSegment(); // 'MJ: AI Agent Requests' — Record Changes store the prefixed segment
    const [steps, changes] = await RunView.FromMetadataProvider(provider).RunViews([
      {
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `ID='${EscapeSQLString(request.OriginatingAgentRunStepID ?? '00000000-0000-0000-0000-000000000000')}'`,
        Fields: ['ID', 'AgentRunID', 'StepName', 'StepType', 'InputData'],
        ResultType: 'simple',
        BypassCache: true,
      },
      {
        EntityName: 'MJ: Record Changes',
        ExtraFilter: `EntityID='${EscapeSQLString(requestEntity.ID)}' AND RecordID='${EscapeSQLString(recordId)}'`,
        Fields: ['Type', 'UserID', 'ChangedAt', 'FullRecordJSON'],
        OrderBy: 'ChangedAt ASC',
        ResultType: 'simple',
        BypassCache: true,
      },
    ], contextUser);
    if (!steps.Success || !changes.Success) throw new Error(`Predictive Studio: reading request ${request.ID}'s plan step and record changes failed: ${steps.ErrorMessage || changes.ErrorMessage || 'unknown error'}`);
    const step = (steps.Results as PlanStepRow[]).find((s) => UUIDsEqual(s.ID, request.OriginatingAgentRunStepID ?? '')) ?? null;
    return { Step: step, Changes: changes.Results as RequestChangeRow[] };
  }

  /** One run of the session walk, or null when it is not found. */
  private static async readRun(id: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<SessionRun | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<SessionRun>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: `ID='${EscapeSQLString(id)}'`,
      Fields: ['ID', 'AgentID', 'LastRunID', 'UserID', 'Status', 'StartedAt', 'LastHeartbeatAt', 'FinalPayload'],
      ResultType: 'simple',
      MaxRows: 1,
      BypassCache: true,
    }, contextUser);
    if (!result.Success) throw new Error(`Predictive Studio: reading agent run ${id} failed: ${result.ErrorMessage || 'unknown error'}`);
    return result.Results[0] ?? null;
  }

  /** Whether the save moves the request into an answered status (a create included). */
  private static answers(entity: MJAIAgentRequestEntity): boolean {
    if (!BuildApprovalResolver.answeredStatuses.includes(entity.Status)) return false;
    return !entity.IsSaved || entity.GetFieldByName('Status')?.OldValue !== entity.Status;
  }

  /** A Record Change's stored row, or null when it holds none. */
  private static rowOf(change: RequestChangeRow): JsonObject | null {
    return BuildApprovalResolver.jsonObject(change.FullRecordJSON);
  }

  /** A JSON object column's value, or null. */
  private static jsonObject(text: string | null): JsonObject | null {
    if (!text) return null;
    const parsed = JsonParse.ParseJsonText(text, 'json');
    return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : null;
  }

  /** Two plan texts are the same when they differ only in line endings and surrounding whitespace. */
  private static sameText(a: string, b: string | null): boolean {
    const norm = (s: string): string => s.replace(/\r\n/g, '\n').trim();
    return b !== null && norm(a) === norm(b);
  }
}
