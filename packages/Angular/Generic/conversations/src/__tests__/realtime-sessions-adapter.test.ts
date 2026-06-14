/**
 * @fileoverview Tests for RealtimeSessionsAdapter — the Angular bridge from
 * `RealtimeSessionService`'s native observables to the runtime's
 * `ISessionsAdapter` contract.
 *
 * Covers:
 * - session-started bridge (forwards sessionId + channelNames from the service).
 * - session-channel diff: ActiveChannels$ array deltas produce open/closed
 *   events; the first non-empty emission produces opens for every channel.
 * - session-channel guards against null CurrentAgentSessionId (the post-teardown
 *   window where ActiveChannels$ emits [] but agentSessionId is already null).
 * - session-ended bridge (forwards sessionId + narrowed reason verbatim).
 * - Dispose unsubscribes cleanly.
 *
 * Uses a hand-rolled RealtimeSessionService stub to avoid pulling the full Angular
 * DI tree — we only need the observable surface and CurrentAgentSessionId getter.
 */

import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import type { SessionLifecycleEvent } from '@memberjunction/conversations-runtime';
import { RealtimeSessionsAdapter } from '../lib/services/realtime-sessions-adapter';

/** Minimal RealtimeSessionService stub. Only the observables + the one getter
 *  RealtimeSessionsAdapter consumes. Any other API isn't needed for these tests. */
function makeStubVoiceService() {
    const sessionStarted$ = new Subject<{ sessionId: string; channelNames: string[] }>();
    const sessionEnded$ = new Subject<{ sessionId: string; reason: 'explicit' | 'error' }>();
    const activeChannels$ = new BehaviorSubject<Array<{ ChannelName: string }>>([]);

    let currentAgentSessionId: string | null = null;

    const service = {
        SessionStarted$: sessionStarted$.asObservable(),
        SessionEnded$: sessionEnded$.asObservable(),
        ActiveChannels$: activeChannels$.asObservable(),
        get CurrentAgentSessionId() {
            return currentAgentSessionId;
        },
    };

    return {
        // Pass-through to the adapter via `as never` — we typecast away from the real
        // RealtimeSessionService here because we only implement the surface the adapter
        // reads. This is fine for test purposes.
        service: service as never,
        // Control surface for tests:
        emitStarted: (e: { sessionId: string; channelNames: string[] }) => sessionStarted$.next(e),
        emitEnded: (e: { sessionId: string; reason: 'explicit' | 'error' }) => sessionEnded$.next(e),
        emitChannels: (channels: Array<{ ChannelName: string }>) => activeChannels$.next(channels),
        setSessionId: (id: string | null) => {
            currentAgentSessionId = id;
        },
    };
}

describe('RealtimeSessionsAdapter', () => {
    it('bridges SessionStarted$ to a session-started event PLUS synthetic open events per channel', () => {
        // Synthetic opens close the asymmetry caused by RealtimeSessionService emitting to
        // ActiveChannels$ BEFORE agentSessionId is set during StartVoiceSession.
        const stub = makeStubVoiceService();
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        stub.emitStarted({ sessionId: 'sess-1', channelNames: ['voice', 'whiteboard'] });

        expect(events).toEqual([
            { kind: 'session-started', sessionId: 'sess-1', channelKinds: ['voice', 'whiteboard'] },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'open' },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'whiteboard', state: 'open' },
        ]);
    });

    it('SessionStarted$ with empty channelNames emits ONLY the started event (no synthetic opens)', () => {
        const stub = makeStubVoiceService();
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        stub.emitStarted({ sessionId: 'sess-empty', channelNames: [] });

        expect(events).toEqual([
            { kind: 'session-started', sessionId: 'sess-empty', channelKinds: [] },
        ]);
    });

    it('bridges SessionEnded$ to a session-ended event with reason preserved', () => {
        const stub = makeStubVoiceService();
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        stub.emitEnded({ sessionId: 'sess-1', reason: 'explicit' });
        stub.emitEnded({ sessionId: 'sess-2', reason: 'error' });

        expect(events).toEqual([
            { kind: 'session-ended', sessionId: 'sess-1', reason: 'explicit' },
            { kind: 'session-ended', sessionId: 'sess-2', reason: 'error' },
        ]);
    });

    it('mid-session: emits session-channel "open" for newly added channels (diff path)', () => {
        // Simulates a channel plugging in DURING an already-started session.
        // SessionStarted$ has already fired and set the initial channels;
        // adding a new one mid-session goes through the ActiveChannels$ diff.
        const stub = makeStubVoiceService();
        stub.setSessionId('sess-1');
        // Pre-condition: initial channel is already established (the synthetic-open
        // from SessionStarted$ already happened in real life; here we just seed
        // the diff's "prev" state by emitting the initial array).
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        stub.emitChannels([{ ChannelName: 'voice' }]);                              // initial — sessionId set, fires open
        stub.emitChannels([{ ChannelName: 'voice' }, { ChannelName: 'whiteboard' }]); // add whiteboard — diff emits open

        expect(events).toEqual([
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'open' },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'whiteboard', state: 'open' },
        ]);
    });

    it('mid-session: emits "open" for added channels and "closed" for removed channels', () => {
        const stub = makeStubVoiceService();
        stub.setSessionId('sess-1');
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        // First non-empty emission — opens.
        stub.emitChannels([{ ChannelName: 'voice' }]);
        // Add whiteboard.
        stub.emitChannels([{ ChannelName: 'voice' }, { ChannelName: 'whiteboard' }]);
        // Remove voice.
        stub.emitChannels([{ ChannelName: 'whiteboard' }]);

        expect(events).toEqual([
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'open' },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'whiteboard', state: 'open' },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'closed' },
        ]);
    });

    it('real-world ordering: ActiveChannels$ during startChannels (sessionId null) skipped; SessionStarted$ then emits opens; teardown empties channels and emits closes', () => {
        // This is the canonical real-world scenario the synthetic-open fix exists for.
        const stub = makeStubVoiceService();
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        // 1. startChannels() runs first — ActiveChannels$ emits with sessionId still null.
        //    The diff handler must skip; nothing emitted yet.
        stub.emitChannels([{ ChannelName: 'whiteboard' }]);
        expect(events).toEqual([]);

        // 2. mintSession() resolves, agentSessionId is set, Connect() finishes —
        //    SessionStarted$ fires. Synthetic open events come from there.
        stub.setSessionId('sess-1');
        stub.emitStarted({ sessionId: 'sess-1', channelNames: ['whiteboard'] });

        expect(events).toEqual([
            { kind: 'session-started', sessionId: 'sess-1', channelKinds: ['whiteboard'] },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'whiteboard', state: 'open' },
        ]);

        // 3. Teardown: disposeChannels emits [] WHILE agentSessionId is still set.
        //    Diff handler emits close.
        stub.emitChannels([]);
        // 4. teardown nulls agentSessionId next, then emits SessionEnded$.
        stub.setSessionId(null);
        stub.emitEnded({ sessionId: 'sess-1', reason: 'explicit' });

        expect(events).toEqual([
            { kind: 'session-started', sessionId: 'sess-1', channelKinds: ['whiteboard'] },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'whiteboard', state: 'open' },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'whiteboard', state: 'closed' },
            { kind: 'session-ended', sessionId: 'sess-1', reason: 'explicit' },
        ]);
    });

    it('skips channel events while CurrentAgentSessionId is null', () => {
        const stub = makeStubVoiceService();
        // No session id set — simulates the moment after teardown nulls agentSessionId
        // but ActiveChannels$ is still about to emit [], OR the initial startChannels
        // window before mintSession resolves.
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        stub.emitChannels([{ ChannelName: 'voice' }]);
        stub.emitChannels([]);

        expect(events).toEqual([]);
    });

    it('Dispose unsubscribes from all bridged observables', () => {
        const stub = makeStubVoiceService();
        stub.setSessionId('sess-1');
        const adapter = new RealtimeSessionsAdapter(stub.service);
        const events: SessionLifecycleEvent[] = [];
        const sub = adapter.SessionLifecycle$.subscribe((e) => events.push(e));

        adapter.Dispose();

        // After Dispose, none of these should produce events on the subscriber.
        stub.emitStarted({ sessionId: 'sess-x', channelNames: [] });
        stub.emitChannels([{ ChannelName: 'voice' }]);
        stub.emitEnded({ sessionId: 'sess-x', reason: 'explicit' });

        expect(events).toEqual([]);
        sub.unsubscribe();
    });

    it('Dispose is idempotent', () => {
        const stub = makeStubVoiceService();
        const adapter = new RealtimeSessionsAdapter(stub.service);

        expect(() => adapter.Dispose()).not.toThrow();
        expect(() => adapter.Dispose()).not.toThrow();
    });
});
