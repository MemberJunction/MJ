import { LogError, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';

/**
 * Resolving the principal that server-side work runs as when there is no caller to run as.
 *
 * MJServer names such a principal in config in three places — `contextUserForNewUserCreation`,
 * `contextUserForProvisioning` and `contextUserForLookup` — and, before issue #4209, each
 * consumer hand-rolled its own lookup-and-fallback. There were six of those across the server in
 * three mutually inconsistent variants, and two of them could not resolve the value MJ itself
 * ships: the default is `'not.set@nowhere.com'`, the system user's EMAIL, while the lookup
 * matched `Name` (which is `'System'`). The result was an error-level log line per magic-link
 * redeem and provisioning attributed to whichever user happened to sort first as an Owner.
 *
 * This module is the single ladder those consumers share.
 */

/**
 * The subset of a user this resolver reads. `UserInfo` satisfies it structurally, so callers pass
 * `UserCache.Users` directly while tests pass plain objects — no cast, no singleton, no database.
 */
export type ResolvablePrincipal = Pick<UserInfo, 'ID' | 'Name' | 'Email' | 'Type' | 'IsActive'>;

/** Which rung of the ladder produced the principal; `none` when no rung did. */
export type PrincipalResolutionReason = 'name' | 'email' | 'system' | 'owner' | 'none';

export interface PrincipalResolution<T extends ResolvablePrincipal> {
    /** The principal to act as, or null when this deployment offers none. */
    user: T | null;
    reason: PrincipalResolutionReason;
    /**
     * Operator-facing diagnostic. Set ONLY when a configured candidate failed to resolve — an
     * unset candidate is a deployment that never asked for a specific user, not a misconfiguration,
     * and must not be reported as one.
     */
    warning?: string;
}

/** Case- and padding-insensitive comparison, for the `NCHAR`-padded and free-text columns alike. */
function normalize(value: string | null | undefined): string {
    return value?.trim().toLowerCase() ?? '';
}

/**
 * The match with the lowest ID, or undefined when there are none.
 *
 * EVERY rung resolves ties through this rather than taking the first match. `UserCache.Users`
 * comes from an `ORDER BY`-less `SELECT * FROM vwUsers` and is mutated in place at runtime
 * (`Users.push`), so its order differs across boots AND within a process — which is exactly how
 * `CreatedByUserID` became noise. A rung that resolves by array order is that same defect, one
 * rung further down.
 *
 * `Name` is the rung this actually protects: it carries no unique constraint. MJ's own rows do
 * not collide (`NewUserBase` sets `Name = email`, and `UQ_User_Email` makes Email unique, so
 * MJ-created Names are unique by consequence), but a hand-created or externally-synced row can.
 *
 * Plain `<` on the normalized strings rather than `localeCompare`: ordering by code point cannot
 * shift with the process locale or the runtime's ICU build, and this ordering decides attribution.
 */
function lowestById<T extends ResolvablePrincipal>(matches: readonly T[]): T | undefined {
    let lowest: T | undefined;
    for (const match of matches) {
        if (!lowest || normalize(match.ID) < normalize(lowest.ID)) {
            lowest = match;
        }
    }
    return lowest;
}

/**
 * Resolves the principal a configured candidate names, falling back deterministically.
 *
 * The ladder, in order:
 *  1. `Name`  — tried first so that every host resolving today resolves to the SAME user as
 *               before. This is what makes adding the `Email` rung a compatible change rather
 *               than a semantic one.
 *  2. `Email` — the identity column everywhere else in MJServer, and the only one the schema
 *               makes unique (`UQ_User_Email`). This is the rung that resolves MJ's own default.
 *  3. System  — by ID, so it survives the system user being renamed. ACTIVE only.
 *  4. Owner   — lowest ID among ACTIVE owners. A last resort, but still deterministic: the
 *               previous "first Owner in cache order" made `CreatedByUserID` depend on the order
 *               `SELECT * FROM vwUsers` happened to return, which is unstable across boots and
 *               within a process.
 *
 * Every rung breaks ties by lowest ID ({@link lowestById}), never by array position, and no rung
 * returns an inactive user.
 *
 * Pure, and reports rather than logs, so the caller owns log volume and phrasing.
 *
 * @param candidate  the configured value; blank/undefined means "no preference", not an error
 * @param users      the candidate pool, normally `UserCache.Users`
 * @param systemUserId the deployment's system user ID (`UserCache.Instance.SYSTEM_USER_ID`)
 */
export function resolvePrincipalFrom<T extends ResolvablePrincipal>(
    candidate: string | undefined,
    users: readonly T[],
    systemUserId: string,
): PrincipalResolution<T> {
    if (!Array.isArray(users)) {
        throw new Error('resolvePrincipalFrom requires a user array; received ' + typeof users);
    }
    if (!systemUserId) {
        throw new Error('resolvePrincipalFrom requires a system user ID to fall back to');
    }

    const wanted = normalize(candidate);

    if (wanted) {
        const byName = lowestById(users.filter((u) => normalize(u.Name) === wanted));
        if (byName) {
            return { user: byName, reason: 'name' };
        }
        const byEmail = lowestById(users.filter((u) => normalize(u.Email) === wanted));
        if (byEmail) {
            return { user: byEmail, reason: 'email' };
        }
    }

    const fallback = resolveFallback(users, systemUserId);
    if (!wanted) {
        return fallback;
    }
    return {
        ...fallback,
        warning:
            `Configured user '${candidate}' matched no user's Name or Email; ` +
            `falling back to ${describeFallback(fallback.reason)}.`,
    };
}

/** The candidate-independent rungs: the system user, then the lowest-ID active Owner. */
function resolveFallback<T extends ResolvablePrincipal>(
    users: readonly T[],
    systemUserId: string,
): PrincipalResolution<T> {
    // `IsActive` here for the same reason as on the Owner rung below. Without it the guarantee
    // reads "we never act as a disabled user, except as the one user we reach first" — and this
    // change makes the system user the SHIPPED DEFAULT, so it is the rung most hosts land on.
    const system = users.find((u) => UUIDsEqual(u.ID, systemUserId) && u.IsActive === true);
    if (system) {
        return { user: system, reason: 'system' };
    }

    const owner = lowestById(users.filter((u) => u.IsActive === true && normalize(u.Type) === 'owner'));

    return owner ? { user: owner, reason: 'owner' } : { user: null, reason: 'none' };
}

/**
 * Misconfigurations already reported, keyed by purpose + candidate.
 *
 * A misconfigured setting is a static, boot-time fact, but the code that trips over it runs per
 * request — which is how issue #4209 turned one wrong config value into an error-level line on
 * every magic-link redeem. Saying it once per distinct problem keeps the diagnostic without
 * burying real errors underneath it.
 */
const reportedMisconfigurations = new Set<string>();

/**
 * Guard against unbounded growth if a caller ever passes a per-request candidate. Candidates come
 * from static config today, so the real cardinality is the number of settings (three); the cap
 * exists so a future dynamic caller degrades to logging every time rather than growing a set
 * forever. It never silently swallows — at the cap we log MORE, not less.
 */
const MAX_REPORTED_MISCONFIGURATIONS = 64;

/**
 * Resolves the principal named by a config setting, reading the process-wide user cache.
 *
 * The impure shell over {@link resolvePrincipalFrom}: it supplies the cache and owns log volume.
 *
 * @param candidate the configured value; blank/undefined means "no preference", not an error
 * @param purpose   short label for the setting being resolved (e.g. `'MagicLink'`), used both in
 *                  the operator-facing message and to key de-duplication
 * @returns the principal to act as, or null when this deployment offers none — callers MUST
 *          handle null rather than assume a principal is always available
 */
export function ResolveConfiguredPrincipal(candidate: string | undefined, purpose: string): UserInfo | null {
    const resolution = resolvePrincipalFrom(candidate, UserCache.Instance.Users, UserCache.Instance.SYSTEM_USER_ID);

    if (resolution.warning) {
        const key = `${purpose} :: ${candidate ?? ''}`;
        if (!reportedMisconfigurations.has(key)) {
            if (reportedMisconfigurations.size < MAX_REPORTED_MISCONFIGURATIONS) {
                reportedMisconfigurations.add(key);
            }
            LogError(`[${purpose}] ${resolution.warning}`);
        }
    }

    return resolution.user;
}

function describeFallback(reason: PrincipalResolutionReason): string {
    switch (reason) {
        case 'system':
            return 'the system user';
        case 'owner':
            return 'the lowest-ID active Owner';
        default:
            return 'no user at all — this deployment has neither a system user nor an active Owner';
    }
}
