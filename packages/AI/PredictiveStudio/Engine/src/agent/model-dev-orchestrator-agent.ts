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
type BuildDecisionState = { Approved?: boolean; BuildResult?: PredictiveStudioBuildOutcome };

/** The sub-agent NAME the orchestrator forces to once the plan is approved (matches the metadata). */
export const PIPELINE_BUILDER_SUBAGENT_NAME = 'Pipeline Builder';
const BUILD_MESSAGE = 'The plan is approved — build the pipeline, train it, and apply the publish gate now.';

/**
 * The deterministic decision: should the orchestrator force the build right now? True when the plan is
 * approved (an explicit `Approved` flag OR a "build it" intent in the last user message) AND it hasn't
 * been built yet (`BuildResult` absent). Pure → unit-testable without the agent framework.
 */
export function shouldForceBuild(payload: BuildDecisionState | undefined, lastUserText: string | null): boolean {
  if (payload?.BuildResult) return false; // already built — don't loop
  if (payload?.Approved === true) return true;
  const t = (lastUserText ?? '').toLowerCase();
  return t.includes('build it') || t.includes('create it') || t.includes('build the prediction') || t.includes('build_now');
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
    if (shouldForceBuild(payload, this.lastUserMessageText(params))) {
      return this.buildSubAgentStep(PIPELINE_BUILDER_SUBAGENT_NAME, BUILD_MESSAGE, currentPayload);
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
