/**
 * @fileoverview Type definitions for Loop Agent Type prompt parameters.
 *
 * This module contains the interface definition for parameters that control
 * which sections are included in the Loop Agent Type's system prompt.
 * These parameters enable significant token savings for agents that don't
 * need all capabilities documented in the full system prompt.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.131.0
 */

/**
 * Prompt parameters for Loop Agent Type.
 * Controls which sections are included in the system prompt to optimize token usage.
 *
 * All boolean properties default to true (include section) when not specified.
 * Set to false to exclude a section from the prompt.
 *
 * These parameters are configured at three levels with merge precedence:
 * 1. Schema defaults (from AIAgentType.PromptParamsSchema) - lowest priority
 * 2. Agent config (from AIAgent.AgentTypePromptParams) - medium priority
 * 3. Runtime override (from ExecuteAgentParams.data.__agentTypePromptParams) - highest priority
 *
 * @example
 * ```typescript
 * // Agent configuration to disable unused features
 * const agentConfig: LoopAgentTypePromptParams = {
 *     includeForEachDocs: false,      // Agent never iterates collections
 *     includeWhileDocs: false,        // Agent never polls/retries
 *     includeResponseFormDocs: false, // Agent never collects user input
 *     includeCommandDocs: false       // Agent doesn't trigger UI actions
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Runtime override to enable a feature for a specific execution
 * const result = await agent.Execute({
 *     agent: myAgent,
 *     conversationMessages: messages,
 *     data: {
 *         __agentTypePromptParams: {
 *             includeForEachDocs: true  // Enable for this run only
 *         }
 *     }
 * });
 * ```
 */
export interface LoopAgentTypePromptParams {
    // === Section Inclusion Flags ===

    /**
     * Include full LoopAgentResponse TypeScript definition.
     * Disable if agent has custom examples that cover the response format,
     * or if you want to provide a simplified response structure.
     * @default true
     */
    includeResponseTypeDefinition?: boolean;

    /**
     * Include ForEach operation documentation and examples.
     * ForEach enables efficient batch processing of collections
     * (e.g., processing all items in an array with a single LLM decision).
     * Disable for agents that never need to iterate over collections.
     * @default true
     */
    includeForEachDocs?: boolean;

    /**
     * Include While operation documentation and examples.
     * While loops enable polling, retrying, and conditional iteration
     * (e.g., waiting for a job to complete).
     * Disable for agents that never need polling or conditional loops.
     * @default true
     */
    includeWhileDocs?: boolean;

    /**
     * Include response form documentation for collecting user input.
     * Response forms allow agents to request specific information from users
     * via text fields, dropdowns, buttons, etc.
     * Disable for agents that only output results and never need user input.
     * @default true
     */
    includeResponseFormDocs?: boolean;

    /**
     * Include actionable/automatic commands documentation.
     * Actionable commands create clickable buttons (e.g., 'Open Record'),
     * automatic commands trigger UI updates (e.g., refresh cache, show notification).
     * Disable for agents that don't need to provide navigation or trigger UI actions.
     * @default true
     */
    includeCommandDocs?: boolean;

    /**
     * Include message expansion documentation.
     * Message expansion allows agents to request full content from previously
     * compacted messages.
     * Disable for agents that don't use message compaction or don't need to
     * access compacted content.
     * @default true
     */
    includeMessageExpansionDocs?: boolean;

    /**
     * Include variable references documentation (payload.*, item.*, etc).
     * These explain how to reference data in action parameters and loop contexts.
     * Disable if agent has custom examples showing variable usage patterns.
     * @default true
     */
    includeVariableRefsDocs?: boolean;

    /**
     * Include the current payload state in the prompt.
     * The payload is the agent's working memory that persists across iterations.
     * Disable for agents that don't use the payload pattern or work purely from
     * conversation context. Can save significant tokens for agents with large payloads.
     * @default true
     */
    includePayloadInPrompt?: boolean;

    // === Content Limiting ===

    /**
     * Maximum number of sub-agents to include in prompt details.
     * -1 = include all (default)
     * 0 = include none (hide sub-agent capabilities)
     * N = include first N sub-agents
     * Useful for agents with many sub-agents where only a few are commonly used.
     * @default -1
     */
    maxSubAgentsInPrompt?: number;

    /**
     * Maximum number of actions to include in prompt details.
     * -1 = include all (default)
     * 0 = include none (hide action capabilities)
     * N = include first N actions
     * Useful for agents with many actions where only a few are commonly used.
     * @default -1
     */
    maxActionsInPrompt?: number;
}

/**
 * Default values for LoopAgentTypePromptParams.
 * All section flags default to true (include), and limits default to -1 (include all).
 */
export const DEFAULT_LOOP_AGENT_PROMPT_PARAMS: Required<LoopAgentTypePromptParams> = {
    includeResponseTypeDefinition: true,
    includeForEachDocs: true,
    includeWhileDocs: true,
    includeResponseFormDocs: true,
    includeCommandDocs: true,
    includeMessageExpansionDocs: true,
    includeVariableRefsDocs: true,
    includePayloadInPrompt: true,
    maxSubAgentsInPrompt: -1,
    maxActionsInPrompt: -1
};
