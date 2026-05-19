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
import { EscapeHTML } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

@Component({
    standalone: false,
    selector: 'mj-search-results',
    templateUrl: './search-results.component.html',
    styleUrls: ['./search-results.component.css']
})
export class SearchResultsComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Grouped search results to display (used when DisplayMode is 'grouped') */
    @Input() ResultGroups: SearchResultGroup[] = [];

    /** Flat list of all results sorted by score (used when DisplayMode is 'flat') */
    @Input() FlatResults: SearchResultItem[] = [];

    /** Display mode: 'flat' for blended list sorted by score, 'grouped' for source-type groups */
    @Input() DisplayMode: 'flat' | 'grouped' = 'flat';

    /** Whether results are currently loading */
    @Input() IsLoading = false;

    /** Total result count */
    @Input() TotalCount = 0;

    /** Elapsed search time in ms */
    @Input() ElapsedMs = 0;

    /** Maximum results per group before "Show more" (grouped mode only) */
    @Input() MaxPerGroup = 5;

    /** Results per page in flat mode */
    @Input() PageSize = 10;

    /** Whether to show the results summary line (count + time). Set false when parent provides its own header. */
    @Input() ShowSummary = true;

    /** Whether to show score badges */
    @Input() ShowScores = true;

    /** Whether to show tags */
    @Input() ShowTags = true;

    /** Whether to show source type icons */
    @Input() ShowSourceIcons = true;

    /** Text to highlight within result cards (e.g. from a client-side filter) */
    @Input() HighlightText = '';

    @Output() ResultSelected = new EventEmitter<SearchResultSelectedEvent>();

    /** Emitted when user clicks "Open Record" — parent handles navigation */
    @Output() OpenRecordRequested = new EventEmitter<SearchResultItem>();

    /** Emitted when user clicks "See Similar Items" — parent runs a "more like this" search */
    @Output() MoreLikeThisRequested = new EventEmitter<SearchResultItem>();

    /** Current page (1-based) for flat mode pagination */
    public CurrentPage = 1;

    /** Tracks which groups are expanded */
    public ExpandedGroups = new Set<string>();

    /** Set of expanded result card IDs — multiple can be open simultaneously */
    public ExpandedResultIDs = new Set<string>();

    // ── Flat mode pagination ──

    /** Get results for the current page in flat mode */
    public get PagedResults(): SearchResultItem[] {
        const start = (this.CurrentPage - 1) * this.PageSize;
        return this.FlatResults.slice(start, start + this.PageSize);
    }

    /** Total number of pages */
    public get TotalPages(): number {
        return Math.ceil(this.FlatResults.length / this.PageSize);
    }

    /** Page numbers to display in the pager */
    public get PageNumbers(): number[] {
        const total = this.TotalPages;
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

        const pages: number[] = [1];
        const start = Math.max(2, this.CurrentPage - 2);
        const end = Math.min(total - 1, this.CurrentPage + 2);
        if (start > 2) pages.push(-1); // ellipsis marker
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < total - 1) pages.push(-1); // ellipsis marker
        pages.push(total);
        return pages;
    }

    /** Navigate to a specific page */
    public GoToPage(page: number): void {
        if (page < 1 || page > this.TotalPages) return;
        this.CurrentPage = page;
        this.cdr.detectChanges();
    }

    // ── Grouped mode ──

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
        this.OpenRecordRequested.emit(result);
    }

    /** Handle "See Similar Items" button click — emits the result for a "more like this" search */
    public OnMoreLikeThis(result: SearchResultItem, event: MouseEvent): void {
        event.stopPropagation();
        this.MoreLikeThisRequested.emit(result);
    }

    /**
     * Wrap substrings matching HighlightText in <mark> tags for visual emphasis.
     * The input is regex-escaped so user text is treated as a literal string.
     */
    public HighlightMatch(text: string): string {
        if (!text) return text;
        const safeText = EscapeHTML(text);
        if (!this.HighlightText) return safeText;

        const safeHighlightText = EscapeHTML(this.HighlightText);
        const escaped = safeHighlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        return safeText.replace(regex, '<mark class="search-highlight">$1</mark>');
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

    /** Resolved link cache per result ID */
    private resolvedLinksCache = new Map<string, { Value: string; Label: string; Type: 'URL' | 'Email' }[]>();

    /**
     * Resolve URL and Email fields from the result's RawMetadata using entity ExtendedType metadata.
     * Returns clickable link entries with proper type classification.
     */
    public GetResolvedLinks(result: SearchResultItem): { Value: string; Label: string; Type: 'URL' | 'Email' }[] {
        if (this.resolvedLinksCache.has(result.ID)) {
            return this.resolvedLinksCache.get(result.ID)!;
        }

        const links: { Value: string; Label: string; Type: 'URL' | 'Email' }[] = [];

        if (result.RawMetadata) {
            try {
                const meta = JSON.parse(result.RawMetadata) as Record<string, unknown>;
                const linkFields = this.GetLinkFields(result.EntityName);

                for (const field of linkFields) {
                    const value = meta[field.Name];
                    if (value && typeof value === 'string' && value.trim().length > 0) {
                        links.push({
                            Value: value,
                            Label: field.DisplayName,
                            Type: field.Type
                        });
                    }
                }
            } catch { /* ignore parse errors */ }
        }

        // Fallback: extract URLs from snippet if no ExtendedType fields found
        if (links.length === 0) {
            const urls = this.ExtractUrls(result.Snippet);
            for (const url of urls) {
                links.push({ Value: url, Label: '', Type: 'URL' });
            }
        }

        this.resolvedLinksCache.set(result.ID, links);
        return links;
    }

    /** Extract URLs from snippet text */
    public ExtractUrls(snippet: string): string[] {
        if (!snippet) return [];
        const urlRegex = /https?:\/\/[^\s,;)>"']+/g;
        const matches = snippet.match(urlRegex);
        return matches ? [...new Set(matches)] : [];
    }

    /** Truncate a URL for display */
    public TruncateUrl(url: string): string {
        try {
            const parsed = new URL(url);
            const path = parsed.pathname.length > 30
                ? parsed.pathname.substring(0, 30) + '...'
                : parsed.pathname;
            return parsed.hostname + path;
        } catch {
            return url.length > 50 ? url.substring(0, 50) + '...' : url;
        }
    }

    /** Cache of URL/Email field info per entity name */
    private linkFieldsCache = new Map<string, { Name: string; DisplayName: string; Type: 'URL' | 'Email' }[]>();

    /**
     * Get URL and Email fields for an entity using ExtendedType from entity metadata.
     * Returns fields with ExtendedType='URL' or ExtendedType='Email'.
     */
    public GetLinkFields(entityName: string): { Name: string; DisplayName: string; Type: 'URL' | 'Email' }[] {
        if (this.linkFieldsCache.has(entityName)) {
            return this.linkFieldsCache.get(entityName)!;
        }

        try {
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            if (!entityInfo) {
                this.linkFieldsCache.set(entityName, []);
                return [];
            }

            const linkFields = entityInfo.Fields
                .filter(f => f.ExtendedType === 'URL' || f.ExtendedType === 'Email')
                .map(f => ({
                    Name: f.Name,
                    DisplayName: f.DisplayNameOrName,
                    Type: f.ExtendedType as 'URL' | 'Email'
                }));

            this.linkFieldsCache.set(entityName, linkFields);
            return linkFields;
        } catch {
            this.linkFieldsCache.set(entityName, []);
            return [];
        }
    }
}
