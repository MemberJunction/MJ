/**
 * @fileoverview Cache keys for in-process caches that hold user-scoped data.
 *
 * Data loaded under a user's permissions (row-level filters, field-level security, entity
 * permissions) differs from one user to the next. An in-process cache that stores such data must
 * therefore key every entry by the user it was loaded for; a key without a user hands the first
 * caller's rows to everyone who asks next. These helpers make that segment uniform across caches.
 *
 * The user ID is the segment: it is always correct, at the cost of one entry per user. Sharing an
 * entry between users with identical permissions is a valid optimization only when the key encodes
 * everything that narrows the load (role filters, API-key ceilings, denied fields) — that is the
 * job of the RunView cache's own fingerprint, not of an ad-hoc cache.
 *
 * @module @memberjunction/global/UserScopedCacheKey
 */

import { NormalizeUUID } from './UUIDUtils';

/**
 * Returns the cache key segment that identifies the user an entry was loaded for, or `null` when
 * there is no user. A `null` result means the data must not be cached at all, because any key built
 * without a user would be shared by every caller.
 *
 * @param userID - the ID of the user the data was loaded for
 * @returns `u:<normalized user ID>`, or `null` when `userID` is empty
 *
 * @example
 * UserCacheKeySegment('A1B2C3D4-E5F6-7890-ABCD-EF1234567890') // 'u:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 * UserCacheKeySegment(undefined)                              // null
 */
export function UserCacheKeySegment(userID: string | null | undefined): string | null {
    const normalized = NormalizeUUID(userID);
    return normalized.length > 0 ? `u:${normalized}` : null;
}

/**
 * Builds a cache key for user-scoped data from the entry's own key parts plus the user segment
 * ({@link UserCacheKeySegment}). Returns `null` when there is no user; callers must then skip the
 * cache for both read and write.
 *
 * @param userID - the ID of the user the data was loaded for
 * @param parts - the parts that identify the entry apart from the user, in a fixed order
 * @returns the parts and the user segment joined with `:`, or `null` when `userID` is empty
 *
 * @example
 * UserScopedCacheKey(contextUser.ID, agentID, sourceName) // '<agentID>:<sourceName>:u:<userID>'
 */
export function UserScopedCacheKey(userID: string | null | undefined, ...parts: string[]): string | null {
    const segment = UserCacheKeySegment(userID);
    return segment === null ? null : [...parts, segment].join(':');
}
