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
