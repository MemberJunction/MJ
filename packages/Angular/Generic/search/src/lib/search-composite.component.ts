/**
 * @fileoverview Search Composite Component
 *
 * Drop-in widget combining SearchInputComponent + SearchSuggestComponent.
 * Handles query debouncing, preview search calls, recent searches,
 * keyboard navigation delegation, and click-outside-to-close.
 */

import {
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ViewChild,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SearchService, RecentSearch } from './search.service';
import { SearchInputComponent } from './search-input.component';
import { SearchSuggestComponent } from './search-suggest.component';
import { SearchResultItem, SearchScopeInfo } from './search-types';

@Component({
    standalone: false,
    selector: 'mj-search-composite',
    templateUrl: './search-composite.component.html',
    styleUrls: ['./search-composite.component.css']
})
export class SearchCompositeComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private elementRef = inject(ElementRef);
    protected searchService = inject(SearchService);
    private destroy$ = new Subject<void>();

    @ViewChild('searchInput') searchInputRef!: SearchInputComponent;
    @ViewChild('searchSuggest') searchSuggestRef!: SearchSuggestComponent;

    // --- Configuration Inputs ---

    /** Placeholder text for the search input */
    @Input() Placeholder = 'Search...';

    /** Whether to show keyboard shortcut hint on the input */
    @Input() ShowShortcutHint = true;

    /** Debounce time in milliseconds for query changes */
    @Input() DebounceMs = 400;

    /** Minimum query length before preview results are fetched */
    @Input() MinQueryLength = 2;

    /** Maximum number of preview results to show in the dropdown */
    @Input() MaxPreviewResults = 8;

    /** Whether to enable live preview search on typing */
    @Input() EnablePreview = true;

    /** Whether to enable recent searches display */
    @Input() EnableRecent = true;

    /**
     * Whether to show the scope selector inline with the search input. When true (default),
     * the composite lazy-loads the list of scopes the current user can see and renders the
     * selector only if at least one scope exists. When zero scopes are visible the selector
     * stays hidden and the UX is identical to the pre-scope unscoped behavior.
     */
    @Input() EnableScopeSelector = true;

    // --- Outputs ---

    /** Emitted when a result is selected from the preview dropdown */
    @Output() ResultSelected = new EventEmitter<SearchResultItem>();

    /** Emitted when the user presses Enter or selects a recent search (full search) */
    @Output() SearchSubmitted = new EventEmitter<string>();

    /** Emitted when the user clicks "See all N results" */
    @Output() SeeAllRequested = new EventEmitter<string>();

    // --- Internal state ---

    public Query = '';
    public IsSuggestOpen = false;

    /** The current min relevance percent from the suggest dropdown filter */
    public get MinRelevancePercent(): number {
        return this.searchSuggestRef?.MinRelevancePercent ?? 0;
    }
    public PreviewResults: SearchResultItem[] = [];
    public RecentSearches: RecentSearch[] = [];
    public PreviewTotalCount = 0;
    public IsPreviewLoading = false;
    private previewSearchVersion = 0;

    /**
     * Scopes the current user can see. Populated by `SearchService.LoadScopes()` on init.
     * When empty, the scope selector is not rendered (unscoped-as-before UX).
     */
    public AvailableScopes: SearchScopeInfo[] = [];

    /** Whether any scope is visible to the current user — drives selector visibility. */
    public HasScopes: boolean = false;

    /**
     * Currently selected scope IDs. Empty array means "Global" / unscoped. Read by the
     * shell (or any parent) on submit via the exposed getter, and mirrored to the server
     * through `SearchRequest.ScopeIDs` on the full submitted search.
     */
    public SelectedScopeIDs: string[] = [];

    ngOnInit(): void {
        this.subscribeToRecentSearches();
        this.searchService.LoadRecentSearches(); // fire-and-forget — loads from UserInfoEngine
        if (this.EnableScopeSelector) {
            this.subscribeToScopes();
            this.searchService.LoadScopes(); // fire-and-forget — populates Scopes$
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // --- Click outside to close ---

    @HostListener('document:mousedown', ['$event'])
    OnDocumentMousedown(event: MouseEvent): void {
        const target = event.target as Node | null;
        if (target && !this.elementRef.nativeElement.contains(target)) {
            this.closeSuggest();
        }
    }

    // --- Keyboard navigation delegation ---

    @HostListener('keydown', ['$event'])
    OnHostKeydown(event: KeyboardEvent): void {
        if (!this.IsSuggestOpen) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.searchSuggestRef?.NavigateDown();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.searchSuggestRef?.NavigateUp();
                break;
            case 'Enter':
                if (this.searchSuggestRef?.HighlightedIndex >= 0) {
                    event.preventDefault();
                    this.searchSuggestRef.SelectHighlighted();
                }
                break;
        }
    }

    // --- Event handlers from child components ---

    /** Handle debounced query changes from the input */
    public OnQueryChange(query: string): void {
        this.Query = query;

        if (query.length >= this.MinQueryLength && this.EnablePreview) {
            this.executePreviewSearch(query);
        } else {
            this.clearPreviewResults();
        }

        this.openSuggest();
    }

    /** Handle Enter press in the input */
    public OnQuerySubmit(query: string): void {
        // If a suggestion is highlighted, select it instead of searching
        if (this.IsSuggestOpen && this.searchSuggestRef && this.searchSuggestRef.HighlightedIndex >= 0) {
            this.searchSuggestRef.SelectHighlighted();
            return;
        }

        if (query.trim().length > 0) {
            this.SearchSubmitted.emit(query.trim());
            this.closeSuggest();
        }
    }

    /** Handle input focus */
    public OnInputFocused(): void {
        this.openSuggest();
    }

    /** Handle Escape press in the input */
    public OnInputEscaped(): void {
        if (this.IsSuggestOpen) {
            this.closeSuggest();
        }
    }

    /** Handle input cleared */
    public OnInputCleared(): void {
        this.Query = '';
        this.clearPreviewResults();
        this.openSuggest();
    }

    /** Handle result selection from suggest dropdown */
    public OnResultSelected(result: SearchResultItem): void {
        this.ResultSelected.emit(result);
        this.closeSuggest();
    }

    /** Handle recent search selection */
    public OnRecentSelected(query: string): void {
        this.Query = query;
        this.SearchSubmitted.emit(query);
        this.closeSuggest();
    }

    /** Handle "See all" click */
    public OnSeeAllRequested(query: string): void {
        this.SeeAllRequested.emit(query);
        this.closeSuggest();
    }

    /** Handle "Clear" recent searches */
    public OnClearRecentRequested(): void {
        this.searchService.ClearRecentSearches();
    }

    /**
     * Relay a selection change from the embedded scope selector to local state. Parents
     * read `SelectedScopeIDs` directly on submit; no output event is needed because
     * scope selection doesn't alter the inline preview (preview stays global for speed).
     */
    public OnScopeSelectionChange(scopeIDs: string[]): void {
        this.SelectedScopeIDs = scopeIDs;
    }

    // --- Private ---

    private openSuggest(): void {
        this.IsSuggestOpen = true;
        this.searchSuggestRef?.ResetHighlight();
        this.cdr.detectChanges();
    }

    private closeSuggest(): void {
        this.IsSuggestOpen = false;
        this.searchSuggestRef?.ResetHighlight();
        this.cdr.detectChanges();
    }

    private subscribeToRecentSearches(): void {
        this.searchService.RecentSearches$
            .pipe(takeUntil(this.destroy$))
            .subscribe(recents => {
                this.RecentSearches = recents;
                this.cdr.detectChanges();
            });
    }

    private subscribeToScopes(): void {
        this.searchService.Scopes$
            .pipe(takeUntil(this.destroy$))
            .subscribe(scopes => {
                this.AvailableScopes = scopes;
                this.HasScopes = scopes.length > 0;
                // Drop any previously-selected scope IDs the user can no longer see.
                if (this.SelectedScopeIDs.length > 0) {
                    const visible = new Set(scopes.map(s => s.ID));
                    const next = this.SelectedScopeIDs.filter(id => visible.has(id));
                    if (next.length !== this.SelectedScopeIDs.length) {
                        this.SelectedScopeIDs = next;
                    }
                }
                this.cdr.detectChanges();
            });
    }

    private async executePreviewSearch(query: string): Promise<void> {
        const version = ++this.previewSearchVersion;
        this.IsPreviewLoading = true;
        this.cdr.detectChanges();

        try {
            const response = await this.searchService.PreviewSearch(query, this.MaxPreviewResults);
            // Only apply if this is still the latest request and query hasn't changed
            if (version === this.previewSearchVersion && this.Query === query) {
                this.PreviewResults = response.Results;
                this.PreviewTotalCount = response.TotalCount;
            }
        } catch {
            if (version === this.previewSearchVersion) {
                this.PreviewResults = [];
                this.PreviewTotalCount = 0;
            }
        } finally {
            if (version === this.previewSearchVersion) {
                this.IsPreviewLoading = false;
                this.cdr.detectChanges();
            }
        }
    }

    private clearPreviewResults(): void {
        this.PreviewResults = [];
        this.PreviewTotalCount = 0;
        this.cdr.detectChanges();
    }
}
