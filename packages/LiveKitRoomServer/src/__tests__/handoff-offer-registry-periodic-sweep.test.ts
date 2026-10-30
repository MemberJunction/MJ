/**
 * The registry's periodic expiry sweep reads `MJ: Interaction Offers` on a timer from the moment it
 * loads. A host must be able to stop it (so an idle server sends no periodic query) or put it on its
 * own interval; the shipped 15-second cadence stays the default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { HandoffOfferRegistry, HANDOFF_OFFER_SWEEP_INTERVAL_MS } from '../room-handoff/handoff-offer-registry';

function freshRegistry(): HandoffOfferRegistry {
    delete GetGlobalObjectStore()['___SINGLETON__HandoffOfferRegistry'];
    return HandoffOfferRegistry.Instance;
}

describe('HandoffOfferRegistry periodic sweep', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        HandoffOfferRegistry.Instance.StopPeriodicSweep();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('starts on load at the shipped 15-second interval', async () => {
        const registry = freshRegistry();
        const sweep = vi.spyOn(registry, 'Sweep').mockResolvedValue(0);
        expect(HANDOFF_OFFER_SWEEP_INTERVAL_MS).toBe(15_000);
        expect(registry.IsPeriodicSweepScheduled).toBe(true);

        await vi.advanceTimersByTimeAsync(60_000);

        expect(sweep).toHaveBeenCalledTimes(4);
    });

    it('StopPeriodicSweep leaves no timer, so nothing is read on a schedule', async () => {
        const registry = freshRegistry();
        const sweep = vi.spyOn(registry, 'Sweep').mockResolvedValue(0);
        registry.StopPeriodicSweep();

        await vi.advanceTimersByTimeAsync(60 * 60_000);

        expect(sweep).not.toHaveBeenCalled();
        expect(registry.IsPeriodicSweepScheduled).toBe(false);
    });

    it('StartPeriodicSweep replaces the running timer with one on the new interval', async () => {
        const registry = freshRegistry();
        const sweep = vi.spyOn(registry, 'Sweep').mockResolvedValue(0);
        registry.StartPeriodicSweep(60_000);

        await vi.advanceTimersByTimeAsync(5 * 60_000);

        expect(sweep).toHaveBeenCalledTimes(5);
    });

    it('StartPeriodicSweep rejects a zero or non-finite interval', () => {
        const registry = freshRegistry();
        expect(() => registry.StartPeriodicSweep(0)).toThrow(/greater than 0/);
        expect(() => registry.StartPeriodicSweep(Number.NaN)).toThrow(/greater than 0/);
    });
});
