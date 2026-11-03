/**
 * `agentSessions.handoffOfferExpiry`: MJServer either stops the handoff offer registry's expiry sweep
 * or puts it on the configured interval. The registry starts the sweep on its own when it loads.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HandoffOfferRegistry } from '@memberjunction/livekit-room-server';
import { ApplyHandoffOfferExpirySettings } from '../agentSessions/HandoffOfferExpiry.js';

describe('ApplyHandoffOfferExpirySettings', () => {
    afterEach(() => {
        HandoffOfferRegistry.Instance.StartPeriodicSweep(15_000);
        HandoffOfferRegistry.Instance.StopPeriodicSweep();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('disabled: stops the sweep, and nothing is read for an hour', async () => {
        vi.useFakeTimers();
        const registry = HandoffOfferRegistry.Instance;
        registry.StartPeriodicSweep(15_000);
        const sweep = vi.spyOn(registry, 'Sweep').mockResolvedValue(0);

        ApplyHandoffOfferExpirySettings({ enabled: false, sweepIntervalMs: 15_000 });
        await vi.advanceTimersByTimeAsync(60 * 60_000);

        expect(sweep).not.toHaveBeenCalled();
        expect(registry.IsPeriodicSweepScheduled).toBe(false);
    });

    it('enabled: runs the sweep on the configured interval', async () => {
        vi.useFakeTimers();
        const registry = HandoffOfferRegistry.Instance;
        const sweep = vi.spyOn(registry, 'Sweep').mockResolvedValue(0);

        ApplyHandoffOfferExpirySettings({ enabled: true, sweepIntervalMs: 120_000 });
        await vi.advanceTimersByTimeAsync(10 * 60_000);

        expect(sweep).toHaveBeenCalledTimes(5);
    });
});
