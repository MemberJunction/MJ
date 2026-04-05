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
import { CompositeKey, Metadata } from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
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

/** Saved search entry */
interface SavedSearch {
    Query: string;
    FilterCount: number;
    SavedAt: Date;
}

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

    // --- Recent & Saved ---
    public RecentSearches: RecentSearch[] = [];
    public SavedSearches: SavedSearch[] = [];

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

    /** Handle relevance threshold slider change */
    public OnThresholdChanged(value: number): void {
        this.MinScoreThreshold = value;
        this.applyClientSideFilters();
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

    /** Apply a recent search */
    public ApplyRecentSearch(recent: RecentSearch): void {
        this.Query = recent.Query;
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
        this.AllResults = [...this.cachedFullResults];
        this.ResultGroups = response.Groups;
        // Remove Source Type filter — confuses users
        this.Filters = response.Filters.filter(f => f.Category !== 'Source Type');
        this.TotalCount = response.TotalCount;
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
