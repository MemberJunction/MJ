import { Arg, Ctx, Field, Float, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { EntitySearchResult, Metadata, SearchEntitiesOptions } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { GetReadOnlyProvider } from '../util.js';

/**
 * GraphQL surface for {@link Metadata.Provider.SearchEntities}. The client
 * (`GraphQLDataProvider.SearchEntities`) proxies one round-trip through this
 * resolver; the actual ranking (lexical + semantic + RRF blend + permission
 * filter) runs server-side via `GenericDatabaseProvider`.
 */

@InputType()
export class SearchEntitiesInput {
    @Field(() => String)
    declare EntityName: string;

    @Field(() => String)
    declare SearchText: string;

    @Field(() => String, { nullable: true })
    Mode?: 'lexical' | 'semantic' | 'hybrid';

    @Field(() => Int, { nullable: true })
    RrfK?: number;

    @Field(() => Float, { nullable: true })
    LexicalWeight?: number;

    @Field(() => Float, { nullable: true })
    SemanticWeight?: number;

    @Field(() => Int, { nullable: true })
    TopK?: number;

    @Field(() => Float, { nullable: true })
    MinScore?: number;

    @Field(() => String, { nullable: true })
    EntityDocumentID?: string;
}

@ObjectType()
export class EntitySearchResultType {
    @Field(() => String, { nullable: true })
    declare EntityRecordDocumentID: string | null;

    @Field(() => String)
    declare RecordID: string;

    @Field(() => Float)
    declare Score: number;

    @Field(() => String)
    declare MatchType: 'lexical' | 'semantic' | 'hybrid';

    @Field(() => Float, { nullable: true })
    LexicalScore?: number | null;

    @Field(() => Float, { nullable: true })
    SemanticScore?: number | null;
}

@ObjectType()
export class SearchEntitiesResponseType {
    @Field(() => Boolean)
    declare Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => [EntitySearchResultType])
    declare Results: EntitySearchResultType[];
}

@Resolver(SearchEntitiesResponseType)
export class SearchEntitiesResolver {
    @Query(() => SearchEntitiesResponseType)
    async SearchEntities(
        @Ctx() { providers, userPayload }: AppContext,
        @Arg('params') params: SearchEntitiesInput
    ): Promise<SearchEntitiesResponseType> {
        try {
            const md = GetReadOnlyProvider(providers);

            const user = UserCache.Instance.Users.find(
                (u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase()
            );
            if (!user) {
                return { Success: false, ErrorMessage: `User ${userPayload.email} not found`, Results: [] };
            }

            const options: SearchEntitiesOptions = {
                mode: params.Mode ?? 'hybrid',
                rrfK: params.RrfK ?? undefined,
                weights: {
                    lexical: params.LexicalWeight ?? undefined,
                    semantic: params.SemanticWeight ?? undefined,
                },
                topK: params.TopK ?? undefined,
                minScore: params.MinScore ?? undefined,
                entityDocumentId: params.EntityDocumentID ?? undefined,
                contextUser: user,
            };

            const results: EntitySearchResult[] = await md.SearchEntities(
                params.EntityName,
                params.SearchText,
                options
            );

            return {
                Success: true,
                Results: results.map(r => ({
                    EntityRecordDocumentID: r.entityRecordDocumentId,
                    RecordID: r.recordId,
                    Score: r.score,
                    MatchType: r.matchType,
                    LexicalScore: r.components.lexical ?? null,
                    SemanticScore: r.components.semantic ?? null,
                })),
            };
        } catch (e) {
            return {
                Success: false,
                ErrorMessage: e instanceof Error ? e.message : String(e),
                Results: [],
            };
        }
    }
}
