/**
 * @module agent/model-dev-orchestrator-agent
 *
 * The Model Development Agent's **orchestrator** (the elevated agent's DriverClass): a state machine whose LLM calls only
 * draft text (PR 5, A2; design §5.1). It overrides `executeNextStep` (D5-26, D5-37), which both chooses and executes a
 * step:
 *
 * - **A run's first turn** goes to the framework (initial step, routing record, budget check), after the session turn
 *   lock (`AgentSessionLease`, D5-38): a live sibling run of the session → a `session-busy` reply, nothing run.
 * - **A `Retry` turn** (the framework would run the prompt) is decided by {@link AgentControlPath.Next} after the tree
 *   budget check: a code-decided transition (`present-plan`, `request-build`) is returned as a step built by code, with
 *   no prompt, and the framework executes it on the next turn; an LLM-decided state (`gather`, a repair, `report`) runs
 *   the prompt.
 * - **A step the prompt decided** passes {@link AgentControlPath.Gate} before the framework executes it: a build, draft
 *   or plan step the state does not allow is replaced.
 *
 * A build starts only from a resolved `BuildApproval` (`BuildApprovalResolver`, D-090) and only after the run took the
 * approval's atomic claim (`BuildApprovalClaims`, D5-23); the claim consumes the approval whatever the build does. No
 * message text is read, so framework-injected messages and "don't build it" sentences decide nothing.
 */
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { BaseAgent } from '@memberjunction/ai-agents';
import type { AgentConfiguration, BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { MJAIAgentRunEntity, MJMLBuildApprovalClaimEntity } from '@memberjunction/core-entities';
import { BuildApprovals, JsonParse, type BuildApproval } from '@memberjunction/predictive-studio-core';

import { AgentSessionLease, type SessionBusy } from './agent-session-lease';
import { BuildApprovalClaims } from './build-approval-claims';
import { BuildApprovalResolver } from './build-approval-resolver';
import {
  AgentControlPath, PIPELINE_BUILDER_SUBAGENT_NAME, PLAN_STEP,
  type AgentBuildApprovalRefusal, type AgentControlFacts, type BuildClaimFact,
} from './control-path';
import type { PredictiveStudioBuilderPayload } from './pipeline-builder-agent';

/** The message the orchestrator hands the Pipeline Builder when it dispatches an approved, claimed build. */
const BUILD_MESSAGE = 'The plan is approved and claimed — build the pipeline, train it, and apply the publish gate now.';

@RegisterClass(BaseAgent, 'PredictiveStudioModelDevAgent')
export class PredictiveStudioModelDevAgent extends BaseAgent {
  /** The steps this run's code built (so they are executed, never gated as a prompt's). */
  private readonly codeSteps = new WeakSet<BaseAgentNextStep>();
  /** The approval resolved for this run, once (the request is answered before the run that reads it starts). */
  private resolvedApproval: BuildApproval | AgentBuildApprovalRefusal | null | undefined = undefined;
  /** The claim this run took and dispatched its build under, when it did. */
  private dispatchedClaimId: string | null = null;
  /** Database clock minus process clock, read under the session lock (liveness is measured on the database clock). */
  private dbClockOffsetMs = 0;
  /** Whether this run's reply already carries its note about the session's newest request or claim. */
  private noted = false;
  /** The session's newest claim as this run first read it (read once per run). */
  private claimRead: { readonly ClaimID: string; readonly Fact: BuildClaimFact | null } | null = null;

  protected override async executeNextStep<P = PredictiveStudioBuilderPayload>(
    params: ExecuteAgentParams,
    config: AgentConfiguration,
    previousDecision: BaseAgentNextStep<P> | null,
    stepCount: number = 0,
  ): Promise<BaseAgentNextStep<P>> {
    if (previousDecision === null) return this.firstTurn<P>(params, config, stepCount);
    if (this.codeSteps.has(previousDecision)) return this.executeCodeStep<P>(params, config, previousDecision, stepCount);
    if (previousDecision.step === 'Retry') return this.decisionTurn<P>(params, config, previousDecision, stepCount);
    return this.executePromptDecision<P>(params, config, previousDecision, stepCount);
  }

  /** The run this agent is executing (its ID claims the approval). */
  protected get CurrentRunID(): string {
    return this.AgentRun?.ID ?? '';
  }

  /**
   * Takes the session's turn lock and reports a live sibling run that holds the session, or null. A run that continues
   * nothing (no `LastRunID`) starts its own session and takes no lock.
   */
  protected async TakeSessionTurn(params: ExecuteAgentParams): Promise<SessionBusy | null> {
    const run = this.AgentRun;
    const ctx = this.contextOf(params);
    if (!run || !run.LastRunID || !ctx) return null;
    const session = await BuildApprovalResolver.SessionRuns(run, ctx.Provider, ctx.ContextUser);
    const sessionRunId = session[session.length - 1].ID;
    const result = await AgentSessionLease.WithSessionLock(sessionRunId, async (dbNow) => {
      this.dbClockOffsetMs = dbNow.getTime() - Date.now();
      return null;
    }, ctx, { CurrentRunID: run.ID, SessionRunIDs: session.map((r) => r.ID) });
    return result;
  }

  /** The facts the control path decides on, read from the database and the payload (never a message). */
  protected async LoadControlFacts(params: ExecuteAgentParams, payload: PredictiveStudioBuilderPayload): Promise<AgentControlFacts> {
    const payloadHash = AgentControlPath.PlanHash(payload);
    const approval = await this.approvalFor(params, payloadHash);
    return {
      PayloadHash: payloadHash,
      PlanComplete: AgentControlPath.IsPlanComplete(payload),
      PresentedPlanHash: payload.PlanHash || null,
      Approval: approval,
      Claim: approval !== null && 'kind' in approval && approval.kind === 'consumed' ? await this.claimFactOnce(params, approval.claimId) : null,
      BuildDispatchedThisRun: this.dispatchedClaimId !== null,
    };
  }

  /** A run's first turn: the session lock, then the framework (initial step, routing record, budget check). */
  private async firstTurn<P>(params: ExecuteAgentParams, config: AgentConfiguration, stepCount: number): Promise<BaseAgentNextStep<P>> {
    const busy = await this.TakeSessionTurn(params);
    if (busy !== null) return this.sessionBusyReply<P>(params, busy);
    const decided = await super.executeNextStep<P>(params, config, null, stepCount);
    return this.settlePromptTurn<P>(params, decided);
  }

  /**
   * A `Retry` turn: the budget check, then the control path. A code-decided transition becomes a code step (no prompt);
   * an LLM-decided state runs the prompt.
   */
  private async decisionTurn<P>(params: ExecuteAgentParams, config: AgentConfiguration, previous: BaseAgentNextStep<P>, stepCount: number): Promise<BaseAgentNextStep<P>> {
    if (this.checkTreeBudgetLimit(params).exceeded) return super.executeNextStep<P>(params, config, previous, stepCount);
    const payload = this.payloadOf(params, previous);
    const facts = await this.LoadControlFacts(params, payload);
    const transition = AgentControlPath.Next(AgentControlPath.StateOf(facts), facts);
    if (transition.Kind === 'present-plan') return this.presentPlanStep<P>(payload, previous);
    if (transition.Kind === 'request-build') return this.requestBuildStep<P>(params, payload, previous, transition.Approval, facts.PayloadHash);
    const decided = await super.executeNextStep<P>(params, config, previous, stepCount);
    return this.settlePromptTurn<P>(params, decided);
  }

  /** A step the prompt decided: gated, noted, then executed by the framework. */
  private async executePromptDecision<P>(params: ExecuteAgentParams, config: AgentConfiguration, decided: BaseAgentNextStep<P>, stepCount: number): Promise<BaseAgentNextStep<P>> {
    const payload = this.payloadOf(params, decided);
    const facts = await this.LoadControlFacts(params, payload);
    const state = AgentControlPath.StateOf(facts);
    // A complete plan not yet presented with this hash is presented by code whatever the prompt chose to say; the
    // prompt's message goes on the card.
    if (state === 'present-plan' && AgentControlPath.PRESENTABLE_STEPS.includes(String(decided.step))) return this.presentPlanStep<P>(payload, decided, decided.message);
    const gated = AgentControlPath.Gate(state, decided);
    if (gated !== decided && String(decided.step) === String(PLAN_STEP) && facts.PlanComplete) return this.presentPlanStep<P>(payload, decided, decided.message);
    const noted = this.noteStep<P>(gated, facts);
    return super.executeNextStep<P>(params, config, noted, stepCount);
  }

  /**
   * A step this run's code built, executed by the framework. The build dispatch settles its claim with the builder's
   * outcome as soon as the sub-agent returns.
   */
  private async executeCodeStep<P>(params: ExecuteAgentParams, config: AgentConfiguration, step: BaseAgentNextStep<P>, stepCount: number): Promise<BaseAgentNextStep<P>> {
    const result = await super.executeNextStep<P>(params, config, step, stepCount);
    if (step.step === 'Sub-Agent' && this.dispatchedClaimId !== null) await this.settleClaim(params, this.dispatchedClaimId, result);
    return result;
  }

  /** The code Plan step: the plan rendered from the payload, its hash and id written into the payload (D5-36). */
  private presentPlanStep<P>(payload: PredictiveStudioBuilderPayload, previous: BaseAgentNextStep<P>, message?: string): BaseAgentNextStep<P> {
    const presented: PredictiveStudioBuilderPayload = {
      ...payload,
      PlanHash: AgentControlPath.PlanHash(payload),
      PlanId: payload.PlanId || this.CurrentRunID || payload.PlanHash || '',
    };
    return this.codeStep<P>({
      step: PLAN_STEP,
      terminate: false,
      message: message || 'Here is the plan. Approve it to build it, or reject it with a note and I will revise it.',
      planDetails: { plan: AgentControlPath.RenderPlan(payload) },
      previousPayload: previous.newPayload ?? previous.previousPayload,
    }, presented);
  }

  /** Claims the approval, then dispatches the Pipeline Builder with the claim named in the payload (D5-39 order). */
  private async requestBuildStep<P>(params: ExecuteAgentParams, payload: PredictiveStudioBuilderPayload, previous: BaseAgentNextStep<P>, approval: BuildApproval, planHash: string): Promise<BaseAgentNextStep<P>> {
    const ctx = this.contextOf(params);
    if (!ctx) return this.replyStep<P>(params, 'I cannot build: this run has no user or provider to claim the approval with.', payload);
    const claim = await BuildApprovalClaims.Claim(approval.requestId, this.CurrentRunID, planHash, ctx.Provider, ctx.ContextUser);
    if (!('Claimed' in claim)) {
      this.resolvedApproval = claim;
      return this.replyStep<P>(params, 'That approval was already used by another build; another build needs a new approval of the plan.', payload);
    }
    this.dispatchedClaimId = claim.ClaimID;
    return this.codeStep<P>({
      step: 'Sub-Agent',
      terminate: false,
      subAgent: { name: PIPELINE_BUILDER_SUBAGENT_NAME, message: BUILD_MESSAGE, terminateAfter: false },
      previousPayload: previous.newPayload ?? previous.previousPayload,
    }, { ...payload, BuildClaimID: claim.ClaimID });
  }

  /** Records the dispatched build's outcome on its claim (a failure to record is logged; the claim stays consumed). */
  private async settleClaim<P>(params: ExecuteAgentParams, claimId: string, result: BaseAgentNextStep<P>): Promise<void> {
    const ctx = this.contextOf(params);
    if (!ctx) return;
    const outcome = this.payloadOf(params, result).BuildResult;
    try {
      await BuildApprovalClaims.Settle(claimId, outcome?.success === true ? 'built' : 'failed', outcome?.pipelineId || null, ctx.Provider, ctx.ContextUser);
    } catch (e) {
      LogError(`PredictiveStudioModelDevAgent: settling build approval claim ${claimId} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The approval of this run, resolved once. A run with no `LastRunID` continues no session, so it holds none. */
  private async approvalFor(params: ExecuteAgentParams, payloadHash: string): Promise<BuildApproval | AgentBuildApprovalRefusal | null> {
    if (this.resolvedApproval !== undefined) return this.resolvedApproval;
    const run = this.AgentRun;
    const ctx = this.contextOf(params);
    this.resolvedApproval = !run || !run.LastRunID || !ctx ? { kind: 'no-request' } : await BuildApprovalResolver.Resolve(run, payloadHash, ctx.Provider, ctx.ContextUser);
    return this.resolvedApproval;
  }

  /** {@link claimFact}, read once per run. */
  private async claimFactOnce(params: ExecuteAgentParams, claimId: string): Promise<BuildClaimFact | null> {
    if (this.claimRead === null || !UUIDsEqual(this.claimRead.ClaimID, claimId)) this.claimRead = { ClaimID: claimId, Fact: await this.claimFact(params, claimId) };
    return this.claimRead.Fact;
  }

  /** What the turn after a claim sees of it: its outcome, whether its run is live, whether it dispatched, its error. */
  private async claimFact(params: ExecuteAgentParams, claimId: string): Promise<BuildClaimFact | null> {
    const ctx = this.contextOf(params);
    if (!ctx) return null;
    const claim = await ctx.Provider.GetEntityObject<MJMLBuildApprovalClaimEntity>(BuildApprovalClaims.EntityName, ctx.ContextUser);
    if (!(await claim.Load(claimId))) return null;
    const runs = await this.claimingRuns(claim.ClaimingAgentRunID, ctx.Provider, ctx.ContextUser);
    const claiming = runs.find((r) => UUIDsEqual(r.ID, claim.ClaimingAgentRunID));
    const dbNow = new Date(Date.now() + this.dbClockOffsetMs);
    return {
      Outcome: claim.Outcome,
      ClaimingRunLive: claiming ? AgentSessionLease.IsLive(claiming, dbNow) : false,
      BuildStarted: runs.some((r) => r.ParentRunID !== null && UUIDsEqual(r.ParentRunID, claim.ClaimingAgentRunID)),
      ErrorMessage: claiming ? this.buildErrorOf(claiming.FinalPayload) : null,
    };
  }

  /** The claiming run and its child runs (a child is the dispatched Pipeline Builder), read fresh. */
  private async claimingRuns(runId: string, provider: IMetadataProvider, user: UserInfo): Promise<Pick<MJAIAgentRunEntity, 'ID' | 'ParentRunID' | 'Status' | 'StartedAt' | 'LastHeartbeatAt' | 'FinalPayload'>[]> {
    const result = await RunView.FromMetadataProvider(provider).RunView<Pick<MJAIAgentRunEntity, 'ID' | 'ParentRunID' | 'Status' | 'StartedAt' | 'LastHeartbeatAt' | 'FinalPayload'>>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: `ID='${EscapeSQLString(runId)}' OR (ParentRunID='${EscapeSQLString(runId)}' AND Agent='${EscapeSQLString(PIPELINE_BUILDER_SUBAGENT_NAME)}')`,
      Fields: ['ID', 'ParentRunID', 'Status', 'StartedAt', 'LastHeartbeatAt', 'FinalPayload'],
      ResultType: 'simple',
      BypassCache: true,
    }, user);
    if (!result.Success) throw new Error(`Predictive Studio: reading the claiming run ${runId} failed: ${result.ErrorMessage || 'unknown error'}`);
    return result.Results;
  }

  /** The failed build's error message stored in a run's final payload, or null. */
  private buildErrorOf(finalPayload: string | null): string | null {
    const parsed = finalPayload ? JsonParse.ParseJsonText(finalPayload, 'FinalPayload') : null;
    if (!parsed || !parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return null;
    const build = parsed.Value.BuildResult;
    return JsonParse.IsJsonObject(build) ? JsonParse.JsonString(build, 'errorMessage') : null;
  }

  /**
   * The step a prompt turn returned (the framework's `executeNextStep` for a first or `Retry` turn). A complete plan not
   * yet presented with its hash is presented by code in place of a presentable step, the prompt's message on the card:
   * the framework ends the run on a terminal `Chat` or `Success` without asking this agent again, so this is the only
   * place such a step can be replaced (D5-A2-7). Otherwise a terminal step gets this run's note (when it has one).
   */
  private async settlePromptTurn<P>(params: ExecuteAgentParams, decided: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>> {
    if (!AgentControlPath.PRESENTABLE_STEPS.includes(String(decided.step))) return decided;
    const payload = this.payloadOf(params, decided);
    const facts = await this.LoadControlFacts(params, payload);
    if (AgentControlPath.StateOf(facts) === 'present-plan') return this.presentPlanStep<P>(payload, decided, decided.message);
    if (!decided.terminate || this.noted) return decided;
    return this.noteStep<P>(decided, facts);
  }

  /** `step` with the note about the session's newest claim or unusable answer appended to its message, once per run. */
  private noteStep<P>(step: BaseAgentNextStep<P>, facts: AgentControlFacts): BaseAgentNextStep<P> {
    if (this.noted || !['Chat', 'Success'].includes(String(step.step))) return step;
    const note = facts.Claim ? AgentControlPath.ClaimNote(facts.Claim)
      : facts.Approval !== null && !BuildApprovals.IsApproval(facts.Approval) ? AgentControlPath.RefusalNote(facts.Approval) : null;
    if (!note) return step;
    this.noted = true;
    const message = step.message ? `${step.message}\n\n${note}` : note;
    return { ...step, message };
  }

  /** The reply of a run whose session another live run holds: nothing is run or written. */
  private sessionBusyReply<P>(params: ExecuteAgentParams, busy: SessionBusy): BaseAgentNextStep<P> {
    const message = `I'm already working on this in another turn (run ${busy.liveRunId}); please wait for it to finish, then try again.`;
    return this.replyStep<P>(params, message, this.payloadOf(params, null));
  }

  /** A terminal reply carrying `payload` unchanged. */
  private replyStep<P>(params: ExecuteAgentParams, message: string, payload: PredictiveStudioBuilderPayload): BaseAgentNextStep<P> {
    void params;
    return this.codeStep<P>({ step: 'Chat', terminate: true, message }, payload);
  }

  /** Marks a step as this run's code's own and sets its payload. */
  private codeStep<P>(step: Omit<BaseAgentNextStep<P>, 'newPayload'>, payload: PredictiveStudioBuilderPayload): BaseAgentNextStep<P> {
    // The framework's generic `P` is this agent's payload, the builder payload; TypeScript cannot relate a type
    // parameter to a concrete type without this one assertion (as `PredictiveStudioPipelineBuilderAgent.codeStep` does).
    const built: BaseAgentNextStep<P> = { ...step, newPayload: payload as P };
    this.codeSteps.add(built);
    return built;
  }

  /** The payload a step carries, or the run's. */
  private payloadOf<P>(params: ExecuteAgentParams, step: BaseAgentNextStep<P> | null): PredictiveStudioBuilderPayload {
    // The framework's generic `P` is this agent's payload; it is read back through the object guard, not cast.
    const carried: unknown = step?.newPayload ?? step?.previousPayload ?? params.payload;
    if (PredictiveStudioModelDevAgent.IsPayload(carried)) return carried;
    // `ExecuteAgentParams` carries the framework's untyped payload; this agent's payload is the builder payload.
    const initial: PredictiveStudioBuilderPayload = params.payload || {};
    return initial;
  }

  /** True for a payload object (the framework stores an agent's payload as a JSON object). */
  public static IsPayload(value: unknown): value is PredictiveStudioBuilderPayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /** The user and provider this run reads and writes as. */
  private contextOf(params: ExecuteAgentParams): { readonly ContextUser: UserInfo; readonly Provider: IMetadataProvider } | null {
    const user = params.contextUser;
    const provider = this.ProviderToUse;
    return user && provider ? { ContextUser: user, Provider: provider } : null;
  }
}

/** Tree-shaking anchor so the @RegisterClass side effect survives bundling. */
export function LoadPredictiveStudioModelDevAgent(): void {
  /* no-op */
}
