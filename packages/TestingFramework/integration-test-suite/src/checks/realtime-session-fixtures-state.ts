/**
 * realtime-session-fixtures-state.ts — the hand-off between the two realtime-session bundles.
 *
 * `realtime-session-guard` (server transport, runs first) seeds sessions whose `Config` carries
 * SERVER-DECIDED keys (`maxSessionDeadlineIso`, `identityVerification`). Those keys can only be written
 * by trusted in-process code — `MJAIAgentSessionEntityServer` refuses every other writer, including the
 * session's owner over the wire, which is precisely what the guard exists to do — so the wire bundle
 * `realtime-session-verification` (client transport) cannot create such a row itself. It reads the ids
 * from here instead.
 *
 * This module is deliberately free of any server import so the client bundle stays "server-free by
 * construction" (see bootstrap-client.ts). Both bundles run serially in one process, so module state is
 * a safe carrier (the same device `subscription-isolation` and `permission-engine` use for fixtures).
 *
 * @module @memberjunction/integration-test-suite
 */

/** Marks every fixture row both bundles create, so a sweep can find (only) them. */
export const REALTIME_SESSION_FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** Seconds a seeded session may run unverified. */
export const SEEDED_UNVERIFIED_MAX_SECONDS = 7_200;
/** Seconds a seeded session may run once verified (strictly greater, so an extension is observable). */
export const SEEDED_VERIFIED_MAX_SECONDS = 14_400;

/** A seeded session that carries a deadline and a verification policy snapshot. */
export interface SeededCappedSession {
    SessionID: string;
    /** The `maxSessionDeadlineIso` the seed stamped. */
    DeadlineIso: string;
}

/** A seeded session whose policy snapshot requires a business-domain address. */
export interface SeededBusinessOnlySession {
    SessionID: string;
}

/** Everything the seed bundle hands to the wire bundle. */
export interface SeededRealtimeSessions {
    Capped: SeededCappedSession;
    BusinessOnly: SeededBusinessOnlySession;
}

let seeded: SeededRealtimeSessions | undefined;

/** Publishes the seeded sessions (called by the seed bundle). */
export function SetSeededRealtimeSessions(value: SeededRealtimeSessions): void {
    seeded = value;
}

/** The seeded sessions, or undefined when the seed bundle did not run in this process. */
export function GetSeededRealtimeSessions(): SeededRealtimeSessions | undefined {
    return seeded;
}

/** Forgets the seeded sessions (called after the wire bundle has deleted them). */
export function ClearSeededRealtimeSessions(): void {
    seeded = undefined;
}
