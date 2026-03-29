/**
 * @fileoverview Knowledge Hub Search Dashboard (Task 2)
 *
 * Google-style clean search experience with centered search bar,
 * grouped results, faceted sidebar filters, and "Ask Knowledge Agent" CTA.
 * Registered as BaseResourceComponent for the Knowledge Hub app.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
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
        this.subscribeToSearchState();
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

    /** Close the result detail view */
    public CloseResultDetail(): void {
        this.ShowResultDetail = false;
        this.DetailResult = null;
        this.cdr.detectChanges();
    }

    /** Toggle the filter sidebar */
    public ToggleFilters(): void {
        this.ShowFilters = !this.ShowFilters;
        this.cdr.detectChanges();
    }

    /** Handle a filter change from the filter component */
    public OnFilterChanged(event: SearchFilterChangeEvent): void {
        this.ActiveFilters[event.Category] = event.SelectedValues;
        this.RunSearch();
    }

    /** Handle clearing all filters */
    public OnFiltersCleared(): void {
        this.ActiveFilters = {};
        this.RunSearch();
    }

    /** Handle agent CTA click */
    public OnAskAgent(): void {
        // TODO: Navigate to agent chat or open overlay with Knowledge Agent
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

    private applySearchResponse(response: SearchResponse): void {
        this.AllResults = response.Results;
        this.ResultGroups = response.Groups;
        this.Filters = response.Filters;
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
