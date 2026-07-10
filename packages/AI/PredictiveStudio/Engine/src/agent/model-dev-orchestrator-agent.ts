/**
 * @module agent/model-dev-orchestrator-agent
 *
 * The Predictive Studio Agent's **orchestrator** — the DriverClass for the elevated Model Development
 * Agent, modeled on `DatabaseDesignerAgent`. Its `determineNextStep` override makes the build
 * DETERMINISTIC: once the user has approved the modeling plan, the LLM never gets to decide whether (or
 * how) to build — the orchestrator FORCES routing to the `Pipeline Builder` code sub-agent, which
 * crafts the pipeline + trains + publishes-gated-on-trust. Every other decision (gathering the goal,
 * scouting data, designing experiments, asking for approval) stays LLM-driven via `super`.
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import type { PredictiveStudioBuilderPayload, PredictiveStudioBuildOutcome } from './pipeline-builder-agent';

/** The minimal payload slice the build decision reads (so it's callable with a partial in tests). */
type BuildDecisionState = { Approved?: boolean; BuildResult?: PredictiveStudioBuildOutcome; BuildAttemptUserMessageCount?: number };

/** The sub-agent NAME the orchestrator forces to once the plan is approved (matches the metadata). */
export const PIPELINE_BUILDER_SUBAGENT_NAME = 'Pipeline Builder';
const BUILD_MESSAGE = 'The plan is approved — build the pipeline, train it, and apply the publish gate now.';

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
