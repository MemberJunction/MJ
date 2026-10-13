/**
 * @fileoverview Per-agent configuration for Flow-type agents.
 *
 * Stored in the same `AIAgent.AgentTypePromptParams` column Loop agents use, and merged with the
 * same three-level precedence (type schema defaults → agent config → runtime override). The column
 * is generic; its *schema* is per-agent-type, declared on `AIAgentType.PromptParamsSchema`.
 *
 * @module @memberjunction/ai-agents
 */
import type { TraversalMode, JoinMode } from '@memberjunction/ai-core-plus';

/** Configuration parameters for Flow Agent Type. */
export interface FlowAgentTypePromptParams {
    /**
     * How the flow advances when more than one outgoing edge is satisfied.
     *
     * **Defaults to `'sequential'`, and that default is load-bearing.** Every design-time flow
     * authored before this existed was traversed by a single program counter that followed the
     * highest-priority edge and silently discarded the rest. Some of those flows have fan-out shapes
     * drawn in the editor that never actually ran in parallel — flipping the default would start
     * executing branches their authors have never seen run, on a schedule nobody chose.
     *
     * `'parallel'` follows every satisfied edge and honors joins at fan-in. Graphs built from a
     * `TaskGraphSpec` always run parallel regardless of this setting: an agent that expressed
     * independent work as independent nodes meant them to run at once, and serializing them would
     * discard the only information the decomposition carried.
     *
     * @default 'sequential'
     */
    traversalMode?: TraversalMode;

    /**
     * How a node with several incoming edges decides it may start.
     *
     * `'all'` (AND-join) is the default and matches `Prerequisite` dependency semantics — which is
     * precisely why the flow and task-graph models converge: "wait for every predecessor" is the
     * same rule in both. `'any'` (OR-join) matches an `Optional` dependency, where the first
     * completed predecessor is enough.
     *
     * Only consulted in `'parallel'` mode; sequential traversal never has more than one predecessor
     * in flight, so there is nothing to join.
     *
     * @default 'all'
     */
    joinMode?: JoinMode;

    /**
     * Maximum steps executed concurrently in `'parallel'` mode.
     *
     * A bound rather than a target. Fan-out width is authored, not measured, so a flow with thirty
     * independent branches would otherwise launch thirty agent runs at once and exhaust the model
     * provider's rate limit before it exhausted anything the flow author was thinking about.
     *
     * @default 5
     */
    maxConcurrentSteps?: number;
}

/** Defaults for {@link FlowAgentTypePromptParams}. */
export const DEFAULT_FLOW_AGENT_PROMPT_PARAMS: Required<FlowAgentTypePromptParams> = {
    // Back-compat, deliberately — see the field docs.
    traversalMode: 'sequential',
    joinMode: 'all',
    maxConcurrentSteps: 5,
};
