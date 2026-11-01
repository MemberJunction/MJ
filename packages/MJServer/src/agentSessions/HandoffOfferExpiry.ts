import { HandoffOfferRegistry } from '@memberjunction/livekit-room-server';
import type { HandoffOfferSweepSettings } from '../backgroundSweepConfigUnits.js';

/**
 * Applies `agentSessions.handoffOfferExpiry` to the process-wide handoff offer registry. The registry
 * starts its expiry sweep (a read of `MJ: Interaction Offers` every 15 seconds) as soon as it loads, on
 * every MJAPI whatever its role; this either stops that sweep, so an idle server sends no periodic
 * query for it, or restarts it on the configured interval. Overdue offers still read as expired when
 * the sweep is off. See the Serverless Database Auto-Pause guide.
 */
export function ApplyHandoffOfferExpirySettings(settings: HandoffOfferSweepSettings): void {
    const registry = HandoffOfferRegistry.Instance;
    if (settings.enabled) {
        registry.StartPeriodicSweep(settings.sweepIntervalMs);
    } else {
        registry.StopPeriodicSweep();
    }
}
