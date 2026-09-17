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

/**
 * Fail each live subscription exactly once, then let its retry timer run. Stops early when the
 * stream opens no replacement, so a stream that gives up is measured as giving up rather than
 * being handed a fresh error it could never have received.
 */
function failCycles(handlers: Handlers[], cycles: number): void {
    for (let errored = 0; errored < cycles && errored < handlers.length; errored++) {
        handlers[errored].error(new Error('dead'));
        vi.advanceTimersByTime(120_000);
    }
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

    it('keeps retrying past the point an attempt cap would have stopped it', () => {
        const { streaming, handlers } = build();
        streaming.initialize();

        // Well past any fixed cap. A stream that stands down opens no further subscription, so
        // `failCycles` runs out of live handlers to fail and the count stops climbing. Nothing in
        // the repo calls initialize() again outside ngOnInit, so that state needs a page reload.
        failCycles(handlers, 25);

        expect(handlers.length).toBe(26);
        expect(streaming.getConnectionStatus()).not.toBe('error');
    });

    it('recovers on the first frame delivered after a long outage', () => {
        const { streaming, open, handlers } = build();
        streaming.initialize();

        failCycles(handlers, 25);
        handlers[handlers.length - 1].next({ message: JSON.stringify({ type: 'noop' }) });

        expect(open.reconnectionAttempts).toBe(0);
        expect(streaming.getConnectionStatus()).toBe('connected');
    });

    it('holds the retry delay at the ceiling', () => {
        const { streaming, handlers } = build();
        streaming.initialize();

        // Escalate past the point where doubling meets the ceiling.
        failCycles(handlers, 6);

        // The ceiling is the only thing bounding the retry rate, so it carries the whole guarantee.
        const before = handlers.length;
        handlers[before - 1].error(new Error('dead'));
        vi.advanceTimersByTime(59_999);
        expect(handlers.length).toBe(before);
        vi.advanceTimersByTime(1);
        expect(handlers.length).toBe(before + 1);
    });

});
