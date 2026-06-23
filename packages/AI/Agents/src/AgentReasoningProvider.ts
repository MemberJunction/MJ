/**
 * @fileoverview Agent ('Agent' mode) reasoning provider for duplicate detection.
 *
 * Runs the shared "Duplicate Resolution" instruction set through an orchestrated agent
 * (`AgentRunner.RunAgent`) rather than a single-shot prompt — the heavier path that unlocks
 * memory-note injection and (Phase 2) context-exploration tools. It produces the IDENTICAL
 * structured verdict as `PromptReasoningProvider` and persists the resulting `AIAgentRunID`.
 *
 * Lives in `@memberjunction/ai-agents` (not the dupe package) because the dupe package is a
 * dependency of ai-agents — importing `AgentRunner` from there would create a build cycle.
 * It registers against the abstract `DuplicateReasoningProvider` seam (defined in the dupe
 * package) under the 'Agent' key, so the detector resolves it at runtime via ClassFactory
 * with no static import back into the pipeline.
 *
 * @module @memberjunction/ai-agents
 */

import { LogError } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
    DuplicateReasoningProvider,
    AGENT_REASONING_PROVIDER_KEY,
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext,
} from '@memberjunction/ai-vector-dupe';
import { AgentRunner } from './AgentRunner';

/** The name of the seeded agent used when an Entity Document doesn't specify one. */
const DEFAULT_REASONING_AGENT_NAME = 'Duplicate Resolution Agent';

/**
 * Agent-backed reasoning provider. Registered under the 'Agent' `ReasoningMode`.
 */
@RegisterClass(DuplicateReasoningProvider, AGENT_REASONING_PROVIDER_KEY)
export class AgentReasoningProvider extends DuplicateReasoningProvider {
    /**
     * Reason over a matched set via an orchestrated agent run.
     */
    public async Reason(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        try {
            await AIEngine.Instance.Config(false, context.ContextUser, context.Provider);
            const agent = this.resolveAgent(input);
            if (!agent) {
                return this.failedOutput(
                    `No reasoning agent resolved (ReasoningAgentID=${input.EntityDocument.ReasoningAgentID ?? 'null'}, fallback="${DEFAULT_REASONING_AGENT_NAME}")`
                );
            }
            return await this.runAgent(agent, input, context);
        } catch (e) {
            LogError(e);
            return this.failedOutput(e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Resolve the agent from `ReasoningAgentID`, falling back to the seeded
     * "Duplicate Resolution Agent" by name. Uses the AIEngine cache (no DB query).
     */
    protected resolveAgent(input: DuplicateReasoningInput): MJAIAgentEntityExtended | null {
        const agents = AIEngine.Instance.Agents;
        const agentId = input.EntityDocument.ReasoningAgentID;
        if (agentId) {
            const byId = agents.find(a => UUIDsEqual(a.ID, agentId));
            if (byId) {
                return byId;
            }
        }
        return agents.find(a => a.Name === DEFAULT_REASONING_AGENT_NAME) ?? null;
    }

    /** Build params, run the agent, and translate the result into the reasoning contract. */
    protected async runAgent(
        agent: MJAIAgentEntityExtended,
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        const messages: ChatMessage[] = [{
            role: 'user',
            content: 'Reason over the supplied source record and candidate matches and return the structured duplicate-resolution verdict.',
        }];

        const runner = new AgentRunner(context.Provider);
        const result = await runner.RunAgent({
            agent,
            conversationMessages: messages,
            contextUser: context.ContextUser,
            // The shared instruction template reads these as its data context.
            data: this.buildPromptData(input),
        });

        const agentRunID = result.agentRun?.ID ?? null;
        if (!result.success) {
            const failed = this.failedOutput(result.agentRun?.ErrorMessage ?? 'Agent execution failed');
            failed.AIAgentRunID = agentRunID;
            return failed;
        }

        const output = this.parseRawOutput(result.payload);
        output.AIAgentRunID = agentRunID;
        return output;
    }
}

/**
 * Tree-shaking prevention: import and call this from a bootstrap path to guarantee the
 * `@RegisterClass(DuplicateReasoningProvider, 'Agent')` decorator above is evaluated and the
 * provider is registered with the ClassFactory.
 */
export function LoadAgentReasoningProvider(): void {
    // no-op; the import side effect registers the class
}
