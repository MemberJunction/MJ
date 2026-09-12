/**
 * @fileoverview Process-wide holder for the startup-constructed Vonage telephony service.
 *
 * @module @memberjunction/telephony-adapters
 */

import { MJGlobal } from '@memberjunction/global';
import type { VonageTelephonyService } from './VonageTelephonyService.js';

const VONAGE_SERVICE_KEY = '__MJ_VONAGE_TELEPHONY_SERVICE__';

/** Binds the startup-constructed Vonage telephony service (called from server boot). */
export function SetVonageTelephonyService(service: VonageTelephonyService | undefined): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store) {
        store[VONAGE_SERVICE_KEY] = service;
    }
}

/** Returns the bound Vonage telephony service, or `undefined` when telephony is not configured. */
export function GetVonageTelephonyService(): VonageTelephonyService | undefined {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    return store ? (store[VONAGE_SERVICE_KEY] as VonageTelephonyService | undefined) : undefined;
}
