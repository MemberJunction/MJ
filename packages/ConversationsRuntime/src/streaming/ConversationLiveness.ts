/**
 * @fileoverview Liveness supervisor — decides when client state may have fallen behind the
 * server and a reconciliation against durable state is required (MJ #4222).
 *
 * WHY THIS EXISTS. The conversations stack had five recovery mechanisms — graphql-ws's
 * `retryAttempts`, `GraphQLDataProvider._socketStateSubject`, Explorer's
 * `ServerConnectivityService`, `ConversationStreaming.scheduleReconnection()` and
 * `FireAndForgetHelper.onStreamEnd` — and every one of them is triggered by the WebSocket
 * `closed` event. The failure they all needed to catch is precisely the one where the socket
 * NEVER closes, so they failed together. That is not defence in depth; it is one layer drawn
 * five times.
 *
 * This class is the independent trigger. It aggregates signals that do NOT depend on a clean
 * close — a socket retry, a stream re-subscribe, a tab regaining focus, the browser coming back
 * online — and emits a single coalesced "go re-read the truth" event.
 *
 * WHY L0 (this package) AND NOT THE ANGULAR LAYER. `ServerConnectivityService` already does
 * something similar, but it lives in `@memberjunction/ng-explorer-core`, and
 * `@memberjunction/ng-conversations` declares `"mjUILayer": "widgets"`, which
 * `packages/Standards/src/checks/ui-layers.ts` forbids from importing any `ng-explorer*`
 * package at severity `error`. This package already depends on `@memberjunction/graphql-dataprovider`
 * and has no Angular dependency, so it is the layer-legal home — and it serves headless consumers
 * (Node workers, CLI tools, test harnesses) for free.
 *
 * DOM EVENTS ARE DELIBERATELY NOT HANDLED HERE. This package is documented as Node-consumable,
 * so `document`/`window` are not assumed to exist. The Angular host translates those events into
 * {@link ConversationLiveness.NotifyTabVisible} / {@link ConversationLiveness.NotifyBrowserOnline}.
 */
import { Observable, Subject, Subscription, throttleTime } from 'rxjs';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** What prompted a reconciliation. Carried through for logging and for test assertions. */
export type ReconciliationReason =
    /** The WebSocket dropped and came back. Anything published while it was down is gone. */
    | 'socket-reconnected'
    /** The push-status subscription was torn down and re-established. */
    | 'stream-reconnected'
    /** The tab regained focus after being hidden. */
    | 'tab-visible'
    /** The browser reported the network came back. A hint only — never proof. */
    | 'browser-online';

/**
 * Coalescing window. Closing a laptop lid and reopening it produces a socket reconnect, a stream
 * re-init, a `visibilitychange` and an `online` within roughly a second of each other. Downstream
 * reconciliation is idempotent but expensive (a `RunView` plus, per repaired message, a window
 * refresh and an artifact rebuild), so collapse the storm into one pass.
 *
 * Leading-edge, NOT trailing: recovery is user-visible and should start immediately rather than
 * waiting out the window. Subsequent triggers inside the window are absorbed.
 */
export const RECONCILE_THROTTLE_MS = 500;

/**
 * Emits when something suggests the client may have missed server events and should re-read
 * authoritative state.
 *
 * Usually reached via `ConversationsRuntime.Instance.Liveness`. Call {@link initialize} once after
 * the data provider exists; hosts translate DOM events in via the `Notify*` methods.
 */
export class ConversationLiveness {
    private readonly triggers$ = new Subject<ReconciliationReason>();
    private subscriptions = new Subscription();
    private initialized = false;
    private streamWired = false;

    /**
     * Fires when client state may be stale. Already coalesced — subscribe and reconcile.
     *
     * Deliberately does NOT replay: a late subscriber must not be handed a reconciliation
     * request for an outage that was already resolved.
     */
    public readonly reconciliationRequired$: Observable<ReconciliationReason> = this.triggers$.pipe(
        throttleTime(RECONCILE_THROTTLE_MS, undefined, { leading: true, trailing: false })
    );

    /**
     * Wire up the transport-level signals. Idempotent.
     *
     * @param streamReconnected$ Optional stream-level reconnect signal, supplied by
     *     {@link ConversationStreaming}. Passed in rather than imported so this class stays
     *     independent of the streaming implementation and is trivially testable.
     */
    public initialize(streamReconnected$?: Observable<void>): void {
        if (this.initialized) {
            return;
        }

        let socketWired = false;
        try {
            // `Instance` returns undefined rather than throwing when the provider is not yet
            // constructed, so a missing provider is a falsy value here, not a caught error.
            const provider = GraphQLDataProvider.Instance;
            if (provider) {
                // `SocketReconnected$` fires on `wasRetry`, which is the only trustworthy
                // reconnect indicator: graphql-ws restores subscriptions transparently, so the
                // RxJS stream may never error and the socket state may never pass through
                // 'disconnected'.
                this.subscriptions.add(
                    provider.SocketReconnected$.subscribe(() => this.Trigger('socket-reconnected'))
                );
                socketWired = true;
            }
        } catch (error) {
            // A provider that is not yet constructed is not a failure — the DOM-level and
            // stream-level triggers still work, and the socket signal is retried below.
            console.warn('[ConversationLiveness] Socket signal unavailable:', error);
        }

        // Wired at most once, because the retry path below can bring execution back here.
        if (streamReconnected$ && !this.streamWired) {
            this.subscriptions.add(streamReconnected$.subscribe(() => this.Trigger('stream-reconnected')));
            this.streamWired = true;
        }

        // Complete only once the socket signal is attached. Marking initialized without it would
        // early-return every later call and leave that signal unwired for the life of the page.
        this.initialized = socketWired;
    }

    /** The tab became visible again. Called by the host's `visibilitychange` handler. */
    public NotifyTabVisible(): void {
        this.Trigger('tab-visible');
    }

    /**
     * The browser reported it is back online. Called by the host's `online` handler.
     *
     * `navigator.onLine` only describes the link layer — it reads true behind a captive portal
     * or a dead VPN — so this is a reason to re-check, never evidence that anything is reachable.
     */
    public NotifyBrowserOnline(): void {
        this.Trigger('browser-online');
    }

    /** Raise a reconciliation request directly. Exposed for hosts with their own signals. */
    public Trigger(reason: ReconciliationReason): void {
        this.triggers$.next(reason);
    }

    /** Tear down transport subscriptions. Safe to call more than once. */
    public Dispose(): void {
        this.subscriptions.unsubscribe();
        this.subscriptions = new Subscription();
        this.initialized = false;
        this.streamWired = false;
    }
}
