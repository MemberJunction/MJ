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
 * {@link IsTrustedAgentRunCaller} accepts — the system user, and an `mj_sk_*` API key that holds the
 * {@link TRUSTED_RUN_DATA_SCOPE} scope — and never for a browser or a widget guest. Any user who may create API
 * keys can mint one for themselves, so a key alone is not enough: an administrator grants the scope. Explorer never
 * sends these keys. Everything else in `data` (template data, `conversationId`, `appContext`, `clientTools`, ...)
 * reaches the run unchanged either way.
 *
 * @module @memberjunction/server/resolvers
 */
import { LogError } from '@memberjunction/core';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { UserPayload } from '../types.js';

/**
 * The API-key scope (`MJ: API Scopes.FullPath`) that makes an `mj_sk_*` key a trusted integration for reserved run
 * data. Checked against the agent being run, so a key can be trusted for some agents only. `full_access` does not
 * imply it: the key must hold this scope itself.
 */
export const TRUSTED_RUN_DATA_SCOPE = 'agent:trusted';

/** Who sent a run's `data`, as far as {@link IsTrustedAgentRunCaller} needs to know. */
export interface ClientAgentRunCaller {
    /**
     * The request's authenticated payload, BEFORE any widget-guest elevation. `isSystemUser` is set only by
     * the system API key (and by widget elevation, which {@link IsWidgetGuestRun} overrides); `apiKeyHash`
     * only by an `mj_sk_*` user API key.
     */
    UserPayload: Pick<UserPayload, 'email' | 'isSystemUser' | 'apiKeyHash'>;
    /** True when the run executes under the widget-guest elevated principal. Such a run is never trusted. */
    IsWidgetGuestRun: boolean;
    /** The agent the caller asked to run: the resource the {@link TRUSTED_RUN_DATA_SCOPE} check is made against. */
    AgentID: string;
}

/**
 * Whether a caller may set the reserved run-data keys — the value the agent-run resolvers pass as
 * `ExecuteAgentParams.TrustReservedRunData`: the system user, or an API key that holds
 * {@link TRUSTED_RUN_DATA_SCOPE} for this agent, and never a widget-guest run, whatever principal it was elevated to.
 * A key without the scope is treated like the browser session of the user it belongs to.
 *
 * @param caller - Who sent the run's `data`.
 * @returns `true` when the run may read the reserved keys from `data`.
 */
export async function IsTrustedAgentRunCaller(caller: ClientAgentRunCaller): Promise<boolean> {
    if (caller.IsWidgetGuestRun) {
        return false;
    }
    if (caller.UserPayload.isSystemUser === true) {
        return true;
    }
    const apiKeyHash = caller.UserPayload.apiKeyHash;
    return apiKeyHash ? keyHoldsTrustedRunDataScope(apiKeyHash, caller.AgentID) : false;
}

/**
 * Whether the key explicitly holds {@link TRUSTED_RUN_DATA_SCOPE} for the agent. A key-level rule must match: an
 * allow that comes from scope enforcement being switched off, or from `defaultBehaviorNoScopes: 'allow'`, matches
 * no rule and does not count. Any failure counts as not held.
 */
async function keyHoldsTrustedRunDataScope(apiKeyHash: string, agentID: string): Promise<boolean> {
    try {
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            return false;
        }
        // A probe, not an access decision (the run goes ahead either way), so it is not written to the usage log.
        const result = await GetAPIKeyEngine().Authorize(apiKeyHash, 'MJAPI', TRUSTED_RUN_DATA_SCOPE, agentID, systemUser,
            { endpoint: '/graphql', method: 'POST' }, { skipLogging: true });
        return result.Allowed && result.MatchedKeyRule != null;
    } catch (e) {
        LogError(`IsTrustedAgentRunCaller: the ${TRUSTED_RUN_DATA_SCOPE} check failed; the run is not trusted: ${e}`);
        return false;
    }
}
