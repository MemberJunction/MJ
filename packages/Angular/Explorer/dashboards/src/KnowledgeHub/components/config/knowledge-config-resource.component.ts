/**
 * @fileoverview Knowledge Hub Configuration Resource Component
 *
 * Full configuration dashboard for Knowledge Hub infrastructure:
 * Vector DB provider management, vector index CRUD, embedding model selection,
 * pipeline settings, full-text index config, and scoring thresholds.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Metadata, RunView, LogError } from '@memberjunction/core';
import { ResourceData, MJVectorDatabaseEntity, MJVectorIndexEntity, MJEntityDocumentEntity, MJCredentialEntity, KnowledgeHubMetadataEngine, MJSearchScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { SearchScopeChildGridColumn } from '@memberjunction/ng-search';

/** Configuration section definition */
interface ConfigSection {
    ID: string;
    Label: string;
    Icon: string;
    Description: string;
}

/** Pipeline configuration settings */
interface PipelineConfig {
    AutotagOnIngest: boolean;
    VectorizeOnIngest: boolean;
    DefaultBatchSize: number;
    MaxConcurrentJobs: number;
}

/** Threshold settings */
interface ThresholdConfig {
    DuplicateAbsolute: number;
    DuplicatePotential: number;
    SearchRelevance: number;
    AutotagConfidence: number;
}

/** Vector DB provider display record */
interface VectorDBRecord {
    ID: string;
    Name: string;
    ClassKey: string;
    Description: string;
    CredentialID: string | null;
    CredentialName: string | null;
}

/** Vector index display record */
interface VectorIndexRecord {
    ID: string;
    Name: string;
    EmbeddingModel: string;
    EmbeddingModelID: string;
    VectorDatabase: string;
    VectorDatabaseID: string;
}

/** Embedding model display record */
interface EmbeddingModelRecord {
    ID: string;
    Name: string;
}

/** Full-text searchable entity */
interface FTSEntityRecord {
    EntityName: string;
    IndexedFields: string[];
    TitleField: string;
    SnippetField: string;
    Enabled: boolean;
}

@RegisterClass(BaseResourceComponent, 'KnowledgeConfigResource')
@Component({
    standalone: false,
    selector: 'app-knowledge-config-resource',
    templateUrl: './knowledge-config-resource.component.html',
    styleUrls: ['./knowledge-config-resource.component.css']
})
export class KnowledgeConfigResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    protected override navigationService = inject(NavigationService);
    protected override destroy$ = new Subject<void>();

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Configuration';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-gear';
    }

    // --- Navigation ---
    public Sections: ConfigSection[] = [
        { ID: 'pipeline', Label: 'Pipeline', Icon: 'fa-solid fa-diagram-project', Description: 'Configure the knowledge ingestion pipeline stages' },
        { ID: 'vectordb', Label: 'Vector Database', Icon: 'fa-solid fa-database', Description: 'Manage vector database connections and indexes' },
        { ID: 'fulltext', Label: 'Full-Text Indexes', Icon: 'fa-solid fa-text-width', Description: 'Configure SQL full-text search indexes' },
        { ID: 'embedding', Label: 'Embedding Models', Icon: 'fa-solid fa-microchip', Description: 'Select and configure embedding models' },
        { ID: 'thresholds', Label: 'Thresholds', Icon: 'fa-solid fa-sliders', Description: 'Set scoring thresholds for search and deduplication' },
        { ID: 'search-scopes', Label: 'Search Scopes', Icon: 'fa-solid fa-compass-drafting', Description: 'Define reusable search scopes — which providers, entities, external indexes, and storage accounts participate in scoped search' },
        { ID: 'scheduling', Label: 'Scheduling', Icon: 'fa-solid fa-clock', Description: 'Manage automated pipeline schedules' },
    ];

    public ActiveSection = 'pipeline';
    public IsLoading = true;
    public IsSaving = false;
    public HasUnsavedChanges = false;

    // --- Pipeline ---
    public PipelineSettings: PipelineConfig = {
        AutotagOnIngest: true,
        VectorizeOnIngest: true,
        DefaultBatchSize: 100,
        MaxConcurrentJobs: 3
    };

    // --- Thresholds ---
    public ThresholdSettings: ThresholdConfig = {
        DuplicateAbsolute: 0.95,
        DuplicatePotential: 0.75,
        SearchRelevance: 0.3,
        AutotagConfidence: 0.7
    };

    // --- Vector DB Providers ---
    public VectorDBProviders: VectorDBRecord[] = [];
    public get HasVectorDBProvider(): boolean { return this.VectorDBProviders.length > 0; }

    // --- Vector Indexes ---
    public VectorIndexes: VectorIndexRecord[] = [];
    public get HasVectorIndex(): boolean { return this.VectorIndexes.length > 0; }

    // --- Embedding Models ---
    public EmbeddingModels: EmbeddingModelRecord[] = [];
    public get HasEmbeddingModel(): boolean { return this.EmbeddingModels.length > 0; }
    public get EmbeddingModelName(): string { return this.EmbeddingModels.length > 0 ? this.EmbeddingModels[0].Name : ''; }

    // --- Credentials (for vector DB provider binding) ---
    public AvailableCredentials: { ID: string; Name: string }[] = [];
    public IsSavingCredential = false;

    // --- Entity Documents (for persisting thresholds) ---
    private entityDocuments: MJEntityDocumentEntity[] = [];

    // --- Setup Progress ---
    public get SetupStepsCompleted(): number {
        let count = 0;
        if (this.HasVectorDBProvider) count++;
        if (this.HasEmbeddingModel) count++;
        if (this.HasVectorIndex) count++;
        return count;
    }
    public get VectorSetupComplete(): boolean {
        return this.HasVectorDBProvider && this.HasVectorIndex && this.HasEmbeddingModel;
    }

    // --- Full-Text Search Entities ---
    public FTSEntities: FTSEntityRecord[] = [];
    public IsLoadingFTSEntities = false;
    public FTSFilterText = '';

    public get EnabledFTSCount(): number {
        return this.FTSEntities.filter(e => e.Enabled).length;
    }

    public get FilteredFTSEntities(): FTSEntityRecord[] {
        if (!this.FTSFilterText.trim()) return this.FTSEntities;
        const filter = this.FTSFilterText.toLowerCase();
        return this.FTSEntities.filter(e => e.EntityName.toLowerCase().includes(filter));
    }

    // --- Create Index Form ---
    public ShowCreateIndexForm = false;
    public IsCreatingIndex = false;
    public NewIndexName = '';
    public NewIndexVectorDBID = '';
    public NewIndexEmbeddingModelID = '';

    // --- Search Scopes ---
    /** All SearchScope rows the current user can manage. */
    public SearchScopes: MJSearchScopeEntity[] = [];
    /** Currently-selected scope ID — drives child-grid loading. */
    public ActiveScopeID: string | null = null;
    public IsLoadingScopes = false;
    /** Which sub-tab of the selected scope is open. */
    public ActiveScopeTab: 'definition' | 'providers' | 'indexes' | 'entities' | 'storage' = 'definition';

    /** Column spec for the Providers child grid. */
    public readonly ScopeProviderColumns: SearchScopeChildGridColumn[] = [
        { Field: 'SearchProviderID', Label: 'Provider', Type: 'lookup', LookupEntityName: 'MJ: Search Providers', LookupFilter: "Status='Active'", Width: '200px' },
        { Field: 'Enabled', Label: 'Enabled', Type: 'checkbox', Width: '80px' },
        { Field: 'MaxResults', Label: 'Max Results', Type: 'number', Placeholder: 'e.g. 20', Width: '110px' },
        { Field: 'QueryTransformTemplateID', Label: 'Query Transform', Type: 'lookup', LookupEntityName: 'Templates', Width: '180px' },
        { Field: 'ProviderConfigOverride', Label: 'Config Override', Type: 'code', Placeholder: 'JSON override (optional)' },
    ];

    /** Column spec for the External Indexes child grid. */
    public readonly ScopeExternalIndexColumns: SearchScopeChildGridColumn[] = [
        { Field: 'IndexType', Label: 'Type', Type: 'select', Options: [
            { Label: 'Vector', Value: 'Vector' },
            { Label: 'Elasticsearch', Value: 'Elasticsearch' },
            { Label: 'OpenSearch', Value: 'OpenSearch' },
            { Label: 'Typesense', Value: 'Typesense' },
            { Label: 'Azure AI Search', Value: 'AzureAISearch' },
        ], Width: '140px' },
        { Field: 'IndexName', Label: 'Index Name', Type: 'text', Placeholder: 'hr-policies-v2', Width: '200px' },
        { Field: 'MetadataFilterTemplate', Label: 'Metadata Filter (Nunjucks)', Type: 'code', Placeholder: '{ "tenantId": "{{ context.PrimaryScopeRecordID }}" }' },
        { Field: 'ExternalIndexConfig', Label: 'Config Override', Type: 'code', Placeholder: 'JSON override (optional)' },
    ];

    /** Column spec for the Entities child grid. */
    public readonly ScopeEntityColumns: SearchScopeChildGridColumn[] = [
        { Field: 'EntityID', Label: 'Entity', Type: 'lookup', LookupEntityName: 'Entities', Width: '220px' },
        { Field: 'ExtraFilter', Label: 'Extra Filter (SQL + Nunjucks)', Type: 'code', Placeholder: "CategoryID = '<uuid>' AND OrganizationID = '{{ context.PrimaryScopeRecordID }}'" },
        { Field: 'UserSearchStringOverride', Label: 'Query Rewrite', Type: 'text', Placeholder: '— use raw query —' },
    ];

    /** Column spec for the Storage Accounts child grid. */
    public readonly ScopeStorageColumns: SearchScopeChildGridColumn[] = [
        { Field: 'StorageAccountID', Label: 'Storage Account', Type: 'lookup', LookupEntityName: 'Storage Providers', Width: '220px' },
        { Field: 'FolderPath', Label: 'Folder Path (Nunjucks)', Type: 'code', Placeholder: '/tenants/{{ context.PrimaryScopeRecordID }}/hr/policies/' },
    ];

    ngAfterViewInit(): void {
        this.loadConfiguration();
        this.navigationService.SetAgentContext(this, {
            ActiveSection: this.ActiveSection,
        });
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ================================================================
    // Public Methods
    // ================================================================

    public SelectSection(sectionId: string): void {
        this.ActiveSection = sectionId;
        if (sectionId === 'search-scopes' && this.SearchScopes.length === 0) {
            void this.LoadSearchScopes();
        }
        this.cdr.detectChanges();
    }

    // ─── Search Scopes ────────────────────────────────────────────────────────

    public async LoadSearchScopes(): Promise<void> {
        this.IsLoadingScopes = true;
        this.cdr.detectChanges();
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJSearchScopeEntity>({
                EntityName: 'MJ: Search Scopes',
                OrderBy: 'IsGlobal DESC, IsDefault DESC, Name ASC',
                ResultType: 'entity_object'
            });
            if (!result.Success) {
                LogError(`KnowledgeConfig: LoadSearchScopes failed: ${result.ErrorMessage}`);
                this.SearchScopes = [];
            } else {
                this.SearchScopes = result.Results || [];
                if (!this.ActiveScopeID && this.SearchScopes.length > 0) {
                    this.ActiveScopeID = this.SearchScopes[0].ID;
                }
            }
        } finally {
            this.IsLoadingScopes = false;
            this.cdr.detectChanges();
        }
    }

    public SelectScope(scopeID: string): void {
        this.ActiveScopeID = scopeID;
        this.ActiveScopeTab = 'definition';
        this.cdr.detectChanges();
    }

    public SelectScopeTab(tab: 'definition' | 'providers' | 'indexes' | 'entities' | 'storage'): void {
        this.ActiveScopeTab = tab;
        this.cdr.detectChanges();
    }

    public get ActiveScope(): MJSearchScopeEntity | null {
        return this.SearchScopes.find(s => UUIDsEqual(s.ID, this.ActiveScopeID ?? '')) ?? null;
    }

    public async CreateNewScope(): Promise<void> {
        try {
            const md = new Metadata();
            const scope = await md.GetEntityObject<MJSearchScopeEntity>('MJ: Search Scopes');
            scope.Name = 'New Search Scope';
            scope.Description = 'New scope — configure providers, entities, or storage below.';
            scope.Icon = 'fa-solid fa-filter';
            scope.Status = 'Active';
            scope.IsGlobal = false;
            scope.IsDefault = false;
            const ok = await scope.Save();
            if (!ok) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Create scope failed: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    'error', 5000
                );
                return;
            }
            this.SearchScopes = [...this.SearchScopes, scope];
            this.ActiveScopeID = scope.ID;
            this.ActiveScopeTab = 'definition';
            this.cdr.detectChanges();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            MJNotificationService.Instance.CreateSimpleNotification(`Error creating scope: ${msg}`, 'error', 5000);
        }
    }

    public async SaveActiveScope(): Promise<void> {
        const scope = this.ActiveScope;
        if (!scope) return;
        const ok = await scope.Save();
        if (ok) {
            MJNotificationService.Instance.CreateSimpleNotification('Scope saved', 'success', 2000);
        } else {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Save failed: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                'error', 5000
            );
        }
        this.cdr.detectChanges();
    }

    /** Format a scope Date field as the string expected by <input type="datetime-local">. */
    public FormatScopeDate(value: Date | string | null | undefined): string {
        if (!value) return '';
        const d = value instanceof Date ? value : new Date(value);
        if (isNaN(d.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /** Write a datetime-local input value back to the scope entity. Empty clears to null. */
    public SetScopeDate(scope: MJSearchScopeEntity, field: 'StartAt' | 'EndAt', value: string): void {
        if (!value) {
            scope[field] = null;
            return;
        }
        const parsed = new Date(value);
        scope[field] = isNaN(parsed.getTime()) ? null : parsed;
    }

    public async DeleteActiveScope(): Promise<void> {
        const scope = this.ActiveScope;
        if (!scope) return;
        if (scope.IsGlobal) {
            MJNotificationService.Instance.CreateSimpleNotification('The built-in Global scope cannot be deleted.', 'warning', 3000);
            return;
        }
        const ok = await scope.Delete();
        if (!ok) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Delete failed: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                'error', 5000
            );
            return;
        }
        this.SearchScopes = this.SearchScopes.filter(s => !UUIDsEqual(s.ID, scope.ID));
        this.ActiveScopeID = this.SearchScopes.length > 0 ? this.SearchScopes[0].ID : null;
        this.cdr.detectChanges();
    }

    public OnSettingChanged(): void {
        this.HasUnsavedChanges = true;
        this.cdr.detectChanges();
    }

    public async SaveConfiguration(): Promise<void> {
        this.IsSaving = true;
        this.cdr.detectChanges();
        try {
            await this.persistThresholdsToEntityDocuments();
            this.HasUnsavedChanges = false;
            MJNotificationService.Instance.CreateSimpleNotification('Configuration saved', 'success', 2000);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[KnowledgeConfig] Save failed:', msg);
            MJNotificationService.Instance.CreateSimpleNotification(`Save failed: ${msg}`, 'error', 5000);
        } finally {
            this.IsSaving = false;
            this.cdr.detectChanges();
        }
    }

    public ResetConfiguration(): void {
        this.loadConfiguration();
        this.HasUnsavedChanges = false;
        this.cdr.detectChanges();
    }

    /** Handle toggling an FTS entity */
    public OnFTSEntityToggled(entity: FTSEntityRecord): void {
        this.HasUnsavedChanges = true;
        this.cdr.detectChanges();
    }

    public FormatThreshold(value: number): string {
        return `${Math.round(value * 100)}%`;
    }

    /** Open the create index inline form */
    public OpenCreateIndexForm(): void {
        this.ShowCreateIndexForm = true;
        this.NewIndexName = 'mj-knowledge-index';
        this.NewIndexVectorDBID = this.VectorDBProviders.length > 0 ? this.VectorDBProviders[0].ID : '';
        this.NewIndexEmbeddingModelID = this.EmbeddingModels.length > 0 ? this.EmbeddingModels[0].ID : '';
        this.cdr.detectChanges();
    }

    /** Cancel creating an index */
    public CancelCreateIndex(): void {
        this.ShowCreateIndexForm = false;
        this.cdr.detectChanges();
    }

    /** Create a new vector index */
    public async CreateIndex(): Promise<void> {
        if (!this.NewIndexName.trim() || !this.NewIndexVectorDBID || !this.NewIndexEmbeddingModelID) {
            MJNotificationService.Instance.CreateSimpleNotification('Please fill in all fields', 'warning', 3000);
            return;
        }

        this.IsCreatingIndex = true;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const index = await md.GetEntityObject<MJVectorIndexEntity>('MJ: Vector Indexes');
            index.NewRecord();
            index.Name = this.NewIndexName.trim();
            index.VectorDatabaseID = this.NewIndexVectorDBID;
            index.EmbeddingModelID = this.NewIndexEmbeddingModelID;
            index.Description = `Knowledge Hub vector index created ${new Date().toLocaleDateString()}`;

            const saved = await index.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Vector index "${this.NewIndexName}" created successfully`,
                    'success', 3000
                );
                this.ShowCreateIndexForm = false;
                await this.loadConfiguration();
            } else {
                const msg = index.LatestResult?.CompleteMessage || 'Unknown error';
                console.error('[KnowledgeConfig] Failed to create index:', msg);
                MJNotificationService.Instance.CreateSimpleNotification(`Failed to create index: ${msg}`, 'error', 5000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[KnowledgeConfig] Error creating index:', msg);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.IsCreatingIndex = false;
            this.cdr.detectChanges();
        }
    }

    /** Delete a vector index */
    public async DeleteIndex(indexId: string): Promise<void> {
        const idx = this.VectorIndexes.find(i => UUIDsEqual(i.ID, indexId));
        if (!idx) return;

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MJVectorIndexEntity>('MJ: Vector Indexes');
            const loaded = await entity.Load(indexId);
            if (!loaded) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Could not load vector index "${idx.Name}"`, 'error', 3000
                );
                return;
            }
            const deleted = await entity.Delete();
            if (deleted) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Index "${idx.Name}" deleted`, 'success', 2000
                );
                await this.loadConfiguration();
            } else {
                const msg = entity.LatestResult?.CompleteMessage || 'Unknown error';
                console.error('[KnowledgeConfig] Delete failed:', msg);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Delete failed: ${msg}`, 'error', 5000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[KnowledgeConfig] Error deleting index:', msg);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        }
    }

    /** Update the credential linked to a vector database provider */
    public async SaveProviderCredential(provider: VectorDBRecord): Promise<void> {
        this.IsSavingCredential = true;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MJVectorDatabaseEntity>('MJ: Vector Databases');
            const loaded = await entity.Load(provider.ID);
            if (!loaded) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Could not load vector database "${provider.Name}"`, 'error', 3000
                );
                return;
            }

            entity.CredentialID = provider.CredentialID || null;
            const saved = await entity.Save();
            if (saved) {
                provider.CredentialName = this.AvailableCredentials.find(c => UUIDsEqual(c.ID, provider.CredentialID))?.Name ?? null;
                MJNotificationService.Instance.CreateSimpleNotification(
                    provider.CredentialID
                        ? `Credential linked to "${provider.Name}"`
                        : `Credential removed from "${provider.Name}"`,
                    'success', 2000
                );
            } else {
                const msg = entity.LatestResult?.CompleteMessage ?? 'Unknown error';
                console.error('[KnowledgeConfig] Save credential failed:', msg);
                MJNotificationService.Instance.CreateSimpleNotification(`Save failed: ${msg}`, 'error', 5000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[KnowledgeConfig] Error saving credential:', msg);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.IsSavingCredential = false;
            this.cdr.detectChanges();
        }
    }

    // ================================================================
    // Private Methods
    // ================================================================

    private async loadConfiguration(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            // Use KnowledgeHubMetadataEngine for cached vector DBs, indexes, and entity docs
            const engine = KnowledgeHubMetadataEngine.Instance;
            await engine.Config(false);

            this.loadVectorDBProvidersFromEngine(AIEngineBase.Instance.VectorDatabases);
            this.loadVectorIndexesFromEngine(engine.VectorIndexes);
            this.loadEntityDocumentsAndThresholds(engine.GetActiveEntityDocuments());

            // AI Models and Credentials come from different domains — fetch via RunView
            const rv = new RunView();
            const [modelsResult, credentialsResult] = await rv.RunViews([
                { EntityName: 'MJ: AI Models', ResultType: 'simple' },
                { EntityName: 'MJ: Credentials', ExtraFilter: 'IsActive = 1', Fields: ['ID', 'Name'], ResultType: 'simple' }
            ]);
            this.loadEmbeddingModels(modelsResult.Success ? modelsResult.Results : []);
            this.AvailableCredentials = (credentialsResult.Success ? credentialsResult.Results : [])
                .map((c: Record<string, unknown>) => ({ ID: String(c['ID']), Name: String(c['Name']) }));
        } catch (error) {
            console.error('[KnowledgeConfig] Error loading configuration:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }

        // Load FTS entities in background (doesn't block main config)
        this.loadFTSEntities();
    }

    private async loadFTSEntities(): Promise<void> {
        this.IsLoadingFTSEntities = true;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const allEntities = md.Entities;
            const ftsEntities: FTSEntityRecord[] = [];

            for (const entity of allEntities) {
                const textFields = entity.Fields.filter(
                    (f: { Name: string; Type: string; MaxLength: number; IsPrimaryKey: boolean }) =>
                        !f.IsPrimaryKey &&
                        !f.Name.startsWith('__mj') &&
                        (f.Type.toLowerCase().includes('varchar') ||
                         f.Type.toLowerCase().includes('text') ||
                         f.Type.toLowerCase() === 'ntext') &&
                        f.MaxLength !== 1
                );

                if (textFields.length === 0) continue;

                const preferredTitleNames = ['Name', 'Title', 'Subject', 'Label'];
                const preferredSnippetNames = ['Description', 'Summary', 'Body', 'Content', 'Text', 'Notes'];

                const titleField = textFields.find((f: { Name: string }) => preferredTitleNames.includes(f.Name))?.Name
                    || textFields[0]?.Name || 'Name';
                const snippetField = textFields.find((f: { Name: string }) =>
                    preferredSnippetNames.includes(f.Name) && f.Name !== titleField
                )?.Name || titleField;

                ftsEntities.push({
                    EntityName: entity.Name,
                    IndexedFields: textFields.slice(0, 4).map((f: { Name: string }) => f.Name),
                    TitleField: titleField,
                    SnippetField: snippetField,
                    Enabled: true,
                });
            }

            ftsEntities.sort((a, b) => a.EntityName.localeCompare(b.EntityName));
            this.FTSEntities = ftsEntities;
        } catch (error) {
            console.error('[KnowledgeConfig] Error loading FTS entities:', error);
        } finally {
            this.IsLoadingFTSEntities = false;
            this.cdr.detectChanges();
        }
    }

    private loadVectorDBProvidersFromEngine(dbs: MJVectorDatabaseEntity[]): void {
        this.VectorDBProviders = dbs.map(db => ({
            ID: db.ID,
            Name: db.Name,
            ClassKey: db.ClassKey || '',
            Description: db.Description || '',
            CredentialID: db.CredentialID,
            CredentialName: db.Credential ?? null
        }));
    }

    private loadVectorIndexesFromEngine(indexes: MJVectorIndexEntity[]): void {
        this.VectorIndexes = indexes.map(vi => ({
            ID: vi.ID,
            Name: vi.Name || 'Unnamed Index',
            EmbeddingModel: vi.EmbeddingModel || '',
            EmbeddingModelID: vi.EmbeddingModelID || '',
            VectorDatabase: vi.VectorDatabase || '',
            VectorDatabaseID: vi.VectorDatabaseID || ''
        }));
    }

    /** Load entity documents and seed threshold settings from the first document's values */
    private loadEntityDocumentsAndThresholds(docs: MJEntityDocumentEntity[]): void {
        this.entityDocuments = docs;
        if (docs.length > 0) {
            // Use the first entity document's thresholds as the canonical values
            const doc = docs[0];
            this.ThresholdSettings.DuplicatePotential = doc.PotentialMatchThreshold;
            this.ThresholdSettings.DuplicateAbsolute = doc.AbsoluteMatchThreshold;
        }
    }

    /** Persist threshold settings back to all active entity documents */
    private async persistThresholdsToEntityDocuments(): Promise<void> {
        if (this.entityDocuments.length === 0) {
            return; // No entity documents to update
        }

        for (const doc of this.entityDocuments) {
            doc.PotentialMatchThreshold = this.ThresholdSettings.DuplicatePotential;
            doc.AbsoluteMatchThreshold = this.ThresholdSettings.DuplicateAbsolute;
            const saved = await doc.Save();
            if (!saved) {
                const msg = doc.LatestResult?.CompleteMessage || 'Unknown error';
                throw new Error(`Failed to save entity document "${doc.Name}": ${msg}`);
            }
        }
    }

    private loadEmbeddingModels(records: Record<string, unknown>[]): void {
        this.EmbeddingModels = records
            .filter(m =>
                String(m['AIModelType'] || '').toLowerCase().includes('embedding') ||
                String(m['Name'] || '').toLowerCase().includes('embedding') ||
                String(m['Name'] || '').toLowerCase().includes('embed')
            )
            .map(m => ({
                ID: String(m['ID']),
                Name: String(m['Name'])
            }));
    }
}

/** Tree-shaking prevention */
export function LoadKnowledgeConfigResource(): void {
    // Prevents tree-shaking
}
