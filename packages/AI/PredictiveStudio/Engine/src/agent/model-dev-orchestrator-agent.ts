/**
 * @module agent/model-dev-orchestrator-agent
 *
 * The Predictive Studio Agent's **orchestrator** — the DriverClass for the elevated Model Development
 * Agent, modeled on `DatabaseDesignerAgent`. Its `determineNextStep` override makes the build
 * DETERMINISTIC: once the user has approved the modeling plan, the LLM never gets to decide whether (or
 * how) to build — the orchestrator FORCES routing to the `Pipeline Builder` code sub-agent, which
 * crafts the pipeline + trains + publishes-gated-on-trust. Every other decision (gathering the goal,
 * scouting data, designing experiments, asking for approval) stays LLM-driven via `super`.
 *
 * The same override forces the `Statistics Pass` sub-agent once the plan is describable, so the
 * architecture is chosen from measured evidence rather than from the goal statement alone. Both
 * forced routes are deterministic and both fire at most once per plan.
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import type { PredictiveStudioBuilderPayload, PredictiveStudioBuildOutcome } from './pipeline-builder-agent';
import { shouldForceStatisticsPass, type PredictiveStudioStatisticsPayload } from './statistics-pass-agent';
import { shouldForceArchitect, type PredictiveStudioArchitecturePayload } from './architect-forcing';

/** The minimal payload slice the build decision reads (so it's callable with a partial in tests). */
type BuildDecisionState = { Approved?: boolean; BuildResult?: PredictiveStudioBuildOutcome; BuildAttemptUserMessageCount?: number };

/** The sub-agent NAME the orchestrator forces to once the plan is approved (matches the metadata). */
export const PIPELINE_BUILDER_SUBAGENT_NAME = 'Pipeline Builder';
const BUILD_MESSAGE = 'The plan is approved — build the pipeline, train it, and apply the publish gate now.';

/** The sub-agent NAME the orchestrator forces to before the architecture is chosen (matches the metadata). */
export const ARCHITECT_SUBAGENT_NAME = 'Architect';
const ARCHITECT_MESSAGE =
  'The statistics and gate reports are in the payload. Decide the architecture now and write your ' +
  'Architecture slice — commit, defer, reify or compose.';

export const STATISTICS_PASS_SUBAGENT_NAME = 'Statistics Pass';
const STATISTICS_MESSAGE =
  'Measure the data before we choose an approach: describe the training rows, flag suspicious inputs, ' +
  'and check which model families are admissible.';

/**
 * The deterministic decision: should the orchestrator force the build right now? Pure → unit-testable
 * without the agent framework.
 *
 * - **Not built yet** → force when the plan is approved (an explicit `Approved` flag OR a "build it"
 *   intent in the last user message).
 * - **Built successfully** → never re-force (the no-loop guard).
 * - **Build FAILED** → the stale "build it" message that triggered the failed attempt must NOT
 *   immediately re-force (that's the loop the guard exists for) — but a FRESH user message with build
 *   intent (userMessageCount above the stamp taken when the failed build was forced) gets a
 *   deterministic retry. Without a stamp (e.g. the builder was LLM-routed), we stay conservative and
 *   fall back to LLM-driven routing.
 */
export function shouldForceBuild(payload: BuildDecisionState | undefined, lastUserText: string | null, userMessageCount?: number): boolean {
  const t = (lastUserText ?? '').toLowerCase();
  const buildIntent = t.includes('build it') || t.includes('create it') || t.includes('build the prediction') || t.includes('build_now');
  if (payload?.BuildResult) {
    if (payload.BuildResult.success) return false; // built — don't loop
    const stampedAt = payload.BuildAttemptUserMessageCount;
    return buildIntent && stampedAt !== undefined && (userMessageCount ?? 0) > stampedAt;
  }
  if (payload?.Approved === true) return true;
  return buildIntent;
}

@RegisterClass(BaseAgent, 'PredictiveStudioModelDevAgent')
export class PredictiveStudioModelDevAgent extends BaseAgent {
  /**
   * Intercept the post-approval transition and force the deterministic builder; otherwise defer to the
   * normal LLM-driven flow.
   */
  protected override async determineNextStep<P>(
    params: ExecuteAgentParams,
    agentType: MJAIAgentTypeEntity,
    promptResult: AIPromptRunResult,
    currentPayload: P,
  ): Promise<BaseAgentNextStep<P>> {
    const payload = currentPayload as PredictiveStudioBuilderPayload | undefined;
    const userMessageCount = this.userMessageCount(params);

    // Measure BEFORE anything commits to an architecture. Checked first because a build forced in
    // the same turn would train on a plan whose candidates were never gated — and the pass is the
    // cheaper of the two by orders of magnitude.
    const statsPayload = currentPayload as PredictiveStudioStatisticsPayload | undefined;
    if (shouldForceStatisticsPass(statsPayload, userMessageCount)) {
      // Stamp the user-message count so a pass that produced nothing (sidecar down) does not
      // re-fire for the SAME message, while a fresh user message still gets a retry.
      const stamped = { ...(statsPayload ?? {}), StatisticsAttemptUserMessageCount: userMessageCount } as unknown as P;
      return this.buildSubAgentStep(STATISTICS_PASS_SUBAGENT_NAME, STATISTICS_MESSAGE, stamped);
    }

    // Decide the architecture BEFORE building. Reached only by LLM routing before, so a build could
    // proceed having never consulted the Architect at all — and the resulting plan was
    // indistinguishable from one predating it.
    const archPayload = currentPayload as PredictiveStudioArchitecturePayload | undefined;
    if (shouldForceArchitect(archPayload, userMessageCount)) {
      // Stamp for the same reason the statistics pass does: an Architect that returns nothing must
      // not re-fire for the SAME message, while a fresh user message still gets a retry. The flag
      // is what makes a silent no-op visible to the gate afterwards.
      const stamped = {
        ...(archPayload ?? {}),
        ArchitectureAttemptUserMessageCount: userMessageCount,
        ArchitectureAttempted: true,
      } as unknown as P;
      return this.buildSubAgentStep(ARCHITECT_SUBAGENT_NAME, ARCHITECT_MESSAGE, stamped);
    }

    if (shouldForceBuild(payload, this.lastUserMessageText(params), userMessageCount)) {
      // Stamp the user-message count so a FAILED build can distinguish the stale triggering message
      // (no re-force → no loop) from a fresh retry request (deterministic rebuild). The builder spreads
      // the incoming payload into its result, so the stamp survives the round trip.
      const stamped = { ...(payload ?? {}), BuildAttemptUserMessageCount: userMessageCount } as unknown as P;
      return this.buildSubAgentStep(PIPELINE_BUILDER_SUBAGENT_NAME, BUILD_MESSAGE, stamped);
    }
    return super.determineNextStep(params, agentType, promptResult, currentPayload);
  }

  /** Plain text of the most recent user message (normalizing string / content-block content). */
  private lastUserMessageText(params: ExecuteAgentParams): string | null {
    const messages = params.conversationMessages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return this.contentToString(messages[i].content);
      }
    }
    return null;
  }

  /** Count of user messages — the freshness clock for the failed-build retry stamp. */
  private userMessageCount(params: ExecuteAgentParams): number {
    return (params.conversationMessages ?? []).filter((m) => m.role === 'user').length;
  }

  /** Force a routed sub-agent step (the orchestrator runs again after the sub-agent returns). */
  private buildSubAgentStep<P>(agentName: string, message: string, currentPayload: P): BaseAgentNextStep<P> {
    return {
      step: 'Sub-Agent',
      terminate: false,
      previousPayload: currentPayload,
      newPayload: currentPayload,
      subAgent: { name: agentName, message, terminateAfter: false },
    };
  }
}

/** Tree-shaking anchor so the @RegisterClass side effect survives bundling. */
export function LoadPredictiveStudioModelDevAgent(): void {
  /* no-op */
}
