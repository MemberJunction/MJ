import { LogError, UserInfo } from '@memberjunction/core';
import { MJLruCache, UUIDsEqual } from '@memberjunction/global';
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
 *
 * Two exports, cased to tell them apart on sight: `ResolveConfiguredPrincipal` is the shell callers
 * use (PascalCase, like the rest of MJServer's public surface), and `resolvePrincipalFrom` is the
 * pure core it wraps — same ladder, no cache, no logging, which is what makes the ladder testable
 * without a singleton or a database. The casing is the signal, not an oversight.
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
 * The lowest-ID ACTIVE match, or undefined when there is none.
 *
 * Every rung that can match more than one user resolves through this, so it carries BOTH of the
 * ladder's cross-cutting guarantees in one place instead of restating them per rung. Stating them
 * per rung is how the `Name` and `Email` rungs came to be missing the second one while
 * {@link resolvePrincipalFrom}'s own docstring claimed all four rungs had it.
 *
 * DETERMINISM. Ties go to the lowest ID rather than the first match. `UserCache.Users`
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
 *
 * ACTIVE ONLY. A deactivated user is never a candidate, on any rung. The server acting as a
 * disabled account is the failure this exists to prevent, and it is not less of one because an
 * operator named that account in config — a setting outlives the person it names.
 */
function lowestActiveById<T extends ResolvablePrincipal>(matches: readonly T[]): T | undefined {
    let lowest: T | undefined;
    for (const match of matches) {
        if (match.IsActive !== true) {
            continue;
        }
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
 *               than a semantic one. ACTIVE only, which is that compatibility claim's one
 *               deliberate exception: a host whose setting names a DEACTIVATED user stops
 *               resolving to them. That is the point, not a casualty — see below.
 *  2. `Email` — the identity column everywhere else in MJServer, and the only one the schema
 *               makes unique (`UQ_User_Email`). This is the rung that resolves MJ's own default.
 *               ACTIVE only, for the same reason.
 *  3. System  — by ID, so it survives the system user being renamed. ACTIVE only.
 *  4. Owner   — lowest ID among ACTIVE owners. A last resort, but still deterministic: the
 *               previous "first Owner in cache order" made `CreatedByUserID` depend on the order
 *               `SELECT * FROM vwUsers` happened to return, which is unstable across boots and
 *               within a process.
 *
 * Every rung breaks ties by lowest ID ({@link lowestActiveById}), never by array position, and no rung
 * returns an inactive user — the configured rungs included. An operator naming a user in config
 * is the likeliest way to end up pointed at a disabled account (the admin whose address is in the
 * setting leaves, and their account is deactivated), and honouring it would mean the server keeps
 * provisioning as someone who no longer works there, silently and indefinitely. A guarantee that
 * every rung holds except the two anyone actually configures is not a guarantee.
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
        const byName = lowestActiveById(users.filter((u) => normalize(u.Name) === wanted));
        if (byName) {
            return { user: byName, reason: 'name' };
        }
        // Reached when `Name` matched nobody USABLE, which includes matching only deactivated
        // rows: an inactive `Name` holder must not shadow an active `Email` holder. The ladder is
        // looking for the user this string names, and an unusable match is not a reason to stop.
        const byEmail = lowestActiveById(users.filter((u) => normalize(u.Email) === wanted));
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
            `Configured user '${candidate}' ${describeMiss(users, wanted)}; ` +
            `falling back to ${describeFallback(fallback.reason)}.`,
    };
}

/**
 * Why a configured candidate yielded nothing. The two causes need opposite fixes, so the message
 * has to tell them apart: "no such user" is a typo or the wrong column, while "matched, but
 * deactivated" is a correctly spelled setting pointing at a disabled account. Reporting the second
 * as the first sends the operator hunting for a typo in a value that is spelled right.
 *
 * Runs only once the configured rungs have already missed, so the extra pass is off the happy path.
 */
function describeMiss<T extends ResolvablePrincipal>(users: readonly T[], wanted: string): string {
    const matchedButInactive = users.some((u) => normalize(u.Name) === wanted || normalize(u.Email) === wanted);
    return matchedButInactive ? 'matched only INACTIVE users' : "matched no user's Name or Email";
}

/** The candidate-independent rungs: the system user, then the lowest-ID active Owner. */
function resolveFallback<T extends ResolvablePrincipal>(
    users: readonly T[],
    systemUserId: string,
): PrincipalResolution<T> {
    // The one rung that states `IsActive` for itself: a lookup by ID matches at most one row, so
    // there is no tie to break and nothing to route through `lowestActiveById`. It still needs the
    // guard — this change makes the system user the SHIPPED DEFAULT, so it is the rung most hosts
    // land on, and a host that deactivates it must fail loudly rather than act as it.
    const system = users.find((u) => UUIDsEqual(u.ID, systemUserId) && u.IsActive === true);
    if (system) {
        return { user: system, reason: 'system' };
    }

    const owner = lowestActiveById(users.filter((u) => normalize(u.Type) === 'owner'));

    return owner ? { user: owner, reason: 'owner' } : { user: null, reason: 'none' };
}

/**
 * How many distinct `purpose :: candidate` problems the tracker below remembers at once.
 *
 * Candidates come from static config today, so the real cardinality is the number of settings
 * (three) and this is never approached. It is published so the bound is testable rather than
 * discovered.
 */
export const MAX_REPORTED_MISCONFIGURATIONS = 64;

/**
 * Misconfigurations already reported, keyed by purpose + candidate.
 *
 * A misconfigured setting is a static, boot-time fact, but the code that trips over it runs per
 * request — which is how issue #4209 turned one wrong config value into an error-level line on
 * every magic-link redeem. Saying it once per distinct problem keeps the diagnostic without
 * burying real errors underneath it.
 *
 * An LRU rather than a `Set` + cap, because the two differ exactly where it matters. A capped
 * `Set` stops admitting once it is full, so every candidate seen after that logs on EVERY call —
 * which is #4209's per-request error line, reintroduced for precisely the dynamic caller the cap
 * was added to defend against. The LRU bounds memory the same way but keeps de-duplicating: the
 * worst case is one repeated line after a cold key ages out, not a permanent flood.
 */
const reportedMisconfigurations = new MJLruCache<string, true>({ maxSize: MAX_REPORTED_MISCONFIGURATIONS });

/** Entries the tracker currently holds. Exists so the bound above can be asserted, not inferred. */
export function ReportedMisconfigurationCount(): number {
    return reportedMisconfigurations.Size;
}

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
        // `Get` rather than `Has`: it refreshes recency, so a setting that keeps being hit stays
        // suppressed and it is the settings nobody asks about any more that age out first.
        if (reportedMisconfigurations.Get(key) === undefined) {
            reportedMisconfigurations.Set(key, true);
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
