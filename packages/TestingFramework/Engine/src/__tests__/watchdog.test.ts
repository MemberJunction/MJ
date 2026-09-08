import { describe, it, expect, vi } from 'vitest';
import {
    resolveWatchdogMs,
    withWatchdog,
    WATCHDOG_MIN_GRACE_MS,
} from '../engine/watchdog';

describe('resolveWatchdogMs', () => {
    it('adds a floor grace of 30s to a short timeout', () => {
        // 60s timeout → grace = max(30000, 15000) = 30000 → 90000.
        expect(resolveWatchdogMs(60_000)).toBe(90_000);
    });

    it('scales grace with the timeout for long tests', () => {
        // 300s timeout → grace = max(30000, 75000) = 75000 → 375000.
        expect(resolveWatchdogMs(300_000)).toBe(375_000);
    });

    it('honors overrides', () => {
        expect(resolveWatchdogMs(100_000, { minGraceMs: 0, graceFactor: 0.5 })).toBe(150_000);
    });

    it('treats a non-positive timeout as just the floor grace', () => {
        expect(resolveWatchdogMs(0)).toBe(WATCHDOG_MIN_GRACE_MS);
        expect(resolveWatchdogMs(-5)).toBe(WATCHDOG_MIN_GRACE_MS);
    });
});

describe('withWatchdog', () => {
    it('returns the value when work settles before the watchdog', async () => {
        const outcome = await withWatchdog(Promise.resolve('done'), 10_000);
        expect(outcome).toEqual({ timedOut: false, value: 'done' });
    });

    it('re-throws when work rejects before the watchdog', async () => {
        await expect(withWatchdog(Promise.reject(new Error('boom')), 10_000)).rejects.toThrow('boom');
    });

    it('fires onTimeout and reports timedOut when work never settles', async () => {
        vi.useFakeTimers();
        try {
            const onTimeout = vi.fn();
            const never = new Promise<string>(() => { /* never resolves */ });
            const p = withWatchdog(never, 5000, { onTimeout });
            await vi.advanceTimersByTimeAsync(5000);
            const outcome = await p;
            expect(outcome.timedOut).toBe(true);
            expect(outcome.value).toBeUndefined();
            expect(onTimeout).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('a LATE rejection of abandoned work does not become an unhandled rejection', async () => {
        vi.useFakeTimers();
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            let rejectLate!: (e: Error) => void;
            const work = new Promise<string>((_, reject) => { rejectLate = reject; });
            const p = withWatchdog(work, 1000);
            await vi.advanceTimersByTimeAsync(1000);
            expect((await p).timedOut).toBe(true);
            // The zombie rejects AFTER the watchdog already won.
            rejectLate(new Error('late zombie failure'));
            await vi.advanceTimersByTimeAsync(0);
            await Promise.resolve();
        } finally {
            vi.useRealTimers();
            process.off('unhandledRejection', unhandled);
        }
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('watchdogMs <= 0 disables the watchdog (awaits work directly)', async () => {
        expect(await withWatchdog(Promise.resolve(42), 0)).toEqual({ timedOut: false, value: 42 });
    });
});
