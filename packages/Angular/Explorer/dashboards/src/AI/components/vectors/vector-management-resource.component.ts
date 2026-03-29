/**
 * @fileoverview Vector Management Resource Component
 *
 * Dashboard resource for managing vector databases and entity vectorization.
 * Displays KPI cards (total vectors, entities synced, last sync, avg embedding time),
 * an entity sync table, and sidebar panels for DB health, embedding model info,
 * and storage usage.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import {
    MJEntityDocumentEntity,
    MJVectorDatabaseEntity,
    MJVectorIndexEntity,
    MJEntityRecordDocumentEntity,
    MJAIModelEntity
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { KPICardData } from '../widgets/kpi-card.component';

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
    public AvailableEntityNames: string[] = [];

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
        this.loadAvailableEntityNames();
        this.SuggestionResult = null;
        this.SuggestEntityName = '';
        this.SuggestUseCase = 'duplicate detection';
        this.ShowSuggestDialog = true;
        this.cdr.detectChanges();
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
     * Runs the AI suggestion by building a local schema analysis.
     * Generates a suggested template based on entity metadata available client-side.
     * In a full deployment, this would call the server-side EntityDocumentSuggester
     * via a GraphQL mutation for AI-powered analysis.
     */
    public async RunSuggestion(): Promise<void> {
        if (!this.SuggestEntityName || this.IsSuggesting) {
            return;
        }

        this.IsSuggesting = true;
        this.cdr.detectChanges();

        try {
            this.SuggestionResult = this.buildLocalSuggestion(this.SuggestEntityName);
        } catch (error) {
            console.error('[VectorManagement] Error generating suggestion:', error);
        } finally {
            this.IsSuggesting = false;
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

    private updateRowStatus(entityDocumentId: string, status: EntitySyncRow['Status']): void {
        const row = this.SyncRows.find(r => r.EntityDocumentID === entityDocumentId);
        if (row) {
            row.Status = status;
        }
    }

    /** Load all entity names from metadata for the suggestion dialog */
    private loadAvailableEntityNames(): void {
        const md = new Metadata();
        this.AvailableEntityNames = md.Entities
            .map(e => e.Name)
            .sort();
    }

    /**
     * Build a local suggestion based on entity metadata (no AI call).
     * Analyzes fields to select the most relevant ones for the use case
     * and generates a Nunjucks template using the new flat convention.
     */
    private buildLocalSuggestion(entityName: string): DocumentSuggestionResult {
        const md = new Metadata();
        const entity = md.Entities.find(e => e.Name === entityName);
        if (!entity) {
            throw new Error(`Entity "${entityName}" not found`);
        }

        const selectedFields = this.selectRelevantFields(entity);
        const templateParts = selectedFields.map(f => `{{${f}}}`);
        const template = templateParts.join(' ');

        const relationships = entity.RelatedEntities
            .filter(r => r.Type === 'Many to One')
            .slice(0, 5)
            .map(r => ({
                name: r.RelatedEntity,
                fields: ['Name'].filter(() => true)
            }));

        return {
            template,
            selectedFields,
            selectedRelationships: relationships,
            potentialMatchThreshold: 0.70,
            absoluteMatchThreshold: 0.95,
            reasoning: `Selected ${selectedFields.length} text/name fields from ${entity.Name} that are most useful for ${this.SuggestUseCase}. Excluded IDs, timestamps, and auto-generated fields.`
        };
    }

    /** Select the most relevant fields for similarity matching */
    private selectRelevantFields(entity: { Fields: { Name: string; Type: string; IsPrimaryKey: boolean; IsUnique: boolean; AutoIncrement: boolean }[] }): string[] {
        return entity.Fields
            .filter(f =>
                !f.IsPrimaryKey &&
                !f.IsUnique &&
                !f.AutoIncrement &&
                !f.Name.startsWith('__mj_') &&
                f.Type !== 'datetimeoffset' &&
                f.Type !== 'datetime' &&
                f.Type !== 'uniqueidentifier' &&
                f.Type !== 'bit' &&
                f.Type !== 'image' &&
                f.Type !== 'varbinary'
            )
            .map(f => f.Name);
    }
}

export function LoadVectorManagementResource(): void {
    // Prevents tree-shaking
}
