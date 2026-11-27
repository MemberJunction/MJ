/**
 * PR 5 milestone B3 — attack 10 (budget under concurrency, F-011, D5-28) and the budget half of attack 7 (D5-14).
 *
 * Each prompt call of a re-derivation slice first reserves its estimated cost (`SpentUsd + ReservedUsd + mean ≤
 * maxUsdPerRun`, values likewise); on return the reservation is replaced by the call's real cost. So with
 * `MaxConcurrency` calls in flight the run can overspend only by what those in-flight calls cost above their estimate.
 */
import { describe, it, expect } from 'vitest';
import { RederivationSlice, type RederivationBudgetState } from '../versions/rederivation-slice';

/** A fresh budget: `maxUsd` dollars and `maxValues` values per run. */
function budget(maxUsd: number, maxValues: number): RederivationBudgetState {
    return RederivationSlice.NewBudget({ maxUsdPerRun: maxUsd, maxValuesPerRun: maxValues });
}

describe('RederivationSlice.Reserve / Settle', () => {
    it('reserves while the reservation fits, and refuses the call that would pass maxUsdPerRun', () => {
        const b = budget(1, 100);
        expect(RederivationSlice.Reserve(b, 0.4)).toBe(true);
        expect(RederivationSlice.Reserve(b, 0.4)).toBe(true);
        expect(RederivationSlice.Reserve(b, 0.4)).toBe(false);
        expect(b.ReservedUsd).toBeCloseTo(0.8, 10);
        expect(b.ReservedValues).toBe(2);
    });

    it('Settle replaces the reservation with the real cost', () => {
        const b = budget(1, 100);
        RederivationSlice.Reserve(b, 0.5);
        RederivationSlice.Settle(b, 0.5, 0.2);
        expect(b.ReservedUsd).toBeCloseTo(0, 10);
        expect(b.SpentUsd).toBeCloseTo(0.2, 10);
        expect(b.ReservedValues).toBe(0);
        expect(b.Values).toBe(1);
        // the unspent estimate is free again
        expect(RederivationSlice.Reserve(b, 0.5)).toBe(true);
    });

    it('counts values against maxValuesPerRun as it reserves them', () => {
        const b = budget(100, 2);
        expect(RederivationSlice.Reserve(b, 0.01)).toBe(true);
        expect(RederivationSlice.Reserve(b, 0.01)).toBe(true);
        expect(RederivationSlice.Reserve(b, 0.01)).toBe(false);
    });

    it('a mean of 0 (no priced prompt runs yet) is limited by values only', () => {
        const b = budget(5, 3);
        expect([1, 2, 3, 4].map(() => RederivationSlice.Reserve(b, 0))).toEqual([true, true, true, false]);
    });

    it('Settle never leaves a negative reservation (a release of nothing)', () => {
        const b = budget(1, 10);
        RederivationSlice.Settle(b, 0.3, 0.3);
        expect(b.ReservedUsd).toBe(0);
        expect(b.ReservedValues).toBe(0);
    });
});

describe('attack 10: MaxConcurrency = 4, maxUsdPerRun = 5 × the mean call cost', () => {
    const mean = 0.000542;

    /** Runs `calls` calls through `slots` concurrent workers; each call costs `costOf(i)` and settles after `delayOf(i)` ticks. */
    async function run(slots: number, calls: number, maxUsd: number, costOf: (i: number) => number): Promise<{ Started: number; Budget: RederivationBudgetState }> {
        const b = budget(maxUsd, 10_000);
        let next = 0;
        let started = 0;
        const worker = async (): Promise<void> => {
            while (next < calls) {
                const i = next++;
                if (!RederivationSlice.Reserve(b, mean)) continue;
                started++;
                // the call is in flight across a few event-loop turns while the other workers reserve
                for (let t = 0; t < 3 + (i % 3); t++) await Promise.resolve();
                RederivationSlice.Settle(b, mean, costOf(i));
            }
        };
        await Promise.all(Array.from({ length: slots }, () => worker()));
        return { Started: started, Budget: b };
    }

    it('at most 5 calls start when every call costs its estimate', async () => {
        const r = await run(4, 25, 5 * mean, () => mean);
        expect(r.Started).toBe(5);
        expect(r.Budget.SpentUsd).toBeLessThanOrEqual(5 * mean + 1e-12);
    });

    it('SpentUsd ≤ maxUsdPerRun + the 4 in-flight calls\' cost above their estimate, when calls cost more than estimated', async () => {
        const actual = 3 * mean;
        const r = await run(4, 25, 5 * mean, () => actual);
        expect(r.Started).toBeLessThanOrEqual(5);
        expect(r.Budget.SpentUsd).toBeLessThanOrEqual(5 * mean + 4 * (actual - mean) + 1e-12);
    });

    it('reserving nothing before a call (the mutation) would let all 25 calls start', async () => {
        // the bound the attack relies on: every started call took a reservation
        const r = await run(4, 25, 5 * mean, () => mean);
        expect(r.Budget.Values).toBe(r.Started);
    });
});
