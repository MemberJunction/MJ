/**
 * Resolver for the `CurrentUserTenantContext` GraphQL query.
 *
 * Returns the server-set `TenantContext` from the authenticated user's `UserInfo`.
 * This is populated by post-auth middleware (e.g., BCSaaS's `bcTenantContextMiddleware`)
 * and serialized as JSON so the client can auto-stamp `UserInfo.TenantContext`.
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

    const userRecord = context.userPayload.userRecord;
    if (!userRecord?.TenantContext) {
      return null;
    }

    // Serialize the full TenantContext (which may be an extended type like BCTenantContext).
    // JSON serialization captures all enumerable properties including those from subtypes.
    return { ...userRecord.TenantContext } as Record<string, unknown>;
  }
}
