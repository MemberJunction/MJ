/**
 * @fileoverview Classify · Pipeline Monitor tab.
 *
 * Presentational sub-page: owns its header-interior (with a Refresh action) and
 * the pipeline monitor body — KPI strip, pipeline-stage visualization, live
 * progress + controls, per-source live-run detail table, the recent-processing
 * feed (with its own search/sort/pagination), the trending-tags cloud, the
 * sources mini-list, and the collapsible pipeline-config panel.
 *
 * It is a VIEW only: all pipeline RUN orchestration (start/pause/resume/cancel,
 * the GraphQL progress subscription, shared data loading, and every `build*`
 * view-model method) stays in the host because it is shared by the global
 * "Run Pipeline" header button and the Sources tab. This tab receives the
 * already-built view models + run state via `@Input()` and emits user intents
 * (refresh, pause/resume/cancel, feed-item click, config toggle) via `@Output()`.
 */
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { KPIMetric, PipelineStageInfo, FeedItem, SourceMini, TagCloudItem, RunDetailRow } from '../shared/classify.types';
import { formatTokenCount } from '../shared/classify.format';

/** Shape of the pipeline-config object the host owns and the config panel binds to (two-way via object reference). */
export interface PipelineConfigModel {
    Pipeline?: { BatchSize?: number; MaxConcurrentBatches?: number; DelayBetweenBatchesMs?: number; ResumeFromLastBatch?: boolean; ErrorThresholdPercent?: number };
    RateLimits?: { LLM?: { RequestsPerMinute?: number; TokensPerMinute?: number }; Embedding?: { RequestsPerMinute?: number; TokensPerMinute?: number }; VectorDB?: { RequestsPerMinute?: number } };
}

@Component({
    standalone: false,
    selector: 'classify-pipeline-tab',
    templateUrl: './pipeline-tab.component.html',
    styleUrls: ['./pipeline-tab.component.css']
})
export class ClassifyPipelineTabComponent extends BaseAngularComponent {
    // ── Built view models (data DOWN from the host orchestrator) ──

    /** KPI strip cards. */
    @Input() KPIMetrics: KPIMetric[] = [];
    /** Pipeline-stage visualization (shown only during an active/paused run). */
    @Input() PipelineStages: PipelineStageInfo[] = [];
    /** Recent-processing feed source list (host keeps it index-aligned with its raw content items). */
    @Input() FeedItems: FeedItem[] = [];
    /** Sources mini-list (right sidebar). */
    @Input() SourceMinis: SourceMini[] = [];
    /** Trending-tags cloud. */
    @Input() TrendingTags: TagCloudItem[] = [];
    /** Per-source live-run detail rows (shown during an active run). */
    @Input() LiveRunDetailRows: RunDetailRow[] = [];
    /** Total content-item count in the DB (from TotalRowCount) — drives the "Showing X of Y" line. */
    @Input() TotalItemCount = 0;
    /** True while the host is loading the next page of content items. */
    @Input() IsLoadingMoreItems = false;

    // ── Run state (data DOWN from the host) ──

    @Input() IsRunning = false;
    @Input() IsPaused = false;
    @Input() RunProgress = 0;
    @Input() RunStage = '';
    @Input() RunCurrentItem = '';
    /** Server-side process run ID — gates the Pause button. */
    @Input() CurrentProcessRunID: string | null = null;

    /**
     * The pipeline-config object the host owns. Two-way bound in-place via the
     * config panel's `[(ngModel)]` bindings — since this is a shared object
     * reference, mutations flow straight back to the host without an output.
     */
    @Input() PipelineConfig: PipelineConfigModel = {};

    /** Config-panel expanded state — host persists this to user prefs + reports it to the agent. */
    @Input() ShowPipelineConfig = false;

    // ── Tab-local view state (purely presentational, pipeline-only) ──

    /** Feed search text. */
    public FeedSearchQuery = '';
    /** Current feed page (0-based). */
    public FeedPage = 0;
    public readonly FeedPageSize = 20;
    /** Sort order for the feed: 'newest' (default) or 'oldest'. */
    public FeedSortOrder: 'newest' | 'oldest' = 'newest';

    /** Template-facing formatter for token-count config values. */
    public readonly formatTokenCount = formatTokenCount;

    // ── User intents (events UP to the host) ──

    /** Refresh the pipeline data → host `LoadPipelineData()`. */
    @Output() RefreshRequested = new EventEmitter<void>();
    /** Pause the running pipeline → host `PausePipeline()`. */
    @Output() PauseRequested = new EventEmitter<void>();
    /** Resume the paused pipeline → host `ResumePipeline()`. */
    @Output() ResumeRequested = new EventEmitter<void>();
    /** Cancel the running/paused pipeline → host `CancelPipeline()`. */
    @Output() CancelRequested = new EventEmitter<void>();
    /** Reload live per-source progress → host `LoadLiveRunDetails()`. */
    @Output() LoadLiveRunDetailsRequested = new EventEmitter<void>();
    /** Open a feed item's detail slide-in (emits the item's original index into the host's FeedItems). */
    @Output() FeedItemClicked = new EventEmitter<number>();
    /** Toggle the config panel → host `TogglePipelineConfig()` (persists + reports to agent). */
    @Output() ConfigToggled = new EventEmitter<void>();
    /** Request the host load the next page of content items (no silent truncation). */
    @Output() LoadMoreItemsRequested = new EventEmitter<void>();

    /** Whether more content items exist in the DB than are currently loaded into the feed. */
    public get HasMoreItems(): boolean {
        return this.TotalItemCount > this.FeedItems.length;
    }

    public onLoadMoreItems(): void {
        this.LoadMoreItemsRequested.emit();
    }

    // ════════════════════════════════════════════
    // FEED — search, sort, pagination (presentational)
    // ════════════════════════════════════════════

    /** Feed items filtered by search query and sorted. */
    public get FilteredFeedItems(): FeedItem[] {
        let items = this.FeedItems;
        if (this.FeedSearchQuery.trim()) {
            const q = this.FeedSearchQuery.toLowerCase();
            items = items.filter(item =>
                item.Name.toLowerCase().includes(q) ||
                item.SourceName.toLowerCase().includes(q) ||
                item.Tags.some(t => t.toLowerCase().includes(q))
            );
        }
        if (this.FeedSortOrder === 'oldest') {
            return [...items].reverse();
        }
        return items;
    }

    /** Paginated feed items for the current page. */
    public get PaginatedFeedItems(): FeedItem[] {
        const items = this.FilteredFeedItems;
        const start = this.FeedPage * this.FeedPageSize;
        return items.slice(start, start + this.FeedPageSize);
    }

    /** Total pages for the feed. */
    public get FeedTotalPages(): number {
        return Math.max(1, Math.ceil(this.FilteredFeedItems.length / this.FeedPageSize));
    }

    /** Toggle feed sort order. */
    public ToggleFeedSort(): void {
        this.FeedSortOrder = this.FeedSortOrder === 'newest' ? 'oldest' : 'newest';
        this.FeedPage = 0;
    }

    /** Handle feed search input change. */
    public OnFeedSearchChange(): void {
        this.FeedPage = 0;
    }

    /** Navigate to the previous feed page. */
    public FeedPrevPage(): void {
        if (this.FeedPage > 0) {
            this.FeedPage--;
        }
    }

    /** Navigate to the next feed page. */
    public FeedNextPage(): void {
        if (this.FeedPage < this.FeedTotalPages - 1) {
            this.FeedPage++;
        }
    }

    /** Get the index in the host's original FeedItems array for a paginated item. */
    public GetFeedItemOriginalIndex(item: FeedItem): number {
        return this.FeedItems.indexOf(item);
    }

    // ── Intent emitters ──

    public onRefresh(): void {
        this.RefreshRequested.emit();
    }

    public onPause(): void {
        this.PauseRequested.emit();
    }

    public onResume(): void {
        this.ResumeRequested.emit();
    }

    public onCancel(): void {
        this.CancelRequested.emit();
    }

    public onLoadLiveRunDetails(): void {
        this.LoadLiveRunDetailsRequested.emit();
    }

    public onFeedItemClick(originalIndex: number): void {
        this.FeedItemClicked.emit(originalIndex);
    }

    public onToggleConfig(): void {
        this.ConfigToggled.emit();
    }
}
