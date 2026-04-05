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

    ngAfterViewInit(): void {
        this.LoadSearchPreferences();
        this.subscribeToSearchState();
        this.parseUrlParameters();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
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

        // Rebuild filter counts based on filtered results
        this.Filters = this.searchService.BuildFilters(filtered);
        // Remove Source Type filter — it confuses users
        this.Filters = this.Filters.filter(f => f.Category !== 'Source Type');

        this.cdr.detectChanges();
    }

    /** Persist user search preferences (filter panel state, threshold) */
    private PersistSearchPreferences(): void {
        try {
            const prefs = {
                ShowFilters: this.ShowFilters,
                MinScoreThreshold: this.MinScoreThreshold,
            };
            localStorage.setItem('KH_SearchPreferences', JSON.stringify(prefs));
        } catch { /* ignore */ }
    }

    /** Load persisted search preferences */
    private LoadSearchPreferences(): void {
        try {
            const raw = localStorage.getItem('KH_SearchPreferences');
            if (raw) {
                const prefs = JSON.parse(raw);
                if (prefs.ShowFilters != null) this.ShowFilters = prefs.ShowFilters;
                if (prefs.MinScoreThreshold != null) this.MinScoreThreshold = prefs.MinScoreThreshold;
            }
        } catch { /* ignore */ }
    }

    private applySearchResponse(response: SearchResponse): void {
        this.cachedFullResults = response.Results; // Cache full results for client-side filtering
        this.AllResults = response.Results;
        this.ResultGroups = response.Groups;
        // Remove Source Type filter — confuses users
        this.Filters = response.Filters.filter(f => f.Category !== 'Source Type');
        this.TotalCount = response.TotalCount;
        this.ElapsedMs = response.ElapsedMs;
        this.HasSearched = true;
        this.ShowFilters = response.Filters.length > 0;
        this.cdr.detectChanges();
    }
}

/** Tree-shaking prevention */
export function LoadKnowledgeSearchResource(): void {
    // Prevents tree-shaking of the component
}
