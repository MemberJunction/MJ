/**
 * Gate G4.3 "C1 → C1.3" (owner PR 5, phase 4): every control-path transition of a Model Development Agent session is a
 * `MJ: Agent Decision Logs` row, and the log reproduces the session (§5.1.6, D5-24). Server transport: the agent runs in
 * this process as the D5-46 person, who approves the presented plan as their own client save (G4.1's mechanics).
 *
 * One C1 session on the truth suite's W1-signal world spans the approval boundary — run 1 presents the plan, the
 * person approves, the resumed run 2 builds — and the gate measures:
 *  1. decision rows = control-path transitions (100%): one row per draft, profile and Plan step, and a `request-build`
 *     and a `report` row per dispatched build, all with run 1's `SessionRunID`, `Step` 1…n contiguous across both runs,
 *     each `PayloadHash` the previous row's `ResultingPayloadHash`;
 *  2. `AgentSessionReplay.Replay` of the session → the last `ResultingPayloadHash`, with 0 new `MJ: AI Prompt Runs`
 *     (1 of 1); a copy of the log with one logged `PromptRunID` swapped for a prompt run that does not exist →
 *     `replay-incomplete` naming it;
 *  3. no writer but `Append` changes the log: an update of a saved row (the person's client save, as GraphQL makes it),
 *     a delete, and a client create naming the session's run are each refused;
 *  4. a new modeling request after the `report`, in the same conversation, starts a new `SessionRunID`.
 * Needs the database MJAPI uses, the LLM keys and the truth sidecar. Mutation tier: it spends LLM money (three runs).
 */
import { randomUUID } from 'node:crypto';
import { RunView, ServerOperationScopeManager, WellKnownUserSource, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAgentDecisionLogEntity, MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
  AgentDecisionLog, AgentSessionReplay, BuildApprovalClaims, BuildApprovalResolver,
  type LoggedDecision, type PredictiveStudioBuilderPayload,
} from '@memberjunction/predictive-studio';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { HarnessSidecar, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { Assert, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';

/** A run step as the transition count reads it. */
interface StepRow {
  readonly AgentRunID: string;
  readonly StepType: string;
  readonly StepName: string;
}

/** The gate's steps: the person, the plan, the runs, the answer, the log and its replay. */
class PsGateC1C13Steps {
  /** The orchestrator. */
  public static readonly AGENT = 'Model Development Agent';
  /** The D5-46 person every PR 5 database has. */
  public static readonly PERSON_EMAIL = 'admin@memberjunction.org';
  /** The code steps that are control-path transitions: the draft and profile Actions. */
  public static readonly TRANSITION_ACTIONS: readonly string[] = ['Draft Prediction Unit', 'Profile Prediction Target', 'Draft Evaluation Protocol'];
  /** How long the resumed (building) run may take. */
  public static readonly RESUME_TIMEOUT_MS = 20 * 60_000; // 20 min: a W1 build trains on the sidecar
  /** Poll interval while waiting for the resumed run. */
  public static readonly POLL_MS = 3_000; // 3 s between reads of the request and the resumed run

  /** The person the gate acts as: the D5-46 user (never the MJ system user). */
  public static Person(): UserInfo {
    const user = UserCache.Instance.Users.find((u) => u.Email?.toLowerCase() === PsGateC1C13Steps.PERSON_EMAIL);
    if (!user || WellKnownUserSource.Instance.IsSystemUser(user)) throw new Error(`G4.3 needs the D5-46 person ${PsGateC1C13Steps.PERSON_EMAIL} (§2.2): create it before running the gate`);
    return user;
  }

  /** The W1-signal person-year entity the suite's dataset test loaded. */
  public static World(provider: IMetadataProvider): string {
    const entity = provider.Entities.find((e) => e.SchemaName === 'pstruth' && e.BaseTable === 'W1_MembershipYear');
    if (!entity) throw new Error('G4.3 needs W1-signal loaded: run the truth datasets test first (see the agent gate suite description)');
    return entity.Name;
  }

  /** A complete plan on `entityName` predicting `target`, with no approval in it. */
  public static Plan(name: string, entityName: string, target: string): PredictiveStudioBuilderPayload {
    const features = [...W_WORLD_FEATURES];
    const plan: ModelingPlanSpec = {
      Name: name,
      Goal: `Predictive Studio truth suite (safe to delete) — predict ${target} on ${entityName}`,
      TargetDefinition: { EntityName: entityName, TargetVariable: target, ProblemType: 'classification', SuccessMetric: 'AUC', AsOfStrategy: { Mode: 'none' } },
      CandidateSources: [{ Kind: 'Entity', Ref: entityName, Why: 'the rows being predicted' }],
      CandidateFeatures: features.map((f) => ({ Name: f, SourceRef: entityName, Kind: 'numeric' as const, Why: 'observable on the row' })),
      LeakageNotes: W_WORLD_DENY_FIELDS.map((f) => ({ Field: f, Risk: 'identifier / world bookkeeping', Action: 'exclude' as const })),
      ProposedExperiments: [{ Label: 'logistic_regression', AlgorithmName: 'logistic_regression', FeatureSet: features, Rationale: 'truth harness', Priority: 1 }],
      ValidationStrategy: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };
    return plan;
  }

  /** The orchestrator agent row. */
  public static async Agent(person: UserInfo): Promise<MJAIAgentEntityExtended> {
    await AIEngine.Instance.Config(false, person);
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === PsGateC1C13Steps.AGENT);
    if (!agent) throw new Error(`G4.3: agent '${PsGateC1C13Steps.AGENT}' not found`);
    return agent;
  }

  /** One orchestrator run as the person: a new session (with `payload`), or a continuation of `lastRunId`. */
  public static async Run(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, person: UserInfo, message: string, payload: PredictiveStudioBuilderPayload | undefined, lastRunId?: string): Promise<string> {
    const result: ExecuteAgentResult<PredictiveStudioBuilderPayload> = await new AgentRunner(ctx.Provider).RunAgent({
      agent, contextUser: person, conversationMessages: [{ role: 'user', content: message }],
      ...(payload ? { payload } : {}),
      ...(lastRunId ? { lastRunId, autoPopulateLastRunPayload: !payload } : {}),
    });
    const runId = result.agentRun?.ID;
    if (!runId) throw new Error(`G4.3: the agent run for "${message}" was not created: ${result.errorMessage || 'no error message'}`);
    return runId;
  }

  /** The open Plan request a run raised, as the person loads it. */
  public static async PlanRequest(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<MJAIAgentRequestEntity> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentRequestEntity>({
      EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingAgentRunID='${EscapeSQLString(runId)}' AND Status='Requested'`,
      OrderBy: '__mj_CreatedAt DESC', MaxRows: 1, ResultType: 'entity_object', BypassCache: true,
    }, person);
    const request = rows.Success ? rows.Results[0] : undefined;
    if (!request) throw new Error(`G4.3: run ${runId} raised no open plan request (did the control path present the plan?)`);
    return request;
  }

  /** The person approves the request: their own client save (as `RespondToAgentRequest` makes it). */
  public static async Approve(request: MJAIAgentRequestEntity): Promise<void> {
    request.Status = 'Approved';
    request.RespondedAt = new Date();
    request.ResponseData = '{"decision":"approve"}';
    const saved = await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => request.Save());
    if (!saved) throw new Error(`G4.3: approving request ${request.ID} failed: ${request.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /** The run the approval resumed, once it finished. */
  public static async Resumed(ctx: IntegrationCheckContext, person: UserInfo, requestId: string): Promise<string> {
    const deadline = Date.now() + PsGateC1C13Steps.RESUME_TIMEOUT_MS;
    for (;;) {
      const view = RunView.FromMetadataProvider(ctx.Provider);
      const rows = await view.RunView<{ readonly ResumingAgentRunID: string | null }>({
        EntityName: 'MJ: AI Agent Requests', ExtraFilter: `ID='${EscapeSQLString(requestId)}'`, Fields: ['ResumingAgentRunID'], ResultType: 'simple', BypassCache: true,
      }, person);
      const resumed = rows.Success ? rows.Results[0]?.ResumingAgentRunID : null;
      if (resumed) {
        const run = await view.RunView<{ readonly Status: string }>({ EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${EscapeSQLString(resumed)}'`, Fields: ['Status'], ResultType: 'simple', BypassCache: true }, person);
        if (run.Success && run.Results[0] && run.Results[0].Status !== 'Running') return resumed;
      }
      if (Date.now() > deadline) throw new Error(`G4.3: the run resumed by request ${requestId} did not finish in ${PsGateC1C13Steps.RESUME_TIMEOUT_MS / 60_000} min`);
      await new Promise<void>((resolve) => setTimeout(resolve, PsGateC1C13Steps.POLL_MS));
    }
  }

  /** The decision rows the runs wrote, in step order. */
  public static async RowsOfRuns(ctx: IntegrationCheckContext, person: UserInfo, runIds: readonly string[]): Promise<Array<Pick<MJAgentDecisionLogEntity, 'ID' | 'SessionRunID' | 'AgentRunID' | 'Step' | 'Decision'>>> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAgentDecisionLogEntity, 'ID' | 'SessionRunID' | 'AgentRunID' | 'Step' | 'Decision'>>({
      EntityName: AgentDecisionLog.EntityName, ExtraFilter: `AgentRunID IN (${runIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
      Fields: ['ID', 'SessionRunID', 'AgentRunID', 'Step', 'Decision'], OrderBy: 'Step ASC', ResultType: 'simple', BypassCache: true,
    }, person);
    if (!rows.Success) throw new Error(`G4.3: reading the decision rows failed: ${rows.ErrorMessage}`);
    return rows.Results;
  }

  /**
   * The control-path transitions the runs took, counted from their own run steps (not from the log): each draft or
   * profile Action step, each Plan step, and for each Pipeline Builder dispatch its `request-build` and its `report`.
   */
  public static async Transitions(ctx: IntegrationCheckContext, person: UserInfo, runIds: readonly string[]): Promise<{ readonly Count: number; readonly Detail: string }> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<StepRow>({
      EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID IN (${runIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
      Fields: ['AgentRunID', 'StepType', 'StepName'], ResultType: 'simple', BypassCache: true,
    }, person);
    if (!rows.Success) throw new Error(`G4.3: reading the run steps failed: ${rows.ErrorMessage}`);
    const actions = rows.Results.filter((s) => s.StepType === 'Actions' && PsGateC1C13Steps.TRANSITION_ACTIONS.some((a) => (s.StepName || '').includes(a))).length;
    const plans = rows.Results.filter((s) => (s.StepName || '').includes('Plan Presented for Approval')).length;
    const builds = rows.Results.filter((s) => s.StepType === 'Sub-Agent' && (s.StepName || '').includes('Pipeline Builder')).length;
    return { Count: actions + plans + 2 * builds, Detail: `${actions} draft/profile + ${plans} plan + ${builds} build ×2` };
  }

  /** Rows of `MJ: AI Prompt Runs` (the replay must add none). */
  public static async PromptRunCount(ctx: IntegrationCheckContext, person: UserInfo): Promise<number> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView({ EntityName: 'MJ: AI Prompt Runs', ResultType: 'count_only', BypassCache: true }, person);
    if (!rows.Success || rows.TotalRowCount === undefined) throw new Error(`G4.3: counting prompt runs failed: ${rows.ErrorMessage || 'no count returned'}`);
    return rows.TotalRowCount;
  }

  /** The session's rows form one chain: Step 1…n, each PayloadHash the previous ResultingPayloadHash. */
  public static Chained(rows: readonly LoggedDecision[]): boolean {
    return rows.every((r, i) => r.Step === i + 1 && (i === 0 || r.PayloadHash === rows[i - 1].ResultingPayloadHash));
  }

  /** Each writer other than `Append` is refused: an update and a delete of a saved row, and a client create. */
  public static async WritersRefused(ctx: IntegrationCheckContext, person: UserInfo, row: LoggedDecision): Promise<string[]> {
    const refusedBy: string[] = [];
    const saved = await ctx.Provider.GetEntityObject<MJAgentDecisionLogEntity>(AgentDecisionLog.EntityName, person);
    if (!(await saved.Load(row.ID))) throw new Error(`G4.3: decision row ${row.ID} could not be loaded`);
    saved.Rationale = 'edited by a client';
    if (!(await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => saved.Save()))) refusedBy.push('update');
    if (!(await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => saved.Delete()))) refusedBy.push('delete');
    const forged = await ctx.Provider.GetEntityObject<MJAgentDecisionLogEntity>(AgentDecisionLog.EntityName, person);
    forged.NewRecord();
    forged.SessionRunID = row.SessionRunID; forged.AgentRunID = row.AgentRunID; forged.Step = 999; forged.Decision = 'request-build';
    forged.PayloadHash = row.ResultingPayloadHash; forged.ResultingPayloadHash = row.ResultingPayloadHash; forged.ToolCalls = '[]';
    forged.Rationale = 'forged by a client'; forged.Replay = '{}';
    if (!(await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => forged.Save()))) refusedBy.push('create');
    return refusedBy;
  }
}

export const PsGateC1C13Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-c1-3.G4.3', Name: 'G4.3 C1 → C1.3: every transition is a decision row, and replay reproduces the plan', RequiresMutation: true,
    Fn: async (ctx) => {
      HarnessSidecar.DefaultToSuiteSidecar();
      BuildApprovalClaims.Register();
      BuildApprovalResolver.Register();
      AgentDecisionLog.Register();
      const person = PsGateC1C13Steps.Person();
      const agent = await PsGateC1C13Steps.Agent(person);
      const world = PsGateC1C13Steps.World(ctx.Provider);
      const tag = `PSTruth: G4.3 ${new Date().toISOString()}`;

      const run1 = await PsGateC1C13Steps.Run(ctx, agent, person, 'Show me this plan so I can approve it.', PsGateC1C13Steps.Plan(`${tag} build`, world, 'Renewed'));
      const request = await PsGateC1C13Steps.PlanRequest(ctx, person, run1);
      await PsGateC1C13Steps.Approve(request);
      const run2 = await PsGateC1C13Steps.Resumed(ctx, person, request.ID);

      const session = await AgentDecisionLog.Rows(run1, ctx.Provider, person);
      const written = await PsGateC1C13Steps.RowsOfRuns(ctx, person, [run1, run2]);
      const transitions = await PsGateC1C13Steps.Transitions(ctx, person, [run1, run2]);
      const oneSession = written.length === session.length && written.every((r) => UUIDsEqual(r.SessionRunID, run1));

      const promptsBefore = await PsGateC1C13Steps.PromptRunCount(ctx, person);
      const replayed = await AgentSessionReplay.Replay(run1, ctx.Provider, person);
      const promptsAfter = await PsGateC1C13Steps.PromptRunCount(ctx, person);
      const last = session[session.length - 1];
      const replayOk = !('kind' in replayed) && last !== undefined && replayed.planHash === last.ResultingPayloadHash && promptsAfter === promptsBefore;

      const logged = session.find((r) => r.PromptRunID !== null);
      const missing = randomUUID().toUpperCase();
      const copy = session.map((r) => (logged && UUIDsEqual(r.ID, logged.ID) ? { ...r, PromptRunID: missing } : r));
      const incomplete = await AgentSessionReplay.ReplayRows(copy, ctx.Provider, person);
      const incompleteOk = logged !== undefined && 'kind' in incomplete && incomplete.missingPromptRunIds.some((id) => UUIDsEqual(id, missing));

      const refusedBy = last ? await PsGateC1C13Steps.WritersRefused(ctx, person, last) : [];
      const run3 = await PsGateC1C13Steps.Run(ctx, agent, person, 'New question: plan a model of Renewed again, from scratch.', PsGateC1C13Steps.Plan(`${tag} second`, world, 'Renewed'), run2);
      const run3Rows = await PsGateC1C13Steps.RowsOfRuns(ctx, person, [run3]);
      const newSession = run3Rows.length > 0 && run3Rows.every((r) => UUIDsEqual(r.SessionRunID, run3)) && run3Rows[0].Step === 1;

      const measured = {
        run1, run2, run3, rows: session.length, decisions: session.map((r) => `${r.Step}:${r.Decision}@${UUIDsEqual(r.AgentRunID, run1) ? 'run1' : 'run2'}`).join(','),
        transitions: transitions.Count, transitionDetail: transitions.Detail, oneSession, chained: PsGateC1C13Steps.Chained(session),
        replay: 'kind' in replayed ? replayed : { planHash: replayed.planHash, steps: replayed.steps }, lastHash: last?.ResultingPayloadHash ?? null,
        newPromptRuns: promptsAfter - promptsBefore, incomplete, refusedBy: refusedBy.join('/'), run3Rows: run3Rows.map((r) => `${r.Step}:${r.Decision}`).join(','), newSession,
      };
      const passed = session.length > 0 && session.length === transitions.Count && oneSession && PsGateC1C13Steps.Chained(session)
        && session.some((r) => r.Decision === 'request-build' && UUIDsEqual(r.AgentRunID, run2))
        && replayOk && incompleteOk && refusedBy.length === 3 && newSession;
      console.log(`      → G4.3: ${session.length} decision rows for ${transitions.Count} transitions; replay ${replayOk ? 'reproduced' : 'did not reproduce'} the plan with ${promptsAfter - promptsBefore} new prompt runs  ${JSON.stringify(measured)}`);
      Assert(passed, `G4.3: ${JSON.stringify(measured)}`);
    },
  },
];

for (const c of PsGateC1C13Checks) IntegrationCheckRegistry.Instance.Register(c);
