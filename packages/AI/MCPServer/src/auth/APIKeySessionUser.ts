/**
 * @fileoverview The session user for an MCP request authenticated with an MJ API key.
 *
 * Mirrors what MJAPI does for a GraphQL request (packages/MJServer/src/context.ts): clone the
 * cached user, then stamp the key's row-filter bindings and its server-derived acting context on
 * the clone. Without this, a key that MJAPI restricts to certain rows reads every row through MCP.
 *
 * @module @memberjunction/ai-mcp-server/auth/APIKeySessionUser
 */

import { createHash, timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';
import type { APIKeyActingContext, UserInfo } from '@memberjunction/core';

/** What {@link BuildAPIKeySessionUser} needs; injected so it runs without MJServer or a database. */
export interface APIKeySessionUserDeps {
    /** MJServer's `CloneUserForSessionContext`. */
    CloneUser: (user: UserInfo) => UserInfo;
    /** `APIKeyEngine.GetRowFilterBindingsForKey`. Throws (fail closed) if the key cache is not loaded. */
    GetRowFilterBindingsForKey: (apiKeyId: string) => UserInfo['APIKeyRowFilters'];
    /** The deployment's registered acting-context resolver (MJServer's `GetAPIKeyActingContextResolver()`), if any. */
    ActingContextResolver:
        | ((req: IncomingMessage | undefined, user: UserInfo, apiKeyId: string) =>
            Promise<APIKeyActingContext | undefined> | APIKeyActingContext | undefined)
        | undefined;
}

/**
 * Returns a per-request clone of `cachedUser` carrying the key's row-filter bindings and acting
 * context. Never stamps `cachedUser` itself: it is the shared `UserCache` instance, and stamping it
 * would leak one key's restrictions (or lack of them) to every session of that user.
 */
export async function BuildAPIKeySessionUser(
    cachedUser: UserInfo,
    apiKeyId: string,
    request: IncomingMessage,
    deps: APIKeySessionUserDeps
): Promise<UserInfo> {
    if (!apiKeyId) {
        throw new Error('BuildAPIKeySessionUser requires the validated API key ID');
    }
    const user = deps.CloneUser(cachedUser);
    user.APIKeyRowFilters = deps.GetRowFilterBindingsForKey(apiKeyId);
    if (deps.ActingContextResolver) {
        user.APIKeyActingContext = (await deps.ActingContextResolver(request, user, apiKeyId)) ?? undefined;
    }
    return user;
}

/**
 * Compares a presented key with the configured system key in constant time. Both sides are hashed
 * to fixed-length digests first, so the comparison never short-circuits and never throws on a
 * length mismatch (the same approach as MJServer's system-key check). An unset or empty system key
 * matches nothing.
 */
export function SystemKeyMatches(presented: string, configured: string | undefined): boolean {
    if (!configured) {
        return false;
    }
    const a = createHash('sha256').update(presented).digest();
    const b = createHash('sha256').update(configured).digest();
    return timingSafeEqual(a, b);
}
