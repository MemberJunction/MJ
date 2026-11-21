/**
 * The API-key scope check a transport runs for one request.
 * @module @memberjunction/server
 */

import { AuthorizationError } from 'type-graphql';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

/** Where a request arrived, recorded in the API key usage log. */
type APIKeyScopeRequestContext = {
    endpoint: string;
    method: string;
    ipAddress?: string | null;
    userAgent?: string | null;
};

/**
 * The API-key scope check for one request, shared by every MJAPI transport (GraphQL resolvers
 * and the REST routes) so they cannot disagree on what a key may do.
 *
 * - A session that did not authenticate with an API key (no key hash) is not checked.
 * - A key holding `full_access` passes without a specific scope.
 * - Otherwise the key needs `scopePath` on `resource`.
 *
 * The lookups (the key, its scope rules, the usage log) run as the SYSTEM user: the key's own
 * user often cannot read `MJ: API Keys`, and looking the key up as that user would report a valid
 * key as not found. The key's user is still the ceiling for the operation itself, which runs as
 * that user afterwards.
 *
 * @param sessionUser - the request's user; its server-stamped acting context lets a filtered
 *   rule with `{{Acting*}}` tokens validate, and without it such a rule fails closed
 * @throws AuthorizationError when the key lacks the scope
 */
export async function AssertAPIKeyScopeForRequest(
    apiKeyHash: string | undefined,
    scopePath: string,
    resource: string,
    sessionUser: UserInfo | undefined,
    requestContext: APIKeyScopeRequestContext
): Promise<void> {
    if (!apiKeyHash) {
        return;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        throw new Error('System user not found');
    }
    const apiKeyEngine = GetAPIKeyEngine();

    // A probe, not the decision: left out of the usage log so expected misses do not fill it.
    const fullAccess = await apiKeyEngine.Authorize(
        apiKeyHash, 'MJAPI', 'full_access', '*', systemUser, requestContext, { skipLogging: true }
    );
    if (fullAccess.Allowed) {
        return;
    }

    const result = await apiKeyEngine.Authorize(
        apiKeyHash, 'MJAPI', scopePath, resource, systemUser, requestContext,
        { actingContext: sessionUser?.APIKeyActingContext }
    );
    if (!result.Allowed) {
        throw new AuthorizationError(
            `Access denied. This API key requires the '${scopePath}' scope ` +
            `for resource '${resource}' to perform this operation. ` +
            `Please update the API key's scopes or use an API key with appropriate permissions. ` +
            `Denial reason: ${result.Reason}`
        );
    }
}
