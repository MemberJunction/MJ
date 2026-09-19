/**
 * ConversationLiveness — the independent reconciliation trigger (MJ #4222).
 *
 * The defect this class exists to fix is that five separate recovery mechanisms all keyed off
 * the WebSocket `closed` event, and the failure they needed to catch was the one where the
 * socket never closes. These tests pin the two properties that make this supervisor a genuine
 * second layer rather than a sixth copy of the first: it fires on signals that do not require a
 * clean close, and it collapses a burst of them into a single pass.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Subject } from 'rxjs';

/** Drives `GraphQLDataProvider.Instance.SocketReconnected$` from the test. */
const socketReconnected$ = new Subject<void>();

/** Flips `GraphQLDataProvider.Instance` between constructed and not-yet-constructed. */
const providerState = { available: true };

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        // Returns undefined rather than throwing when the global store has no entry, which is
        // what makes "provider missing" a silent path rather than a caught one.
        get Instance() {
            return providerState.available
                ? {
                      get SocketReconnected$() {
                          return socketReconnected$.asObservable();
                      },
                  }
                : undefined;
        },
    },
}));

import { ConversationLiveness, RECONCILE_THROTTLE_MS, type ReconciliationReason } from '../streaming/ConversationLiveness';

describe('ConversationLiveness', () => {
    let liveness: ConversationLiveness;
    let seen: ReconciliationReason[];

    beforeEach(() => {
        vi.useFakeTimers();
        providerState.available = true;
        liveness = new ConversationLiveness();
        seen = [];
        liveness.reconciliationRequired$.subscribe((reason) => seen.push(reason));
    });

    afterEach(() => {
        liveness.Dispose();
        vi.useRealTimers();
    });

    it('fires when the socket reconnects — the signal that survives a socket that never closed', () => {
        liveness.initialize();
        socketReconnected$.next();
        expect(seen).toEqual(['socket-reconnected']);
    });

    it('fires when the push-status stream re-subscribes', () => {
        const streamReconnected$ = new Subject<void>();
        liveness.initialize(streamReconnected$.asObservable());
        streamReconnected$.next();
        expect(seen).toEqual(['stream-reconnected']);
    });

    it('fires on tab focus and on the browser coming back online', async () => {
        liveness.initialize();

        liveness.NotifyTabVisible();
        await vi.advanceTimersByTimeAsync(RECONCILE_THROTTLE_MS);
        liveness.NotifyBrowserOnline();

        expect(seen).toEqual(['tab-visible', 'browser-online']);
    });

    it('collapses a lid-open burst into ONE reconciliation', async () => {
        const streamReconnected$ = new Subject<void>();
        liveness.initialize(streamReconnected$.asObservable());

        // Reopening a laptop produces all four within about a second. Downstream reconciliation
        // is idempotent but expensive — a RunView plus a window refresh and artifact rebuild per
        // repaired message — so four passes would be three too many.
        socketReconnected$.next();
        streamReconnected$.next();
        liveness.NotifyTabVisible();
        liveness.NotifyBrowserOnline();
        await vi.advanceTimersByTimeAsync(RECONCILE_THROTTLE_MS * 2);

        expect(seen).toEqual(['socket-reconnected']);
    });

    it('reconciles immediately rather than waiting out the window', () => {
        liveness.initialize();
        socketReconnected$.next();

        // Leading-edge, not trailing: recovery is user-visible, so the first trigger acts at
        // once and later ones in the window are absorbed. A trailing throttle would add the
        // full window to every recovery for no benefit.
        expect(seen).toEqual(['socket-reconnected']);
    });

    it('fires again for a genuinely separate outage once the window has passed', async () => {
        liveness.initialize();

        socketReconnected$.next();
        await vi.advanceTimersByTimeAsync(RECONCILE_THROTTLE_MS + 1);
        socketReconnected$.next();

        expect(seen).toEqual(['socket-reconnected', 'socket-reconnected']);
    });

    it('does not replay a stale request to a late subscriber', () => {
        liveness.initialize();
        socketReconnected$.next();

        const late: ReconciliationReason[] = [];
        liveness.reconciliationRequired$.subscribe((reason) => late.push(reason));

        // A component mounting after an outage already resolved must not be told to reconcile.
        expect(late).toEqual([]);
    });

    it('stops listening after Dispose', () => {
        liveness.initialize();
        liveness.Dispose();
        socketReconnected$.next();
        expect(seen).toEqual([]);
    });

    it('is safe to initialize twice', () => {
        liveness.initialize();
        liveness.initialize();
        socketReconnected$.next();

        // A double-subscribe would emit twice and double every downstream reconciliation.
        expect(seen).toEqual(['socket-reconnected']);
    });

    it('retries the socket signal on a later initialize when the provider was not yet constructed', () => {
        providerState.available = false;
        liveness.initialize();

        providerState.available = true;
        liveness.initialize();
        socketReconnected$.next();

        // Marking itself initialized on a missing provider would leave the socket signal
        // unwired for the life of the page, since every later call early-returns.
        expect(seen).toEqual(['socket-reconnected']);
    });

    it('still wires the stream signal while the provider is missing', () => {
        providerState.available = false;
        const streamReconnected$ = new Subject<void>();
        liveness.initialize(streamReconnected$.asObservable());

        streamReconnected$.next();

        expect(seen).toEqual(['stream-reconnected']);
    });
});
