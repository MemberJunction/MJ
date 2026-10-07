/**
 * @fileoverview Pure helpers for a run's audience (`ExecuteAgentParams.Audience`): validating it, reducing it to
 * the reader IDs it adds beyond the caller, and matching those IDs to hydrated users. `BaseAgent` owns the
 * lookup itself (its overridable `ResolveAudienceUsers`, backed by the server's `UserCache`) and the gates.
 *
 * @module @memberjunction/ai-agents
 */
import type { UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { AgentAudienceMode, AgentRunAudience } from '@memberjunction/ai-core-plus';

/** The modes an audience may name. A `Record` so a mode added to {@link AgentAudienceMode} fails to compile here. */
const AUDIENCE_MODES: Record<AgentAudienceMode, true> = { Caller: true, Intersection: true };

/** The users an audience's IDs matched, and the IDs no user has. */
export interface AudienceUserMatch {
    /** One hydrated user per matched ID, in the order the IDs were given. */
    Readers: UserInfo[];
    /** The IDs no user matched, as given. */
    MissingIDs: string[];
}

/**
 * What is wrong with a run's audience, or `null` when it is absent or well formed. Takes `unknown`: hosts
 * assemble the audience at runtime, and a malformed one must fail the run rather than run as if there were none.
 *
 * Rules: an object; a known `Mode`; `'Intersection'` with a non-empty array of non-blank string `UserIDs`;
 * `'Caller'` with no `UserIDs` (absent or empty).
 */
export function AgentAudienceProblem(audience: unknown): string | null {
    if (audience === undefined) return null;
    if (audience === null || typeof audience !== 'object' || Array.isArray(audience)) {
        return `expected { Mode, UserIDs }, got ${describeValue(audience)}. Omit Audience for a run with no audience.`;
    }
    const mode = 'Mode' in audience ? audience.Mode : undefined;
    if (!isAudienceMode(mode)) {
        return `Mode must be 'Caller' or 'Intersection', got ${typeof mode === 'string' ? `'${mode}'` : describeValue(mode)}.`;
    }
    const ids = 'UserIDs' in audience ? audience.UserIDs : undefined;
    return mode === 'Caller' ? callerUserIDsProblem(ids) : intersectionUserIDsProblem(ids);
}

/**
 * The reader IDs an audience adds beyond the caller: one per distinct ID (case-insensitive, normalized), the
 * caller's own left out. `[]` when there is no audience, it is `'Caller'`, or its only reader is the caller —
 * every audience gate fires only when this is non-empty. Expects an audience that passed {@link AgentAudienceProblem}.
 */
export function AgentAudienceReaderIDs(audience: AgentRunAudience | undefined, callerID: string | undefined): string[] {
    if (!audience || audience.Mode !== 'Intersection') return [];
    const ids: string[] = [];
    for (const id of audience.UserIDs) {
        const known = UUIDsEqual(id, callerID) || ids.some(existing => UUIDsEqual(existing, id));
        if (!known) ids.push(NormalizeUUID(id));
    }
    return ids;
}

/**
 * Whether a run's audience adds a reader beyond the caller. A malformed audience counts as adding one, so a gate
 * that asks this can never treat a bad audience as no audience (a run with one fails before the gates run anyway).
 */
export function AgentAudienceAddsReader(audience: AgentRunAudience | undefined, callerID: string | undefined): boolean {
    if (AgentAudienceProblem(audience) !== null) return true;
    return AgentAudienceReaderIDs(audience, callerID).length > 0;
}

/** Match each ID to a user (case-insensitive), reporting the IDs no user has. */
export function MatchAudienceUsers(ids: string[], users: UserInfo[]): AudienceUserMatch {
    const match: AudienceUserMatch = { Readers: [], MissingIDs: [] };
    for (const id of ids) {
        const user = users.find(u => UUIDsEqual(u.ID, id));
        if (user) {
            match.Readers.push(user);
        } else {
            match.MissingIDs.push(id);
        }
    }
    return match;
}

/**
 * Whether a value is one of the {@link AUDIENCE_MODES} — an own key, never a name the object inherits. `in` would
 * accept `'toString'`, `'constructor'`, `'__proto__'` and the rest of `Object.prototype`, and a mode that is neither
 * `'Caller'` nor `'Intersection'` adds no reader in {@link AgentAudienceReaderIDs}: every gate would be skipped.
 */
function isAudienceMode(mode: unknown): mode is AgentAudienceMode {
    return typeof mode === 'string' && Object.prototype.hasOwnProperty.call(AUDIENCE_MODES, mode);
}

/** `'Caller'` takes no readers: `UserIDs` absent or empty. */
function callerUserIDsProblem(ids: unknown): string | null {
    if (ids === undefined || (Array.isArray(ids) && ids.length === 0)) return null;
    return `Mode 'Caller' takes no UserIDs (got ${Array.isArray(ids) ? `${ids.length} ID(s)` : describeValue(ids)}); use 'Intersection' to name readers.`;
}

/** `'Intersection'` needs a non-empty array of non-blank string IDs. */
function intersectionUserIDsProblem(ids: unknown): string | null {
    if (!Array.isArray(ids)) {
        return `Mode 'Intersection' needs UserIDs, an array of MJ: Users IDs; got ${describeValue(ids)}.`;
    }
    if (ids.length === 0) {
        return "Mode 'Intersection' needs at least one ID in UserIDs; use 'Caller' (or omit Audience) for a run with no other readers.";
    }
    const blank = ids.findIndex(id => typeof id !== 'string' || id.trim() === '');
    return blank === -1 ? null : `UserIDs[${blank}] is blank or not a string — every reader must be an MJ: Users ID.`;
}

/** `null`, `an array`, or the `typeof` name: messages name a bad value's kind rather than echo it. */
function describeValue(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array';
    return typeof value;
}
