import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    SearchService,
    SearchResultItem,
    SearchFilter,
    SearchFilterChangeEvent,
    SearchRequest,
    SearchResponse,
    SearchResultSelectedEvent,
} from '@memberjunction/ng-search';

@RegisterClass(BaseResourceComponent, 'SearchResultsResource')
@Component({
    standalone: false,
    selector: 'mj-search-results-resource',
    template: `
        <div class="search-results-page">
            <!-- Header bar -->
            <div class="search-header">
                <div class="search-header-left">
                    @if (!ShowFilterPanel && HasSearched && TotalCount > 0) {
                        <button class="sr-icon-btn" title="Show filters" (click)="ToggleFilterPanel()">
                            <i class="fa-solid fa-filter"></i>
                        </button>
                    }
                    @if (!IsSearching && TotalCount > 0) {
                        <span class="search-meta">
                            {{ FilteredResults.length }} of {{ TotalCount }} result{{ TotalCount !== 1 ? 's' : '' }}
                            for "{{ CurrentQuery }}" in {{ ElapsedMs }}ms
                        </span>
                    }
                </div>
                <div class="search-header-right">
                    <!-- Search within results -->
                    @if (TotalCount > 0) {
                        <div class="sr-refine-wrapper">
                            <i class="fa-solid fa-filter-list sr-refine-icon"></i>
                            <input class="mj-input sr-refine-input"
                                   placeholder="Filter within results..."
                                   [value]="ClientFilterText"
                                   (input)="OnClientFilterTextChange($any($event.target).value)" />
                            @if (ClientFilterText) {
                                <button class="sr-refine-clear" (click)="OnClientFilterTextChange('')">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            }
                        </div>
                    }
                    <!-- Sort -->
                    @if (TotalCount > 0) {
                        <select class="mj-input sr-sort-select" [value]="SortField" (change)="OnSortChange($any($event.target).value)">
                            <option value="score">Sort: Relevance</option>
                            <option value="title">Sort: Name</option>
                            <option value="entity">Sort: Entity</option>
                        </select>
                    }
                    <!-- Refresh -->
                    <button class="sr-icon-btn" title="Refresh search" (click)="OnRefresh()" [disabled]="IsSearching">
                        <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsSearching"></i>
                    </button>
                </div>
            </div>

            <!-- Loading state -->
            @if (IsSearching) {
                <div class="search-loading">
                    <mj-loading text="Searching..." size="medium"></mj-loading>
                </div>
            }

            <!-- Results area -->
            @if (!IsSearching) {
                @if (TotalCount === 0 && HasSearched) {
                    <div class="search-no-results">
                        <i class="fa-solid fa-magnifying-glass-minus"></i>
                        <h3>No results found</h3>
                        <p>Try different keywords or broaden your search.</p>
                    </div>
                }
                @if (TotalCount > 0) {
                    <div class="search-body">
                        @if (ShowFilterPanel) {
                            <mj-search-filter
                                [Filters]="Filters"
                                [ActiveFilters]="ActiveFilters"
                                [ShowRelevanceSlider]="true"
                                [MinScorePercent]="MinScorePercent"
                                (FilterChanged)="OnFilterChanged($event)"
                                (FiltersCleared)="OnFiltersCleared()"
                                (CloseRequested)="ToggleFilterPanel()"
                                (MinScoreChanged)="OnMinScoreChanged($any($event))">
                            </mj-search-filter>
                        }
                        <mj-search-results
                            [FlatResults]="FilteredResults"
                            [HighlightText]="ClientFilterText"
                            [ShowScores]="true"
                            [ShowTags]="true"
                            [ShowSummary]="false"
                            [PageSize]="20"
                            (ResultSelected)="OnResultSelected($event)"
                            (OpenRecordRequested)="OnOpenRecord($event)">
                        </mj-search-results>
                    </div>
                }
            }
        </div>
    `,
    styles: [`
        .search-results-page {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: var(--mj-bg-page);
            overflow: hidden;
        }
        .search-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 8px 24px;
            border-bottom: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface);
            flex-shrink: 0;
        }
        .search-header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .search-header-right {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .search-meta {
            color: var(--mj-text-muted);
            font-size: 13px;
            white-space: nowrap;
        }
        .sr-icon-btn {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            cursor: pointer;
            transition: all 0.15s;
            font-size: 13px;
            flex-shrink: 0;
        }
        .sr-icon-btn:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
        .sr-icon-btn:disabled { opacity: 0.4; cursor: default; }
        .sr-refine-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }
        .sr-refine-icon {
            position: absolute;
            left: 8px;
            color: var(--mj-text-muted);
            font-size: 12px;
            pointer-events: none;
        }
        .sr-refine-input {
            padding: 5px 28px 5px 26px;
            font-size: 12px;
            width: 180px;
            border-radius: 6px;
        }
        .sr-refine-clear {
            position: absolute;
            right: 6px;
            background: none;
            border: none;
            color: var(--mj-text-muted);
            cursor: pointer;
            font-size: 11px;
            padding: 2px;
        }
        .sr-refine-clear:hover { color: var(--mj-text-primary); }
        .sr-sort-select {
            padding: 5px 8px;
            font-size: 12px;
            border-radius: 6px;
            min-width: 130px;
        }
        .search-loading {
            display: flex;
            justify-content: center;
            padding: 60px 0;
        }
        .search-body {
            flex: 1;
            display: flex;
            gap: 16px;
            padding: 16px 24px;
            overflow: hidden;
        }
        .search-body mj-search-filter {
            flex-shrink: 0;
            width: 240px;
            overflow-y: auto;
        }
        .search-body mj-search-results {
            flex: 1;
            min-width: 0;
            overflow-y: auto;
        }
        .search-no-results {
            text-align: center;
            padding: 60px 20px;
            color: var(--mj-text-muted);
        }
        .search-no-results i {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.4;
        }
        .search-no-results h3 {
            font-size: 18px;
            color: var(--mj-text-primary);
            margin: 0 0 8px;
        }
        .search-no-results p {
            font-size: 14px;
            margin: 0;
        }
    `]
})
export class SearchResultsResource extends BaseResourceComponent {
    private cdr = inject(ChangeDetectorRef);
    private navigationService = inject(NavigationService);
    private searchService = inject(SearchService);

    CurrentQuery = '';
    IsSearching = false;
    HasSearched = false;
    TotalCount = 0;
    ElapsedMs = 0;
    Filters: SearchFilter[] = [];
    ActiveFilters: Record<string, string[]> = {};
    FilteredResults: SearchResultItem[] = [];
    MinScorePercent = 0;
    ShowFilterPanel = true;
    SortField: 'score' | 'title' | 'entity' = 'score';
    ClientFilterText = '';

    /** All results from the last search (before client-side filtering) */
    private allResults: SearchResultItem[] = [];

    private dataLoaded = false;

    // Override Data setter to trigger search when tab container provides the data
    // (ngOnInit fires before Data is set, so we can't rely on it)
    override set Data(value: ResourceData) {
        super.Data = value;
        if (!this.dataLoaded) {
            this.dataLoaded = true;
            this.loadFromData();
        }
    }
    override get Data(): ResourceData {
        return super.Data;
    }

    private async loadFromData(): Promise<void> {
        // Load filter panel preference
        try {
            const { UserInfoEngine } = require('@memberjunction/core-entities');
            const pref = UserInfoEngine.Instance.GetSetting('search.showFilterPanel');
            if (pref === 'false') this.ShowFilterPanel = false;
        } catch { /* ignore */ }

        const config = this.Data?.Configuration;
        if (config?.Query) {
            this.CurrentQuery = config.Query as string;
        } else if (config?.SearchInput) {
            this.CurrentQuery = config.SearchInput as string;
        }

        if (this.CurrentQuery) {
            await this.ExecuteSearch(this.CurrentQuery);
        }

        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const query = (data.Configuration?.Query ?? data.Configuration?.SearchInput ?? 'Search') as string;
        return `Search: ${query}`;
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-magnifying-glass';
    }

    async OnRefineSearch(query: string): Promise<void> {
        const trimmed = query?.trim();
        if (trimmed && trimmed.length >= 2) {
            this.CurrentQuery = trimmed;
            this.ActiveFilters = {};
            await this.ExecuteSearch(trimmed);
        }
    }

    OnFilterChanged(event: SearchFilterChangeEvent): void {
        this.ActiveFilters = {
            ...this.ActiveFilters,
            [event.Category]: event.SelectedValues
        };
        this.applyClientFilters();
    }

    OnFiltersCleared(): void {
        this.ActiveFilters = {};
        this.MinScorePercent = 0;
        this.applyClientFilters();
    }

    OnMinScoreChanged(percent: number): void {
        this.MinScorePercent = percent;
        this.applyClientFilters();
    }

    OnResultSelected(event: SearchResultSelectedEvent): void {
        this.navigateToRecord(event.Result.EntityName, event.Result.RecordID);
    }

    OnOpenRecord(event: { EntityName: string; RecordID: string }): void {
        this.navigateToRecord(event.EntityName, event.RecordID);
    }

    async OnRefresh(): Promise<void> {
        if (this.CurrentQuery) {
            this.ActiveFilters = {};
            this.MinScorePercent = 0;
            this.ClientFilterText = '';
            await this.ExecuteSearch(this.CurrentQuery);
        }
    }

    ToggleFilterPanel(): void {
        this.ShowFilterPanel = !this.ShowFilterPanel;
        // Persist preference
        try {
            const { UserInfoEngine } = require('@memberjunction/core-entities');
            UserInfoEngine.Instance.SetSettingDebounced(
                'search.showFilterPanel',
                this.ShowFilterPanel ? 'true' : 'false'
            );
        } catch { /* ignore if UserInfoEngine not available */ }
        this.cdr.detectChanges();
    }

    OnSortChange(field: string): void {
        this.SortField = field as 'score' | 'title' | 'entity';
        this.applyClientFilters();
    }

    OnClientFilterTextChange(text: string): void {
        this.ClientFilterText = text;
        this.applyClientFilters();
    }

    private navigateToRecord(entityName: string, recordID: string): void {
        if (entityName && recordID) {
            const pkey = new CompositeKey([{ FieldName: 'ID', Value: recordID }]);
            this.navigationService.OpenEntityRecord(entityName, pkey);
        }
    }

    private async ExecuteSearch(query: string): Promise<void> {
        this.IsSearching = true;
        this.HasSearched = false;
        this.cdr.detectChanges();

        const request: SearchRequest = {
            Query: query,
            MaxResults: 50,
            ActiveFilters: {},
            IncludeSources: ['vector', 'fulltext', 'entity'],
            MinScore: 0
        };

        const response: SearchResponse = await this.searchService.ExecuteSearch(request);

        this.allResults = [...response.Results].sort((a, b) => b.Score - a.Score);
        this.TotalCount = response.TotalCount;
        this.ElapsedMs = response.ElapsedMs;
        this.Filters = response.Filters;
        this.FilteredResults = [...this.allResults];

        this.IsSearching = false;
        this.HasSearched = true;
        this.cdr.detectChanges();
    }

    /**
     * Apply active filter selections to the full result set.
     */
    private applyClientFilters(): void {
        let results = this.allResults;

        // Apply facet filters
        if (this.hasActiveFilters()) {
            results = results.filter(r => this.matchesActiveFilters(r));
        }

        // Apply min score filter
        if (this.MinScorePercent > 0) {
            const minScore = this.MinScorePercent / 100;
            results = results.filter(r => r.Score >= minScore);
        }

        // Apply client text filter (search within results)
        if (this.ClientFilterText.trim()) {
            const term = this.ClientFilterText.trim().toLowerCase();
            results = results.filter(r =>
                (r.Title?.toLowerCase().includes(term)) ||
                (r.Snippet?.toLowerCase().includes(term)) ||
                (r.EntityName?.toLowerCase().includes(term)) ||
                (r.RecordName?.toLowerCase().includes(term)) ||
                (r.Tags?.some(t => t.toLowerCase().includes(term)))
            );
        }

        // Sort
        switch (this.SortField) {
            case 'title':
                results = [...results].sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
                break;
            case 'entity':
                results = [...results].sort((a, b) => a.EntityName.localeCompare(b.EntityName) || b.Score - a.Score);
                break;
            case 'score':
            default:
                results = [...results].sort((a, b) => b.Score - a.Score);
                break;
        }

        this.FilteredResults = results;
        this.cdr.detectChanges();
    }

    private hasActiveFilters(): boolean {
        return Object.values(this.ActiveFilters).some(v => v.length > 0);
    }

    private matchesActiveFilters(result: SearchResultItem): boolean {
        const entityFilter = this.ActiveFilters['Entity'];
        if (entityFilter?.length && !entityFilter.includes(result.EntityName)) {
            return false;
        }

        const sourceFilter = this.ActiveFilters['Source'];
        if (sourceFilter?.length && !sourceFilter.includes(result.SourceType)) {
            return false;
        }

        const tagFilter = this.ActiveFilters['Tags'];
        if (tagFilter?.length && !tagFilter.some(t => result.Tags.includes(t))) {
            return false;
        }

        return true;
    }
}

export function LoadSearchResultsResource() {
    // Tree-shaking prevention
}
