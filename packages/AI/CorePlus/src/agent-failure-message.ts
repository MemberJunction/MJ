/**
 * Client/transport failure text when `ExecuteAgentResult.agentRun` is missing
 * (fire-and-forget timeout, dropped WebSocket, invokeSubAgent used to return null).
 */
export type AgentFailureSource = {
    errorMessage?: string | null;
    agentRun?: {
        ErrorMessage?: string | null;
        /**
         * The persisted AIAgentRun status. Widened to `string` on purpose: this module
         * is the arbiter for results arriving off the wire, where the value is whatever
         * the server wrote, and a literal union here would reject a run carrying a status
         * this build does not know about instead of letting the checks below decide.
         */
        Status?: string | null;
        /**
         * The agent's own last message. When the run is awaiting a human this is the
         * question it is waiting on — not an error.
         */
        Message?: string | null;
    } | null;
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

/**
 * AIAgentRun statuses that mean the run is ALIVE and parked on a human, not failed.
 *
 * A run in either state has `success: false` on the envelope — the turn did not
 * complete — so every failure path sees it. It is not a failure: the server is
 * waiting for the user to answer, and the run resumes when they do.
 */
export const AGENT_RUN_AWAITING_HUMAN_STATUSES: readonly string[] = ['AwaitingFeedback', 'Paused'];

/**
 * True when the run exists and its persisted status says it is waiting on the user.
 *
 * Checked against the run's own Status rather than the error text: the status is
 * what the server actually reported, and an awaiting run usually carries no error
 * message at all — which is exactly how it ended up rendered as
 * "failed — Unknown error".
 */
export function isAgentRunAwaitingHuman(result: AgentFailureSource): boolean {
    const status = result?.agentRun?.Status;
    return typeof status === 'string' && AGENT_RUN_AWAITING_HUMAN_STATUSES.includes(status);
}

export type AgentFailureDisposition =
    /** Transport died after the ACK; the server may still finish this run. */
    | { status: 'In-Progress'; message: string }
    /**
     * The run is alive and waiting on the user. `message` is the agent's own question
     * (`agentRun.Message`), or `''` when the run recorded none — callers supply their
     * own prompt copy in that case, since the agent's display name lives in the UI layer.
     */
    | { status: 'Awaiting-Input'; message: string }
    /** A real failure. `message` is never empty. */
    | { status: 'Error'; message: string };

/**
 * Decide what a non-successful `ExecuteAgentResult` means for the conversation detail:
 * the run is waiting on the user (Awaiting-Input), the server may still complete it
 * (In-Progress), or it genuinely failed (Error).
 *
 * The awaiting check runs FIRST and is decided by the run's status, which outranks any
 * guess made from error text.
 */
export function agentFailureDisposition(
    result: AgentFailureSource,
    fallback?: string
): AgentFailureDisposition {
    if (isAgentRunAwaitingHuman(result)) {
        return { status: 'Awaiting-Input', message: result?.agentRun?.Message?.trim() ?? '' };
    }
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
