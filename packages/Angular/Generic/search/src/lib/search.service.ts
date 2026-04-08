/**
 * @fileoverview Search service that connects to the UnifiedSearchService via GraphQL.
 *
 * Provides a reactive interface for executing searches, managing search history,
 * and transforming raw search responses into display-ready grouped results.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Metadata } from '@memberjunction/core';
import {
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    SearchResultGroup,
    SearchFilter,
    SearchFilterOption
} from './search-types';

/** Default minimum relevance score threshold (0-1). Results below this are filtered out. */
const DEFAULT_MIN_SCORE = 0.35;

/** Default icon mapping for source types */
const SOURCE_TYPE_ICONS: Record<string, string> = {
    'entity': 'fa-solid fa-database',
    'content-item': 'fa-solid fa-file-lines',
    'file': 'fa-solid fa-file',
    'web-page': 'fa-solid fa-globe',
};

/** Default labels for source types */
const SOURCE_TYPE_LABELS: Record<string, string> = {
    'entity': 'Entity Records',
    'content-item': 'Content Items',
    'file': 'Documents',
    'web-page': 'Web Pages',
};

/** Recent search entry for history */
export interface RecentSearch {
    Query: string;
    Timestamp: Date;
    ResultCount: number;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
    /** Current search response */
    public SearchResults$ = new BehaviorSubject<SearchResponse | null>(null);

    /** Whether a search is in progress */
    public IsSearching$ = new BehaviorSubject<boolean>(false);

    /** Recent search history (kept in memory, max 20 entries) */
    public RecentSearches$ = new BehaviorSubject<RecentSearch[]>([]);

    /** Error stream */
    public Errors$ = new Subject<string>();

    private readonly maxRecentSearches = 20;

    /**
     * Execute a search request via the SearchKnowledge GraphQL mutation.
     */
    public async ExecuteSearch(request: SearchRequest): Promise<SearchResponse> {
        this.IsSearching$.next(true);
        const startTime = Date.now();

        try {
            const response = await this.executeGraphQLSearch(request);
            response.ElapsedMs = Date.now() - startTime;

            this.SearchResults$.next(response);
            this.addToRecentSearches(request.Query, response.TotalCount);

            return response;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Search failed';
            this.Errors$.next(errorMessage);
            const errorResponse = this.createEmptyResponse(errorMessage);
            this.SearchResults$.next(errorResponse);
            return errorResponse;
        } finally {
            this.IsSearching$.next(false);
        }
    }

    /** Clear the current search results */
    public ClearResults(): void {
        this.SearchResults$.next(null);
    }

    /** Clear recent search history */
    public ClearRecentSearches(): void {
        this.RecentSearches$.next([]);
    }

    /**
     * Group flat results by source type for display.
     */
    public GroupResults(results: SearchResultItem[]): SearchResultGroup[] {
        const groupMap = new Map<string, SearchResultItem[]>();

        for (const result of results) {
            const key = result.SourceType;
            const existing = groupMap.get(key);
            if (existing) {
                existing.push(result);
            } else {
                groupMap.set(key, [result]);
            }
        }

        return Array.from(groupMap.entries()).map(([sourceType, items]) => ({
            Label: SOURCE_TYPE_LABELS[sourceType] ?? sourceType,
            Icon: SOURCE_TYPE_ICONS[sourceType] ?? 'fa-solid fa-circle',
            SourceType: sourceType,
            Results: items,
            TotalCount: items.length
        }));
    }

    /**
     * Build filter facets from a set of results.
     */
    public BuildFilters(results: SearchResultItem[]): SearchFilter[] {
        return [
            this.buildSourceTypeFilter(results),
            this.buildEntityNameFilter(results),
            this.buildTagFilter(results)
        ];
    }

    /** Get the icon for a given source type */
    public GetSourceIcon(sourceType: string): string {
        return SOURCE_TYPE_ICONS[sourceType] ?? 'fa-solid fa-circle';
    }

    private buildSourceTypeFilter(results: SearchResultItem[]): SearchFilter {
        const counts = new Map<string, number>();
        for (const r of results) {
            counts.set(r.SourceType, (counts.get(r.SourceType) ?? 0) + 1);
        }
        const options: SearchFilterOption[] = Array.from(counts.entries()).map(([type, count]) => ({
            Label: SOURCE_TYPE_LABELS[type] ?? type,
            Value: type,
            Count: count,
            IsSelected: false,
            Icon: SOURCE_TYPE_ICONS[type]
        }));
        return { Category: 'Source Type', Options: options, MultiSelect: true };
    }

    private buildEntityNameFilter(results: SearchResultItem[]): SearchFilter {
        const counts = new Map<string, number>();
        for (const r of results) {
            counts.set(r.EntityName, (counts.get(r.EntityName) ?? 0) + 1);
        }
        const options: SearchFilterOption[] = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({
                Label: name,
                Value: name,
                Count: count,
                IsSelected: false,
                Icon: 'fa-solid fa-table'
            }));
        return { Category: 'Entity', Options: options, MultiSelect: true };
    }

    private buildTagFilter(results: SearchResultItem[]): SearchFilter {
        const counts = new Map<string, number>();
        for (const r of results) {
            for (const tag of r.Tags) {
                counts.set(tag, (counts.get(tag) ?? 0) + 1);
            }
        }
        const options: SearchFilterOption[] = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([tag, count]) => ({
                Label: tag,
                Value: tag,
                Count: count,
                IsSelected: false,
                Icon: 'fa-solid fa-tag'
            }));
        return { Category: 'Tags', Options: options, MultiSelect: true };
    }

    private addToRecentSearches(query: string, resultCount: number): void {
        const current = this.RecentSearches$.value;
        const filtered = current.filter(s => s.Query !== query);
        const updated = [
            { Query: query, Timestamp: new Date(), ResultCount: resultCount },
            ...filtered
        ].slice(0, this.maxRecentSearches);
        this.RecentSearches$.next(updated);
    }

    private createEmptyResponse(errorMessage?: string): SearchResponse {
        return {
            Success: !errorMessage,
            Results: [],
            Groups: [],
            Filters: [],
            TotalCount: 0,
            ElapsedMs: 0,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0 },
            ErrorMessage: errorMessage
        };
    }

    /**
     * Execute search via the SearchKnowledge GraphQL mutation.
     */
    private async executeGraphQLSearch(request: SearchRequest): Promise<SearchResponse> {
        if (!request.Query.trim()) {
            return this.createEmptyResponse();
        }

        const provider = Metadata.Provider as { ExecuteGQL?: (query: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>> };
        if (!provider?.ExecuteGQL) {
            return this.createEmptyResponse('GraphQL provider not available');
        }

        const mutation = `
            mutation SearchKnowledge($query: String!, $maxResults: Float, $filters: SearchFiltersInput, $minScore: Float) {
                SearchKnowledge(query: $query, maxResults: $maxResults, filters: $filters, minScore: $minScore) {
                    Success
                    TotalCount
                    ElapsedMs
                    ErrorMessage
                    SourceCounts {
                        Vector
                        FullText
                        Entity
                    }
                    Results {
                        ID
                        EntityName
                        RecordID
                        SourceType
                        Title
                        Snippet
                        Score
                        ScoreBreakdown {
                            Vector
                            FullText
                            Entity
                        }
                        Tags
                        EntityIcon
                        RecordName
                        MatchedAt
                        RawMetadata
                    }
                }
            }
        `;

        const filtersInput = this.buildFiltersInput(request);
        const minScore = request.MinScore ?? DEFAULT_MIN_SCORE;
        const variables: Record<string, unknown> = {
            query: request.Query,
            maxResults: request.MaxResults || 20,
            filters: filtersInput,
            minScore: minScore > 0 ? minScore : undefined,
        };

        const gqlResult = await provider.ExecuteGQL(mutation, variables);
        const data = (gqlResult as Record<string, unknown>)['SearchKnowledge'] as {
            Success: boolean;
            Results: Array<{
                ID: string; EntityName: string; RecordID: string; SourceType: string;
                Title: string; Snippet: string; Score: number;
                ScoreBreakdown: { Vector?: number; FullText?: number; Entity?: number };
                Tags: string[]; EntityIcon?: string; RecordName?: string; MatchedAt: string; RawMetadata?: string;
            }>;
            TotalCount: number;
            ElapsedMs: number;
            SourceCounts: { Vector: number; FullText: number; Entity: number };
            ErrorMessage?: string;
        };

        if (!data?.Success) {
            return this.createEmptyResponse(data?.ErrorMessage ?? 'Search failed');
        }

        const results: SearchResultItem[] = (data.Results ?? []).map(r => ({
            ID: r.ID,
            Title: r.RecordName || r.Title,
            Snippet: r.Snippet,
            EntityName: r.EntityName,
            RecordID: r.RecordID,
            SourceType: (r.SourceType as SearchResultItem['SourceType']) || 'entity',
            Score: r.Score,
            ScoreBreakdown: r.ScoreBreakdown ?? {},
            Tags: r.Tags ?? [],
            SourceIcon: r.EntityIcon || SOURCE_TYPE_ICONS[r.SourceType] || 'fa-solid fa-database',
            EntityIcon: r.EntityIcon,
            RecordName: r.RecordName,
            MatchedAt: new Date(r.MatchedAt),
            RawMetadata: r.RawMetadata,
        }));

        const groups = this.GroupResults(results);
        const filters = this.BuildFilters(results);

        return {
            Success: true,
            Results: results,
            Groups: groups,
            Filters: filters,
            TotalCount: data.TotalCount,
            ElapsedMs: data.ElapsedMs,
            SourceCounts: data.SourceCounts,
        };
    }

    /** Build the GraphQL filters input from active filter selections */
    private buildFiltersInput(request: SearchRequest): { EntityNames?: string[]; SourceTypes?: string[]; Tags?: string[] } | null {
        if (!request.ActiveFilters || Object.keys(request.ActiveFilters).length === 0) {
            return null;
        }

        const result: { EntityNames?: string[]; SourceTypes?: string[]; Tags?: string[] } = {};

        const entityFilters = request.ActiveFilters['Entity'];
        if (entityFilters?.length) {
            result.EntityNames = entityFilters;
        }

        const sourceFilters = request.ActiveFilters['Source Type'];
        if (sourceFilters?.length) {
            result.SourceTypes = sourceFilters;
        }

        const tagFilters = request.ActiveFilters['Tags'];
        if (tagFilters?.length) {
            result.Tags = tagFilters;
        }

        return Object.keys(result).length > 0 ? result : null;
    }
}
