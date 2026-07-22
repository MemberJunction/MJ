/**
 * @fileoverview Process-wide holder for the startup-constructed telephony service, so the
 * outbound `PlaceTwilioCall` GraphQL resolver reaches the SAME {@link TwilioTelephonyService}
 * (and thus the same {@link TwilioCallMediaRegistry} the Media-Streams WSS attaches sockets to)
 * that the inbound webhook router uses. Set once during server boot; read by the resolver.
 *
 * @module @memberjunction/server/telephony
 */

import type { TwilioTelephonyService } from './TwilioTelephonyService.js';

let twilioService: TwilioTelephonyService | undefined;

/** Binds the startup-constructed Twilio telephony service (called from server boot). */
export function SetTwilioTelephonyService(service: TwilioTelephonyService): void {
    twilioService = service;
}

/** Returns the bound Twilio telephony service, or `undefined` when telephony is not configured. */
export function GetTwilioTelephonyService(): TwilioTelephonyService | undefined {
    return twilioService;
}
