/**
 * @fileoverview Knowledge Hub Clusters Dashboard Tab
 *
 * Full-page cluster visualization with:
 * - Left sidebar: saved cluster visualizations (persisted via UserInfoEngine)
 * - Main area: SVG scatter plot (mj-cluster-scatter)
 * - Floating config panel (mj-cluster-config-panel)
 * - Top metrics bar
 *
 * Registered as BaseResourceComponent for the Knowledge Hub application.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject, ViewChild, Input, Output, EventEmitter } from '@angular/core';
import { Subject } from 'rxjs';
import { CompositeKey, Metadata, EntityFieldInfo } from '@memberjunction/core';
import { ResourceData, UserInfoEngine, MJUserSettingEntity, KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService, ActivityService } from '@memberjunction/ng-shared';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    ClusterConfig,
    ClusterConfigPanelEntityOption,
    ClusterConfigPanelEntityDocOption,
    ClusterInputVector,
    ClusterVisualizationResult,
    ClusterMetrics,
    ClusterPoint,
    ClusterLabel,
    SavedClusterVisualization,
    DefaultClusterConfig,
    ViewportTransform,
} from '@memberjunction/ng-clustering';
import { ClusteringService, ClusterScatterComponent } from '@memberjunction/ng-clustering';

/**
 * Build an environment-scoped storage key so cluster data does not bleed
 * across different database environments that share the same browser.
 * Uses the GraphQL endpoint origin as the environment fingerprint.
 */
function buildEnvScopedKey(base: string): string {
    try {
        const origin = (Metadata.Provider as GraphQLDataProvider).ConfigData?.URL; // global-provider-ok: free helper function — no component context
        if (origin) {
            // Use just the origin portion (protocol + host) so path differences don't fragment keys
            const url = new URL(origin);
            return `${base}_${url.origin}`;
        }
    } catch { /* fall through */ }
    return base;
}

const SAVED_CLUSTERS_BASE_KEY = 'KnowledgeHub_SavedClusters';
const LAST_SESSION_BASE_KEY = 'KnowledgeHub_LastClusterSession';

@RegisterClass(BaseResourceComponent, 'ClusterVisualizationResource')
@Component({
    standalone: false,
    selector: 'app-cluster-visualization-resource',
    templateUrl: './cluster-visualization-resource.component.html',
    styleUrls: ['./cluster-visualization-resource.component.css'],
})
export class ClusterVisualizationResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    @ViewChild('scatterPlot') scatterPlot?: ClusterScatterComponent;

    private cdr = inject(ChangeDetectorRef);
    private clusteringService = inject(ClusteringService);
    private activityService = inject(ActivityService);
    protected override navigationService = inject(NavigationService);
    protected override destroy$ = new Subject<void>();

    /** LLM-generated cluster labels for the current result */
    public ClusterLabels: ClusterLabel[] = [];

    /**
     * When true, this component is embedded inside the Visualize host surface.
     * In that case the host owns the resource lifecycle (NotifyLoadComplete,
     * agent context) and record navigation, so this component suppresses those
     * and instead emits open-record intents via {@link OpenRecordRequested}.
     */
    @Input() Embedded = false;

    /** Emitted (only when Embedded) to ask the host to open an entity record. */
    @Output() OpenRecordRequested = new EventEmitter<{ EntityName: string; RecordID: string }>();

    // ================================================================
    // Resource overrides
    // ================================================================

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Clusters';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-circle-nodes';
    }

    // ================================================================
    // State
    // ================================================================

    /** Current visualization result */
    public Result: ClusterVisualizationResult | null = null;
    /** Whether a clustering run is in progress */
    public IsRunning = false;
    /** The active cluster config */
    public ActiveConfig: ClusterConfig = DefaultClusterConfig();
    /** Title for the top bar */
    public VisualizationTitle = 'New Cluster Analysis';
    /** Entity options for the config panel dropdown */
    public EntityOptions: ClusterConfigPanelEntityOption[] = [];
    /** Entity document options for the selected entity (shown when 2+) */
    public EntityDocOptions: ClusterConfigPanelEntityDocOption[] = [];
    /** All entity documents across entities (for the multi-entity source selector) */
    public AllEntityDocOptions: ClusterConfigPanelEntityDocOption[] = [];
    /** User-facing error from the last run (e.g. multi-entity embedding mismatch) */
    public RunError: string | null = null;
    /** Ordered field keys for prioritized display in scatter tooltip/detail */
    public FieldPriority: string[] = [];
    /** Map of field names to human-readable display names */
    public FieldDisplayNames: Record<string, string> = {};

    // Saved visualizations
    public SavedVisualizations: SavedClusterVisualization[] = [];
    public ActiveSavedId: string | null = null;

    // User setting entity for persistence
    private userSettingEntity: MJUserSettingEntity | null = null;

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngAfterViewInit(): Promise<void> {
        await this.loadEntityOptions();
        this.loadSavedVisualizations();
        this.restoreLastSession();
        // When embedded in the Visualize host, the host owns agent context +
        // the resource load lifecycle; skip them here to avoid double-reporting.
        if (!this.Embedded) {
            this.emitAgentContext();
            this.registerAgentTools();
            this.NotifyLoadComplete();
        }
    }

    // ================================================================
    // Agent context + client tools
    // ================================================================

    /**
     * Publish the current clustering state to the AI agent. Re-emitted whenever
     * a run completes, a saved visualization is selected, or the analysis is
     * reset — so the streamed context tracks what's on screen. No-op when
     * embedded (the Visualize host owns reporting).
     */
    private emitAgentContext(): void {
        if (this.Embedded) {
            return;
        }
        this.navigationService.SetAgentContext(this, {
            IsVisualizationLoaded: !!this.Result,
            VisualizationTitle: this.VisualizationTitle || null,
            ClusterCount: this.Result?.Clusters?.length ?? 0,
            TotalPoints: this.Result?.Points?.length ?? 0,
            IsRunning: this.IsRunning,
            SavedVisualizationCount: this.SavedVisualizations.length,
        });
    }

    /**
     * Register the agent-actionable operations: re-run clustering with the
     * current configuration, and reset to a fresh analysis. Both wire to
     * existing methods and never throw.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RegenerateClusters',
                Description: 'Re-run the clustering analysis using the currently configured entity, algorithm, and parameters.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    if (this.IsRunning) {
                        return { Success: false, ErrorMessage: 'A clustering run is already in progress' };
                    }
                    await this.OnRunClustering(this.ActiveConfig);
                    return this.RunError
                        ? { Success: false, ErrorMessage: this.RunError }
                        : { Success: true, Data: { ClusterCount: this.Result?.Clusters?.length ?? 0 } };
                },
            },
            {
                Name: 'ResetClusterAnalysis',
                Description: 'Clear the current cluster visualization and start a fresh analysis.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.OnNewAnalysis();
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
    // Getters
    // ================================================================

    public get Metrics(): ClusterMetrics | null {
        return this.Result?.Metrics ?? null;
    }

    public get HasResult(): boolean {
        return this.Result != null && this.Result.Points.length > 0;
    }

    public get SilhouetteScoreFormatted(): string {
        return this.Result?.Metrics?.SilhouetteScore?.toFixed(2) ?? '--';
    }

    public get IsSilhouetteGood(): boolean {
        return (this.Result?.Metrics?.SilhouetteScore ?? 0) >= 0.5;
    }

    public get ComputationTimeFormatted(): string {
        const ms = this.Result?.Metrics?.ComputationTimeMs ?? 0;
        return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    }

    // ================================================================
    // Public Methods
    // ================================================================

    /** Handle "Run Clustering" from the config panel */
    public async OnRunClustering(config: ClusterConfig): Promise<void> {
        this.IsRunning = true;
        this.ActiveConfig = config;
        this.ClusterLabels = [];
        this.RunError = null;

        // Auto-hide detail panel from previous visualization
        this.scatterPlot?.CloseDetailPanel();

        // Update entity doc options if entity changed
        this.updateEntityDocOptions(config.EntityName);

        this.cdr.detectChanges();

        const activityID = this.activityService.Start('Cluster analysis', {
            icon: 'fa-solid fa-circle-nodes',
            detail: `${config.EntityName || 'Multiple sources'} · ${config.Algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}`,
        });
        try {
            // Fetch vectors from the vector database
            const vectors = await this.fetchVectorsForEntity(config);

            // Run clustering (client-side UMAP + K-Means/DBSCAN)
            this.Result = await this.clusteringService.RunClustering(vectors, config);
            this.activityService.Complete(activityID, 'success', `${this.Result.Points.length} points · ${this.Result.Clusters.length} clusters`);
            this.VisualizationTitle = `${config.EntityName} — ${config.Algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}`;
            this.FieldPriority = this.ComputeFieldPriority(config.EntityName);

            // Fire LLM cluster naming in the background (non-blocking).
            // Clusters render immediately; labels appear when LLM responds.
            this.requestClusterLabelsFromLLM().catch(err =>
                console.warn('[ClusterVisualization] Background naming failed:', err)
            );
            // Auto-save session state so it can be restored after navigation
            this.saveLastSession();
        } catch (error) {
            console.error('[ClusterVisualization] Pipeline error:', error);
            this.Result = null;
            this.RunError = error instanceof Error ? error.message : String(error);
            this.activityService.Complete(activityID, 'error', this.RunError);
        } finally {
            this.IsRunning = false;
            this.emitAgentContext();
            this.cdr.detectChanges();
        }
    }

    /**
     * Re-run when the user flips 2D⇄3D so the projection updates immediately.
     * A 3D layout needs a Z coordinate that only a fresh projection produces, so
     * toggling alone wouldn't change the existing plot.
     */
    public OnDimensionsChanged(dims: 2 | 3): void {
        this.ActiveConfig = { ...this.ActiveConfig, Dimensions: dims };
        if (this.Result && this.Result.Points.length > 0 && !this.IsRunning) {
            void this.OnRunClustering(this.ActiveConfig);
        }
    }

    /** Handle point click — log for now */
    public OnPointClicked(_point: ClusterPoint): void {
        // Detail panel is handled by the scatter component internally
    }

    /** Handle point hover */
    public OnPointHovered(_point: ClusterPoint | null): void {
        // Tooltip display handled by scatter component
    }

    /** Navigate to the entity record when "Open Record" is clicked in the detail panel */
    public OnOpenRecord(point: ClusterPoint): void {
        const entityName = point.Metadata?.['Entity'] as string;
        const recordID = point.Metadata?.['RecordID'] as string;
        if (!entityName || !recordID) return;

        // When embedded, defer navigation to the host (shared drilldown owner).
        if (this.Embedded) {
            this.OpenRecordRequested.emit({ EntityName: entityName, RecordID: recordID });
            return;
        }

        const compositeKey = new CompositeKey();
        compositeKey.SimpleLoadFromURLSegment(recordID);
        this.navigationService.OpenEntityRecord(entityName, compositeKey);
    }

    /** Save the current visualization */
    public async OnSaveVisualization(): Promise<void> {
        if (!this.Result) return;

        const id = crypto.randomUUID();
        const saved: SavedClusterVisualization = {
            Id: id,
            Name: this.VisualizationTitle,
            EntityName: this.ActiveConfig.EntityName,
            Algorithm: this.ActiveConfig.Algorithm,
            Params: { ...this.ActiveConfig },
            CreatedAt: new Date().toISOString(),
            Result: this.stripVectorsFromResult(this.Result),
            Viewport: this.scatterPlot?.GetViewportTransform(),
            ClusterLabels: this.ClusterLabels.length > 0 ? [...this.ClusterLabels] : undefined,
        };

        this.SavedVisualizations = [saved, ...this.SavedVisualizations];
        this.ActiveSavedId = id;
        await this.persistSavedVisualizations();
        this.cdr.detectChanges();
    }

    /** Select a saved visualization — restore from cache if available, otherwise re-run */
    public async OnSelectSaved(saved: SavedClusterVisualization): Promise<void> {
        this.scatterPlot?.CloseDetailPanel();
        this.ActiveSavedId = saved.Id;
        this.VisualizationTitle = saved.Name;

        // Reconstruct config
        const config: ClusterConfig = {
            ...DefaultClusterConfig(),
            ...saved.Params,
            EntityName: saved.EntityName,
            Algorithm: saved.Algorithm,
        };
        this.ActiveConfig = config;

        // If we have cached results, restore instantly without re-running
        if (saved.Result) {
            this.Result = saved.Result;
            this.ClusterLabels = saved.ClusterLabels ?? [];
            this.applyLabelsToResult();
            this.cdr.detectChanges();

            // Restore viewport after a tick (scatter needs to render first)
            if (saved.Viewport) {
                setTimeout(() => {
                    this.scatterPlot?.SetViewportTransform(saved.Viewport!);
                    this.cdr.detectChanges();
                }, 50);
            }
            this.emitAgentContext();
            return;
        }

        // No cached results — re-run from scratch (OnRunClustering re-emits context)
        await this.OnRunClustering(config);
    }

    /** Delete a saved visualization */
    public async OnDeleteSaved(saved: SavedClusterVisualization, event: MouseEvent): Promise<void> {
        event.stopPropagation();
        this.SavedVisualizations = this.SavedVisualizations.filter(s => s.Id !== saved.Id);
        if (this.ActiveSavedId === saved.Id) {
            this.ActiveSavedId = null;
        }
        await this.persistSavedVisualizations();
        this.cdr.detectChanges();
    }

    /** Start a new analysis (clear current) */
    public OnNewAnalysis(): void {
        this.scatterPlot?.CloseDetailPanel();
        this.ActiveSavedId = null;
        this.Result = null;
        this.ClusterLabels = [];
        this.VisualizationTitle = 'New Cluster Analysis';
        this.ActiveConfig = DefaultClusterConfig();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    public IsActiveSaved(saved: SavedClusterVisualization): boolean {
        return this.ActiveSavedId === saved.Id;
    }

    public TrackSavedBy(_index: number, saved: SavedClusterVisualization): string {
        return saved.Id;
    }

    public FormatDate(iso: string): string {
        try {
            return new Date(iso).toLocaleDateString();
        } catch {
            return iso;
        }
    }

    // ================================================================
    // Private Methods
    // ================================================================

    /** Populate the entity options for the config panel dropdown */
    private async loadEntityOptions(): Promise<void> {
        try {
            // Use KnowledgeHubMetadataEngine for cached entity document data
            const engine = KnowledgeHubMetadataEngine.Instance;
            await engine.Config(false);

            const entityNames = engine.GetEntitiesWithDocuments();
            if (entityNames.length > 0) {
                this.EntityOptions = entityNames.map(name => ({ Name: name }));
            }

            // Build the cross-entity document list that powers the multi-entity
            // source selector (each option tagged with its owning entity).
            const allDocs: ClusterConfigPanelEntityDocOption[] = [];
            for (const name of entityNames) {
                const docs = engine.GetEntityDocumentsForEntity(name).filter(d => d.Status === 'Active');
                for (const d of docs) {
                    allDocs.push({ ID: d.ID, Name: d.Name, EntityName: name });
                }
            }
            this.AllEntityDocOptions = allDocs;

            // Set default entity if config is blank
            if (this.EntityOptions.length > 0 && !this.ActiveConfig.EntityName) {
                this.ActiveConfig.EntityName = this.EntityOptions[0].Name;
            }

            // Populate entity doc options for the default entity
            this.updateEntityDocOptions(this.ActiveConfig.EntityName);
        } catch (error) {
            console.warn('[ClusterVisualization] Error loading entity options:', error);
        }
        this.cdr.detectChanges();
    }

    /** Update entity document options when the selected entity changes */
    private updateEntityDocOptions(entityName: string): void {
        if (!entityName) {
            this.EntityDocOptions = [];
            return;
        }

        const engine = KnowledgeHubMetadataEngine.Instance;
        const docs = engine.GetEntityDocumentsForEntity(entityName)
            .filter(d => d.Status === 'Active');

        this.EntityDocOptions = docs.map(d => ({ ID: d.ID, Name: d.Name }));

        // Auto-select the first doc (or clear if none)
        if (docs.length > 0 && !this.ActiveConfig.EntityDocumentID) {
            this.ActiveConfig.EntityDocumentID = docs[0].ID;
        } else if (docs.length === 0) {
            this.ActiveConfig.EntityDocumentID = '';
        }
    }

    /**
     * Fetch vectors from Entity Document Runs via RunView.
     * Entity Documents store vectorized entity data; we query for runs
     * that match the requested entity.
     */
    private async fetchVectorsForEntity(config: ClusterConfig): Promise<ClusterInputVector[]> {
        const docIDs = this.resolveDocIDs(config);
        if (docIDs.length === 0) {
            return [];
        }

        const isMulti = docIDs.length > 1;
        const docEntityMap = new Map(this.AllEntityDocOptions.map(d => [d.ID, d.EntityName ?? '']));
        const provider = this.ProviderToUse as GraphQLDataProvider;
        const aiClient = new GraphQLAIClient(provider);

        const vectors: ClusterInputVector[] = [];
        let expectedLen = -1;

        for (const docID of docIDs) {
            const result = await aiClient.FetchEntityVectors({
                entityDocumentID: docID,
                maxRecords: config.MaxRecords,
                filter: config.Filter || undefined,
            });
            if (!result.Success || result.Results.length === 0) continue;

            for (const item of result.Results) {
                if (!item.Values || item.Values.length === 0) continue;

                // Hard-block multi-entity embedding mismatches: vectors of different
                // dimensionalities live in different spaces and aren't co-clusterable.
                if (isMulti) {
                    if (expectedLen === -1) {
                        expectedLen = item.Values.length;
                    } else if (item.Values.length !== expectedLen) {
                        throw new Error(
                            'The selected documents use different embedding models (vector sizes differ), ' +
                            'so their points are not comparable. Pick documents that share the same embedding model.',
                        );
                    }
                }

                const metadata = this.parseVectorMetadata(item.Metadata);
                // Ensure each point knows its source entity for color-by-entity.
                if (isMulti && !metadata['EntityName']) {
                    metadata['EntityName'] = docEntityMap.get(docID) ?? metadata['Entity'] ?? '';
                }
                const label = this.buildLabel(metadata);

                vectors.push({
                    Key: item.ID,
                    Label: label,
                    Vector: item.Values,
                    Metadata: metadata,
                });
            }
        }

        return vectors;
    }

    /** Resolve which entity-document IDs to source vectors from for a run. */
    private resolveDocIDs(config: ClusterConfig): string[] {
        if (config.EntityDocumentIDs && config.EntityDocumentIDs.length > 0) {
            return config.EntityDocumentIDs;
        }
        if (config.EntityDocumentID) {
            return [config.EntityDocumentID];
        }
        const engine = KnowledgeHubMetadataEngine.Instance;
        const docs = engine.GetEntityDocumentsForEntity(config.EntityName).filter(d => d.Status === 'Active');
        return docs.length > 0 ? [docs[0].ID] : [];
    }

    /** Parse the JSON metadata string from the vector DB into a record */
    private parseVectorMetadata(metadataJson: string): Record<string, string> {
        try {
            return JSON.parse(metadataJson) as Record<string, string>;
        } catch {
            return {};
        }
    }

    /**
     * Build a human-readable label from vector metadata using entity field metadata.
     * Combines all IsNameField fields in Sequence order (e.g., "Sarah Chen" from FirstName + LastName).
     * Falls back to heuristic field detection when entity metadata isn't available.
     */
    private buildLabel(metadata: Record<string, string>): string {
        const entityName = metadata['Entity'];
        if (entityName) {
            try {
                const md = this.ProviderToUse;
                const entityInfo = md.Entities.find(e => e.Name === entityName);
                if (entityInfo) {
                    // Combine all IsNameField fields in Sequence order
                    const nameFields = entityInfo.Fields
                        .filter(f => f.IsNameField)
                        .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
                    if (nameFields.length > 0) {
                        const parts = nameFields
                            .map(f => metadata[f.Name])
                            .filter(v => v != null && v.trim() !== '');
                        if (parts.length > 0) return parts.join(' ');
                    }
                    // Single NameField fallback
                    if (entityInfo.NameField && metadata[entityInfo.NameField.Name]) {
                        return metadata[entityInfo.NameField.Name];
                    }
                }
            } catch { /* metadata not available, fall through */ }
        }
        // Heuristic fallbacks
        return metadata['Name']
            || metadata['Title']
            || metadata['Description']?.substring(0, 60)
            || metadata['RecordID']
            || 'Unknown';
    }

    // ================================================================
    // LLM Cluster Naming
    // ================================================================

    /**
     * After clustering completes, send sample records per cluster to an LLM for naming.
     * Updates ClusterLabels and refreshes the view.
     */
    private async requestClusterLabelsFromLLM(): Promise<void> {
        if (!this.Result || this.Result.Clusters.length === 0) return;

        try {
            const clusterData = this.buildClusterDataForPrompt(this.Result);
            if (!clusterData) return;

            // AIEngineBase is deferred at startup; ensure it's loaded before reading .Prompts.
            await AIEngineBase.Instance.EnsureLoaded();
            // Look up the "Cluster Naming" prompt from AIEngineBase cached metadata
            const promptEntity = AIEngineBase.Instance.Prompts.find(p => p.Name === 'Cluster Naming');
            if (!promptEntity) {
                console.warn('[ClusterVisualization] "Cluster Naming" prompt not found — run metadata sync');
                return;
            }

            const provider = this.ProviderToUse as GraphQLDataProvider;
            const aiClient = new GraphQLAIClient(provider);
            const result = await aiClient.RunAIPrompt({
                promptId: promptEntity.ID,
                data: { clusterData },
            });

            if (result.success && result.parsedResult) {
                const labels = result.parsedResult as Array<{ clusterId: number; label: string }>;
                this.ClusterLabels = labels.map(l => ({
                    ClusterId: l.clusterId,
                    Label: l.label,
                    IsUserEdited: false,
                }));
                this.applyLabelsToResult();
                this.cdr.detectChanges();
            }
        } catch (error) {
            console.warn('[ClusterVisualization] LLM cluster naming failed:', error);
        }
    }

    /** Build a text block describing sample records per cluster for the LLM prompt */
    private buildClusterDataForPrompt(result: ClusterVisualizationResult): string | null {
        if (!result.Clusters || result.Clusters.length === 0) return null;

        const lines: string[] = [];
        for (const cluster of result.Clusters) {
            // Get points in this cluster, take up to 5 samples
            const clusterPoints = result.Points.filter(p => p.ClusterId === cluster.Id);
            const samples = clusterPoints.slice(0, 5);
            if (samples.length === 0) continue;

            lines.push(`### Cluster ${cluster.Id} (${clusterPoints.length} records)`);
            for (const point of samples) {
                const meta = point.Metadata || {};
                // Include the most informative metadata fields
                const fields = ['Name', 'Title', 'Description', 'Entity', 'Status', 'Type']
                    .filter(f => meta[f])
                    .map(f => `${f}: ${meta[f]}`)
                    .join(', ');
                lines.push(`- ${fields || point.Label}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Handle inline label edits from the scatter component legend.
     * Updates the ClusterLabels cache and marks the label as user-edited.
     */
    public OnLabelEdited(event: { ClusterId: number; OldLabel: string; NewLabel: string }): void {
        const existing = this.ClusterLabels.find(l => l.ClusterId === event.ClusterId);
        if (existing) {
            existing.Label = event.NewLabel;
            existing.IsUserEdited = true;
        } else {
            this.ClusterLabels.push({
                ClusterId: event.ClusterId,
                Label: event.NewLabel,
                IsUserEdited: true,
            });
        }
        this.cdr.detectChanges();
    }

    /**
     * Compute the prioritized field order and display names from entity metadata.
     * Sets both FieldPriority and FieldDisplayNames.
     * Returns field names sorted: IsNameField first, then DefaultInView by Sequence,
     * then remaining fields by Sequence.
     */
    private ComputeFieldPriority(entityName: string): string[] {
        try {
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            if (!entityInfo) return [];

            const internalKeys = new Set([
                'ID', 'Entity', 'EntityIcon', 'RecordID', 'TemplateID',
                '__mj_UpdatedAt', '__mj_CreatedAt',
            ]);

            // Build display names map
            const displayNames: Record<string, string> = {};
            for (const f of entityInfo.Fields) {
                displayNames[f.Name] = f.DisplayNameOrName;
            }
            this.FieldDisplayNames = displayNames;

            return entityInfo.Fields
                .filter(f => !internalKeys.has(f.Name) && !f.IsVirtual && !f.IsPrimaryKey)
                .sort((a, b) => {
                    if (a.IsNameField !== b.IsNameField) return a.IsNameField ? -1 : 1;
                    if (a.DefaultInView !== b.DefaultInView) return a.DefaultInView ? -1 : 1;
                    return (a.Sequence ?? 9999) - (b.Sequence ?? 9999);
                })
                .map(f => f.Name);
        } catch {
            return [];
        }
    }

    /** Apply cluster labels to the result's Clusters array (sets the Label property) */
    private applyLabelsToResult(): void {
        if (!this.Result || this.ClusterLabels.length === 0) return;

        for (const label of this.ClusterLabels) {
            const cluster = this.Result.Clusters.find(c => c.Id === label.ClusterId);
            if (cluster) {
                cluster.Label = label.Label;
            }
        }
    }

    /**
     * Strip full vector arrays from the result before saving (they're large and not needed for display).
     * Keeps points with 2D coordinates and metadata but removes the original high-dimensional vectors.
     */
    private stripVectorsFromResult(result: ClusterVisualizationResult): ClusterVisualizationResult {
        return {
            ...result,
            Points: result.Points.map(p => ({
                ...p,
                Vector: [], // Strip the high-dimensional vector — only 2D coords (X, Y) matter for display
            })),
        };
    }

    /** Load saved visualizations from UserInfoEngine settings */
    private loadSavedVisualizations(): void {
        try {
            const key = buildEnvScopedKey(SAVED_CLUSTERS_BASE_KEY);
            const engine = UserInfoEngine.Instance;
            const setting = engine.UserSettings.find(s => s.Setting === key);
            if (setting?.Value) {
                this.userSettingEntity = setting;
                this.SavedVisualizations = JSON.parse(setting.Value) as SavedClusterVisualization[];
            }
        } catch (error) {
            console.warn('[ClusterVisualization] Error loading saved visualizations:', error);
            this.SavedVisualizations = [];
        }
        this.cdr.detectChanges();
    }

    /**
     * Auto-save the current session to localStorage so it can be restored
     * when the user navigates away and comes back.
     */
    private saveLastSession(): void {
        if (!this.Result) return;
        try {
            const session = {
                Result: this.stripVectorsFromResult(this.Result),
                ClusterLabels: this.ClusterLabels,
                Config: this.ActiveConfig,
                Title: this.VisualizationTitle,
                Viewport: this.scatterPlot?.GetViewportTransform() ?? null,
            };
            localStorage.setItem(buildEnvScopedKey(LAST_SESSION_BASE_KEY), JSON.stringify(session));
        } catch {
            // localStorage quota exceeded or not available — non-critical
        }
    }

    /**
     * Restore the last session from localStorage if no saved visualization is active.
     * This handles the "navigate away and come back" case.
     */
    private restoreLastSession(): void {
        if (this.Result || this.ActiveSavedId) return; // Already showing something
        try {
            const raw = localStorage.getItem(buildEnvScopedKey(LAST_SESSION_BASE_KEY));
            if (!raw) return;
            const session = JSON.parse(raw) as {
                Result: ClusterVisualizationResult;
                ClusterLabels: ClusterLabel[];
                Config: ClusterConfig;
                Title: string;
                Viewport: ViewportTransform | null;
            };
            this.Result = session.Result;
            this.ClusterLabels = session.ClusterLabels ?? [];
            this.ActiveConfig = session.Config;
            this.VisualizationTitle = session.Title ?? 'Restored Session';
            this.FieldPriority = this.ComputeFieldPriority(session.Config.EntityName);
            this.applyLabelsToResult();
            this.cdr.detectChanges();

            // Restore viewport after a tick to let the scatter component render
            if (session.Viewport) {
                setTimeout(() => {
                    this.scatterPlot?.SetViewportTransform(session.Viewport!);
                }, 50);
            }
        } catch {
            localStorage.removeItem(buildEnvScopedKey(LAST_SESSION_BASE_KEY));
        }
    }

    /** Persist saved visualizations to UserInfoEngine settings */
    private async persistSavedVisualizations(): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const userId = md.CurrentUser?.ID;
            if (!userId) return;

            if (!this.userSettingEntity) {
                const key = buildEnvScopedKey(SAVED_CLUSTERS_BASE_KEY);
                const engine = UserInfoEngine.Instance;
                const existing = engine.UserSettings.find(s => s.Setting === key);
                if (existing) {
                    this.userSettingEntity = existing;
                } else {
                    this.userSettingEntity = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
                    this.userSettingEntity.UserID = userId;
                    this.userSettingEntity.Setting = buildEnvScopedKey(SAVED_CLUSTERS_BASE_KEY);
                }
            }

            this.userSettingEntity.Value = JSON.stringify(this.SavedVisualizations);
            await this.userSettingEntity.Save();
        } catch (error) {
            console.warn('[ClusterVisualization] Error saving visualizations:', error);
        }
    }
}

/** Tree-shaking prevention */
export function LoadClusterVisualizationResource(): void {
    // Prevents tree-shaking of the component
}
