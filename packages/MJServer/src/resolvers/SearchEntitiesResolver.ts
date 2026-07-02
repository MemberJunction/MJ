import { Arg, Ctx, Field, Float, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { EntitySearchResult, SearchEntityParams } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { GetReadOnlyProvider } from '../util.js';

/**
 * GraphQL surface for {@link Metadata.Provider.SearchEntity} / `SearchEntities`.
 *
 * Both client forms ({@link GraphQLDataProvider.SearchEntity} and `SearchEntities`)
 * proxy through this single batched resolver — one HTTP round-trip carries N
 * per-entity searches in both directions. The actual ranking (lexical +
 * semantic + RRF blend + permission filter) runs server-side via
 * `GenericDatabaseProvider.SearchEntity`, fanned out concurrently across
 * the input list.
 *
 * Result groups are aligned by input order so the client can map them back
 * to the original `params[i]` slot without needing the entity name.
 */

@InputType()
export class SearchEntityInput {
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
export class EntitySearchResultGroupType {
    @Field(() => String)
    declare EntityName: string;

    @Field(() => [EntitySearchResultType])
    declare Results: EntitySearchResultType[];
}

@ObjectType()
export class SearchEntitiesResponseType {
    @Field(() => Boolean)
    declare Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => [EntitySearchResultGroupType])
    declare Groups: EntitySearchResultGroupType[];
}

/**
 * Per-request cap on how many entities a single `SearchEntities` call may
 * search. Each entity in the batch triggers 2–4 RunViews server-side; an
 * uncapped batch from a malicious or buggy client could fan out into
 * thousands of concurrent DB queries. 20 covers every realistic use case
 * (agent prompt seeding, multi-entity navbar search) with margin to spare.
 */
const MAX_SEARCH_ENTITIES_BATCH_SIZE = 20;

@Resolver(SearchEntitiesResponseType)
export class SearchEntitiesResolver {
    @Query(() => SearchEntitiesResponseType)
    async SearchEntities(
        @Ctx() { providers, userPayload }: AppContext,
        @Arg('params', () => [SearchEntityInput]) params: SearchEntityInput[]
    ): Promise<SearchEntitiesResponseType> {
        try {
            if (params.length > MAX_SEARCH_ENTITIES_BATCH_SIZE) {
                return {
                    Success: false,
                    ErrorMessage: `Batch size ${params.length} exceeds the per-request cap of ${MAX_SEARCH_ENTITIES_BATCH_SIZE}. Split the request.`,
                    Groups: params.map(p => ({ EntityName: p.EntityName, Results: [] })),
                };
            }
            const md = GetReadOnlyProvider(providers);
            const user = UserCache.Instance.Users.find(
                (u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase()
            );
            if (!user) {
                return {
                    Success: false,
                    ErrorMessage: `User ${userPayload.email} not found`,
                    Groups: params.map(p => ({ EntityName: p.EntityName, Results: [] })),
                };
            }

            const callParams: SearchEntityParams[] = params.map(p => ({
                entityName: p.EntityName,
                searchText: p.SearchText,
                options: {
                    mode: p.Mode ?? 'hybrid',
                    rrfK: p.RrfK ?? undefined,
                    weights: {
                        lexical: p.LexicalWeight ?? undefined,
                        semantic: p.SemanticWeight ?? undefined,
                    },
                    topK: p.TopK ?? undefined,
                    minScore: p.MinScore ?? undefined,
                    entityDocumentId: p.EntityDocumentID ?? undefined,
                    contextUser: user,
                },
            }));

            // Server-side provider fans the batch out via Promise.all under the
            // hood — see ProviderBase.SearchEntities. Results arrive aligned by
            // input order; we just map each group's records to the GraphQL shape.
            const groupedResults: EntitySearchResult[][] = await md.SearchEntities(callParams);

            return {
                Success: true,
                Groups: groupedResults.map((results, i) => ({
                    EntityName: params[i].EntityName,
                    Results: results.map(r => ({
                        EntityRecordDocumentID: r.entityRecordDocumentId,
                        RecordID: r.recordId,
                        Score: r.score,
                        MatchType: r.matchType,
                        LexicalScore: r.components.lexical ?? null,
                        SemanticScore: r.components.semantic ?? null,
                    })),
                })),
            };
        } catch (e) {
            return {
                Success: false,
                ErrorMessage: e instanceof Error ? e.message : String(e),
                Groups: params.map(p => ({ EntityName: p.EntityName, Results: [] })),
            };
        }
    }
}
