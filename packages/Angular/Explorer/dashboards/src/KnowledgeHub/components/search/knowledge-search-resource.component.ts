/**
 * @fileoverview Knowledge Hub Search Dashboard (Task 2)
 *
 * Google-style clean search experience with centered search bar,
 * grouped results, faceted sidebar filters, and "Ask Knowledge Agent" CTA.
 * Registered as BaseResourceComponent for the Knowledge Hub app.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject, Injector } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJKnowledgeHubSavedSearchEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import {
    SearchResultItem,
    SearchResultGroup,
    SearchFilter,
    SearchRequest,
    SearchResponse,
    SearchResultSelectedEvent,
    SearchFilterChangeEvent
} from '@memberjunction/ng-search';
import { SearchService, RecentSearch } from '@memberjunction/ng-search';
import { ConversationBridgeService } from '@memberjunction/ng-conversations';

@RegisterClass(BaseResourceComponent, 'KnowledgeSearchResource')
@Component({
    standalone: false,
    selector: 'app-knowledge-search-resource',
    templateUrl: './knowledge-search-resource.component.html',
    styleUrls: ['./knowledge-search-resource.component.css']
})
export class KnowledgeSearchResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private searchService = inject(SearchService);
    private injector = inject(Injector);
    private navigationService = inject(NavigationService);
    private destroy$ = new Subject<void>();

    // --- State ---
    public Query = '';
    public IsSearching = false;
    public HasSearched = false;
    public ShowFilters = false;
    public ShowResultDetail = false;
    public DetailResult: SearchResultItem | null = null;

    // --- Results ---
    public AllResults: SearchResultItem[] = [];
    public ResultGroups: SearchResultGroup[] = [];
    public Filters: SearchFilter[] = [];
    public ActiveFilters: Record<string, string[]> = {};
    public TotalCount = 0;
    public ElapsedMs = 0;
    /** Minimum relevance score threshold (0-1). Results below this are hidden. */
    public MinScoreThreshold = 0.35;

    /**
     * The minimum relevance threshold that was last sent to the server.
     * When the slider moves above this, we filter client-side.
     * When it moves below, we must re-fetch from the server.
     */
    public ServerMinRelevance = 0.35;

    /** Count of server-side results before any client-side filtering */
    public ServerResultCount = 0;

    // --- Recent & Saved ---
    public RecentSearches: RecentSearch[] = [];
    public SavedSearches: MJKnowledgeHubSavedSearchEntity[] = [];

    /** Popular tags for "Filter by Tag" preset buttons, sized by relative frequency */
    public PopularTags: { Name: string; Count: number; FontSize: number }[] = [];

    // --- Save Search Dialog ---
    public ShowSaveDialog = false;
    public SaveSearchName = '';

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Knowledge Search';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-magnifying-glass';
    }

    async ngAfterViewInit(): Promise<void> {
        await UserInfoEngine.Instance.Config(false);
        this.LoadSearchPreferences();
        this.subscribeToSearchState();
        this.parseUrlParameters();
        this.registerAgentTools();
        this.emitAgentContext();
        this.loadSavedSearches();
        this.loadPopularTags();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Report current search state to the agent via NavigationService */
    private emitAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            CurrentQuery: this.Query || null,
            ResultCount: this.TotalCount,
            ElapsedMs: this.ElapsedMs,
            HasSearched: this.HasSearched,
            ShowFilters: this.ShowFilters,
            MinScoreThreshold: this.MinScoreThreshold,
            ActiveFilterCount: this.GetActiveFilterCount(),
            TopResults: this.AllResults.slice(0, 5).map(r => ({
                Title: r.Title,
                EntityName: r.EntityName,
                Score: Math.round(r.Score * 100),
            })),
        });
    }

    /** Register client tools the agent can invoke on this dashboard */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RunKnowledgeSearch',
                Description: 'Execute a knowledge search query across all indexed content',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search query text' },
                        minScore: { type: 'number', description: 'Minimum relevance score 0-1 (default 0.35)' },
                    },
                    required: ['query'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    this.Query = String(params['query'] ?? '');
                    if (params['minScore'] != null) this.MinScoreThreshold = Number(params['minScore']);
                    await this.RunSearch();
                    return { Success: true, Data: { ResultCount: this.TotalCount, ElapsedMs: this.ElapsedMs } };
                },
            },
            {
                Name: 'ClearKnowledgeSearch',
                Description: 'Clear the current search query and results',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.ClearSearch();
                    return { Success: true };
                },
            },
            {
                Name: 'ToggleSearchFilters',
                Description: 'Show or hide the search filter panel',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.ToggleFilters();
                    return { Success: true, Data: { ShowFilters: this.ShowFilters } };
                },
            },
        ]);
    }

    /** Execute a search query */
    public async RunSearch(): Promise<void> {
        const query = this.Query.trim();
        if (!query) return;

        this.ServerMinRelevance = this.MinScoreThreshold;

        const request: SearchRequest = {
            Query: query,
            MaxResults: 50,
            ActiveFilters: this.ActiveFilters,
            IncludeSources: ['vector', 'fulltext', 'entity'],
            MinScore: this.MinScoreThreshold,
        };

        const response = await this.searchService.ExecuteSearch(request);
        this.applySearchResponse(response);
    }

    /** Handle pressing Enter in the search box */
    public OnSearchKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.RunSearch();
        }
    }

    /** Handle selecting a result */
    public OnResultSelected(event: SearchResultSelectedEvent): void {
        this.DetailResult = event.Result;
        this.ShowResultDetail = true;
        this.cdr.detectChanges();
    }

    /** Handle "Open Record" — navigate to the entity record via NavigationService */
    public OnOpenRecord(event: { EntityName: string; RecordID: string }): void {
        const md = new Metadata();
        const entityInfo = md.Entities.find(e => e.Name === event.EntityName);
        const pkey = new CompositeKey();
        if (entityInfo) {
            pkey.LoadFromURLSegment(entityInfo, event.RecordID);
        } else {
            // Fallback: treat as simple single-field PK
            pkey.KeyValuePairs = [{ FieldName: 'ID', Value: event.RecordID }];
        }
        this.navigationService.OpenEntityRecord(event.EntityName, pkey);
    }

    /** Close the result detail view */
    public CloseResultDetail(): void {
        this.ShowResultDetail = false;
        this.DetailResult = null;
        this.cdr.detectChanges();
    }

    /** Toggle the filter sidebar */
    public ToggleFilters(): void {
        this.ShowFilters = !this.ShowFilters;
        this.PersistSearchPreferences();
        this.cdr.detectChanges();
    }

    /**
     * Handle a filter change from the filter component.
     * Uses client-side filtering on the cached full result set — no server re-query.
     */
    public OnFilterChanged(event: SearchFilterChangeEvent): void {
        this.ActiveFilters[event.Category] = event.SelectedValues;
        this.applyClientSideFilters();
        this.PersistSearchPreferences();
    }

    /** Handle clearing all filters */
    public OnFiltersCleared(): void {
        this.ActiveFilters = {};
        this.MinScoreThreshold = 0.35;
        this.applyClientSideFilters();
        this.PersistSearchPreferences();
    }

    /**
     * Handle relevance threshold slider change.
     * - Moving UP (narrowing): filter client-side from cached server results.
     * - Moving DOWN past ServerMinRelevance (widening): re-fetch from server.
     */
    public OnThresholdChanged(value: number): void {
        this.MinScoreThreshold = value;
        if (value >= this.ServerMinRelevance) {
            // Narrowing — client-side filter is sufficient
            this.applyClientSideFilters();
        } else {
            // Widening past what the server returned — need fresh data
            this.RunSearchWithThreshold(value);
        }
    }

    /**
     * Re-fetch from the server with a new minimum relevance threshold,
     * then update the server baseline so future narrowing stays client-side.
     */
    private async RunSearchWithThreshold(threshold: number): Promise<void> {
        const query = this.Query.trim();
        if (!query) return;

        const request: SearchRequest = {
            Query: query,
            MaxResults: 50,
            ActiveFilters: this.ActiveFilters,
            IncludeSources: ['vector', 'fulltext', 'entity'],
            MinScore: threshold,
        };

        const response = await this.searchService.ExecuteSearch(request);
        this.ServerMinRelevance = threshold;
        this.applySearchResponse(response);
    }

    /** Toggle select all / unselect all for a filter category (Kayak-style) */
    public ToggleSelectAll(category: string): void {
        const filter = this.Filters.find(f => f.Category === category);
        if (!filter) return;

        const currentSelection = this.ActiveFilters[category] ?? [];
        if (currentSelection.length === filter.Options.length) {
            // All selected → unselect all
            this.ActiveFilters[category] = [];
        } else {
            // Some or none selected → select all
            this.ActiveFilters[category] = filter.Options.map(o => o.Value);
        }
        this.applyClientSideFilters();
    }

    /** Check if all options in a category are selected */
    public IsAllSelected(category: string): boolean {
        const filter = this.Filters.find(f => f.Category === category);
        if (!filter) return false;
        const selection = this.ActiveFilters[category] ?? [];
        return selection.length === filter.Options.length;
    }

    /** Open the chat overlay with Knowledge Agent context */
    public OnAskAgent(): void {
        try {
            const bridge = this.injector.get(ConversationBridgeService, null);
            if (bridge) {
                bridge.SwitchToOverlay(null);
            } else {
                console.warn('[KnowledgeSearch] ConversationBridgeService not available');
            }
        } catch {
            console.warn('[KnowledgeSearch] ConversationBridgeService not available');
        }
    }

    /**
     * Handle "See Similar Items" — re-runs the search using the result's title as the query.
     * This provides a lightweight "more like this" experience without needing raw vector access.
     */
    public OnMoreLikeThis(result: SearchResultItem): void {
        this.ActiveFilters = {};
        this.Query = result.RecordName ?? result.Title;
        this.RunSearch();
    }

    /** Apply a recent search */
    public ApplyRecentSearch(recent: RecentSearch): void {
        this.Query = recent.Query;
        this.RunSearch();
    }

    // --- Saved Searches ---

    /** Open the save search dialog */
    public OpenSaveDialog(): void {
        this.SaveSearchName = this.Query;
        this.ShowSaveDialog = true;
        this.cdr.detectChanges();
    }

    /** Cancel the save dialog */
    public CancelSaveDialog(): void {
        this.ShowSaveDialog = false;
        this.SaveSearchName = '';
        this.cdr.detectChanges();
    }

    /**
     * Save the current search as a named saved search using MJKnowledgeHubSavedSearchEntity.
     * Persists query, active filters, min score, and max results.
     */
    public async ConfirmSaveSearch(): Promise<void> {
        const name = this.SaveSearchName.trim();
        if (!name || !this.Query.trim()) return;

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MJKnowledgeHubSavedSearchEntity>('MJ: Knowledge Hub Saved Searches');
            entity.Name = name;
            entity.Query = this.Query;
            entity.Filters = Object.keys(this.ActiveFilters).length > 0
                ? JSON.stringify(this.ActiveFilters)
                : null;
            entity.MinScore = this.MinScoreThreshold > 0 ? this.MinScoreThreshold : null;
            entity.MaxResults = 50;
            entity.NotifyOnNewResults = false;

            const saved = await entity.Save();
            if (saved) {
                this.SavedSearches = [entity, ...this.SavedSearches];
            }
        } catch (error) {
            console.error('[KnowledgeSearch] Failed to save search:', error);
        }

        this.ShowSaveDialog = false;
        this.SaveSearchName = '';
        this.cdr.detectChanges();
    }

    /**
     * Apply a saved search — populates query, filters, and threshold, then executes.
     */
    public ApplySavedSearch(saved: MJKnowledgeHubSavedSearchEntity): void {
        this.Query = saved.Query;
        if (saved.Filters) {
            try {
                this.ActiveFilters = JSON.parse(saved.Filters) as Record<string, string[]>;
            } catch {
                this.ActiveFilters = {};
            }
        } else {
            this.ActiveFilters = {};
        }
        if (saved.MinScore != null) {
            this.MinScoreThreshold = saved.MinScore;
        }
        this.RunSearch();
    }

    /**
     * Delete a saved search by ID and remove it from the local list.
     */
    public async DeleteSavedSearch(saved: MJKnowledgeHubSavedSearchEntity, event: MouseEvent): Promise<void> {
        event.stopPropagation();
        try {
            const success = await saved.Delete();
            if (success) {
                this.SavedSearches = this.SavedSearches.filter(s => !UUIDsEqual(s.ID, saved.ID));
                this.cdr.detectChanges();
            }
        } catch (error) {
            console.error('[KnowledgeSearch] Failed to delete saved search:', error);
        }
    }

    /**
     * Search by a popular tag: sets the query text and runs a search.
     * Does NOT add a sticky filter — just a simple text search.
     */
    public FilterByTag(tagName: string): void {
        this.Query = tagName;
        this.RunSearch();
    }

    /** Clear the current search */
    public ClearSearch(): void {
        this.Query = '';
        this.AllResults = [];
        this.ResultGroups = [];
        this.Filters = [];
        this.ActiveFilters = {};
        this.TotalCount = 0;
        this.ServerResultCount = 0;
        this.ServerMinRelevance = 0.35;
        this.HasSearched = false;
        this.ShowFilters = false;
        this.cdr.detectChanges();
    }

    /** Check if any filters are active */
    public HasActiveFilters(): boolean {
        return Object.values(this.ActiveFilters).some(v => v.length > 0);
    }

    public GetActiveFilterCount(): number {
        return Object.values(this.ActiveFilters).reduce((sum, v) => sum + v.length, 0);
    }

    // --- Private Methods ---

    /** Parse URL parameters for deep links (e.g., ?conversationId=xxx or ?q=search+term) */
    private parseUrlParameters(): void {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const conversationId = urlParams.get('conversationId');
            if (conversationId) {
                // Deep link to conversation - open the agent chat
                this.OnAskAgent();
            }

            const searchQuery = urlParams.get('q');
            if (searchQuery) {
                this.Query = searchQuery;
                this.RunSearch();
            }
        } catch {
            // Ignore URL parsing errors
        }
    }

    /**
     * Load saved searches for the current user from the database.
     * Runs in the background — does not block initialization.
     */
    private async loadSavedSearches(): Promise<void> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJKnowledgeHubSavedSearchEntity>({
                EntityName: 'MJ: Knowledge Hub Saved Searches',
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 50,
                ResultType: 'entity_object'
            });
            if (result.Success) {
                this.SavedSearches = result.Results;
                this.cdr.detectChanges();
            }
        } catch (error) {
            console.error('[KnowledgeSearch] Failed to load saved searches:', error);
        }
    }

    /**
     * Load the top 10 most-used tags for the "Filter by Tag" preset buttons.
     * Loads TaggedItems (TagID only), aggregates counts client-side, resolves
     * display names from Tags, then sizes each tag by relative frequency.
     * Font sizes range from 0.8rem (least used in top 10) to 1.3rem (most used).
     */
    private async loadPopularTags(): Promise<void> {
        try {
            const rv = new RunView();
            const [taggedResult, tagResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Tagged Items',
                    Fields: ['TagID'],
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Tags',
                    Fields: ['ID', 'DisplayName'],
                    ResultType: 'simple'
                }
            ]);

            if (!taggedResult.Success || !tagResult.Success) return;

            // Count occurrences per TagID
            const counts = new Map<string, number>();
            for (const row of taggedResult.Results as { TagID: string }[]) {
                counts.set(row.TagID, (counts.get(row.TagID) ?? 0) + 1);
            }

            // Build name lookup
            const tagNames = new Map<string, string>();
            for (const row of tagResult.Results as { ID: string; DisplayName: string }[]) {
                tagNames.set(row.ID, row.DisplayName);
            }

            // Sort by count descending, take top 10
            const sorted = [...counts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            if (sorted.length === 0) return;

            const maxCount = sorted[0][1];
            const minCount = sorted[sorted.length - 1][1];
            const range = maxCount - minCount || 1;
            const minFont = 0.8;
            const maxFont = 1.3;

            this.PopularTags = sorted
                .map(([tagID, count]) => ({
                    Name: tagNames.get(tagID) ?? '',
                    Count: count,
                    FontSize: minFont + ((count - minCount) / range) * (maxFont - minFont)
                }))
                .filter(t => t.Name.length > 0);

            this.cdr.detectChanges();
        } catch {
            // Non-critical — tags are a convenience, not a blocker
        }
    }

    private subscribeToSearchState(): void {
        this.searchService.IsSearching$
            .pipe(takeUntil(this.destroy$))
            .subscribe((val: boolean) => {
                this.IsSearching = val;
                this.cdr.detectChanges();
            });

        this.searchService.RecentSearches$
            .pipe(takeUntil(this.destroy$))
            .subscribe((val: RecentSearch[]) => {
                this.RecentSearches = val;
                this.cdr.detectChanges();
            });
    }

    /** Full unfiltered result set from the last server query */
    private cachedFullResults: SearchResultItem[] = [];

    /**
     * Apply filters client-side on the cached full result set.
     * This avoids re-querying the server when entity/tag checkboxes change.
     */
    private applyClientSideFilters(): void {
        let filtered = [...this.cachedFullResults];

        // Apply entity filter
        const entityFilter = this.ActiveFilters['Entity'];
        if (entityFilter?.length > 0) {
            filtered = filtered.filter(r => entityFilter.includes(r.EntityName));
        }

        // Apply tag filter
        const tagFilter = this.ActiveFilters['Tags'];
        if (tagFilter?.length > 0) {
            filtered = filtered.filter(r =>
                r.Tags?.some(t => tagFilter.includes(t))
            );
        }

        // Apply score threshold
        if (this.MinScoreThreshold > 0) {
            filtered = filtered.filter(r => r.Score >= this.MinScoreThreshold);
        }

        // Rebuild groups and update counts
        this.AllResults = filtered;
        this.ResultGroups = this.searchService.GroupResults(filtered);
        this.TotalCount = filtered.length;

        // SR-3 fix: Build filters from FULL result set so options don't disappear
        // when a filter is checked. Counts reflect the filtered results for context.
        this.Filters = this.searchService.BuildFilters(this.cachedFullResults);
        // Remove Source Type filter — it confuses users
        this.Filters = this.Filters.filter(f => f.Category !== 'Source Type');

        this.cdr.detectChanges();
        this.emitAgentContext();
    }

    private static readonly PREFS_KEY = 'KH_Search_Preferences';

    /** Persist user search preferences via UserInfoEngine */
    private PersistSearchPreferences(): void {
        const prefs = JSON.stringify({
            ShowFilters: this.ShowFilters,
            MinScoreThreshold: this.MinScoreThreshold,
        });
        UserInfoEngine.Instance.SetSettingDebounced(KnowledgeSearchResourceComponent.PREFS_KEY, prefs);
    }

    /** Load persisted search preferences from UserInfoEngine */
    private LoadSearchPreferences(): void {
        const raw = UserInfoEngine.Instance.GetSetting(KnowledgeSearchResourceComponent.PREFS_KEY);
        if (raw) {
            try {
                const prefs = JSON.parse(raw);
                if (prefs.ShowFilters != null) this.ShowFilters = prefs.ShowFilters;
                if (prefs.MinScoreThreshold != null) this.MinScoreThreshold = prefs.MinScoreThreshold;
            } catch { /* ignore parse errors */ }
        }
    }

    private applySearchResponse(response: SearchResponse): void {
        // Cache full results (sorted by score descending) for client-side filtering
        this.cachedFullResults = response.Results.sort((a, b) => b.Score - a.Score);
        this.ServerResultCount = this.cachedFullResults.length;

        // Apply current threshold client-side (may be higher than server threshold)
        let filtered = this.cachedFullResults;
        if (this.MinScoreThreshold > 0) {
            filtered = filtered.filter(r => r.Score >= this.MinScoreThreshold);
        }

        this.AllResults = [...filtered];
        this.ResultGroups = this.searchService.GroupResults(filtered);
        // Remove Source Type filter — confuses users
        this.Filters = response.Filters.filter(f => f.Category !== 'Source Type');
        this.TotalCount = filtered.length;
        this.ElapsedMs = response.ElapsedMs;
        this.HasSearched = true;
        // Only auto-show filters on first search if user hasn't set a preference
        const savedPref = UserInfoEngine.Instance.GetSetting(KnowledgeSearchResourceComponent.PREFS_KEY);
        if (!savedPref) {
            this.ShowFilters = response.Filters.length > 0;
        }
        this.cdr.detectChanges();
        this.emitAgentContext();
    }
}

/** Tree-shaking prevention */
export function LoadKnowledgeSearchResource(): void {
    // Prevents tree-shaking of the component
}
