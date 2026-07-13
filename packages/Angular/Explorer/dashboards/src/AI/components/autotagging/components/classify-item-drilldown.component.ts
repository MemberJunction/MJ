/**
 * @fileoverview Classify · Content Item Drilldown (Phase 4 audit/analytics).
 *
 * Given a content item (by ID), renders an auditable view of:
 *   (A) basic rendered content / fields,
 *   (B) its tags WITH weight + LLM Reasoning, plus a provenance link to the
 *       AI Prompt Run (`AIPromptRunID`) that produced each tag,
 *   (C) provenance facts (source / entity doc / prompt run), and
 *   (D) a simple audit list (created / last tagged / last embedded).
 *
 * Read-only: all loads use `ResultType:'simple'` + narrow `Fields`. Tags are read
 * from `MJ: Content Item Tags` filtered by `ItemID`. This component owns NO
 * navigation — record-open intents bubble UP via `(OpenRecordRequested)` so the
 * host (which owns NavigationService) opens the full entity form.
 */
import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    ClassifyDrilldownTag,
    ClassifyProvenanceFact,
    ClassifyAuditEntry,
} from '../shared/classify.types';
import { deriveDisplayName, formatWeight, tagFontSize, formatDate } from '../shared/classify.format';

@Component({
    standalone: false,
    selector: 'classify-item-drilldown',
    templateUrl: './classify-item-drilldown.component.html',
    styleUrls: ['./classify-item-drilldown.component.css'],
})
export class ClassifyItemDrilldownComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** The content item to drill into, by ID. Re-loads on change (setter pattern). */
    private _itemID: string | null = null;
    @Input()
    set ItemID(value: string | null) {
        if (value === this._itemID) return;
        this._itemID = value;
        if (value) void this.load(value);
        else this.reset();
    }
    get ItemID(): string | null {
        return this._itemID;
    }

    /** Emitted when the user wants to open a related record (entity + id). */
    @Output() OpenRecordRequested = new EventEmitter<{ entityName: string; recordID: string }>();

    public IsLoading = false;
    public DisplayName = '';
    public SourceName = '';
    public URL = '';
    public TextPreview = '';
    public Tags: ClassifyDrilldownTag[] = [];
    public Provenance: ClassifyProvenanceFact[] = [];
    public Audit: ClassifyAuditEntry[] = [];

    // Template-facing formatters
    public readonly FormatWeight = formatWeight;
    public readonly TagFontSize = tagFontSize;

    /** Max characters of item text shown in the rendered-content preview. */
    private static readonly TEXT_PREVIEW_MAX = 1200;

    public OpenPromptRun(tag: ClassifyDrilldownTag): void {
        if (tag.AIPromptRunID) {
            this.OpenRecordRequested.emit({ entityName: 'MJ: AI Prompt Runs', recordID: tag.AIPromptRunID });
        }
    }

    public OpenProvenanceRecord(fact: ClassifyProvenanceFact): void {
        if (fact.RecordEntity && fact.RecordID) {
            this.OpenRecordRequested.emit({ entityName: fact.RecordEntity, recordID: fact.RecordID });
        }
    }

    public OpenItemRecord(): void {
        if (this._itemID) {
            this.OpenRecordRequested.emit({ entityName: 'MJ: Content Items', recordID: this._itemID });
        }
    }

    private reset(): void {
        this.DisplayName = '';
        this.SourceName = '';
        this.URL = '';
        this.TextPreview = '';
        this.Tags = [];
        this.Provenance = [];
        this.Audit = [];
        this.cdr.detectChanges();
    }

    private async load(itemID: string): Promise<void> {
        this.reset();
        this.IsLoading = true;
        this.cdr.detectChanges();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const [itemResult, tagsResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `ID='${itemID}'`,
                Fields: ['ID', 'Name', 'Description', 'ContentSource', 'ContentSourceID', 'URL', 'Text',
                         'EntityRecordDocumentID', 'EmbeddingStatus', 'TaggingStatus', 'LastTaggedAt',
                         'LastEmbeddedAt', '__mj_CreatedAt'],
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Content Item Tags',
                ExtraFilter: `ItemID='${itemID}'`,
                OrderBy: 'Weight DESC',
                Fields: ['ID', 'Tag', 'Weight', 'Reasoning', 'AIPromptRunID', '__mj_CreatedAt'],
                ResultType: 'simple',
            },
        ], this.ProviderToUse.CurrentUser);

        const item = itemResult.Success && itemResult.Results.length > 0
            ? (itemResult.Results[0] as Record<string, unknown>)
            : null;

        if (item) {
            this.applyItem(item);
        }
        this.applyTags(tagsResult.Success ? (tagsResult.Results as Record<string, unknown>[]) : []);

        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    private applyItem(item: Record<string, unknown>): void {
        this.DisplayName = deriveDisplayName({ Name: item['Name'] as string | null, Description: item['Description'] as string | null });
        this.SourceName = (item['ContentSource'] as string) ?? 'Unknown';
        this.URL = (item['URL'] as string) ?? '';
        const text = (item['Text'] as string) ?? '';
        this.TextPreview = text.length > ClassifyItemDrilldownComponent.TEXT_PREVIEW_MAX
            ? `${text.slice(0, ClassifyItemDrilldownComponent.TEXT_PREVIEW_MAX)}…`
            : text;

        this.buildProvenance(item);
        this.buildAudit(item);
    }

    private applyTags(rows: Record<string, unknown>[]): void {
        this.Tags = rows.map(r => ({
            Tag: (r['Tag'] as string) ?? '',
            Weight: Number(r['Weight'] ?? 0),
            Reasoning: (r['Reasoning'] as string | null) ?? null,
            AIPromptRunID: (r['AIPromptRunID'] as string | null) ?? null,
            CreatedAt: (r['__mj_CreatedAt'] as string) ?? '',
        }));
    }

    private buildProvenance(item: Record<string, unknown>): void {
        const facts: ClassifyProvenanceFact[] = [];

        const sourceID = item['ContentSourceID'] as string | null;
        facts.push({
            Label: 'Content Source',
            Value: this.SourceName,
            Icon: 'fa-solid fa-database',
            ...(sourceID ? { RecordEntity: 'MJ: Content Sources', RecordID: sourceID } : {}),
        });

        const docID = item['EntityRecordDocumentID'] as string | null;
        if (docID) {
            facts.push({
                Label: 'Entity Record Document',
                Value: docID,
                Icon: 'fa-solid fa-file-lines',
                RecordEntity: 'MJ: Entity Record Documents',
                RecordID: docID,
            });
        }

        // Distinct AI Prompt Runs across this item's tags (provenance to the LLM runs).
        const promptRunIDs = new Set<string>();
        for (const t of this.Tags) {
            if (t.AIPromptRunID) promptRunIDs.add(t.AIPromptRunID);
        }
        for (const runID of promptRunIDs) {
            facts.push({
                Label: 'AI Prompt Run',
                Value: runID,
                Icon: 'fa-solid fa-robot',
                RecordEntity: 'MJ: AI Prompt Runs',
                RecordID: runID,
            });
        }

        this.Provenance = facts;
    }

    private buildAudit(item: Record<string, unknown>): void {
        const entries: ClassifyAuditEntry[] = [];
        const created = item['__mj_CreatedAt'] as string | null;
        const lastTagged = item['LastTaggedAt'] as string | null;
        const lastEmbedded = item['LastEmbeddedAt'] as string | null;

        if (created) entries.push({ Label: 'Item created', Timestamp: formatDate(created), Icon: 'fa-solid fa-plus' });
        if (lastTagged) entries.push({ Label: 'Last tagged', Timestamp: formatDate(lastTagged), Icon: 'fa-solid fa-tags' });
        if (lastEmbedded) entries.push({ Label: 'Last embedded', Timestamp: formatDate(lastEmbedded), Icon: 'fa-solid fa-vector-square' });

        this.Audit = entries;
    }
}
