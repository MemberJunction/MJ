/**
 * @fileoverview Search Overlay Component
 *
 * A floating search overlay inspired by command palette / Spotlight style.
 * Triggered by Cmd+K (Mac) or Ctrl+K (Windows), appears as a centered
 * floating panel with backdrop blur, search input, and grouped results.
 *
 * Supports keyboard navigation (up/down/enter/escape), filter facets,
 * and responsive mobile layout.
 */

import {
    Component,
    EventEmitter,
    HostListener,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ChangeDetectorRef,
    ElementRef,
    ViewChild,
    inject
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { SearchService } from './search.service';
import {
    SearchResultItem,
    SearchResultGroup,
    SearchFilter,
    SearchRequest,
    SearchResultSelectedEvent,
    SearchFilterChangeEvent,
    SearchExecutedEvent,
} from './search-types';

/**
 * Per-provider streaming status displayed above the results list while a streaming
 * search is in flight. One entry per provider that has reported back. Populated
 * progressively as `streamScopedSearch` emits 'provider' events.
 */
export interface StreamingProviderStatus {
    /** Provider name from the SearchEngine (e.g. 'Vector', 'FullText') */
    Name: string;
    /** Result count contributed by this provider */
    Count: number;
    /** Wall-clock latency for this provider's leg, in milliseconds */
    ElapsedMs: number;
    /** Reported state for this provider */
    State: 'Completed' | 'Error';
    /** Last error message if State is 'Error' */
    ErrorMessage?: string;
}

@Component({
    standalone: false,
    selector: 'mj-search-overlay',
    templateUrl: './search-overlay.component.html',
    styleUrls: ['./search-overlay.component.css']
})
export class SearchOverlayComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    protected searchService = inject(SearchService);
    private destroy$ = new Subject<void>();
    private searchInput$ = new Subject<string>();

    @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

    // --- Configuration Inputs ---

    /** Placeholder text for the search input */
    @Input() Placeholder = 'Search across all your knowledge...';

    /** Maximum number of results to fetch */
    @Input() MaxResults = 25;

    /** Whether the overlay is currently visible */
    private _IsOpen = false;

    @Input()
    set IsOpen(value: boolean) {
        const prev = this._IsOpen;
        this._IsOpen = value;
        if (value && !prev) {
            this.onOverlayOpened();
        }
        if (!value && prev) {
            this.onOverlayClosed();
        }
    }
    get IsOpen(): boolean {
        return this._IsOpen;
    }

    /** Debounce time in ms before search fires */
    @Input() DebounceMs = 400;

    /** Which search sources to include */
    @Input() IncludeSources: ('vector' | 'fulltext' | 'entity')[] = ['vector', 'fulltext', 'entity'];

    /** Whether to show filter facets */
    @Input() ShowFilters = true;

    /** Text for the agent CTA button */
    @Input() AgentCtaText = 'Ask Knowledge Agent';

    /** Whether to show the agent CTA */
    @Input() ShowAgentCta = true;

    /**
     * When true, the overlay subscribes to `SearchService.StreamSearch` instead of awaiting
     * `ExecuteSearch`. Results render progressively as each provider reports back. The
     * per-provider status chip strip becomes visible while the stream is in flight.
     * Defaults to false to preserve the request-response UX that shipped in Phase 1.
     */
    @Input() EnableStreaming = false;

    // --- Outputs ---

    @Output() IsOpenChange = new EventEmitter<boolean>();
    @Output() ResultSelected = new EventEmitter<SearchResultSelectedEvent>();
    @Output() FilterChanged = new EventEmitter<SearchFilterChangeEvent>();
    @Output() SearchExecuted = new EventEmitter<SearchExecutedEvent>();
    @Output() AgentCtaClicked = new EventEmitter<string>();

    // --- Component State ---

    public Query = '';
    public IsSearching = false;
    public ResultGroups: SearchResultGroup[] = [];
    public AllResults: SearchResultItem[] = [];
    public Filters: SearchFilter[] = [];
    public ActiveFilters: Record<string, string[]> = {};
    public TotalCount = 0;
    public ElapsedMs = 0;
    public HighlightedIndex = -1;
    public HasSearched = false;
    private searchVersion = 0;

    /**
     * Per-provider status entries shown above the results list while a streaming search
     * is in flight. One entry per provider that has reported back. Empty when the user
     * is not running a streaming search (or when `EnableStreaming` is false).
     */
    public StreamingProviders: StreamingProviderStatus[] = [];

    /** Active stream subscription so we can cancel on a new search or destroy. */
    private currentStream: Subscription | null = null;

    /** All results flattened for keyboard navigation */
    public get FlatResults(): SearchResultItem[] {
        return this.AllResults;
    }

    ngOnInit(): void {
        this.setupSearchDebounce();
        this.subscribeToSearchState();
    }

    ngOnDestroy(): void {
        this.currentStream?.unsubscribe();
        this.currentStream = null;
        this.destroy$.next();
        this.destroy$.complete();
    }

    // --- Keyboard shortcuts ---

    @HostListener('document:keydown', ['$event'])
    HandleGlobalKeydown(event: KeyboardEvent): void {
        if (this.isToggleShortcut(event)) {
            event.preventDefault();
            this.ToggleOverlay();
            return;
        }
        if (this._IsOpen) {
            this.handleOverlayKeydown(event);
        }
    }

    /** Toggle the overlay open/closed */
    public ToggleOverlay(): void {
        this.IsOpen = !this._IsOpen;
        this.IsOpenChange.emit(this._IsOpen);
    }

    /** Open the overlay */
    public Open(): void {
        if (!this._IsOpen) {
            this.IsOpen = true;
            this.IsOpenChange.emit(true);
        }
    }

    /** Close the overlay */
    public Close(): void {
        if (this._IsOpen) {
            this.IsOpen = false;
            this.IsOpenChange.emit(false);
        }
    }

    /** Handle query input changes */
    public OnQueryInput(value: string): void {
        this.Query = value;
        this.searchInput$.next(value);
    }

    /** Handle clicking a result */
    public OnResultClick(result: SearchResultItem, event: MouseEvent): void {
        this.ResultSelected.emit({
            Result: result,
            OpenInNewTab: event.metaKey || event.ctrlKey
        });
        this.Close();
    }

    /** Handle selecting the highlighted result */
    public SelectHighlighted(): void {
        if (this.HighlightedIndex >= 0 && this.HighlightedIndex < this.FlatResults.length) {
            this.ResultSelected.emit({
                Result: this.FlatResults[this.HighlightedIndex],
                OpenInNewTab: false
            });
            this.Close();
        }
    }

    /** Handle filter option toggle */
    public OnFilterToggle(category: string, value: string): void {
        const current = this.ActiveFilters[category] ?? [];
        const index = current.indexOf(value);
        if (index >= 0) {
            current.splice(index, 1);
        } else {
            current.push(value);
        }
        this.ActiveFilters[category] = current;
        this.FilterChanged.emit({ Category: category, SelectedValues: current });
        this.executeSearch();
    }

    /** Clear all active filters */
    public ClearAllFilters(): void {
        this.ActiveFilters = {};
        this.executeSearch();
    }

    /** Handle clicking the agent CTA */
    public OnAgentCtaClick(): void {
        this.AgentCtaClicked.emit(this.Query);
        this.Close();
    }

    /** Handle clicking the backdrop to close */
    public OnBackdropClick(): void {
        this.Close();
    }

    /** Check if a filter option is active */
    public IsFilterActive(category: string, value: string): boolean {
        return (this.ActiveFilters[category] ?? []).includes(value);
    }

    /** Get a score display value (percentage) */
    public FormatScore(score: number): string {
        return `${Math.round(score * 100)}%`;
    }

    /** Format elapsed time display */
    public FormatElapsedTime(ms: number): string {
        if (ms < 1000) {
            return `${ms}ms`;
        }
        return `${(ms / 1000).toFixed(1)}s`;
    }

    // --- Private Methods ---

    private isToggleShortcut(event: KeyboardEvent): boolean {
        return (event.metaKey || event.ctrlKey) && event.key === 'k';
    }

    private handleOverlayKeydown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                this.Close();
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.moveHighlight(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.moveHighlight(-1);
                break;
            case 'Enter':
                event.preventDefault();
                this.SelectHighlighted();
                break;
        }
    }

    private moveHighlight(direction: number): void {
        const maxIndex = this.FlatResults.length - 1;
        if (maxIndex < 0) return;

        this.HighlightedIndex += direction;
        if (this.HighlightedIndex < 0) {
            this.HighlightedIndex = maxIndex;
        } else if (this.HighlightedIndex > maxIndex) {
            this.HighlightedIndex = 0;
        }
        this.cdr.detectChanges();
    }

    private setupSearchDebounce(): void {
        this.searchInput$
            .pipe(
                debounceTime(this.DebounceMs),
                distinctUntilChanged(),
                takeUntil(this.destroy$)
            )
            .subscribe(() => this.executeSearch());
    }

    private subscribeToSearchState(): void {
        this.searchService.IsSearching$
            .pipe(takeUntil(this.destroy$))
            .subscribe(val => {
                this.IsSearching = val;
                this.cdr.detectChanges();
            });
    }

    private async executeSearch(): Promise<void> {
        const query = this.Query.trim();
        if (!query) {
            this.clearResults();
            return;
        }

        const version = ++this.searchVersion;

        const request: SearchRequest = {
            Query: query,
            MaxResults: this.MaxResults,
            ActiveFilters: this.ActiveFilters,
            IncludeSources: this.IncludeSources,
        };

        if (this.EnableStreaming) {
            this.executeStreamingSearch(query, request, version);
            return;
        }

        const response = await this.searchService.ExecuteSearch(request);

        // Discard results if a newer search was triggered while this one was in-flight
        if (version !== this.searchVersion) {
            return;
        }

        this.AllResults = response.Results;
        this.ResultGroups = response.Groups;
        this.Filters = response.Filters;
        this.TotalCount = response.TotalCount;
        this.ElapsedMs = response.ElapsedMs;
        this.HasSearched = true;
        this.HighlightedIndex = response.Results.length > 0 ? 0 : -1;

        this.SearchExecuted.emit({
            Query: query,
            Filters: this.ActiveFilters,
            ResultCount: response.TotalCount,
            ElapsedMs: response.ElapsedMs,
        });

        this.cdr.detectChanges();
    }

    /**
     * Streaming variant of executeSearch — subscribes to `SearchService.StreamSearch` and
     * progressively updates the result list as each provider reports back. The 'final'
     * event carries the canonical fused/reranked list, which replaces the partials.
     *
     * Cancellation: a new search invocation tears down the in-flight stream via
     * `searchVersion` and `currentStream.unsubscribe()`.
     */
    private executeStreamingSearch(query: string, request: SearchRequest, version: number): void {
        // Tear down any prior stream so we don't get cross-talk between consecutive queries.
        this.currentStream?.unsubscribe();
        this.currentStream = null;

        // Reset visible state for a fresh stream.
        this.StreamingProviders = [];
        this.AllResults = [];
        this.ResultGroups = [];
        this.TotalCount = 0;
        this.ElapsedMs = 0;
        this.HasSearched = true;
        this.HighlightedIndex = -1;
        this.cdr.detectChanges();

        this.currentStream = this.searchService.StreamSearch(request).subscribe({
            next: (event) => {
                if (version !== this.searchVersion) return;

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
                        // Append partials so the user sees the list grow as providers return.
                        this.AllResults = [...this.AllResults, ...event.Results];
                        this.ResultGroups = this.searchService.GroupResults(this.AllResults);
                        this.TotalCount = this.AllResults.length;
                        if (this.HighlightedIndex < 0) {
                            this.HighlightedIndex = 0;
                        }
                    }
                } else if (event.Phase === 'final' && event.Results) {
                    // Replace the appended partials with the canonical fused/reranked list.
                    this.AllResults = event.Results;
                    this.ResultGroups = this.searchService.GroupResults(this.AllResults);
                    this.Filters = this.searchService.BuildFilters(this.AllResults);
                    this.TotalCount = event.Results.length;
                    this.ElapsedMs = event.ElapsedMs ?? this.ElapsedMs;
                    this.HighlightedIndex = event.Results.length > 0 ? 0 : -1;
                }

                this.cdr.detectChanges();
            },
            error: (err: Error) => {
                if (version !== this.searchVersion) return;
                this.StreamingProviders = [
                    ...this.StreamingProviders,
                    { Name: 'stream', Count: 0, ElapsedMs: 0, State: 'Error', ErrorMessage: err.message },
                ];
                this.cdr.detectChanges();
            },
            complete: () => {
                if (version !== this.searchVersion) return;
                this.SearchExecuted.emit({
                    Query: query,
                    Filters: this.ActiveFilters,
                    ResultCount: this.TotalCount,
                    ElapsedMs: this.ElapsedMs,
                });
                this.cdr.detectChanges();
            },
        });
    }

    private clearResults(): void {
        this.AllResults = [];
        this.ResultGroups = [];
        this.Filters = [];
        this.TotalCount = 0;
        this.ElapsedMs = 0;
        this.HasSearched = false;
        this.HighlightedIndex = -1;
        this.cdr.detectChanges();
    }

    private onOverlayOpened(): void {
        // Focus input after view updates
        Promise.resolve().then(() => {
            this.searchInputRef?.nativeElement?.focus();
            this.cdr.detectChanges();
        });
    }

    private onOverlayClosed(): void {
        this.HighlightedIndex = -1;
    }

    /** Check if any filters are active (used by template) */
    public hasActiveFilters(): boolean {
        return Object.values(this.ActiveFilters).some(v => v.length > 0);
    }

    /** Check if a result is currently keyboard-highlighted */
    public isResultHighlighted(result: SearchResultItem): boolean {
        const flatIndex = this.getFlatIndex(result);
        return flatIndex === this.HighlightedIndex;
    }

    /** Get the flat index of a result for keyboard navigation */
    public getFlatIndex(result: SearchResultItem): number {
        return this.FlatResults.indexOf(result);
    }
}
