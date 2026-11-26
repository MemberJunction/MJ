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
import type { AgentControlState, BuildApproval, BuildApprovalRefusal, ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

import { SnapshotHash } from '../snapshot/snapshot-hash';

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
}

/** What the control path does next. */
export type AgentControlTransition =
  /** An LLM-decided state: the framework runs the orchestrator's prompt. */
  | { readonly Kind: 'prompt'; readonly State: AgentControlState }
  /** A stage A3/A4 attach a tool to: no step in A2, the path moves on. */
  | { readonly Kind: 'advance'; readonly From: AgentControlState; readonly To: AgentControlState }
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

/** The orchestrator's control path (pure statics). */
export class AgentControlPath {
  /** The payload slices that are the plan's content; the hash, the plan id, the build outcome and the report are not. */
  public static readonly PLAN_CONTENT_KEYS: readonly string[] = [
    'Goal', 'TargetDefinition', 'CandidateSources', 'CandidateFeatures', 'LeakageNotes', 'ProposedExperiments',
    'ValidationStrategy', 'ProposedBudget', 'UnitDraft', 'ProtocolDraft',
  ];

  /** The prompt steps a complete, unpresented plan is presented in place of (asking, finishing, presenting). */
  public static readonly PRESENTABLE_STEPS: readonly string[] = ['Chat', 'Success', 'Plan'];

  /** The planning sub-agents a `gather` turn may call. */
  public static readonly PLANNING_SUBAGENTS: readonly string[] = ['Goal Analyst', 'Data Scout', 'Experiment Designer'];

  /** The step kinds a prompt may choose without an effect (asking, finishing, thinking again). */
  private static readonly neutralSteps: readonly string[] = ['Chat', 'Success', 'Failed', 'Retry'];

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

  /** The state the facts put the session in. */
  public static StateOf(facts: AgentControlFacts): AgentControlState {
    if (facts.BuildDispatchedThisRun) return 'report';
    if (AgentControlPath.isApproval(facts.Approval)) return 'request-build';
    if (facts.PlanComplete && facts.PresentedPlanHash !== facts.PayloadHash) return 'present-plan';
    return 'gather';
  }

  /** The transition out of `state` (pure). A build is reached only through a resolved approval of this run. */
  public static Next(state: AgentControlState, facts: AgentControlFacts): AgentControlTransition {
    switch (state) {
      case 'draft-unit': return { Kind: 'advance', From: state, To: 'profile' };
      case 'profile': return { Kind: 'advance', From: state, To: 'draft-protocol' };
      case 'draft-protocol': return { Kind: 'advance', From: state, To: 'validate-plan' };
      case 'validate-plan': return { Kind: 'advance', From: state, To: 'present-plan' };
      case 'present-plan':
        return facts.PlanComplete ? { Kind: 'present-plan' } : { Kind: 'prompt', State: 'gather' };
      case 'request-build':
        if (!facts.BuildDispatchedThisRun && AgentControlPath.isApproval(facts.Approval)) return { Kind: 'request-build', Approval: facts.Approval };
        return { Kind: 'prompt', State: facts.BuildDispatchedThisRun ? 'report' : 'gather' };
      case 'report': return { Kind: 'prompt', State: 'report' };
      case 'gather': return { Kind: 'prompt', State: 'gather' };
      default: return { Kind: 'prompt', State: 'gather' };
    }
  }

  /**
   * The step a prompt decided, allowed by `state` or replaced. `gather` allows the planning sub-agents and the neutral
   * steps; every other state allows only the neutral steps. A replaced step in `report` ends the run with the report's
   * text; elsewhere it becomes a `Retry` that names what was refused, so the prompt decides again.
   */
  public static Gate(state: AgentControlState, step: BaseAgentNextStep): BaseAgentNextStep {
    if (AgentControlPath.allowed(state, step)) return step;
    const refused = AgentControlPath.describe(step);
    if (state === 'report') {
      return { step: 'Success', terminate: true, message: step.message || 'The build has finished; see the results above.', previousPayload: step.previousPayload, newPayload: step.newPayload ?? step.previousPayload };
    }
    return {
      step: 'Retry',
      terminate: false,
      retryReason: `${refused} is not allowed in state ${state}: the control path decides builds, drafts and plan presentation.`,
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
    lines.push('', '**Experiments:**', ...[...payload.ProposedExperiments].sort((a, b) => a.Priority - b.Priority).map((e) => `- ${e.Label}: ${e.AlgorithmName} on ${e.FeatureSet.length} feature(s) — ${e.Rationale}`));
    lines.push('', 'Approve to build this plan; reject (with a note) and I will revise it.');
    return lines.join('\n');
  }

  /** True when `value` is an approval (not a refusal, not null). */
  private static isApproval(value: BuildApproval | AgentBuildApprovalRefusal | null): value is BuildApproval {
    return value !== null && !('kind' in value);
  }

  /** Whether `state` allows the prompt's `step`. */
  private static allowed(state: AgentControlState, step: BaseAgentNextStep): boolean {
    const kind = String(step.step);
    if (AgentControlPath.neutralSteps.includes(kind)) return step.subAgent === undefined && step.actions === undefined;
    if (state === 'gather' && kind === 'Sub-Agent') return AgentControlPath.PLANNING_SUBAGENTS.includes(step.subAgent?.name ?? '');
    return false;
  }

  /** The refused step named for the prompt's retry reason. */
  private static describe(step: BaseAgentNextStep): string {
    if (step.subAgent) return `Calling the ${step.subAgent.name} sub-agent`;
    if (step.actions && step.actions.length > 0) return `Running ${step.actions.map((a) => a.name).join(', ')}`;
    return `A ${String(step.step)} step`;
  }
}
