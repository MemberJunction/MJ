/**
 * @fileoverview Smoke tests for the SessionsObserver stub.
 *
 * SessionsObserver is a no-op placeholder until PR #2787 lands. These tests assert:
 * - The stub claims to be unwired (`IsWired === false`).
 * - The lifecycle observable exists and never emits in stub mode.
 * - `Dispose` is safe to call.
 *
 * Real Sessions integration tests will follow in a separate PR once PR #2787 lands and
 * the observer is wired against its public API.
 */

import { describe, it, expect } from 'vitest';
import { SessionsObserver } from '../sessions/SessionsObserver';

describe('SessionsObserver (stub)', () => {
    it('reports IsWired === false in stub mode', () => {
        const observer = new SessionsObserver();
        expect(observer.IsWired).toBe(false);
    });

    it('exposes a SessionLifecycle$ observable that never emits in stub mode', async () => {
        const observer = new SessionsObserver();
        const events: unknown[] = [];

        const sub = observer.SessionLifecycle$.subscribe((e) => events.push(e));

        // Give the event loop a tick so anything that *would* emit synchronously has a chance.
        await new Promise((r) => setTimeout(r, 5));

        expect(events).toEqual([]);
        sub.unsubscribe();
    });

    it('Dispose is safe to call', () => {
        const observer = new SessionsObserver();
        expect(() => observer.Dispose()).not.toThrow();
        // Double-dispose is safe (RxJS Subject.complete is idempotent for subscribers,
        // and a second call doesn't blow up).
        expect(() => observer.Dispose()).not.toThrow();
    });
});
