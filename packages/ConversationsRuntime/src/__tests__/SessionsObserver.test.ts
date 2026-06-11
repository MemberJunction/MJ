/**
 * @fileoverview Tests for SessionsObserver — the runtime's framework-agnostic
 * re-broadcaster of session lifecycle events from a registered
 * `ISessionsAdapter`.
 *
 * Covers:
 * - Default no-op adapter behavior (`IsWired === false`, no emissions).
 * - Adapter registration (`UseSessionsAdapter`) — events forwarded.
 * - Adapter swap — prior subscription torn down, new adapter takes over.
 * - `Dispose` — safe, idempotent, completes the broadcast stream.
 *
 * These are pure-RxJS unit tests; no real `VoiceSessionService` involvement.
 * Integration with the Angular bridge lives in the ng-conversations test suite.
 */

import { describe, it, expect } from 'vitest';
import { Subject } from 'rxjs';
import { SessionsObserver } from '../sessions/SessionsObserver';
import {
    ISessionsAdapter,
    NoOpSessionsAdapter,
    SessionLifecycleEvent,
} from '../adapters/ISessionsAdapter';

/** A trivial test-only adapter that exposes a Subject the test owns. */
function makeAdapter(): { adapter: ISessionsAdapter; emit: (e: SessionLifecycleEvent) => void } {
    const subject = new Subject<SessionLifecycleEvent>();
    return {
        adapter: { SessionLifecycle$: subject.asObservable() },
        emit: (e) => subject.next(e),
    };
}

describe('SessionsObserver', () => {
    it('defaults to NoOpSessionsAdapter with IsWired === false', () => {
        const observer = new SessionsObserver();
        expect(observer.IsWired).toBe(false);
        expect(observer.Adapter).toBeInstanceOf(NoOpSessionsAdapter);
    });

    it('default adapter emits nothing on SessionLifecycle$', async () => {
        const observer = new SessionsObserver();
        const events: SessionLifecycleEvent[] = [];

        const sub = observer.SessionLifecycle$.subscribe((e) => events.push(e));
        await new Promise((r) => setTimeout(r, 5));

        expect(events).toEqual([]);
        sub.unsubscribe();
    });

    it('UseSessionsAdapter flips IsWired to true and swaps the registered adapter', () => {
        const observer = new SessionsObserver();
        const { adapter } = makeAdapter();

        observer.UseSessionsAdapter(adapter);

        expect(observer.IsWired).toBe(true);
        expect(observer.Adapter).toBe(adapter);
    });

    it('forwards session-started events from the registered adapter', () => {
        const observer = new SessionsObserver();
        const { adapter, emit } = makeAdapter();
        observer.UseSessionsAdapter(adapter);

        const events: SessionLifecycleEvent[] = [];
        observer.SessionLifecycle$.subscribe((e) => events.push(e));

        emit({ kind: 'session-started', sessionId: 'sess-1', channelKinds: ['voice', 'whiteboard'] });

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
            kind: 'session-started',
            sessionId: 'sess-1',
            channelKinds: ['voice', 'whiteboard'],
        });
    });

    it('forwards session-channel events', () => {
        const observer = new SessionsObserver();
        const { adapter, emit } = makeAdapter();
        observer.UseSessionsAdapter(adapter);

        const events: SessionLifecycleEvent[] = [];
        observer.SessionLifecycle$.subscribe((e) => events.push(e));

        emit({ kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'open' });
        emit({ kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'closed' });

        expect(events).toEqual([
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'open' },
            { kind: 'session-channel', sessionId: 'sess-1', channelKind: 'voice', state: 'closed' },
        ]);
    });

    it('forwards session-ended events with each narrowed reason', () => {
        const observer = new SessionsObserver();
        const { adapter, emit } = makeAdapter();
        observer.UseSessionsAdapter(adapter);

        const events: SessionLifecycleEvent[] = [];
        observer.SessionLifecycle$.subscribe((e) => events.push(e));

        emit({ kind: 'session-ended', sessionId: 'sess-a', reason: 'explicit' });
        emit({ kind: 'session-ended', sessionId: 'sess-b', reason: 'error' });
        emit({ kind: 'session-ended', sessionId: 'sess-c', reason: 'unknown' });

        expect(events.map((e) => (e as { reason: string }).reason)).toEqual([
            'explicit',
            'error',
            'unknown',
        ]);
    });

    it('UseSessionsAdapter unsubscribes the prior adapter before subscribing to the new one', () => {
        const observer = new SessionsObserver();
        const a = makeAdapter();
        const b = makeAdapter();

        observer.UseSessionsAdapter(a.adapter);

        const events: SessionLifecycleEvent[] = [];
        observer.SessionLifecycle$.subscribe((e) => events.push(e));

        // a emits — forwarded.
        a.emit({ kind: 'session-started', sessionId: 'A', channelKinds: [] });

        // Swap to b.
        observer.UseSessionsAdapter(b.adapter);

        // a emits again — should NOT be forwarded (the prior sub was torn down).
        a.emit({ kind: 'session-started', sessionId: 'A2', channelKinds: [] });

        // b emits — forwarded.
        b.emit({ kind: 'session-started', sessionId: 'B', channelKinds: [] });

        expect(events.map((e) => (e as { sessionId: string }).sessionId)).toEqual(['A', 'B']);
    });

    it('Dispose is safe to call and idempotent', () => {
        const observer = new SessionsObserver();
        expect(() => observer.Dispose()).not.toThrow();
        expect(() => observer.Dispose()).not.toThrow();
    });

    it('Dispose completes the broadcast stream', async () => {
        const observer = new SessionsObserver();
        let completed = false;

        observer.SessionLifecycle$.subscribe({
            complete: () => {
                completed = true;
            },
        });

        observer.Dispose();
        await new Promise((r) => setTimeout(r, 5));

        expect(completed).toBe(true);
    });

    it('Dispose cleanly unsubscribes from the registered adapter', () => {
        const observer = new SessionsObserver();
        const { adapter, emit } = makeAdapter();
        observer.UseSessionsAdapter(adapter);

        observer.Dispose();

        // After Dispose, the observer's lifecycle subject is completed; emitting from the
        // adapter shouldn't throw or leak.
        expect(() =>
            emit({ kind: 'session-started', sessionId: 'after-dispose', channelKinds: [] })
        ).not.toThrow();
    });
});
