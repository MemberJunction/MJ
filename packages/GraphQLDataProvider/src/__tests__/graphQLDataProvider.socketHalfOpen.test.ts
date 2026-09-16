/**
 * Half-open socket behavior for the push-status subscription (MJ #4222).
 *
 * THE FAILURE THIS PINS. On an unstable link a WebSocket can stop carrying bytes in both
 * directions while neither end sends FIN or RST. The server notices — graphql-ws's
 * `useServer(options, ws, keepAlive)` defaults its third positional argument to 12s and
 * terminates after an unanswered ws-protocol ping, so the subscription is torn down in
 * ~12-24s and the agent's completion is published into a topic with no subscriber.
 *
 * The client notices nothing at all. graphql-ws re-arms its keepalive ping ONLY on pong
 * receipt (`dist/client.js:187, 207`), so a half-open socket gets exactly one ping and
 * then silence forever. Its own JSDoc is explicit: "NOTHING will happen automatically
 * with the client if the server never responds to a PingMessage with a PongMessage."
 * Because `retryAttempts` engages only on abnormal CLOSURE, and nothing ever closes, the
 * whole retry apparatus is unreachable — and so is every recovery mechanism downstream of
 * `on('closed')`.
 *
 * The first describe block asserts the broken transport as it genuinely is, so the fake is
 * proven to model the real failure rather than a convenient approximation. The second block
 * is the Tier 0 contract: those cases FAIL until the pong timeout is implemented.
 *
 * Deliberately a separate file from `graphQLDataProvider.test.ts`: that suite mocks `rxjs`
 * wholesale (its `Subject` is a bare `vi.fn()` that never emits) and stubs graphql-ws with a
 * 3-line object that has no `on()`, so neither streams nor socket events can be exercised there.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('graphql-ws', async () => {
    const wire = await import('./support/graphQLWs');
    return { createClient: wire.FakeCreateClient };
});

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { GraphQLWsWire, type FakeWsClient } from './support/graphQLWs';
import { CreateWireTestProvider } from './support/wireTestHarness';
import { WS_PONG_TIMEOUT_MS } from '../graphQLDataProvider';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

const SESSION = 'half-open-session';

/** Boots a provider and opens the push-status subscription, which creates the WS client. */
function openPushStatus(): {
    provider: GraphQLDataProvider;
    client: FakeWsClient;
    received: string[];
    streamEnded: { errored: boolean; completed: boolean };
    unsubscribe: () => void;
} {
    const provider = CreateWireTestProvider() as unknown as GraphQLDataProvider;
    const received: string[] = [];
    const streamEnded = { errored: false, completed: false };

    const subscription = provider.PushStatusUpdates(SESSION).subscribe({
        next: (message: string) => received.push(message),
        error: () => { streamEnded.errored = true; },
        complete: () => { streamEnded.completed = true; },
    });

    return {
        provider,
        client: GraphQLWsWire.LastClient,
        received,
        streamEnded,
        unsubscribe: () => subscription.unsubscribe(),
    };
}

/** Collects every socket state the provider publishes, in order. */
function trackSocketState(provider: GraphQLDataProvider): string[] {
    const states: string[] = [];
    provider.SocketConnectivity$.subscribe((state) => states.push(state));
    return states;
}

describe('push-status subscription over a half-open socket', () => {
    beforeEach(() => {
        GraphQLWsWire.Reset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('the broken transport, as it actually behaves (#4222 repro)', () => {
        it('delivers updates normally until the link goes half-open', () => {
            const { client, received, unsubscribe } = openPushStatus();

            client.EmitStatusUpdate(SESSION, 'progress-1');
            expect(received).toEqual(['progress-1']);

            client.GoHalfOpen();
            client.EmitStatusUpdate(SESSION, 'the-completion-event');

            // The completion is simply gone. This is the user-visible bug: the agent
            // finished and persisted its result, but the client was never told.
            expect(received).toEqual(['progress-1']);
            unsubscribe();
        });

        it('leaves the stream alive — no error, no complete — so nothing downstream reacts', () => {
            const { client, streamEnded, unsubscribe } = openPushStatus();

            client.GoHalfOpen();
            client.EmitStatusUpdate(SESSION, 'lost');

            // FireAndForgetHelper.onStreamEnd and ConversationStreaming.scheduleReconnection
            // both hang off these two callbacks. Neither fires, so neither recovers.
            expect(streamEnded.errored).toBe(false);
            expect(streamEnded.completed).toBe(false);
            unsubscribe();
        });

        it('produces no close event of its own — detection can only come from the watchdog', async () => {
            const { provider, client, unsubscribe } = openPushStatus();
            const states = trackSocketState(provider);

            // Half-open with no ping cycle at all: this is graphql-ws left to its own devices.
            // It re-arms its keepalive ONLY on pong receipt, so once a ping goes unanswered the
            // library emits nothing further, forever. Five simulated minutes prove the point —
            // without the Tier 0 watchdog there is no second probe and no close.
            client.GoHalfOpen();
            await vi.advanceTimersByTimeAsync(5 * 60_000);

            expect(states).not.toContain('disconnected');
            unsubscribe();
        });
    });

    describe('Tier 0 — client-side pong timeout', () => {
        it('terminates the socket when a ping goes unanswered', async () => {
            const { client, unsubscribe } = openPushStatus();

            client.GoHalfOpen();
            client.SimulatePingCycle();
            await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS);

            expect(client.Terminated).toBe(true);
            unsubscribe();
        });

        it('does not terminate a healthy socket whose pong arrives', async () => {
            const { client, unsubscribe } = openPushStatus();

            client.SimulatePingCycle();            // pong comes straight back
            await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS * 3);

            expect(client.Terminated).toBe(false);
            unsubscribe();
        });

        it('publishes disconnected after terminating, re-arming every downstream recovery path', async () => {
            const { provider, client, unsubscribe } = openPushStatus();
            const states = trackSocketState(provider);

            client.GoHalfOpen();
            client.SimulatePingCycle();
            await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS);

            // This is the whole point of Tier 0: the single signal that five separate
            // recovery mechanisms wait on finally fires.
            expect(states).toContain('disconnected');
            unsubscribe();
        });

        it('waits out the full grace period before giving up, so a slow pong is not a dead socket', async () => {
            const { provider, client, unsubscribe } = openPushStatus();
            const states = trackSocketState(provider);

            client.GoHalfOpen();
            client.SimulatePingCycle();
            await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS - 1);

            // One millisecond short of the deadline the socket is still considered live.
            // Terminating early would turn ordinary latency into a spurious reconnect storm.
            expect(client.Terminated).toBe(false);
            expect(states).not.toContain('disconnected');

            await vi.advanceTimersByTimeAsync(1);
            expect(client.Terminated).toBe(true);
            unsubscribe();
        });

        it('signals a reconnect only on retry, never on the first connect', async () => {
            const { provider, client, unsubscribe } = openPushStatus();
            const reconnects: number[] = [];
            provider.SocketReconnected$.subscribe(() => reconnects.push(Date.now()));

            client.Connect(false);                 // first connect — nothing was missed
            expect(reconnects).toHaveLength(0);

            client.GoHalfOpen();
            client.SimulatePingCycle();
            await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS);
            client.Reconnect();                    // retry succeeds

            // Tier 0 restores the channel going forward; this signal is what tells a listener
            // that events were dropped WHILE it was down and durable state must be re-read.
            expect(reconnects).toHaveLength(1);
            unsubscribe();
        });

        it('cancels the pong timer when the socket closes first, so a dead client cannot terminate a live one', async () => {
            const { client, unsubscribe } = openPushStatus();

            client.GoHalfOpen();
            client.SimulatePingCycle();            // timer armed
            client.EmitClosed({ code: 1006, reason: 'Abnormal Closure', wasClean: false });
            client.Terminated = false;             // ignore anything the close itself did
            await vi.advanceTimersByTimeAsync(WS_PONG_TIMEOUT_MS * 2);

            expect(client.Terminated).toBe(false);
            unsubscribe();
        });
    });
});
