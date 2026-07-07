/**
 * @fileoverview Process-wide holder for the startup-constructed RingCentral telephony service, so the
 * outbound `PlaceRingCentralCall` GraphQL resolver reaches the SAME {@link RingCentralTelephonyService}
 * (and thus the same long-lived SIP-softphone registration) that the inbound INVITE coordinator uses. Set
 * once during server boot; read by the resolver.
 *
 * @module @memberjunction/server/telephony
 */

import type { RingCentralTelephonyService } from './RingCentralTelephonyService.js';

let ringCentralService: RingCentralTelephonyService | undefined;

/** Binds the startup-constructed RingCentral telephony service (called from server boot). */
export function SetRingCentralTelephonyService(service: RingCentralTelephonyService): void {
    ringCentralService = service;
}

/** Returns the bound RingCentral telephony service, or `undefined` when telephony is not configured. */
export function GetRingCentralTelephonyService(): RingCentralTelephonyService | undefined {
    return ringCentralService;
}
