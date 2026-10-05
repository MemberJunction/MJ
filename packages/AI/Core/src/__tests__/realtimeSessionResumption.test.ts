import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ParseDurationToMs,
    RealtimeSessionResumption,
    REALTIME_RESUMPTION_DEADLINE_MARGIN_MS,
    type RealtimeReconnectReason,
    type RealtimeResumeAttempt,
} from '../generic/realtimeSessionResumption';

describe('ParseDurationToMs', () => {
    it.each([
        ['60s', 60000],
        ['59.5s', 59500],
        [' 3s ', 3000],
    ])('reads %s as %d ms', (value, ms) => {
        expect(ParseDurationToMs(value)).toBe(ms);
    });

    it.each([[undefined], [''], ['60'], ['1m'], ['abc']])('returns undefined for %s', (value) => {
        expect(ParseDurationToMs(value)).toBeUndefined();
    });
});

/** Records every callback the helper makes; `Reconnect` succeeds unless told to fail. */
class Harness {
    public Reconnects: string[] = [];
    public Reconnecting: RealtimeReconnectReason[] = [];
    public Reconnected = 0;
    public Failures: Error[] = [];
    public FailNext = 0;
    public Resumption: RealtimeSessionResumption;

    constructor(retryDelaysMs?: readonly number[]) {
        this.Resumption = new RealtimeSessionResumption({
            Reconnect: async (handle) => {
                this.Reconnects.push(handle);
                if (this.FailNext > 0) {
                    this.FailNext--;
                    throw new Error(`connect failed for ${handle}`);
                }
            },
            OnReconnectFailed: (error) => this.Failures.push(error),
            OnReconnecting: (reason) => this.Reconnecting.push(reason),
            OnReconnected: () => this.Reconnected++,
            RetryDelaysMs: retryDelaysMs,
        });
    }
}

describe('RealtimeSessionResumption', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    describe('RecordHandle', () => {
        it('keeps the latest resumable handle', () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle('h2', true);
            expect(h.Resumption.Handle).toBe('h2');
        });

        it('keeps the previous handle when the provider reports a non-resumable point', () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle(undefined, false);
            expect(h.Resumption.Handle).toBe('h1');
        });
    });

    describe('connection ending (provider goAway)', () => {
        it('reconnects right away when the latest update was resumable', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.ConnectionEnding(60000);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h1']);
            expect(h.Reconnecting).toEqual(['connection-ending']);
            expect(h.Reconnected).toBe(1);
        });

        it('waits for the next resumable point instead of resuming from a stale handle', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle(undefined, false); // mid-turn
            h.Resumption.ConnectionEnding(60000);
            await vi.advanceTimersByTimeAsync(1000);
            expect(h.Reconnects).toEqual([]);

            h.Resumption.RecordHandle('h2', true); // turn finished
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h2']);
        });

        it('falls back to the last handle shortly before the deadline when no resumable point arrives', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle(undefined, false);
            h.Resumption.ConnectionEnding(60000);
            await vi.advanceTimersByTimeAsync(60000 - REALTIME_RESUMPTION_DEADLINE_MARGIN_MS - 1);
            expect(h.Reconnects).toEqual([]);
            // The deadline fires at the margin; its zero-delay attempt runs on the next tick.
            await vi.advanceTimersByTimeAsync(2);
            expect(h.Reconnects).toEqual(['h1']);
        });

        it('does nothing at the deadline when the provider never issued a handle', async () => {
            const h = new Harness();
            h.Resumption.ConnectionEnding(60000);
            await vi.advanceTimersByTimeAsync(60000);
            expect(h.Reconnects).toEqual([]);
            expect(h.Failures).toEqual([]);
        });
    });

    describe('connection lost', () => {
        it('returns false with no handle, so the driver keeps its fatal path', () => {
            const h = new Harness();
            expect(h.Resumption.ConnectionLost()).toBe(false);
        });

        it('reconnects with the last handle and reports success', async () => {
            const h = new Harness();
            h.Resumption.RecordHandle('h1', true);
            expect(h.Resumption.ConnectionLost()).toBe(true);
            expect(h.Resumption.IsReconnecting).toBe(true);
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toEqual(['h1']);
            expect(h.Reconnecting).toEqual(['connection-lost']);
            expect(h.Reconnected).toBe(1);
            expect(h.Resumption.IsReconnecting).toBe(false);
        });

        it('retries on the delay schedule, then reports failure once and stops', async () => {
            const h = new Harness([0, 1000, 3000]);
            h.FailNext = 3;
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.ConnectionLost();
            await vi.advanceTimersByTimeAsync(0);
            expect(h.Reconnects).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(999);
            expect(h.Reconnects).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(h.Reconnects).toHaveLength(2);
            await vi.advanceTimersByTimeAsync(3000);
            expect(h.Reconnects).toHaveLength(3);
            expect(h.Failures).toHaveLength(1);
            expect(h.Reconnected).toBe(0);
            // Exhausted: a later drop does not start another round.
            expect(h.Resumption.ConnectionLost()).toBe(false);
        });

        it('succeeds on a retry after a failed attempt', async () => {
            const h = new Harness([0, 1000]);
            h.FailNext = 1;
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.ConnectionLost();
            await vi.advanceTimersByTimeAsync(1000);
            expect(h.Reconnects).toEqual(['h1', 'h1']);
            expect(h.Reconnected).toBe(1);
            expect(h.Failures).toEqual([]);
        });

        it('does not start a second reconnect while one is running', async () => {
            const h = new Harness([0, 1000]);
            h.FailNext = 1;
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.ConnectionLost();
            expect(h.Resumption.ConnectionLost()).toBe(true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(h.Reconnecting).toEqual(['connection-lost']);
            expect(h.Reconnects).toHaveLength(2);
        });
    });

    describe('attempt timeout', () => {
        it('abandons an attempt that never settles and moves on to the next one', async () => {
            const attempts: RealtimeResumeAttempt[] = [];
            const resumption = new RealtimeSessionResumption({
                Reconnect: (_handle, attempt) => {
                    attempts.push(attempt);
                    // The first socket never opens; the second one does.
                    return attempts.length === 1 ? new Promise<void>(() => undefined) : Promise.resolve();
                },
                OnReconnectFailed: () => undefined,
                RetryDelaysMs: [0, 1000],
                AttemptTimeoutMs: 5000,
            });
            resumption.RecordHandle('h1', true);
            resumption.ConnectionLost();
            await vi.advanceTimersByTimeAsync(0);
            expect(attempts).toHaveLength(1);

            await vi.advanceTimersByTimeAsync(5000);
            expect(attempts[0].Abandoned).toBe(true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(attempts).toHaveLength(2);
            expect(resumption.IsReconnecting).toBe(false);
        });
    });

    describe('Dispose', () => {
        it('marks an attempt in flight as abandoned', async () => {
            const attempts: RealtimeResumeAttempt[] = [];
            const resumption = new RealtimeSessionResumption({
                Reconnect: (_handle, attempt) => {
                    attempts.push(attempt);
                    return new Promise<void>(() => undefined);
                },
                OnReconnectFailed: () => undefined,
            });
            resumption.RecordHandle('h1', true);
            resumption.ConnectionLost();
            await vi.advanceTimersByTimeAsync(0);
            resumption.Dispose();
            expect(attempts[0].Abandoned).toBe(true);
        });

        it('cancels a pending deadline and any retry', async () => {
            const h = new Harness([0, 1000]);
            h.Resumption.RecordHandle('h1', true);
            h.Resumption.RecordHandle(undefined, false);
            h.Resumption.ConnectionEnding(60000);
            h.Resumption.Dispose();
            await vi.advanceTimersByTimeAsync(60000);
            expect(h.Reconnects).toEqual([]);
            expect(h.Resumption.ConnectionLost()).toBe(false);
        });
    });
});
