/**
 * Contract tests for {@link RetryHooks} — the seam that lets a caller make the wait between
 * attempts smarter than blind exponential backoff.
 *
 * Motivation: a 429 is not a network blip. The source usually says exactly how long to wait
 * (Retry-After), and retrying sooner is what turns a soft throttle into a hard one. Before these
 * hooks, `WithRetry` slept on pure exponential backoff and the next attempt bypassed the rate
 * limiter entirely, because the token was acquired once BEFORE the retry loop.
 */
import { describe, it, expect, vi } from 'vitest';
import { WithRetry, RetryConfig } from '../RetryRunner';

/** Near-zero delays so the suite exercises ordering, not wall-clock. */
const FAST: RetryConfig = {
    MaxAttempts: 3,
    InitialBackoffMs: 1,
    MaxBackoffMs: 4,
    JitterFraction: 0,
};

describe('WithRetry hooks', () => {
    it('uses the source-directed delay instead of the computed backoff', async () => {
        const seen: number[] = [];
        let attempts = 0;
        await WithRetry(
            async () => {
                if (++attempts < 3) throw new Error('429');
                return 'ok';
            },
            FAST,
            () => true,
            (_attempt, _err, delayMs) => seen.push(delayMs),
            { DelayForError: () => 7 }
        );
        // Both retries waited the directed 7ms, not 1ms/2ms of backoff.
        expect(seen).toEqual([7, 7]);
    });

    it('falls back to backoff when the hook cannot derive a delay', async () => {
        const seen: number[] = [];
        let attempts = 0;
        await WithRetry(
            async () => {
                if (++attempts < 3) throw new Error('boom');
                return 'ok';
            },
            FAST,
            () => true,
            (_attempt, _err, delayMs) => seen.push(delayMs),
            // undefined = "no instruction from the source"; null and NaN must behave the same.
            { DelayForError: (_e, attempt) => (attempt === 1 ? undefined : null) }
        );
        expect(seen).toEqual([1, 2]);
    });

    it('honours a directed delay of 0 — a source may ask for an immediate retry', async () => {
        const seen: number[] = [];
        let attempts = 0;
        await WithRetry(
            async () => {
                if (++attempts < 2) throw new Error('429');
                return 'ok';
            },
            FAST,
            () => true,
            (_a, _e, delayMs) => seen.push(delayMs),
            { DelayForError: () => 0 }
        );
        expect(seen).toEqual([0]);
    });

    it('ignores a nonsensical directed delay and keeps the backoff', async () => {
        const seen: number[] = [];
        let attempts = 0;
        await WithRetry(
            async () => {
                if (++attempts < 2) throw new Error('429');
                return 'ok';
            },
            FAST,
            () => true,
            (_a, _e, delayMs) => seen.push(delayMs),
            { DelayForError: () => -5 }
        );
        expect(seen).toEqual([1]);
    });

    it('runs BeforeRetry after the wait and before the next attempt', async () => {
        const order: string[] = [];
        let attempts = 0;
        await WithRetry(
            async () => {
                order.push(`attempt${++attempts}`);
                if (attempts < 3) throw new Error('429');
                return 'ok';
            },
            FAST,
            () => true,
            () => order.push('onRetry'),
            {
                DelayForError: () => 0,
                BeforeRetry: async () => {
                    order.push('acquire');
                },
            }
        );
        // onRetry (report the throttle) → wait → acquire a fresh token → attempt again.
        expect(order).toEqual([
            'attempt1', 'onRetry', 'acquire',
            'attempt2', 'onRetry', 'acquire',
            'attempt3',
        ]);
    });

    it('does not call the hooks on the final failure — there is no next attempt to gate', async () => {
        const beforeRetry = vi.fn();
        const delayForError = vi.fn(() => 0);
        await expect(
            WithRetry(
                async () => {
                    throw new Error('always');
                },
                { ...FAST, MaxAttempts: 2 },
                () => true,
                undefined,
                { DelayForError: delayForError, BeforeRetry: beforeRetry }
            )
        ).rejects.toThrow('always');
        expect(delayForError).toHaveBeenCalledTimes(1);
        expect(beforeRetry).toHaveBeenCalledTimes(1);
    });

    it('does not call the hooks for a non-retryable error', async () => {
        const beforeRetry = vi.fn();
        await expect(
            WithRetry(
                async () => {
                    throw new Error('auth');
                },
                FAST,
                () => false,
                undefined,
                { BeforeRetry: beforeRetry }
            )
        ).rejects.toThrow('auth');
        expect(beforeRetry).not.toHaveBeenCalled();
    });

    it('is unchanged when no hooks are supplied (existing callers)', async () => {
        const seen: number[] = [];
        let attempts = 0;
        const result = await WithRetry(
            async () => {
                if (++attempts < 3) throw new Error('blip');
                return 'ok';
            },
            FAST,
            () => true,
            (_a, _e, delayMs) => seen.push(delayMs)
        );
        expect(result).toBe('ok');
        expect(seen).toEqual([1, 2]);
    });
});
