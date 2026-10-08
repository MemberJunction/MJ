/**
 * Unit tests for AwaitWithDeadline, which is how `--timeout` stops the CLI waiting for an agent run.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AwaitWithDeadline, CANCELLATION_GRACE_MS } from '../lib/run-deadline';

/** A promise the test settles by hand. */
function deferred<T>(): { Promise: Promise<T>; Resolve: (value: T) => void; Reject: (error: Error) => void } {
    let resolve: (value: T) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { Promise: promise, Resolve: resolve, Reject: reject };
}

describe('AwaitWithDeadline', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the value when the work finishes before the deadline, without cancelling', async () => {
        const onDeadline = vi.fn();
        const outcome = await AwaitWithDeadline(Promise.resolve('done'), 1000, onDeadline);

        expect(outcome).toEqual({ Kind: 'Finished', Value: 'done' });
        expect(onDeadline).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels at the deadline and returns what the work returns within the grace period', async () => {
        const work = deferred<string>();
        const onDeadline = vi.fn(() => work.Resolve('cancelled'));

        const pending = AwaitWithDeadline(work.Promise, 1000, onDeadline);
        await vi.advanceTimersByTimeAsync(1000);
        const outcome = await pending;

        expect(onDeadline).toHaveBeenCalledTimes(1);
        expect(outcome).toEqual({ Kind: 'StoppedAfterDeadline', Value: 'cancelled' });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('gives up when the work does not return within the grace period', async () => {
        const work = deferred<string>();
        const onDeadline = vi.fn();

        const pending = AwaitWithDeadline(work.Promise, 1000, onDeadline, 500);
        await vi.advanceTimersByTimeAsync(1000);
        expect(onDeadline).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(500);
        const outcome = await pending;

        expect(outcome).toEqual({ Kind: 'StillRunning' });
        // Nothing left behind to hold the process open.
        expect(vi.getTimerCount()).toBe(0);
    });

    it('uses the default grace period', async () => {
        const work = deferred<string>();
        const pending = AwaitWithDeadline(work.Promise, 100, () => undefined);

        await vi.advanceTimersByTimeAsync(100 + CANCELLATION_GRACE_MS - 1);
        work.Resolve('just in time');
        const outcome = await pending;

        expect(outcome).toEqual({ Kind: 'StoppedAfterDeadline', Value: 'just in time' });
    });

    it('propagates a failure that happens before the deadline', async () => {
        const work = deferred<string>();
        const pending = AwaitWithDeadline(work.Promise, 1000, () => undefined);
        work.Reject(new Error('agent type not found'));

        await expect(pending).rejects.toThrow('agent type not found');
    });

    it('clamps a delay setTimeout cannot hold instead of firing at once', async () => {
        const onDeadline = vi.fn();
        const pending = AwaitWithDeadline(new Promise<string>(() => undefined), Number.MAX_SAFE_INTEGER, onDeadline);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(onDeadline).not.toHaveBeenCalled();
        vi.clearAllTimers();
        void pending;
    });
});
