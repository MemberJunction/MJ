/**
 * Resolver for the `CurrentUserTenantContext` GraphQL query.
 *
 * Returns the server-set `TenantContext` for the authenticated user, serialized
 * as JSON so the client can auto-stamp `UserInfo.TenantContext`.
 *
 * **Resolution order:**
 * 1. Request-scoped context (`userPayload.__bcResolvedTenantContext`) — set by
 *    post-auth middleware on the per-request UserPayload. Immune to race conditions
 *    when concurrent requests share the same cached UserInfo object.
 * 2. Fallback to `userRecord.TenantContext` — for middleware that stamps UserInfo
 *    directly (vanilla MJ deployments or non-BCSaaS middleware).
 *
 * On the client, `GraphQLDataProvider.GetCurrentUser()` batches this query alongside
 * `CurrentUser` — making plugins stack-layer agnostic without any client-side code.
 *
 * Returns `null` when no middleware has set TenantContext (vanilla MJ deployment).
 */

import { Query, Resolver, Ctx } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';

/** Well-known key for request-scoped TenantContext on UserPayload */
const RESOLVED_TENANT_CONTEXT_KEY = '__bcResolvedTenantContext';

@Resolver()
export class CurrentUserContextResolver extends ResolverBase {
  @Query(() => GraphQLJSONObject, {
    nullable: true,
    description: 'Returns the server-set TenantContext for the authenticated user. Null when no tenant middleware is active.',
  })
  async CurrentUserTenantContext(
    @Ctx() context: AppContext
  ): Promise<Record<string, unknown> | null> {
    await this.CheckAPIKeyScopeAuthorization('user:read', '*', context.userPayload);

    // Prefer request-scoped context (set by BCSaaS middleware on userPayload).
    // This avoids race conditions with concurrent requests mutating the shared
    // UserInfo.TenantContext on the same cached UserInfo object from UserCache.
    const requestScoped = (context.userPayload as Record<string, unknown>)[RESOLVED_TENANT_CONTEXT_KEY];
    if (requestScoped && typeof requestScoped === 'object') {
      return { ...(requestScoped as Record<string, unknown>) };
    }

    // Fallback: read from the shared UserInfo (vanilla MJ / non-BCSaaS middleware)
    const userRecord = context.userPayload.userRecord;
    if (!userRecord?.TenantContext) {
      return null;
    }

    return { ...userRecord.TenantContext } as Record<string, unknown>;
  }
}
