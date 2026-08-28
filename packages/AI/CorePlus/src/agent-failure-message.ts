/**
 * Client/transport failure text when `ExecuteAgentResult.agentRun` is missing
 * (fire-and-forget timeout, dropped WebSocket, invokeSubAgent used to return null).
 */
export type AgentFailureSource = {
    errorMessage?: string | null;
    agentRun?: { ErrorMessage?: string | null } | null;
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
 */
export function isDisconnectWhileAgentMayStillBeRunning(message: string): boolean {
    const m = message.toLowerCase();
    return (
        m.includes('still be running') ||
        m.includes('lost connection to the server') ||
        m.includes('please refresh') ||
        m.includes('failed to fetch') ||
        m.includes('networkerror')
    );
}
