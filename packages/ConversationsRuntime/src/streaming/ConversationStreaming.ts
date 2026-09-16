/**
 * @fileoverview Pure-TypeScript streaming layer for conversation progress + completion.
 *
 * Ported from `@memberjunction/ng-conversations/src/lib/services/conversation-streaming.service.ts`.
 * The original was largely framework-agnostic — the `@Injectable()` decorator was the only
 * Angular dep, and `OnDestroy` was its only Angular lifecycle hook. We strip both, replace
 * `OnDestroy` with an explicit `Dispose()` method, and route `removeByAgentRunId` calls
 * through the {@link IActiveTaskTracker} adapter instead of Angular DI.
 *
 * Maintains a single PubSub subscription to `GraphQLDataProvider.PushStatusUpdates()` and
 * routes progress + completion events to registered per-message callbacks. Handles late-
 * arrival replay (5-min window) so a component that mounts after an agent run finished can
 * still see the completion.
 *
 * @module @memberjunction/conversations-runtime
 */

import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

import { IConversationsRuntimeContext } from '../context/IConversationsRuntimeContext';

/**
 * Completion event broadcast when an agent finishes. Includes enriched result data from
 * the server's fire-and-forget completion event.
 */
export interface CompletionEvent {
    conversationDetailId: string;
    agentRunId: string;
    /** Whether the agent execution succeeded. */
    success?: boolean;
    /** Error message if the agent execution failed. */
    errorMessage?: string;
}

/** Metadata structure for message progress updates. */
export interface MessageProgressMetadata {
    /** Progress details (from RunAIAgentResolver). */
    progress?: {
        hierarchicalStep?: string;
        percentage?: number;
        message?: string;
        stepCount?: number;
        agentName?: string;
        agentType?: string;
    };
    /** Agent run information (from RunAIAgentResolver). */
    agentRun?: {
        Agent?: string;
        ConversationDetailID?: string;
        ID?: string;
    };
    /** Agent run ID (alternative to agentRun.ID). */
    agentRunId?: string;
}

/** Single progress update for a message. */
export interface MessageProgressUpdate {
    message: string;
    percentComplete?: number;
    taskName?: string;
    conversationDetailId: string;
    metadata?: MessageProgressMetadata;
    stepCount?: number;
    /** Which backend resolver published this update. */
    resolver?: 'TaskOrchestrator' | 'RunAIAgentResolver' | string;
    /**
     * Present when this update carries streamed final-response content (a
     * RunAIAgentResolver `type:'streaming'` message whose `kind` marks it as
     * user-facing reply text). Deltas are accumulated service-side, so
     * `content` is always the FULL reply text so far — renderers assign it,
     * they never need to append. `message` mirrors `content` so consumers
     * unaware of streaming still show something sensible.
     */
    streaming?: {
        /** Full accumulated reply text so far. */
        content: string;
        /** False on the final chunk of the stream. */
        isPartial: boolean;
        /** Content discriminator from the server (currently 'final-response'). */
        kind: string;
    };
}

/** Callback type for progress updates. */
export type MessageProgressCallback = (progress: MessageProgressUpdate) => Promise<void> | void;

/** Connection status for the streaming service. */
export type StreamingConnectionStatus = 'connected' | 'disconnected' | 'error' | 'reconnecting';

/** How long late-arrival completion events remain replayable. */
const RECENT_COMPLETION_TTL_MS = 5 * 60 * 1000;

/** Base reconnection delay after a subscription error or completion. Doubles per attempt. */
const RECONNECTION_DELAY_MS = 5_000;

/**
 * Ceiling on the backoff. Without one, doubling runs away; without backoff at all (the previous
 * behaviour) a permanently unreachable server is retried every 5s forever, which is a request
 * storm dressed up as resilience.
 */
const MAX_RECONNECTION_DELAY_MS = 60_000;

/**
 * How many consecutive reconnects to attempt before standing down. Standing down is not
 * giving up: `initialized` is left false, so any later `initialize()` — which the host calls
 * when the tab regains focus or the browser comes back online — resumes from a clean slate.
 */
const MAX_RECONNECTION_ATTEMPTS = 10;

/**
 * Global streaming service that manages PubSub subscriptions for all conversations.
 *
 * Maintains a single GraphQL subscription and routes updates to registered per-message
 * callbacks, regardless of which conversation is currently visible. This ensures
 * messages update correctly even when users navigate away and return.
 *
 * Usually accessed via `ConversationsRuntime.Instance.Streaming`.
 */
export class ConversationStreaming {
    private pushStatusSubscription?: Subscription;
    private readonly callbackRegistry = new Map<string, MessageProgressCallback[]>();
    /**
     * Per-message accumulation of streamed final-response deltas, keyed by
     * conversationDetailId and stamped with the producing agentRunId. The server
     * publishes token DELTAS (see BaseLLM's OnContent contract); we accumulate
     * here so every registered callback always receives the full reply text so
     * far. The run stamp guarantees a new run's stream can never splice onto a
     * dead run's leftovers on the same message. Entries are cleared on the
     * stream's final chunk, on completion, on reconnection, and on dispose.
     */
    private readonly streamingAccumulator = new Map<string, { agentRunId: string; text: string }>();
    private readonly recentCompletions = new Map<
        string,
        { conversationDetailId: string; agentRunId: string; timestamp: Date }
    >();
    private readonly connectionStatus$ = new BehaviorSubject<StreamingConnectionStatus>('disconnected');
    private initialized = false;
    private reconnectionTimeout?: ReturnType<typeof setTimeout>;
    /** Consecutive failed reconnects; drives the backoff and the stand-down cap. */
    private reconnectionAttempts = 0;
    /** True while recovering from a drop, so a successful re-subscribe can be told from first boot. */
    private reconnecting = false;

    /**
     * Fires when the push-status subscription is re-established after having dropped — never on
     * the first successful subscribe.
     *
     * Events published while the subscription was down are gone: the server's topic is an
     * in-memory `PubSub` with no replay, and the client's `Subject` is explicitly unbuffered.
     * A listener must therefore reconcile against durable state rather than assume the stream
     * resumed seamlessly. Consumed by `ConversationLiveness` (MJ #4222).
     */
    public readonly streamReconnected$ = new Subject<void>();

    /**
     * Observable for components to subscribe to completion events in real-time.
     * Emits enriched completion data once per agent finish.
     */
    public readonly completionEvents$ = new Subject<CompletionEvent>();

    /**
     * @param context Runtime context providing live access to the registered
     *     {@link IActiveTaskTracker}. Read on every event dispatch so adapter swaps
     *     after construction are picked up immediately.
     */
    constructor(private readonly context: IConversationsRuntimeContext) {}

    /**
     * Initialize the global PubSub subscription. Idempotent — safe to call multiple
     * times. Should be called once at app startup (e.g., the Angular widget calls
     * this when the workspace mounts).
     */
    public initialize(): void {
        if (this.initialized) {
            return;
        }

        try {
            const dataProvider = GraphQLDataProvider.Instance;
            this.pushStatusSubscription = dataProvider.PushStatusUpdates().subscribe({
                next: (status: unknown) => {
                    // First frame on a new subscription is the only proof the transport actually
                    // works. Subscribing succeeds against a dead socket — graphql-ws accepts the
                    // request and returns an iterator that never yields — so this, not
                    // initialize() returning, is what clears the backoff.
                    this.noteStreamAlive();
                    void this.handlePushStatusUpdate(status);
                },
                error: (error: unknown) => {
                    console.error('[ConversationStreaming] PubSub connection error:', error);
                    this.connectionStatus$.next('error');
                    this.scheduleReconnection();
                },
                complete: () => {
                    this.connectionStatus$.next('disconnected');
                    this.scheduleReconnection();
                },
            });

            this.initialized = true;
            this.connectionStatus$.next('connected');

            if (this.reconnecting) {
                // Ask for a reconcile: whatever the server published during the gap was dropped,
                // and reconciliation reads durable state over HTTP, so it is worth doing even if
                // this subscription turns out to be dead too.
                //
                // `reconnectionAttempts` is deliberately NOT cleared here. Re-subscribing proves
                // nothing — the call returns normally against a black-holed socket — so clearing
                // it here reset the counter on every cycle, which pinned the delay at its base
                // value, made MAX_RECONNECTION_ATTEMPTS unreachable, and left both guards inert.
                // Only a delivered frame clears it; see noteStreamAlive().
                this.reconnecting = false;
                this.streamReconnected$.next();
            }
        } catch (error) {
            console.error('[ConversationStreaming] Failed to initialize:', error);
            this.connectionStatus$.next('error');
            this.scheduleReconnection();
        }
    }

    /** Current connection status as an observable. */
    public getConnectionStatus$() {
        return this.connectionStatus$.asObservable();
    }

    /** Current connection status value (synchronous). */
    public getConnectionStatus(): StreamingConnectionStatus {
        return this.connectionStatus$.value;
    }

    /**
     * Register a callback for a specific conversation detail (message). The callback
     * is invoked whenever progress updates arrive for that message.
     */
    public registerMessageCallback(
        conversationDetailId: string,
        callback: MessageProgressCallback
    ): void {
        const existing = this.callbackRegistry.get(conversationDetailId) ?? [];
        existing.push(callback);
        this.callbackRegistry.set(conversationDetailId, existing);
    }

    /**
     * Unregister a callback for a specific conversation detail. When `callback` is
     * omitted, ALL callbacks for that message are removed.
     */
    public unregisterMessageCallback(
        conversationDetailId: string,
        callback?: MessageProgressCallback
    ): void {
        if (callback) {
            const existing = this.callbackRegistry.get(conversationDetailId) ?? [];
            const filtered = existing.filter((cb) => cb !== callback);
            if (filtered.length > 0) {
                this.callbackRegistry.set(conversationDetailId, filtered);
            } else {
                this.callbackRegistry.delete(conversationDetailId);
            }
        } else {
            this.callbackRegistry.delete(conversationDetailId);
        }
    }

    /** Total number of registered callbacks (diagnostic). */
    public getRegisteredCallbackCount(): number {
        let count = 0;
        for (const callbacks of this.callbackRegistry.values()) {
            count += callbacks.length;
        }
        return count;
    }

    /** Number of distinct messages currently being tracked (diagnostic). */
    public getTrackedMessageCount(): number {
        return this.callbackRegistry.size;
    }

    /**
     * Replay a recently completed event so a late-mounting component can pick it up.
     * Returns `undefined` if no completion is in the 5-minute replay window.
     */
    public getRecentCompletion(conversationDetailId: string): { agentRunId: string } | undefined {
        const completion = this.recentCompletions.get(conversationDetailId);
        return completion ? { agentRunId: completion.agentRunId } : undefined;
    }

    /** Clear a recent completion after the late-mounting component has handled it. */
    public clearRecentCompletion(conversationDetailId: string): void {
        this.recentCompletions.delete(conversationDetailId);
    }

    /**
     * Diagnostic snapshot for a specific message — used by debugging tools to dump
     * live in-memory state.
     */
    public getDiagnosticSnapshot(messageId: string): {
        hasCallbacks: boolean;
        callbackCount: number;
        recentCompletion: { conversationDetailId: string; agentRunId: string; timestamp: Date } | undefined;
        connectionStatus: StreamingConnectionStatus;
    } {
        const callbacks = this.callbackRegistry.get(messageId);
        return {
            hasCallbacks: !!callbacks && callbacks.length > 0,
            callbackCount: callbacks?.length ?? 0,
            recentCompletion: this.recentCompletions.get(messageId),
            connectionStatus: this.connectionStatus$.getValue(),
        };
    }

    /**
     * Tear down subscriptions and clear state. Call at app shutdown or in tests
     * between cases.
     */
    public Dispose(): void {
        if (this.reconnectionTimeout) {
            clearTimeout(this.reconnectionTimeout);
            this.reconnectionTimeout = undefined;
        }
        if (this.pushStatusSubscription) {
            this.pushStatusSubscription.unsubscribe();
            this.pushStatusSubscription = undefined;
        }
        this.callbackRegistry.clear();
        this.recentCompletions.clear();
        this.streamingAccumulator.clear();
        this.completionEvents$.complete();
        this.connectionStatus$.complete();
        this.initialized = false;
    }

    // ────────────────────────────────────────────────────────────────────
    // Internals
    // ────────────────────────────────────────────────────────────────────

    /**
     * Route an incoming PubSub status update to the right handler based on which
     * resolver published it.
     */
    private async handlePushStatusUpdate(status: unknown): Promise<void> {
        if (status == null) {
            console.warn('[ConversationStreaming] PubSub status is null or undefined');
            return;
        }

        try {
            // GraphQL subscription may emit JSON strings or already-parsed objects.
            const statusObj =
                typeof status === 'string'
                    ? (JSON.parse(status) as Record<string, unknown>)
                    : (status as Record<string, unknown>);

            if (statusObj.resolver === 'TaskOrchestrator') {
                await this.routeTaskProgress(statusObj);
            } else if (statusObj.resolver === 'RunAIAgentResolver') {
                await this.routeAgentProgress(statusObj);
            }
        } catch (error) {
            console.error('[ConversationStreaming] Error processing push status update:', error);
        }
    }

    /**
     * Route a TaskOrchestrator progress update to the message-scoped callback set,
     * keyed by `conversationDetailId`.
     */
    private async routeTaskProgress(statusObj: Record<string, unknown>): Promise<void> {
        try {
            const data = (statusObj.data as Record<string, unknown> | undefined) ?? {};
            const taskName = data.taskName as string | undefined;
            const message = data.message as string | undefined;
            const percentComplete = data.percentComplete as number | undefined;
            const metadata = data.metadata as MessageProgressMetadata | undefined;
            const conversationDetailId = data.conversationDetailId as string | undefined;

            if (!message) {
                console.warn('[ConversationStreaming] No message content in TaskOrchestrator update');
                return;
            }
            if (!conversationDetailId) {
                console.warn('[ConversationStreaming] TaskOrchestrator update missing conversationDetailId', {
                    taskName,
                    message,
                });
                return;
            }

            const callbacks = this.callbackRegistry.get(conversationDetailId) ?? [];
            if (callbacks.length === 0) {
                // Expected when progress is handled directly by the GraphQLAIClient
                // fire-and-forget subscription or the message is in a hidden conversation.
                return;
            }

            const progressUpdate: MessageProgressUpdate = {
                message,
                percentComplete,
                taskName,
                conversationDetailId,
                metadata,
                resolver: 'TaskOrchestrator',
            };

            await this.dispatchCallbacks(callbacks, progressUpdate, conversationDetailId);
        } catch (error) {
            console.error('[ConversationStreaming] Error routing TaskOrchestrator progress:', error);
        }
    }

    /**
     * Route a RunAIAgentResolver progress update. Handles both progress messages and
     * completion messages (which include enriched result data and trigger the
     * `completionEvents$` broadcast + active-task cleanup).
     */
    private async routeAgentProgress(statusObj: Record<string, unknown>): Promise<void> {
        try {
            const data = (statusObj.data as Record<string, unknown> | undefined) ?? {};
            const agentRun = data.agentRun as Record<string, unknown> | undefined;
            const progress = data.progress as Record<string, unknown> | undefined;
            const type = data.type as string | undefined;

            // Streamed content chunk — accumulate + surface final-response text.
            if (type === 'streaming') {
                await this.routeStreamingContent(data, agentRun);
                return;
            }

            // Completion message — clear the task, broadcast, and remember for replay.
            if (type === 'complete') {
                const agentRunId = (data.agentRunId as string | undefined) ?? '';
                const conversationDetailId = data.conversationDetailId as string | undefined;
                const success = data.success as boolean | undefined;
                const errorMessage = data.errorMessage as string | undefined;

                if (agentRunId) {
                    const removed = this.context.Tasks.RemoveByAgentRunId(agentRunId);
                    if (removed) {
                        console.log(
                            `[ConversationStreaming] Agent run ${agentRunId} completed, removed from active tasks`
                        );
                    }
                }

                if (conversationDetailId) {
                    // The run is over — drop any partial stream accumulation for the message.
                    this.streamingAccumulator.delete(conversationDetailId);

                    this.recentCompletions.set(conversationDetailId, {
                        conversationDetailId,
                        agentRunId,
                        timestamp: new Date(),
                    });

                    this.completionEvents$.next({
                        conversationDetailId,
                        agentRunId,
                        success,
                        errorMessage,
                    });

                    this.cleanupOldCompletions();

                    console.log(
                        `[ConversationStreaming] Completion broadcast for message ${conversationDetailId} (success: ${String(success)})`
                    );
                } else {
                    console.warn(
                        `[ConversationStreaming] Completion received without conversationDetailId for agentRunId: ${agentRunId}`
                    );
                }

                return;
            }

            // Regular progress message.
            const conversationDetailId = agentRun?.ConversationDetailID as string | undefined;
            const message = progress?.message as string | undefined;
            const percentComplete = progress?.percentage as number | undefined;
            const stepCount = progress?.stepCount as number | undefined;

            if (!message) {
                console.warn('[ConversationStreaming] No message content in agent progress update');
                return;
            }
            if (!conversationDetailId) {
                console.warn(
                    '[ConversationStreaming] Agent progress update missing conversationDetailId',
                    { agentName: agentRun?.Agent, message }
                );
                return;
            }

            const callbacks = this.callbackRegistry.get(conversationDetailId) ?? [];
            if (callbacks.length === 0) return;

            const progressUpdate: MessageProgressUpdate = {
                message,
                percentComplete,
                taskName: (agentRun?.Agent as string | undefined) ?? 'Agent',
                conversationDetailId,
                metadata: { agentRun, progress } as MessageProgressMetadata,
                stepCount,
                resolver: 'RunAIAgentResolver',
            };

            await this.dispatchCallbacks(callbacks, progressUpdate, conversationDetailId);
        } catch (error) {
            console.error('[ConversationStreaming] Error routing RunAIAgentResolver progress:', error);
        }
    }

    /**
     * Route a RunAIAgentResolver `type:'streaming'` chunk. Only chunks the server
     * marked with a renderable `kind` (currently 'final-response' — deltas of the
     * user-facing reply) are surfaced; unmarked chunks are raw prompt output (e.g.
     * a Loop agent's streamed JSON turn envelope) and are dropped, preserving the
     * pre-streaming behavior for agents that don't opt in.
     *
     * Deltas are accumulated per message so callbacks always receive the FULL
     * reply text so far (renderers assign, never append). The accumulator entry
     * is cleared on the stream's final chunk and again on run completion.
     */
    private async routeStreamingContent(
        data: Record<string, unknown>,
        agentRun: Record<string, unknown> | undefined
    ): Promise<void> {
        const streaming = data.streaming as
            | { content?: string; isPartial?: boolean; kind?: string }
            | undefined;

        if (streaming?.kind !== 'final-response') {
            return; // raw prompt stream — not user-facing content; keep dropping it
        }

        const conversationDetailId = agentRun?.ConversationDetailID as string | undefined;
        if (!conversationDetailId) {
            console.warn('[ConversationStreaming] Streaming chunk missing conversationDetailId', {
                agentName: agentRun?.Agent,
            });
            return;
        }

        // A message can be re-streamed by a different run (retry; overlapping runs;
        // a chunk landing after 'complete' re-created the entry) — key accumulation
        // to the producing run so a dead run's leftover prefix can never splice onto
        // a new stream. agentRunId rides on every streaming payload.
        const agentRunId = (data.agentRunId as string | undefined) ?? '';
        const isPartial = streaming.isPartial !== false;
        const prev = this.streamingAccumulator.get(conversationDetailId);
        const prefix = prev && prev.agentRunId === agentRunId ? prev.text : '';
        const accumulated = prefix + (streaming.content ?? '');
        if (isPartial) {
            this.streamingAccumulator.set(conversationDetailId, { agentRunId, text: accumulated });
        } else {
            this.streamingAccumulator.delete(conversationDetailId);
        }

        // Nothing renderable yet (e.g. a lone empty final chunk) — dispatching an
        // empty string would blank the progress text already in the bubble.
        if (!accumulated) return;

        const callbacks = this.callbackRegistry.get(conversationDetailId) ?? [];
        if (callbacks.length === 0) return;

        const progressUpdate: MessageProgressUpdate = {
            message: accumulated,
            taskName: (agentRun?.Agent as string | undefined) ?? 'Agent',
            conversationDetailId,
            resolver: 'RunAIAgentResolver',
            streaming: {
                content: accumulated,
                isPartial,
                kind: streaming.kind,
            },
        };

        await this.dispatchCallbacks(callbacks, progressUpdate, conversationDetailId);
    }

    /** Invoke every callback registered for `conversationDetailId`, swallowing per-callback errors. */
    private async dispatchCallbacks(
        callbacks: MessageProgressCallback[],
        progressUpdate: MessageProgressUpdate,
        conversationDetailId: string
    ): Promise<void> {
        for (const callback of callbacks) {
            try {
                await callback(progressUpdate);
            } catch (error) {
                console.error(
                    `[ConversationStreaming] Callback error for message ${conversationDetailId}:`,
                    error
                );
                // Continue with other callbacks — one failure shouldn't block the rest.
            }
        }
    }

    /** Schedule a reconnection attempt after a connection error or completion. */
    /**
     * Record that the stream delivered something, which is the only evidence the transport is
     * genuinely alive. Clears the reconnection backoff so the next outage starts from scratch.
     */
    private noteStreamAlive(): void {
        if (this.reconnectionAttempts !== 0) {
            this.reconnectionAttempts = 0;
        }
    }

    private scheduleReconnection(): void {
        if (this.reconnectionTimeout) {
            clearTimeout(this.reconnectionTimeout);
        }
        // Chunks published while the subscription is down are gone — appending
        // post-reconnect deltas onto the kept prefix would render a reply with a
        // silent hole in the middle. Drop partial accumulations (the completion
        // flow still delivers the correct final message), which also keeps
        // abandoned entries from lingering for the session.
        this.streamingAccumulator.clear();

        if (this.reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
            // Stand down rather than hammer an unreachable server. `initialized` stays false, so
            // the host's next initialize() — on tab focus, on `online`, or on an explicit retry —
            // starts over.
            console.error(
                `[ConversationStreaming] Giving up after ${this.reconnectionAttempts} reconnection attempts; ` +
                'will retry when the host re-initializes.'
            );
            this.reconnectionAttempts = 0;
            this.reconnecting = false;
            this.connectionStatus$.next('error');
            return;
        }

        // Exponential backoff with a ceiling. The previous fixed 5s retry never relented.
        const delay = Math.min(
            RECONNECTION_DELAY_MS * 2 ** this.reconnectionAttempts,
            MAX_RECONNECTION_DELAY_MS
        );
        this.reconnectionAttempts++;
        this.reconnecting = true;
        this.connectionStatus$.next('reconnecting');
        this.reconnectionTimeout = setTimeout(() => {
            console.log(`[ConversationStreaming] Attempting to reconnect (attempt ${this.reconnectionAttempts})...`);
            this.initialized = false;
            this.initialize();
        }, delay);
    }

    /** Evict completions older than the replay window to bound memory. */
    private cleanupOldCompletions(): void {
        const cutoff = Date.now() - RECENT_COMPLETION_TTL_MS;
        for (const [id, data] of this.recentCompletions) {
            if (data.timestamp.getTime() < cutoff) {
                this.recentCompletions.delete(id);
            }
        }
    }
}
