import { Resolver, Mutation, Arg, Ctx, Float } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { SearchEngine, SearchResult as SearchEngineResult, SearchResultItem as SearchEngineResultItem, SearchProviderInfo } from '@memberjunction/search-engine';
import {
    SearchKnowledgeResult,
    SearchKnowledgeResultItem,
    SearchScoreBreakdown,
    SearchFiltersInput
} from './SearchKnowledgeResolver.js';

/**
 * System-user-only resolver for search operations. Mirrors {@link SearchKnowledgeResolver}
 * but is gated by the `@RequireSystemUser` directive so that server-to-server callers
 * (e.g. Skip-Brain's `RemoteMJUtilities`) can invoke search without a user JWT.
 *
 * Both mutations delegate directly to `SearchEngine.Instance` — the same singleton
 * the user-context resolver uses — so behavior, scoring, and permission filtering
 * are identical.
 */
@Resolver()
export class SearchKnowledgeSystemUserResolver extends ResolverBase {

    @RequireSystemUser()
    @Mutation(() => SearchKnowledgeResult)
    async SearchKnowledgeAsSystemUser(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true }) maxResults: number | undefined,
        @Arg('filters', () => SearchFiltersInput, { nullable: true }) filters: SearchFiltersInput | undefined,
        @Arg('minScore', () => Float, { nullable: true }) minScore: number | undefined,
        @Ctx() context: AppContext
    ): Promise<SearchKnowledgeResult> {
        const startTime = Date.now();
        try {
            const currentUser = context.userPayload.userRecord;
            if (!currentUser) {
                return this.errorResult('Unable to determine system user', startTime);
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
            LogError(`SearchKnowledgeAsSystemUser mutation failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    @RequireSystemUser()
    @Mutation(() => SearchKnowledgeResult)
    async PreviewSearchAsSystemUser(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true, defaultValue: 8 }) maxResults: number,
        @Ctx() context: AppContext
    ): Promise<SearchKnowledgeResult> {
        const startTime = Date.now();
        try {
            const currentUser = context.userPayload.userRecord;
            if (!currentUser) {
                return this.errorResult('Unable to determine system user', startTime);
            }

            const result = await SearchEngine.Instance.PreviewSearch(query, maxResults, currentUser);

            return this.mapSearchResult(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PreviewSearchAsSystemUser mutation failed: ${msg}`);
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
