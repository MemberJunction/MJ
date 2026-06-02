/**
 * @fileoverview Vector Management Resource Component
 *
 * Dashboard resource for managing vector databases and entity vectorization.
 * Displays KPI cards (total vectors, entities synced, last sync, avg embedding time),
 * an entity sync table, and sidebar panels for DB health, embedding model info,
 * and storage usage.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, Input, ViewChild, ElementRef, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EntityInfo, Metadata, RunView } from '@memberjunction/core';
import {
    ResourceData,
    MJEntityDocumentEntity,
    MJVectorDatabaseEntity,
    MJVectorIndexEntity,
    MJAIModelEntity,
    MJTemplateEntity,
    MJTemplateContentEntity,
    KnowledgeHubMetadataEngine
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ViewToggleOption } from '@memberjunction/ng-ui-components';
import { KPICardData } from '../widgets/kpi-card.component';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJScheduledActionEntity, MJScheduledActionParamEntity } from '@memberjunction/core-entities';
import { CronToHumanReadable } from '../autotagging/shared/classify.format';

/** Flattened row for the entity sync table */
interface EntitySyncRow {
    EntityDocumentID: string;
    EntityName: string;
    DocumentName: string;
    VectorCount: number;
    LastSynced: Date | null;
    Status: 'Synced' | 'Syncing' | 'Error' | 'Pending';
    /** Percent complete during active sync (0-100) */
    PercentComplete: number;
    /** Pipeline run ID for tracking active subscription */
    PipelineRunID?: string;
}

/** Sidebar embedding model summary */
interface EmbeddingModelInfo {
    Name: string;
    Dimensions: number | null;
}

/** Result from AI document suggestion */
interface DocumentSuggestionResult {
    template: string;
    selectedFields: string[];
    selectedRelationships?: { name: string; fields: string[] }[];
    potentialMatchThreshold: number;
    absoluteMatchThreshold: number;
    reasoning: string;
}

@RegisterClass(BaseResourceComponent, 'VectorManagementResource')
@Component({
    standalone: false,
    selector: 'app-vector-management-resource',
    templateUrl: './vector-management-resource.component.html',
    styleUrls: ['./vector-management-resource.component.css']
})
export class VectorManagementResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    protected override navigationService = inject(NavigationService);
    protected override destroy$ = new Subject<void>();

    /** View mode: 'index' = Option A (shared index as hero, entity docs as children),
     *  'operations' = Option C (operations monitoring with real-time sync status) */
    public ViewMode: 'index' | 'operations' = 'index';

    public readonly VectorViewOptions: ViewToggleOption[] = [
        { key: 'index', icon: 'fa-solid fa-cubes', title: 'Index View' },
        { key: 'operations', icon: 'fa-solid fa-gauge-high', title: 'Operations View' }
    ];

    /**
     * When true, renders only the body content (no chrome). Set by parent shells
     * that embed this resource. See plans/explorer-chrome-conventions.md Section 5.
     */
    @Input() HideToolbar = false;

    /** Toggle between view modes */
    public ToggleViewMode(): void {
        this.ViewMode = this.ViewMode === 'index' ? 'operations' : 'index';
        this.cdr.detectChanges();
    }

    // --- Loading state ---
    public IsLoading = true;

    // --- KPI card data ---
    public KPICards: KPICardData[] = [];

    // --- Entity sync table ---
    public SyncRows: EntitySyncRow[] = [];
    public SyncingIds = new Set<string>();

    // --- Sidebar data ---
    public VectorDBName = '';
    public VectorDBStatus: 'Healthy' | 'Degraded' | 'Offline' = 'Healthy';
    public EmbeddingModel: EmbeddingModelInfo = { Name: '', Dimensions: null };
    public StorageUsagePercent = 0;
    public TotalVectors = 0;

    // --- Edit Entity Document Panel ---
    public ShowEditPanel = false;
    public IsEditSaving = false;
    public IsEditDeleting = false;
    public EditDocID = '';
    public EditDocName = '';
    public EditDocEntityName = '';
    public EditDocVectorDBID = '';
    public EditDocAIModelID = '';
    public EditDocVectorIndexID = '';
    public EditDocStatus = '';
    public EditDocTemplate = '';
    public IsEditRegenerating = false;

    /** Parse {{ FieldName }} patterns from the edit panel's template */
    public get EditDocSelectedFields(): string[] {
        if (!this.EditDocTemplate) return [];
        const matches = this.EditDocTemplate.match(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g);
        if (!matches) return [];
        return [...new Set(
            matches.map(m => m.replace(/\{\{\s*/, '').replace(/\s*\}\}/, ''))
        )];
    }

    // --- Zero Vector Indexes Warning ---
    public ShowNoIndexWarning = false;

    /** Open the edit panel for an entity document */
    public async OpenEditPanel(entityDocumentId: string): Promise<void> {
        const doc = this.entityDocuments.find(d => UUIDsEqual(d.ID, entityDocumentId));
        if (!doc) return;
        this.EditDocID = doc.ID;
        this.EditDocName = doc.Name;
        this.EditDocEntityName = doc.Entity || '';
        this.EditDocVectorDBID = doc.VectorDatabaseID;
        this.EditDocAIModelID = doc.AIModelID;
        this.EditDocVectorIndexID = doc.VectorIndexID || '';
        this.EditDocStatus = doc.Status;
        this.EditDocTemplate = '';
        this.IsEditRegenerating = false;
        this.ShowEditPanel = true;
        this.cdr.detectChanges();

        // Load the template text from Template Contents
        await this.loadEditDocTemplate(doc.TemplateID);
    }

    /** Load the template text for the edit panel from the associated Template Contents record */
    private async loadEditDocTemplate(templateId: string): Promise<void> {
        if (!templateId) return;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<{ TemplateText: string }>({
                EntityName: 'MJ: Template Contents',
                ExtraFilter: `TemplateID='${templateId}'`,
                Fields: ['TemplateText'],
                ResultType: 'simple',
                OrderBy: 'Priority ASC',
                MaxRows: 1,
            });
            if (result.Success && result.Results.length > 0 && result.Results[0].TemplateText) {
                this.EditDocTemplate = result.Results[0].TemplateText;
                this.cdr.detectChanges();
            }
        } catch (error) {
            console.warn('[VectorManagement] Could not load template text:', error);
        }
    }

    public CloseEditPanel(): void {
        this.ShowEditPanel = false;
        this.cdr.detectChanges();
    }

    public async SaveEditedDocument(): Promise<void> {
        this.IsEditSaving = true;
        this.cdr.detectChanges();
        try {
            const md = this.ProviderToUse;
            const doc = await md.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents');
            const loaded = await doc.Load(this.EditDocID);
            if (!loaded) throw new Error('Could not load entity document');

            doc.Name = this.EditDocName;
            doc.VectorDatabaseID = this.EditDocVectorDBID;
            doc.AIModelID = this.EditDocAIModelID;
            doc.VectorIndexID = this.EditDocVectorIndexID || null;
            doc.Status = this.EditDocStatus as 'Active' | 'Inactive';

            const saved = await doc.Save();
            if (saved) {
                // Also save updated template text if changed
                await this.saveEditDocTemplate(doc.TemplateID);
                MJNotificationService.Instance.CreateSimpleNotification('Entity document updated', 'success', 2500);
                this.ShowEditPanel = false;
                await this.LoadData();
            } else {
                const msg = doc.LatestResult?.CompleteMessage || 'Unknown error';
                MJNotificationService.Instance.CreateSimpleNotification(`Save failed: ${msg}`, 'error', 5000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.IsEditSaving = false;
            this.cdr.detectChanges();
        }
    }

    /** Save the edited template text back to the Template Contents record */
    private async saveEditDocTemplate(templateId: string): Promise<void> {
        if (!templateId || !this.EditDocTemplate) return;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJTemplateContentEntity>({
                EntityName: 'MJ: Template Contents',
                ExtraFilter: `TemplateID='${templateId}'`,
                ResultType: 'entity_object',
                OrderBy: 'Priority ASC',
                MaxRows: 1,
            });
            if (result.Success && result.Results.length > 0) {
                const content = result.Results[0];
                content.TemplateText = this.EditDocTemplate;
                await content.Save();
            }
        } catch (error) {
            console.warn('[VectorManagement] Could not save template text:', error);
        }
    }

    /** Regenerate the template using AI for the current edit panel entity */
    public async RegenerateTemplate(): Promise<void> {
        if (!this.EditDocEntityName || this.IsEditRegenerating) return;

        this.IsEditRegenerating = true;
        this.cdr.detectChanges();

        try {
            const result = await this.callSuggestionPrompt(this.EditDocEntityName, 'duplicate detection');
            if (result) {
                this.EditDocTemplate = result.template;
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Template regenerated with AI. Review and save to apply.',
                    'info', 3000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Regeneration failed: ${msg}`, 'error', 5000);
        } finally {
            this.IsEditRegenerating = false;
            this.cdr.detectChanges();
        }
    }

    /** Handle template edits from the edit panel's code editor */
    public OnEditTemplateChange(newValue: string): void {
        this.EditDocTemplate = newValue;
    }

    public async DeleteEntityDocument(): Promise<void> {
        this.IsEditDeleting = true;
        this.cdr.detectChanges();
        try {
            const md = this.ProviderToUse;
            const doc = await md.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents');
            const loaded = await doc.Load(this.EditDocID);
            if (!loaded) throw new Error('Could not load entity document');

            const deleted = await doc.Delete();
            if (deleted) {
                MJNotificationService.Instance.CreateSimpleNotification('Entity document deleted', 'success', 2500);
                this.ShowEditPanel = false;
                await this.LoadData();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Delete failed', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.IsEditDeleting = false;
            this.cdr.detectChanges();
        }
    }

    // --- Schedule Sync Dialog ---
    public ShowScheduleSyncDialog = false;
    public ScheduleSyncSaving = false;
    public ScheduleSyncDocID = '';
    public ScheduleSyncDocName = '';
    public ScheduleSyncCron = '0 2 * * *';
    public ScheduleSyncEnabled = true;

    /** Opens the schedule sync dialog for a specific entity document */
    public OpenScheduleSyncDialog(entityDocumentId: string): void {
        const doc = this.entityDocuments.find(d => UUIDsEqual(d.ID, entityDocumentId));
        if (!doc) return;
        this.ScheduleSyncDocID = doc.ID;
        this.ScheduleSyncDocName = doc.Entity || doc.Name;
        this.ScheduleSyncCron = '0 2 * * *';
        this.ScheduleSyncEnabled = true;
        this.ShowScheduleSyncDialog = true;
        this.cdr.detectChanges();
    }

    /** Closes the schedule sync dialog */
    public CloseScheduleSyncDialog(): void {
        this.ShowScheduleSyncDialog = false;
        this.ScheduleSyncDocID = '';
        this.cdr.detectChanges();
    }

    /** Returns a human-readable description of a cron expression */
    public GetScheduleCronPreview(cron: string): string {
        return CronToHumanReadable(cron);
    }

    /** Saves a new ScheduledAction for vectorizing the selected entity document */
    public async SaveScheduleSync(): Promise<void> {
        if (this.ScheduleSyncSaving || !this.ScheduleSyncDocID) return;
        this.ScheduleSyncSaving = true;
        this.cdr.detectChanges();

        try {
            const actionID = await this.findVectorizeActionID();
            if (!actionID) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Could not find the "__VectorizeEntity" action. Please check action configuration.',
                    'error', 5000
                );
                return;
            }

            const md = this.ProviderToUse;

            // Create ScheduledAction
            const scheduledAction = await md.GetEntityObject<MJScheduledActionEntity>('MJ: Scheduled Actions');
            scheduledAction.NewRecord();
            scheduledAction.Name = `Vectorize: ${this.ScheduleSyncDocName}`;
            scheduledAction.Description = `Automated vectorization for entity document "${this.ScheduleSyncDocName}"`;
            scheduledAction.ActionID = actionID;
            scheduledAction.Type = 'Custom';
            scheduledAction.CronExpression = this.ScheduleSyncCron;
            scheduledAction.CustomCronExpression = this.ScheduleSyncCron;
            scheduledAction.Status = this.ScheduleSyncEnabled ? 'Active' : 'Disabled';
            scheduledAction.Timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const saved = await scheduledAction.Save();
            if (!saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to create schedule: ${scheduledAction.LatestResult?.Message ?? 'Unknown error'}`,
                    'error', 5000
                );
                return;
            }

            // Create param linking the entityDocumentID
            await this.createVectorizeScheduleParam(scheduledAction.ID, actionID, this.ScheduleSyncDocID);

            MJNotificationService.Instance.CreateSimpleNotification(
                `Schedule created: ${CronToHumanReadable(this.ScheduleSyncCron)}`, 'success', 3000
            );

            this.CloseScheduleSyncDialog();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.ScheduleSyncSaving = false;
            this.cdr.detectChanges();
        }
    }

    /** Find the __VectorizeEntity action ID */
    private async findVectorizeActionID(): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'Actions',
            ExtraFilter: `Name = '__VectorizeEntity'`,
            Fields: ['ID'],
            ResultType: 'simple',
            MaxRows: 1,
        });
        if (result.Success && result.Results.length > 0) {
            return result.Results[0].ID;
        }
        return null;
    }

    /** Create a ScheduledActionParam linking the entity document ID */
    private async createVectorizeScheduleParam(scheduledActionID: string, actionID: string, entityDocumentID: string): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const paramResult = await rv.RunView<{ ID: string; Name: string }>({
            EntityName: 'Action Params',
            ExtraFilter: `ActionID = '${actionID}' AND Name = 'entityDocumentID'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
            MaxRows: 1,
        });

        if (!paramResult.Success || paramResult.Results.length === 0) {
            console.warn('[VectorManagement] Could not find entityDocumentID action param');
            return;
        }

        const md = this.ProviderToUse;
        const param = await md.GetEntityObject<MJScheduledActionParamEntity>('MJ: Scheduled Action Params');
        param.NewRecord();
        param.ScheduledActionID = scheduledActionID;
        param.ActionParamID = paramResult.Results[0].ID;
        param.ValueType = 'Static';
        param.Value = entityDocumentID;

        const saved = await param.Save();
        if (!saved) {
            console.warn('[VectorManagement] Failed to save schedule param:', param.LatestResult?.Message);
        }
    }

    // --- Suggest Document Dialog ---
    public ShowSuggestDialog = false;
    public IsSuggesting = false;
    public SuggestEntityName = '';
    public SuggestUseCase = 'duplicate detection';
    public SuggestionResult: DocumentSuggestionResult | null = null;
    public SaveDocumentName = '';
    public SuggestionError = '';
    public IsSavingDocument = false;
    public EditableTemplate = '';

    /** Prerequisites check — are vector DB and embedding model configured? */
    public HasVectorDB = false;
    public HasEmbeddingModel = false;
    public get PrerequisitesMet(): boolean {
        return this.HasVectorDB && this.HasEmbeddingModel;
    }

    /** Available embedding models for selection in save form */
    public AvailableEmbeddingModels: { ID: string; Name: string }[] = [];
    /** Selected embedding model ID for the new entity document */
    public SelectedEmbeddingModelID = '';
    /** Selected vector database ID for the new entity document */
    public SelectedVectorDBID = '';
    /** Available vector indexes for selection */
    public AvailableVectorIndexes: { ID: string; Name: string; VectorDatabaseID: string; EmbeddingModelID: string }[] = [];
    /** Selected vector index ID — if user picks an existing one */
    public SelectedVectorIndexID = '';

    /** Indexes filtered by the currently selected vector DB (for create/edit forms) */
    public get FilteredIndexesForSelectedDB(): { ID: string; Name: string; VectorDatabaseID: string; EmbeddingModelID: string }[] {
        const dbId = this.SelectedVectorDBID || this.EditDocVectorDBID;
        if (!dbId) return this.AvailableVectorIndexes;
        return this.AvailableVectorIndexes.filter(i => i.VectorDatabaseID === dbId);
    }

    /** Indexes filtered by the edit panel's selected vector DB */
    public get EditFilteredIndexes(): { ID: string; Name: string; VectorDatabaseID: string; EmbeddingModelID: string }[] {
        if (!this.EditDocVectorDBID) return this.AvailableVectorIndexes;
        return this.AvailableVectorIndexes.filter(i => i.VectorDatabaseID === this.EditDocVectorDBID);
    }

    /** Grouped entity list for the suggestion panel — schemas as groups, entities as items */
    public EntityGroups: { SchemaName: string; Entities: { Name: string; ID: string }[] }[] = [];
    /** Filtered entity groups based on search input */
    public FilteredEntityGroups: { SchemaName: string; Entities: { Name: string; ID: string }[] }[] = [];
    /** Search text for filtering entities */
    public EntitySearchText = '';
    /** Whether the entity picker dropdown is open */
    public ShowEntityPicker = false;
    public SelectedEntityIndex = -1;
    /** Reference to the entity search input for programmatic focus */
    @ViewChild('entitySearchInput') entitySearchInput?: ElementRef<HTMLInputElement>;

    // --- Raw entity data (private) ---
    private entityDocuments: MJEntityDocumentEntity[] = [];
    protected vectorDatabases: MJVectorDatabaseEntity[] = [];
    private vectorIndexes: MJVectorIndexEntity[] = [];
    private aiModels: MJAIModelEntity[] = [];

    /** Lightweight aggregate stats per EntityDocumentID — avoids loading all record documents */
    private erdStats: Map<string, { vectorCount: number; lastSynced: Date | null }> = new Map();

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngAfterViewInit(): Promise<void> {
        await this.LoadData();
        this.navigationService.SetAgentContext(this, {
            TotalVectors: this.TotalVectors,
            KPICount: this.KPICards.length,
        });
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ================================================================
    // BaseResourceComponent overrides
    // ================================================================

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Vector Management';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-database';
    }

    // ================================================================
    // Public Methods
    // ================================================================

    /** Reload all dashboard data */
    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            await this.fetchAllData();
            this.buildSyncRows();
            this.buildKPICards();
            this.buildSidebarData();
            this.checkPrerequisites();
        } catch (error) {
            console.error('[VectorManagement] Error loading data:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Trigger vectorization for a specific entity document via GraphQL (fire-and-forget with progress subscription) */
    public async SyncEntity(entityDocumentId: string): Promise<void> {
        if (this.SyncingIds.has(entityDocumentId)) {
            return;
        }

        const doc = this.entityDocuments.find(d => UUIDsEqual(d.ID, entityDocumentId));
        if (!doc) return;

        const provider = this.ProviderToUse as GraphQLDataProvider;
        if (!provider) return;

        this.addSyncingId(entityDocumentId);
        this.updateRowStatus(entityDocumentId, 'Syncing');
        this.updateRowProgress(entityDocumentId, 0);
        this.cdr.detectChanges();

        try {
            const aiClient = new GraphQLAIClient(provider);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Starting vectorization for ${doc.Entity}...`,
                'info', 3000
            );

            // Step 1: Start the mutation (fire-and-forget — returns PipelineRunID immediately)
            const result = await aiClient.VectorizeEntity({
                entityDocumentID: entityDocumentId,
                entityID: doc.EntityID,
                batchSize: 50
            });

            if (!result.Success || !result.PipelineRunID) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Vectorization failed: ${result.ErrorMessage || 'Unknown error'}`,
                    'error', 5000
                );
                this.removeSyncingId(entityDocumentId);
                this.updateRowStatus(entityDocumentId, 'Error');
                this.cdr.detectChanges();
                return;
            }

            // Store PipelineRunID on the row for tracking
            const row = this.SyncRows.find(r => r.EntityDocumentID === entityDocumentId);
            if (row) {
                row.PipelineRunID = result.PipelineRunID;
            }

            // Step 2: Subscribe to progress updates and also set a safety timeout
            // in case the subscription misses events (race condition, network issue, etc.)
            this.subscribeToPipelineProgress(entityDocumentId, result.PipelineRunID, doc.Entity);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[VectorManagement] Error starting sync for ${entityDocumentId}:`, msg);
            MJNotificationService.Instance.CreateSimpleNotification(`Sync error: ${msg}`, 'error', 5000);
            this.removeSyncingId(entityDocumentId);
            this.updateRowStatus(entityDocumentId, 'Error');
            this.cdr.detectChanges();
        }
    }

    /** Subscribe to PipelineProgress for a specific pipeline run */
    private subscribeToPipelineProgress(entityDocumentId: string, pipelineRunID: string, entityName: string): void {
        const provider = this.ProviderToUse as GraphQLDataProvider;
        const subscriptionQuery = `
            subscription PipelineProgress($pipelineRunID: String!) {
                PipelineProgress(pipelineRunID: $pipelineRunID) {
                    PipelineRunID
                    Stage
                    TotalItems
                    ProcessedItems
                    PercentComplete
                    ElapsedMs
                }
            }
        `;

        let idleTimer: ReturnType<typeof setTimeout> | null = null;

        const finishSync = (success: boolean) => {
            if (idleTimer) clearTimeout(idleTimer);
            rxSub?.unsubscribe();

            // Use setTimeout to defer state changes to the next macrotask,
            // avoiding ExpressionChangedAfterItHasBeenCheckedError.
            // (Promise.resolve microtasks run between Angular's check passes
            // and still trigger NG0100.)
            setTimeout(async () => {
                this.removeSyncingId(entityDocumentId);

                if (success) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Vectorization complete for ${entityName}`,
                        'success', 3000
                    );
                    await this.refreshSyncRow(entityDocumentId);
                } else {
                    this.updateRowStatus(entityDocumentId, 'Error');
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Vectorization failed for ${entityName}`,
                        'error', 5000
                    );
                }
                this.cdr.detectChanges();
            });
        };

        // Reset idle timer on every event. When no events arrive for 5s,
        // assume the pipeline is done (handles missing 'complete' event).
        const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                if (this.SyncingIds.has(entityDocumentId)) {
                    finishSync(true);
                }
            }, 5000);
        };

        // Start the idle timer immediately in case no events ever arrive
        resetIdleTimer();

        const sub = provider.subscribe(subscriptionQuery, { pipelineRunID });
        const rxSub = sub.pipe(takeUntil(this.destroy$)).subscribe({
            next: (data: Record<string, unknown>) => {
                const progress = (data as Record<string, Record<string, unknown>>)['PipelineProgress'];
                if (!progress) return;

                const stage = progress['Stage'] as string;
                const pct = progress['PercentComplete'] as number;

                this.updateRowProgress(entityDocumentId, pct);
                this.cdr.detectChanges();

                if (stage === 'complete') {
                    finishSync(true);
                } else if (stage === 'error') {
                    finishSync(false);
                } else {
                    // Got a progress event — reset idle timer
                    resetIdleTimer();
                }
            },
            error: (err: unknown) => {
                console.error(`[VectorManagement] Pipeline subscription error:`, err);
                finishSync(false);
            }
        });
    }

    /**
     * Add an ID to SyncingIds, creating a new Set reference so Angular
     * change detection picks up the mutation in template bindings.
     */
    private addSyncingId(id: string): void {
        this.SyncingIds = new Set([...this.SyncingIds, id]);
    }

    /**
     * Remove an ID from SyncingIds, creating a new Set reference so Angular
     * change detection picks up the mutation in template bindings.
     */
    private removeSyncingId(id: string): void {
        if (this.SyncingIds.has(id)) {
            const next = new Set(this.SyncingIds);
            next.delete(id);
            this.SyncingIds = next;
        }
    }

    /** Opens the AI suggestion dialog, or shows a warning if no vector indexes exist */
    public OpenSuggestDialog(): void {
        if (this.vectorIndexes.length === 0 && this.vectorDatabases.length === 0) {
            this.ShowNoIndexWarning = true;
            this.cdr.detectChanges();
            return;
        }

        this.SuggestionResult = null;
        this.SuggestEntityName = '';
        this.SuggestUseCase = 'duplicate detection';
        this.EditableTemplate = '';
        this.SuggestionError = '';
        this.EntitySearchText = '';
        this.ShowEntityPicker = false;
        this.loadEntityGroups();
        this.ShowSuggestDialog = true;
        this.cdr.detectChanges();
    }

    /** Close the no-index warning dialog */
    public CloseNoIndexWarning(): void {
        this.ShowNoIndexWarning = false;
        this.cdr.detectChanges();
    }

    /** Navigate to the Configuration section from the no-index warning */
    public async GoToConfiguration(): Promise<void> {
        this.ShowNoIndexWarning = false;
        this.cdr.detectChanges();
        // Attempt to open the Config nav item in the current app
        await this.navigationService.OpenNavItemByName('Config');
    }

    /** Select an entity from the grouped picker */
    public SelectEntity(entityName: string): void {
        this.SuggestEntityName = entityName;
        this.ShowEntityPicker = false;
        this.cdr.detectChanges();
    }

    /** Filter entities by search text */
    public FilterEntities(): void {
        const query = this.EntitySearchText.toLowerCase().trim();
        if (!query) {
            this.FilteredEntityGroups = this.EntityGroups;
        } else {
            this.FilteredEntityGroups = this.EntityGroups
                .map(group => ({
                    SchemaName: group.SchemaName,
                    Entities: group.Entities.filter(e => e.Name.toLowerCase().includes(query))
                }))
                .filter(group => group.Entities.length > 0);
        }
        // Reset selection to first item when filter changes
        this.SelectedEntityIndex = this.FlatFilteredEntities.length > 0 ? 0 : -1;
        this.cdr.detectChanges();
    }

    /**
     * Get a flat list of all entities across groups (for keyboard navigation indexing)
     */
    get FlatFilteredEntities(): { Name: string; ID: string }[] {
        return this.FilteredEntityGroups.flatMap(g => g.Entities);
    }

    /**
     * Handle keyboard events in the entity picker search input
     */
    public OnEntityPickerKeyDown(event: KeyboardEvent): void {
        const entities = this.FlatFilteredEntities;
        if (entities.length === 0) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.SelectedEntityIndex = Math.min(this.SelectedEntityIndex + 1, entities.length - 1);
                this.scrollSelectedEntityIntoView();
                this.cdr.detectChanges();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.SelectedEntityIndex = Math.max(this.SelectedEntityIndex - 1, 0);
                this.scrollSelectedEntityIntoView();
                this.cdr.detectChanges();
                break;
            case 'Enter':
                event.preventDefault();
                if (this.SelectedEntityIndex >= 0 && this.SelectedEntityIndex < entities.length) {
                    this.SelectEntity(entities[this.SelectedEntityIndex].Name);
                }
                break;
            case 'Escape':
                event.preventDefault();
                this.ShowEntityPicker = false;
                this.cdr.detectChanges();
                break;
        }
    }

    /**
     * Scroll the currently selected entity picker item into view
     */
    private scrollSelectedEntityIntoView(): void {
        setTimeout(() => {
            const selected = document.querySelector('.entity-picker-item-focused');
            if (selected) {
                selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }, 0);
    }

    /** Toggle entity picker visibility */
    public ToggleEntityPicker(): void {
        this.ShowEntityPicker = !this.ShowEntityPicker;
        if (this.ShowEntityPicker) {
            this.FilteredEntityGroups = this.EntityGroups;
            this.EntitySearchText = '';
            this.cdr.detectChanges();
            // Focus search input after the @if block renders — deferred past the click event
            setTimeout(() => {
                if (this.entitySearchInput?.nativeElement) {
                    this.entitySearchInput.nativeElement.focus();
                }
            }, 0);
        } else {
            this.cdr.detectChanges();
        }
    }

    /** Handle template edits from code editor */
    public OnTemplateChange(newValue: string): void {
        this.EditableTemplate = newValue;
        if (this.SuggestionResult) {
            this.SuggestionResult.template = newValue;
        }
    }

    /** Closes the suggestion dialog */
    public CloseSuggestDialog(): void {
        this.ShowSuggestDialog = false;
        this.SuggestionResult = null;
        this.cdr.detectChanges();
    }

    /** Clears the current suggestion to try again */
    public ClearSuggestion(): void {
        this.SuggestionResult = null;
        this.cdr.detectChanges();
    }

    /**
     * Runs the AI suggestion by calling the server-side "Entity Document Suggestion"
     * AI prompt via GraphQL. The LLM analyzes the entity schema and generates
     * natural language Nunjucks templates optimized for embedding quality.
     */
    public async RunSuggestion(): Promise<void> {
        if (!this.SuggestEntityName || this.IsSuggesting) {
            return;
        }

        this.IsSuggesting = true;
        this.SuggestionError = '';
        this.cdr.detectChanges();

        try {
            const result = await this.callSuggestionPrompt(this.SuggestEntityName, this.SuggestUseCase);
            if (result) {
                this.SuggestionResult = result;
                this.EditableTemplate = result.template;
                this.SaveDocumentName = `${this.SuggestEntityName} - ${this.SuggestUseCase}`;
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[VectorManagement] Error generating suggestion:', msg);
            this.SuggestionError = `Failed to generate suggestion: ${msg}`;
        } finally {
            this.IsSuggesting = false;
            this.cdr.detectChanges();
        }
    }

    /** Saves the current suggestion as an Entity Document record */
    public async SaveAsEntityDocument(): Promise<void> {
        if (this.IsSavingDocument || !this.SuggestionResult) {
            return;
        }

        this.IsSavingDocument = true;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const entityDoc = await md.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents');
            entityDoc.NewRecord();
            entityDoc.Name = this.SaveDocumentName;

            const matchingEntity = md.Entities.find(e => e.Name === this.SuggestEntityName);
            if (matchingEntity) {
                entityDoc.EntityID = matchingEntity.ID;
            }

            entityDoc.Status = 'Active';

            // Populate required FK fields from existing data
            await this.populateEntityDocumentFKs(entityDoc);

            const saved = await entityDoc.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Entity Document "${this.SaveDocumentName}" created successfully`,
                    'success',
                    3000
                );
                await this.LoadData();
                setTimeout(() => {
                    this.CloseSuggestDialog();
                    this.cdr.detectChanges();
                }, 1500);
            } else {
                const errorMsg = entityDoc.LatestResult?.CompleteMessage || 'Unknown error saving entity document';
                console.error('[VectorManagement] Failed to save entity document:', errorMsg);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save: ${errorMsg}`,
                    'error',
                    5000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[VectorManagement] Error saving entity document:', msg);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Error: ${msg}`,
                'error',
                5000
            );
        } finally {
            this.IsSavingDocument = false;
            this.cdr.detectChanges();
        }
    }

    /** Returns the CSS class for a given sync status badge */
    public GetStatusClass(status: string): string {
        switch (status) {
            case 'Synced': return 'status-synced';
            case 'Syncing': return 'status-syncing';
            case 'Error': return 'status-error';
            case 'Pending': return 'status-pending';
            default: return '';
        }
    }

    /** Returns the icon class for a given sync status */
    public GetStatusIcon(status: string): string {
        switch (status) {
            case 'Synced': return 'fa-solid fa-circle-check';
            case 'Syncing': return 'fa-solid fa-spinner fa-spin';
            case 'Error': return 'fa-solid fa-circle-exclamation';
            case 'Pending': return 'fa-solid fa-clock';
            default: return 'fa-solid fa-question';
        }
    }

    /** Format a Date value for display */
    public FormatDate(date: Date | null): string {
        if (!date) return 'Never';
        const d = new Date(date);
        return d.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /** Format the storage gauge label */
    public get StorageLabel(): string {
        return `${this.StorageUsagePercent}%`;
    }

    /** CSS class for the DB health indicator dot */
    public get DBHealthClass(): string {
        switch (this.VectorDBStatus) {
            case 'Healthy': return 'health-healthy';
            case 'Degraded': return 'health-degraded';
            case 'Offline': return 'health-offline';
            default: return '';
        }
    }

    // ================================================================
    // Private helpers
    // ================================================================

    private async fetchAllData(): Promise<void> {
        // Use cached engine data — BaseEngine's entity-event auto-refresh handles
        // updates from saves/deletes on the entities it tracks.
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false);
        // AIEngineBase is deferred at startup; ensure loaded before reading .VectorDatabases.
        await AIEngineBase.Instance.EnsureLoaded();

        this.entityDocuments = engine.EntityDocuments;
        this.vectorDatabases = AIEngineBase.Instance.VectorDatabases;
        this.vectorIndexes = engine.VectorIndexes;

        // Build per-EntityDocument aggregate stats (vector count + last synced).
        // Each query fetches only the most recent row (MaxRows: 1) and uses
        // TotalRowCount for the actual vector count — avoids loading all rows.
        // AI Models come from a different domain — fetched in the same batch.
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const erdQueries = this.entityDocuments.map(doc => ({
            EntityName: 'MJ: Entity Record Documents',
            ExtraFilter: `EntityDocumentID='${doc.ID}' AND VectorID IS NOT NULL`,
            ResultType: 'simple' as const,
            Fields: ['__mj_UpdatedAt'],
            OrderBy: '__mj_UpdatedAt DESC',
            MaxRows: 1,
        }));
        const allQueries = [
            ...erdQueries,
            { EntityName: 'MJ: AI Models', ExtraFilter: '', ResultType: 'entity_object' as const }
        ];
        const allResults = await rv.RunViews(allQueries);

        // Map results back to erdStats
        this.erdStats.clear();
        for (let i = 0; i < this.entityDocuments.length; i++) {
            const result = allResults[i];
            if (result.Success) {
                const rows = result.Results as { __mj_UpdatedAt: string }[];
                const lastDate = rows.length > 0 ? new Date(rows[0].__mj_UpdatedAt) : null;
                this.erdStats.set(this.entityDocuments[i].ID, {
                    vectorCount: result.TotalRowCount,
                    lastSynced: lastDate,
                });
            }
        }

        const modelsResult = allResults[allResults.length - 1];
        if (modelsResult.Success) {
            this.aiModels = modelsResult.Results as MJAIModelEntity[];
        }
    }

    private buildSyncRows(): void {
        this.SyncRows = this.entityDocuments.map(doc => {
            const stats = this.erdStats.get(doc.ID);
            const vectorCount = stats?.vectorCount ?? 0;
            const lastSynced = stats?.lastSynced ?? null;
            const status = this.computeSyncStatus(doc, vectorCount);

            // Preserve progress info from any active sync
            const existingRow = this.SyncRows.find(r => UUIDsEqual(r.EntityDocumentID, doc.ID));
            return {
                EntityDocumentID: doc.ID,
                EntityName: doc.Entity || '',
                DocumentName: doc.Name,
                VectorCount: vectorCount,
                LastSynced: lastSynced,
                Status: status,
                PercentComplete: existingRow?.PercentComplete ?? 0,
                PipelineRunID: existingRow?.PipelineRunID,
            };
        });
    }

    private computeSyncStatus(
        doc: MJEntityDocumentEntity,
        vectorCount: number
    ): 'Synced' | 'Syncing' | 'Error' | 'Pending' {
        if (this.SyncingIds.has(doc.ID)) {
            return 'Syncing';
        }
        if (doc.Status === 'Inactive') {
            return 'Pending';
        }
        if (vectorCount > 0) {
            return 'Synced';
        }
        return 'Pending';
    }

    private buildKPICards(): void {
        let totalVectors = 0;
        let latestSync: Date | null = null;
        for (const stats of this.erdStats.values()) {
            totalVectors += stats.vectorCount;
            if (stats.lastSynced && (!latestSync || stats.lastSynced > latestSync)) {
                latestSync = stats.lastSynced;
            }
        }
        this.TotalVectors = totalVectors;

        const entitiesSynced = new Set(
            this.entityDocuments
                .filter(d => d.Status === 'Active')
                .map(d => d.EntityID)
        ).size;

        const lastSyncDate = latestSync;

        this.KPICards = [
            {
                title: 'Total Vectors',
                value: this.TotalVectors,
                subtitle: `across ${this.entityDocuments.length} documents`,
                icon: 'fa-cubes',
                color: 'primary',
                loading: false
            },
            {
                title: 'Entities Synced',
                value: entitiesSynced,
                subtitle: `of ${this.entityDocuments.length} configured`,
                icon: 'fa-layer-group',
                color: 'success',
                loading: false
            },
            {
                title: 'Last Sync',
                value: lastSyncDate ? this.FormatDate(lastSyncDate) : 'Never',
                icon: 'fa-clock',
                color: 'info',
                loading: false
            },
            {
                title: 'Vector Indexes',
                value: this.vectorIndexes.length,
                subtitle: `in ${this.vectorDatabases.length} database(s)`,
                icon: 'fa-diagram-project',
                color: 'warning',
                loading: false
            }
        ];
    }

    private buildSidebarData(): void {
        this.buildVectorDBHealth();
        this.buildEmbeddingModelInfo();
        this.buildStorageUsage();
    }

    private buildVectorDBHealth(): void {
        if (this.vectorDatabases.length > 0) {
            const db = this.vectorDatabases[0];
            this.VectorDBName = db.Name;
            // Determine health based on whether we have records with vectors
            const hasVectors = this.TotalVectors > 0;
            this.VectorDBStatus = hasVectors ? 'Healthy' : 'Degraded';
        } else {
            this.VectorDBName = 'Not configured';
            this.VectorDBStatus = 'Offline';
        }
    }

    private buildEmbeddingModelInfo(): void {
        if (this.vectorIndexes.length > 0) {
            const index = this.vectorIndexes[0];
            const model = this.aiModels.find(m => UUIDsEqual(m.ID, index.EmbeddingModelID));
            this.EmbeddingModel = {
                Name: model?.Name ?? index.EmbeddingModel ?? 'Unknown',
                Dimensions: null
            };
        } else {
            this.EmbeddingModel = { Name: 'Not configured', Dimensions: null };
        }
    }

    private buildStorageUsage(): void {
        // All records in erdStats already have vectors (query filters VectorID IS NOT NULL),
        // so coverage is 100% if any exist.
        this.StorageUsagePercent = this.TotalVectors > 0 ? 100 : 0;
    }

    /** Check if vector DB and embedding model are configured, populate selection lists */
    private checkPrerequisites(): void {
        this.HasVectorDB = this.vectorDatabases.length > 0;
        const allEmbeddings = this.aiModels.filter(m =>
            m.AIModelType?.toLowerCase().includes('embedding') || m.Name?.toLowerCase().includes('embedding')
        );
        this.HasEmbeddingModel = allEmbeddings.length > 0;
        this.AvailableEmbeddingModels = allEmbeddings.map(m => ({ ID: m.ID, Name: m.Name }));

        // Default selections — first available, no hardcoded preference
        if (this.HasVectorDB && !this.SelectedVectorDBID) {
            this.SelectedVectorDBID = this.vectorDatabases[0].ID;
        }
        if (this.HasEmbeddingModel && !this.SelectedEmbeddingModelID) {
            this.SelectedEmbeddingModelID = allEmbeddings[0].ID;
        }

        // Build vector index list
        this.AvailableVectorIndexes = this.vectorIndexes.map(vi => ({
            ID: vi.ID,
            Name: vi.Name,
            VectorDatabaseID: vi.VectorDatabaseID,
            EmbeddingModelID: vi.EmbeddingModelID
        }));
        // Pre-select first index if available
        if (this.AvailableVectorIndexes.length > 0 && !this.SelectedVectorIndexID) {
            this.SelectedVectorIndexID = this.AvailableVectorIndexes[0].ID;
        }
    }

    /** Find the best embedding model from loaded AI models */
    private findEmbeddingModel(): MJAIModelEntity | undefined {
        return this.aiModels.find(m =>
            m.AIModelType?.toLowerCase().includes('embedding') || m.Name?.toLowerCase().includes('embedding')
        );
    }

    /**
     * Populate required foreign key fields on an Entity Document before saving.
     * Throws if prerequisites are not met.
     */
    private async populateEntityDocumentFKs(entityDoc: MJEntityDocumentEntity): Promise<void> {
        if (!this.PrerequisitesMet) {
            const missing: string[] = [];
            if (!this.HasVectorDB) missing.push('Vector Database');
            if (!this.HasEmbeddingModel) missing.push('Embedding Model');
            throw new Error(`Prerequisites not configured: ${missing.join(', ')}. Go to the Configuration tab to set these up.`);
        }

        // TypeID — look up 'Record Duplicate' entity document type
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const typeResult = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Entity Document Types',
            ExtraFilter: "Name = 'Record Duplicate'",
            ResultType: 'simple',
            Fields: ['ID']
        });
        if (typeResult.Success && typeResult.Results.length > 0) {
            entityDoc.TypeID = typeResult.Results[0].ID;
        } else {
            throw new Error('Entity Document Type "Record Duplicate" not found in database');
        }

        // If a vector index is selected, use its DB + model so the syncer finds it
        // instead of auto-creating a new one
        if (this.SelectedVectorIndexID) {
            const idx = this.AvailableVectorIndexes.find(i => UUIDsEqual(i.ID, this.SelectedVectorIndexID));
            if (idx) {
                entityDoc.VectorDatabaseID = idx.VectorDatabaseID;
                entityDoc.AIModelID = idx.EmbeddingModelID;
                entityDoc.VectorIndexID = idx.ID;
            } else {
                entityDoc.VectorDatabaseID = this.SelectedVectorDBID || this.vectorDatabases[0].ID;
                entityDoc.AIModelID = this.SelectedEmbeddingModelID || this.findEmbeddingModel()!.ID;
            }
        } else {
            entityDoc.VectorDatabaseID = this.SelectedVectorDBID || this.vectorDatabases[0].ID;
            entityDoc.AIModelID = this.SelectedEmbeddingModelID || this.findEmbeddingModel()!.ID;
        }

        // TemplateID — create a Template record with the generated template content
        await this.createTemplateForDocument(entityDoc);
    }

    /** Create a Template + TemplateContent record for the entity document */
    private async createTemplateForDocument(entityDoc: MJEntityDocumentEntity): Promise<void> {
        const md = this.ProviderToUse;
        const templateText = this.EditableTemplate || this.SuggestionResult?.template || '';
        if (!templateText) {
            throw new Error('No template content to save');
        }

        // Create Template record
        const template = await md.GetEntityObject<MJTemplateEntity>('MJ: Templates');
        template.NewRecord();
        template.Name = `Template for ${this.SaveDocumentName}`;
        template.Description = `Auto-generated template for entity document: ${this.SaveDocumentName}`;
        template.UserID = md.CurrentUser.ID;
        template.IsActive = true;
        const templateSaved = await template.Save();
        if (!templateSaved) {
            throw new Error(`Failed to create template: ${template.LatestResult?.CompleteMessage || 'unknown error'}`);
        }

        entityDoc.TemplateID = template.ID;

        // Find 'Text' content type
        const contentTypeResult = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{ ID: string }>({
            EntityName: 'MJ: Template Content Types',
            ExtraFilter: "Name = 'Text'",
            ResultType: 'simple',
            Fields: ['ID']
        });
        if (!contentTypeResult.Success || contentTypeResult.Results.length === 0) {
            throw new Error('Template Content Type "Text" not found');
        }

        // Create TemplateContent record with the template text
        // Server-side MJTemplateContentEntityServer hook auto-creates Scalar params
        // for each {{FieldName}} — GetTemplateData() handles them via the flat convention.
        const content = await md.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents');
        content.NewRecord();
        content.TemplateID = template.ID;
        content.TypeID = contentTypeResult.Results[0].ID;
        content.TemplateText = templateText;
        content.Priority = 1;
        content.IsActive = true;
        const contentSaved = await content.Save();
        if (!contentSaved) {
            throw new Error(`Failed to create template content: ${content.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
    }

    /** Build grouped entity list from metadata, grouped by SchemaName */
    private loadEntityGroups(): void {
        const md = this.ProviderToUse;
        const groupMap = new Map<string, { Name: string; ID: string }[]>();

        for (const entity of md.Entities) {
            const schema = entity.SchemaName || '__default';
            const existing = groupMap.get(schema);
            if (existing) {
                existing.push({ Name: entity.Name, ID: entity.ID });
            } else {
                groupMap.set(schema, [{ Name: entity.Name, ID: entity.ID }]);
            }
        }

        this.EntityGroups = Array.from(groupMap.entries())
            .map(([schemaName, entities]) => ({
                SchemaName: schemaName,
                Entities: entities.sort((a, b) => a.Name.localeCompare(b.Name))
            }))
            .sort((a, b) => a.SchemaName.localeCompare(b.SchemaName));

        this.FilteredEntityGroups = this.EntityGroups;
    }

    private updateRowStatus(entityDocumentId: string, status: EntitySyncRow['Status']): void {
        const row = this.SyncRows.find(r => r.EntityDocumentID === entityDocumentId);
        if (row) {
            row.Status = status;
        }
    }

    private updateRowProgress(entityDocumentId: string, percentComplete: number): void {
        const row = this.SyncRows.find(r => r.EntityDocumentID === entityDocumentId);
        if (row) {
            row.PercentComplete = percentComplete;
        }
    }

    /** Refresh a single sync row's vector count and status from the DB */
    private async refreshSyncRow(entityDocumentId: string): Promise<void> {
        const row = this.SyncRows.find(r => r.EntityDocumentID === entityDocumentId);
        if (!row) return;

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ __mj_UpdatedAt: string }>({
            EntityName: 'MJ: Entity Record Documents',
            ExtraFilter: `EntityDocumentID='${entityDocumentId}' AND VectorID IS NOT NULL`,
            Fields: ['__mj_UpdatedAt'],
            OrderBy: '__mj_UpdatedAt DESC',
            ResultType: 'simple',
            MaxRows: 1
        });

        if (result.Success) {
            row.VectorCount = result.TotalRowCount;
            row.LastSynced = result.Results.length > 0 ? new Date(result.Results[0].__mj_UpdatedAt) : null;
            row.Status = row.VectorCount > 0 ? 'Synced' : 'Pending';
            row.PercentComplete = 100;
            this.erdStats.set(entityDocumentId, { vectorCount: row.VectorCount, lastSynced: row.LastSynced });
            this.buildKPICards();
            this.cdr.detectChanges();
        }
    }

    /**
     * Calls the "Entity Document Suggestion" AI prompt via GraphQL to generate
     * a natural language template optimized for vector embeddings.
     */
    private async callSuggestionPrompt(entityName: string, useCase: string): Promise<DocumentSuggestionResult | null> {
        const md = this.ProviderToUse;
        const entity = md.Entities.find(e => e.Name === entityName);
        if (!entity) {
            throw new Error(`Entity "${entityName}" not found in metadata`);
        }

        // AIEngineBase is deferred at startup; ensure loaded before findSuggestionPrompt reads .Prompts.
        await AIEngineBase.Instance.EnsureLoaded();
        const prompt = this.findSuggestionPrompt();
        const provider = this.ProviderToUse as GraphQLDataProvider;
        if (!provider) {
            throw new Error('GraphQL provider not available');
        }

        const aiClient = new GraphQLAIClient(provider);
        const data = this.buildPromptData(entity, useCase);

        const result = await aiClient.RunAIPrompt({
            promptId: prompt.ID,
            data,
        });

        if (!result.success) {
            throw new Error(result.error || 'AI prompt execution failed');
        }

        const parsed = result.parsedResult as DocumentSuggestionResult;
        if (!parsed?.template) {
            throw new Error('AI returned no template in response');
        }

        return parsed;
    }

    /** Find the Entity Document Suggestion prompt from AIEngineBase */
    private findSuggestionPrompt(): MJAIPromptEntityExtended {
        const prompt = AIEngineBase.Instance.Prompts.find(
            (p: MJAIPromptEntityExtended) => p.Name === 'Entity Document Suggestion'
        );
        if (!prompt) {
            throw new Error(
                'AI Prompt "Entity Document Suggestion" not found. ' +
                'Run "npx mj sync push --dir=metadata --include=prompts" to install it.'
            );
        }
        return prompt;
    }

    /** Build the data payload for the suggestion prompt */
    private buildPromptData(entity: EntityInfo, useCase: string): Record<string, unknown> {
        const fields = entity.Fields.map(f => ({
            Name: f.Name,
            Type: f.Type,
            IsPrimaryKey: f.IsPrimaryKey,
            IsUnique: f.IsUnique,
            MaxLength: f.MaxLength,
            AllowsNull: f.AllowsNull,
            Description: f.Description || '',
        }));

        const md = this.ProviderToUse;
        const relationships = entity.RelatedEntities
            .filter(r => r.Type === 'One to Many' || r.Type === 'Many to One')
            .slice(0, 20)
            .map(r => {
                const relatedEntity = md.Entities.find(e => e.Name === r.RelatedEntity);
                const relFields = relatedEntity
                    ? relatedEntity.Fields
                        .filter(f => !f.IsPrimaryKey && f.Type !== 'datetimeoffset')
                        .map(f => f.Name)
                    : [];
                return {
                    Name: r.RelatedEntityJoinField || r.RelatedEntity,
                    RelatedEntity: r.RelatedEntity,
                    Fields: relFields,
                    ForeignKeyField: r.RelatedEntityJoinField || '',
                };
            });

        return {
            EntityName: entity.Name,
            FieldsJSON: JSON.stringify(fields, null, 2),
            RelationshipsJSON: JSON.stringify(relationships, null, 2),
            UseCase: useCase,
        };
    }
}

export function LoadVectorManagementResource(): void {
    // Prevents tree-shaking
}
