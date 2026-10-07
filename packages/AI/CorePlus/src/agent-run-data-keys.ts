/**
 * The `ExecuteAgentParams.data` keys that change what an agent run IS, not just what its prompt says.
 *
 * `BaseAgent` and `AgentRunner` read these `data` keys as fallbacks for the run's own parameters:
 *  - `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, `SecondaryScopes` decide the run's scope — the notes and
 *    examples memory injects, the pre-execution RAG search context, the scope columns on the `MJ: AI Agent Runs`
 *    row, the scope handed to every action (`RunActionParams.RunScope`) and what sub-agents inherit.
 *  - `__agentTypePromptParams` is the highest-precedence agent-type parameter layer (the only source of the Loop
 *    type's `enableTaskGraphs`, and a switch for decisions).
 *
 * Only trusted server code may set them. Two places strip them from `data` that came from somewhere less trusted:
 * the server's agent-run resolvers (from a browser's `data` argument) and `BaseAgent`'s sub-agent build (from the
 * model-authored `templateParameters` merged into the child's `data`).
 *
 * `PrimaryScopeEntityID` has no `data` reader today; it is reserved with the rest of the scope family so a future
 * fallback for it cannot reopen this.
 */
export const RESERVED_AGENT_RUN_DATA_KEYS: readonly string[] = [
    'PrimaryScopeEntityName',
    'PrimaryScopeEntityID',
    'PrimaryScopeRecordID',
    'SecondaryScopes',
    '__agentTypePromptParams',
];

/** The result of {@link WithoutReservedAgentRunDataKeys}. */
export interface AgentRunDataWithoutReservedKeys {
    /** The data without the reserved keys: a copy when any were removed, otherwise the input itself. */
    Data: Record<string, unknown>;
    /** The reserved keys that were removed, in {@link RESERVED_AGENT_RUN_DATA_KEYS} order. Empty when none were. */
    StrippedKeys: string[];
}

/**
 * Removes the reserved scope and agent-type keys ({@link RESERVED_AGENT_RUN_DATA_KEYS}) from run data that a
 * less-trusted source supplied. Only top-level keys are read by the agent framework, so only top-level keys are
 * removed. Pure: it never mutates `data` and does not log (callers log the stripped keys, never their values).
 *
 * @param data - The data to clean.
 * @returns The data to use and the keys that were removed.
 */
export function WithoutReservedAgentRunDataKeys(data: Record<string, unknown>): AgentRunDataWithoutReservedKeys {
    const strippedKeys = RESERVED_AGENT_RUN_DATA_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(data, key));
    if (strippedKeys.length === 0) {
        return { Data: data, StrippedKeys: [] };
    }
    const kept = Object.entries(data).filter(([key]) => !strippedKeys.includes(key));
    return { Data: Object.fromEntries(kept), StrippedKeys: strippedKeys };
}
