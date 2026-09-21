/**
 * @fileoverview Process-wide holder for the startup-constructed telephony service, so the
 * outbound `PlaceTwilioCall` GraphQL resolver reaches the SAME {@link TwilioTelephonyService}
 * (and thus the same {@link TwilioCallMediaRegistry} the Media-Streams WSS attaches sockets to)
 * that the inbound webhook router uses.
 *
 * @module @memberjunction/telephony-adapters
 */

import { MJGlobal } from '@memberjunction/global';
import type { TwilioTelephonyService } from './TwilioTelephonyService.js';

const TWILIO_SERVICE_KEY = '__MJ_TWILIO_TELEPHONY_SERVICE__';

/** Binds the startup-constructed Twilio telephony service (called from server boot). */
export function SetTwilioTelephonyService(service: TwilioTelephonyService | undefined): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store) {
        store[TWILIO_SERVICE_KEY] = service;
    }
}

/** Returns the bound Twilio telephony service, or `undefined` when telephony is not configured. */
export function GetTwilioTelephonyService(): TwilioTelephonyService | undefined {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    return store ? (store[TWILIO_SERVICE_KEY] as TwilioTelephonyService | undefined) : undefined;
}
