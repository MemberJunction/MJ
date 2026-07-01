/**
 * @fileoverview Process-wide holder for the startup-constructed Teams meetings service, so the
 * `StartTeamsMeetingSession` GraphQL resolver reaches the SAME {@link TeamsMeetingsService} (and thus the
 * same {@link TeamsAcsMediaRegistry} the ACS media adapter attaches transports to) that the Graph
 * change-notification webhook router uses. Set once during server boot; read by the resolver + the router.
 *
 * Mirrors `telephony-runtime.ts` (the Twilio equivalent).
 *
 * @module @memberjunction/server/telephony
 */

import type { TeamsMeetingsService } from './TeamsMeetingsService.js';

let teamsService: TeamsMeetingsService | undefined;

/** Binds the startup-constructed Teams meetings service (called from server boot). */
export function SetTeamsMeetingsService(service: TeamsMeetingsService): void {
    teamsService = service;
}

/** Returns the bound Teams meetings service, or `undefined` when Teams meetings are not configured. */
export function GetTeamsMeetingsService(): TeamsMeetingsService | undefined {
    return teamsService;
}
