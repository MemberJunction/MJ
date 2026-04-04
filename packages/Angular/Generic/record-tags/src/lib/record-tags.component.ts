import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { RunView, BaseEntity, Metadata, CompositeKey } from '@memberjunction/core';
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
export class RecordTagsComponent implements OnInit {
    @Input() Record!: BaseEntity;
    @Output() PanelClosed = new EventEmitter<void>();
    @Output() RecordNavigate = new EventEmitter<{ EntityName: string; RecordID: string }>();

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

        const rv = new RunView();
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
     * Load related records by finding other records that share the same tags.
     * Groups by entity+recordID and scores by number of shared tags weighted by tag weight.
     */
    private async LoadRelatedRecords(): Promise<void> {
        this.IsLoadingRelated = true;
        const entityID = this.Record.EntityInfo.ID;
        const recordID = this.Record.PrimaryKey.Values();

        try {
            // Get all tag IDs for this record
            const tagIDs = this.TaggedItems
                .map(ti => ti.TagID)
                .filter(id => id != null);

            if (tagIDs.length === 0) {
                this.IsLoadingRelated = false;
                return;
            }

            // Find other records that share these tags
            const tagFilter = tagIDs.map(id => `TagID='${id}'`).join(' OR ');
            const rv = new RunView();
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
                this.IsLoadingRelated = false;
                return;
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

            // Resolve display names using entity metadata
            const md = new Metadata();
            this.RelatedRecords = sorted.map(r => {
                const entityInfo = md.Entities.find(e => e.Name === r.EntityName);
                return {
                    EntityName: r.EntityName,
                    RecordID: r.RecordID,
                    DisplayName: r.EntityName + ' Record', // Will be resolved below
                    EntityIcon: entityInfo?.Icon ?? 'fa-solid fa-table',
                    Score: Math.min(1, r.TotalWeight / this.TaggedItems.length),
                    Source: 'tags' as const,
                    SharedTags: r.SharedTags,
                };
            });

            // Batch resolve record names
            await this.ResolveRelatedRecordNames();
        } catch {
            // Non-fatal
        }

        this.IsLoadingRelated = false;
    }

    /**
     * Resolve display names for related records using GetEntityRecordNames.
     */
    private async ResolveRelatedRecordNames(): Promise<void> {
        const md = new Metadata();
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
        return Math.max(0.3, weight);
    }

    /**
     * Returns a font size multiplier (0.85 - 1.15) based on the tag weight.
     */
    public GetTagFontSize(weight: number): string {
        const size = 0.85 + (weight * 0.3);
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
