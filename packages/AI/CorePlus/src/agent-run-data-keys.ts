import type { ExecuteAgentParams } from './agent-types';

/**
 * The `ExecuteAgentParams.data` keys that change what an agent run IS, not just what its prompt says.
 *
 * `BaseAgent` and `AgentRunner` read these `data` keys as fallbacks for the run's own parameters:
 *  - `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, `SecondaryScopes` decide the run's scope — the notes and
 *    examples memory injects, the pre-execution RAG search context, the scope columns on the `MJ: AI Agent Runs`
 *    row, the scope handed to every action (`RunActionParams.RunScope`) and what sub-agents inherit.
 *  - `__agentTypePromptParams` is the highest-precedence agent-type parameter layer (a per-run switch for the Loop
 *    type's `enableTaskGraphs`, and for decisions).
 *
 * A run reads them only when its caller set `ExecuteAgentParams.TrustReservedRunData`, which documents who may:
 * `BaseAgent.Execute` removes them from every other run's `data` ({@link WithAgentRunDataTrustApplied}), whatever
 * entry point started it. `BaseAgent`'s sub-agent build also removes them from the model-authored
 * `templateParameters` it merges into a child's `data`, trusted parent or not.
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

/** The result of {@link WithAgentRunDataTrustApplied}. */
export interface AgentRunParamsWithDataTrust<T> {
    /** The params to run with: the input itself when nothing was removed, otherwise a shallow copy with the cleaned `data`. */
    Params: T;
    /** The reserved keys removed from `data`, in {@link RESERVED_AGENT_RUN_DATA_KEYS} order. Empty when none were. */
    StrippedKeys: string[];
}

/**
 * Applies the run-data trust rule (`ExecuteAgentParams.TrustReservedRunData`) to an agent run's params: unless the
 * caller set `TrustReservedRunData: true`, the reserved keys are removed from `data`. Everything else in `data`, and
 * every other param, is kept. Pure: it never mutates `params` or its `data`, and does not log.
 *
 * `BaseAgent.Execute` applies it to every run; anything that reads the reserved keys before a run starts (or outside
 * one) applies it too, so it reads what the run will.
 *
 * @param params - The run's params (`ExecuteAgentParams`, or anything carrying its `data` and `TrustReservedRunData`).
 * @returns The params to run with and the keys that were removed.
 */
export function WithAgentRunDataTrustApplied<T extends Pick<ExecuteAgentParams, 'data' | 'TrustReservedRunData'>>(
    params: T,
): AgentRunParamsWithDataTrust<T> {
    if (params.TrustReservedRunData === true || !params.data) {
        return { Params: params, StrippedKeys: [] };
    }
    const { Data, StrippedKeys } = WithoutReservedAgentRunDataKeys(params.data);
    if (StrippedKeys.length === 0) {
        return { Params: params, StrippedKeys };
    }
    return { Params: { ...params, data: Data }, StrippedKeys };
}
