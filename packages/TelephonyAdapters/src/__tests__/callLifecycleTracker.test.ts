import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

import { CallLifecycleTracker, DEFAULT_MAX_CALL_SECONDS, type TrackedSession } from '../telephony/callLifecycleTracker.js';

const SESSION: TrackedSession = {
    SessionBridgeID: 'SB1',
    ContextUser: { ID: 'u1' } as unknown as UserInfo,
    Provider: {} as unknown as IMetadataProvider,
};

describe('CallLifecycleTracker', () => {
    let stop: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        stop = vi.fn(async () => true);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('max call duration', () => {
        it('stops a live session when the cap elapses', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);

            await vi.advanceTimersByTimeAsync(59_999);
            expect(stop).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(2);

            expect(stop).toHaveBeenCalledTimes(1);
            expect(stop).toHaveBeenCalledWith(SESSION, 'HostEnded');
            expect(tracker.IsTracking('CA1')).toBe(false);
        });

        it('defaults to 30 minutes', async () => {
            const tracker = new CallLifecycleTracker(stop);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);
            await vi.advanceTimersByTimeAsync(DEFAULT_MAX_CALL_SECONDS * 1000 - 1);
            expect(stop).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(2);
            expect(stop).toHaveBeenCalledTimes(1);
        });

        it.each([0, -5, NaN])('falls back to the default cap for an invalid value (%s)', async (bad) => {
            const tracker = new CallLifecycleTracker(stop, bad);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);
            await vi.advanceTimersByTimeAsync(60_000);
            expect(stop).not.toHaveBeenCalled();
        });

        it('the timer is cleared when the call ends another way: nothing fires later and no timer is left', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);
            expect(vi.getTimerCount()).toBe(1);

            tracker.Release('CA1');

            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(120_000);
            expect(stop).not.toHaveBeenCalled();
        });

        it('the timer is cleared when the session fails to start', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');
            tracker.Fail('CA1');
            expect(vi.getTimerCount()).toBe(0);
        });

        it('the timer is cleared when an end is requested (it cannot fire a second stop)', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);
            await tracker.RequestEnd('CA1', 'carrier-status');
            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(120_000);
            expect(stop).toHaveBeenCalledTimes(1);
        });

        it('Dispose clears every timer', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            for (const id of ['A', 'B']) {
                tracker.Begin(id);
                await tracker.Attach(id, SESSION);
            }
            tracker.Dispose();
            expect(vi.getTimerCount()).toBe(0);
        });

        it('a failing stop is logged, not thrown, and the call is forgotten', async () => {
            const failing = vi.fn(async () => {
                throw new Error('boom');
            });
            const tracker = new CallLifecycleTracker(failing, 60);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);
            await vi.advanceTimersByTimeAsync(61_000);
            expect(failing).toHaveBeenCalledTimes(1);
            expect(tracker.IsTracking('CA1')).toBe(false);
        });
    });

    describe('RequestEnd', () => {
        it('stops a live session with the given reason', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);

            expect(await tracker.RequestEnd('CA1', 'answering-machine', 'Explicit')).toBe(true);
            expect(stop).toHaveBeenCalledWith(SESSION, 'Explicit');
        });

        it('ignores a call it does not know (it already ended)', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            expect(await tracker.RequestEnd('NOPE', 'carrier-status')).toBe(false);
            expect(stop).not.toHaveBeenCalled();
        });

        it('remembers an end requested while the session is still starting and stops it the moment it attaches', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');

            expect(await tracker.RequestEnd('CA1', 'carrier-status')).toBe(true);
            expect(stop).not.toHaveBeenCalled();

            await tracker.Attach('CA1', SESSION);

            expect(stop).toHaveBeenCalledTimes(1);
            expect(vi.getTimerCount()).toBe(0); // no max-duration timer armed for a call already ended
            expect(tracker.IsTracking('CA1')).toBe(false);
        });

        it('a second end request for the same call does not stop it twice', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');
            await tracker.RequestEnd('CA1', 'carrier-status');
            expect(await tracker.RequestEnd('CA1', 'carrier-status')).toBe(false);
            await tracker.Attach('CA1', SESSION);
            expect(stop).toHaveBeenCalledTimes(1);
        });
    });

    describe('start deadline', () => {
        it('forgets a call whose session never attaches, so nothing is left behind', async () => {
            const tracker = new CallLifecycleTracker(stop, 60);
            tracker.Begin('CA1');
            expect(tracker.IsTracking('CA1')).toBe(true);

            await vi.advanceTimersByTimeAsync(61_000);

            expect(tracker.IsTracking('CA1')).toBe(false);
            expect(vi.getTimerCount()).toBe(0);
            expect(stop).not.toHaveBeenCalled();
        });

        it('is replaced by the max-duration timer once the session attaches', async () => {
            const tracker = new CallLifecycleTracker(stop, 600);
            tracker.Begin('CA1');
            await tracker.Attach('CA1', SESSION);
            expect(vi.getTimerCount()).toBe(1);
            await vi.advanceTimersByTimeAsync(61_000);
            expect(tracker.IsTracking('CA1')).toBe(true);
        });
    });

    it('Begin is idempotent', () => {
        const tracker = new CallLifecycleTracker(stop, 60);
        tracker.Begin('CA1');
        tracker.Begin('CA1');
        expect(vi.getTimerCount()).toBe(1);
    });
});
