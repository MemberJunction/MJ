/**
 * @fileoverview Decides which callers of the agent-run resolvers may set a run's scope or agent-type parameters
 * through the free-form `data` argument.
 *
 * `BaseAgent` and `AgentRunner` read a few `ExecuteAgentParams.data` keys (`RESERVED_AGENT_RUN_DATA_KEYS` in
 * `@memberjunction/ai-core-plus`) as fallbacks that change what a run is, not just what its prompt says:
 *  - `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, `SecondaryScopes` decide the run's scope: which
 *    notes and examples memory is injected, the pre-execution RAG search context, the scoped prompt parts
 *    and run settings, the scope columns written on the `MJ: AI Agent Runs` row, and what sub-agents
 *    inherit. On a widget-guest run an explicit scope also beats the returning-visitor scope.
 *  - `__agentTypePromptParams` is the highest-precedence agent-type parameter layer. It can turn on the
 *    Loop type's `enableTaskGraphs` capability, and switch decisions on or off.
 *
 * The rule lives with the run, not here: `BaseAgent.Execute` drops those keys from every run's `data` unless the
 * params set `ExecuteAgentParams.TrustReservedRunData`. The resolvers set that marker for the callers
 * {@link IsTrustedAgentRunCaller} accepts — server-to-server principals — and never for a browser or a widget
 * guest. Explorer never sends these keys. Everything else in `data` (template data, `conversationId`,
 * `appContext`, `clientTools`, ...) reaches the run unchanged either way.
 *
 * @module @memberjunction/server/resolvers
 */
import type { UserPayload } from '../types.js';

/** Who sent a run's `data`, as far as {@link IsTrustedAgentRunCaller} needs to know. */
export interface ClientAgentRunCaller {
    /**
     * The request's authenticated payload, BEFORE any widget-guest elevation. `isSystemUser` is set only by
     * the system API key (and by widget elevation, which {@link IsWidgetGuestRun} overrides); `apiKeyId`
     * only by an `mj_sk_*` user API key.
     */
    UserPayload: Pick<UserPayload, 'email' | 'isSystemUser' | 'apiKeyId'>;
    /** True when the run executes under the widget-guest elevated principal. Such a run is never trusted. */
    IsWidgetGuestRun: boolean;
}

/**
 * Whether a caller may set the reserved run-data keys — the value the agent-run resolvers pass as
 * `ExecuteAgentParams.TrustReservedRunData`: the system user or an API-key integration, and never a widget-guest
 * run, whatever principal it was elevated to.
 *
 * @param caller - Who sent the run's `data`.
 * @returns `true` when the run may read the reserved keys from `data`.
 */
export function IsTrustedAgentRunCaller(caller: ClientAgentRunCaller): boolean {
    if (caller.IsWidgetGuestRun) {
        return false;
    }
    return caller.UserPayload.isSystemUser === true || Boolean(caller.UserPayload.apiKeyId);
}
