import { describe, it, expect, vi } from 'vitest';
import { WaitUntil } from '../checks/wait-until';

describe('WaitUntil', () => {
    it('returns as soon as the condition holds, without waiting out the timeout', async () => {
        const started = Date.now();
        await WaitUntil(() => true, 'already true', { TimeoutMs: 10_000, PollMs: 10 });
        // The whole point: the timeout is a ceiling, never a floor.
        expect(Date.now() - started).toBeLessThan(1_000);
    });

    it('polls until the condition becomes true', async () => {
        let observations = 0;
        await WaitUntil(() => ++observations >= 4, 'the fourth observation', { PollMs: 1 });
        expect(observations).toBe(4);
    });

    it('treats a throwing condition as "not yet" rather than failing', async () => {
        let observations = 0;
        await WaitUntil(
            () => {
                if (++observations < 3) {
                    throw new Error('resource still converging');
                }
                return true;
            },
            'the resource to converge',
            { PollMs: 1 }
        );
        expect(observations).toBe(3);
    });

    it('reports the last error from a throwing condition when it times out', async () => {
        await expect(
            WaitUntil(() => { throw new Error('connection refused'); }, 'the reader', { TimeoutMs: 30, PollMs: 5 })
        ).rejects.toThrow(/connection refused/);
    });

    it('names what it was waiting for when it times out', async () => {
        await expect(
            WaitUntil(() => false, 'the Q13 query to resolve', { TimeoutMs: 30, PollMs: 5 })
        ).rejects.toThrow(/the Q13 query to resolve/);
    });

    it('requires StableReads consecutive satisfying observations', async () => {
        // false, true, true, false  -> the run is broken, so this must NOT return on the 3rd call
        const script = [false, true, true, false, true, true, true];
        let i = 0;
        await WaitUntil(() => script[i++] ?? true, 'three in a row', { StableReads: 3, PollMs: 1 });
        // Satisfied only once the run of three completes, i.e. after the trailing trues.
        expect(i).toBe(7);
    });

    it('resets the streak when the condition flaps', async () => {
        const script = [true, true, false, true, true, true];
        let i = 0;
        await WaitUntil(() => script[i++] ?? true, 'stability after a flap', { StableReads: 3, PollMs: 1 });
        expect(i).toBe(6);
    });

    it('holds for StableForMs before returning, even if the condition is immediately true', async () => {
        const started = Date.now();
        await WaitUntil(() => true, 'a settled window', { StableForMs: 120, PollMs: 10 });
        expect(Date.now() - started).toBeGreaterThanOrEqual(110);
    });

    it('does not let StableReads alone impose a time floor', async () => {
        // The regression this helper exists to prevent: the previous wire-propagation wait
        // required 3 reads at a 5s poll, so every call cost ~10s even when the first read
        // already satisfied it. Three reads at a short poll must be fast.
        const started = Date.now();
        await WaitUntil(() => true, 'three quick reads', { StableReads: 3, PollMs: 5 });
        expect(Date.now() - started).toBeLessThan(500);
    });

    it('supports async conditions', async () => {
        let observations = 0;
        await WaitUntil(async () => { await Promise.resolve(); return ++observations >= 2; }, 'an async probe', { PollMs: 1 });
        expect(observations).toBe(2);
    });

    it('checks the condition at least once even with a zero timeout', async () => {
        const condition = vi.fn(() => true);
        await WaitUntil(condition, 'one shot', { TimeoutMs: 0, PollMs: 1 });
        expect(condition).toHaveBeenCalledTimes(1);
    });
});
