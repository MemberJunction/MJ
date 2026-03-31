/**
 * @fileoverview Search Results Component
 *
 * Displays search results grouped by source type with expandable sections.
 * Used both within the search overlay and as a standalone results view
 * in the Knowledge Hub search dashboard.
 */

import {
    Component,
    EventEmitter,
    Input,
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { SearchResultItem, SearchResultGroup, SearchResultSelectedEvent } from './search-types';

@Component({
    standalone: false,
    selector: 'mj-search-results',
    templateUrl: './search-results.component.html',
    styleUrls: ['./search-results.component.css']
})
export class SearchResultsComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Grouped search results to display */
    @Input() ResultGroups: SearchResultGroup[] = [];

    /** Whether results are currently loading */
    @Input() IsLoading = false;

    /** Total result count */
    @Input() TotalCount = 0;

    /** Elapsed search time in ms */
    @Input() ElapsedMs = 0;

    /** Maximum results per group before "Show more" */
    @Input() MaxPerGroup = 5;

    /** Whether to show score badges */
    @Input() ShowScores = true;

    /** Whether to show tags */
    @Input() ShowTags = true;

    /** Whether to show source type icons */
    @Input() ShowSourceIcons = true;

    @Output() ResultSelected = new EventEmitter<SearchResultSelectedEvent>();

    /** Emitted when user clicks "Open Record" — parent handles navigation */
    @Output() OpenRecordRequested = new EventEmitter<{ EntityName: string; RecordID: string }>();

    /** Tracks which groups are expanded */
    public ExpandedGroups = new Set<string>();

    /** Set of expanded result card IDs — multiple can be open simultaneously */
    public ExpandedResultIDs = new Set<string>();

    /** Toggle group expansion */
    public ToggleGroup(sourceType: string): void {
        if (this.ExpandedGroups.has(sourceType)) {
            this.ExpandedGroups.delete(sourceType);
        } else {
            this.ExpandedGroups.add(sourceType);
        }
        this.cdr.detectChanges();
    }

    /** Whether a group is expanded */
    public IsGroupExpanded(sourceType: string): boolean {
        return this.ExpandedGroups.has(sourceType);
    }

    /** Get visible results for a group (respecting max per group unless expanded) */
    public GetVisibleResults(group: SearchResultGroup): SearchResultItem[] {
        if (this.IsGroupExpanded(group.SourceType)) {
            return group.Results;
        }
        return group.Results.slice(0, this.MaxPerGroup);
    }

    /** Whether a group has more results than shown */
    public HasMoreResults(group: SearchResultGroup): boolean {
        return group.Results.length > this.MaxPerGroup && !this.IsGroupExpanded(group.SourceType);
    }

    /** Get the count of hidden results */
    public GetHiddenCount(group: SearchResultGroup): number {
        return group.Results.length - this.MaxPerGroup;
    }

    /** Handle clicking a result */
    public OnResultClick(result: SearchResultItem, event: MouseEvent): void {
        this.ResultSelected.emit({
            Result: result,
            OpenInNewTab: event.metaKey || event.ctrlKey
        });
    }

    /** Toggle expand/collapse of a result card — multiple can be open */
    public ToggleExpand(result: SearchResultItem, event?: MouseEvent): void {
        if (event) event.stopPropagation();
        if (this.ExpandedResultIDs.has(result.ID)) {
            this.ExpandedResultIDs.delete(result.ID);
        } else {
            this.ExpandedResultIDs.add(result.ID);
        }
        this.cdr.detectChanges();
    }

    /** Check if a result card is expanded */
    public IsExpanded(resultID: string): boolean {
        return this.ExpandedResultIDs.has(resultID);
    }

    /** Handle "Open Record" button click */
    public OnOpenRecord(result: SearchResultItem, event: MouseEvent): void {
        event.stopPropagation();
        this.OpenRecordRequested.emit({
            EntityName: result.EntityName,
            RecordID: result.RecordID
        });
    }

    /** Format a score as a percentage */
    public FormatScore(score: number): string {
        return `${Math.round(score * 100)}%`;
    }

    /** Format elapsed time */
    public FormatTime(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }
}
