/**
 * @fileoverview Search Suggest Component
 *
 * Autocomplete dropdown showing preview results and recent searches.
 * Supports keyboard navigation (up/down/enter) for accessibility.
 * Designed to be paired with SearchInputComponent via SearchCompositeComponent.
 */

import {
    Component,
    EventEmitter,
    Input,
    OnInit,
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { StartupManager } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { SearchResultItem } from './search-types';
import { RecentSearch } from './search.service';
import { MJEventType, MJGlobal } from '@memberjunction/global';

/** User setting key for persisting the preview min relevance threshold */
const PREVIEW_MIN_RELEVANCE_KEY = 'search.previewMinRelevance';

/** Preset options for the min relevance filter */
const MIN_RELEVANCE_OPTIONS = [0, 15, 30, 50, 70];

@Component({
    standalone: false,
    selector: 'mj-search-suggest',
    templateUrl: './search-suggest.component.html',
    styleUrls: ['./search-suggest.component.css']
})
export class SearchSuggestComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    // --- Configuration Inputs ---

    /** Whether the suggest dropdown is visible */
    @Input() IsOpen = false;

    /** Preview search results to display */
    @Input() PreviewResults: SearchResultItem[] = [];

    /** Recent search entries to show when query is empty/short */
    @Input() RecentSearches: RecentSearch[] = [];

    /** Total count of results for the current query (may exceed PreviewResults.length) */
    @Input() TotalCount = 0;

    /** Whether a search is currently loading */
    @Input() IsLoading = false;

    /** Current query text — used to determine whether to show recent vs preview */
    @Input() Query = '';

    /** Minimum query length before preview results are shown */
    @Input() MinQueryLength = 2;

    /** Maximum number of preview results to display */
    @Input() MaxPreviewResults = 8;

    /** Whether to show the recent searches section */
    @Input() ShowRecent = true;

    // --- Outputs ---

    /** Emitted when the user selects a preview result */
    @Output() ResultSelected = new EventEmitter<SearchResultItem>();

    /** Emitted when the user selects a recent search */
    @Output() RecentSelected = new EventEmitter<string>();

    /** Emitted when the user clicks "See all N results" */
    @Output() SeeAllRequested = new EventEmitter<string>();

    /** Emitted when the user clicks "Clear" on recent searches */
    @Output() ClearRecentRequested = new EventEmitter<void>();

    // --- Internal state ---

    /** Currently keyboard-highlighted index (-1 for none) */
    public HighlightedIndex = -1;

    /** Min relevance percentage (0-100) for filtering preview results */
    public MinRelevancePercent = 0;

    /** Whether the filter popover is open */
    public IsFilterOpen = false;

    /** Available min relevance presets */
    public readonly MinRelevanceOptions = MIN_RELEVANCE_OPTIONS;

    // --- Lifecycle ---

    async ngOnInit(): Promise<void> {
        await this.loadMinRelevanceSetting();
    }

    // --- Public Methods ---

    /** Move keyboard highlight up */
    public NavigateUp(): void {
        const maxIndex = this.getNavigableItemCount() - 1;
        if (maxIndex < 0) return;

        this.HighlightedIndex--;
        if (this.HighlightedIndex < 0) {
            this.HighlightedIndex = maxIndex;
        }
        this.cdr.detectChanges();
    }

    /** Move keyboard highlight down */
    public NavigateDown(): void {
        const maxIndex = this.getNavigableItemCount() - 1;
        if (maxIndex < 0) return;

        this.HighlightedIndex++;
        if (this.HighlightedIndex > maxIndex) {
            this.HighlightedIndex = 0;
        }
        this.cdr.detectChanges();
    }

    /** Select the currently highlighted item */
    public SelectHighlighted(): void {
        if (this.HighlightedIndex < 0) return;

        if (this.showRecentSection) {
            // Navigating recent searches
            const visibleRecent = this.VisibleRecentSearches;
            if (this.HighlightedIndex < visibleRecent.length) {
                this.OnRecentClick(visibleRecent[this.HighlightedIndex]);
                return;
            }
        }

        if (this.showPreviewSection) {
            // Navigating preview results
            const offset = this.showRecentSection ? this.VisibleRecentSearches.length : 0;
            const resultIndex = this.HighlightedIndex - offset;
            const visibleResults = this.VisiblePreviewResults;
            if (resultIndex >= 0 && resultIndex < visibleResults.length) {
                this.OnResultClick(visibleResults[resultIndex]);
                return;
            }

            // "See all" footer
            if (resultIndex === visibleResults.length && this.showSeeAllFooter) {
                this.OnSeeAllClick();
            }
        }
    }

    /** Reset the highlighted index */
    public ResetHighlight(): void {
        this.HighlightedIndex = -1;
    }

    // --- Template getters ---

    /** Whether to show recent searches section */
    public get showRecentSection(): boolean {
        return this.ShowRecent && this.Query.length < this.MinQueryLength && this.RecentSearches.length > 0;
    }

    /** Whether to show preview results section */
    public get showPreviewSection(): boolean {
        return this.Query.length >= this.MinQueryLength;
    }

    /** Whether to show the "See all N results" footer */
    public get showSeeAllFooter(): boolean {
        return this.showPreviewSection && this.TotalCount > 0;
    }

    /** Visible recent searches (capped at 5) */
    public get VisibleRecentSearches(): RecentSearch[] {
        return this.RecentSearches.slice(0, 5);
    }

    /** Visible preview results filtered by min relevance, sorted by score descending, capped at MaxPreviewResults */
    public get VisiblePreviewResults(): SearchResultItem[] {
        const minScore = this.MinRelevancePercent / 100;
        return [...this.PreviewResults]
            .filter(r => r.Score >= minScore)
            .sort((a, b) => b.Score - a.Score)
            .slice(0, this.MaxPreviewResults);
    }

    // --- Template event handlers ---

    /** Handle clicking a preview result */
    public OnResultClick(result: SearchResultItem): void {
        this.ResultSelected.emit(result);
    }

    /** Handle clicking a recent search */
    public OnRecentClick(recent: RecentSearch): void {
        this.RecentSelected.emit(recent.Query);
    }

    /** Handle clicking "See all" */
    public OnSeeAllClick(): void {
        this.SeeAllRequested.emit(this.Query);
    }

    /** Handle clicking "Clear" on recent searches */
    public OnClearRecentClick(event: MouseEvent): void {
        event.stopPropagation();
        event.preventDefault();
        this.ClearRecentRequested.emit();
    }

    /** Check if an item at the given index is highlighted */
    public IsHighlighted(index: number): boolean {
        return this.HighlightedIndex === index;
    }

    /** Format a score value as a percentage */
    public FormatScore(score: number): string {
        return `${Math.round(score * 100)}%`;
    }

    /** Get the CSS class for a score value: high (green), medium (amber), low (gray) */
    public GetScoreClass(score: number): string {
        if (score >= 0.40) return 'suggest-score-high';
        if (score >= 0.15) return 'suggest-score-medium';
        return 'suggest-score-low';
    }

    /** Toggle the filter popover */
    public ToggleFilter(event: MouseEvent): void {
        event.stopPropagation();
        event.preventDefault();
        this.IsFilterOpen = !this.IsFilterOpen;
        this.cdr.detectChanges();
    }

    /** Set the min relevance and persist */
    public SetMinRelevance(percent: number, event: MouseEvent): void {
        event.stopPropagation();
        event.preventDefault();
        this.MinRelevancePercent = percent;
        this.IsFilterOpen = false;
        this.persistMinRelevanceSetting(percent);
        this.cdr.detectChanges();
    }

    /** Whether a given option is the currently selected min relevance */
    public IsSelectedRelevance(percent: number): boolean {
        return this.MinRelevancePercent === percent;
    }

    /** Format a relevance option for display */
    public FormatRelevanceOption(percent: number): string {
        return percent === 0 ? 'Show all' : `≥ ${percent}%`;
    }

    // --- Private ---

    private getNavigableItemCount(): number {
        let count = 0;
        if (this.showRecentSection) {
            count += this.VisibleRecentSearches.length;
        }
        if (this.showPreviewSection) {
            count += this.VisiblePreviewResults.length;
            if (this.showSeeAllFooter) {
                count += 1; // "See all" item
            }
        }
        return count;
    }

    private async loadMinRelevanceSetting(): Promise<void> {
        try {
            // Wait for all startup engines (including UserInfoEngine) to finish loading
            MJGlobal.Instance.GetEventListener(true).subscribe( async (event) => {
                switch (event.event) {
                    case MJEventType.LoggedIn:
                        // Wait for StartupManager to complete before refreshing 
                        await StartupManager.Instance.Startup();

                        const engine = UserInfoEngine.Instance;
                        const saved = engine.GetSetting(PREVIEW_MIN_RELEVANCE_KEY);

                        if (saved != null) {
                            const parsed = parseInt(saved, 10);
                            if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                                this.MinRelevancePercent = parsed;
                                this.cdr.detectChanges();
                            }
                        }
                    }
            });
        } catch (err) {
            console.error('[SearchSuggest] loadMinRelevanceSetting error:', err);
        }
    }

    private persistMinRelevanceSetting(percent: number): void {
        try {
            UserInfoEngine.Instance.SetSettingDebounced(PREVIEW_MIN_RELEVANCE_KEY, String(percent));
        } catch {
            // Silently fail if UserInfoEngine not available
        }
    }
}
