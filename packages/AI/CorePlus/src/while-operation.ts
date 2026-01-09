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
    /** Maximum iterations (undefined=100, 0=unlimited, >0=limit) */
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
}
