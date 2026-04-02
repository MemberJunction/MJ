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
import { Metadata, RunView } from '@memberjunction/core';
import { ResourceData, UserInfoEngine, MJUserSettingEntity, VectorMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
    ClusterConfig,
    ClusterConfigPanelEntityOption,
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

    // Saved visualizations
    public SavedVisualizations: SavedClusterVisualization[] = [];
    public ActiveSavedId: string | null = null;

    // User setting entity for persistence
    private userSettingEntity: MJUserSettingEntity | null = null;

    // ================================================================
    // Lifecycle
    // ================================================================

    ngAfterViewInit(): void {
        this.loadEntityOptions();
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
        console.log('[ClusterVisualization] Point clicked:', point);
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
        } catch (error) {
            console.warn('[ClusterVisualization] Error loading entity options:', error);
        }
        this.cdr.detectChanges();
    }

    /**
     * Fetch vectors from Entity Document Runs via RunView.
     * Entity Documents store vectorized entity data; we query for runs
     * that match the requested entity.
     */
    private async fetchVectorsForEntity(config: ClusterConfig): Promise<ClusterInputVector[]> {
        const rv = new RunView();

        // Find Entity Documents for the requested entity
        const edResult = await rv.RunView<{ ID: string; EntityID: string; Name: string }>({
            EntityName: 'MJ: Entity Documents',
            ExtraFilter: `Entity = '${config.EntityName.replace(/'/g, "''")}'`,
            Fields: ['ID', 'EntityID', 'Name'],
            ResultType: 'simple',
        });

        if (!edResult.Success || edResult.Results.length === 0) {
            return [];
        }

        // Get vector data from Entity Document Runs
        const entityDocIds = edResult.Results.map(r => `'${r.ID}'`).join(',');
        let extraFilter = `EntityDocumentID IN (${entityDocIds}) AND Status = 'Complete'`;
        if (config.Filter && config.Filter.trim()) {
            extraFilter += ` AND ${config.Filter}`;
        }

        const runResult = await rv.RunView<Record<string, unknown>>({
            EntityName: 'MJ: Entity Document Runs',
            ExtraFilter: extraFilter,
            Fields: ['ID', 'EntityRecordID', 'VectorJSON', 'EntityDocumentID'],
            MaxRows: config.MaxRecords,
            ResultType: 'simple',
        });

        if (!runResult.Success) {
            return [];
        }

        const vectors: ClusterInputVector[] = [];
        for (const row of runResult.Results) {
            const vectorJson = row['VectorJSON'] as string;
            if (!vectorJson) continue;

            let parsed: number[];
            try {
                parsed = JSON.parse(vectorJson);
                if (!Array.isArray(parsed) || parsed.length === 0) continue;
            } catch {
                continue;
            }

            vectors.push({
                Key: String(row['ID'] || ''),
                Label: String(row['EntityRecordID'] || 'Unknown'),
                Vector: parsed,
                Metadata: {
                    EntityDocumentID: row['EntityDocumentID'],
                    EntityRecordID: row['EntityRecordID'],
                },
            });
        }

        return vectors;
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
