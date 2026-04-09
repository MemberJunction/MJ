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
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { SearchResultItem } from './search-types';
import { RecentSearch } from './search.service';

@Component({
    standalone: false,
    selector: 'mj-search-suggest',
    templateUrl: './search-suggest.component.html',
    styleUrls: ['./search-suggest.component.css']
})
export class SearchSuggestComponent {
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

    // --- Internal state ---

    /** Currently keyboard-highlighted index (-1 for none) */
    public HighlightedIndex = -1;

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

    /** Visible preview results sorted by score descending, capped at MaxPreviewResults */
    public get VisiblePreviewResults(): SearchResultItem[] {
        return [...this.PreviewResults]
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

    /** Check if an item at the given index is highlighted */
    public IsHighlighted(index: number): boolean {
        return this.HighlightedIndex === index;
    }

    /** Format a score value as a percentage */
    public FormatScore(score: number): string {
        return `${Math.round(score * 100)}%`;
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
}
