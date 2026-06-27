import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { FileOpenService } from '@memberjunction/ng-file-storage';
import {
    SearchService,
    SearchResultItem,
    SearchFilter,
    SearchFilterChangeEvent,
    SearchRequest,
    SearchResponse,
    SearchResultSelectedEvent,
    StreamingProviderStatus,
} from '@memberjunction/ng-search';
import { WordCloudItem, WordCloudItemEvent } from '@memberjunction/ng-word-cloud';

@RegisterClass(BaseResourceComponent, 'SearchResultsResource')
@Component({
    standalone: false,
    selector: 'mj-search-results-resource',
    template: `
        <div class="search-results-page">
            <!-- Streaming status strip — visible while streamScopedSearch is in flight -->
            @if (EnableStreaming && (IsSearching || StreamingProviders.length > 0)) {
                <div class="streaming-status-strip" aria-live="polite">
                    @for (p of StreamingProviders; track p.Name) {
                        <span class="streaming-chip"
                              [class.streaming-chip-error]="p.State === 'Error'"
                              [class.streaming-chip-completed]="p.State === 'Completed'">
                            @if (p.State === 'Completed') {
                                <i class="fa-solid fa-check"></i>
                            } @else {
                                <i class="fa-solid fa-triangle-exclamation"></i>
                            }
                            <span class="streaming-chip-name">{{ p.Name }}</span>
                            @if (p.State === 'Completed') {
                                <span class="streaming-chip-count">{{ p.Count }}</span>
                                <span class="streaming-chip-time">{{ p.ElapsedMs }}ms</span>
                            } @else if (p.ErrorMessage) {
                                <span class="streaming-chip-time">{{ p.ErrorMessage }}</span>
                            }
                        </span>
                    }
                    @if (IsSearching) {
                        <span class="streaming-chip streaming-chip-pending">
                            <i class="fa-solid fa-circle-notch fa-spin"></i>
                            <span>Streaming…</span>
                        </span>
                    }
                </div>
            }

            <!-- Header bar (always visible when we have server results) -->
            @if (HasSearched && ServerResultCount > 0) {
                <div class="search-header">
                    <div class="search-header-left">
                        @if (!ShowFilterPanel) {
                            <button class="sr-icon-btn" title="Show filters" (click)="ToggleFilterPanel()">
                                <i class="fa-solid fa-filter"></i>
                            </button>
                        }
                        <span class="search-meta">
                            {{ FilteredResults.length }} of {{ ServerResultCount }} result{{ ServerResultCount !== 1 ? 's' : '' }}
                            for "{{ CurrentQuery }}" in {{ ElapsedMs }}ms
                        </span>
                    </div>
                    <div class="search-header-right">
                        <!-- Search within results -->
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
                        <!-- Sort -->
                        <select class="mj-input sr-sort-select" [value]="SortField" (change)="OnSortChange($any($event.target).value)">
                            <option value="score">Sort: Relevance</option>
                            <option value="title">Sort: Name</option>
                            <option value="entity">Sort: Entity</option>
                        </select>
                        <!-- View mode toggle -->
                        <div class="sr-view-toggle">
                            <button class="sr-icon-btn"
                                    [class.sr-view-active]="ViewMode === 'list'"
                                    title="List view"
                                    (click)="SetViewMode('list')">
                                <i class="fa-solid fa-list"></i>
                            </button>
                            <button class="sr-icon-btn"
                                    [class.sr-view-active]="ViewMode === 'cloud'"
                                    title="Tag cloud view"
                                    (click)="SetViewMode('cloud')">
                                <i class="fa-solid fa-cloud"></i>
                            </button>
                        </div>
                        <!-- Refresh -->
                        <button class="sr-icon-btn" title="Refresh search" (click)="OnRefresh()" [disabled]="IsSearching">
                            <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsSearching"></i>
                        </button>
                    </div>
                </div>
            }

            <!-- Initial loading (first search) -->
            @if (IsSearching && ServerResultCount === 0) {
                <div class="search-loading">
                    <mj-loading text="Searching..." size="medium"></mj-loading>
                </div>
            }

            <!-- No server results -->
            @if (!IsSearching && ServerResultCount === 0 && HasSearched) {
                <mj-empty-state
                    class="search-no-results"
                    Variant="no-results"
                    Icon="fa-solid fa-magnifying-glass-minus"
                    Title="No results found"
                    Message="Try different keywords or broaden your search." />
            }
            <!-- Results body (visible when server returned results) -->
            @if (ServerResultCount > 0) {
                <div class="search-results-body-wrapper">
                    <!-- Semi-opaque loading overlay for re-queries (slider lowered, etc.) -->
                    @if (IsSearching) {
                        <div class="search-requery-overlay">
                            <mj-loading text="Updating results..." size="medium"></mj-loading>
                        </div>
                    }

                    @if (ViewMode === 'cloud') {
                        <div class="search-cloud-wrapper">
                            @if (IsLoadingCloud) {
                                <mj-loading text="Loading tag cloud..." size="medium"></mj-loading>
                            } @else {
                                <mj-word-cloud
                                    [Items]="CloudItems"
                                    [MaxItems]="80"
                                    ColorMode="weight-gradient"
                                    [Interactive]="true"
                                    (ItemClick)="OnCloudItemClick($event)">
                                </mj-word-cloud>
                            }
                        </div>
                    } @else {
                        <div class="search-body">
                            @if (ShowFilterPanel) {
                                <mj-search-filter
                                    [Filters]="Filters"
                                    [ActiveFilters]="ActiveFilters"
                                    [ShowRelevanceSlider]="true"
                                    [MinScorePercent]="MinScorePercent"
                                    [ServerMinScorePercent]="serverMinScorePercent"
                                    (FilterChanged)="OnFilterChanged($event)"
                                    (FiltersCleared)="OnFiltersCleared()"
                                    (CloseRequested)="ToggleFilterPanel()"
                                    (MinScoreChanged)="OnMinScoreChanged($any($event))">
                                </mj-search-filter>
                            }
                            @if (FilteredResults.length > 0) {
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
                            } @else {
                                <mj-empty-state
                                    class="search-no-results-inline"
                                    Variant="no-results"
                                    Icon="fa-solid fa-filter-circle-xmark"
                                    Title="No results match current filters. Try lowering the minimum relevance." />
                            }
                        </div>
                    }
                </div>
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
            padding: 5px 24px 5px 8px;
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
        .search-results-body-wrapper {
            position: relative;
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .search-requery-overlay {
            position: absolute;
            inset: 0;
            background: color-mix(in srgb, var(--mj-bg-page) 75%, transparent);
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .search-no-results-inline {
            flex: 1;
        }
        .sr-view-toggle {
            display: flex;
            gap: 2px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            padding: 2px;
            background: var(--mj-bg-surface-sunken);
        }
        .sr-view-toggle .sr-icon-btn {
            border: none;
            border-radius: 4px;
            width: 28px;
            height: 26px;
            font-size: 12px;
            background: transparent;
        }
        .sr-view-toggle .sr-icon-btn.sr-view-active {
            background: var(--mj-bg-surface);
            color: var(--mj-brand-primary);
            box-shadow: 0 1px 2px color-mix(in srgb, var(--mj-text-primary) 10%, transparent);
        }
        .search-cloud-wrapper {
            flex: 1;
            padding: 24px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .search-cloud-wrapper mj-word-cloud {
            width: 100%;
            height: 100%;
            max-height: 600px;
        }
        .streaming-status-strip {
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;
            padding: 0.5rem 1rem;
            border-bottom: 1px solid var(--mj-border-subtle);
        }
        .streaming-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.2rem 0.55rem;
            border-radius: 9999px;
            border: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-size: 0.74rem;
        }
        .streaming-chip-pending {
            color: var(--mj-text-muted);
        }
        .streaming-chip-completed {
            background: color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface));
            border-color: var(--mj-status-success-border);
            color: var(--mj-status-success-text);
        }
        .streaming-chip-error {
            background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
            border-color: var(--mj-status-error-border);
            color: var(--mj-status-error-text);
        }
        .streaming-chip-name { font-weight: 500; }
        .streaming-chip-count { opacity: 0.7; }
        .streaming-chip-time { opacity: 0.6; font-size: 0.7rem; }
    `]
})
export class SearchResultsResource extends BaseResourceComponent {
    private cdr = inject(ChangeDetectorRef);
    private searchService = inject(SearchService);
    private fileOpenService = inject(FileOpenService);

    CurrentQuery = '';
    IsSearching = false;
    HasSearched = false;
    TotalCount = 0;
    ElapsedMs = 0;
    Filters: SearchFilter[] = [];
    ActiveFilters: Record<string, string[]> = {};
    FilteredResults: SearchResultItem[] = [];
    MinScorePercent = 30;
    /** The MinScore that was sent to the server on the last search. If the user
     *  slides below this, we need to re-query the server to get more results. */
    serverMinScorePercent = 30;
    /** How many results the server returned (before client-side filtering) */
    ServerResultCount = 0;
    ShowFilterPanel = true;
    SortField: 'score' | 'title' | 'entity' = 'score';
    ClientFilterText = '';
    ViewMode: 'list' | 'cloud' = 'list';
    CloudItems: WordCloudItem[] = [];
    IsLoadingCloud = false;

    /** All results from the last search (before client-side filtering) */
    private allResults: SearchResultItem[] = [];

    /** Selected scope IDs from the search bar (empty = unscoped/global). */
    private ScopeIDs: string[] = [];

    /**
     * Phase 2C streaming opt-in. Off by default to preserve Phase 1 request-response UX.
     * Enable per-resource via `Data.Configuration.EnableStreaming` or per-tab via the
     * `?stream=1` query param (mostly for engineering verification before flipping the
     * default).
     */
    EnableStreaming = false;

    /** Per-provider stream status displayed above results while a stream is in flight. */
    StreamingProviders: StreamingProviderStatus[] = [];

    /** Active stream subscription so we can cancel on a new search or destroy. */
    private currentStream: Subscription | null = null;

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
        this.registerAgentTools();

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

        // Apply min relevance from the search bar dropdown if provided
        if (config?.MinRelevance != null) {
            const mr = Number(config.MinRelevance);
            if (!isNaN(mr) && mr >= 0 && mr <= 100) {
                this.MinScorePercent = mr;
            }
        }

        // Carry scope selection from the search bar through into the initial query.
        if (Array.isArray(config?.ScopeIDs)) {
            this.ScopeIDs = (config.ScopeIDs as unknown[]).filter((x): x is string => typeof x === 'string');
        }

        // Streaming opt-in: resource config wins; URL query param `?stream=1` is the
        // engineering-verification override (cleared once the default flips). Read the
        // URL directly because the resource's tab config doesn't always mirror URL params
        // into `Configuration.queryParams` at the moment loadFromData() runs.
        if (config?.EnableStreaming === true) {
            this.EnableStreaming = true;
        }
        try {
            const streamParam = new URL(window.location.href).searchParams.get('stream');
            if (streamParam === '1' || streamParam === 'true') {
                this.EnableStreaming = true;
            }
        } catch { /* ignore — server-side render or odd URL */ }

        // Sync min relevance to URL query param
        this.navigationService.UpdateActiveTabQueryParams({ minRelevance: String(this.MinScorePercent) });

        if (this.CurrentQuery) {
            await this.ExecuteSearch(this.CurrentQuery);
        }

        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        this.currentStream?.unsubscribe();
        this.currentStream = null;
        super.ngOnDestroy();
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
        this.MinScorePercent = 30;
        this.navigationService.UpdateActiveTabQueryParams({ minRelevance: '30' });
        this.applyClientFilters();
    }

    OnMinScoreChanged(percent: number): void {
        this.MinScorePercent = percent;
        this.navigationService.UpdateActiveTabQueryParams({ minRelevance: String(percent) });
        if (percent < this.serverMinScorePercent && this.CurrentQuery) {
            // User lowered below what server filtered — need to re-query with lower threshold
            this.ExecuteSearch(this.CurrentQuery);
        } else {
            // User raised or stayed at/above server threshold — client-side filter is sufficient
            this.applyClientFilters();
        }
    }

    /**
     * React to ?minRelevance= changes that arrive after initial load — e.g. a Home pin or
     * deep link to a specific relevance threshold, or browser back/forward — when this tab
     * is re-focused rather than freshly loaded (so loadFromData() does not run again).
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const minRelevance = params['minRelevance'];
        if (minRelevance == null) return;
        const mr = Number(minRelevance);
        if (isNaN(mr) || mr < 0 || mr > 100 || mr === this.MinScorePercent) return;

        this.MinScorePercent = mr;
        if (mr < this.serverMinScorePercent && this.CurrentQuery) {
            // Below what the server filtered — re-query with the lower threshold.
            void this.ExecuteSearch(this.CurrentQuery);
        } else {
            this.applyClientFilters();
        }
    }

    OnResultSelected(event: SearchResultSelectedEvent): void {
        this.navigateToResult(event.Result);
    }

    OnOpenRecord(result: SearchResultItem): void {
        this.navigateToResult(result);
    }

    async OnRefresh(): Promise<void> {
        if (this.CurrentQuery) {
            this.ActiveFilters = {};
            this.MinScorePercent = 30;
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

    SetViewMode(mode: 'list' | 'cloud'): void {
        this.ViewMode = mode;
        if (mode === 'cloud') {
            this.buildCloudItems();
        }
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    OnCloudItemClick(_event: WordCloudItemEvent): void {
        // No-op for now — tag filtering in the filter panel is not yet implemented.
        // Future: clicking a tag could filter results to only those with that tag.
    }

    /**
     * Navigate to a search result based on its ResultType discriminator.
     * - entity-record: opens the MJ entity record viewer
     * - storage-file: opens the file via pre-authenticated URL in new tab
     * - content-item: opens the MJ entity record viewer (content items are entity records)
     */
    private navigateToResult(result: SearchResultItem): void {
        if (result.ResultType === 'storage-file') {
            // Try preview first (opens in provider's web viewer), fall back to download
            if (!this.fileOpenService.OpenPreviewFromSearchResult(result.RawMetadata)) {
                this.fileOpenService.OpenFileFromSearchResult(result.RawMetadata);
            }
            return;
        }

        if (!result.EntityName || !result.RecordID) return;

        // entity-record, content-item, or unset — navigate to entity record
        const pkey = new CompositeKey([{ FieldName: 'ID', Value: result.RecordID }]);
        this.navigationService.OpenEntityRecord(result.EntityName, pkey);
    }

    private async ExecuteSearch(query: string): Promise<void> {
        this.IsSearching = true;
        this.HasSearched = false;
        this.cdr.detectChanges();

        this.serverMinScorePercent = this.MinScorePercent;
        const request: SearchRequest = {
            Query: query,
            MaxResults: 50,
            ActiveFilters: {},
            IncludeSources: ['vector', 'fulltext', 'entity', 'storage'],
            MinScore: this.MinScorePercent / 100
        };
        if (this.ScopeIDs.length > 0) {
            request.ScopeIDs = [...this.ScopeIDs];
        }

        if (this.EnableStreaming) {
            this.executeStreamingSearch(query, request);
            return;
        }

        const response: SearchResponse = await this.searchService.ExecuteSearch(request);

        this.allResults = [...response.Results].sort((a, b) => b.Score - a.Score);
        this.ServerResultCount = this.allResults.length;
        this.TotalCount = response.TotalCount;
        this.ElapsedMs = response.ElapsedMs;
        this.Filters = response.Filters;
        this.FilteredResults = [...this.allResults];

        this.IsSearching = false;
        this.HasSearched = true;
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /**
     * Phase 2C streaming variant. Subscribes to `streamScopedSearch` and progressively
     * populates the result list as each provider reports back. The 'final' event carries
     * the canonical fused/reranked list, which replaces any partials the user already saw.
     *
     * Cancellation: a new query starts by tearing down the in-flight stream so events
     * from a stale search do not bleed into the current view.
     */
    private executeStreamingSearch(query: string, request: SearchRequest): void {
        // Cancel any prior stream so events from a stale query don't leak in.
        this.currentStream?.unsubscribe();
        this.currentStream = null;

        // Reset visible streaming state.
        this.StreamingProviders = [];
        this.allResults = [];
        this.FilteredResults = [];
        this.ServerResultCount = 0;
        this.TotalCount = 0;
        this.ElapsedMs = 0;
        this.cdr.detectChanges();

        this.currentStream = this.searchService.StreamSearch(request).subscribe({
            next: (event) => {
                if (event.Phase === 'provider' && event.ProviderName) {
                    const count = event.Results?.length ?? 0;
                    this.StreamingProviders = [
                        ...this.StreamingProviders,
                        {
                            Name: event.ProviderName,
                            Count: count,
                            ElapsedMs: event.ElapsedMs ?? 0,
                            State: 'Completed',
                        },
                    ];
                    if (event.Results && event.Results.length > 0) {
                        this.allResults = [...this.allResults, ...event.Results].sort((a, b) => b.Score - a.Score);
                        this.ServerResultCount = this.allResults.length;
                        this.applyClientFilters();
                    }
                } else if (event.Phase === 'final' && event.Results) {
                    this.allResults = [...event.Results].sort((a, b) => b.Score - a.Score);
                    this.ServerResultCount = this.allResults.length;
                    this.TotalCount = event.Results.length;
                    this.ElapsedMs = event.ElapsedMs ?? this.ElapsedMs;
                    this.Filters = this.searchService.BuildFilters(this.allResults);
                    this.applyClientFilters();
                    this.HasSearched = true;
                }
                this.cdr.detectChanges();
            },
            error: (err: Error) => {
                this.StreamingProviders = [
                    ...this.StreamingProviders,
                    { Name: 'stream', Count: 0, ElapsedMs: 0, State: 'Error', ErrorMessage: err.message },
                ];
                this.IsSearching = false;
                this.HasSearched = true;
                this.cdr.detectChanges();
            },
            complete: () => {
                this.IsSearching = false;
                this.HasSearched = true;
                this.emitAgentContext();
                this.cdr.detectChanges();
            },
        });
    }

    /**
     * Apply active filter selections to the full result set.
     */
    private applyClientFilters(): void {
        let results = this.allResults;

        // Apply min score filter FIRST (this determines what's "available")
        if (this.MinScorePercent > 0) {
            const minScore = this.MinScorePercent / 100;
            results = results.filter(r => r.Score >= minScore);
        }

        // Rebuild filters from score-filtered results so counts are accurate
        this.Filters = this.searchService.BuildFilters(results);
        this.TotalCount = results.length;

        // Apply facet filters
        if (this.hasActiveFilters()) {
            results = results.filter(r => this.matchesActiveFilters(r));
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
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    private hasActiveFilters(): boolean {
        return Object.values(this.ActiveFilters).some(v => v.length > 0);
    }

    private matchesActiveFilters(result: SearchResultItem): boolean {
        const entityFilter = this.ActiveFilters['Entity'];
        if (entityFilter?.length) {
            const matchesEntity = entityFilter.includes(result.EntityName);
            const matchesFiles = entityFilter.includes('__storage-files__') && result.ResultType === 'storage-file';
            if (!matchesEntity && !matchesFiles) return false;
        }

        const sourceFilter = this.ActiveFilters['Source'];
        if (sourceFilter?.length && !sourceFilter.includes(result.SourceType)) {
            return false;
        }

        const tagFilter = this.ActiveFilters['Tags'];
        if (tagFilter?.length && !tagFilter.some(t => result.Tags.includes(t))) {
            return false;
        }

        const fileTypeFilter = this.ActiveFilters['File Type'];
        if (fileTypeFilter?.length) {
            if (result.ResultType !== 'storage-file') return false;
            const ext = result.Title?.split('.').pop()?.toUpperCase() ?? '';
            if (!fileTypeFilter.includes(ext)) return false;
        }

        return true;
    }

    /**
     * Build WordCloudItem[] from search results by extracting entity names and tags,
     * weighted by their frequency across all results.
     */
    /**
     * Build word cloud items from MJ: Tagged Items linked to the search results.
     * Queries the TaggedItem entity for all records in the result set, aggregates
     * tag names by count and weight, and builds WordCloudItem[] for the cloud.
     */
    private async buildCloudItems(): Promise<void> {
        this.IsLoadingCloud = true;
        this.cdr.detectChanges();

        try {
            // Group results by entity to build efficient queries
            const byEntity = new Map<string, string[]>();
            for (const result of this.allResults) {
                const md = this.ProviderToUse;
                const entity = md.Entities.find(e => e.Name === result.EntityName);
                if (!entity) continue;
                const list = byEntity.get(entity.ID) || [];
                list.push(result.RecordID);
                byEntity.set(entity.ID, list);
            }

            // Query Tagged Items for all record IDs across all entities
            const tagAggregates = new Map<string, { count: number; totalWeight: number }>();
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);

            for (const [entityID, recordIDs] of byEntity) {
                if (recordIDs.length === 0) continue;

                // Build IN clause (batch in groups of 50 to avoid huge queries)
                for (let i = 0; i < recordIDs.length; i += 50) {
                    const batch = recordIDs.slice(i, i + 50);
                    const inClause = batch.map(id => `'${id.replace(/'/g, "''")}'`).join(',');

                    const result = await rv.RunView<{ Tag: string; Weight: number }>({
                        EntityName: 'MJ: Tagged Items',
                        ExtraFilter: `EntityID = '${entityID}' AND RecordID IN (${inClause})`,
                        Fields: ['Tag', 'Weight'],
                        ResultType: 'simple'
                    });

                    if (result.Success && result.Results) {
                        for (const row of result.Results) {
                            const tagName = row.Tag;
                            if (!tagName) continue;
                            const existing = tagAggregates.get(tagName) || { count: 0, totalWeight: 0 };
                            existing.count++;
                            existing.totalWeight += (row.Weight ?? 1);
                            tagAggregates.set(tagName, existing);
                        }
                    }
                }
            }

            // Build cloud items from aggregated tags
            if (tagAggregates.size === 0) {
                this.CloudItems = [{ Text: 'No tags found', Weight: 1, Category: 'empty' }];
            } else {
                const maxWeight = Math.max(...Array.from(tagAggregates.values()).map(v => v.totalWeight), 1);
                this.CloudItems = Array.from(tagAggregates.entries())
                    .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
                    .map(([tagName, agg]) => ({
                        Text: tagName,
                        Weight: agg.totalWeight / maxWeight,
                        Category: 'tag',
                        Metadata: { type: 'tag', count: agg.count, totalWeight: agg.totalWeight }
                    }));
            }
        } catch (err) {
            this.CloudItems = [{ Text: 'Error loading tags', Weight: 1, Category: 'error' }];
        }

        this.IsLoadingCloud = false;
        this.cdr.detectChanges();
    }

    /** Report current search state to the AI agent */
    private emitAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            CurrentQuery: this.CurrentQuery || null,
            ResultCount: this.TotalCount,
            FilteredCount: this.FilteredResults.length,
            ElapsedMs: this.ElapsedMs,
            HasSearched: this.HasSearched,
            ShowFilterPanel: this.ShowFilterPanel,
            ViewMode: this.ViewMode,
            SortField: this.SortField,
            MinScorePercent: this.MinScorePercent,
            ClientFilterText: this.ClientFilterText,
            ActiveFilterCount: Object.values(this.ActiveFilters).filter(v => v.length > 0).length,
            TopResults: this.FilteredResults.slice(0, 50).map(r => ({
                Title: r.Title || r.RecordName,
                EntityName: r.EntityName,
                RecordID: r.RecordID,
                Score: Math.round(r.Score * 100),
                SourceType: r.SourceType,
                Snippet: r.Snippet?.substring(0, 100)
            })),
        });
    }

    /** Register client tools the agent can invoke on the search results */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RunSearch',
                Description: 'Execute a search query and display results',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search query text' }
                    },
                    required: ['query']
                },
                Handler: async (params: Record<string, unknown>) => {
                    const query = String(params['query'] ?? '');
                    this.CurrentQuery = query;
                    await this.ExecuteSearch(query);
                    return { Success: true, Data: { ResultCount: this.TotalCount, ElapsedMs: this.ElapsedMs } };
                }
            },
            {
                Name: 'SortResults',
                Description: 'Change the sort order of search results',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        field: { type: 'string', enum: ['score', 'title', 'entity'], description: 'Sort field' }
                    },
                    required: ['field']
                },
                Handler: async (params: Record<string, unknown>) => {
                    this.OnSortChange(String(params['field']));
                    return { Success: true, Data: { SortField: this.SortField } };
                }
            },
            {
                Name: 'FilterWithinResults',
                Description: 'Filter the current results by a keyword (client-side text filter)',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'Filter text (empty string to clear)' }
                    },
                    required: ['text']
                },
                Handler: async (params: Record<string, unknown>) => {
                    this.OnClientFilterTextChange(String(params['text'] ?? ''));
                    return { Success: true, Data: { FilteredCount: this.FilteredResults.length } };
                }
            },
            {
                Name: 'SetViewMode',
                Description: 'Switch between list view and tag cloud visualization',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        mode: { type: 'string', enum: ['list', 'cloud'], description: 'View mode' }
                    },
                    required: ['mode']
                },
                Handler: async (params: Record<string, unknown>) => {
                    this.SetViewMode((params['mode'] as 'list' | 'cloud') ?? 'list');
                    return { Success: true, Data: { ViewMode: this.ViewMode } };
                }
            },
            {
                Name: 'ToggleFilterPanel',
                Description: 'Show or hide the filter panel on the left',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.ToggleFilterPanel();
                    return { Success: true, Data: { ShowFilterPanel: this.ShowFilterPanel } };
                }
            },
            {
                Name: 'SetMinRelevance',
                Description: 'Set the minimum relevance score filter (0-100 percent)',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        percent: { type: 'number', description: 'Minimum relevance percentage (0-100)' }
                    },
                    required: ['percent']
                },
                Handler: async (params: Record<string, unknown>) => {
                    this.OnMinScoreChanged(Number(params['percent'] ?? 0));
                    return { Success: true, Data: { MinScorePercent: this.MinScorePercent, FilteredCount: this.FilteredResults.length } };
                }
            },
            {
                Name: 'RefreshSearch',
                Description: 'Re-execute the current search query',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.OnRefresh();
                    return { Success: true, Data: { ResultCount: this.TotalCount, ElapsedMs: this.ElapsedMs } };
                }
            }
        ]);
    }
}

export function LoadSearchResultsResource() {
    // Tree-shaking prevention
}
