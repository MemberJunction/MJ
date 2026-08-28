/**
 * Client/transport failure text when `ExecuteAgentResult.agentRun` is missing
 * (fire-and-forget timeout, dropped WebSocket, invokeSubAgent used to return null).
 */
export type AgentFailureSource = {
    errorMessage?: string | null;
    agentRun?: { ErrorMessage?: string | null } | null;
    /**
     * True when the fire-and-forget mutation returned an ACK before the
     * transport died. False when the request never left the browser (or the
     * ACK never arrived). Undefined for callers that do not know.
     */
    requestAcknowledged?: boolean;
} | null | undefined;

/**
 * Prefer the persisted run's ErrorMessage, then a transport-level errorMessage.
 * Never returns empty string.
 */
export function agentFailureMessage(
    result: AgentFailureSource,
    fallback = 'The agent failed without an error message.'
): string {
    const fromRun = result?.agentRun?.ErrorMessage?.trim();
    if (fromRun) {
        return fromRun;
    }
    const fromResult = result?.errorMessage?.trim();
    if (fromResult) {
        return fromResult;
    }
    return fallback;
}

/**
 * True when the failure text means the HTTP/WebSocket path died but the
 * server-side AIAgentRun may still be Running. Painting Status=Error in that
 * case leaves the Explorer timer stuck on In-Progress while the bubble says failed.
 *
 * Does **not** match raw `Failed to fetch` / `NetworkError` — those also fire
 * when the initial mutation never reaches the server (no run exists). The
 * GraphQL client rewrites a post-ACK disconnect to the "lost connection /
 * still be running / please refresh" copy; only that copy (or an explicit
 * `requestAcknowledged: true`) is treated as in-flight.
 */
export function isDisconnectWhileAgentMayStillBeRunning(
    message: string,
    result?: AgentFailureSource
): boolean {
    if (result?.requestAcknowledged === false) {
        return false;
    }
    const m = message.toLowerCase();
    return (
        m.includes('still be running') ||
        m.includes('lost connection to the server') ||
        m.includes('please refresh')
    );
}

export type AgentFailureDisposition =
    | { status: 'In-Progress'; message: string }
    | { status: 'Error'; message: string };

/**
 * Decide whether a failed `ExecuteAgentResult` should keep the conversation
 * detail In-Progress (server may still complete) or paint Error.
 */
export function agentFailureDisposition(
    result: AgentFailureSource,
    fallback?: string
): AgentFailureDisposition {
    const message = agentFailureMessage(result, fallback);
    if (isDisconnectWhileAgentMayStillBeRunning(message, result)) {
        return { status: 'In-Progress', message };
    }
    return { status: 'Error', message };
}

/**
 * Copy of a failed agent result. Always `success: false` with a non-empty
 * `errorMessage`. Does not mutate the caller's object.
 */
export function coerceFailedExecuteAgentResult<T extends { success?: boolean; errorMessage?: string | null; agentRun?: { ErrorMessage?: string | null } | null }>(
    result: T | null | undefined,
    fallback: string
): T & { success: false; errorMessage: string } {
    return {
        ...(result ?? {}),
        success: false,
        errorMessage: agentFailureMessage(result, fallback),
    } as T & { success: false; errorMessage: string };
}
