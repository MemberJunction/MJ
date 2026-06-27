/**
 * @fileoverview Process-wide holder for the startup-constructed Vonage telephony service, so the
 * outbound `PlaceVonageCall` GraphQL resolver reaches the SAME {@link VonageTelephonyService}
 * (and thus the same {@link VonageCallMediaRegistry} the media WSS attaches sockets to) that the
 * inbound webhook router uses. Set once during server boot; read by the resolver.
 *
 * @module @memberjunction/server/telephony
 */

import type { VonageTelephonyService } from './VonageTelephonyService.js';

let vonageService: VonageTelephonyService | undefined;

/** Binds the startup-constructed Vonage telephony service (called from server boot). */
export function SetVonageTelephonyService(service: VonageTelephonyService): void {
    vonageService = service;
}

/** Returns the bound Vonage telephony service, or `undefined` when Vonage telephony is not configured. */
export function GetVonageTelephonyService(): VonageTelephonyService | undefined {
    return vonageService;
}
