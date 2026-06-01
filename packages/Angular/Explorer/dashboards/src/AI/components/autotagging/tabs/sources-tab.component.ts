/**
 * @fileoverview Classify · Content Sources tab.
 *
 * Self-contained sub-page: owns its header-interior, the source cards grid,
 * the per-source detail slide-in, and the quick-schedule dialog. Receives the
 * shared raw data needed to build the cards (sources, items, tags, runs, and
 * the cached ScheduledAction + EntityRecordDocument lookups) from the host
 * orchestrator via `@Input()`. Cross-tab concerns — opening the add/edit slide-in
 * form, running the pipeline, opening a content-item detail, and reloading the
 * shared source list after a mutation — bubble up via `@Output()`.
 *
 * Out of scope (stays in the host): the add/edit source slide-in FORM, the
 * pipeline tab, and the Content Duplicates section.
 */
import { Component, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { BaseEntity, CompositeKey, RunView } from '@memberjunction/core';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { KnowledgeHubMetadataEngine, MJScheduledActionEntity, MJScheduledActionParamEntity, MJContentSourceEntity } from '@memberjunction/core-entities';
import {
    SourceCard, SourceDetailInfo, ContentItemDetail, RunHistoryRow, WeightedTag,
    ItemPipelineStatus
} from '../shared/classify.types';
import { formatNumber, formatDate, computeDuration, displayStatus, getSourceTypeIcon, CronToHumanReadable } from '../shared/classify.format';

@Component({
    standalone: false,
    selector: 'classify-sources-tab',
    templateUrl: './sources-tab.component.html',
    styleUrls: ['./sources-tab.component.css']
})
export class ClassifySourcesTabComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    // ── Shared raw inputs (host is the data orchestrator) ──

    /** Raw `MJ: Content Sources` rows — the primary source for the cards. */
    private _sources: Record<string, unknown>[] = [];
    @Input()
    set Sources(value: Record<string, unknown>[]) {
        this._sources = value ?? [];
        this.rebuild();
    }
    get Sources(): Record<string, unknown>[] {
        return this._sources;
    }

    /** Raw `MJ: Content Items` rows — used to count items per source. */
    private _items: Record<string, unknown>[] = [];
    @Input()
    set Items(value: Record<string, unknown>[]) {
        this._items = value ?? [];
        this.rebuild();
    }
    get Items(): Record<string, unknown>[] {
        return this._items;
    }

    /** Raw `MJ: Content Item Tags` rows — used to count tags per source. */
    private _tags: Record<string, unknown>[] = [];
    @Input()
    set Tags(value: Record<string, unknown>[]) {
        this._tags = value ?? [];
        this.rebuild();
    }
    get Tags(): Record<string, unknown>[] {
        return this._tags;
    }

    /** Raw `MJ: Content Process Runs` rows — used to derive last-run + status. */
    private _runs: Record<string, unknown>[] = [];
    @Input()
    set Runs(value: Record<string, unknown>[]) {
        this._runs = value ?? [];
        this.rebuild();
    }
    get Runs(): Record<string, unknown>[] {
        return this._runs;
    }

    /** Accurate total item count from TotalRowCount (used when a single source exists). */
    private _totalItemCount = 0;
    @Input()
    set TotalItemCount(value: number) {
        this._totalItemCount = value ?? 0;
        this.rebuild();
    }
    get TotalItemCount(): number {
        return this._totalItemCount;
    }

    /** Accurate total tag count from TotalRowCount (used when a single source exists). */
    private _totalTagCount = 0;
    @Input()
    set TotalTagCount(value: number) {
        this._totalTagCount = value ?? 0;
        this.rebuild();
    }
    get TotalTagCount(): number {
        return this._totalTagCount;
    }

    /** Cached ScheduledAction entities, keyed by normalized ID, supplied by the host. */
    private _scheduledActions = new Map<string, MJScheduledActionEntity>();
    @Input()
    set ScheduledActions(value: Map<string, MJScheduledActionEntity>) {
        this._scheduledActions = value ?? new Map<string, MJScheduledActionEntity>();
        this.rebuild();
    }
    get ScheduledActions(): Map<string, MJScheduledActionEntity> {
        return this._scheduledActions;
    }

    /** Cache: EntityRecordDocument ID → RecordID, supplied by the host. */
    private _entityRecordDocCache = new Map<string, string>();
    @Input()
    set EntityRecordDocCache(value: Map<string, string>) {
        this._entityRecordDocCache = value ?? new Map<string, string>();
    }
    get EntityRecordDocCache(): Map<string, string> {
        return this._entityRecordDocCache;
    }

    // ── Tab-local view state ──

    public SourceCards: SourceCard[] = [];

    // Source Detail slide-in
    public SelectedSource: SourceDetailInfo | null = null;
    public ShowSourceDetail = false;
    public SourceDetailLoading = false;
    public SourceDetailStatusFilter: ItemPipelineStatus | 'All' = 'All';
    public readonly SourceDetailStatusOptions: (ItemPipelineStatus | 'All')[] = ['All', 'Complete', 'Processing', 'Failed', 'Pending'];
    public SourceDetailPage = 0;
    public readonly SourceDetailPageSize = 10;

    // Schedule dialog
    public ShowScheduleDialog = false;
    public ScheduleSaving = false;
    public SchedulingSourceCard: SourceCard | null = null;
    public ScheduleCron = '0 2 * * *';
    public ScheduleEnabled = true;

    /** Template-facing formatter. */
    public readonly formatNumber = formatNumber;

    // ── Cross-tab intents (host owns the slide-in form, navigation, pipeline) ──

    /** Bubble "add source" up — host opens its slide-in CRUD form. */
    @Output() AddSourceRequested = new EventEmitter<void>();
    /** Bubble "edit source" up — host opens its slide-in CRUD form pre-filled. */
    @Output() EditSourceRequested = new EventEmitter<SourceCard>();
    /** Bubble "run pipeline for source" up — host runs the pipeline for the given source ID. */
    @Output() RunSourceRequested = new EventEmitter<string>();
    /** Bubble "open content item detail" up — host owns the item-detail slide-in. */
    @Output() OpenContentItemRequested = new EventEmitter<ContentItemDetail>();
    /** Fired after a delete / schedule change so the host reloads the shared source list. */
    @Output() DataChanged = new EventEmitter<void>();

    public onAddSource(): void {
        this.AddSourceRequested.emit();
    }

    public onEditSource(card: SourceCard): void {
        this.EditSourceRequested.emit(card);
    }

    public onRunSource(sourceID: string): void {
        this.RunSourceRequested.emit(sourceID);
    }

    // ════════════════════════════════════════════
    // SOURCE CARDS
    // ════════════════════════════════════════════

    /** Rebuild the source card view models from the current inputs. */
    private rebuild(): void {
        const singleSource = this._sources.length === 1;
        const itemCountBySource = singleSource ? null : this.countItemsBySource();
        const tagCountBySource = singleSource ? null : this.countTagsBySource();
        const lastRunBySource = this.getLastRunBySource();

        this.SourceCards = this._sources.map(source => {
            const id = source['ID'] as string;
            const itemCount = singleSource ? this._totalItemCount : (itemCountBySource!.get(id) ?? 0);
            const tagCount = singleSource ? this._totalTagCount : (tagCountBySource!.get(id) ?? 0);
            const avgTags = itemCount > 0 ? (tagCount / itemCount).toFixed(1) : '0';
            const lastRun = lastRunBySource.get(id);
            const typeName = (source['ContentSourceType'] as string) ?? 'Unknown';
            const lastRunStatus = lastRun ? (lastRun['Status'] as string)?.toLowerCase() : null;
            const hasError = lastRunStatus === 'error' || lastRunStatus === 'failed';

            const scheduledActionID = (source['ScheduledActionID'] as string | null) ?? null;
            const scheduledActionName = (source['ScheduledAction'] as string | null) ?? null;
            const cronExpr = scheduledActionID ? this.getScheduledActionCron(scheduledActionID) : null;

            return {
                ID: id,
                Name: (source['Name'] as string) ?? 'Unnamed Source',
                SourceTypeName: typeName,
                ContentTypeName: (source['ContentType'] as string) ?? 'Unknown',
                FileTypeName: (source['ContentFileType'] as string) ?? 'Unknown',
                Icon: getSourceTypeIcon(typeName),
                StatusClass: hasError ? 'error' as const : 'active' as const,
                StatusLabel: hasError ? 'Error' : 'Active',
                URL: (source['URL'] as string) ?? '',
                ItemCount: itemCount,
                TagCount: tagCount,
                AvgTags: avgTags,
                LastRunAgo: lastRun ? this.formatRelativeTime(lastRun['StartTime'] as string) : 'Never',
                ContentSourceTypeID: source['ContentSourceTypeID'] as string,
                ContentTypeID: source['ContentTypeID'] as string,
                ContentFileTypeID: source['ContentFileTypeID'] as string,
                EmbeddingModelID: (source['EmbeddingModelID'] as string) ?? '',
                VectorIndexID: (source['VectorIndexID'] as string) ?? '',
                EntityID: (source['EntityID'] as string) ?? '',
                EntityDocumentID: (source['EntityDocumentID'] as string) ?? '',
                RequiresFileType: this.sourceTypeRequiresFileType(source['ContentSourceTypeID'] as string),
                ScheduledActionID: scheduledActionID,
                ScheduledActionName: scheduledActionName,
                ScheduleDescription: cronExpr ? CronToHumanReadable(cronExpr) : null,
            };
        });
        this.cdr.detectChanges();
    }

    // ── Aggregation utilities (read only the raw inputs) ──

    private countItemsBySource(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of this._items) {
            const sourceId = item['ContentSourceID'] as string;
            if (sourceId) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
        }
        return counts;
    }

    private countTagsBySource(): Map<string, number> {
        const itemSourceMap = new Map<string, string>();
        for (const item of this._items) {
            itemSourceMap.set(item['ID'] as string, item['ContentSourceID'] as string);
        }
        const counts = new Map<string, number>();
        for (const tag of this._tags) {
            const sourceId = itemSourceMap.get(tag['ItemID'] as string);
            if (sourceId) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
        }
        return counts;
    }

    private getLastRunBySource(): Map<string, Record<string, unknown>> {
        const map = new Map<string, Record<string, unknown>>();
        for (const run of this._runs) {
            const sourceId = run['SourceID'] as string;
            if (sourceId && !map.has(sourceId)) {
                map.set(sourceId, run);
            }
        }
        return map;
    }

    private countTagsByItem(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const tag of this._tags) {
            const itemId = NormalizeUUID(tag['ItemID'] as string);
            if (itemId) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
        }
        return counts;
    }

    private getAllWeightedTagsForItem(itemId: string): WeightedTag[] {
        const tags: WeightedTag[] = [];
        for (const tag of this._tags) {
            if (UUIDsEqual(tag['ItemID'] as string, itemId)) {
                tags.push({
                    Tag: tag['Tag'] as string,
                    Weight: Number(tag['Weight'] ?? 1),
                });
            }
        }
        return tags.sort((a, b) => b.Weight - a.Weight);
    }

    /** Check if a source type's Configuration says RequiresFileType !== false */
    private sourceTypeRequiresFileType(sourceTypeID: string): boolean {
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const st = engine.ContentSourceTypes.find(t => UUIDsEqual(t.ID, sourceTypeID));
            return st?.ConfigurationObject?.RequiresFileType !== false;
        } catch {
            return true;
        }
    }

    /** Resolve the entity record ID from the EntityRecordDocument for entity-sourced content items */
    private resolveEntityRecordID(item: Record<string, unknown>): string | null {
        const erdID = item['EntityRecordDocumentID'] as string | null;
        if (!erdID) return null;
        return this._entityRecordDocCache.get(NormalizeUUID(erdID)) ?? null;
    }

    /** Resolve the entity name for an entity-sourced content source */
    private resolveEntityName(sourceId: string): string | null {
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const source = engine.ContentSources.find(cs => UUIDsEqual(cs.ID, sourceId));
            if (!source?.EntityID) return null;
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, source.EntityID));
            return entityInfo?.Name ?? null;
        } catch {
            return null;
        }
    }

    private resolveEmbeddingModelName(modelId: string): string {
        if (!modelId) return 'System default';
        const aiEngine = AIEngineBase.Instance;
        const model = aiEngine.Models.find(m => UUIDsEqual(m.ID, modelId));
        return model ? model.Name : 'Unknown';
    }

    private resolveVectorIndexName(indexId: string): string {
        if (!indexId) return 'System default';
        const engine = KnowledgeHubMetadataEngine.Instance;
        const idx = engine.GetVectorIndexById(indexId);
        return idx ? idx.Name : 'Unknown';
    }

    /**
     * Infer embedding and tagging pipeline statuses for a content item. Uses tag
     * count + run-history heuristics since dedicated status columns are not yet
     * available on the ContentItem entity.
     */
    private inferPipelineStatuses(
        rawItem: Record<string, unknown>,
        tagCount: number
    ): { EmbeddingStatus: ItemPipelineStatus; TaggingStatus: ItemPipelineStatus } {
        const explicitEmbedding = rawItem['EmbeddingStatus'] as string | undefined;
        const explicitTagging = rawItem['TaggingStatus'] as string | undefined;
        if (explicitEmbedding || explicitTagging) {
            return {
                EmbeddingStatus: this.mapStatusString(explicitEmbedding),
                TaggingStatus: this.mapStatusString(explicitTagging),
            };
        }

        const hasChecksum = !!(rawItem['Checksum'] as string);
        const hasText = !!((rawItem['Text'] as string)?.trim());
        const sourceID = rawItem['ContentSourceID'] as string;
        const lastRun = this._runs.find(r => r['SourceID'] as string === sourceID);
        const lastRunFailed = lastRun &&
            ((lastRun['Status'] as string)?.toLowerCase() === 'error' ||
             (lastRun['Status'] as string)?.toLowerCase() === 'failed');

        let embeddingStatus: ItemPipelineStatus = 'Pending';
        if (hasChecksum || hasText) embeddingStatus = 'Complete';
        else if (lastRunFailed) embeddingStatus = 'Failed';

        let taggingStatus: ItemPipelineStatus = 'Pending';
        if (tagCount > 0) taggingStatus = 'Complete';
        else if (embeddingStatus === 'Complete') taggingStatus = lastRunFailed ? 'Failed' : 'Pending';
        else if (lastRunFailed) taggingStatus = 'Failed';

        return { EmbeddingStatus: embeddingStatus, TaggingStatus: taggingStatus };
    }

    private mapStatusString(status: string | undefined): ItemPipelineStatus {
        if (!status) return 'Pending';
        const lower = status.toLowerCase();
        if (lower === 'complete' || lower === 'completed' || lower === 'done') return 'Complete';
        if (lower === 'processing' || lower === 'running') return 'Processing';
        if (lower === 'failed' || lower === 'error') return 'Failed';
        return 'Pending';
    }

    public formatRelativeTime(dateStr: string | null | undefined): string {
        if (!dateStr) return 'Never';
        const now = new Date();
        const then = new Date(dateStr);
        const diffMs = now.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    /** Looks up the cron expression for a cached ScheduledAction by ID */
    private getScheduledActionCron(scheduledActionID: string): string | null {
        const cached = this._scheduledActions.get(NormalizeUUID(scheduledActionID));
        return cached?.CronExpression ?? null;
    }

    /** Returns the CSS class for a pipeline status badge color */
    public GetStatusBadgeClass(status: ItemPipelineStatus): string {
        switch (status) {
            case 'Complete': return 'at-status-badge-complete';
            case 'Processing': return 'at-status-badge-processing';
            case 'Failed': return 'at-status-badge-failed';
            case 'Pending': return 'at-status-badge-pending';
        }
    }

    // ════════════════════════════════════════════
    // DELETE
    // ════════════════════════════════════════════

    public async DeleteSource(card: SourceCard): Promise<void> {
        if (!confirm(`Delete source "${card.Name}"? This cannot be undone.`)) return;

        try {
            const p = this.ProviderToUse;
            const entity = await p.GetEntityObject<BaseEntity>('MJ: Content Sources', p.CurrentUser);
            await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: card.ID }]));
            const deleted = await entity.Delete();
            if (deleted) {
                MJNotificationService.Instance.CreateSimpleNotification('Source deleted', 'success', 2500);
                this.DataChanged.emit();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to delete source', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    // ════════════════════════════════════════════
    // SCHEDULE DIALOG — Quick Schedule for Source
    // ════════════════════════════════════════════

    public OpenScheduleDialog(card: SourceCard): void {
        this.SchedulingSourceCard = card;
        this.ScheduleCron = '0 2 * * *';
        this.ScheduleEnabled = true;
        this.ShowScheduleDialog = true;
        this.cdr.detectChanges();
    }

    public CloseScheduleDialog(): void {
        this.ShowScheduleDialog = false;
        this.SchedulingSourceCard = null;
        this.cdr.detectChanges();
    }

    /**
     * Saves a new ScheduledAction for the current source, links it via
     * ContentSource.ScheduledActionID, and creates the default action params
     * for the Autotag and Vectorize action.
     */
    public async SaveSchedule(): Promise<void> {
        if (this.ScheduleSaving || !this.SchedulingSourceCard) return;
        this.ScheduleSaving = true;
        this.cdr.detectChanges();

        const card = this.SchedulingSourceCard;

        try {
            const p = this.ProviderToUse;

            // 1. Find the "Autotag and Vectorize Content" action
            const actionID = await this.findAutotagActionID();
            if (!actionID) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Could not find the "Autotag and Vectorize Content" action. Please check action configuration.',
                    'error', 5000
                );
                return;
            }

            // 2. Create the ScheduledAction
            const scheduledAction = await p.GetEntityObject<MJScheduledActionEntity>('MJ: Scheduled Actions', p.CurrentUser);
            scheduledAction.NewRecord();
            scheduledAction.Name = `Autotag: ${card.Name}`;
            scheduledAction.Description = `Automated classification pipeline for content source "${card.Name}"`;
            scheduledAction.ActionID = actionID;
            scheduledAction.Type = 'Custom';
            scheduledAction.CronExpression = this.ScheduleCron;
            scheduledAction.CustomCronExpression = this.ScheduleCron;
            scheduledAction.Status = this.ScheduleEnabled ? 'Active' : 'Disabled';
            scheduledAction.Timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const saved = await scheduledAction.Save();
            if (!saved) {
                const errorDetail = scheduledAction.LatestResult?.Message ?? 'Unknown error';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to create schedule: ${errorDetail}`, 'error', 5000
                );
                return;
            }

            // 3. Create ScheduledActionParam for sourceIDs
            await this.createSourceIDParam(scheduledAction.ID, actionID, card.ID);

            // 4. Link ScheduledAction to ContentSource
            await this.linkScheduleToSource(card.ID, scheduledAction.ID);

            // 5. Cache the new action for cron display
            this._scheduledActions.set(NormalizeUUID(scheduledAction.ID), scheduledAction);

            MJNotificationService.Instance.CreateSimpleNotification(
                `Schedule created: ${CronToHumanReadable(this.ScheduleCron)}`, 'success', 3000
            );

            this.CloseScheduleDialog();
            this.DataChanged.emit();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[Classify] Schedule creation error:', error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.ScheduleSaving = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Removes the schedule from a source card by unlinking the ScheduledActionID.
     */
    public async RemoveSchedule(card: SourceCard): Promise<void> {
        if (!card.ScheduledActionID) return;
        if (!confirm(`Remove the schedule "${card.ScheduleDescription ?? 'schedule'}" from "${card.Name}"?`)) return;

        try {
            await this.linkScheduleToSource(card.ID, null);
            MJNotificationService.Instance.CreateSimpleNotification('Schedule removed from source', 'success', 2500);
            this.DataChanged.emit();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    /** Returns the human-readable schedule description for a source card. */
    public GetScheduleLabel(card: SourceCard): string {
        return card.ScheduleDescription ?? 'Scheduled';
    }

    /** Returns a human-readable preview of a cron expression for the schedule dialog. */
    public GetCronPreview(cron: string): string {
        return CronToHumanReadable(cron);
    }

    /** Finds the Action ID for "Autotag and Vectorize Content" by querying actions */
    private async findAutotagActionID(): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'Actions',
            ExtraFilter: `Name = 'Autotag and Vectorize Content'`,
            Fields: ['ID'],
            ResultType: 'simple',
            MaxRows: 1,
        });
        if (result.Success && result.Results.length > 0) {
            return result.Results[0].ID;
        }
        return null;
    }

    /**
     * Creates a ScheduledActionParam that passes the source ID to the action.
     * Looks up the "EntityNames" action param and sets the source ID as its value.
     */
    private async createSourceIDParam(scheduledActionID: string, actionID: string, sourceID: string): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const paramResult = await rv.RunView<{ ID: string; Name: string }>({
            EntityName: 'Action Params',
            ExtraFilter: `ActionID = '${actionID}' AND Name = 'EntityNames'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
            MaxRows: 1,
        });

        if (!paramResult.Success || paramResult.Results.length === 0) {
            console.warn('[Classify] Could not find EntityNames action param for source ID scheduling');
            return;
        }

        const p = this.ProviderToUse;
        const param = await p.GetEntityObject<MJScheduledActionParamEntity>('MJ: Scheduled Action Params', p.CurrentUser);
        param.NewRecord();
        param.ScheduledActionID = scheduledActionID;
        param.ActionParamID = paramResult.Results[0].ID;
        param.ValueType = 'Static';
        param.Value = sourceID;

        const saved = await param.Save();
        if (!saved) {
            console.warn('[Classify] Failed to save schedule param:', param.LatestResult?.Message);
        }
    }

    /**
     * Links (or unlinks) a ScheduledAction to a ContentSource by updating
     * the ContentSource.ScheduledActionID field.
     */
    private async linkScheduleToSource(sourceID: string, scheduledActionID: string | null): Promise<void> {
        const p = this.ProviderToUse;
        const entity = await p.GetEntityObject<MJContentSourceEntity>('MJ: Content Sources', p.CurrentUser);
        await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: sourceID }]));
        entity.ScheduledActionID = scheduledActionID;
        const saved = await entity.Save();
        if (!saved) {
            throw new Error(entity.LatestResult?.Message ?? 'Failed to update content source');
        }
    }

    // ════════════════════════════════════════════
    // SOURCE DETAIL SLIDE-IN
    // ════════════════════════════════════════════

    public async OpenSourceDetail(card: SourceCard): Promise<void> {
        this.SourceDetailLoading = true;
        this.SourceDetailPage = 0;
        this.SourceDetailStatusFilter = 'All';
        this.ShowSourceDetail = true;
        this.cdr.detectChanges();

        try {
            const sourceItems = await this.loadContentItemsForSource(card.ID);
            const sourceRuns = await this.loadRunHistoryForSource(card.ID);

            const embeddingModelName = this.resolveEmbeddingModelName(card.EmbeddingModelID);
            const vectorIndexName = this.resolveVectorIndexName(card.VectorIndexID);
            const errorCount = sourceRuns.filter(r => r.StatusClass === 'failed').length;

            this.SelectedSource = {
                ID: card.ID,
                Name: card.Name,
                SourceTypeName: card.SourceTypeName,
                FileTypeName: card.FileTypeName,
                ContentTypeName: card.ContentTypeName,
                RequiresFileType: card.RequiresFileType,
                StatusClass: card.StatusClass,
                StatusLabel: card.StatusLabel,
                Icon: card.Icon,
                URL: card.URL,
                EmbeddingModelName: embeddingModelName,
                VectorIndexName: vectorIndexName,
                ItemCount: card.ItemCount,
                TagCount: card.TagCount,
                AvgTags: card.AvgTags,
                LastRunAgo: card.LastRunAgo,
                ErrorCount: errorCount,
                ContentItems: sourceItems,
                RunHistory: sourceRuns
            };
        } catch (error) {
            console.error('[Autotagging] Error loading source detail:', error);
        } finally {
            this.SourceDetailLoading = false;
            this.cdr.detectChanges();
        }
    }

    public CloseSourceDetail(): void {
        this.ShowSourceDetail = false;
        this.SelectedSource = null;
        this.cdr.detectChanges();
    }

    public OpenContentItemDetail(item: ContentItemDetail): void {
        this.OpenContentItemRequested.emit(item);
    }

    public OpenEditSourceFromDetail(): void {
        if (!this.SelectedSource) return;
        const card = this.SourceCards.find(c => UUIDsEqual(c.ID, this.SelectedSource!.ID));
        if (card) {
            this.CloseSourceDetail();
            this.EditSourceRequested.emit(card);
        }
    }

    public RunSourceFromDetail(): void {
        if (!this.SelectedSource) return;
        const sourceID = this.SelectedSource.ID;
        this.CloseSourceDetail();
        this.RunSourceRequested.emit(sourceID);
    }

    public async DeleteSourceFromDetail(): Promise<void> {
        if (!this.SelectedSource) return;
        const card = this.SourceCards.find(c => UUIDsEqual(c.ID, this.SelectedSource!.ID));
        if (card) {
            this.CloseSourceDetail();
            await this.DeleteSource(card);
        }
    }

    // ── Source-detail filtering + pagination ──

    public get FilteredSourceDetailItems(): ContentItemDetail[] {
        if (!this.SelectedSource) return [];
        const items = this.SourceDetailStatusFilter === 'All'
            ? this.SelectedSource.ContentItems
            : this.SelectedSource.ContentItems.filter(
                  ci => ci.EmbeddingStatus === this.SourceDetailStatusFilter ||
                        ci.TaggingStatus === this.SourceDetailStatusFilter
              );
        const start = this.SourceDetailPage * this.SourceDetailPageSize;
        return items.slice(start, start + this.SourceDetailPageSize);
    }

    public get FilteredSourceDetailTotal(): number {
        if (!this.SelectedSource) return 0;
        if (this.SourceDetailStatusFilter === 'All') return this.SelectedSource.ContentItems.length;
        return this.SelectedSource.ContentItems.filter(
            ci => ci.EmbeddingStatus === this.SourceDetailStatusFilter ||
                  ci.TaggingStatus === this.SourceDetailStatusFilter
        ).length;
    }

    public get SourceDetailTotalPages(): number {
        return Math.max(1, Math.ceil(this.FilteredSourceDetailTotal / this.SourceDetailPageSize));
    }

    public SourceDetailPrevPage(): void {
        if (this.SourceDetailPage > 0) {
            this.SourceDetailPage--;
            this.cdr.detectChanges();
        }
    }

    public SourceDetailNextPage(): void {
        if (this.SourceDetailPage < this.SourceDetailTotalPages - 1) {
            this.SourceDetailPage++;
            this.cdr.detectChanges();
        }
    }

    public OnSourceDetailStatusFilterChange(): void {
        this.SourceDetailPage = 0;
        this.cdr.detectChanges();
    }

    /**
     * Placeholder handler for retrying failed items in source detail. Surfaces a
     * notification; the pipeline re-processes failed items on the next run.
     */
    public RetryFailedItems(): void {
        if (!this.SelectedSource) return;
        const failedCount = this.SelectedSource.ContentItems.filter(
            ci => ci.EmbeddingStatus === 'Failed' || ci.TaggingStatus === 'Failed'
        ).length;
        if (failedCount === 0) {
            MJNotificationService.Instance.CreateSimpleNotification('No failed items to retry', 'info', 2500);
            return;
        }
        MJNotificationService.Instance.CreateSimpleNotification(
            `Retry queued for ${failedCount} failed item${failedCount > 1 ? 's' : ''}. Pipeline will re-process on next run.`,
            'info',
            3000
        );
    }

    private async loadContentItemsForSource(sourceId: string): Promise<ContentItemDetail[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID='${sourceId}'`,
            OrderBy: '__mj_UpdatedAt DESC',
            MaxRows: 100,
            ResultType: 'simple'
        });

        if (!result.Success) return [];

        const tagsByItem = this.countTagsByItem();
        return result.Results.map(item => {
            const itemId = item['ID'] as string;
            const allTags = this.getAllWeightedTagsForItem(itemId);
            const tagCount = tagsByItem.get(itemId) ?? allTags.length;
            const contentSourceTypeID = (item['ContentSourceTypeID'] as string) ?? '';
            const itemStatuses = this.inferPipelineStatuses(item, tagCount);
            return {
                ID: itemId,
                Name: (item['Name'] as string) ?? 'Unnamed',
                SourceName: (item['ContentSource'] as string) ?? '',
                SourceTypeName: (item['ContentSourceType'] as string) ?? '',
                ContentTypeName: (item['ContentType'] as string) ?? '',
                FileTypeName: (item['ContentFileType'] as string) ?? '',
                URL: (item['URL'] as string) ?? '',
                TextContent: (item['Text'] as string) ?? '',
                Checksum: (item['Checksum'] as string) ?? '',
                Tags: allTags,
                CreatedAt: formatDate((item['__mj_CreatedAt'] as string) ?? ''),
                UpdatedAt: formatDate((item['__mj_UpdatedAt'] as string) ?? ''),
                ContentSourceID: sourceId,
                ContentSourceTypeID: contentSourceTypeID,
                StatusDot: tagCount > 0 ? 'complete' : 'processing',
                TagCount: tagCount,
                RequiresContentType: this.sourceTypeRequiresFileType(contentSourceTypeID),
                EntityRecordID: this.resolveEntityRecordID(item),
                EntityName: this.resolveEntityName(sourceId),
                EmbeddingStatus: itemStatuses.EmbeddingStatus,
                TaggingStatus: itemStatuses.TaggingStatus,
            };
        });
    }

    private async loadRunHistoryForSource(sourceId: string): Promise<RunHistoryRow[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: 'MJ: Content Process Runs',
            ExtraFilter: `SourceID='${sourceId}'`,
            OrderBy: 'StartTime DESC',
            MaxRows: 10,
            ResultType: 'simple'
        });

        if (!result.Success) return [];

        return result.Results.map(run => {
            const status = (run['Status'] as string) ?? 'Unknown';
            const startTime = run['StartTime'] as string | null;
            const endTime = run['EndTime'] as string | null;
            const duration = computeDuration(startTime, endTime);
            const processedItems = run['ProcessedItems'] as number | null;
            const errorCount = run['ErrorCount'] as number | null;
            const statusLower = status.toLowerCase();
            const isFailed = statusLower === 'error' || statusLower === 'failed';
            const isRunning = statusLower === 'running' || statusLower === 'processing';
            const hasErrors = (errorCount ?? 0) > 0;

            return {
                ID: run['ID'] as string,
                Status: displayStatus(status),
                StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
                SourceName: (run['Source'] as string) ?? 'Unknown',
                StartedDisplay: startTime ? formatDate(startTime) : '—',
                Duration: duration,
                Items: processedItems != null ? formatNumber(processedItems) : '—',
                Tags: '—',
                Errors: hasErrors ? formatNumber(errorCount!) : (isFailed ? status : '0'),
                ErrorClass: isFailed || hasErrors ? 'run-error-text' : ''
            };
        });
    }
}
