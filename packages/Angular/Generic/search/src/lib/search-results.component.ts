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
import { Metadata, EntityFieldInfo } from '@memberjunction/core';

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
            const md = new Metadata();
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
