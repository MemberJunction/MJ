import { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from './UserCache.js';

/**
 * The principal server-side work runs as when no caller is present (startup engines, in-process
 * CodeGen, background processors, CLI tools).
 *
 * One ladder for every such lookup: the system user if it is present and active, else the
 * lowest-ID active Owner, else nothing. Callers that used to pick "the first Owner, else the
 * first user in the cache" acted as an arbitrary, possibly inactive or anonymous, user when no
 * Owner was first in an unordered cache; callers that compared `Type === 'Owner'` never matched,
 * because `User.Type` is `NCHAR(15)` and arrives space-padded.
 *
 * MJServer's `auth/principals.ts` ends its configured-setting ladder with the same two fallback
 * rungs (and the same lowest-ID, active-only rule); keep the two in step.
 */

/** The subset of a user this ladder reads; `UserInfo` satisfies it structurally. */
export type ServerPrincipalCandidate = Pick<UserInfo, 'ID' | 'Type' | 'IsActive'>;

/** Which rung produced the principal; `none` when the deployment offers no usable one. */
export type ServerPrincipalReason = 'system' | 'owner' | 'none';

export interface ServerPrincipalResolution<T extends ServerPrincipalCandidate> {
    /** The principal to act as, or null when there is none. */
    User: T | null;
    Reason: ServerPrincipalReason;
}

/** Case- and padding-insensitive form of a column value (`NCHAR` columns arrive padded). */
export function NormalizePrincipalValue(value: string | null | undefined): string {
    return value?.trim().toLowerCase() ?? '';
}

/**
 * The lowest-ID ACTIVE user in `matches`, or undefined. Ties go to the lowest ID, never to array
 * position: `UserCache.Users` comes from an unordered query and is mutated in place, so its order
 * is not stable. A deactivated user is never a candidate.
 */
export function LowestActiveById<T extends ServerPrincipalCandidate>(matches: readonly T[]): T | undefined {
    let lowest: T | undefined;
    for (const match of matches) {
        if (match.IsActive !== true) {
            continue;
        }
        if (!lowest || NormalizePrincipalValue(match.ID) < NormalizePrincipalValue(lowest.ID)) {
            lowest = match;
        }
    }
    return lowest;
}

/**
 * Pure ladder: the active system user, else the lowest-ID active Owner, else null.
 *
 * @param users        the candidate pool, normally `UserCache.Instance.Users`
 * @param systemUserId the deployment's system user ID
 */
export function ResolveServerPrincipalFrom<T extends ServerPrincipalCandidate>(
    users: readonly T[],
    systemUserId: string,
): ServerPrincipalResolution<T> {
    const system = users.find((u) => UUIDsEqual(u.ID, systemUserId) && u.IsActive === true);
    if (system) {
        return { User: system, Reason: 'system' };
    }
    const owner = LowestActiveById(users.filter((u) => NormalizePrincipalValue(u.Type) === 'owner'));
    return owner ? { User: owner, Reason: 'owner' } : { User: null, Reason: 'none' };
}

/**
 * The server principal from the process-wide user cache: the active system user, else the
 * lowest-ID active Owner, else null. Callers must handle null rather than fall back to an
 * arbitrary cached user.
 */
export function GetServerPrincipal(): UserInfo | null {
    return ResolveServerPrincipalFrom(UserCache.Instance.Users, UserCache.Instance.SYSTEM_USER_ID).User;
}
