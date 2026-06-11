/**
 * @fileoverview Observability surface for AI Agent Sessions & Channels lifecycle.
 *
 * `SessionsObserver` is the runtime's framework-agnostic re-broadcaster of
 * session lifecycle events that originate from PR #2787's Sessions/Channels
 * infrastructure. It does NOT subscribe directly to any Angular service or
 * realtime client — those concerns live behind an {@link ISessionsAdapter} the
 * host registers at bootstrap (typically `VoiceSessionsAdapter` in
 * `@memberjunction/ng-conversations`, but anything implementing the contract
 * works — a React host, a Node test harness, a server-side runner, etc.).
 *
 * **What you get on `SessionLifecycle$`:**
 * - `session-started` — a new realtime session has fully started (sessionId is
 *   non-null, the realtime client is connected). Adapter implementations are
 *   responsible for emitting only AFTER all the prerequisites are satisfied
 *   (e.g., the Angular `VoiceSessionsAdapter` waits for both `Active$` AND a
 *   non-null `agentSessionId`).
 * - `session-channel` — a channel (voice/whiteboard/whatever) opened or closed
 *   inside the session. The `state` union is intentionally narrow
 *   (`'open' | 'closed'`) because no per-channel transition observable exists
 *   today; see `ISessionsAdapter` JSDoc for the rationale.
 * - `session-ended` — the session ended client-side. `reason` is a narrowed
 *   union (`'explicit' | 'error' | 'unknown'`) — see `ISessionsAdapter`.
 *
 * **What you DON'T get:** server-side close events that fire while the user's
 * tab is gone (janitor sweep, host shutdown). Those flow into the `MJ: AI Agent
 * Sessions` row's `CloseReason` column but are not pushed to the client today.
 * Admin/observability tooling polls the entity for those — out of scope for
 * the orchestration runtime.
 *
 * @module @memberjunction/conversations-runtime
 */

import { Observable, Subject, Subscription } from 'rxjs';
import {
    ISessionsAdapter,
    NoOpSessionsAdapter,
    SessionLifecycleEvent,
} from '../adapters/ISessionsAdapter';

// Re-export the event types for backwards compatibility with consumers that
// imported them from this module before the adapter pattern was introduced.
export type {
    SessionLifecycleEvent,
    SessionChannelState,
    SessionEndReason,
} from '../adapters/ISessionsAdapter';

/**
 * Observes Sessions/Channels lifecycle from the registered adapter and
 * re-broadcasts via `SessionLifecycle$`.
 *
 * **Lifecycle:** constructed once by `ConversationsRuntime` (singleton). Stays
 * subscribed to the adapter's stream until `Dispose()` is called. Adapter swaps
 * via `UseSessionsAdapter` unsubscribe the prior adapter cleanly.
 *
 * Usually accessed via `ConversationsRuntime.Instance.Sessions`.
 */
export class SessionsObserver {
    /**
     * Stream of session lifecycle events from whatever adapter is currently
     * registered. Subscribers see only events that occur AFTER they subscribe —
     * `SessionsObserver` does not replay history (use `RealtimeSessionReviewService`
     * for past-session loading, separate concern).
     */
    public readonly SessionLifecycle$: Observable<SessionLifecycleEvent>;

    private readonly _lifecycle$ = new Subject<SessionLifecycleEvent>();
    private _adapter: ISessionsAdapter;
    private _adapterSub: Subscription | null = null;

    constructor() {
        this.SessionLifecycle$ = this._lifecycle$.asObservable();
        // Default to no-op so consumers can subscribe immediately without an adapter.
        this._adapter = new NoOpSessionsAdapter();
        this.subscribeToAdapter();
    }

    /**
     * Register the adapter that produces session events. Replaces any prior
     * adapter and cleanly tears down the previous subscription. Typically called
     * once at host bootstrap (e.g., Angular's `ConversationsRuntimeBootstrap`),
     * but multiple swaps are supported (e.g., test harnesses that switch
     * adapters between cases).
     */
    public UseSessionsAdapter(adapter: ISessionsAdapter): void {
        this._adapterSub?.unsubscribe();
        this._adapter = adapter;
        this.subscribeToAdapter();
    }

    /**
     * Whether a non-default adapter is currently registered. Useful for
     * diagnostics ("are sessions actually wired up on this host?") and for
     * features that should gate themselves on real wiring.
     */
    public get IsWired(): boolean {
        return !(this._adapter instanceof NoOpSessionsAdapter);
    }

    /**
     * The currently registered adapter. Provided for diagnostics; consumers
     * should subscribe to `SessionLifecycle$` instead of reaching into the
     * adapter directly.
     */
    public get Adapter(): ISessionsAdapter {
        return this._adapter;
    }

    /**
     * Tear down the adapter subscription and complete the lifecycle stream.
     * Safe to call multiple times. After Dispose, subscribers will receive a
     * `complete` notification on `SessionLifecycle$`.
     */
    public Dispose(): void {
        this._adapterSub?.unsubscribe();
        this._adapterSub = null;
        this._lifecycle$.complete();
    }

    /** Forwards adapter events into our internal Subject. */
    private subscribeToAdapter(): void {
        this._adapterSub = this._adapter.SessionLifecycle$.subscribe({
            next: (event) => this._lifecycle$.next(event),
            // Don't surface adapter errors to consumers — they're host-specific.
            // The adapter is responsible for its own resilience; we just keep
            // our broadcast stream alive for the next adapter swap.
            error: () => undefined,
        });
    }
}
