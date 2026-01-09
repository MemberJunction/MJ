/**
 * @fileoverview ForEach loop configuration for AI Agent execution.
 *
 * This module contains the ForEachOperation interface used by all agent types
 * for iterating over collections. Flow agents convert AIAgentStep configuration
 * to this format. Loop agents receive this from LLM responses.
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.112.0
 */

/**
 * Universal ForEach loop configuration used by all agent types.
 * Flow agents convert AIAgentStep configuration to this format.
 * Loop agents receive this from LLM responses.
 * @since 2.112.0
 */
export interface ForEachOperation {
    /** Path in payload to array to iterate over */
    collectionPath: string;
    /** Variable name for current item (default: "item") */
    itemVariable?: string;
    /** Variable name for loop index (default: "index") */
    indexVariable?: string;
    /** Maximum iterations (undefined=1000, 0=unlimited, >0=limit) */
    maxIterations?: number;
    /** Continue processing if an iteration fails (default: false) */
    continueOnError?: boolean;
    /** Delay between iterations in milliseconds (default: 0) */
    delayBetweenIterationsMs?: number;
    /**
     * Execution mode for iterations (default: 'sequential')
     * - 'sequential': Process iterations one at a time in order (safest, maintains order, good for state accumulation)
     * - 'parallel': Process multiple iterations concurrently (faster for independent operations like web scraping, API calls)
     * @since 2.113.0
     */
    executionMode?: 'sequential' | 'parallel';
    /**
     * Maximum number of iterations to process concurrently when executionMode='parallel' (default: 10)
     * Only applies when executionMode='parallel'. Controls batch size to prevent resource exhaustion.
     * Recommended values:
     * - I/O-bound operations (API calls, web scraping): 10-20
     * - CPU-bound operations (data processing): CPU core count
     * - Sub-agent spawning: 2-5 (agents are resource-intensive)
     * @since 2.113.0
     */
    maxConcurrency?: number;

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
