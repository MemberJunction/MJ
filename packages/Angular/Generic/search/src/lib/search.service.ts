/**
 * @fileoverview Search service that connects to the UnifiedSearchService via GraphQL.
 *
 * Provides a reactive interface for executing searches, managing search history,
 * and transforming raw search responses into display-ready grouped results.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    SearchResultGroup,
    SearchFilter,
    SearchFilterOption
} from './search-types';

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
     * Execute a search request. Currently returns mock data;
     * will be connected to GraphQL UnifiedSearchService.
     */
    public async ExecuteSearch(request: SearchRequest): Promise<SearchResponse> {
        this.IsSearching$.next(true);
        const startTime = Date.now();

        try {
            // TODO: Replace with actual GraphQL call to UnifiedSearchService
            const response = await this.executeMockSearch(request);
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
     * Mock search implementation. Will be replaced by GraphQL calls.
     */
    private async executeMockSearch(request: SearchRequest): Promise<SearchResponse> {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 150));

        if (!request.Query.trim()) {
            return this.createEmptyResponse();
        }

        // Return empty results for now -- the real implementation
        // will call the GraphQL UnifiedSearchService
        return {
            Success: true,
            Results: [],
            Groups: [],
            Filters: [],
            TotalCount: 0,
            ElapsedMs: 0,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0 }
        };
    }
}
