import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float, InputType } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { SearchEngine, SearchResult as SearchEngineResult, SearchResultItem as SearchEngineResultItem, SearchProviderInfo } from '@memberjunction/search-engine';

/* ───── GraphQL types ───── */

@ObjectType()
export class SearchScoreBreakdown {
    @Field(() => Float, { nullable: true })
    Vector?: number;

    @Field(() => Float, { nullable: true })
    FullText?: number;

    @Field(() => Float, { nullable: true })
    Entity?: number;

    @Field(() => Float, { nullable: true })
    Storage?: number;
}

@ObjectType()
export class SearchKnowledgeResultItem {
    @Field()
    ID: string;

    @Field()
    EntityName: string;

    @Field()
    RecordID: string;

    @Field()
    SourceType: string;

    @Field()
    Title: string;

    @Field()
    Snippet: string;

    @Field(() => Float)
    Score: number;

    @Field(() => SearchScoreBreakdown)
    ScoreBreakdown: SearchScoreBreakdown;

    @Field(() => [String])
    Tags: string[];

    @Field({ nullable: true })
    EntityIcon?: string;

    @Field({ nullable: true })
    RecordName?: string;

    @Field()
    MatchedAt: Date;

    /** Raw vector metadata as JSON string — contains all entity fields stored in the vector DB */
    @Field({ nullable: true })
    RawMetadata?: string;

    /** Discriminator for UI rendering: 'entity-record', 'storage-file', or 'content-item' */
    @Field()
    ResultType: string;

    /** ID of the SearchProvider metadata record that produced this result */
    @Field({ nullable: true })
    ProviderId?: string;

    /** Display label from the SearchProvider metadata (e.g., "Database", "Semantic Search") */
    @Field({ nullable: true })
    ProviderLabel?: string;

    /** Font Awesome icon class from the SearchProvider metadata */
    @Field({ nullable: true })
    ProviderIcon?: string;
}

@ObjectType()
export class SearchSourceCounts {
    @Field()
    Vector: number;

    @Field()
    FullText: number;

    @Field()
    Entity: number;

    @Field()
    Storage: number;
}

@ObjectType()
export class SearchProviderInfoType {
    @Field()
    ID: string;

    @Field()
    Name: string;

    @Field()
    DisplayName: string;

    @Field()
    Icon: string;

    @Field()
    SourceType: string;

    @Field()
    Priority: number;
}

@ObjectType()
export class SearchKnowledgeResult {
    @Field()
    Success: boolean;

    @Field(() => [SearchKnowledgeResultItem])
    Results: SearchKnowledgeResultItem[];

    @Field()
    TotalCount: number;

    @Field()
    ElapsedMs: number;

    @Field(() => SearchSourceCounts)
    SourceCounts: SearchSourceCounts;

    @Field(() => [SearchProviderInfoType])
    Providers: SearchProviderInfoType[];

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@InputType()
export class SearchFiltersInput {
    @Field(() => [String], { nullable: true })
    EntityNames?: string[];

    @Field(() => [String], { nullable: true })
    SourceTypes?: string[];

    @Field(() => [String], { nullable: true })
    Tags?: string[];
}

/* ───── Resolver (thin wrapper around SearchEngine) ───── */

@Resolver()
export class SearchKnowledgeResolver extends ResolverBase {

    @Mutation(() => SearchKnowledgeResult)
    async SearchKnowledge(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true }) maxResults: number | undefined,
        @Arg('filters', () => SearchFiltersInput, { nullable: true }) filters: SearchFiltersInput | undefined,
        @Arg('minScore', () => Float, { nullable: true }) minScore: number | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<SearchKnowledgeResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user', startTime);
            }

            const result = await SearchEngine.Instance.Search({
                Query: query,
                MaxResults: maxResults,
                MinScore: minScore,
                Filters: filters ? {
                    EntityNames: filters.EntityNames,
                    SourceTypes: filters.SourceTypes,
                    Tags: filters.Tags
                } : undefined
            }, currentUser);

            return this.mapSearchResult(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchKnowledge mutation failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    @Mutation(() => SearchKnowledgeResult)
    async PreviewSearch(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true, defaultValue: 8 }) maxResults: number,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<SearchKnowledgeResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user', startTime);
            }

            const result = await SearchEngine.Instance.PreviewSearch(query, maxResults, currentUser);

            return this.mapSearchResult(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PreviewSearch mutation failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    private mapSearchResult(result: SearchEngineResult): SearchKnowledgeResult {
        return {
            Success: result.Success,
            Results: result.Results.map((r: SearchEngineResultItem) => ({
                ID: r.ID,
                EntityName: r.EntityName,
                RecordID: r.RecordID,
                SourceType: r.SourceType,
                ResultType: r.ResultType,
                Title: r.Title,
                Snippet: r.Snippet,
                Score: r.Score,
                ScoreBreakdown: r.ScoreBreakdown as SearchScoreBreakdown,
                Tags: r.Tags || [],
                EntityIcon: r.EntityIcon,
                RecordName: r.RecordName,
                MatchedAt: r.MatchedAt,
                RawMetadata: r.RawMetadata,
                ProviderId: r.ProviderId,
                ProviderLabel: r.ProviderLabel,
                ProviderIcon: r.ProviderIcon,
            })),
            TotalCount: result.TotalCount,
            ElapsedMs: result.ElapsedMs,
            SourceCounts: {
                Vector: result.SourceCounts.Vector,
                FullText: result.SourceCounts.FullText,
                Entity: result.SourceCounts.Entity,
                Storage: result.SourceCounts.Storage,
            },
            Providers: (result.Providers || []).map((p: SearchProviderInfo) => ({
                ID: p.ID,
                Name: p.Name,
                DisplayName: p.DisplayName,
                Icon: p.Icon,
                SourceType: p.SourceType,
                Priority: p.Priority,
            })),
            ErrorMessage: result.ErrorMessage,
        };
    }

    private errorResult(message: string, startTime: number): SearchKnowledgeResult {
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: Date.now() - startTime,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            Providers: [],
            ErrorMessage: message
        };
    }
}
