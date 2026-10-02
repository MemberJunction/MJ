/**
 * @fileoverview Process-wide holder for the startup-constructed RingCentral telephony service.
 *
 * @module @memberjunction/telephony-adapters
 */

import { MJGlobal } from '@memberjunction/global';
import type { RingCentralTelephonyService } from './RingCentralTelephonyService.js';

const RINGCENTRAL_SERVICE_KEY = '__MJ_RINGCENTRAL_TELEPHONY_SERVICE__';

/** Binds the startup-constructed RingCentral telephony service (called from server boot). */
export function SetRingCentralTelephonyService(service: RingCentralTelephonyService | undefined): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store) {
        store[RINGCENTRAL_SERVICE_KEY] = service;
    }
}

/** Returns the bound RingCentral telephony service, or `undefined` when telephony is not configured. */
export function GetRingCentralTelephonyService(): RingCentralTelephonyService | undefined {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    return store ? (store[RINGCENTRAL_SERVICE_KEY] as RingCentralTelephonyService | undefined) : undefined;
}
