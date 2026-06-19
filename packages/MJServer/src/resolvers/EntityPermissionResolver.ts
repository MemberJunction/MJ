import { Arg, Ctx, Field, ObjectType, Query, Resolver } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GetReadOnlyProvider } from '../util.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

@ObjectType()
class EntityPermissionResult {
    @Field(() => String)
    declare EntityName: string;

    @Field(() => Boolean)
    declare CanRead: boolean;
}

@ObjectType()
class CheckEntityPermissionsResult {
    @Field(() => Boolean)
    declare Success: boolean;

    @Field(() => [EntityPermissionResult])
    declare Results: EntityPermissionResult[];

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;
}

@Resolver()
export class EntityPermissionResolver extends ResolverBase {

    @RequireSystemUser()
    @Query(() => CheckEntityPermissionsResult)
    async CheckEntityPermissionsSystemUser(
        @Arg('EntityNames', () => [String]) entityNames: string[],
        @Arg('UserEmail', () => String) userEmail: string,
        @Ctx() context: AppContext
    ): Promise<CheckEntityPermissionsResult> {
        try {
            const user = UserCache.Instance.Users.find(
                u => u.Email.toLowerCase().trim() === userEmail.toLowerCase().trim()
            );
            if (!user) {
                return { Success: false, Results: [], ErrorMessage: `User not found: ${userEmail}` };
            }

            // Use the per-request provider (not the global default) so entity metadata + permission
            // evaluation resolve against the connection servicing THIS request.
            const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
            const results: EntityPermissionResult[] = [];

            for (const name of entityNames) {
                const entityInfo = md.EntityByName(name);
                if (!entityInfo) {
                    results.push({ EntityName: name, CanRead: false });
                    continue;
                }
                const perms = entityInfo.GetUserPermisions(user);
                results.push({ EntityName: name, CanRead: perms?.CanRead ?? false });
            }

            return { Success: true, Results: results };
        } catch (err) {
            LogError(err);
            return {
                Success: false,
                Results: [],
                ErrorMessage: `EntityPermissionResolver::CheckEntityPermissionsSystemUser --- ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }
}
