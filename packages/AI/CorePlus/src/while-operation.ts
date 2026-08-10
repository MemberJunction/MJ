/**
 * @fileoverview While loop configuration for AI Agent execution.
 *
 * This module contains the WhileOperation interface used by all agent types
 * for conditional iteration. Flow agents convert AIAgentStep configuration
 * to this format. Loop agents receive this from LLM responses.
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.112.0
 */

/**
 * Universal While loop configuration used by all agent types.
 * Flow agents convert AIAgentStep configuration to this format.
 * Loop agents receive this from LLM responses.
 * @since 2.112.0
 */
export interface WhileOperation {
    /** Boolean expression evaluated before each iteration */
    condition: string;
    /** Variable name for attempt context (default: "attempt") */
    itemVariable?: string;
    /**
     * Maximum iterations. `undefined` takes the default (100); any other value is the limit,
     * INCLUDING `0`, which means zero iterations rather than unlimited.
     *
     * This corrects a long-standing comment that said `0=unlimited`. The engines have always
     * computed `Math.min(collection.length, maxIterations ?? 100)`, so zero has always meant
     * zero — the comment described an intent the code never implemented.
     */
    maxIterations?: number;
    /** Continue processing if an iteration fails (default: false) */
    continueOnError?: boolean;
    /** Delay between iterations in milliseconds (default: 0) */
    delayBetweenIterationsMs?: number;

    /** Execute action per iteration */
    action?: {
        name: string;
        params: Record<string, unknown>;
        outputMapping?: string;  // JSON mapping for Flow agents (maps action outputs to payload)
    };

    /** Execute sub-agent per iteration */
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, string>;
        /**
         * Runtime context propagated to the sub-agent.
         * Allows sub-agents to access API keys, environment settings, and other
         * runtime configuration from the parent agent.
         * @since 2.127.0
         */
        context?: unknown;
    };
    /**
     * Execute a prompt per iteration.
     *
     * The cheapest loop body there is: one model call per item with no agent wrapper, no reasoning
     * loop, no guardrails and no run record. Right whenever an iteration is a single transformation
     * — classify this, extract these fields, describe this column — and wrong the moment an
     * iteration needs to decide what to do next, which is what a sub-agent is for.
     */
    prompt?: {
        name: string;
        /** Values bound into the prompt's template, alongside the loop's own item and index. */
        templateParameters?: Record<string, string>;
        /** JSON mapping from the prompt's response into the payload, per iteration. */
        outputMapping?: string;
    };
}
