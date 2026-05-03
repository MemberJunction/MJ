import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { RunView, BaseEntity, CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJTaggedItemEntity, KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { WordCloudItem, WordCloudItemEvent } from '@memberjunction/ng-word-cloud';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** View mode for the tags panel */
type TagViewMode = 'list' | 'cloud';

/** A record related to the current one via shared tags and/or vector similarity */
export interface RelatedRecord {
    /** The entity name */
    EntityName: string;
    /** The record ID (composite key string) */
    RecordID: string;
    /** Human-readable display name */
    DisplayName: string;
    /** Entity icon class */
    EntityIcon: string;
    /** Combined relevance score (0-1) */
    Score: number;
    /** How the relationship was found */
    Source: 'tags' | 'vectors' | 'both';
    /** Shared tag names */
    SharedTags: string[];
}

/**
 * Displays and manages tags for a specific entity record using
 * the MJ: Tagged Items system. Shows a slide-in panel with tag pills
 * weighted by relevance, with a toggle to switch to word cloud view.
 * Includes a Related Records section showing records from any entity
 * that share tags or are vector-similar.
 *
 * Selector: mj-record-tags
 */
@Component({
    standalone: false,
    selector: 'mj-record-tags',
    templateUrl: './record-tags.component.html',
    styleUrls: ['./record-tags.component.css']
})
export class RecordTagsComponent extends BaseAngularComponent implements OnInit {
    @Input() Record!: BaseEntity;
    @Output() PanelClosed = new EventEmitter<void>();
    /** Whether to show the "Open Record" button on related record rows. Default true. */
    @Input() ShowOpenRecordButton = true;

    /** Whether to allow removing tags via X button. Default false. */
    @Input() AllowRemove = false;

    /** Initial panel width in pixels. 0 = use slide panel default. */
    @Input() WidthPx = 0;

    @Output() RecordNavigate = new EventEmitter<{ EntityName: string; RecordID: string }>();
    @Output() WidthChanged = new EventEmitter<number>();

    /** Emitted whenever the tag count changes (after load, add, or remove) */
    @Output() TagCountChanged = new EventEmitter<number>();

    public OnWidthChanged(width: number): void {
        this.WidthChanged.emit(width);
    }

    /**
     * How related records are discovered:
     * - `tags` — Shared tags only
     * - `vectors` — Vector similarity only (requires active EntityDocument)
     * - `both` — Overlays tag and vector signals (default)
     */
    @Input() RelatedRecordsMode: 'tags' | 'vectors' | 'both' = 'both';

    public TaggedItems: MJTaggedItemEntity[] = [];
    public IsLoading = true;
    public ViewMode: TagViewMode = 'list';
    /** Whether the entity has vectors available (active EntityDocument synced) */
    public HasVectors = false;

    /** Word cloud items derived from TaggedItems */
    public CloudItems: WordCloudItem[] = [];

    /** Related records found via shared tags and/or vector similarity */
    public RelatedRecords: RelatedRecord[] = [];
    public IsLoadingRelated = false;
    public ShowRelated = true;

    async ngOnInit(): Promise<void> {
        await this.LoadTags();
    }

    public async LoadTags(): Promise<void> {
        this.IsLoading = true;
        const entityID = this.Record.EntityInfo.ID;
        const recordID = this.Record.PrimaryKey.Values();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<MJTaggedItemEntity>({
            EntityName: 'MJ: Tagged Items',
            ExtraFilter: `EntityID='${entityID}' AND RecordID='${recordID}'`,
            ResultType: 'entity_object'
        });

        if (result.Success) {
            // Sort by weight descending
            this.TaggedItems = result.Results.sort((a, b) => b.Weight - a.Weight);
            this.CloudItems = this.BuildCloudItems(this.TaggedItems);
        }
        this.IsLoading = false;
        this.TagCountChanged.emit(this.TaggedItems.length);

        // Check if entity has vectors available
        this.HasVectors = this.CheckEntityHasVectors();

        // Load related records in background (non-blocking)
        const shouldLoadByTags = this.TaggedItems.length > 0 && this.RelatedRecordsMode !== 'vectors';
        const shouldLoadByVectors = this.HasVectors && this.RelatedRecordsMode !== 'tags';

        if (shouldLoadByTags || shouldLoadByVectors) {
            this.LoadRelatedRecordsCombined(shouldLoadByTags, shouldLoadByVectors);
        }
    }

    /**
     * Check if the current entity has an active EntityDocument with vector sync.
     */
    private CheckEntityHasVectors(): boolean {
        try {
            const entityName = this.Record.EntityInfo.Name;
            const docs = KnowledgeHubMetadataEngine.Instance.GetEntityDocumentsForEntity(entityName);
            return docs.some(d => d.Status === 'Active' && d.VectorDatabaseID != null);
        } catch {
            return false;
        }
    }

    /**
     * Load related records using tags, vectors, or both.
     * Merges results from both sources, combining scores via simple averaging.
     */
    private async LoadRelatedRecordsCombined(useTags: boolean, useVectors: boolean): Promise<void> {
        this.IsLoadingRelated = true;

        const tagResults: RelatedRecord[] = useTags ? await this.LoadTagRelatedRecords() : [];
        const vectorResults: RelatedRecord[] = useVectors ? await this.LoadVectorRelatedRecords() : [];

        // Merge tag and vector results
        const merged = this.MergeRelatedResults(tagResults, vectorResults);
        this.RelatedRecords = merged.slice(0, 10);
        await this.ResolveRelatedRecordNames();

        this.IsLoadingRelated = false;
    }

    /**
     * Merge tag-based and vector-based related records.
     * Records found by both sources get boosted score and Source='both'.
     */
    private MergeRelatedResults(tagResults: RelatedRecord[], vectorResults: RelatedRecord[]): RelatedRecord[] {
        const map = new Map<string, RelatedRecord>();

        for (const r of tagResults) {
            map.set(`${r.EntityName}::${r.RecordID}`, r);
        }

        for (const r of vectorResults) {
            const key = `${r.EntityName}::${r.RecordID}`;
            const existing = map.get(key);
            if (existing) {
                // Found by both — boost score and merge
                existing.Score = Math.min(1, (existing.Score + r.Score) / 1.5); // Weighted average with boost
                existing.Source = 'both';
                // Add any vector-only shared tags
                for (const tag of r.SharedTags) {
                    if (!existing.SharedTags.includes(tag)) {
                        existing.SharedTags.push(tag);
                    }
                }
            } else {
                map.set(key, r);
            }
        }

        return Array.from(map.values()).sort((a, b) => b.Score - a.Score);
    }

    /**
     * Load related records via vector similarity using SearchKnowledge GraphQL mutation.
     * Uses the record's display name as the search query.
     */
    private async LoadVectorRelatedRecords(): Promise<RelatedRecord[]> {
        try {
            const entityName = this.Record.EntityInfo.Name;
            const recordID = this.Record.PrimaryKey.Values();

            // Build a search query from the record's name fields
            const nameFields = this.Record.EntityInfo.Fields
                .filter(f => f.IsNameField)
                .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
            const searchQuery = nameFields
                .map(f => this.Record.Get(f.Name))
                .filter(v => v != null && String(v).trim() !== '')
                .map(v => String(v))
                .join(' ');

            if (!searchQuery || searchQuery.trim().length < 2) return [];

            const gql = `
                mutation SearchKnowledge($query: String!, $maxResults: Float, $filters: SearchFiltersInput) {
                    SearchKnowledge(query: $query, maxResults: $maxResults, filters: $filters) {
                        Success
                        Results {
                            EntityName
                            RecordID
                            Title
                            Score
                            Tags
                            EntityIcon
                        }
                    }
                }
            `;

            const provider = GraphQLDataProvider.Instance;
            const result = await provider.ExecuteGQL(gql, {
                query: searchQuery,
                maxResults: 15,
                filters: { EntityNames: [entityName] }
            });

            const searchResult = (result as Record<string, unknown>)?.['SearchKnowledge'] as {
                Success: boolean;
                Results: Array<{
                    EntityName: string; RecordID: string; Title: string;
                    Score: number; Tags: string[]; EntityIcon: string;
                }>;
            };

            if (!searchResult?.Success) return [];

            // Filter out the current record and map to RelatedRecord
            return searchResult.Results
                .filter(r => r.RecordID !== recordID)
                .map(r => ({
                    EntityName: r.EntityName,
                    RecordID: r.RecordID,
                    DisplayName: r.Title || `${r.EntityName} Record`,
                    EntityIcon: r.EntityIcon || 'fa-solid fa-table',
                    Score: r.Score,
                    Source: 'vectors' as const,
                    SharedTags: r.Tags || [],
                }));
        } catch {
            return [];
        }
    }

    /**
     * Load related records by finding other records that share the same tags.
     * Groups by entity+recordID and scores by number of shared tags weighted by tag weight.
     */
    private async LoadTagRelatedRecords(): Promise<RelatedRecord[]> {
        const entityID = this.Record.EntityInfo.ID;
        const recordID = this.Record.PrimaryKey.Values();

        try {
            // Get all tag IDs for this record
            const tagIDs = this.TaggedItems
                .map(ti => ti.TagID)
                .filter(id => id != null);

            if (tagIDs.length === 0) {
                return [];
            }

            // Find other records that share these tags
            const tagFilter = tagIDs.map(id => `TagID='${id}'`).join(' OR ');
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const relatedResult = await rv.RunView<{
                TagID: string; EntityID: string; RecordID: string;
                Tag: string; Entity: string; Weight: number;
            }>({
                EntityName: 'MJ: Tagged Items',
                ExtraFilter: `(${tagFilter}) AND NOT (EntityID='${entityID}' AND RecordID='${recordID}')`,
                Fields: ['TagID', 'EntityID', 'RecordID', 'Tag', 'Entity', 'Weight'],
                ResultType: 'simple',
                MaxRows: 200
            });

            if (!relatedResult.Success) {
                return [];
            }

            // Group by entity+recordID, accumulate shared tags and score
            const recordMap = new Map<string, {
                EntityName: string; EntityID: string; RecordID: string;
                SharedTags: string[]; TotalWeight: number;
            }>();

            for (const item of relatedResult.Results) {
                const key = `${NormalizeUUID(item.EntityID)}::${item.RecordID}`;
                const existing = recordMap.get(key);
                if (existing) {
                    if (!existing.SharedTags.includes(item.Tag)) {
                        existing.SharedTags.push(item.Tag);
                        existing.TotalWeight += item.Weight;
                    }
                } else {
                    recordMap.set(key, {
                        EntityName: item.Entity,
                        EntityID: item.EntityID,
                        RecordID: item.RecordID,
                        SharedTags: [item.Tag],
                        TotalWeight: item.Weight,
                    });
                }
            }

            // Sort by total weight (more shared tags with higher weights = more related)
            const sorted = Array.from(recordMap.values())
                .sort((a, b) => b.TotalWeight - a.TotalWeight)
                .slice(0, 10);

            // Map to RelatedRecord format
            const md = this.ProviderToUse;
            return sorted.map(r => {
                const entityInfo = md.Entities.find(e => e.Name === r.EntityName);
                return {
                    EntityName: r.EntityName,
                    RecordID: r.RecordID,
                    DisplayName: r.EntityName + ' Record',
                    EntityIcon: entityInfo?.Icon ?? 'fa-solid fa-table',
                    Score: Math.min(1, r.TotalWeight / this.TaggedItems.length),
                    Source: 'tags' as const,
                    SharedTags: r.SharedTags,
                };
            });
        } catch {
            return [];
        }
        this.IsLoadingRelated = false;
    }

    /**
     * Resolve display names for related records using GetEntityRecordNames.
     */
    private async ResolveRelatedRecordNames(): Promise<void> {
        const md = this.ProviderToUse;
        for (const related of this.RelatedRecords) {
            try {
                const entityInfo = md.Entities.find(e => e.Name === related.EntityName);
                if (!entityInfo) continue;

                // Use IsNameField fields to build display name
                const nameFields = entityInfo.Fields
                    .filter(f => f.IsNameField)
                    .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));

                if (nameFields.length > 0) {
                    // Load the record to get name field values
                    const key = new CompositeKey();
                    key.LoadFromURLSegment(entityInfo, related.RecordID);
                    const name = await md.GetEntityRecordName(related.EntityName, key);
                    if (name) {
                        related.DisplayName = name;
                    }
                }
            } catch {
                // Keep the fallback name
            }
        }
    }

    public OnClose(): void {
        this.PanelClosed.emit();
    }

    public async RemoveTag(taggedItem: MJTaggedItemEntity): Promise<void> {
        await taggedItem.Delete();
        this.TaggedItems = this.TaggedItems.filter(t => !UUIDsEqual(t.ID, taggedItem.ID));
        this.CloudItems = this.BuildCloudItems(this.TaggedItems);
        this.TagCountChanged.emit(this.TaggedItems.length);
    }

    public ToggleViewMode(): void {
        this.ViewMode = this.ViewMode === 'list' ? 'cloud' : 'list';
    }

    public OnCloudItemClick(event: WordCloudItemEvent): void {
        // Could navigate to tag detail or filter in future
    }

    public OnRelatedRecordClick(related: RelatedRecord): void {
        this.RecordNavigate.emit({
            EntityName: related.EntityName,
            RecordID: related.RecordID
        });
    }

    /**
     * Returns an opacity value (0.3 - 1.0) based on the tag weight.
     */
    public GetTagOpacity(weight: number): number {
        return Math.max(0.3, Number(weight) ?? 1);
    }

    /**
     * Returns a font size multiplier (0.85 - 1.15) based on the tag weight.
     */
    public GetTagFontSize(weight: number): string {
        const w = Number(weight) ?? 1;
        const size = 0.85 + (w * 0.3);
        return `${size}rem`;
    }

    /**
     * Format the relevance score as a percentage string.
     */
    public FormatScore(score: number): string {
        return `${Math.round(score * 100)}%`;
    }

    /**
     * Converts TaggedItems to WordCloudItem format.
     */
    private BuildCloudItems(items: MJTaggedItemEntity[]): WordCloudItem[] {
        return items.map(item => ({
            Text: item.Tag,
            Weight: item.Weight,
            Metadata: { TaggedItemID: item.ID, TagID: item.TagID }
        }));
    }
}
