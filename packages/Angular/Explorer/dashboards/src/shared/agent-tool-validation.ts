/**
 * @fileoverview Pure, framework-agnostic validation helpers for AI-agent
 * client-tool handlers in the Admin dashboards.
 *
 * 🚨 SAFETY NOTE: these helpers only VALIDATE tool input. They perform no
 * mutation and have no side effects — they exist so every Admin client-tool
 * Handler can be tolerant (return a typed failure rather than throw) without
 * re-implementing the same guard logic in each component.
 */

/** Standard tolerant result shape returned by Admin client-tool handlers. */
export interface AgentToolResult {
    Success: boolean;
    ErrorMessage?: string;
}

/**
 * Allowed values for the Data Explorer's entity-browser mode tool
 * (`SetEntityBrowserMode`). Exposed here so the tolerant {@link validateEnumParam}
 * guard has a single, reusable source of truth that stays Angular-free.
 */
export const VALID_ENTITY_BROWSER_MODES_FOR_VALIDATION = ['all', 'favorites'] as const;

/**
 * Validate that a raw, untrusted tool parameter is one of an allowed set of
 * string values. Returns the narrowed value on success, or a typed failure
 * result describing the allowed values. Never throws.
 *
 * @param raw - The untrusted parameter value (may be undefined / non-string).
 * @param allowed - The set of permitted string values.
 * @param paramName - Parameter name for the error message.
 */
export function validateEnumParam<T extends string>(
    raw: unknown,
    allowed: readonly T[],
    paramName: string,
): { ok: true; value: T } | { ok: false; result: AgentToolResult } {
    const value = typeof raw === 'string' ? raw : '';
    if ((allowed as readonly string[]).includes(value)) {
        return { ok: true, value: value as T };
    }
    return {
        ok: false,
        result: {
            Success: false,
            ErrorMessage: `Invalid ${paramName} "${value}". Expected one of: ${allowed.join(', ')}.`,
        },
    };
}

/**
 * Validate that a raw, untrusted tool parameter is a string. Returns the string
 * on success or a typed failure result. Never throws. Empty strings are allowed
 * (callers that require non-empty should check `value` themselves).
 */
export function validateStringParam(
    raw: unknown,
    paramName: string,
): { ok: true; value: string } | { ok: false; result: AgentToolResult } {
    if (typeof raw === 'string') {
        return { ok: true, value: raw };
    }
    return { ok: false, result: { Success: false, ErrorMessage: `${paramName} must be a string.` } };
}

/**
 * Default upper bound on how many names an Admin surface publishes in a
 * name-list context field (e.g. visible query names, available categories).
 * Keeping the streamed note bounded avoids flooding the co-agent with hundreds
 * of names; surfaces should publish a companion total-count field so the agent
 * still knows the true size when the list is truncated.
 */
export const AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to at most `cap` entries. Pure + deterministic so the
 * published context shape stays unit-testable. Never throws.
 *
 * @param names - the full list of names (the caller owns de-duplication / ordering)
 * @param cap - maximum entries to keep (defaults to {@link AGENT_CONTEXT_NAME_LIST_CAP})
 * @returns the first `cap` names; a new array (never mutates the input)
 */
export function boundNameList(names: readonly string[], cap: number = AGENT_CONTEXT_NAME_LIST_CAP): string[] {
    const safeCap = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : AGENT_CONTEXT_NAME_LIST_CAP;
    return names.slice(0, safeCap);
}

/**
 * Validate that a raw, untrusted tool parameter is a finite, non-negative
 * number (accepting numeric strings). Returns the number on success or a typed
 * failure result. Never throws.
 */
export function validateNonNegativeNumberParam(
    raw: unknown,
    paramName: string,
): { ok: true; value: number } | { ok: false; result: AgentToolResult } {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value) && value >= 0) {
        return { ok: true, value };
    }
    return { ok: false, result: { Success: false, ErrorMessage: `${paramName} must be a non-negative number.` } };
}
