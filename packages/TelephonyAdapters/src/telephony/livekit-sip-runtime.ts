/**
 * @fileoverview Process-wide holder for the startup-constructed LiveKit SIP service, so the outbound `PlaceLiveKitSipCall`
 * GraphQL resolver reaches the SAME service (and so the same call tracker and handoff wiring) the inbound webhook uses.
 *
 * @module @memberjunction/telephony-adapters
 */

import { MJGlobal } from '@memberjunction/global';
import type { LiveKitSipTelephonyService } from './LiveKitSipTelephonyService.js';

const LIVEKIT_SIP_SERVICE_KEY = '__MJ_LIVEKIT_SIP_TELEPHONY_SERVICE__';

/** Binds the startup-constructed LiveKit SIP service (called from server boot). */
export function SetLiveKitSipTelephonyService(service: LiveKitSipTelephonyService | undefined): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store) {
        store[LIVEKIT_SIP_SERVICE_KEY] = service;
    }
}

/** Returns the bound LiveKit SIP service, or `undefined` when LiveKit SIP is not configured. */
export function GetLiveKitSipTelephonyService(): LiveKitSipTelephonyService | undefined {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    return store ? (store[LIVEKIT_SIP_SERVICE_KEY] as LiveKitSipTelephonyService | undefined) : undefined;
}
