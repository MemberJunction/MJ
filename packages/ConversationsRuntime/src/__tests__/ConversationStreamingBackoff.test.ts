/**
 * The reconnection backoff must escalate, and its cap must be reachable (MJ #4222).
 *
 * REGRESSION, found in manual testing. `initialize()` used to clear `reconnectionAttempts` as soon
 * as the subscribe call returned. But subscribing SUCCEEDS against a dead socket — graphql-ws
 * accepts the request and hands back an iterator that never yields — so the counter was reset on
 * every cycle. The observable symptom was a console line reading "attempt 1" forever while the
 * gaps between attempts grew; the growth came from the dead subscription's own error latency, not
 * from backoff. Both guards added in Tier 1 were inert: the delay never left its base value and
 * MAX_RECONNECTION_ATTEMPTS could never be reached.
 *
 * Only a delivered frame proves the transport works, so only a delivered frame clears the backoff.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSubscribe } = vi.hoisted(() => ({ mockSubscribe: vi.fn() }));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        Instance: { PushStatusUpdates: () => ({ subscribe: mockSubscribe }) },
    },
}));

import { ConversationStreaming } from '../streaming/ConversationStreaming';

type Handlers = { next: (v: unknown) => void; error: (e: unknown) => void; complete: () => void };

function build() {
    const handlers: Handlers[] = [];
    mockSubscribe.mockImplementation((h: Handlers) => {
        handlers.push(h);
        return { unsubscribe: vi.fn() };
    });
    const ctx = { Notification: {}, Tasks: { removeByAgentRunId: vi.fn() } };
    const streaming = new ConversationStreaming(ctx as never);
    const open = streaming as unknown as { reconnectionAttempts: number; initialized: boolean };
    return { streaming, open, handlers };
}

describe('ConversationStreaming reconnection backoff', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockSubscribe.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('escalates across cycles when the transport never delivers', () => {
        const { streaming, open, handlers } = build();
        streaming.initialize();

        // Three failure cycles against a socket that accepts the subscribe but never yields.
        for (let i = 0; i < 3; i++) {
            handlers[handlers.length - 1].error(new Error('dead'));
            vi.advanceTimersByTime(120_000);
        }

        // Before the fix this sat at 1 forever, because re-subscribing cleared it each cycle.
        expect(open.reconnectionAttempts).toBeGreaterThan(1);
    });

    it('clears the backoff only once a frame is actually delivered', () => {
        const { streaming, open, handlers } = build();
        streaming.initialize();

        handlers[0].error(new Error('dead'));
        vi.advanceTimersByTime(120_000);
        expect(open.reconnectionAttempts).toBeGreaterThan(0);

        handlers[handlers.length - 1].next({ message: JSON.stringify({ type: 'noop' }) });
        expect(open.reconnectionAttempts).toBe(0);
    });

});
