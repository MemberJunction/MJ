/**
 * @fileoverview Pure helpers for a run's audience (`ExecuteAgentParams.Audience`): validating it, reducing it to
 * the reader IDs it adds beyond the caller, and matching those IDs to hydrated users. `BaseAgent` owns the
 * lookup itself (its overridable `ResolveAudienceUsers`, backed by the server's `UserCache`) and the gates.
 *
 * @module @memberjunction/ai-agents
 */
import type { UserInfo } from '@memberjunction/core';
import { IndexByUUID, NormalizeUUID, UUIDSet } from '@memberjunction/global';
import {
    IsStructuralCommonReachAudience,
    ValidateAgentRunAudience,
    type AgentRunAudience,
} from '@memberjunction/ai-core-plus';

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
 * Rules: an object; a known `Mode` (`'Caller'`, `'Intersection'`, or `'ScopeCommonReach'`); `'Intersection'`
 * with a non-empty array of non-blank string `UserIDs`; `'Caller'` with no `UserIDs` (absent or empty);
 * `'ScopeCommonReach'` with no `UserIDs`.
 */
export function AgentAudienceProblem(audience: unknown): string | null {
    return ValidateAgentRunAudience(audience);
}

/**
 * The reader IDs an audience adds beyond the caller: one per distinct ID (case-insensitive, normalized), the
 * caller's own left out. `[]` when there is no audience, it is `'Caller'`, it is `'ScopeCommonReach'`
 * (O(1) structural mode without reader enumeration), or its only reader is the caller. Expects an audience
 * that passed {@link AgentAudienceProblem}.
 */
export function AgentAudienceReaderIDs(audience: AgentRunAudience | undefined, callerID: string | undefined): string[] {
    if (!audience || audience.Mode !== 'Intersection') return [];
    const seen = new UUIDSet(callerID ? [callerID] : []);
    const ids: string[] = [];
    for (const id of audience.UserIDs) {
        if (!seen.Has(id)) {
            seen.Add(id);
            ids.push(NormalizeUUID(id));
        }
    }
    return ids;
}

/**
 * Whether a run's audience constrains the run beyond the caller (adds an enumerated reader, runs in
 * structural `'ScopeCommonReach'` mode, or is malformed). A malformed audience counts as constraining, so a
 * gate that asks this can never treat a bad audience as no audience.
 */
export function AgentAudienceAddsReader(audience: AgentRunAudience | undefined, callerID: string | undefined): boolean {
    if (AgentAudienceProblem(audience) !== null) return true;
    if (IsStructuralCommonReachAudience(audience)) return true;
    return AgentAudienceReaderIDs(audience, callerID).length > 0;
}

/** Match each ID to a user (case-insensitive), reporting the IDs no user has. */
export function MatchAudienceUsers(ids: string[], users: UserInfo[]): AudienceUserMatch {
    const match: AudienceUserMatch = { Readers: [], MissingIDs: [] };
    const usersByID = IndexByUUID(users);
    for (const id of ids) {
        const user = usersByID.Get(id);
        if (user) {
            match.Readers.push(user);
        } else {
            match.MissingIDs.push(id);
        }
    }
    return match;
}
