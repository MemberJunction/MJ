/**
 * @fileoverview Content Autotagging Pipeline Monitor
 *
 * Operations dashboard for monitoring the content autotagging pipeline.
 * Displays KPI metrics, pipeline stage visualization, recent processing feed,
 * and source configuration status. Supports triggering pipeline runs with
 * real-time progress via GraphQL subscriptions.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';

/** Represents a single pipeline stage with its current status */
interface PipelineStage {
    Name: string;
    Icon: string;
    ActiveCount: number;
    Status: 'idle' | 'active' | 'error';
}

/** Summary of a recently processed content item */
interface ProcessedItem {
    Name: string;
    SourceName: string;
    ProcessingTimeMs: number;
    Status: 'Complete' | 'Error' | 'Processing';
    TagCount: number;
    ProcessedAt: Date;
}

/** Summary of a configured content source */
interface ContentSource {
    ID: string;
    Name: string;
    TypeName: string;
    TypeIcon: string;
    Status: 'Active' | 'Paused' | 'Error';
    LastRunAt: Date | null;
    ItemCount: number;
}

/** KPI metric card data */
interface KPIMetric {
    Label: string;
    Value: number;
    Icon: string;
    ColorClass: string;
}

@RegisterClass(BaseResourceComponent, 'AutotaggingPipelineResource')
@Component({
    standalone: false,
    selector: 'app-autotagging-pipeline-resource',
    templateUrl: './autotagging-pipeline-resource.component.html',
    styleUrls: ['./autotagging-pipeline-resource.component.css']
})
export class AutotaggingPipelineResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private destroy$ = new Subject<void>();

    public IsLoading = false;
    public ErrorMessage = '';

    // KPI data
    public KPIMetrics: KPIMetric[] = [];

    // Pipeline stages
    public PipelineStages: PipelineStage[] = [];

    // Recent processing feed
    public ProcessedItems: ProcessedItem[] = [];

    // Source configuration
    public ContentSources: ContentSource[] = [];

    // Pipeline run state
    public IsRunning = false;
    public RunProgress = 0;
    public RunStage = '';
    public RunCurrentItem = '';
    private currentPipelineRunID: string | null = null;

    // Raw data holders for aggregation
    private contentItems: Record<string, unknown>[] = [];
    private contentRuns: Record<string, unknown>[] = [];
    private contentTags: Record<string, unknown>[] = [];
    private contentSourceTypes: Record<string, unknown>[] = [];
    private contentSourcesRaw: Record<string, unknown>[] = [];

    private cdr = inject(ChangeDetectorRef);

    async ngAfterViewInit(): Promise<void> {
        await this.LoadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Content Autotagging';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-tags';
    }

    /** Load all pipeline data from MJ entities */
    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.ErrorMessage = '';
        this.cdr.detectChanges();

        try {
            const rv = new RunView();
            const [sourcesResult, itemsResult, runsResult, tagsResult, typesResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Content Sources',
                    OrderBy: 'Name',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Content Items',
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 200,
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Content Process Runs',
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 100,
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Content Item Tags',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Content Source Types',
                    ResultType: 'simple'
                }
            ]);

            this.contentSourcesRaw = sourcesResult.Success ? sourcesResult.Results : [];
            this.contentItems = itemsResult.Success ? itemsResult.Results : [];
            this.contentRuns = runsResult.Success ? runsResult.Results : [];
            this.contentTags = tagsResult.Success ? tagsResult.Results : [];
            this.contentSourceTypes = typesResult.Success ? typesResult.Results : [];

            this.buildKPIMetrics();
            this.buildPipelineStages();
            this.buildProcessedItems();
            this.buildContentSources();
        } catch (error) {
            console.error('Error loading autotagging pipeline data:', error);
            this.ErrorMessage = 'Failed to load pipeline data. Please try again.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Refresh pipeline status data */
    public async RefreshData(): Promise<void> {
        await this.LoadData();
    }

    /** Trigger the autotagging pipeline via GraphQL mutation */
    public async RunPipeline(): Promise<void> {
        if (this.IsRunning) return;

        const provider = Metadata.Provider as GraphQLDataProvider;
        if (!provider) return;

        this.IsRunning = true;
        this.RunProgress = 0;
        this.RunStage = 'Starting...';
        this.RunCurrentItem = '';
        this.cdr.detectChanges();

        try {
            const aiClient = new GraphQLAIClient(provider);
            const result = await aiClient.RunAutotagPipeline();

            if (!result.Success || !result.PipelineRunID) {
                this.IsRunning = false;
                this.RunStage = '';
                this.ErrorMessage = `Pipeline failed: ${result.ErrorMessage || 'Unknown error'}`;
                this.cdr.detectChanges();
                return;
            }

            this.currentPipelineRunID = result.PipelineRunID;
            this.subscribeToPipelineProgress(result.PipelineRunID);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[Autotagging] Error starting pipeline:', msg);
            this.IsRunning = false;
            this.RunStage = '';
            this.ErrorMessage = `Pipeline error: ${msg}`;
            this.cdr.detectChanges();
        }
    }

    /** Format milliseconds into a human-readable duration */
    public FormatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    }

    /** Format a date as a relative time string */
    public FormatRelativeTime(date: Date | null): string {
        if (!date) return 'Never';
        const now = new Date();
        const diffMs = now.getTime() - new Date(date).getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    /** Get CSS class for a processing status */
    public GetStatusClass(status: string): string {
        switch (status) {
            case 'Complete':
            case 'Active':
                return 'status-success';
            case 'Processing':
                return 'status-processing';
            case 'Error':
                return 'status-error';
            case 'Paused':
                return 'status-warning';
            default:
                return 'status-default';
        }
    }

    /** Get icon for a source type */
    public GetSourceTypeIcon(typeName: string): string {
        const iconMap: Record<string, string> = {
            'Web': 'fa-solid fa-globe',
            'API': 'fa-solid fa-plug',
            'Database': 'fa-solid fa-database',
            'File': 'fa-solid fa-file-alt',
            'Email': 'fa-solid fa-envelope',
            'RSS': 'fa-solid fa-rss',
            'CMS': 'fa-solid fa-newspaper'
        };
        return iconMap[typeName] ?? 'fa-solid fa-folder';
    }

    // ---- Private Methods ----

    /** Subscribe to PipelineProgress for a specific pipeline run */
    private subscribeToPipelineProgress(pipelineRunID: string): void {
        const provider = Metadata.Provider as GraphQLDataProvider;
        const subscriptionQuery = `
            subscription PipelineProgress($pipelineRunID: String!) {
                PipelineProgress(pipelineRunID: $pipelineRunID) {
                    PipelineRunID
                    Stage
                    TotalItems
                    ProcessedItems
                    CurrentItem
                    PercentComplete
                    ElapsedMs
                }
            }
        `;

        let idleTimer: ReturnType<typeof setTimeout> | null = null;

        const finishPipeline = (success: boolean) => {
            if (idleTimer) clearTimeout(idleTimer);
            rxSub?.unsubscribe();

            Promise.resolve().then(async () => {
                this.IsRunning = false;
                this.RunStage = success ? 'Complete' : 'Error';
                this.RunProgress = success ? 100 : 0;
                this.currentPipelineRunID = null;

                // Reset all pipeline stages to idle
                for (const stage of this.PipelineStages) {
                    stage.Status = 'idle';
                    stage.ActiveCount = 0;
                }

                if (success) {
                    // Refresh data to show new results
                    await this.LoadData();
                }
                this.cdr.detectChanges();
            });
        };

        const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                if (this.IsRunning) {
                    finishPipeline(true);
                }
            }, 30000); // 30s timeout for autotag pipeline (can be long-running)
        };

        resetIdleTimer();

        const sub = provider.subscribe(subscriptionQuery, { pipelineRunID });
        const rxSub = sub.pipe(takeUntil(this.destroy$)).subscribe({
            next: (data: Record<string, unknown>) => {
                const progress = (data as Record<string, Record<string, unknown>>)['PipelineProgress'];
                if (!progress) return;

                const stage = progress['Stage'] as string;
                const pct = progress['PercentComplete'] as number;
                const currentItem = progress['CurrentItem'] as string | undefined;

                this.RunProgress = pct;
                this.RunStage = this.formatStageName(stage);
                this.RunCurrentItem = currentItem ?? '';
                this.updatePipelineStagesForActiveRun(stage);
                this.cdr.detectChanges();

                if (stage === 'complete') {
                    finishPipeline(true);
                } else if (stage === 'error') {
                    finishPipeline(false);
                } else {
                    resetIdleTimer();
                }
            },
            error: (err: unknown) => {
                console.error('[Autotagging] Pipeline subscription error:', err);
                finishPipeline(false);
            }
        });
    }

    /** Convert stage codes to human-readable names */
    private formatStageName(stage: string): string {
        const stageMap: Record<string, string> = {
            'extract': 'Extracting content',
            'autotag': 'Running autotaggers',
            'vectorize': 'Vectorizing content',
            'complete': 'Complete',
            'error': 'Error'
        };
        return stageMap[stage] ?? stage;
    }

    /**
     * Update PipelineStages to reflect which stage is currently active during a live run.
     * Maps subscription stage codes to the pipeline visualization stage names.
     */
    private updatePipelineStagesForActiveRun(activeStageCode: string): void {
        // Map subscription stage codes to visualization stage names
        const stageCodeToName: Record<string, string> = {
            'ingest': 'Ingest',
            'extract': 'Extract',
            'chunk': 'Chunk',
            'tag': 'Tag',
            'autotag': 'Tag',
            'vectorize': 'Vectorize',
        };

        const activeName = stageCodeToName[activeStageCode] ?? '';

        for (const stage of this.PipelineStages) {
            if (stage.Name === activeName) {
                stage.Status = 'active';
                stage.ActiveCount = 1;
            } else if (activeStageCode !== 'complete' && activeStageCode !== 'error') {
                stage.Status = 'idle';
                stage.ActiveCount = 0;
            }
        }
    }

    /** Build KPI metrics from loaded data */
    private buildKPIMetrics(): void {
        const activeSources = this.contentSourcesRaw.filter(
            (s: Record<string, unknown>) => s['Status'] === 'Active'
        ).length;

        const totalItems = this.contentItems.length;
        const totalTags = this.contentTags.length;
        const errorCount = this.contentRuns.filter(
            (r: Record<string, unknown>) => r['Status'] === 'Error'
        ).length;

        this.KPIMetrics = [
            {
                Label: 'Active Sources',
                Value: activeSources,
                Icon: 'fa-solid fa-satellite-dish',
                ColorClass: 'kpi-brand'
            },
            {
                Label: 'Items Processed',
                Value: totalItems,
                Icon: 'fa-solid fa-file-lines',
                ColorClass: 'kpi-info'
            },
            {
                Label: 'Tags Generated',
                Value: totalTags,
                Icon: 'fa-solid fa-tags',
                ColorClass: 'kpi-success'
            },
            {
                Label: 'Errors',
                Value: errorCount,
                Icon: 'fa-solid fa-circle-exclamation',
                ColorClass: errorCount > 0 ? 'kpi-error' : 'kpi-success'
            }
        ];
    }

    /** Build pipeline stage visualization data */
    private buildPipelineStages(): void {
        const runsByStage = this.groupRunsByStage();

        this.PipelineStages = [
            this.createStage('Ingest', 'fa-solid fa-download', runsByStage),
            this.createStage('Extract', 'fa-solid fa-file-export', runsByStage),
            this.createStage('Chunk', 'fa-solid fa-puzzle-piece', runsByStage),
            this.createStage('Tag', 'fa-solid fa-tag', runsByStage),
            this.createStage('Vectorize', 'fa-solid fa-vector-square', runsByStage)
        ];
    }

    /** Group content runs by their processing stage */
    private groupRunsByStage(): Map<string, Record<string, unknown>[]> {
        const groups = new Map<string, Record<string, unknown>[]>();
        for (const run of this.contentRuns) {
            const stage = (run['Stage'] as string) ?? 'Unknown';
            const existing = groups.get(stage) ?? [];
            existing.push(run);
            groups.set(stage, existing);
        }
        return groups;
    }

    /** Create a pipeline stage object from run data */
    private createStage(
        name: string,
        icon: string,
        runsByStage: Map<string, Record<string, unknown>[]>
    ): PipelineStage {
        const stageRuns = runsByStage.get(name) ?? [];
        const activeRuns = stageRuns.filter(
            (r: Record<string, unknown>) => r['Status'] === 'Processing' || r['Status'] === 'Running'
        );
        const errorRuns = stageRuns.filter(
            (r: Record<string, unknown>) => r['Status'] === 'Error'
        );

        let status: 'idle' | 'active' | 'error' = 'idle';
        if (errorRuns.length > 0) status = 'error';
        else if (activeRuns.length > 0) status = 'active';

        return { Name: name, Icon: icon, ActiveCount: activeRuns.length, Status: status };
    }

    /** Build the recent processing feed from content items and tags */
    private buildProcessedItems(): void {
        const tagCountByItem = this.countTagsByItem();

        this.ProcessedItems = this.contentItems.slice(0, 50).map((item: Record<string, unknown>) => {
            const itemId = item['ID'] as string;
            return {
                Name: (item['Name'] as string) ?? 'Unnamed Item',
                SourceName: (item['ContentSource'] as string) ?? (item['ContentSourceID'] as string) ?? 'Unknown',
                ProcessingTimeMs: (item['ProcessingTimeMs'] as number) ?? 0,
                Status: this.mapItemStatus(item['Status'] as string),
                TagCount: tagCountByItem.get(itemId) ?? 0,
                ProcessedAt: item['__mj_CreatedAt'] ? new Date(item['__mj_CreatedAt'] as string) : new Date()
            };
        });
    }

    /** Count tags per content item */
    private countTagsByItem(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const tag of this.contentTags) {
            const itemId = tag['ContentItemID'] as string;
            if (itemId) {
                counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
            }
        }
        return counts;
    }

    /** Map raw status values to display status */
    private mapItemStatus(status: string | undefined): 'Complete' | 'Error' | 'Processing' {
        if (!status) return 'Processing';
        const normalized = status.toLowerCase();
        if (normalized === 'complete' || normalized === 'completed' || normalized === 'done') return 'Complete';
        if (normalized === 'error' || normalized === 'failed') return 'Error';
        return 'Processing';
    }

    /** Build content source summaries from raw data */
    private buildContentSources(): void {
        const typeMap = this.buildTypeMap();
        const itemCountBySource = this.countItemsBySource();

        this.ContentSources = this.contentSourcesRaw.map((source: Record<string, unknown>) => {
            const typeId = source['ContentSourceTypeID'] as string;
            const typeName = typeMap.get(typeId) ?? 'Unknown';

            return {
                ID: source['ID'] as string,
                Name: (source['Name'] as string) ?? 'Unnamed Source',
                TypeName: typeName,
                TypeIcon: this.GetSourceTypeIcon(typeName),
                Status: this.mapSourceStatus(source['Status'] as string),
                LastRunAt: source['LastRunAt'] ? new Date(source['LastRunAt'] as string) : null,
                ItemCount: itemCountBySource.get(source['ID'] as string) ?? 0
            };
        });
    }

    /** Build a map of source type IDs to names */
    private buildTypeMap(): Map<string, string> {
        const map = new Map<string, string>();
        for (const type of this.contentSourceTypes) {
            map.set(type['ID'] as string, (type['Name'] as string) ?? 'Unknown');
        }
        return map;
    }

    /** Count content items per source */
    private countItemsBySource(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of this.contentItems) {
            const sourceId = item['ContentSourceID'] as string;
            if (sourceId) {
                counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
            }
        }
        return counts;
    }

    /** Map raw source status to display status */
    private mapSourceStatus(status: string | undefined): 'Active' | 'Paused' | 'Error' {
        if (!status) return 'Paused';
        const normalized = status.toLowerCase();
        if (normalized === 'active' || normalized === 'running') return 'Active';
        if (normalized === 'error' || normalized === 'failed') return 'Error';
        return 'Paused';
    }
}

export function LoadAutotaggingPipelineResource(): void {
    // Prevents tree-shaking
}
