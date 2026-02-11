import { EntityInfo, IEntityDataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { Arg, Ctx, Field, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { GetReadOnlyProvider } from '../util.js';

/**
 * Result type for the IS-A child entity discovery query.
 * Returns the name of the child entity type that has a record matching
 * the given parent entity's primary key, or null if no child exists.
 */
@ObjectType()
export class ISAChildEntityResult {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    ChildEntityName?: string;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;
}

/**
 * Resolver for IS-A entity hierarchy discovery.
 *
 * Provides a GraphQL endpoint for client-side code to discover child entity
 * records in an IS-A hierarchy. This enables bidirectional chain construction
 * where a loaded entity discovers its more-derived child type.
 */
@Resolver(ISAChildEntityResult)
export class ISAEntityResolver {
    /**
     * Discovers which IS-A child entity, if any, has a record with the given
     * primary key value. The server executes a single UNION ALL query across
     * all child entity tables for maximum efficiency.
     *
     * @param EntityName The parent entity name to check children for
     * @param RecordID The primary key value to search for in child tables
     * @returns The child entity name if found, or null with Success=true if no child exists
     */
    @Query(() => ISAChildEntityResult)
    async FindISAChildEntity(
        @Arg('EntityName', () => String) EntityName: string,
        @Arg('RecordID', () => String) RecordID: string,
        @Ctx() { providers, userPayload }: AppContext
    ): Promise<ISAChildEntityResult> {
        try {
            const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
            const md = new Metadata();
            const entityInfo = md.Entities.find(e => e.Name === EntityName);

            if (!entityInfo) {
                return {
                    Success: false,
                    ErrorMessage: `Entity '${EntityName}' not found`
                };
            }

            if (!entityInfo.IsParentType) {
                return { Success: true };
            }

            // Cast to IEntityDataProvider to access the optional FindISAChildEntity method
            const entityProvider = provider as unknown as IEntityDataProvider;
            if (!entityProvider.FindISAChildEntity) {
                return {
                    Success: false,
                    ErrorMessage: 'Provider does not support FindISAChildEntity'
                };
            }

            const result = await entityProvider.FindISAChildEntity(
                entityInfo,
                RecordID,
                userPayload?.userRecord
            );

            if (result) {
                return {
                    Success: true,
                    ChildEntityName: result.ChildEntityName
                };
            }

            return { Success: true };
        }
        catch (e) {
            return {
                Success: false,
                ErrorMessage: e instanceof Error ? e.message : String(e)
            };
        }
    }
}

export default ISAEntityResolver;
