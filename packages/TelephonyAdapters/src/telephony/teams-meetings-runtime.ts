/**
 * @fileoverview Process-wide holder for the startup-constructed Teams meetings service.
 *
 * @module @memberjunction/telephony-adapters
 */

import { MJGlobal } from '@memberjunction/global';
import type { TeamsMeetingsService } from './TeamsMeetingsService.js';

const TEAMS_SERVICE_KEY = '__MJ_TEAMS_MEETINGS_SERVICE__';

/** Binds the startup-constructed Teams meetings service (called from server boot). */
export function SetTeamsMeetingsService(service: TeamsMeetingsService | undefined): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store) {
        store[TEAMS_SERVICE_KEY] = service;
    }
}

/** Returns the bound Teams meetings service, or `undefined` when Teams meetings are not configured. */
export function GetTeamsMeetingsService(): TeamsMeetingsService | undefined {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    return store ? (store[TEAMS_SERVICE_KEY] as TeamsMeetingsService | undefined) : undefined;
}
