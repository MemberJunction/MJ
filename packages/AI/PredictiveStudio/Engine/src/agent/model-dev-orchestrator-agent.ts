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
import type { MJAIAgentRequestEntity, MJAIAgentRunEntity, MJMLBuildApprovalClaimEntity } from '@memberjunction/core-entities';
import {
  BuildApprovals, JsonParse,
  type BuildApproval, type DraftRefusal, type JsonObject, type ModelingPlanSpec, type ProtocolDraftMembers, type UnitDraft, type UnresolvedReference,
} from '@memberjunction/predictive-studio-core';

import { AgentSessionLease, type SessionBusy } from './agent-session-lease';
import { BuildApprovalClaims } from './build-approval-claims';
import { BuildApprovalResolver } from './build-approval-resolver';
import {
  AgentControlPath, DRAFT_PROTOCOL_ACTION_NAME, DRAFT_UNIT_ACTION_NAME, PIPELINE_BUILDER_SUBAGENT_NAME, PLAN_STEP,
  type AgentBuildApprovalRefusal, type AgentControlFacts, type AgentControlTransition, type BuildClaimFact, type DraftFacts,
} from './control-path';
import { PredictiveStudioPipelineBuilderAgent, type PredictiveStudioBuilderPayload } from './pipeline-builder-agent';
import { PlanMetadataValidator } from './plan-metadata-validator';
import { CatalogRenderer } from './catalog-renderer';
import { DraftEvaluationProtocolAction } from '../actions/draft-evaluation-protocol.action';

/** One action result of an Actions step, as the framework hands it back (`priorStepResult`). */
interface ActionOutput {
  readonly ActionName: string;
  readonly Success: boolean;
  readonly Message: string;
  readonly Params: ReadonlyMap<string, string>;
}

/** The planning sub-agents the orchestrator hands the compact catalog to, and whether each gets the target's fields. */
const CATALOG_READERS: Readonly<Record<string, 'with-fields' | 'entities-only'>> = { 'Data Scout': 'with-fields', 'Goal Analyst': 'entities-only' };

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
  /** The draft Actions' refusals this run, by stage and input hash (`unit:<hash>`, `protocol:<hash>`). */
  private readonly draftRefusals = new Map<string, DraftRefusal>();
  /** Repairs this run sent back to the prompt (§5.1: at most two, then the session declines). */
  private repairsUsed = 0;
  /** The message the prompt wanted on the card when code replaced its reply with the draft stages. */
  private pendingCardMessage: string | undefined = undefined;

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
      Drafts: await this.LoadDraftFacts(params, payload),
    };
  }

  /**
   * The draft stages' facts (A3): whether each draft was made from the payload's current inputs, this run's refusal of
   * the current inputs, and — once both drafts are current — the plan's unresolved names against the run's provider.
   */
  protected async LoadDraftFacts(params: ExecuteAgentParams, payload: PredictiveStudioBuilderPayload): Promise<DraftFacts> {
    const unitHash = AgentControlPath.UnitDraftInputHash(payload);
    const protocolHash = AgentControlPath.ProtocolDraftInputHash(payload);
    const unitCurrent = !!payload.UnitDraft && payload.DraftInputs?.Unit === unitHash;
    const protocolCurrent = unitCurrent && !!payload.ProtocolDraft && payload.DraftInputs?.Protocol === protocolHash;
    const refusal = !unitCurrent ? this.draftRefusals.get(`unit:${unitHash}`) : !protocolCurrent ? this.draftRefusals.get(`protocol:${protocolHash}`) : undefined;
    const unresolved = unitCurrent && protocolCurrent && AgentControlPath.IsPlanComplete(payload) ? await this.unresolvedNames(params, payload) : null;
    return { UnitDraftCurrent: unitCurrent, ProtocolDraftCurrent: protocolCurrent, Refusal: refusal || null, Unresolved: unresolved, RepairsUsed: this.repairsUsed };
  }

  /** The plan's unresolved names: metadata (entities, fields, queries) and Feature Pipeline rows, through the run's provider. */
  private async unresolvedNames(params: ExecuteAgentParams, payload: PredictiveStudioBuilderPayload): Promise<UnresolvedReference[]> {
    const ctx = this.contextOf(params);
    if (!ctx) return [];
    const plan: ModelingPlanSpec = PredictiveStudioPipelineBuilderAgent.PlanOf(payload);
    return [...PlanMetadataValidator.Validate(plan, ctx.Provider), ...await PlanMetadataValidator.ValidateFeaturePipelines(plan, ctx.Provider, ctx.ContextUser)];
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
    const code = await this.codeStepFor<P>(params, payload, previous, transition, facts);
    if (code !== null) return code;
    const decided = await super.executeNextStep<P>(params, config, previous, stepCount);
    return this.settlePromptTurn<P>(params, decided);
  }

  /**
   * The code-built step of a code-decided transition (the draft Actions, a repair, the plan, the build, a decline), or
   * null for a transition the prompt decides (`prompt`, `advance`).
   */
  private async codeStepFor<P>(params: ExecuteAgentParams, payload: PredictiveStudioBuilderPayload, previous: BaseAgentNextStep<P>, t: AgentControlTransition, facts: AgentControlFacts): Promise<BaseAgentNextStep<P> | null> {
    switch (t.Kind) {
      case 'present-plan': return this.presentPlanStep<P>(payload, previous, this.takeCardMessage());
      case 'request-build': return this.requestBuildStep<P>(params, payload, previous, t.Approval, facts.PayloadHash);
      case 'draft-unit': return this.draftActionStep<P>(DRAFT_UNIT_ACTION_NAME, { TargetDefinition: JSON.stringify(payload.TargetDefinition) }, previous, payload);
      case 'draft-protocol': return this.draftActionStep<P>(DRAFT_PROTOCOL_ACTION_NAME, { UnitDraft: JSON.stringify(payload.UnitDraft), Protocol: JSON.stringify(payload.TargetDefinition?.Protocol || {}) }, previous, payload);
      case 'repair': return this.repairStep<P>(t.Owner, t.Reason, previous, payload);
      case 'decline-unresolved-reference': return this.replyStep<P>(params, AgentControlPath.DeclineUnresolvedMessage(t.References), payload);
      case 'decline-draft-refused': return this.replyStep<P>(params, AgentControlPath.DeclineDraftMessage(t.Refusal), payload);
      default: return null;
    }
  }

  /**
   * A repair (§5.1): a code Sub-Agent step handing the owning planning sub-agent the exact error (with the catalog), so
   * it corrects its slice; the next turn drafts and validates again. Counted, so the session declines after the last.
   */
  private repairStep<P>(owner: string, reason: string, previous: BaseAgentNextStep<P>, payload: PredictiveStudioBuilderPayload): BaseAgentNextStep<P> {
    this.repairsUsed++;
    const step = this.codeStep<P>({
      step: 'Sub-Agent', terminate: false, subAgent: { name: owner, message: reason, terminateAfter: false },
      previousPayload: previous.newPayload ?? previous.previousPayload,
    }, payload);
    return this.withCatalog<P>(payload, step, step);
  }

  /** A code Actions step running one draft Action on the payload's inputs. */
  private draftActionStep<P>(action: string, actionParams: Record<string, string>, previous: BaseAgentNextStep<P>, payload: PredictiveStudioBuilderPayload): BaseAgentNextStep<P> {
    return this.codeStep<P>({
      step: 'Actions', terminate: false, actions: [{ name: action, params: actionParams }],
      previousPayload: previous.newPayload ?? previous.previousPayload,
    }, payload);
  }

  /** The prompt's message held for the card, once. */
  private takeCardMessage(): string | undefined {
    const message = this.pendingCardMessage;
    this.pendingCardMessage = undefined;
    return message;
  }

  /** A step the prompt decided: gated, noted, then executed by the framework. */
  private async executePromptDecision<P>(params: ExecuteAgentParams, config: AgentConfiguration, decided: BaseAgentNextStep<P>, stepCount: number): Promise<BaseAgentNextStep<P>> {
    const payload = this.payloadOf(params, decided);
    const facts = await this.LoadControlFacts(params, payload);
    const state = AgentControlPath.StateOf(facts);
    // A complete plan not yet presented with this hash is presented by code whatever the prompt chose to say; the
    // prompt's message goes on the card.
    if (AgentControlPath.CODE_STATES.includes(state) && AgentControlPath.PRESENTABLE_STEPS.includes(String(decided.step))) {
      const code = await this.codeTransitionInPlaceOf<P>(params, payload, decided, facts);
      if (code !== null) return code;
    }
    const gated = this.withCatalog<P>(payload, AgentControlPath.Gate(state, decided), decided);
    if (gated !== decided && String(decided.step) === String(PLAN_STEP) && facts.PlanComplete) return this.presentPlanStep<P>(payload, decided, decided.message);
    // A replaced step goes to the control path, not back to the prompt (D5-A2-7): executing the gate's Retry here would
    // run the prompt inside the framework, so a `request-build` state would never reach its code-decided transition.
    if (gated !== decided && gated.step === 'Retry') return this.decisionTurn<P>(params, config, gated, stepCount);
    const noted = this.noteStep<P>(gated, facts);
    return super.executeNextStep<P>(params, config, noted, stepCount);
  }

  /**
   * The code step that replaces a prompt's presentable reply (asking, finishing, presenting) while the plan is complete
   * but not presented: the next draft Action, a repair, the plan, or a decline. The prompt's message is kept for the
   * card. Null when the transition is the prompt's.
   */
  private async codeTransitionInPlaceOf<P>(params: ExecuteAgentParams, payload: PredictiveStudioBuilderPayload, decided: BaseAgentNextStep<P>, facts: AgentControlFacts): Promise<BaseAgentNextStep<P> | null> {
    if (decided.message) this.pendingCardMessage = decided.message;
    return this.codeStepFor<P>(params, payload, decided, AgentControlPath.Next(AgentControlPath.StateOf(facts), facts), facts);
  }

  /**
   * A planning sub-agent call with the compact entity catalog in its template parameters (DD-2): the Data Scout gets
   * the fields of the entities within two hops of the target, the Goal Analyst the entity list. The catalog is added to
   * the prompt's own sub-agent request (the step the gate let through is the step executed); a replaced step, and every
   * other step, is returned as it is.
   */
  private withCatalog<P>(payload: PredictiveStudioBuilderPayload, gated: BaseAgentNextStep<P>, decided: BaseAgentNextStep<P>): BaseAgentNextStep<P> {
    const sub = gated.subAgent;
    const reader = sub ? CATALOG_READERS[sub.name] : undefined;
    const provider = this.ProviderToUse;
    if (gated !== decided || !sub || reader === undefined || !provider) return gated;
    // A provider that carries no entity metadata has no catalog to render; the call goes ahead without one.
    if (!Array.isArray(provider.Entities)) return gated;
    const target = reader === 'with-fields' ? payload.TargetDefinition?.EntityName || null : null;
    const catalog = CatalogRenderer.Compact(provider.Entities, target, 2);
    sub.templateParameters = { ...(sub.templateParameters || {}), [CatalogRenderer.DATA_KEY]: catalog };
    return gated;
  }

  /**
   * A step this run's code built, executed by the framework. The build dispatch settles its claim with the builder's
   * outcome as soon as the sub-agent returns.
   */
  private async executeCodeStep<P>(params: ExecuteAgentParams, config: AgentConfiguration, step: BaseAgentNextStep<P>, stepCount: number): Promise<BaseAgentNextStep<P>> {
    const result = await super.executeNextStep<P>(params, config, step, stepCount);
    if (step.step === 'Sub-Agent' && this.dispatchedClaimId !== null) await this.settleClaim(params, this.dispatchedClaimId, result);
    if (step.step === 'Actions') return this.absorbDraft<P>(params, step, result);
    return result;
  }

  /**
   * After a draft Action ran: its validated draft goes into the payload (with the hash of the inputs it was made from),
   * or its refusal is held for the inputs it refused, so the next turn repairs instead of drafting the same inputs
   * again. The payload is changed here, by code: no prompt and no sub-agent may write the drafts (D5-25).
   */
  private absorbDraft<P>(params: ExecuteAgentParams, step: BaseAgentNextStep<P>, result: BaseAgentNextStep<P>): BaseAgentNextStep<P> {
    const payload = this.payloadOf(params, result);
    const action = step.actions?.[0]?.name || '';
    const output = PredictiveStudioModelDevAgent.ActionOutputsOf(result.priorStepResult).find((o) => o.ActionName === action);
    const isUnit = action === DRAFT_UNIT_ACTION_NAME;
    const key = isUnit ? `unit:${AgentControlPath.UnitDraftInputHash(payload)}` : `protocol:${AgentControlPath.ProtocolDraftInputHash(payload)}`;
    const drafted = output ? this.draftOf(isUnit, output, payload) : null;
    if (drafted === null) {
      this.draftRefusals.set(key, PredictiveStudioModelDevAgent.RefusalOf(output));
      return result;
    }
    // The framework's generic `P` is this agent's payload; see `codeStep`.
    return { ...result, newPayload: drafted as P };
  }

  /** The payload with the Action's draft written in, or null when the Action returned no valid draft. */
  private draftOf(isUnit: boolean, output: ActionOutput, payload: PredictiveStudioBuilderPayload): PredictiveStudioBuilderPayload | null {
    const json = PredictiveStudioModelDevAgent.jsonParam(output, isUnit ? 'UnitDraft' : 'ProtocolDraft');
    if (json === null) return null;
    if (isUnit) {
      const unit: UnitDraft | null = DraftEvaluationProtocolAction.UnitDraftOf(json);
      return unit === null ? null : { ...payload, UnitDraft: unit, ProtocolDraft: undefined, DraftInputs: { Unit: AgentControlPath.UnitDraftInputHash(payload), Protocol: null } };
    }
    if (!payload.UnitDraft || !payload.DraftInputs) return null;
    const protocol: ProtocolDraftMembers | null = DraftEvaluationProtocolAction.ProtocolDraftOf(json, payload.UnitDraft);
    return protocol === null ? null : { ...payload, ProtocolDraft: protocol, DraftInputs: { Unit: payload.DraftInputs.Unit, Protocol: AgentControlPath.ProtocolDraftInputHash(payload) } };
  }

  /** The refusal an Action output carries; an Action that failed or returned neither is `draft-invalid` with its message. */
  public static RefusalOf(output: ActionOutput | undefined): DraftRefusal {
    const json = output ? PredictiveStudioModelDevAgent.jsonParam(output, 'Refusal') : null;
    const parsed = json === null ? null : AgentControlPath.ParseDraftRefusal(json);
    return parsed || { kind: 'draft-invalid', problems: [output ? output.Message || 'the draft Action returned no draft' : 'the draft Action did not run'] };
  }

  /** The framework's action results (`priorStepResult` of an Actions step), read through guards. */
  public static ActionOutputsOf(priorStepResult: unknown): ActionOutput[] {
    if (!Array.isArray(priorStepResult)) return [];
    return priorStepResult.flatMap((r: unknown) => {
      if (typeof r !== 'object' || r === null || !('actionName' in r) || typeof r.actionName !== 'string') return [];
      const params = 'params' in r && Array.isArray(r.params) ? r.params : [];
      const values = new Map<string, string>();
      for (const p of params) {
        if (typeof p === 'object' && p !== null && 'Name' in p && typeof p.Name === 'string' && 'Value' in p) values.set(p.Name, typeof p.Value === 'string' ? p.Value : JSON.stringify(p.Value));
      }
      const message = 'message' in r && typeof r.message === 'string' ? r.message : '';
      return [{ ActionName: r.actionName, Success: 'success' in r && r.success === true, Message: message, Params: values }];
    });
  }

  /** An output param parsed as JSON, or null. */
  private static jsonParam(output: ActionOutput, name: string): JsonObject | null {
    const text = output.Params.get(name);
    const parsed = text ? JsonParse.ParseJsonText(text, name) : null;
    return parsed && parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : null;
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
    if (AgentControlPath.CODE_STATES.includes(AgentControlPath.StateOf(facts))) {
      const code = await this.codeTransitionInPlaceOf<P>(params, payload, decided, facts);
      if (code !== null) {
        // The framework already raised a request for the prompt's Chat (BaseAgent.executePromptStep); the code steps
        // end in the Plan step that raises the one the person answers, so the prompt's is canceled, not left beside it.
        if (String(decided.step) === 'Chat') await this.CancelPromptRaisedRequests(params);
        return code;
      }
    }
    if (!decided.terminate || this.noted) return decided;
    return this.noteStep<P>(decided, facts);
  }

  /**
   * Cancels this run's open requests, called just before the code Plan step runs: each was raised by this run's prompt
   * (or by a plan the new one supersedes), so the person is left one card to answer. A failed save is logged; the Plan
   * step's request is the session's newest either way, and the approval rule reads only that one.
   */
  protected async CancelPromptRaisedRequests(params: ExecuteAgentParams): Promise<void> {
    const ctx = this.contextOf(params);
    const runId = this.CurrentRunID;
    if (!ctx || !runId) return;
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentRequestEntity>({
      EntityName: 'MJ: AI Agent Requests',
      ExtraFilter: `OriginatingAgentRunID='${EscapeSQLString(runId)}' AND Status='Requested'`,
      ResultType: 'entity_object',
      BypassCache: true,
    }, ctx.ContextUser);
    if (!result.Success) {
      LogError(`PredictiveStudioModelDevAgent: reading run ${runId}'s prompt-raised requests failed: ${result.ErrorMessage || 'unknown error'}`);
      return;
    }
    for (const request of result.Results) {
      request.Status = 'Canceled';
      if (!(await request.Save())) LogError(`PredictiveStudioModelDevAgent: canceling request ${request.ID} failed: ${request.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
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
