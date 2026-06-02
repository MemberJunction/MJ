/**
 * @fileoverview Classify · Tag Library tab.
 *
 * Self-contained sub-page: owns its header-interior (with the tag search box),
 * the tag rows table, the word cloud, the tags-by-source breakdown, and the
 * per-tag drill-down. Receives the shared raw tag + item rows from the host
 * orchestrator via `[ContentTags]`/`[ContentItems]` and rebuilds its view
 * models from them. Opening a content item from the drill-down is a cross-tab
 * concern owned by the host's slide-in, so it bubbles up via @Output.
 */
import { Component, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { WordCloudItem } from '@memberjunction/ng-word-cloud';
import { TagRow, TagBySource } from '../shared/classify.types';
import { formatWeight, tagFontSize, formatShortDate } from '../shared/classify.format';

/** One row in the per-tag drill-down (content items carrying a given tag). */
interface TagDrillDownItem {
    ID: string;
    Name: string;
    SourceName: string;
    Weight: number;
    UpdatedAt: string;
    FeedIndex: number;
}

@Component({
    standalone: false,
    selector: 'classify-tags-tab',
    templateUrl: './tags-tab.component.html',
    styleUrls: ['./tags-tab.component.css']
})
export class ClassifyTagsTabComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Shared raw `MJ: Content Item Tags` rows, supplied by the host orchestrator. */
    private _contentTags: Record<string, unknown>[] = [];
    @Input()
    set ContentTags(value: Record<string, unknown>[]) {
        this._contentTags = value ?? [];
        this.rebuild();
    }
    get ContentTags(): Record<string, unknown>[] {
        return this._contentTags;
    }

    /** Shared raw `MJ: Content Items` rows — used for source mapping and drill-down. */
    private _contentItems: Record<string, unknown>[] = [];
    @Input()
    set ContentItems(value: Record<string, unknown>[]) {
        this._contentItems = value ?? [];
        this.rebuild();
    }
    get ContentItems(): Record<string, unknown>[] {
        return this._contentItems;
    }

    public TagRows: TagRow[] = [];
    public FilteredTagRows: TagRow[] = [];
    public TagCloudWordItems: WordCloudItem[] = [];
    public TagsBySource: TagBySource[] = [];
    public TagSearchQuery = '';
    public SelectedDrillDownTag: string | null = null;
    public TagDrillDownItems: TagDrillDownItem[] = [];

    /** Subtitle reflects the live tag count, mirroring the former host subtitle. */
    public get Subtitle(): string {
        return `${this.TagRows.length} unique tags across all content sources`;
    }

    // Template-facing formatters (shared pure helpers exposed for the view).
    public readonly TagFontSize = tagFontSize;
    public readonly FormatWeight = formatWeight;

    /** Bubble a request to open a content item's detail slide-in (host-owned). */
    @Output() OpenItemDetailRequested = new EventEmitter<string>();

    public onOpenItemDetail(contentItemID: string): void {
        this.OpenItemDetailRequested.emit(contentItemID);
    }

    /** Rebuild all tag-tab view models from the current inputs. */
    private rebuild(): void {
        this.buildTagRows();
        this.buildTagCloud();
        this.buildTagsBySource();
        this.FilterTags();
    }

    // ── External control surface (host deep-link + agent tool) ──

    /** Apply a search query programmatically (used by the agent tool + deep link). Returns the match count. */
    public ApplySearch(query: string): number {
        this.TagSearchQuery = query;
        this.FilterTags();
        return this.FilteredTagRows.length;
    }

    // ── View-model building ──

    private buildTagRows(): void {
        const tagCounts = this.countAllTags();
        const avgWeights = this.computeAvgWeights();
        const tagSourceMap = this.getTopSourcePerTag();
        const tagFirstSeen = this.getFirstSeenPerTag();
        const sorted = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
        const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

        this.TagRows = sorted.map(([tag, count]) => ({
            Tag: tag,
            UsageCount: count,
            AvgWeight: avgWeights.get(tag) ?? 1.0,
            BarWidthPct: Math.round((count / maxCount) * 100),
            TopSource: tagSourceMap.get(tag) ?? 'Unknown',
            FirstSeen: tagFirstSeen.get(tag) ?? ''
        }));
    }

    private buildTagCloud(): void {
        const tagCounts = this.countAllTags();
        const avgWeights = this.computeAvgWeights();
        // Sort by a combined score: usage count * avg weight (so high-weight, high-count tags bubble up)
        const scored = Array.from(tagCounts.entries()).map(([tag, count]) => {
            const weight = avgWeights.get(tag) ?? 1.0;
            return { tag, count, weight, score: count * weight };
        }).sort((a, b) => b.score - a.score).slice(0, 20);
        const maxScore = scored.length > 0 ? scored[0].score : 1;

        // Build WordCloudItem[] for the mj-word-cloud component
        this.TagCloudWordItems = scored.map(s => ({
            Text: s.tag,
            Weight: maxScore > 0 ? s.score / maxScore : 0,
            Metadata: { Count: s.count, AvgWeight: s.weight }
        }));
    }

    private buildTagsBySource(): void {
        const sourceTagCounts = new Map<string, number>();
        const itemSourceMap = new Map<string, string>();
        for (const item of this._contentItems) {
            itemSourceMap.set(item['ID'] as string, (item['ContentSource'] as string) ?? 'Unknown');
        }
        for (const tag of this._contentTags) {
            const source = itemSourceMap.get(tag['ItemID'] as string) ?? 'Unknown';
            sourceTagCounts.set(source, (sourceTagCounts.get(source) ?? 0) + 1);
        }
        this.TagsBySource = Array.from(sourceTagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ SourceName: name, Count: count }));
    }

    public FilterTags(): void {
        const q = this.TagSearchQuery.toLowerCase().trim();
        this.FilteredTagRows = q
            ? this.TagRows.filter(r => r.Tag.toLowerCase().includes(q))
            : this.TagRows;
        this.cdr.detectChanges();
    }

    /** Drill down into content items matching a specific tag. */
    public DrillDownTag(tagName: string): void {
        if (this.SelectedDrillDownTag === tagName) {
            this.CloseDrillDownTag();
            return;
        }
        this.SelectedDrillDownTag = tagName;

        // Find all content items that have this tag
        const matchingItemIDs = new Map<string, number>(); // itemID → weight
        for (const tag of this._contentTags) {
            if ((tag['Tag'] as string) === tagName) {
                matchingItemIDs.set(
                    NormalizeUUID(tag['ItemID'] as string),
                    Number(tag['Weight'] ?? 1)
                );
            }
        }

        this.TagDrillDownItems = [];
        for (let i = 0; i < this._contentItems.length; i++) {
            const item = this._contentItems[i];
            const normalizedID = NormalizeUUID(item['ID'] as string);
            const weight = matchingItemIDs.get(normalizedID);
            if (weight !== undefined) {
                this.TagDrillDownItems.push({
                    ID: item['ID'] as string,
                    Name: (item['Name'] as string) ?? 'Unnamed',
                    SourceName: (item['ContentSource'] as string) ?? 'Unknown',
                    Weight: weight,
                    UpdatedAt: formatShortDate((item['__mj_UpdatedAt'] as string) ?? ''),
                    FeedIndex: i,
                });
            }
        }

        // Sort by weight descending
        this.TagDrillDownItems.sort((a, b) => b.Weight - a.Weight);
        this.cdr.detectChanges();
    }

    public CloseDrillDownTag(): void {
        this.SelectedDrillDownTag = null;
        this.TagDrillDownItems = [];
        this.cdr.detectChanges();
    }

    // ── Aggregation utilities (read only the tag + item inputs) ──

    private countAllTags(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const tag of this._contentTags) {
            const t = tag['Tag'] as string;
            if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        return counts;
    }

    /** Compute average weight per tag across all occurrences. */
    private computeAvgWeights(): Map<string, number> {
        const sums = new Map<string, number>();
        const counts = new Map<string, number>();
        for (const tag of this._contentTags) {
            const t = tag['Tag'] as string;
            const w = Number(tag['Weight'] ?? 0.5);
            if (t) {
                sums.set(t, (sums.get(t) ?? 0) + w);
                counts.set(t, (counts.get(t) ?? 0) + 1);
            }
        }
        const avgs = new Map<string, number>();
        for (const [t, sum] of sums) {
            avgs.set(t, Math.round((sum / (counts.get(t) ?? 1)) * 100) / 100);
        }
        return avgs;
    }

    private getTopSourcePerTag(): Map<string, string> {
        const tagSourceCounts = new Map<string, Map<string, number>>();
        const itemSourceMap = new Map<string, string>();
        for (const item of this._contentItems) {
            itemSourceMap.set(item['ID'] as string, (item['ContentSource'] as string) ?? 'Unknown');
        }
        for (const tag of this._contentTags) {
            const t = tag['Tag'] as string;
            const source = itemSourceMap.get(tag['ItemID'] as string) ?? 'Unknown';
            if (!tagSourceCounts.has(t)) tagSourceCounts.set(t, new Map());
            const inner = tagSourceCounts.get(t)!;
            inner.set(source, (inner.get(source) ?? 0) + 1);
        }
        const result = new Map<string, string>();
        for (const [tag, sourceCounts] of tagSourceCounts) {
            let maxSource = 'Unknown';
            let maxCount = 0;
            for (const [source, count] of sourceCounts) {
                if (count > maxCount) { maxSource = source; maxCount = count; }
            }
            result.set(tag, maxSource);
        }
        return result;
    }

    private getFirstSeenPerTag(): Map<string, string> {
        const result = new Map<string, string>();
        for (const tag of this._contentTags) {
            const t = tag['Tag'] as string;
            if (t && !result.has(t)) {
                const date = tag['__mj_CreatedAt'] as string;
                result.set(t, date ? formatShortDate(date) : '');
            }
        }
        return result;
    }
}
