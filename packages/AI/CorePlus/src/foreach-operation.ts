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
 * One action step inside a multi-step loop body (`ForEachOperation.steps` or `WhileOperation.steps`).
 *
 * Steps run sequentially in array order within each iteration with zero LLM round-trips between
 * steps. Later steps in the same iteration can reference earlier step outputs via `steps.<id>.*`
 * (or `steps.step_<index>.*` when `id` is omitted), alongside the loop's item/index bindings and
 * `payload.*`.
 *
 * @since 5.29.0
 */
export interface LoopBodyActionStep {
    /**
     * Optional handle for referencing outputs from later steps in the same iteration (`steps.<id>.*`).
     * Defaults to `step_<zeroBasedIndex>` when omitted.
     */
    id?: string;
    /** Action name (canonical MJ Action name or sanitized native tool name). */
    name: string;
    /**
     * Parameters passed to the action (`item.field`, `steps.<id>.field`, `payload.*`, `static:*`, or inline templates).
     */
    params: Record<string, unknown>;
    /**
     * Optional boolean expression evaluated before this step runs; falsy skips the step cleanly.
     * May read `payload`, `steps`, `item` (or custom `itemVariable`), `index` (or custom `indexVariable`), and `iteration`.
     */
    condition?: string;
    /**
     * Optional JSON mapping string (`{"ActionOutputField": "payloadPath"}` or `"target[]"`) folding outputs into payload.
     */
    outputMapping?: string;
}

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
    /**
     * Maximum iterations. `undefined` takes the default (1000); any other value is the limit,
     * INCLUDING `0`, which means zero iterations rather than unlimited.
     *
     * This corrects a long-standing comment that said `0=unlimited`. The engines have always
     * computed `Math.min(collection.length, maxIterations ?? 1000)`, so zero has always meant
     * zero — the comment described an intent the code never implemented.
     */
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

    /**
     * Execute an ordered sequence of actions per iteration with zero LLM turns between steps.
     * Mutually exclusive with `action`, `subAgent`, and `prompt`.
     * @since 5.29.0
     */
    steps?: LoopBodyActionStep[];

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
