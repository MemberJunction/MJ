import { describe, it, expect, vi, afterEach } from 'vitest';
import { ExpectedCallStore } from '../telephony/mediaSocketAuth.js';

describe('ExpectedCallStore', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('verifies unknown → bad-token → already-attached in that order', () => {
        const store = new ExpectedCallStore(() => undefined);
        expect(store.Verify('CA1', 'tok')).toEqual({ Ok: false, Reason: 'unknown-call' });

        store.Expect('CA1', 'tok');
        expect(store.Verify('CA1', 'nope')).toEqual({ Ok: false, Reason: 'bad-token' });
        expect(store.Verify('CA1', 'tok')).toEqual({ Ok: true });

        store.MarkAttached('CA1');
        expect(store.Verify('CA1', 'tok')).toEqual({ Ok: false, Reason: 'already-attached' });
        // a wrong token on an attached call reveals nothing about the attachment
        expect(store.Verify('CA1', 'nope')).toEqual({ Ok: false, Reason: 'bad-token' });
    });

    it('expires a never-attached expectation exactly once and removes it', () => {
        vi.useFakeTimers();
        const expired: string[] = [];
        const store = new ExpectedCallStore((k) => expired.push(k), 1000);
        store.Expect('CA1', 'tok');

        vi.advanceTimersByTime(999);
        expect(expired).toEqual([]);
        vi.advanceTimersByTime(2);
        expect(expired).toEqual(['CA1']);
        expect(store.Has('CA1')).toBe(false);
        vi.advanceTimersByTime(5000);
        expect(expired).toEqual(['CA1']);
    });

    it('does not expire once a socket attached', () => {
        vi.useFakeTimers();
        const expired: string[] = [];
        const store = new ExpectedCallStore((k) => expired.push(k), 1000);
        store.Expect('CA1', 'tok');
        store.MarkAttached('CA1');
        vi.advanceTimersByTime(10_000);
        expect(expired).toEqual([]);
        expect(store.Has('CA1')).toBe(true);
    });

    it('Forget cancels the pending timer', () => {
        vi.useFakeTimers();
        const expired: string[] = [];
        const store = new ExpectedCallStore((k) => expired.push(k), 1000);
        store.Expect('CA1', 'tok');
        store.Forget('CA1');
        vi.advanceTimersByTime(10_000);
        expect(expired).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('re-registering a key replaces the token and restarts the timer', () => {
        vi.useFakeTimers();
        const expired: string[] = [];
        const store = new ExpectedCallStore((k) => expired.push(k), 1000);
        store.Expect('CA1', 'old');
        vi.advanceTimersByTime(600);
        store.Expect('CA1', 'new');
        vi.advanceTimersByTime(600);
        expect(expired).toEqual([]);
        expect(store.Verify('CA1', 'old')).toEqual({ Ok: false, Reason: 'bad-token' });
        expect(store.Verify('CA1', 'new')).toEqual({ Ok: true });
    });

    it('Rekey moves the expectation and reports expiry under the new key', () => {
        vi.useFakeTimers();
        const expired: string[] = [];
        const store = new ExpectedCallStore((k) => expired.push(k), 1000);
        store.Expect('CID', 'tok');
        store.Rekey('CID', 'UUID');

        expect(store.Has('CID')).toBe(false);
        expect(store.Verify('UUID', 'tok')).toEqual({ Ok: true });
        vi.advanceTimersByTime(1001);
        expect(expired).toEqual(['UUID']);
    });

    it('Clear cancels every timer', () => {
        vi.useFakeTimers();
        const store = new ExpectedCallStore(() => undefined, 1000);
        store.Expect('A', 't');
        store.Expect('B', 't');
        store.Clear();
        expect(vi.getTimerCount()).toBe(0);
    });
});
