import { UserInfo } from '@memberjunction/core';

/**
 * True when a session's read authority is deliberately narrower than the role grant it
 * authenticates with — i.e. the principal is confined by per-session scope rather than by
 * its roles alone.
 *
 * Two such principals exist today, both from the magic-link surface:
 *
 * - **Anonymous magic-link guests** (`IsMagicLinkAnonymous`) authenticate as the *shared*
 *   Anonymous principal, so their role grant is common to every guest. What separates one
 *   guest from another is not the role — it is the per-session scope.
 * - **Resource-scoped magic-link sessions** (`MagicLinkScope`) hold a normal role, pinned to
 *   one shared resource (and its FK-reachable dependents) for the life of the session.
 *
 * In both cases the confinement is expressed as row-level-security filter tokens
 * (`{{ScopeResourceID}}` / `{{ScopeResourceType}}`) that the entity-read path substitutes.
 * That means the confinement only exists on code paths that go **through** entity
 * permissions and RLS — `RunView`, `BaseEntity`, the generated resolvers. Any path that
 * reaches the database *around* those layers (raw SQL on the read-only pool, for instance)
 * sees no scope at all, so such a path must refuse these principals outright rather than
 * assume a filter it never applies.
 *
 * Callers should treat a `true` result as "not permitted here", never as "apply a narrower
 * filter" — a caller that could narrow correctly would not need this predicate.
 *
 * @param user the principal to classify. A missing principal returns `true`: an
 *        unidentifiable session is the one case where the scope certainly cannot be
 *        established, so it fails closed.
 * @returns `true` when the principal is scope-limited (or unidentifiable), else `false`.
 *
 * @example
 * ```typescript
 * if (IsScopeLimitedPrincipal(context.userPayload?.userRecord)) {
 *     return this.buildErrorResult('Not permitted for scope-limited sessions.');
 * }
 * ```
 */
export function IsScopeLimitedPrincipal(user: UserInfo | undefined | null): boolean {
    if (!user) {
        return true; // no identifiable principal — fail closed
    }
    if (user.IsMagicLinkAnonymous) {
        return true;
    }
    const scope = user.MagicLinkScope;
    // An empty scope object carries no confinement; only a populated one does. (Truthiness
    // of the object alone would classify `{}` as scoped and lock out a session that is not.)
    return !!(scope?.ResourceID || scope?.ResourceType);
}
