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

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { ResourceData, UserInfoEngine, MJUserSettingEntity, VectorMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import {
    ClusterConfig,
    ClusterConfigPanelEntityOption,
    ClusterConfigPanelEntityDocOption,
    ClusterInputVector,
    ClusterVisualizationResult,
    ClusterMetrics,
    ClusterPoint,
    SavedClusterVisualization,
    DefaultClusterConfig,
} from '@memberjunction/ng-clustering';
import { ClusteringService } from '@memberjunction/ng-clustering';

const SAVED_CLUSTERS_KEY = 'KnowledgeHub_SavedClusters';

@RegisterClass(BaseResourceComponent, 'ClusterVisualizationResource')
@Component({
    standalone: false,
    selector: 'app-cluster-visualization-resource',
    templateUrl: './cluster-visualization-resource.component.html',
    styleUrls: ['./cluster-visualization-resource.component.css'],
})
export class ClusterVisualizationResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private clusteringService = inject(ClusteringService);
    private navigationService = inject(NavigationService);
    private destroy$ = new Subject<void>();

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
    }

    ngOnDestroy(): void {
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

        // Update entity doc options if entity changed
        this.updateEntityDocOptions(config.EntityName);

        this.cdr.detectChanges();

        try {
            // Fetch vectors from the database, then pass to the generic service
            const vectors = await this.fetchVectorsForEntity(config);
            this.Result = await this.clusteringService.RunClustering(vectors, config);
            this.VisualizationTitle = `${config.EntityName} — ${config.Algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}`;
        } catch (error) {
            console.error('[ClusterVisualization] Pipeline error:', error);
            this.Result = null;
        } finally {
            this.IsRunning = false;
            this.cdr.detectChanges();
        }
    }

    /** Handle point click — log for now */
    public OnPointClicked(point: ClusterPoint): void {
        const entityName = point.Metadata?.['Entity'] as string;
        const recordID = point.Metadata?.['RecordID'] as string;
        if (!entityName || !recordID) return;

        // RecordID from Pinecone metadata is in composite key string format (e.g., "ID|26EA1B87-...")
        const compositeKey = new CompositeKey();
        compositeKey.SimpleLoadFromURLSegment(recordID);
        this.navigationService.OpenEntityRecord(entityName, compositeKey);
    }

    /** Handle point hover */
    public OnPointHovered(_point: ClusterPoint | null): void {
        // No-op for now; the scatter component handles tooltip display
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
        };

        this.SavedVisualizations = [saved, ...this.SavedVisualizations];
        this.ActiveSavedId = id;
        await this.persistSavedVisualizations();
        this.cdr.detectChanges();
    }

    /** Select a saved visualization and re-run it */
    public async OnSelectSaved(saved: SavedClusterVisualization): Promise<void> {
        this.ActiveSavedId = saved.Id;
        this.VisualizationTitle = saved.Name;

        // Reconstruct config from saved params
        const config: ClusterConfig = {
            ...DefaultClusterConfig(),
            ...saved.Params,
            EntityName: saved.EntityName,
            Algorithm: saved.Algorithm,
        };

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
        this.ActiveSavedId = null;
        this.Result = null;
        this.VisualizationTitle = 'New Cluster Analysis';
        this.ActiveConfig = DefaultClusterConfig();
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
            // Use VectorMetadataEngine for cached entity document data
            const engine = VectorMetadataEngine.Instance;
            await engine.Config(false);

            const entityNames = engine.GetEntitiesWithDocuments();
            if (entityNames.length > 0) {
                this.EntityOptions = entityNames.map(name => ({ Name: name }));
            }

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

        const engine = VectorMetadataEngine.Instance;
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
        // Use the selected entity document, or fall back to first active one
        let entityDocID = config.EntityDocumentID;
        if (!entityDocID) {
            const engine = VectorMetadataEngine.Instance;
            const entityDocs = engine.GetEntityDocumentsForEntity(config.EntityName)
                .filter(d => d.Status === 'Active');
            if (entityDocs.length === 0) {
                return [];
            }
            entityDocID = entityDocs[0].ID;
        }

        // Fetch vectors + metadata directly from the vector database (Pinecone)
        const provider = Metadata.Provider as GraphQLDataProvider;
        const aiClient = new GraphQLAIClient(provider);
        const result = await aiClient.FetchEntityVectors({
            entityDocumentID: entityDocID,
            maxRecords: config.MaxRecords,
            filter: config.Filter || undefined,
        });

        if (!result.Success || result.Results.length === 0) {
            return [];
        }

        // Convert vector DB results to ClusterInputVector format
        const vectors: ClusterInputVector[] = [];
        for (const item of result.Results) {
            if (!item.Values || item.Values.length === 0) continue;

            const metadata = this.parseVectorMetadata(item.Metadata);
            const label = this.buildLabel(metadata);

            vectors.push({
                Key: item.ID,
                Label: label,
                Vector: item.Values,
                Metadata: metadata,
            });
        }

        return vectors;
    }

    /** Parse the JSON metadata string from the vector DB into a record */
    private parseVectorMetadata(metadataJson: string): Record<string, string> {
        try {
            return JSON.parse(metadataJson) as Record<string, string>;
        } catch {
            return {};
        }
    }

    /** Build a human-readable label from vector metadata (prefers Name field, falls back to RecordID) */
    private buildLabel(metadata: Record<string, string>): string {
        // The vector sync process stores display fields directly in metadata.
        // Prefer Name, then Title, then Description, then fall back to RecordID.
        return metadata['Name']
            || metadata['Title']
            || metadata['Description']?.substring(0, 60)
            || metadata['RecordID']
            || 'Unknown';
    }

    /** Load saved visualizations from UserInfoEngine settings */
    private loadSavedVisualizations(): void {
        try {
            const engine = UserInfoEngine.Instance;
            const setting = engine.UserSettings.find(s => s.Setting === SAVED_CLUSTERS_KEY);
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

    /** Persist saved visualizations to UserInfoEngine settings */
    private async persistSavedVisualizations(): Promise<void> {
        try {
            const md = new Metadata();
            const userId = md.CurrentUser?.ID;
            if (!userId) return;

            if (!this.userSettingEntity) {
                const engine = UserInfoEngine.Instance;
                const existing = engine.UserSettings.find(s => s.Setting === SAVED_CLUSTERS_KEY);
                if (existing) {
                    this.userSettingEntity = existing;
                } else {
                    this.userSettingEntity = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
                    this.userSettingEntity.UserID = userId;
                    this.userSettingEntity.Setting = SAVED_CLUSTERS_KEY;
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
