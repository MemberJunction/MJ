/**
 * @fileoverview Knowledge Hub Configuration Resource Component
 *
 * Full configuration dashboard for Knowledge Hub infrastructure:
 * Vector DB provider management, vector index CRUD, embedding model selection,
 * pipeline settings, full-text index config, and scoring thresholds.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { CompositeKey, Metadata, RunView, LogError } from '@memberjunction/core';
import { ResourceData, MJVectorDatabaseEntity, MJVectorIndexEntity, MJEntityDocumentEntity, MJCredentialEntity, KnowledgeHubMetadataEngine, MJSearchScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';
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

/** Row shape for the Search Analytics rollup. Mirrors the columns
 *  `LoadSearchAnalytics` requests via the `Fields:` constraint. */
interface AnalyticsRow {
    ID: string;
    SearchScopeID: string | null;
    Status: string;
    Query: string;
    ResultCount: number;
    TotalDurationMs: number;
    RerankerName: string | null;
    RerankerCostCents: number | null;
    FailureReason: string | null;
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
        { ID: 'search-analytics', Label: 'Search Analytics', Icon: 'fa-solid fa-chart-line', Description: 'Per-scope query volume, p50/p95 latency, hit rate, top failures, and reranker spend (driven by SearchExecutionLog)' },
        { ID: 'search-permissions', Label: 'Permissions', Icon: 'fa-solid fa-shield-halved', Description: 'Cross-scope view of every SearchScopePermission row, filterable by scope, user, or role (P2A.7)' },
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
    public ActiveScopeTab: 'definition' | 'providers' | 'indexes' | 'entities' | 'storage' | 'permissions' = 'definition';

    /** Column spec for the Providers child grid. */
    public readonly ScopeProviderColumns: SearchScopeChildGridColumn[] = [
        { Field: 'SearchProviderID', Label: 'Provider', Type: 'lookup', LookupEntityName: 'MJ: Search Providers', LookupFilter: "Status='Active'", Width: '200px' },
        { Field: 'Enabled', Label: 'Enabled', Type: 'checkbox', Width: '80px' },
        { Field: 'MaxResults', Label: 'Max Results', Type: 'number', Placeholder: 'e.g. 20', Width: '110px' },
        { Field: 'QueryTransformTemplateID', Label: 'Query Transform', Type: 'lookup', LookupEntityName: 'MJ: Templates', Width: '180px' },
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
        { Field: 'EntityID', Label: 'Entity', Type: 'lookup', LookupEntityName: 'MJ: Entities', Width: '220px' },
        { Field: 'ExtraFilter', Label: 'Extra Filter (SQL + Nunjucks)', Type: 'code', Placeholder: "CategoryID = '<uuid>' AND OrganizationID = '{{ context.PrimaryScopeRecordID }}'" },
        { Field: 'UserSearchStringOverride', Label: 'Query Rewrite', Type: 'text', Placeholder: '— use raw query —' },
    ];

    /** Column spec for the Storage Accounts child grid. */
    public readonly ScopeStorageColumns: SearchScopeChildGridColumn[] = [
        { Field: 'FileStorageAccountID', Label: 'Storage Account', Type: 'lookup', LookupEntityName: 'MJ: File Storage Accounts', Width: '220px' },
        { Field: 'FolderPath', Label: 'Folder Path (Nunjucks)', Type: 'code', Placeholder: '/tenants/{{ context.PrimaryScopeRecordID }}/hr/policies/' },
    ];

    /**
     * Column spec for the SearchScopePermission child grid (Phase 2A).
     * Editable surface — admins author per-user / per-role grants here.
     * Each row binds either a User or a Role (XOR enforced by the DB CHECK
     * constraint, surfaced as a save-time error for now). Resolution order
     * lives in SearchScopePermissionResolver.
     */
    public readonly ScopePermissionColumns: SearchScopeChildGridColumn[] = [
        { Field: 'UserID', Label: 'User', Type: 'lookup', LookupEntityName: 'MJ: Users', LookupFilter: "IsActive=1", Width: '240px' },
        { Field: 'RoleID', Label: 'Role', Type: 'lookup', LookupEntityName: 'MJ: Roles', Width: '200px' },
        { Field: 'PermissionLevel', Label: 'Level', Type: 'select', Options: [
            { Label: 'None (explicit deny)', Value: 'None' },
            { Label: 'Read (view only)', Value: 'Read' },
            { Label: 'Search (invoke)', Value: 'Search' },
            { Label: 'Manage (edit + grant)', Value: 'Manage' },
        ], Width: '200px' },
    ];

    ngAfterViewInit(): void {
        this.loadConfiguration();
        this.emitAgentContext();
        this.registerAgentTools();
        this.NotifyLoadComplete();
    }

    // ================================================================
    // Agent context + client tools
    // ================================================================

    /**
     * Publish the current Config surface state to the AI agent. Re-emitted on
     * every section change so the streamed context never goes stale.
     */
    private emitAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            ActiveSection: this.ActiveSection,
            ActiveSectionLabel: this.currentSection?.Label ?? this.ActiveSection,
            SectionCount: this.Sections.length,
            SearchScopeCount: this.SearchScopes.length,
        });
    }

    /**
     * Register the agent-actionable operations for the Config surface: navigate
     * between sections and reload configuration. Both wire to existing methods.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchConfigSection',
                Description:
                    'Switch the Knowledge Hub Configuration section. Valid sections: ' +
                    this.Sections.map(s => s.ID).join(', '),
                ParameterSchema: {
                    type: 'object',
                    properties: { section: { type: 'string' } },
                    required: ['section'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const section = String(params['section'] ?? '');
                    if (!this.Sections.some(s => s.ID === section)) {
                        return { Success: false, ErrorMessage: `Unknown config section "${section}"` };
                    }
                    this.SelectSection(section);
                    return { Success: true };
                },
            },
            {
                Name: 'ReloadConfiguration',
                Description: 'Reload the Knowledge Hub configuration (vector DB, indexes, embedding models, thresholds) from the server.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.loadConfiguration();
                    return { Success: true };
                },
            },
        ]);
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ================================================================
    // Public Methods
    // ================================================================

    /** Wraps `Sections` for `<mj-left-nav>`. Single unlabeled section. */
    public get navSections(): MJLeftNavSection[] {
        return [{
            items: this.Sections.map(s => ({
                id: s.ID,
                label: s.Label,
                icon: s.Icon,
                description: s.Description
            }))
        }];
    }

    /**
     * Active section metadata — drives the `<mj-page-header-interior>` Title +
     * Subtitle for the current section. Reusing the existing Sections array
     * (already used to drive the left rail) keeps section identity DRY.
     */
    public get currentSection(): ConfigSection | undefined {
        return this.Sections.find(s => UUIDsEqual(s.ID, this.ActiveSection));
    }

    /** Adapter for `<mj-left-nav>`'s `(ItemClicked)` output. */
    public onNavItemClicked(item: MJLeftNavItem): void {
        this.SelectSection(item.id);
    }

    public SelectSection(sectionId: string): void {
        this.ActiveSection = sectionId;
        if (sectionId === 'search-scopes' && this.SearchScopes.length === 0) {
            void this.LoadSearchScopes();
        }
        if (sectionId === 'search-analytics' && !this.AnalyticsLoaded && !this.AnalyticsLoading) {
            void this.LoadSearchAnalytics();
        }
        if (sectionId === 'search-permissions' && !this.PermissionsLoaded && !this.PermissionsLoading) {
            void this.LoadPermissionsAudit();
        }
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    // ─── Search Analytics (P3.3) ──────────────────────────────────────────────

    public AnalyticsLoaded = false;
    public AnalyticsLoading = false;
    public AnalyticsTotalRuns = 0;
    public AnalyticsSuccessRate = 0;
    public AnalyticsAvgLatencyMs = 0;
    public AnalyticsP95LatencyMs = 0;
    public AnalyticsTotalRerankerCostCents = 0;
    public AnalyticsHitRate = 0;
    public AnalyticsTopScopes: Array<{ ScopeID: string; Name: string; Count: number; AvgLatencyMs: number }> = [];
    public AnalyticsTopFailures: Array<{ Reason: string; Count: number }> = [];
    public AnalyticsRerankerSpend: Array<{ Reranker: string; Count: number; TotalCents: number }> = [];

    public async LoadSearchAnalytics(): Promise<void> {
        this.AnalyticsLoading = true;
        this.cdr.detectChanges();
        try {
            const rows = await this.fetchSearchExecutionRows();
            if (rows === null) return;
            this.computeAnalyticsKpis(rows);
            await this.computeAnalyticsTopScopes(rows);
            this.computeAnalyticsTopFailures(rows);
            this.computeAnalyticsRerankerSpend(rows);
            this.AnalyticsLoaded = true;
        } catch (err) {
            LogError(`KnowledgeConfig: LoadSearchAnalytics threw: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.AnalyticsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Fetch the raw SearchExecutionLog rows. Returns null on RunView failure (already logged). */
    private async fetchSearchExecutionRows(): Promise<AnalyticsRow[] | null> {
        const rv = new RunView();
        const result = await rv.RunView<AnalyticsRow>({
            EntityName: 'MJ: Search Execution Logs',
            Fields: ['ID', 'SearchScopeID', 'Status', 'ResultCount', 'TotalDurationMs', 'RerankerName', 'RerankerCostCents', 'FailureReason'],
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 5000,
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`KnowledgeConfig: LoadSearchAnalytics failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results ?? [];
    }

    /** Total runs, success rate, hit rate, avg + p95 latency, total reranker spend. */
    private computeAnalyticsKpis(rows: AnalyticsRow[]): void {
        this.AnalyticsTotalRuns = rows.length;
        const successRows = rows.filter(r => r.Status === 'Success');
        this.AnalyticsSuccessRate = rows.length > 0 ? Math.round((successRows.length / rows.length) * 100) : 0;
        this.AnalyticsHitRate = successRows.length > 0
            ? Math.round((successRows.filter(r => (r.ResultCount ?? 0) > 0).length / successRows.length) * 100)
            : 0;
        const latencies = successRows.map(r => r.TotalDurationMs ?? 0).sort((a, b) => a - b);
        this.AnalyticsAvgLatencyMs = latencies.length > 0
            ? Math.round(latencies.reduce((s, x) => s + x, 0) / latencies.length)
            : 0;
        this.AnalyticsP95LatencyMs = latencies.length > 0
            ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
            : 0;
        this.AnalyticsTotalRerankerCostCents = rows.reduce((s, r) => s + (r.RerankerCostCents ?? 0), 0);
    }

    /**
     * Per-scope volume rollup → top 10 by Count. Fetches scope names from
     * `this.SearchScopes` when already loaded, otherwise loads them on demand
     * so the unscoped audit-only path still gets human-readable labels.
     */
    private async computeAnalyticsTopScopes(rows: AnalyticsRow[]): Promise<void> {
        const byScope = new Map<string, { Count: number; LatencySum: number; ScopeID: string }>();
        for (const r of rows) {
            const id = r.SearchScopeID ?? '__unscoped__';
            const cur = byScope.get(id) ?? { Count: 0, LatencySum: 0, ScopeID: id };
            cur.Count++;
            cur.LatencySum += r.TotalDurationMs ?? 0;
            byScope.set(id, cur);
        }
        const scopeNameMap = new Map(this.SearchScopes.map(s => [s.ID, s.Name]));
        if (this.SearchScopes.length === 0 && byScope.size > 0) {
            await this.LoadSearchScopes();
            this.SearchScopes.forEach(s => scopeNameMap.set(s.ID, s.Name));
        }
        this.AnalyticsTopScopes = Array.from(byScope.values())
            .map(g => ({
                ScopeID: g.ScopeID,
                Name: scopeNameMap.get(g.ScopeID) ?? (g.ScopeID === '__unscoped__' ? '— unscoped —' : `(${g.ScopeID.slice(0, 8)}…)`),
                Count: g.Count,
                AvgLatencyMs: Math.round(g.LatencySum / g.Count),
            }))
            .sort((a, b) => b.Count - a.Count)
            .slice(0, 10);
    }

    /** Top 5 failure reasons across non-Success rows. */
    private computeAnalyticsTopFailures(rows: AnalyticsRow[]): void {
        const byFailure = new Map<string, number>();
        for (const r of rows) {
            if (r.Status !== 'Success' && r.FailureReason) {
                byFailure.set(r.FailureReason, (byFailure.get(r.FailureReason) ?? 0) + 1);
            }
        }
        this.AnalyticsTopFailures = Array.from(byFailure.entries())
            .map(([Reason, Count]) => ({ Reason, Count }))
            .sort((a, b) => b.Count - a.Count)
            .slice(0, 5);
    }

    /** Per-reranker spend rollup, sorted descending by total cost. */
    private computeAnalyticsRerankerSpend(rows: AnalyticsRow[]): void {
        const byReranker = new Map<string, { Count: number; TotalCents: number }>();
        for (const r of rows) {
            if (!r.RerankerName) continue;
            const cur = byReranker.get(r.RerankerName) ?? { Count: 0, TotalCents: 0 };
            cur.Count++;
            cur.TotalCents += r.RerankerCostCents ?? 0;
            byReranker.set(r.RerankerName, cur);
        }
        this.AnalyticsRerankerSpend = Array.from(byReranker.entries())
            .map(([Reranker, v]) => ({ Reranker, Count: v.Count, TotalCents: +v.TotalCents.toFixed(4) }))
            .sort((a, b) => b.TotalCents - a.TotalCents);
    }

    // ─── Permissions Audit (P2A.7) ────────────────────────────────────────────
    //
    // Cross-scope view of every SearchScopePermission row. Renders a flat,
    // filterable list so an admin can answer "who has access to which scopes"
    // in one place. Editing happens on the SearchScope full form's
    // Permissions panel — this dashboard is read-only.

    public PermissionsLoaded = false;
    public PermissionsLoading = false;
    public PermissionsRows: Array<{
        ID: string;
        SearchScopeID: string;
        SearchScopeName: string;
        UserID: string | null;
        UserName: string | null;
        UserEmail: string | null;
        RoleID: string | null;
        RoleName: string | null;
        PermissionLevel: string;
    }> = [];
    public PermissionsFilterScope: string = '';
    public PermissionsFilterPrincipal: string = '';
    public PermissionsFilterLevel: string = '';

    public async LoadPermissionsAudit(): Promise<void> {
        this.PermissionsLoading = true;
        this.cdr.detectChanges();
        try {
            const fetched = await this.fetchPermissionsAuditData();
            if (!fetched) {
                this.PermissionsRows = [];
                return;
            }
            this.PermissionsRows = this.shapePermissionsAuditRows(fetched);
            this.PermissionsLoaded = true;
        } catch (err) {
            LogError(`KnowledgeConfig: LoadPermissionsAudit threw: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.PermissionsLoading = false;
            this.cdr.detectChanges();
        }
    }

    public get FilteredPermissionsRows(): typeof this.PermissionsRows {
        const scope = (this.PermissionsFilterScope || '').toLowerCase();
        const principal = (this.PermissionsFilterPrincipal || '').toLowerCase();
        const level = this.PermissionsFilterLevel;
        return this.PermissionsRows.filter(r => {
            if (scope && !r.SearchScopeName.toLowerCase().includes(scope)) return false;
            if (principal) {
                const candidates = [r.UserName, r.UserEmail, r.RoleName].filter(Boolean) as string[];
                if (!candidates.some(c => c.toLowerCase().includes(principal))) return false;
            }
            if (level && r.PermissionLevel !== level) return false;
            return true;
        });
    }

    public RefreshPermissionsAudit(): void {
        this.PermissionsLoaded = false;
        void this.LoadPermissionsAudit();
    }

    /**
     * Pull permissions, scopes, users, roles in one batched call.
     * `BypassCache: true` on every view — this is an audit dashboard, so we
     * want SQL-truth even when permission/scope rows have been written
     * outside the normal `BaseEntity.Save()` path (test harnesses,
     * direct-SQL maintenance, recovery scripts). Without this, scope names
     * can render as "(unknown)" if the cache was populated before the
     * underlying row was inserted.
     *
     * Returns null on RunView failure (already logged).
     */
    private async fetchPermissionsAuditData(): Promise<{
        perms: Array<{ ID: string; SearchScopeID: string; UserID: string | null; RoleID: string | null; PermissionLevel: string }>;
        scopes: Array<{ ID: string; Name: string }>;
        users: Array<{ ID: string; Name: string; Email: string }>;
        roles: Array<{ ID: string; Name: string }>;
    } | null> {
        const rv = new RunView();
        const result = await rv.RunViews([
            { EntityName: 'MJ: Search Scope Permissions', Fields: ['ID', 'SearchScopeID', 'UserID', 'RoleID', 'PermissionLevel'], OrderBy: '__mj_CreatedAt DESC', MaxRows: 5000, ResultType: 'simple', BypassCache: true },
            { EntityName: 'MJ: Search Scopes', Fields: ['ID', 'Name'], ResultType: 'simple', BypassCache: true },
            { EntityName: 'MJ: Users', Fields: ['ID', 'Name', 'Email'], ResultType: 'simple', BypassCache: true },
            { EntityName: 'MJ: Roles', Fields: ['ID', 'Name'], ResultType: 'simple', BypassCache: true },
        ]);
        if (!result?.[0]?.Success) {
            LogError(`KnowledgeConfig: LoadPermissionsAudit failed: ${result?.[0]?.ErrorMessage}`);
            return null;
        }
        return {
            perms: (result[0].Results ?? []) as Array<{ ID: string; SearchScopeID: string; UserID: string | null; RoleID: string | null; PermissionLevel: string }>,
            scopes: (result[1].Results ?? []) as Array<{ ID: string; Name: string }>,
            users: (result[2].Results ?? []) as Array<{ ID: string; Name: string; Email: string }>,
            roles: (result[3].Results ?? []) as Array<{ ID: string; Name: string }>,
        };
    }

    /**
     * Shape the raw fetched data into the audit-table rows. Drops
     * permission rows whose SearchScope is not visible to the current user
     * (MJ's row-level filtering hides scopes from non-Owner callers).
     * Surfacing the permission row with "(unknown)" leaks the row's
     * existence without giving the auditor anything useful — the underlying
     * API already enforces visibility, so this is a UX call, not a security
     * one.
     */
    private shapePermissionsAuditRows(data: {
        perms: Array<{ ID: string; SearchScopeID: string; UserID: string | null; RoleID: string | null; PermissionLevel: string }>;
        scopes: Array<{ ID: string; Name: string }>;
        users: Array<{ ID: string; Name: string; Email: string }>;
        roles: Array<{ ID: string; Name: string }>;
    }): typeof this.PermissionsRows {
        const scopeName = new Map(data.scopes.map(s => [s.ID, s.Name]));
        const userByID = new Map(data.users.map(u => [u.ID, u]));
        const roleName = new Map(data.roles.map(r => [r.ID, r.Name]));
        return data.perms
            .filter(p => scopeName.has(p.SearchScopeID))
            .map(p => {
                const u = p.UserID ? userByID.get(p.UserID) : null;
                return {
                    ID: p.ID,
                    SearchScopeID: p.SearchScopeID,
                    SearchScopeName: scopeName.get(p.SearchScopeID) ?? '(unknown)',
                    UserID: p.UserID,
                    UserName: u?.Name ?? null,
                    UserEmail: u?.Email ?? null,
                    RoleID: p.RoleID,
                    RoleName: p.RoleID ? (roleName.get(p.RoleID) ?? '(unknown)') : null,
                    PermissionLevel: p.PermissionLevel,
                };
            });
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
                // Collapse by ID — defensive against any caller (or interleaved
                // reactive cycle) that could ever put the same scope in twice.
                const byID = new Map<string, MJSearchScopeEntity>();
                for (const s of result.Results ?? []) {
                    byID.set(s.ID, s);
                }
                this.SearchScopes = Array.from(byID.values());
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

    public SelectScopeTab(tab: 'definition' | 'providers' | 'indexes' | 'entities' | 'storage' | 'permissions'): void {
        this.ActiveScopeTab = tab;
        this.cdr.detectChanges();
    }

    public get ActiveScope(): MJSearchScopeEntity | null {
        return this.SearchScopes.find(s => UUIDsEqual(s.ID, this.ActiveScopeID ?? '')) ?? null;
    }

    public async CreateNewScope(): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const scope = await md.GetEntityObject<MJSearchScopeEntity>('MJ: Search Scopes');
            scope.Name = this.pickUniqueNewScopeName();
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
            // Append synchronously so a rapid second + New click picks a fresh
            // unique-suffix Name. An async refetch here would leave a window
            // where pickUniqueNewScopeName() sees a stale list and re-picks
            // the same suffix, producing UQ_SearchScope_Name violations.
            this.SearchScopes = [...this.SearchScopes, scope];
            this.ActiveScopeID = scope.ID;
            this.ActiveScopeTab = 'definition';
            this.cdr.detectChanges();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            MJNotificationService.Instance.CreateSimpleNotification(`Error creating scope: ${msg}`, 'error', 5000);
        }
    }

    /**
     * Pick a placeholder Name that doesn't collide with an existing scope.
     * `__mj.SearchScope.Name` is UNIQUE, so reusing the literal string
     * "New Search Scope" twice in a row throws SQL Server's UQ violation.
     * Walk an incrementing suffix until we find one the in-memory list
     * doesn't already use ("New Search Scope", "New Search Scope 2",
     * "New Search Scope 3", ...). Existing scopes table is small and
     * already loaded, so the linear scan is trivially cheap.
     */
    private pickUniqueNewScopeName(): string {
        const base = 'New Search Scope';
        const existing = new Set(this.SearchScopes.map(s => (s.Name ?? '').toLowerCase()));
        if (!existing.has(base.toLowerCase())) return base;
        for (let i = 2; i < 1000; i++) {
            const candidate = `${base} ${i}`;
            if (!existing.has(candidate.toLowerCase())) return candidate;
        }
        // Fallback: degrade to a timestamp suffix so we never throw.
        return `${base} ${Date.now()}`;
    }

    /**
     * Open the active scope in its full custom form (a new MJExplorer tab).
     * The dashboard view exposes a quick-edit subset; the full form has the
     * Phase 2D / Phase 4 surfaces (Fusion Weights sliders, Reranker dropdown,
     * Reranker Budget Cents, Live Preview, Search Scope Test Queries panel,
     * Search Execution Logs panel, etc.). No-ops for the built-in Global
     * scope (no detail to author) and any scope without an ID yet.
     */
    public OpenActiveScopeFullForm(): void {
        const scope = this.ActiveScope;
        if (!scope?.ID) return;
        const pkey = new CompositeKey([{ FieldName: 'ID', Value: scope.ID }]);
        this.navigationService.OpenEntityRecord('MJ: Search Scopes', pkey);
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
            const md = this.ProviderToUse;
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
            const md = this.ProviderToUse;
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
            const md = this.ProviderToUse;
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
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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
            const md = this.ProviderToUse;
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
