import { LogError, LogStatus } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { Subscription } from "rxjs";

/**
 * Idle timeout for fire-and-forget operations (12 minutes).
 *
 * This is an *inactivity* window, not an absolute cap: it resets every time a
 * message (progress, streaming, liveness pulse, completion) arrives for the
 * operation. The server emits a liveness pulse every ~5 minutes while the
 * operation runs, so as long as the work is alive the timer never fires. It
 * only expires when the server has gone genuinely silent — at which point the
 * optional reconciliation hook decides whether the operation is dead or still
 * running.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 12 * 60 * 1000;

/**
 * Maximum number of consecutive idle-timeout reconciliations that may return
 * 'continue' before we give up. Bounds the wait when a run record is stuck in a
 * non-terminal status but no live signal is arriving (e.g. a dead socket).
 */
const DEFAULT_MAX_STALL_RECONCILES = 6;

/**
 * Decision returned by the {@link FireAndForgetConfig.onStall} hook when the
 * client idle timer expires:
 * - `'continue'` — the operation is still running; keep waiting (re-arms the timer).
 * - `{ resolve }` — the operation finished (e.g. completion event was lost); resolve with this result.
 * - `{ reject }` — the operation failed/died; reject with this error.
 */
export type StallDecision<TResult> = 'continue' | { resolve: TResult } | { reject: Error };

/**
 * Configuration for a fire-and-forget GraphQL mutation execution.
 *
 * Fire-and-forget avoids Azure's ~230s HTTP proxy timeout by:
 * 1. Sending the mutation with `fireAndForget: true`
 * 2. Server validates input, starts background execution, returns immediately
 * 3. Client listens for completion via WebSocket PubSub subscription
 * 4. Server publishes result through PubSub when execution finishes
 *
 * @template TResult The type of the final result
 */
export interface FireAndForgetConfig<TResult> {
    /** The GraphQL data provider instance */
    dataProvider: GraphQLDataProvider;

    /** The GraphQL mutation document (gql tagged template) */
    mutation: string;

    /** Variables for the mutation (should include fireAndForget: true) */
    variables: Record<string, unknown>;

    /** The mutation field name to extract the acknowledgement from the result
     *  e.g., 'RunTest', 'RunAIAgent', 'RunAIAgentFromConversationDetail' */
    mutationFieldName: string;

    /**
     * Check if the server accepted the fire-and-forget request.
     * The ack result comes from `result[mutationFieldName]`.
     * Return true if accepted, false if rejected.
     */
    validateAck: (ackResult: Record<string, unknown>) => boolean;

    /**
     * Check if a parsed PubSub message is the matching completion event.
     * Called for every PubSub message received on the session.
     * Return true only for the completion event that matches this specific request.
     */
    isCompletionEvent: (parsed: Record<string, unknown>) => boolean;

    /**
     * Extract the final result from a matching completion event.
     * Called when isCompletionEvent returns true.
     */
    extractResult: (parsed: Record<string, unknown>) => TResult;

    /**
     * Optional handler for all PubSub messages (progress, streaming, etc.).
     * Called for every message, not just completion events.
     * Use this to forward progress updates to UI callbacks.
     */
    onMessage?: (parsed: Record<string, unknown>) => void;

    /**
     * Optional reconciliation hook invoked when the idle timer expires (no message
     * received within the idle window) or the PubSub stream drops. Should query the
     * authoritative server-side run record and return a {@link StallDecision}.
     * When omitted, an idle expiry rejects with a timeout message (legacy behavior).
     */
    onStall?: () => Promise<StallDecision<TResult>>;

    /** Idle timeout in milliseconds — resets on activity (default: 12 minutes) */
    timeoutMs?: number;

    /** Max consecutive 'continue' reconciliations before giving up (default: 6) */
    maxStallReconciles?: number;

    /** Custom timeout error message */
    timeoutErrorMessage?: string;

    /**
     * Create an error result when the server rejects the request
     * or when a non-exception error occurs.
     */
    createErrorResult: (errorMessage: string) => TResult;

    /** Label for logging (e.g., 'RunTest', 'RunAIAgent') */
    operationLabel?: string;
}

/** Internal resettable inactivity timer. */
interface IdleTimer {
    /** (Re)start the countdown. */
    reset(): void;
    /** Cancel the countdown. */
    clear(): void;
}

/**
 * Centralized utility for executing long-running GraphQL mutations using
 * the fire-and-forget pattern. This avoids Azure's ~230s HTTP proxy timeout
 * by returning immediately from the HTTP request and delivering results
 * via WebSocket PubSub subscriptions.
 *
 * ## How it works:
 * 1. Subscribes to PubSub updates for the current session
 * 2. Sends the mutation with `fireAndForget: true`
 * 3. Server validates, starts background work, returns ACK immediately
 * 4. Client waits for a matching completion event via WebSocket, kept alive by
 *    an idle timer that resets on every message (including the server's ~5min
 *    liveness pulse)
 * 5. On idle expiry or stream drop, an optional reconciliation hook checks the
 *    authoritative run record to decide resolve / continue / reject
 *
 * ## Usage:
 * ```typescript
 * const result = await FireAndForgetHelper.Execute<RunTestResult>({
 *     dataProvider: this._dataProvider,
 *     mutation: runTestMutation,
 *     variables: { testId: '...', fireAndForget: true },
 *     mutationFieldName: 'RunTest',
 *     validateAck: (ack) => ack?.success === true,
 *     isCompletionEvent: (parsed) =>
 *         parsed.resolver === 'RunTestResolver' &&
 *         parsed.data?.type === 'complete' &&
 *         parsed.data?.testId === testId,
 *     extractResult: (parsed) => parseTestResult(parsed.data),
 *     createErrorResult: (msg) => ({ success: false, errorMessage: msg, result: null }),
 * });
 * ```
 */
export class FireAndForgetHelper {

    /**
     * Execute a long-running mutation using fire-and-forget pattern.
     * Returns when the server publishes a matching completion event via PubSub,
     * or when the reconciliation hook resolves/rejects after an idle stall.
     */
    public static async Execute<TResult>(
        config: FireAndForgetConfig<TResult>
    ): Promise<TResult> {
        const label = config.operationLabel ?? config.mutationFieldName;
        const idleMs = config.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
        const maxStalls = config.maxStallReconciles ?? DEFAULT_MAX_STALL_RECONCILES;

        let subscription: Subscription | undefined;
        let settled = false;
        let stallCount = 0;

        const { promise, resolve, reject } = FireAndForgetHelper.createCompletionPromise<TResult>();

        // settle helpers guarantee we resolve/reject exactly once and always clear the timer
        const finish = (fn: () => void): void => {
            if (settled) return;
            settled = true;
            idleTimer.clear();
            fn();
        };
        const settleResolve = (value: TResult) => finish(() => resolve(value));
        const settleReject = (error: Error) => finish(() => reject(error));

        // Invoked when the idle window elapses or the stream drops.
        const onStall = async (): Promise<void> => {
            if (settled) return;

            if (!config.onStall) {
                settleReject(new Error(FireAndForgetHelper.timeoutMessage(config.timeoutErrorMessage, idleMs)));
                return;
            }

            let decision: StallDecision<TResult>;
            try {
                LogStatus(`[FireAndForget:${label}] Idle window elapsed, reconciling against server run record`);
                decision = await config.onStall();
            } catch (e) {
                settleReject(e as Error);
                return;
            }
            if (settled) return; // a message may have arrived while awaiting reconciliation

            if (decision === 'continue') {
                if (++stallCount > maxStalls) {
                    settleReject(new Error(
                        `The operation is still reported as running but no signal has arrived after ${stallCount} checks. ` +
                        `Please refresh the page to check the latest status.`
                    ));
                } else {
                    idleTimer.reset();
                }
            } else if ('resolve' in decision) {
                LogStatus(`[FireAndForget:${label}] Reconciliation recovered a completed run`);
                settleResolve(decision.resolve);
            } else {
                settleReject(decision.reject);
            }
        };

        const idleTimer = FireAndForgetHelper.createIdleTimer(idleMs, () => { void onStall(); });

        try {
            idleTimer.reset();

            subscription = FireAndForgetHelper.subscribeToPubSub(config, {
                onActivity: () => { stallCount = 0; idleTimer.reset(); },
                onCompletion: (value) => settleResolve(value),
                onStreamEnd: () => { void onStall(); },
            });

            // Execute the mutation (server returns immediately in fire-and-forget mode)
            const ackResult = await FireAndForgetHelper.executeMutation(config);

            if (!config.validateAck(ackResult)) {
                idleTimer.clear();
                const errorMsg = (ackResult as Record<string, unknown>)?.errorMessage as string
                    ?? 'Server rejected the request';
                LogError(`[FireAndForget:${label}] Server rejected: ${errorMsg}`);
                return config.createErrorResult(errorMsg);
            }

            LogStatus(`[FireAndForget:${label}] Server accepted, waiting for completion via WebSocket`);

            return await promise;

        } catch (e) {
            const error = e as Error;
            LogError(`[FireAndForget:${label}] Error: ${error.message}`);
            throw e;
        } finally {
            idleTimer.clear();
            if (subscription) {
                subscription.unsubscribe();
            }
        }
    }

    /**
     * Creates a promise with externalized resolve/reject controls.
     */
    private static createCompletionPromise<TResult>(): {
        promise: Promise<TResult>;
        resolve: (value: TResult) => void;
        reject: (reason: Error) => void;
    } {
        let resolve!: (value: TResult) => void;
        let reject!: (reason: Error) => void;
        const promise = new Promise<TResult>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    }

    /**
     * Creates a resettable inactivity timer. `reset()` (re)starts the countdown;
     * `onExpire` fires if the countdown completes without another reset.
     */
    private static createIdleTimer(ms: number, onExpire: () => void): IdleTimer {
        let id: ReturnType<typeof setTimeout> | undefined;
        return {
            reset: () => {
                if (id) clearTimeout(id);
                id = setTimeout(onExpire, ms);
            },
            clear: () => {
                if (id) clearTimeout(id);
                id = undefined;
            },
        };
    }

    /**
     * Builds the idle-timeout error message used when no reconciliation hook is provided.
     */
    private static timeoutMessage(custom: string | undefined, idleMs: number): string {
        const minutes = Math.round(idleMs / 60000);
        return custom ??
            `The operation may still be running on the server but the client received no updates for ${minutes} minutes. ` +
            'Please refresh the page to check the latest status.';
    }

    /**
     * Subscribes to PubSub and wires up message handling, idle-timer resets, and
     * completion detection. Stream end/error triggers reconciliation.
     */
    private static subscribeToPubSub<TResult>(
        config: FireAndForgetConfig<TResult>,
        handlers: {
            onActivity: () => void;
            onCompletion: (value: TResult) => void;
            onStreamEnd: () => void;
        }
    ): Subscription {
        const sessionId = config.dataProvider.sessionId;
        const label = config.operationLabel ?? config.mutationFieldName;

        return config.dataProvider.PushStatusUpdates(sessionId)
            .subscribe({
                next: (message: string) => {
                    // Any inbound message means the server is alive — reset the idle timer.
                    handlers.onActivity();
                    try {
                        const parsed = JSON.parse(message) as Record<string, unknown>;

                        if (config.onMessage) {
                            config.onMessage(parsed);
                        }

                        if (config.isCompletionEvent(parsed)) {
                            LogStatus(`[FireAndForget:${label}] Completion event received`);
                            handlers.onCompletion(config.extractResult(parsed));
                        }
                    } catch (e) {
                        console.error(`[FireAndForget:${label}] Failed to parse PubSub message:`, e);
                    }
                },
                // Stream dropping mid-operation is itself a "we've gone silent" signal —
                // reconcile immediately rather than waiting out the full idle window.
                error: () => handlers.onStreamEnd(),
                complete: () => handlers.onStreamEnd(),
            });
    }

    /**
     * Executes the mutation and returns the ack result for validation.
     */
    private static async executeMutation<TResult>(
        config: FireAndForgetConfig<TResult>
    ): Promise<Record<string, unknown>> {
        const result = await config.dataProvider.ExecuteGQL(
            config.mutation,
            config.variables
        );
        return (result as Record<string, unknown>)[config.mutationFieldName] as Record<string, unknown>;
    }
}
