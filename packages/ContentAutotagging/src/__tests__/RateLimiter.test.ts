import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../Engine/generic/RateLimiter';

describe('RateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Acquire passes through immediately when nothing is queued', async () => {
        const rl = new RateLimiter({ RequestsPerMinute: 60, TokensPerMinute: 100_000 });
        const p = rl.Acquire(1000);
        await vi.advanceTimersByTimeAsync(0);
        await expect(p).resolves.toBeUndefined();
    });

    it('does not crash when the only queued timestamp expires while waiting (the bug the importer hit)', async () => {
        // Previously the loop computed `currentTokens` once outside, then
        // filtered expired timestamps inside the loop body. If every
        // timestamp aged out during the delay, the next iteration tried
        // tokenTimestamps[0].time on an empty array and threw
        // `Cannot read properties of undefined (reading 'time')`.
        const rl = new RateLimiter({ RequestsPerMinute: 1000, TokensPerMinute: 100 });

        // Burn the entire 100-token budget so the next acquire must wait.
        await rl.Acquire(100);

        // Now request 100 more — has to block until the first batch expires.
        const blocked = rl.Acquire(100);

        // Jump past the 60-second window so the first batch's timestamps age
        // out, then let the rate limiter re-check.
        await vi.advanceTimersByTimeAsync(61_000);

        await expect(blocked).resolves.toBeUndefined();
    });

    it('release blocked acquires once tokens age out of the window', async () => {
        const rl = new RateLimiter({ RequestsPerMinute: 1000, TokensPerMinute: 500 });
        await rl.Acquire(500);

        let resolved = false;
        const blocked = rl.Acquire(500).then(() => { resolved = true; });

        await vi.advanceTimersByTimeAsync(30_000);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(35_000); // total > 60s
        await blocked;
        expect(resolved).toBe(true);
    });
});
