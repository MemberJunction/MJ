import { LogError, LogStatus } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { Subscription } from "rxjs";

/**
 * Timeout for fire-and-forget operations (15 minutes).
 * Long-running operations like AI agent execution or test suites
 * can take significant time. This is a safety net — if no completion
 * event arrives within this window, the client stops waiting.
 */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

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

    /** Timeout in milliseconds (default: 15 minutes) */
    timeoutMs?: number;

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
 * 4. Client waits for a matching completion event via WebSocket
 * 5. Resolves the promise with the result from the completion event
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
     * Returns when the server publishes a matching completion event via PubSub.
     */
    public static async Execute<TResult>(
        config: FireAndForgetConfig<TResult>
    ): Promise<TResult> {
        const label = config.operationLabel ?? config.mutationFieldName;
        let subscription: Subscription | undefined;
        let completionTimeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
            // Create a promise that resolves when the completion event arrives
            const { promise, resolve, reject } = FireAndForgetHelper.createCompletionPromise<TResult>();

            // Set up safety timeout
            completionTimeoutId = FireAndForgetHelper.setupTimeout(
                reject, config.timeoutMs, config.timeoutErrorMessage
            );

            // Subscribe to PubSub and wire up completion detection
            subscription = FireAndForgetHelper.subscribeToPubSub(
                config, resolve, completionTimeoutId
            );

            // Execute the mutation (server returns immediately in fire-and-forget mode)
            const ackResult = await FireAndForgetHelper.executeMutation(config);

            // Check if server accepted
            if (!config.validateAck(ackResult)) {
                if (completionTimeoutId) clearTimeout(completionTimeoutId);
                const errorMsg = (ackResult as Record<string, unknown>)?.errorMessage as string
                    ?? 'Server rejected the request';
                LogError(`[FireAndForget:${label}] Server rejected: ${errorMsg}`);
                return config.createErrorResult(errorMsg);
            }

            LogStatus(`[FireAndForget:${label}] Server accepted, waiting for completion via WebSocket`);

            // Wait for the completion event
            return await promise;

        } catch (e) {
            if (completionTimeoutId) clearTimeout(completionTimeoutId);
            const error = e as Error;
            LogError(`[FireAndForget:${label}] Error: ${error.message}`);
            throw e;
        } finally {
            if (completionTimeoutId) clearTimeout(completionTimeoutId);
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
     * Sets up a safety timeout that rejects the promise if no completion arrives.
     */
    private static setupTimeout(
        reject: (reason: Error) => void,
        timeoutMs?: number,
        timeoutErrorMessage?: string
    ): ReturnType<typeof setTimeout> {
        const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const message = timeoutErrorMessage ??
            'The operation may still be running on the server but the client timed out after 15 minutes. ' +
            'Please refresh the page to check the latest status.';

        return setTimeout(() => {
            reject(new Error(message));
        }, timeout);
    }

    /**
     * Subscribes to PubSub and wires up message handling + completion detection.
     */
    private static subscribeToPubSub<TResult>(
        config: FireAndForgetConfig<TResult>,
        resolveCompletion: (value: TResult) => void,
        completionTimeoutId: ReturnType<typeof setTimeout>
    ): Subscription {
        const sessionId = config.dataProvider.sessionId;
        const label = config.operationLabel ?? config.mutationFieldName;

        return config.dataProvider.PushStatusUpdates(sessionId)
            .subscribe((message: string) => {
                try {
                    const parsed = JSON.parse(message) as Record<string, unknown>;

                    // Forward all messages to the optional handler (for progress, etc.)
                    if (config.onMessage) {
                        config.onMessage(parsed);
                    }

                    // Check if this is the completion event we're waiting for
                    if (config.isCompletionEvent(parsed)) {
                        clearTimeout(completionTimeoutId);
                        LogStatus(`[FireAndForget:${label}] Completion event received`);
                        resolveCompletion(config.extractResult(parsed));
                    }
                } catch (e) {
                    console.error(`[FireAndForget:${label}] Failed to parse PubSub message:`, e);
                }
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
