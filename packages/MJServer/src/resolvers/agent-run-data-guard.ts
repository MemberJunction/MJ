/**
 * @fileoverview Keeps a browser from setting an agent run's scope or agent-type parameters through the
 * free-form `data` argument of the agent-run resolvers.
 *
 * `BaseAgent` and `AgentRunner` read a few `ExecuteAgentParams.data` keys as fallbacks that change what a
 * run is, not just what its prompt says:
 *  - `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, `SecondaryScopes` decide the run's scope: which
 *    notes and examples memory is injected, the pre-execution RAG search context, the scoped prompt parts
 *    and run settings, the scope columns written on the `MJ: AI Agent Runs` row, and what sub-agents
 *    inherit. On a widget-guest run an explicit scope also beats the returning-visitor scope.
 *  - `__agentTypePromptParams` is the highest-precedence agent-type parameter layer. It is the only
 *    source of the Loop type's `enableTaskGraphs` capability, and it can switch decisions on or off.
 *
 * Those are for server code to set: a host's own server operation, an API-key integration or the system
 * user. Explorer never sends them. This module strips them from any other caller's `data` before it
 * reaches `ExecuteAgentParams`, and always from a widget-guest run, which executes under an elevated
 * server principal. Everything else in `data` (template data, `conversationId`, `appContext`,
 * `clientTools`, ...) passes through untouched.
 *
 * The key list (`RESERVED_AGENT_RUN_DATA_KEYS`) and the removal itself live in `@memberjunction/ai-core-plus`,
 * shared with `BaseAgent`, which strips the same keys from a sub-agent request's model-authored
 * `templateParameters`.
 *
 * @module @memberjunction/server/resolvers
 */
import { LogStatus } from '@memberjunction/core';
import { IsPlainObject, SafeJSONParse } from '@memberjunction/global';
import { WithoutReservedAgentRunDataKeys } from '@memberjunction/ai-core-plus';
import type { UserPayload } from '../types.js';

/** Who sent a run's `data`, as far as {@link SanitizeClientAgentRunData} needs to know. */
export interface ClientAgentRunCaller {
    /**
     * The request's authenticated payload, BEFORE any widget-guest elevation. `isSystemUser` is set only by
     * the system API key (and by widget elevation, which {@link IsWidgetGuestRun} overrides); `apiKeyId`
     * only by an `mj_sk_*` user API key.
     */
    UserPayload: Pick<UserPayload, 'email' | 'isSystemUser' | 'apiKeyId'>;
    /** True when the run executes under the widget-guest elevated principal. Such a run never keeps the keys. */
    IsWidgetGuestRun: boolean;
}

/** The result of {@link SanitizeClientAgentRunData}. */
export interface SanitizedAgentRunData {
    /** The data to hand the run: a copy without the reserved keys, or the input itself when nothing was stripped. */
    Data: Record<string, unknown>;
    /** The reserved keys that were removed, in `RESERVED_AGENT_RUN_DATA_KEYS` order. Empty when none were. */
    StrippedKeys: string[];
}

/**
 * Whether a caller may set the reserved run-data keys: the system user or an API-key integration, and
 * never a widget-guest run, whatever principal it was elevated to.
 *
 * @param caller - Who sent the run's `data`.
 * @returns `true` when the reserved keys are kept.
 */
export function IsTrustedAgentRunCaller(caller: ClientAgentRunCaller): boolean {
    if (caller.IsWidgetGuestRun) {
        return false;
    }
    return caller.UserPayload.isSystemUser === true || Boolean(caller.UserPayload.apiKeyId);
}

/**
 * Removes the reserved scope and agent-type keys (`RESERVED_AGENT_RUN_DATA_KEYS` in `@memberjunction/ai-core-plus`) from a client's
 * agent-run `data` unless the caller is a trusted server-to-server principal (see
 * {@link IsTrustedAgentRunCaller}). A run's scope must be set by server code — a host's own server
 * operation, an API-key integration or the system user — never by a browser.
 *
 * Pure: it never mutates `data` and does not log. Only top-level keys are read by the agent framework, so
 * only top-level keys are removed.
 *
 * @param data - The parsed `data` argument.
 * @param caller - Who sent it.
 * @returns The data to run with and the keys that were removed.
 */
export function SanitizeClientAgentRunData(data: Record<string, unknown>, caller: ClientAgentRunCaller): SanitizedAgentRunData {
    if (IsTrustedAgentRunCaller(caller)) {
        return { Data: data, StrippedKeys: [] };
    }
    return WithoutReservedAgentRunDataKeys(data);
}

/**
 * Applies {@link SanitizeClientAgentRunData} to an agent-run resolver's raw JSON `data` argument and logs,
 * once, which keys were removed and for whom — never their values.
 *
 * The argument comes back unchanged (the same string) when nothing is stripped, and also when it is empty,
 * unreadable or not a JSON object, so the run reports a malformed argument exactly as it did before.
 *
 * @param rawData - The `data` argument as the client sent it.
 * @param caller - Who sent it.
 * @returns The `data` argument to hand to the run.
 */
export function GuardClientAgentRunDataArg(rawData: string | undefined, caller: ClientAgentRunCaller): string | undefined {
    if (!rawData) {
        return rawData;
    }
    const parsed: unknown = SafeJSONParse(rawData);
    if (!IsPlainObject(parsed)) {
        return rawData;
    }
    const { Data, StrippedKeys } = SanitizeClientAgentRunData(parsed, caller);
    if (StrippedKeys.length === 0) {
        return rawData;
    }
    const who = `${caller.UserPayload.email || 'unknown user'}${caller.IsWidgetGuestRun ? ' (widget guest run)' : ''}`;
    LogStatus(
        `[RunAIAgent] Ignored reserved run-data key(s) ${StrippedKeys.join(', ')} sent by ${who}: ` +
            `a run's scope and agent-type parameters are set by server code, not by a browser.`,
    );
    return JSON.stringify(Data);
}
