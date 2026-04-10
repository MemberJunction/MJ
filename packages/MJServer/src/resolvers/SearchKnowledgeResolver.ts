import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float, InputType } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { SearchEngine } from '@memberjunction/search-engine';

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

            return {
                Success: result.Success,
                Results: result.Results.map(r => ({
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
                    RawMetadata: r.RawMetadata
                })),
                TotalCount: result.TotalCount,
                ElapsedMs: result.ElapsedMs,
                SourceCounts: {
                    Vector: result.SourceCounts['vector'] ?? result.SourceCounts['Vector'] ?? 0,
                    FullText: result.SourceCounts['fulltext'] ?? result.SourceCounts['FullText'] ?? 0,
                    Entity: result.SourceCounts['entity'] ?? result.SourceCounts['Entity'] ?? 0,
                    Storage: result.SourceCounts['storage'] ?? result.SourceCounts['Storage'] ?? 0
                },
                ErrorMessage: result.ErrorMessage
            };
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

            return {
                Success: result.Success,
                Results: result.Results.map(r => ({
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
                    RawMetadata: r.RawMetadata
                })),
                TotalCount: result.TotalCount,
                ElapsedMs: result.ElapsedMs,
                SourceCounts: {
                    Vector: result.SourceCounts['vector'] ?? 0,
                    FullText: result.SourceCounts['fulltext'] ?? 0,
                    Entity: result.SourceCounts['entity'] ?? 0,
                    Storage: result.SourceCounts['storage'] ?? 0
                },
                ErrorMessage: result.ErrorMessage
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PreviewSearch mutation failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    private errorResult(message: string, startTime: number): SearchKnowledgeResult {
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: Date.now() - startTime,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            ErrorMessage: message
        };
    }
}
