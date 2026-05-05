/**
 * @fileoverview Search service that connects to the UnifiedSearchService via GraphQL.
 *
 * Provides a reactive interface for executing searches, managing search history,
 * and transforming raw search responses into display-ready grouped results.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { IMetadataProvider, Metadata, StartupManager } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import {
    GraphQLSearchClient,
    GraphQLDataProvider,
    SearchClientResponse,
    SearchClientResultItem
} from '@memberjunction/graphql-dataprovider';
import {
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    SearchResultGroup,
    SearchFilter,
    SearchFilterOption,
    SearchProviderInfo,
    SearchScopeInfo
} from './search-types';

/** Default minimum relevance score threshold (0-1). Results below this are filtered out. */
const DEFAULT_MIN_SCORE = 0.35;

/** Fallback icon mapping for source types (used when provider metadata is not available) */
const FALLBACK_SOURCE_ICONS: Record<string, string> = {
    'entity': 'fa-solid fa-database',
    'vector': 'fa-solid fa-brain',
    'fulltext': 'fa-solid fa-magnifying-glass',
    'content-item': 'fa-solid fa-file-lines',
    'file': 'fa-solid fa-file',
    'web-page': 'fa-solid fa-globe',
    'storage': 'fa-solid fa-folder-open',
};

/** Fallback labels for source types (used when provider metadata is not available) */
const FALLBACK_SOURCE_LABELS: Record<string, string> = {
    'entity': 'Database',
    'vector': 'Semantic Search',
    'fulltext': 'Full-Text Search',
    'content-item': 'Content Items',
    'file': 'Documents',
    'web-page': 'Web Pages',
    'storage': 'File Storage',
};

/** User setting key for persisting recent searches */
const RECENT_SEARCHES_KEY = 'search.recentSearches';

/** Recent search entry for history */
export interface RecentSearch {
    Query: string;
    Timestamp: Date;
    ResultCount: number;
}

/** JSON-safe shape for persistence (Date → ISO string) */
interface RecentSearchJson {
    Query: string;
    Timestamp: string;
    ResultCount: number;
}

/**
 * Multi-provider note: callers under a non-default provider should set
 * `service.Provider = component.ProviderToUse` before invoking any methods.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
    private _provider: IMetadataProvider | null = null;
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    /** Current search response */
    public SearchResults$ = new BehaviorSubject<SearchResponse | null>(null);

    /** Whether a search is in progress */
    public IsSearching$ = new BehaviorSubject<boolean>(false);

    /** Recent search history (persisted via UserInfoEngine, max 20 entries) */
    public RecentSearches$ = new BehaviorSubject<RecentSearch[]>([]);

    /** Error stream */
    public Errors$ = new Subject<string>();

    private readonly maxRecentSearches = 20;
    private recentSearchesLoaded = false;

    /** Cached provider metadata keyed by SourceType, populated from search responses */
    private providersBySourceType = new Map<string, SearchProviderInfo>();

    /** Cached list of scopes the current user can see. Populated lazily by `LoadScopes()`. */
    public Scopes$ = new BehaviorSubject<SearchScopeInfo[]>([]);
    private scopesLoaded = false;
    private scopesLoadInFlight: Promise<SearchScopeInfo[]> | null = null;

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

    /**
     * Phase 2C streaming search. Returns an Observable that emits one
     * notification per provider as it returns, plus a 'fused' / 'reranked'
     * / 'final' terminal event. Same auth + permission behavior as
     * ExecuteSearch — denials surface as an error on the Observable.
     *
     * Consumers (typically the search composite component) should:
     *   - render skeleton rows immediately when the Observable is created
     *   - on each 'provider' event: append the rows for that source
     *   - on 'final': replace the partials with the canonical fused list
     *   - on error: show the failure message + clear the skeleton
     *
     * Returns rxjs Observable rather than awaiting a Promise — callers
     * decide whether to subscribe + populate state, or unsubscribe on
     * navigation. The service does NOT update its own SearchResults$
     * subject for streaming calls; the caller owns the partial-render
     * state model.
     */
    public StreamSearch(request: SearchRequest): Observable<{
        Phase: string;
        ProviderName?: string;
        Results?: SearchResultItem[];
        ElapsedMs?: number;
        ErrorMessage?: string;
    }> {
        const provider = Metadata.Provider;
        if (!(provider instanceof GraphQLDataProvider)) {
            return throwError(() => new Error('GraphQL provider not available'));
        }
        const client = new GraphQLSearchClient(provider);
        const filters = this.buildClientFilters(request);
        const minScore = request.MinScore ?? DEFAULT_MIN_SCORE;
        return client.StreamSearch({
            Query: request.Query,
            MaxResults: request.MaxResults || 20,
            MinScore: minScore > 0 ? minScore : undefined,
            Filters: filters,
            ScopeIDs: request.ScopeIDs && request.ScopeIDs.length > 0 ? request.ScopeIDs : undefined,
        }).pipe(map((ev) => ({
            Phase: ev.Phase,
            ProviderName: ev.ProviderName,
            Results: ev.Results ? ev.Results.map(r => this.mapClientResultItem(r)) : undefined,
            ElapsedMs: ev.ElapsedMs,
            ErrorMessage: ev.ErrorMessage,
        })));
    }

    /**
     * Lightweight preview search for autocomplete/typeahead.
     * Does NOT update SearchResults$ or IsSearching$ observables,
     * and does NOT add to recent search history.
     */
    public async PreviewSearch(query: string, maxResults: number = 8): Promise<SearchResponse> {
        try {
            if (!query.trim()) {
                return this.createEmptyResponse();
            }

            const provider = this.Provider;
            if (!(provider instanceof GraphQLDataProvider)) {
                return this.createEmptyResponse('GraphQL provider not available');
            }

            const client = new GraphQLSearchClient(provider);
            const clientResponse = await client.PreviewSearch(query, maxResults);
            return this.mapClientResponseToSearchResponse(clientResponse);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Preview search failed';
            return this.createEmptyResponse(errorMessage);
        }
    }

    /** Clear the current search results */
    public ClearResults(): void {
        this.SearchResults$.next(null);
    }

    /** Clear recent search history (memory and persisted) */
    public ClearRecentSearches(): void {
        this.RecentSearches$.next([]);
        this.persistRecentSearches([]);
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

        return Array.from(groupMap.entries()).map(([sourceType, items]) => {
            // Priority: cached provider metadata > per-result metadata > fallback maps
            const cached = this.providersBySourceType.get(sourceType);
            return {
                Label: cached?.DisplayName ?? items[0]?.ProviderLabel ?? FALLBACK_SOURCE_LABELS[sourceType] ?? sourceType,
                Icon: cached?.Icon ?? items[0]?.ProviderIcon ?? FALLBACK_SOURCE_ICONS[sourceType] ?? 'fa-solid fa-circle',
                SourceType: sourceType,
                Results: items,
                TotalCount: items.length
            };
        });
    }

    /**
     * Build filter facets from a set of results.
     */
    public BuildFilters(results: SearchResultItem[]): SearchFilter[] {
        return [
            this.buildSourceTypeFilter(results),
            this.buildEntityNameFilter(results),
            this.buildFileTypeFilter(results),
            this.buildTagFilter(results)
        ].filter(f => f.Options.length > 0); // Hide categories with no options
    }

    /** Get the icon for a given source type */
    public GetSourceIcon(sourceType: string): string {
        return this.providersBySourceType.get(sourceType)?.Icon ?? FALLBACK_SOURCE_ICONS[sourceType] ?? 'fa-solid fa-circle';
    }

    private buildSourceTypeFilter(results: SearchResultItem[]): SearchFilter {
        const counts = new Map<string, number>();
        for (const r of results) {
            counts.set(r.SourceType, (counts.get(r.SourceType) ?? 0) + 1);
        }
        const options: SearchFilterOption[] = Array.from(counts.entries()).map(([type, count]) => {
            const cached = this.providersBySourceType.get(type);
            return {
                Label: cached?.DisplayName ?? FALLBACK_SOURCE_LABELS[type] ?? type,
                Value: type,
                Count: count,
                IsSelected: false,
                Icon: cached?.Icon ?? FALLBACK_SOURCE_ICONS[type]
            };
        });
        return { Category: 'Source', Options: options, MultiSelect: true };
    }

    private buildEntityNameFilter(results: SearchResultItem[]): SearchFilter {
        const counts = new Map<string, number>();
        let fileCount = 0;
        for (const r of results) {
            if (r.ResultType === 'storage-file') {
                fileCount++;
            } else {
                counts.set(r.EntityName, (counts.get(r.EntityName) ?? 0) + 1);
            }
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

        // Add a single "Files" entry for all storage file results
        if (fileCount > 0) {
            options.push({
                Label: 'Files',
                Value: '__storage-files__',
                Count: fileCount,
                IsSelected: false,
                Icon: 'fa-solid fa-file'
            });
        }

        return { Category: 'Entity', Options: options, MultiSelect: true };
    }

    private buildFileTypeFilter(results: SearchResultItem[]): SearchFilter {
        const counts = new Map<string, number>();
        for (const r of results) {
            if (r.ResultType !== 'storage-file') continue;
            const ext = r.Title?.split('.').pop()?.toUpperCase();
            if (ext && ext.length <= 6) {
                counts.set(ext, (counts.get(ext) ?? 0) + 1);
            }
        }
        const options: SearchFilterOption[] = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([ext, count]) => ({
                Label: ext,
                Value: ext,
                Count: count,
                IsSelected: false,
                Icon: 'fa-solid fa-file'
            }));
        return { Category: 'File Type', Options: options, MultiSelect: true };
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

    /**
     * Load persisted recent searches from UserInfoEngine.
     * Safe to call multiple times — only loads once.
     */
    public async LoadRecentSearches(): Promise<void> {
        if (this.recentSearchesLoaded) return;

        try {
            MJGlobal.Instance.GetEventListener(true).subscribe(async (event) => {
                if (event.event === MJEventType.LoggedIn) {
                    await StartupManager.Instance.Startup();

                    const engine = UserInfoEngine.Instance;

                    const json = engine.GetSetting(RECENT_SEARCHES_KEY);

                    if (json) {
                        const parsed = JSON.parse(json) as RecentSearchJson[];
                        const searches: RecentSearch[] = parsed.map(s => ({
                            Query: s.Query,
                            Timestamp: new Date(s.Timestamp),
                            ResultCount: s.ResultCount
                        }));
                        this.RecentSearches$.next(searches);
                    }
                }
            });
        } catch (err) {
            console.error('[SearchService] LoadRecentSearches error:', err);
        }
        this.recentSearchesLoaded = true;
    }

    private addToRecentSearches(query: string, resultCount: number): void {
        const current = this.RecentSearches$.value;
        const filtered = current.filter(s => s.Query !== query);
        const updated = [
            { Query: query, Timestamp: new Date(), ResultCount: resultCount },
            ...filtered
        ].slice(0, this.maxRecentSearches);
        this.RecentSearches$.next(updated);
        this.persistRecentSearches(updated);
    }

    private persistRecentSearches(searches: RecentSearch[]): void {
        try {
            const json: RecentSearchJson[] = searches.map(s => ({
                Query: s.Query,
                Timestamp: s.Timestamp.toISOString(),
                ResultCount: s.ResultCount
            }));
            UserInfoEngine.Instance.SetSettingDebounced(RECENT_SEARCHES_KEY, JSON.stringify(json));
        } catch {
            // Silently fail if UserInfoEngine not available
        }
    }

    /** Cache provider metadata by SourceType for use in GroupResults/BuildFilters */
    private cacheProviders(providers: SearchProviderInfo[]): void {
        for (const p of providers) {
            this.providersBySourceType.set(p.SourceType, p);
        }
    }

    private createEmptyResponse(errorMessage?: string): SearchResponse {
        return {
            Success: !errorMessage,
            Results: [],
            Groups: [],
            Filters: [],
            TotalCount: 0,
            ElapsedMs: 0,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            Providers: [],
            ErrorMessage: errorMessage
        };
    }

    /**
     * Execute search via the GraphQLSearchClient.
     */
    private async executeGraphQLSearch(request: SearchRequest): Promise<SearchResponse> {
        if (!request.Query.trim()) {
            return this.createEmptyResponse();
        }

        const provider = this.Provider;
        if (!(provider instanceof GraphQLDataProvider)) {
            return this.createEmptyResponse('GraphQL provider not available');
        }

        const client = new GraphQLSearchClient(provider);
        const filters = this.buildClientFilters(request);
        const minScore = request.MinScore ?? DEFAULT_MIN_SCORE;

        const clientResponse = await client.ExecuteSearch({
            Query: request.Query,
            MaxResults: request.MaxResults || 20,
            MinScore: minScore > 0 ? minScore : undefined,
            Filters: filters,
            ScopeIDs: request.ScopeIDs && request.ScopeIDs.length > 0 ? request.ScopeIDs : undefined
        });

        return this.mapClientResponseToSearchResponse(clientResponse);
    }

    /** Convert a SearchClientResponse into the SearchResponse shape used by this service */
    private mapClientResponseToSearchResponse(clientResponse: SearchClientResponse): SearchResponse {
        if (!clientResponse.Success) {
            return this.createEmptyResponse(clientResponse.ErrorMessage ?? 'Search failed');
        }

        // Cache provider metadata for use in GroupResults/BuildFilters
        const providers: SearchProviderInfo[] = (clientResponse.Providers ?? []).map(p => ({
            ID: p.ID,
            Name: p.Name,
            DisplayName: p.DisplayName,
            Icon: p.Icon,
            SourceType: p.SourceType,
            Priority: p.Priority,
        }));
        this.cacheProviders(providers);

        const results: SearchResultItem[] = (clientResponse.Results ?? []).map(r => this.mapClientResultItem(r));

        const groups = this.GroupResults(results);
        const filters = this.BuildFilters(results);

        return {
            Success: true,
            Results: results,
            Groups: groups,
            Filters: filters,
            TotalCount: clientResponse.TotalCount,
            ElapsedMs: clientResponse.ElapsedMs,
            SourceCounts: {
                Vector: clientResponse.SourceCounts.Vector,
                FullText: clientResponse.SourceCounts.FullText,
                Entity: clientResponse.SourceCounts.Entity,
                Storage: clientResponse.SourceCounts.Storage
            },
            Providers: providers,
        };
    }

    /** Map a single SearchClientResultItem to a SearchResultItem */
    private mapClientResultItem(r: SearchClientResultItem): SearchResultItem {
        return {
            ID: r.ID,
            Title: r.RecordName || r.Title,
            Snippet: r.Snippet,
            EntityName: r.EntityName,
            RecordID: r.RecordID,
            SourceType: (r.SourceType as SearchResultItem['SourceType']) || 'entity',
            ResultType: r.ResultType,
            Score: r.Score,
            ScoreBreakdown: r.ScoreBreakdown ?? {},
            Tags: r.Tags ?? [],
            SourceIcon: r.EntityIcon || r.ProviderIcon || FALLBACK_SOURCE_ICONS[r.SourceType] || 'fa-solid fa-database',
            EntityIcon: r.EntityIcon,
            RecordName: r.RecordName,
            MatchedAt: new Date(r.MatchedAt),
            RawMetadata: r.RawMetadata,
            ProviderId: r.ProviderId,
            ProviderLabel: r.ProviderLabel,
            ProviderIcon: r.ProviderIcon,
        };
    }

    /**
     * Load the list of search scopes available to the current user.
     * Cached after the first successful call; pass `force=true` to reload.
     */
    public async LoadScopes(force: boolean = false): Promise<SearchScopeInfo[]> {
        if (this.scopesLoaded && !force) return this.Scopes$.value;
        if (this.scopesLoadInFlight && !force) return this.scopesLoadInFlight;

        const load = (async (): Promise<SearchScopeInfo[]> => {
            try {
                const provider = Metadata.Provider;
                if (!(provider instanceof GraphQLDataProvider)) {
                    this.Scopes$.next([]);
                    return [];
                }
                const client = new GraphQLSearchClient(provider);
                const scopes = await client.GetSearchScopes();
                this.Scopes$.next(scopes);
                this.scopesLoaded = true;
                return scopes;
            } catch {
                this.Scopes$.next([]);
                return [];
            } finally {
                this.scopesLoadInFlight = null;
            }
        })();

        this.scopesLoadInFlight = load;
        return load;
    }

    /** Build the client filters from active filter selections */
    private buildClientFilters(request: SearchRequest): { EntityNames?: string[]; SourceTypes?: string[]; Tags?: string[] } | undefined {
        if (!request.ActiveFilters || Object.keys(request.ActiveFilters).length === 0) {
            return undefined;
        }

        const result: { EntityNames?: string[]; SourceTypes?: string[]; Tags?: string[] } = {};

        const entityFilters = request.ActiveFilters['Entity'];
        if (entityFilters?.length) {
            result.EntityNames = entityFilters;
        }

        const sourceFilters = request.ActiveFilters['Source'];
        if (sourceFilters?.length) {
            result.SourceTypes = sourceFilters;
        }

        const tagFilters = request.ActiveFilters['Tags'];
        if (tagFilters?.length) {
            result.Tags = tagFilters;
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
}
