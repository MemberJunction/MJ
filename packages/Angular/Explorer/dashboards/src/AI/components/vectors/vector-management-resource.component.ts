/**
 * @fileoverview Vector Management Resource Component
 *
 * Dashboard resource for managing vector databases and entity vectorization.
 * Displays KPI cards (total vectors, entities synced, last sync, avg embedding time),
 * an entity sync table, and sidebar panels for DB health, embedding model info,
 * and storage usage.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, Input, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { EntityInfo, Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import {
    MJEntityDocumentEntity,
    MJVectorDatabaseEntity,
    MJVectorIndexEntity,
    MJEntityRecordDocumentEntity,
    MJAIModelEntity
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { KPICardData } from '../widgets/kpi-card.component';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/** Flattened row for the entity sync table */
interface EntitySyncRow {
    EntityDocumentID: string;
    EntityName: string;
    DocumentName: string;
    VectorCount: number;
    LastSynced: Date | null;
    Status: 'Synced' | 'Syncing' | 'Error' | 'Pending';
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
    selectedRelationships: { name: string; fields: string[] }[];
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
    private destroy$ = new Subject<void>();

    /** View mode: 'index' = Option A (shared index as hero, entity docs as children),
     *  'operations' = Option C (operations monitoring with real-time sync status) */
    public ViewMode: 'index' | 'operations' = 'index';

    /** Whether this component is embedded inside the Knowledge Hub shell */
    @Input() EmbeddedMode = false;

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

    /** Grouped entity list for the suggestion panel — schemas as groups, entities as items */
    public EntityGroups: { SchemaName: string; Entities: { Name: string; ID: string }[] }[] = [];
    /** Filtered entity groups based on search input */
    public FilteredEntityGroups: { SchemaName: string; Entities: { Name: string; ID: string }[] }[] = [];
    /** Search text for filtering entities */
    public EntitySearchText = '';
    /** Whether the entity picker dropdown is open */
    public ShowEntityPicker = false;

    // --- Raw entity data (private) ---
    private entityDocuments: MJEntityDocumentEntity[] = [];
    private vectorDatabases: MJVectorDatabaseEntity[] = [];
    private vectorIndexes: MJVectorIndexEntity[] = [];
    private recordDocuments: MJEntityRecordDocumentEntity[] = [];
    private aiModels: MJAIModelEntity[] = [];

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngAfterViewInit(): Promise<void> {
        await this.LoadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
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
        } catch (error) {
            console.error('[VectorManagement] Error loading data:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Trigger vectorization for a specific entity document */
    public async SyncEntity(entityDocumentId: string): Promise<void> {
        if (this.SyncingIds.has(entityDocumentId)) {
            return;
        }

        this.SyncingIds.add(entityDocumentId);
        this.updateRowStatus(entityDocumentId, 'Syncing');
        this.cdr.detectChanges();

        try {
            // The actual sync operation would be triggered via the server-side
            // vectorization pipeline. For now we simulate a refresh after a short delay
            // to pick up any changes from the backend.
            await this.LoadData();
        } catch (error) {
            console.error(`[VectorManagement] Error syncing entity document ${entityDocumentId}:`, error);
            this.updateRowStatus(entityDocumentId, 'Error');
        } finally {
            this.SyncingIds.delete(entityDocumentId);
            this.cdr.detectChanges();
        }
    }

    /** Opens the AI suggestion dialog */
    public OpenSuggestDialog(): void {
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
        this.cdr.detectChanges();
    }

    /** Toggle entity picker visibility */
    public ToggleEntityPicker(): void {
        this.ShowEntityPicker = !this.ShowEntityPicker;
        if (this.ShowEntityPicker) {
            this.FilteredEntityGroups = this.EntityGroups;
            this.EntitySearchText = '';
        }
        this.cdr.detectChanges();
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
            const md = new Metadata();
            const entityDoc = await md.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents');
            entityDoc.Name = this.SaveDocumentName;

            const matchingEntity = md.Entities.find(e => e.Name === this.SuggestEntityName);
            if (matchingEntity) {
                entityDoc.EntityID = matchingEntity.ID;
            }

            entityDoc.Status = 'Active';

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
        const rv = new RunView();
        const [docsResult, vdbResult, viResult, erdResult, modelsResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Entity Documents',
                ExtraFilter: '',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: Vector Databases',
                ExtraFilter: '',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: Vector Indexes',
                ExtraFilter: '',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: Entity Record Documents',
                ExtraFilter: '',
                Fields: ['ID', 'EntityDocumentID', 'VectorID', 'EntityDocument', 'Entity', '__mj_UpdatedAt'],
                ResultType: 'simple'
            },
            {
                EntityName: 'AI Models',
                ExtraFilter: '',
                ResultType: 'entity_object'
            }
        ]);

        if (docsResult.Success) {
            this.entityDocuments = docsResult.Results as MJEntityDocumentEntity[];
        }
        if (vdbResult.Success) {
            this.vectorDatabases = vdbResult.Results as MJVectorDatabaseEntity[];
        }
        if (viResult.Success) {
            this.vectorIndexes = viResult.Results as MJVectorIndexEntity[];
        }
        if (erdResult.Success) {
            this.recordDocuments = erdResult.Results as MJEntityRecordDocumentEntity[];
        }
        if (modelsResult.Success) {
            this.aiModels = modelsResult.Results as MJAIModelEntity[];
        }
    }

    private buildSyncRows(): void {
        this.SyncRows = this.entityDocuments.map(doc => {
            const docsForEntity = this.recordDocuments.filter(
                rd => rd.EntityDocumentID === doc.ID
            );
            const vectorCount = docsForEntity.filter(rd => rd.VectorID != null).length;
            const lastSynced = this.computeLastSynced(docsForEntity);
            const status = this.computeSyncStatus(doc, vectorCount, docsForEntity.length);

            return {
                EntityDocumentID: doc.ID,
                EntityName: doc.Entity || '',
                DocumentName: doc.Name,
                VectorCount: vectorCount,
                LastSynced: lastSynced,
                Status: status
            };
        });
    }

    private computeLastSynced(records: MJEntityRecordDocumentEntity[]): Date | null {
        if (records.length === 0) return null;
        const dates = records
            .map(r => new Date(r.__mj_UpdatedAt))
            .filter(d => !isNaN(d.getTime()));
        if (dates.length === 0) return null;
        return new Date(Math.max(...dates.map(d => d.getTime())));
    }

    private computeSyncStatus(
        doc: MJEntityDocumentEntity,
        vectorCount: number,
        totalRecords: number
    ): 'Synced' | 'Syncing' | 'Error' | 'Pending' {
        if (this.SyncingIds.has(doc.ID)) {
            return 'Syncing';
        }
        if (doc.Status === 'Inactive') {
            return 'Pending';
        }
        if (totalRecords === 0) {
            return 'Pending';
        }
        if (vectorCount === 0) {
            return 'Error';
        }
        if (vectorCount < totalRecords) {
            return 'Pending';
        }
        return 'Synced';
    }

    private buildKPICards(): void {
        this.TotalVectors = this.recordDocuments.filter(rd => rd.VectorID != null).length;
        const entitiesSynced = new Set(
            this.entityDocuments
                .filter(d => d.Status === 'Active')
                .map(d => d.EntityID)
        ).size;

        const allDates = this.recordDocuments
            .map(r => new Date(r.__mj_UpdatedAt))
            .filter(d => !isNaN(d.getTime()));
        const lastSyncDate = allDates.length > 0
            ? new Date(Math.max(...allDates.map(d => d.getTime())))
            : null;

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
            const hasVectors = this.recordDocuments.some(rd => rd.VectorID != null);
            this.VectorDBStatus = hasVectors ? 'Healthy' : 'Degraded';
        } else {
            this.VectorDBName = 'Not configured';
            this.VectorDBStatus = 'Offline';
        }
    }

    private buildEmbeddingModelInfo(): void {
        if (this.vectorIndexes.length > 0) {
            const index = this.vectorIndexes[0];
            const model = this.aiModels.find(m => m.ID === index.EmbeddingModelID);
            this.EmbeddingModel = {
                Name: model?.Name ?? index.EmbeddingModel ?? 'Unknown',
                Dimensions: null
            };
        } else {
            this.EmbeddingModel = { Name: 'Not configured', Dimensions: null };
        }
    }

    private buildStorageUsage(): void {
        // Estimate storage as a ratio of vectorized records vs total record documents
        const total = this.recordDocuments.length;
        const vectorized = this.recordDocuments.filter(rd => rd.VectorID != null).length;
        this.StorageUsagePercent = total > 0 ? Math.round((vectorized / total) * 100) : 0;
    }

    /** Build grouped entity list from metadata, grouped by SchemaName */
    private loadEntityGroups(): void {
        const md = new Metadata();
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

    /**
     * Calls the "Entity Document Suggestion" AI prompt via GraphQL to generate
     * a natural language template optimized for vector embeddings.
     */
    private async callSuggestionPrompt(entityName: string, useCase: string): Promise<DocumentSuggestionResult | null> {
        const md = new Metadata();
        const entity = md.Entities.find(e => e.Name === entityName);
        if (!entity) {
            throw new Error(`Entity "${entityName}" not found in metadata`);
        }

        const prompt = this.findSuggestionPrompt();
        const provider = Metadata.Provider as GraphQLDataProvider;
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

        const md = new Metadata();
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
