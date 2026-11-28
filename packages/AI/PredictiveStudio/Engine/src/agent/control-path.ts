/**
 * @module agent/control-path
 *
 * `AgentControlPath` — the Model Development Agent's control path as pure code (PR 5, A2; design §5.1, D5-26, D5-37).
 * Every transition with an effect is decided here from facts the orchestrator reads from the database; no message text
 * is an input, so a "don't build it" sentence, a free-text "approve" and a framework-injected message all decide
 * nothing. The LLM only drafts text (the `gather` turns, a repair, the `report`), and every step a prompt decided passes
 * {@link AgentControlPath.Gate}, which replaces any build, draft or plan step the state does not allow.
 */
import { Canonicalize } from '@memberjunction/global';
import type { BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type { MJAIAgentRequestEntity, MJMLBuildApprovalClaimEntity } from '@memberjunction/core-entities';
import {
  GUARD_FIELDS, JsonParse,
  type AgentControlState, type AgentRefusal, type BuildApproval, type BuildApprovalRefusal, type DraftRefusal, type JsonValue, type ModelingPlanSpec,
  type ProfileResult, type UnresolvedReference,
} from '@memberjunction/predictive-studio-core';

import { SnapshotHash } from '../snapshot/snapshot-hash';

/** Every `UnresolvedReference['kind']`. */
const UNRESOLVED_KINDS: readonly UnresolvedReference['kind'][] = ['entity', 'field', 'query', 'feature-pipeline'];

/** A refusal of the approval rule, its request status bound to the generated `MJ: AI Agent Requests` field. */
export type AgentBuildApprovalRefusal = BuildApprovalRefusal<MJAIAgentRequestEntity['Status']>;

/** The session's newest claim, as the turn after it sees it. */
export interface BuildClaimFact {
  /** The claim's outcome: `claimed` until the build settles (and forever after a crash). */
  readonly Outcome: MJMLBuildApprovalClaimEntity['Outcome'];
  /** Whether the claiming run is live (`AgentSessionLease.IsLive` on the database clock). */
  readonly ClaimingRunLive: boolean;
  /** Whether the claiming run dispatched the build (its Pipeline Builder sub-agent step exists). */
  readonly BuildStarted: boolean;
  /** The failed build's error message, when the build failed and said why. */
  readonly ErrorMessage: string | null;
}

/** The profile's refusal of the session (the fixed small-data refusal or the no-usable-signal verdict). */
export type ProfileVerdictRefusal = NonNullable<ProfileResult['verdict']>;

/** The profile stage's facts (PR 5, A4): read from the session's decision log, never from a message. */
export interface ProfileFact {
  /** A `profile` row of the session profiled the payload's current unit draft and features ({@link AgentControlPath.ProfileInputHash}). */
  readonly Current: boolean;
  /** That profile's verdict: the session ends with it. */
  readonly Verdict: ProfileVerdictRefusal | null;
  /** The Action failed on the current inputs this run (the sidecar or the row read), with its message; null otherwise. */
  readonly Failed: string | null;
}

/**
 * The draft stages' facts (PR 5, A3): whether the payload's drafts were made from its current inputs, the refusal of
 * the current inputs when the draft Action refused them, the presented plan's unresolved names and the repairs used.
 */
export interface DraftFacts {
  /** The payload's `UnitDraft` was drafted from its current target (`DraftInputs.Unit` = {@link AgentControlPath.UnitDraftInputHash}). */
  readonly UnitDraftCurrent: boolean;
  /** The payload's `ProtocolDraft` was drafted from its current unit draft and proposal. */
  readonly ProtocolDraftCurrent: boolean;
  /** The draft Action's refusal of the current inputs of the stage the session is in, or null. */
  readonly Refusal: DraftRefusal | null;
  /** The drafted plan's unresolved names (`PlanMetadataValidator`), or null before both drafts are current. */
  readonly Unresolved: readonly UnresolvedReference[] | null;
  /**
   * The gathered target's unresolved names ({@link PlanMetadataValidator.ValidateTarget}) while the plan is not complete,
   * or null when there is no target to check. Optional: facts without it gather as before (wave-4 integration).
   */
  readonly TargetUnresolved?: readonly UnresolvedReference[] | null;
  /** Repairs this run already sent back to the prompt. */
  readonly RepairsUsed: number;
  /**
   * The profile stage (A4). Facts without it (a caller that keeps no decision log) move through `profile` without a
   * step, as A3 did.
   */
  readonly Profile?: ProfileFact;
}

/** What the control path decides on: read from the database and the payload, never from a message. */
export interface AgentControlFacts {
  /** {@link AgentControlPath.PlanHash} of the current payload. */
  readonly PayloadHash: string;
  /** Whether the payload holds a complete plan ({@link AgentControlPath.IsPlanComplete}). */
  readonly PlanComplete: boolean;
  /** The plan hash the session last presented for approval, or null when it presented none. */
  readonly PresentedPlanHash: string | null;
  /** The approval resolved for this run (`BuildApprovalResolver.Resolve`), or null when none was resolved. */
  readonly Approval: BuildApproval | AgentBuildApprovalRefusal | null;
  /** The newest claim of the session's newest request, when there is one. */
  readonly Claim: BuildClaimFact | null;
  /** Whether this run already dispatched its build (one claimed dispatch per run). */
  readonly BuildDispatchedThisRun: boolean;
  /**
   * The draft stages (A3). The orchestrator always reads them; facts without them (a caller that tracks no drafts)
   * move through the draft stages without a step and present a complete plan as A2 did.
   */
  readonly Drafts?: DraftFacts;
}

/** What the control path does next. */
export type AgentControlTransition =
  /** An LLM-decided state: the framework runs the orchestrator's prompt. */
  | { readonly Kind: 'prompt'; readonly State: AgentControlState }
  /** A stage with nothing to do for these facts (profile until A4; a draft stage without draft facts): the path moves on. */
  | { readonly Kind: 'advance'; readonly From: AgentControlState; readonly To: AgentControlState }
  /** Run the Draft Prediction Unit Action on the plan's target (a code Actions step). */
  | { readonly Kind: 'draft-unit' }
  /** Run the Draft Evaluation Protocol Action on the unit draft and the protocol proposal (a code Actions step). */
  | { readonly Kind: 'draft-protocol' }
  /** Run the read-only Profile Prediction Target Action on the unit draft's development rows (a code Actions step, A4). */
  | { readonly Kind: 'profile' }
  /** The profile's fixed small-data refusal: end the session, no plan presented (A4, D5-10). */
  | { readonly Kind: 'decline-small-data'; readonly Refusal: Extract<AgentRefusal, { kind: 'small-data' }> }
  /** The profile's no-usable-signal verdict: end the session, no plan presented (A4). */
  | { readonly Kind: 'decline-no-signal'; readonly Refusal: Extract<AgentRefusal, { kind: 'no-usable-signal' }> }
  /** The profile could not run on the current inputs: end the session with the reason (A4). */
  | { readonly Kind: 'profile-failed'; readonly Reason: string }
  /** Send the refusal or the unresolved names, with the exact error, to the sub-agent that owns the slice (a code Sub-Agent step). */
  | { readonly Kind: 'repair'; readonly Reason: string; readonly Owner: string }
  /** After {@link AgentControlPath.MAX_REPAIRS} repairs the plan still names something that does not exist: end the session. */
  | { readonly Kind: 'decline-unresolved-reference'; readonly References: readonly UnresolvedReference[] }
  /** After {@link AgentControlPath.MAX_REPAIRS} repairs the draft Action still refuses the plan: end the session. */
  | { readonly Kind: 'decline-draft-refused'; readonly Refusal: DraftRefusal }
  /** Present the payload's plan (a code Plan step; the framework raises the request). */
  | { readonly Kind: 'present-plan' }
  /** Claim the approval, then dispatch the Pipeline Builder. */
  | { readonly Kind: 'request-build'; readonly Approval: BuildApproval };

/**
 * The step name of a Plan Mode step. `'Plan'` is not part of `BaseAgentNextStep['step']` (the generated `FinalStep`
 * union); the framework itself writes the same assertion where it emits and executes one (`LoopAgentType`, `BaseAgent`).
 */
export const PLAN_STEP = 'Plan' as BaseAgentNextStep['step'];

/** The name of the build executor sub-agent (the metadata's `Pipeline Builder`, D-089). */
export const PIPELINE_BUILDER_SUBAGENT_NAME = 'Pipeline Builder';

/** The draft Actions the control path runs as code steps (the metadata's `MJ: Actions` names, A3). */
export const DRAFT_UNIT_ACTION_NAME = 'Draft Prediction Unit';
export const DRAFT_PROTOCOL_ACTION_NAME = 'Draft Evaluation Protocol';
/** The read-only profiling Action the control path runs after the unit draft (A4). */
export const PROFILE_ACTION_NAME = 'Profile Prediction Target';

/** The orchestrator's control path (pure statics). */
export class AgentControlPath {
  /** The payload slices that are the plan's content; the hash, the plan id, the build outcome and the report are not. */
  public static readonly PLAN_CONTENT_KEYS: readonly string[] = [
    'Goal', 'TargetDefinition', 'CandidateSources', 'CandidateFeatures', 'LeakageNotes', 'ProposedExperiments',
    'ValidationStrategy', 'ProposedBudget', 'UnitDraft', 'ProtocolDraft',
  ];

  /** The prompt steps a complete, unpresented plan is presented in place of (asking, finishing, presenting). */
  public static readonly PRESENTABLE_STEPS: readonly string[] = ['Chat', 'Success', 'Plan'];

  /** What a gather turn does instead of a refused step (D5-W4-4): the plan's next missing slice, never a code step. */
  public static readonly GATHER_NEXT_STEP = 'Call the planning sub-agent whose slice is still missing (Goal Analyst for the target, then Data Scout for sources and features, then Experiment Designer for experiments), or ask the user; never call the draft or profile actions yourself: the system runs them once the plan is complete.';

  /** The planning sub-agents a `gather` turn may call. */
  public static readonly PLANNING_SUBAGENTS: readonly string[] = ['Goal Analyst', 'Data Scout', 'Experiment Designer'];

  /** Repairs a run sends back to the prompt before it declines (§5.1: at most two). */
  public static readonly MAX_REPAIRS = 2; // design §5.1: unresolved names go back to the owning sub-agent at most twice

  /** The states whose transition is decided in code once the plan is complete (no prompt runs in them unless a repair is sent). */
  public static readonly CODE_STATES: readonly AgentControlState[] = ['draft-unit', 'profile', 'draft-protocol', 'validate-plan', 'present-plan'];

  /** The step kinds a prompt may choose without an effect (asking, finishing, thinking again). */
  private static readonly neutralSteps: readonly string[] = ['Chat', 'Success', 'Failed', 'Retry'];

  /** The states in which the planning sub-agents may be called: gathering, and repairing a draft or a name. */
  private static readonly repairStates: readonly AgentControlState[] = ['gather', 'draft-unit', 'draft-protocol', 'validate-plan'];

  /** SHA-256 (hex) of the canonical plan content: its {@link PLAN_CONTENT_KEYS} slices, keys sorted at every depth. */
  public static PlanHash(payload: ModelingPlanSpec): string {
    const content = new Map<string, string | number | boolean | object | null>();
    for (const [key, value] of Object.entries(payload)) {
      if (AgentControlPath.PLAN_CONTENT_KEYS.includes(key) && value !== undefined) content.set(key, value);
    }
    return SnapshotHash.Sha256Hex(Canonicalize(Object.fromEntries(content)));
  }

  /** A plan is complete when it names a goal, a target entity and variable, a feature and an experiment. */
  public static IsPlanComplete(payload: Partial<ModelingPlanSpec> | undefined): boolean {
    if (!payload) return false;
    const t = payload.TargetDefinition;
    return Boolean(payload.Goal && t?.EntityName && t?.TargetVariable)
      && (payload.CandidateFeatures?.length ?? 0) > 0
      && (payload.ProposedExperiments?.length ?? 0) > 0;
  }

  /**
   * The state the facts put the session in. A complete plan not presented with its current hash is drafted first (the
   * unit, then the protocol), then validated, then presented.
   */
  public static StateOf(facts: AgentControlFacts): AgentControlState {
    if (facts.BuildDispatchedThisRun) return 'report';
    if (AgentControlPath.isApproval(facts.Approval)) return 'request-build';
    if (!facts.PlanComplete || facts.PresentedPlanHash === facts.PayloadHash) return 'gather';
    const d = facts.Drafts;
    if (!d) return 'present-plan';
    if (!d.UnitDraftCurrent) return 'draft-unit';
    if (d.Profile && (!d.Profile.Current || d.Profile.Verdict !== null || d.Profile.Failed !== null)) return 'profile';
    if (!d.ProtocolDraftCurrent) return 'draft-protocol';
    return 'validate-plan';
  }

  /** SHA-256 of what the unit draft is made from: the plan's target (with its unit proposal). */
  public static UnitDraftInputHash(payload: Pick<ModelingPlanSpec, 'TargetDefinition'>): string {
    return SnapshotHash.Sha256Hex(Canonicalize({ TargetDefinition: payload.TargetDefinition || null }));
  }

  /** SHA-256 of what the profile is made from: the unit draft and the plan's candidate feature names (sorted). */
  public static ProfileInputHash(payload: Pick<ModelingPlanSpec, 'UnitDraft' | 'CandidateFeatures'>): string {
    return SnapshotHash.Sha256Hex(Canonicalize({ UnitDraft: payload.UnitDraft || null, Features: AgentControlPath.FeatureNames(payload) }));
  }

  /** The plan's candidate feature names, sorted (what the profile profiles). */
  public static FeatureNames(payload: Pick<ModelingPlanSpec, 'CandidateFeatures'>): string[] {
    return [...new Set((payload.CandidateFeatures || []).map((f) => f.Name))].sort();
  }

  /** SHA-256 of what the protocol draft is made from: the unit draft and the protocol proposal. */
  public static ProtocolDraftInputHash(payload: Pick<ModelingPlanSpec, 'TargetDefinition' | 'UnitDraft'>): string {
    return SnapshotHash.Sha256Hex(Canonicalize({ UnitDraft: payload.UnitDraft || null, Protocol: payload.TargetDefinition?.Protocol || null }));
  }

  /** The transition out of `state` (pure). A build is reached only through a resolved approval of this run. */
  public static Next(state: AgentControlState, facts: AgentControlFacts): AgentControlTransition {
    switch (state) {
      case 'draft-unit':
        if (!facts.Drafts) return { Kind: 'advance', From: state, To: 'profile' };
        return facts.Drafts.Refusal ? AgentControlPath.repairOrDecline(facts.Drafts.Refusal, facts.Drafts.RepairsUsed) : { Kind: 'draft-unit' };
      case 'profile': return AgentControlPath.nextAfterProfile(facts);
      case 'draft-protocol':
        if (!facts.Drafts) return { Kind: 'advance', From: state, To: 'validate-plan' };
        return facts.Drafts.Refusal ? AgentControlPath.repairOrDecline(facts.Drafts.Refusal, facts.Drafts.RepairsUsed) : { Kind: 'draft-protocol' };
      case 'validate-plan': return AgentControlPath.nextAfterValidation(facts);
      case 'present-plan':
        return facts.PlanComplete ? { Kind: 'present-plan' } : { Kind: 'prompt', State: 'gather' };
      case 'request-build':
        if (!facts.BuildDispatchedThisRun && AgentControlPath.isApproval(facts.Approval)) return { Kind: 'request-build', Approval: facts.Approval };
        return { Kind: 'prompt', State: facts.BuildDispatchedThisRun ? 'report' : 'gather' };
      case 'report': return { Kind: 'prompt', State: 'report' };
      case 'gather': return AgentControlPath.nextInGather(facts);
      default: return { Kind: 'prompt', State: 'gather' };
    }
  }

  /**
   * The transition out of `gather`: a target naming an entity or column that does not exist goes back to the Goal
   * Analyst (at most {@link MAX_REPAIRS} times), then the session declines listing the names; otherwise the prompt
   * gathers. A request for something the database does not hold ends in a typed decline, never only in chat text.
   */
  private static nextInGather(facts: AgentControlFacts): AgentControlTransition {
    const unresolved = facts.Drafts?.TargetUnresolved || [];
    if (unresolved.length === 0) return { Kind: 'prompt', State: 'gather' };
    return AgentControlPath.repairOrDecline({ kind: 'unresolved-reference', references: unresolved }, facts.Drafts?.RepairsUsed ?? 0);
  }

  /** The transition out of `profile` (A4): profile the current draft, then decline on a verdict or move on. */
  private static nextAfterProfile(facts: AgentControlFacts): AgentControlTransition {
    const p = facts.Drafts?.Profile;
    if (!p) return { Kind: 'advance', From: 'profile', To: 'draft-protocol' };
    if (p.Failed !== null) return { Kind: 'profile-failed', Reason: p.Failed };
    if (!p.Current) return { Kind: 'profile' };
    if (p.Verdict?.kind === 'small-data') return { Kind: 'decline-small-data', Refusal: p.Verdict };
    if (p.Verdict?.kind === 'no-usable-signal') return { Kind: 'decline-no-signal', Refusal: p.Verdict };
    return { Kind: 'advance', From: 'profile', To: 'draft-protocol' };
  }

  /** The session's last message after the fixed small-data refusal (deterministic, with the counts and the thresholds). */
  public static DeclineSmallDataMessage(r: Extract<AgentRefusal, { kind: 'small-data' }>): string {
    return `I can't build a reliable model from this data: the development rows hold ${r.resolvedRows} resolved rows, ${r.minorityRows} of them in the smaller outcome class. `
      + `A model needs at least ${r.minResolved} resolved rows and at least ${r.minMinority} in the smaller class, so I have not drafted a plan. `
      + 'Widen the rows (more years, a broader population) or pick an outcome with more cases, and ask me again.';
  }

  /** The session's last message after the no-usable-signal verdict, with the improvement's interval. */
  public static DeclineNoSignalMessage(r: Extract<AgentRefusal, { kind: 'no-usable-signal' }>): string {
    const i = r.improvement.interval;
    return `I found no usable signal: on the development rows a model of all the candidate fields does no better than predicting the base rate `
      + `(log-loss improvement ${r.improvement.value.toFixed(4)}, ${Math.round(i.level * 100)}% interval ${i.lower.toFixed(4)} to ${i.upper.toFixed(4)}, which includes 0). `
      + 'I have not drafted a plan. Add fields that plausibly drive the outcome and ask me again.';
  }

  /** The session's last message when the profile could not run. */
  public static ProfileFailedMessage(reason: string): string {
    return `I couldn't profile the data for this plan, so I have not presented it: ${reason}`;
  }

  /** The transition out of `validate-plan`: present a plan whose every name resolves; else repair, then decline. */
  private static nextAfterValidation(facts: AgentControlFacts): AgentControlTransition {
    const d = facts.Drafts;
    if (!d) return { Kind: 'advance', From: 'validate-plan', To: 'present-plan' };
    const unresolved = d.Unresolved || [];
    if (unresolved.length === 0) return facts.PlanComplete ? { Kind: 'present-plan' } : { Kind: 'prompt', State: 'gather' };
    if (d.RepairsUsed >= AgentControlPath.MAX_REPAIRS) return { Kind: 'decline-unresolved-reference', References: unresolved };
    const refusal: DraftRefusal = { kind: 'unresolved-reference', references: unresolved };
    return { Kind: 'repair', Reason: AgentControlPath.RepairReason(refusal), Owner: AgentControlPath.OwnerOfRefusal(refusal) };
  }

  /** A draft refusal goes back for a repair until {@link MAX_REPAIRS} are used; then the session declines. */
  private static repairOrDecline(refusal: DraftRefusal, repairsUsed: number): AgentControlTransition {
    if (repairsUsed < AgentControlPath.MAX_REPAIRS) return { Kind: 'repair', Reason: AgentControlPath.RepairReason(refusal), Owner: AgentControlPath.OwnerOfRefusal(refusal) };
    return refusal.kind === 'unresolved-reference' ? { Kind: 'decline-unresolved-reference', References: refusal.references } : { Kind: 'decline-draft-refused', Refusal: refusal };
  }

  /** The sub-agent that owns the plan slice at `path` (the one a repair asks to fix it). */
  public static OwnerOf(path: string): string {
    if (/^(CandidateSources|CandidateFeatures|LeakageNotes)/.test(path)) return 'Data Scout';
    if (/^(ProposedExperiments|ValidationStrategy|ProposedBudget)/.test(path)) return 'Experiment Designer';
    return 'Goal Analyst';
  }

  /** The sub-agent a refusal goes to: the owner of its first unresolved name; the Goal Analyst for a unit or protocol draft. */
  public static OwnerOfRefusal(refusal: DraftRefusal): string {
    return refusal.kind === 'unresolved-reference' && refusal.references.length > 0 ? AgentControlPath.OwnerOf(refusal.references[0].path) : 'Goal Analyst';
  }

  /** The exact error a repair hands the owning sub-agent: what is wrong, where, and what to do. */
  public static RepairReason(refusal: DraftRefusal): string {
    const fix = `${AgentControlPath.DescribeRefusal(refusal)} Correct your slice of the plan so that it uses only names from the entity catalog, and change nothing else.`;
    // Only a target entity that does not exist is one the user may have asked for (D5-W4-1); an invented label, source
    // or feature on a real entity is always replaced with a catalog name.
    const missingEntity = refusal.kind === 'unresolved-reference' && refusal.references.some((r) => r.path === 'TargetDefinition.EntityName');
    return missingEntity ? `${fix} A name the user asked for that the catalog does not have: keep it as the user wrote it, never swap in another entity or column.` : fix;
  }

  /** A draft refusal in words, naming the slice and the sub-agent that fixes it. */
  public static DescribeRefusal(refusal: DraftRefusal): string {
    switch (refusal.kind) {
      case 'unresolved-reference': {
        const lines = refusal.references.map((r) => `- ${r.kind} '${r.name}' at ${r.path} does not exist (fix: ${AgentControlPath.OwnerOf(r.path)})`);
        return `The plan names things that do not exist in the database:\n${lines.join('\n')}\nUse only names from the entity catalog.`;
      }
      case 'censoring-required':
        return 'The Prediction Unit has a label window but names no censoring rule (TargetDefinition.Unit.Censoring, fix: Goal Analyst): say how rows whose outcome window has not closed are handled.';
      case 'guard-field-edited-by-disallowed-author':
        return `The protocol proposal sets guard fields an agent may not set (${refusal.fields.join(', ')}); remove them from TargetDefinition.Protocol (fix: Goal Analyst).`;
      case 'holdout-read':
        return 'A draft would have read holdout rows, which is refused.';
      case 'draft-invalid':
        return `The draft is not valid: ${refusal.problems.join('; ')} (fix: Goal Analyst).`;
      default:
        return 'The draft was refused.';
    }
  }

  /** The session's last message when the plan still names things that do not exist after the repairs. */
  public static DeclineUnresolvedMessage(references: readonly UnresolvedReference[]): string {
    const names = references.map((r) => `- \`${r.name}\` (${r.kind}, at ${r.path})`);
    return `I can't present this plan: after ${AgentControlPath.MAX_REPAIRS} attempts to fix it, it still names things that do not exist in your database:\n${names.join('\n')}\n\nTell me which real entity and columns you mean and I will draft the plan again.`;
  }

  /** The session's last message when the draft Action still refuses the plan after the repairs. */
  public static DeclineDraftMessage(refusal: DraftRefusal): string {
    return `I can't present this plan: after ${AgentControlPath.MAX_REPAIRS} attempts to fix it, it is still refused. ${AgentControlPath.DescribeRefusal(refusal)}`;
  }

  /**
   * The step a prompt decided, allowed by `state` or replaced. `gather` and the repair states (`draft-unit`,
   * `draft-protocol`, `validate-plan`) allow the planning sub-agents and the neutral steps; every other state allows
   * only the neutral steps. A replaced step in `report` ends the run with the report's
   * text; elsewhere it becomes a `Retry` that names what was refused, so the prompt decides again.
   */
  public static Gate(state: AgentControlState, step: BaseAgentNextStep): BaseAgentNextStep {
    if (AgentControlPath.allowed(state, step)) return step;
    const refused = AgentControlPath.describe(step);
    if (state === 'report') {
      return { step: 'Success', terminate: true, message: step.message || 'The build has finished; see the results above.', previousPayload: step.previousPayload, newPayload: step.newPayload ?? step.previousPayload };
    }
    // In gather the reason also names the next planning step, so the prompt does not choose the refused step again.
    const next = state === 'gather' ? ` ${AgentControlPath.GATHER_NEXT_STEP}` : '';
    return {
      step: 'Retry',
      terminate: false,
      retryReason: `${refused} is not allowed in state ${state}: the control path decides builds, drafts and plan presentation.${next}`,
      previousPayload: step.previousPayload,
      newPayload: step.newPayload ?? step.previousPayload,
    };
  }

  /** The plain sentence a turn adds about the session's newest claim (attacks 7, 16, 22). */
  public static ClaimNote(claim: BuildClaimFact): string {
    if (claim.Outcome === 'failed') {
      return `The last build failed${claim.ErrorMessage ? `: ${claim.ErrorMessage}` : '.'} That approval is used up, so another build needs a new approval of the plan.`;
    }
    if (claim.Outcome === 'built') return 'The approved plan was built; another build needs a new approval of the plan.';
    if (claim.ClaimingRunLive) return 'A build of the approved plan is in progress.';
    if (!claim.BuildStarted) return 'The build did not start. That approval is used up, so another build needs a new approval of the plan.';
    return 'The build did not finish. That approval is used up, so another build needs a new approval of the plan.';
  }

  /** The plain sentence a turn adds about an answered request that could not be used (no message text is read). */
  public static RefusalNote(refusal: AgentBuildApprovalRefusal): string | null {
    switch (refusal.kind) {
      case 'not-agent-created': return 'That approval was not given on the plan I presented, so nothing was built.';
      case 'not-two-step': return 'That approval was not given as an answer to the plan I presented, so nothing was built.';
      case 'not-human': return 'The plan was not approved by you in person, so nothing was built.';
      case 'responder-not-permitted': return `Your account cannot create ${refusal.entity}, so the approved plan cannot be built.`;
      case 'plan-changed': return 'The plan changed after it was approved, so it needs a new approval before I build it.';
      case 'plan-edited': return 'The plan was edited on the card; I will treat the edit as feedback and present a revised plan.';
      default: return null;
    }
  }

  /** The plan as the person reads it on the card: deterministic Markdown rendered from the payload. */
  public static RenderPlan(payload: ModelingPlanSpec): string {
    const t = payload.TargetDefinition;
    const lines = [
      `## ${payload.Name || `${t.TargetVariable} prediction`}`,
      '',
      `**Goal:** ${payload.Goal}`,
      `**Predict:** \`${t.TargetVariable}\` on ${t.EntityName} (${t.ProblemType}; success metric ${t.SuccessMetric})`,
      '',
      '**Features:**',
      ...payload.CandidateFeatures.map((f) => `- \`${f.Name}\` (${f.Kind}, from ${f.SourceRef}): ${f.Why}`),
    ];
    const excluded = payload.LeakageNotes.filter((n) => n.Action === 'exclude');
    if (excluded.length > 0) lines.push('', '**Excluded (leakage risk):**', ...excluded.map((n) => `- \`${n.Field}\`: ${n.Risk}`));
    if (payload.UnitDraft) lines.push('', ...AgentControlPath.renderUnit(payload.UnitDraft));
    lines.push('', '**Experiments:**', ...[...payload.ProposedExperiments].sort((a, b) => a.Priority - b.Priority).map((e) => `- ${e.Label}: ${e.AlgorithmName} on ${e.FeatureSet.length} feature(s) — ${e.Rationale}`));
    lines.push('', 'Approve to build this plan; reject (with a note) and I will revise it.');
    return lines.join('\n');
  }

  /** The plan card's Prediction Unit section: the rows, the decision date, the outcome window and the censoring rule. */
  private static renderUnit(u: NonNullable<ModelingPlanSpec['UnitDraft']>): string[] {
    const rows = u.UnitRows;
    const decision = rows.kind === 'grain'
      ? rows.decisionDate.kind === 'fixed' ? `fixed on ${rows.decisionDate.date}${rows.decisionDate.advance ? ' (advances each run)' : ''}`
        : rows.decisionDate.kind === 'column' ? `\`${rows.decisionDate.column}\`` : `\`${rows.decisionDate.column}\` + ${rows.decisionDate.offsetDays} days`
      : `each \`${rows.periodDate}\` period of ${rows.childEntity}`;
    const cutoff = u.Censoring.cutoff;
    const cutoffText = cutoff.kind === 'now' ? 'today' : cutoff.kind === 'fixed' ? cutoff.at : `the latest ${cutoff.entity}.${cutoff.field}`;
    return [
      '**Prediction unit:**',
      `- One row per ${rows.grainEntity} record; decision date ${decision}`,
      `- Outcome: ${u.LabelWindowDays} day(s) after a ${u.LabelGapDays}-day gap; task ${u.TaskType.kind}`,
      `- **Censoring rule:** ${u.Censoring.rule} — rows whose outcome window has not closed by ${cutoffText} are left out`,
    ];
  }

  /** A draft Action's `Refusal` output read back into its union, or null when it is not one. */
  public static ParseDraftRefusal(value: JsonValue): DraftRefusal | null {
    if (!JsonParse.IsJsonObject(value)) return null;
    switch (JsonParse.JsonString(value, 'kind')) {
      case 'censoring-required': return { kind: 'censoring-required' };
      case 'holdout-read': return { kind: 'holdout-read' };
      case 'draft-invalid': return { kind: 'draft-invalid', problems: AgentControlPath.stringsOf(value['problems']) };
      case 'guard-field-edited-by-disallowed-author':
        return { kind: 'guard-field-edited-by-disallowed-author', fields: AgentControlPath.stringsOf(value['fields']).flatMap((f) => GUARD_FIELDS.filter((g) => g === f)) };
      case 'unresolved-reference': {
        const refs = Array.isArray(value['references']) ? value['references'] : [];
        return { kind: 'unresolved-reference', references: refs.flatMap((r) => AgentControlPath.referenceOf(r)) };
      }
      default: return null;
    }
  }

  /** The strings of a JSON array (other elements dropped). */
  private static stringsOf(value: JsonValue | undefined): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  }

  /** One unresolved reference of a parsed refusal, or none when the element is not one. */
  private static referenceOf(value: JsonValue): UnresolvedReference[] {
    if (!JsonParse.IsJsonObject(value)) return [];
    const path = JsonParse.JsonString(value, 'path');
    const name = JsonParse.JsonString(value, 'name');
    const kind = UNRESOLVED_KINDS.find((k) => k === JsonParse.JsonString(value, 'kind'));
    return path !== null && name !== null && kind !== undefined ? [{ path, name, kind }] : [];
  }

  /** True when `value` is an approval (not a refusal, not null). */
  private static isApproval(value: BuildApproval | AgentBuildApprovalRefusal | null): value is BuildApproval {
    return value !== null && !('kind' in value);
  }

  /** Whether `state` allows the prompt's `step`. */
  private static allowed(state: AgentControlState, step: BaseAgentNextStep): boolean {
    const kind = String(step.step);
    if (AgentControlPath.neutralSteps.includes(kind)) return step.subAgent === undefined && step.actions === undefined;
    if (AgentControlPath.repairStates.includes(state) && kind === 'Sub-Agent') return AgentControlPath.PLANNING_SUBAGENTS.includes(step.subAgent?.name ?? '');
    return false;
  }

  /** The refused step named for the prompt's retry reason. */
  private static describe(step: BaseAgentNextStep): string {
    if (step.subAgent) return `Calling the ${step.subAgent.name} sub-agent`;
    if (step.actions && step.actions.length > 0) return `Running ${step.actions.map((a) => a.name).join(', ')}`;
    return `A ${String(step.step)} step`;
  }
}
