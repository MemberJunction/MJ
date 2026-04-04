import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { RunView, BaseEntity } from '@memberjunction/core';
import { MJTaggedItemEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { WordCloudItem, WordCloudItemEvent } from '@memberjunction/ng-word-cloud';

/** View mode for the tags panel */
type TagViewMode = 'list' | 'cloud';

/**
 * Displays and manages tags for a specific entity record using
 * the MJ: Tagged Items system. Shows a slide-in panel with tag pills
 * weighted by relevance, with a toggle to switch to word cloud view.
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

    public TaggedItems: MJTaggedItemEntity[] = [];
    public IsLoading = true;
    public ViewMode: TagViewMode = 'list';

    /** Word cloud items derived from TaggedItems */
    public CloudItems: WordCloudItem[] = [];

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

    /**
     * Returns an opacity value (0.3 - 1.0) based on the tag weight.
     * Used for visual weight indication on tag pills.
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
     * Converts TaggedItems to WordCloudItem format for the word cloud component.
     */
    private BuildCloudItems(items: MJTaggedItemEntity[]): WordCloudItem[] {
        return items.map(item => ({
            Text: item.Tag,
            Weight: item.Weight,
            Metadata: { TaggedItemID: item.ID, TagID: item.TagID }
        }));
    }
}
