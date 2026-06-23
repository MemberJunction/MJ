/**
 * @fileoverview Tags dashboard — the canonical home for everything tag-related
 * across MJ. Tags aren't classification-only: any entity / workload can assign
 * them, so this dashboard lives at the Knowledge Hub top level rather than
 * being buried inside the Classify (autotag pipeline) dashboard.
 *
 * Four tabs:
 *   - Tag Library — table + drill-down + word cloud (moved from Classify).
 *   - Taxonomy — tree / Duplicates / Orphans / Treemap / Audit Log
 *     (moved from Classify; Tree's right-detail panel now also surfaces
 *     governance + scope + synonym editing; Duplicates + Orphans are now
 *     server-driven from `MJ:Tag Suggestions`).
 *   - Suggestions — human-in-the-loop review queue (`MJ:Tag Suggestions`).
 *   - Health — Tag Health 3-card summary, threshold tuning, run history,
 *     "Rebuild stale embeddings".
 *
 * The Classify dashboard still owns the autotag pipeline run-management
 * surface (Pipeline / Sources / Types / History).
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseEntity, CompositeKey, Metadata, RunQuery, RunView } from '@memberjunction/core';
import { TreeBranchConfig, TreeLeafConfig } from '@memberjunction/ng-trees';
import { ResourceData, KnowledgeHubMetadataEngine, MJContentSourceEntity, MJContentSourceTypeEntity_IContentSourceTypeField, MJScheduledActionEntity, MJScheduledActionParamEntity, MJContentItemDuplicateEntity, UserInfoEngine, MJTagEntity, MJTagSynonymEntity, MJTagScopeEntity } from '@memberjunction/core-entities';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { RegisterClass, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService, ActivityService } from '@memberjunction/ng-shared';
import { MJLeftNavItem, MJLeftNavSection, TabConfig } from '@memberjunction/ng-ui-components';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { WordCloudItem } from '@memberjunction/ng-word-cloud';

// ── Tab type ──

/**
 * Tab union — wide for now because this component is in transition: the
 * existing autotagging-pipeline tabs (pipeline / sources / types / history)
 * are still referenced by helpers we share. NavItems only emits the 4
 * tag-related entries, so the user only ever sees Tags / Taxonomy /
 * Suggestions / Health. The dead-code strip is a follow-up.
 */
type TabName = 'pipeline' | 'sources' | 'types' | 'tags' | 'taxonomy' | 'history' | 'suggestions' | 'health';

/** Conventional `Reason` values from MJ:Tag Suggestions. */
type TagSuggestionReason =
    | 'BelowThreshold' | 'ConstrainedMode' | 'AmbiguousMatch' | 'ParentFrozen'
    | 'AutoGrowDisabled' | 'MaxChildrenExceeded' | 'MaxDepthExceeded'
    | 'BelowMinWeight' | 'RequiresReview' | 'MaxItemTagsExceeded'
    | 'MergeCandidate' | 'LowUsage' | 'WideNode';

interface SuggestionRow {
    ID: string;
    ProposedName: string;
    Reason: string;
    BestMatchTagID: string | null;
    BestMatchName: string | null;
    BestMatchPath: string | null;
    BestMatchScore: number | null;
    SourceContentSourceID: string | null;
    SourceContentItemID: string | null;
    SourceText: string | null;
    CreatedAt: Date;
    Status: string;
    selected: boolean;
    dispositionInProgress: 'create-new' | 'merge' | 'reject' | null;
}

interface HealthRunHistoryRow {
    When: Date;
    Trigger: string;
    TagsScanned: number;
    Merge: number;
    LowUsage: number;
    WideNode: number;
    DurationMs: number;
}

interface SynonymRow {
    ID: string;
    Synonym: string;
    Source: string;
    CreatedAt: Date;
}

interface TagScopeRowView {
    ID: string;
    ScopeEntityID: string;
    ScopeRecordID: string;
    EntityName: string;
    DisplayName: string;
}

// ── Interfaces ──

interface NavItem {
    Tab: TabName;
    Icon: string;
    Label: string;
    BadgeText: string;
    BadgeClass: string;
}

interface KPIMetric {
    Label: string;
    Value: number;
    Icon: string;
    Trend: string;
    TrendUp: boolean;
}

interface PipelineStageInfo {
    Name: string;
    Icon: string;
    Status: 'idle' | 'active' | 'complete';
    Count: string;
}

interface FeedItem {
    Name: string;
    SourceName: string;
    Tags: string[];
    TimeAgo: string;
    Status: 'complete' | 'processing' | 'error';
}

interface SourceMini {
    ID: string;
    Name: string;
    Icon: string;
    Meta: string;
    StatusClass: 'active' | 'error' | 'inactive';
}

interface SourceCard {
    ID: string;
    Name: string;
    SourceTypeName: string;
    ContentTypeName: string;
    FileTypeName: string;
    Icon: string;
    StatusClass: 'active' | 'error' | 'inactive';
    StatusLabel: string;
    URL: string;
    ItemCount: number;
    TagCount: number;
    AvgTags: string;
    LastRunAgo: string;
    ContentSourceTypeID: string;
    ContentTypeID: string;
    ContentFileTypeID: string;
    EmbeddingModelID: string;
    VectorIndexID: string;
    EntityID: string;
    EntityDocumentID: string;
    RequiresFileType: boolean;
    /** FK to ScheduledAction entity, null if no schedule configured */
    ScheduledActionID: string | null;
    /** Denormalized name of the linked ScheduledAction */
    ScheduledActionName: string | null;
    /** Human-readable schedule description (parsed from cron) */
    ScheduleDescription: string | null;
}

interface ContentTypeCard {
    ID: string;
    Name: string;
    Description: string;
    AIModelName: string;
    AIModelID: string;
    MinTags: number;
    MaxTags: number;
    SourcesUsing: number;
    ItemsTagged: number;
    RangeLeftPct: number;
    RangeRightPct: number;
    EmbeddingModelID: string;
    VectorIndexID: string;
}

interface TagRow {
    Tag: string;
    UsageCount: number;
    AvgWeight: number;
    BarWidthPct: number;
    TopSource: string;
    FirstSeen: string;
}

interface TagCloudItem {
    Tag: string;
    AvgWeight: number;
    SizeClass: 'large' | '' | 'small';
}

interface TagBySource {
    SourceName: string;
    Count: number;
}

interface RunHistoryRow {
    ID: string;
    Status: string;
    StatusClass: string;
    SourceName: string;
    StartedDisplay: string;
    Duration: string;
    Items: string;
    Tags: string;
    Errors: string;
    ErrorClass: string;
}

interface DropdownOption {
    ID: string;
    Name: string;
}

/** G3: Content item duplicate pair for review */
interface ContentDuplicateRow {
    ID: string;
    ItemAName: string;
    ItemASource: string;
    ItemBName: string;
    ItemBSource: string;
    SimilarityScore: number;
    DetectionMethod: string;
    Status: 'Pending' | 'Confirmed' | 'Dismissed' | 'Merged';
}

/** D2/D3/D8: Per-source detail row for a specific pipeline run */
interface RunDetailRow {
    SourceName: string;
    SourceType: string;
    Status: string;
    StatusClass: string;
    ItemsProcessed: number;
    ItemsTagged: number;
    ItemsVectorized: number;
    ErrorCount: number;
    TotalTokens: number;
    TotalCost: number;
    Duration: string;
}

// ── Taxonomy Governance interfaces ──

type TaxonomySubTab = 'tree' | 'duplicates' | 'orphans' | 'treemap' | 'audit';

interface TaxTreeNode {
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string;
    ParentID: string | null;
    Depth: number;
    Children: TaxTreeNode[];
    ItemCount: number;
    AvgWeight: number;
    HealthColor: 'green' | 'yellow' | 'red';
    IsExpanded: boolean;
    IsSelected: boolean;
    FirstSeen: string;
}

interface TaxDuplicatePair {
    TagA: string;
    TagB: string;
    TagAID: string;
    TagBID: string;
    Similarity: number;
    SeverityClass: 'high' | 'moderate';
    /** True when multiple Tag records share the same name (case-insensitive) */
    IsExactDuplicate: boolean;
    /** How many Tag records share this exact name (only set when IsExactDuplicate) */
    ExactDuplicateCount: number;
    /** All Tag IDs sharing the exact name (only set when IsExactDuplicate) */
    AllIDs: string[];
}

interface TaxOrphanCard {
    ID: string;
    Name: string;
    UsageCount: number;
    AvgWeight: number;
    FirstSeen: string;
    LastSeen: string;
    IsSelected: boolean;
}

interface TaxTreemapCell {
    ID: string;
    Name: string;
    ItemCount: number;
    ColorClass: string;
    RowSpan: number;
}

/** Supported audit action types — matches DB Action values (lowercased) */
type TaxAuditAction = 'created' | 'merged' | 'moved' | 'deleted' | 'renamed' | 'deprecated' | 'descriptionchanged' | 'reactivated' | 'split';

interface TaxAuditEvent {
    Type: TaxAuditAction;
    Description: string;
    TagRef: string;
    User: string;
    Timestamp: string;
    DayHeader: string;
}

interface TaxHealthStat {
    Total: number;
    Healthy: number;
    NeedAttention: number;
    Orphaned: number;
    Duplicates: number;
}

interface WeightedTag {
    Tag: string;
    Weight: number;
}

/** Status value for embedding or tagging pipeline phases */
type ItemPipelineStatus = 'Complete' | 'Processing' | 'Failed' | 'Pending';

interface ContentItemDetail {
    ID: string;
    Name: string;
    SourceName: string;
    SourceTypeName: string;
    ContentTypeName: string;
    FileTypeName: string;
    URL: string;
    TextContent: string;
    Checksum: string;
    Tags: WeightedTag[];
    CreatedAt: string;
    UpdatedAt: string;
    ContentSourceID: string;
    ContentSourceTypeID: string;
    StatusDot: 'complete' | 'processing' | 'error';
    TagCount: number;
    /** Whether this source type uses content/file type (false for Entity sources) */
    RequiresContentType: boolean;
    /** Entity record ID if source is entity type (for direct entity navigation) */
    EntityRecordID: string | null;
    /** Entity name if source is entity type */
    EntityName: string | null;
    /** Embedding pipeline status for this content item */
    EmbeddingStatus: ItemPipelineStatus;
    /** Tagging pipeline status for this content item */
    TaggingStatus: ItemPipelineStatus;
}

interface SourceDetailInfo {
    ID: string;
    Name: string;
    SourceTypeName: string;
    FileTypeName: string;
    ContentTypeName: string;
    RequiresFileType: boolean;
    StatusClass: 'active' | 'error' | 'inactive';
    StatusLabel: string;
    Icon: string;
    URL: string;
    EmbeddingModelName: string;
    VectorIndexName: string;
    ItemCount: number;
    TagCount: number;
    AvgTags: string;
    LastRunAgo: string;
    ErrorCount: number;
    ContentItems: ContentItemDetail[];
    RunHistory: RunHistoryRow[];
}

// ── Slide-in form mode ──

type FormMode = 'none' | 'add-source' | 'edit-source' | 'add-type' | 'edit-type';

@RegisterClass(BaseResourceComponent, 'Tags')
@Component({
    standalone: false,
    selector: 'mj-tags-resource',
    templateUrl: './tags-resource.component.html',
    styleUrls: ['./tags-resource.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class TagsResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    protected override destroy$ = new Subject<void>();
    private cdr = inject(ChangeDetectorRef);
    private activityService = inject(ActivityService);
    protected override navigationService = inject(NavigationService);

    // ── Global state ──
    public IsLoading = true;

    // ── Accurate total counts from TotalRowCount (not capped by MaxRows) ──
    private totalContentItemCount = 0;
    private totalContentTagCount = 0;

    // ── Tab state ──
    public ActiveTab: TabName = 'tags';
    private tabDataLoaded = new Set<TabName>();

    // ── Left nav ──
    public NavItems: NavItem[] = [];

    // ── Pipeline tab ──
    public KPIMetrics: KPIMetric[] = [];
    public PipelineStages: PipelineStageInfo[] = [];
    public FeedItems: FeedItem[] = [];
    public SourceMinis: SourceMini[] = [];
    public TrendingTags: TagCloudItem[] = [];

    // ── Pipeline feed search & pagination ──
    public FeedSearchQuery = '';
    public FeedPage = 0;
    public readonly FeedPageSize = 20;
    /** Sort order for the feed: 'newest' (default) or 'oldest' */
    public FeedSortOrder: 'newest' | 'oldest' = 'newest';

    /** Feed items filtered by search query and sorted */
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

    /** Toggle feed sort order */
    public ToggleFeedSort(): void {
        this.FeedSortOrder = this.FeedSortOrder === 'newest' ? 'oldest' : 'newest';
        this.FeedPage = 0;
        this.cdr.detectChanges();
    }

    /** Paginated feed items for the current page */
    public get PaginatedFeedItems(): FeedItem[] {
        const items = this.FilteredFeedItems;
        const start = this.FeedPage * this.FeedPageSize;
        return items.slice(start, start + this.FeedPageSize);
    }

    /** Total pages for the feed */
    public get FeedTotalPages(): number {
        return Math.max(1, Math.ceil(this.FilteredFeedItems.length / this.FeedPageSize));
    }

    /** Handle feed search input change */
    public OnFeedSearchChange(): void {
        this.FeedPage = 0;
        this.cdr.detectChanges();
    }

    /** Navigate to previous feed page */
    public FeedPrevPage(): void {
        if (this.FeedPage > 0) {
            this.FeedPage--;
            this.cdr.detectChanges();
        }
    }

    /** Navigate to next feed page */
    public FeedNextPage(): void {
        if (this.FeedPage < this.FeedTotalPages - 1) {
            this.FeedPage++;
            this.cdr.detectChanges();
        }
    }

    /** Get the index in the original FeedItems array for a paginated item */
    public GetFeedItemOriginalIndex(item: FeedItem): number {
        return this.FeedItems.indexOf(item);
    }

    // Pipeline run state
    public IsRunning = false;
    public IsPaused = false;
    public RunProgress = 0;
    public RunStage = '';
    public RunCurrentItem = '';
    /** The current pipeline run ID (from GraphQL subscription) */
    public CurrentPipelineRunID: string | null = null;
    /** The process run ID (server-side ContentProcessRun) for pause/cancel/resume */
    public CurrentProcessRunID: string | null = null;

    // ── Pipeline Config Widget ──
    public ShowPipelineConfig = false;
    public PipelineConfig: {
        Pipeline?: { BatchSize?: number; MaxConcurrentBatches?: number; DelayBetweenBatchesMs?: number; ResumeFromLastBatch?: boolean; ErrorThresholdPercent?: number };
        RateLimits?: { LLM?: { RequestsPerMinute?: number; TokensPerMinute?: number }; Embedding?: { RequestsPerMinute?: number; TokensPerMinute?: number }; VectorDB?: { RequestsPerMinute?: number } };
    } = {
        Pipeline: { BatchSize: 100, MaxConcurrentBatches: 1, DelayBetweenBatchesMs: 200, ResumeFromLastBatch: true, ErrorThresholdPercent: 20 },
        RateLimits: { LLM: { RequestsPerMinute: 60, TokensPerMinute: 100000 }, Embedding: { RequestsPerMinute: 300, TokensPerMinute: 500000 }, VectorDB: { RequestsPerMinute: 200 } }
    };

    public TogglePipelineConfig(): void {
        this.ShowPipelineConfig = !this.ShowPipelineConfig;
        this.persistClassifyPreferences();
    }

    private persistClassifyPreferences(): void {
        const prefs = JSON.stringify({
            ActiveTab: this.ActiveTab,
            ShowPipelineConfig: this.ShowPipelineConfig,
        });
        UserInfoEngine.Instance.SetSettingDebounced(TagsResourceComponent.PREFS_KEY, prefs);
    }

    private loadClassifyPreferences(): void {
        const raw = UserInfoEngine.Instance.GetSetting(TagsResourceComponent.PREFS_KEY);
        if (raw) {
            try {
                const prefs = JSON.parse(raw);
                // Guard against stale persisted state from sibling dashboards
                // that historically shared this prefs key (e.g. 'pipeline' from
                // Classify) — only apply tabs the Tags rail actually renders.
                if (prefs.ActiveTab && TagsResourceComponent.VALID_TABS.includes(prefs.ActiveTab)) {
                    this.ActiveTab = prefs.ActiveTab;
                }
                if (prefs.ShowPipelineConfig != null) this.ShowPipelineConfig = prefs.ShowPipelineConfig;
            } catch { /* ignore */ }
        }
    }

    public FormatTokenCount(tokens: number): string {
        if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
        if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
        return String(tokens);
    }

    // ── Sources tab ──
    public SourceCards: SourceCard[] = [];
    public ContentDuplicates: ContentDuplicateRow[] = [];
    public IsLoadingDuplicates = false;

    // ── Content Types tab ──
    public ContentTypeCards: ContentTypeCard[] = [];

    // ── Tag Library tab ──
    public TagRows: TagRow[] = [];
    public TagCloud: TagCloudItem[] = [];
    public TagCloudWordItems: WordCloudItem[] = [];
    public TagsBySource: TagBySource[] = [];
    public TagSearchQuery = '';
    public FilteredTagRows: TagRow[] = [];
    public SelectedDrillDownTag: string | null = null;
    public TagDrillDownItems: { ID: string; Name: string; SourceName: string; Weight: number; UpdatedAt: string; FeedIndex: number }[] = [];

    // ── Run History tab ──
    public RunHistoryRows: RunHistoryRow[] = [];
    public HistorySourceFilter = '';
    public HistoryStatusFilter = '';
    public FilteredRunRows: RunHistoryRow[] = [];
    public HistorySourceOptions: string[] = [];

    // D3/D8: Run History Detail slide-in
    public SelectedRunID: string | null = null;
    public RunDetailRows: RunDetailRow[] = [];
    public IsLoadingRunDetail = false;

    // D2: Pipeline Monitor — live per-source progress
    public LiveRunDetailRows: RunDetailRow[] = [];
    public IsLoadingLiveDetails = false;

    // ── Taxonomy Governance tab ──
    public TaxSubTab: TaxonomySubTab = 'tree';
    public TaxTreeNodes: TaxTreeNode[] = [];
    public TaxFlatNodes: TaxTreeNode[] = [];
    public TaxFilteredNodes: TaxTreeNode[] = [];
    public TaxSelectedNode: TaxTreeNode | null = null;
    public TaxTreeSearch = '';
    public TaxDuplicates: TaxDuplicatePair[] = [];
    public TaxOrphans: TaxOrphanCard[] = [];
    public TaxAllOrphansSelected = false;
    public TaxTreemapCells: TaxTreemapCell[] = [];
    public TaxAuditEvents: TaxAuditEvent[] = [];
    public TaxAuditFilterTypes = new Set<string>(['created', 'merged', 'moved', 'deleted', 'renamed', 'deprecated', 'descriptionchanged', 'reactivated', 'split']);
    public TaxHealth: TaxHealthStat = { Total: 0, Healthy: 0, NeedAttention: 0, Orphaned: 0, Duplicates: 0 };
    public TaxRecentItems: { Name: string; Weight: number; Date: string; Icon: string }[] = [];
    public TaxTreemapKPIs: { Label: string; Value: string }[] = [];
    public TaxIsEditing = false;

    // ── Create Tag Dialog ──
    public ShowCreateTagDialog = false;
    public CreateTagName = '';
    public CreateTagDescription = '';
    public CreateTagParentID: string | null = null;
    /** Label shown in the create dialog to indicate context (e.g., "under AI Agent") */
    public CreateTagParentLabel = '';

    // ── Multi-select for drag reparenting ──
    public TaxMultiSelectMode = false;
    public TaxSelectedIDs = new Set<string>();
    /** The node currently being dragged over (drop target highlight) */
    public TaxDragOverNodeID: string | null = null;
    /** True while a drag-reparent operation is saving */
    public TaxTreeSaving = false;

    /** Count of high-confidence duplicate pairs (>85% similarity) */
    public get TaxHighConfidenceDupeCount(): number {
        return this.TaxDuplicates.filter(d => d.SeverityClass === 'high').length;
    }

    /** Count of moderate-confidence duplicate pairs (70-85% similarity) */
    public get TaxModerateDupeCount(): number {
        return this.TaxDuplicates.filter(d => d.SeverityClass === 'moderate').length;
    }
    public TaxEditName = '';
    public TaxEditDescription = '';

    // ── Suggestions inbox state (server-driven from MJ:Tag Suggestions) ──
    public SuggestionRows: SuggestionRow[] = [];
    public SuggestionRowsFiltered: SuggestionRow[] = [];
    public SuggestionFilterReason = '';
    public SuggestionFilterMinScore: number | null = null;
    public SuggestionSearch = '';
    public SuggestionSelected: SuggestionRow | null = null;
    public SuggestionBulkInProgress = false;
    public PendingSuggestionCount = 0;
    public ReasonOptions: TagSuggestionReason[] = [
        'BelowThreshold', 'ConstrainedMode', 'AmbiguousMatch', 'ParentFrozen', 'AutoGrowDisabled',
        'MaxChildrenExceeded', 'MaxDepthExceeded', 'BelowMinWeight', 'RequiresReview',
        'MaxItemTagsExceeded', 'MergeCandidate', 'LowUsage', 'WideNode',
    ];

    // ── Tag Health state ──
    public HealthThresholds = {
        minCoOccurrence: 10,
        minNameSimilarity: 0.5,
        minEmbeddingSimilarity: 0.85,
        maxUsage: 3,
        maxImplicitChildren: 25,
    };
    public HealthRunning = false;
    public RebuildEmbeddingsRunning = false;
    public LastHealthSummary: {
        mergeCount: number; lowUsageCount: number; wideNodeCount: number; durationMs: number; runAt: Date | null;
    } = { mergeCount: 0, lowUsageCount: 0, wideNodeCount: 0, durationMs: 0, runAt: null };
    public HealthRunHistory: HealthRunHistoryRow[] = [];

    // ── Per-tag governance editing (Tree right-detail addendum) ──
    public SelectedTagSavingField: Record<string, boolean> = {};
    public SelectedTagSynonyms: SynonymRow[] = [];
    public SelectedTagScopes: TagScopeRowView[] = [];
    public NewSynonymName = '';
    public NewSynonymSource: 'Manual' | 'Imported' | 'Merged' | 'LLM' = 'Manual';

    // Raw taxonomy data cache
    /** Public so the template's Health tab can read tag count for the runbar. */
    public tagsRaw: Record<string, unknown>[] = [];
    private taggedItemsRaw: Record<string, unknown>[] = [];
    private tagAuditLogsRaw: Record<string, unknown>[] = [];
    /** Cached per-tag aggregates from server-side SQL (weights + counts) */
    private tagAggregateWeights = new Map<string, number>();
    private tagAggregateCounts = new Map<string, number>();

    // ── Slide-in form ──
    public FormMode: FormMode = 'none';
    public FormSaving = false;
    public ShowNoContentTypeWarning = false;

    // Source form fields
    public FormSourceName = '';
    public FormSourceTypeID = '';
    public FormContentTypeID = '';
    public FormFileTypeID = '';
    public FormSourceURL = '';
    public EditingSourceID = '';

    // Content Type form fields
    public FormTypeName = '';
    public FormTypeDescription = '';
    public FormTypeAIModelID = '';
    public FormTypeMinTags = 1;
    public FormTypeMaxTags = 10;
    public EditingTypeID = '';

    // Embedding model + vector index form fields (Content Type)
    public FormTypeEmbeddingModelID = '';
    public FormTypeVectorIndexID = '';

    // Entity source fields (shown when source type is "Entity")
    public FormSourceEntityID = '';
    public FormSourceEntityDocID = '';

    // Embedding model + vector index form fields (Content Source overrides)
    public FormSourceEmbeddingModelID = '';
    public FormSourceVectorIndexID = '';

    // ── Schedule dialog ──
    /** Whether the schedule creation dialog is visible */
    public ShowScheduleDialog = false;
    /** Whether a schedule save operation is in progress */
    public ScheduleSaving = false;
    /** Source card currently being scheduled */
    public SchedulingSourceCard: SourceCard | null = null;
    /** Cron expression for the schedule form */
    public ScheduleCron = '0 2 * * *';
    /** Whether the schedule should be active immediately */
    public ScheduleEnabled = true;

    // ── Confirmation dialog state ──
    /** Whether a generic confirmation overlay is visible */
    public ShowConfirmDialog = false;
    /** Title text for the confirmation dialog */
    public ConfirmDialogTitle = '';
    /** Body message for the confirmation dialog */
    public ConfirmDialogMessage = '';
    /** Callback invoked when user confirms */
    private confirmDialogAction: (() => Promise<void>) | null = null;

    // ── Split dialog state ──
    /** Whether the split-tag dialog is visible */
    public ShowSplitDialog = false;
    /** Comma-separated new child tag names for the split operation */
    public SplitChildNames = '';
    /** The node currently being split */
    private splitTargetNode: TaxTreeNode | null = null;

    // ── Move dialog state ──
    /** Whether the move-tag dialog is visible */
    public ShowMoveDialog = false;
    /** Selected new parent tag ID for the move operation */
    public MoveNewParentID: string | null = null;
    /** The node currently being moved */
    private moveTargetNode: TaxTreeNode | null = null;

    // ── Merge Into dialog state ──
    public ShowMergeIntoDialog = false;
    public MergeSourceTag: TaxTreeNode | null = null;
    public MergeTargetID: string | null = null;
    public MergeTargetData: { ID: string; Label: string }[] = [];

    // ── Treemap drill-in state ──
    /** Whether the treemap drill-in panel is visible */
    public ShowTreemapDrillIn = false;
    /** Tag node currently displayed in treemap drill-in */
    public TreemapDrillInNode: TaxTreeNode | null = null;

    /** Cached ScheduledAction entities, keyed by normalized ID */
    private scheduledActionsCache = new Map<string, MJScheduledActionEntity>();

    /**
     * Whether the currently selected source type is "Entity", which switches
     * the URL field to Entity/EntityDocument pickers.
     */
    /** Whether the selected source type is the Entity type (name-based check) */
    public get IsEntitySourceTypeSelected(): boolean {
        if (!this.FormSourceTypeID) return false;
        const sourceType = this.SourceTypeOptions.find(o => UUIDsEqual(o.ID, this.FormSourceTypeID));
        return sourceType?.Name?.toLowerCase() === 'entity';
    }

    /** Whether the selected source type requires Content Type / File Type selection */
    public get SelectedSourceTypeRequiresContentType(): boolean {
        if (!this.FormSourceTypeID) return true;
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const st = engine.ContentSourceTypes.find(t => UUIDsEqual(t.ID, this.FormSourceTypeID));
            return st?.ConfigurationObject?.RequiresContentType !== false;
        } catch {
            return true;
        }
    }

    /** Entities that have at least one EntityDocument configured */
    public get EntitiesWithDocuments(): { ID: string; Name: string }[] {
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const docs = engine.GetActiveEntityDocuments();
            const entityMap = new Map<string, string>();
            const md = this.ProviderToUse;
            for (const doc of docs) {
                const entityName = doc.Get('Entity') as string;
                if (entityName) {
                    const entityInfo = md.Entities.find(e => e.Name === entityName);
                    if (entityInfo && !entityMap.has(entityInfo.ID)) {
                        entityMap.set(entityInfo.ID, entityInfo.Name);
                    }
                }
            }
            return Array.from(entityMap.entries())
                .map(([ID, Name]) => ({ ID, Name }))
                .sort((a, b) => a.Name.localeCompare(b.Name));
        } catch {
            return [];
        }
    }

    /** Entity documents for the selected entity */
    public get EntityDocOptionsForSelectedEntity(): { ID: string; Name: string }[] {
        if (!this.FormSourceEntityID) return [];
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, this.FormSourceEntityID));
            if (!entityInfo) return [];
            return engine.GetActiveEntityDocuments()
                .filter(d => (d.Get('Entity') as string) === entityInfo.Name)
                .map(d => ({ ID: d.ID, Name: d.Name }));
        } catch {
            return [];
        }
    }

    // ── Dynamic source-type fields (metadata-driven) ──

    /** Stores source-type-specific config values keyed by RequiredFields[].Key */
    public FormSourceSpecificConfig: Record<string, string> = {};

    /** Available MJ Storage provider keys for the storage-provider-picker widget */
    public StorageProviderOptions: string[] = ['Azure Blob Storage', 'AWS S3', 'Google Cloud Storage', 'SharePoint', 'Dropbox', 'Box'];

    /**
     * The RequiredFields array from the selected source type's ConfigurationObject.
     * Drives dynamic form rendering — each field becomes a widget.
     */
    public get SelectedSourceTypeFields(): MJContentSourceTypeEntity_IContentSourceTypeField[] {
        if (!this.FormSourceTypeID) return [];
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const sourceType = engine.ContentSourceTypes.find(st => UUIDsEqual(st.ID, this.FormSourceTypeID));
            if (!sourceType) return [];
            const config = sourceType.ConfigurationObject;
            return config?.RequiredFields ?? [];
        } catch {
            return [];
        }
    }

    /**
     * Get dependent options for a field (e.g., entity-doc-picker depends on entity-picker).
     * Returns entity documents for the entity selected in the dependent field.
     */
    public GetDependentOptions(field: MJContentSourceTypeEntity_IContentSourceTypeField): { ID: string; Name: string }[] {
        if (field.Type === 'entity-doc-picker' && field.DependsOnField) {
            const entityID = this.FormSourceSpecificConfig[field.DependsOnField];
            if (!entityID) return [];
            try {
                const engine = KnowledgeHubMetadataEngine.Instance;
                const md = this.ProviderToUse;
                const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
                if (!entityInfo) return [];
                return engine.GetActiveEntityDocuments()
                    .filter(d => (d.Get('Entity') as string) === entityInfo.Name)
                    .map(d => ({ ID: d.ID, Name: d.Name }));
            } catch {
                return [];
            }
        }
        return [];
    }

    /**
     * Handle a source-specific field value change.
     * For entity-picker: auto-select the first entity doc if only one exists.
     */
    public OnSourceFieldChanged(fieldKey: string): void {
        // Find fields that depend on this field
        for (const field of this.SelectedSourceTypeFields) {
            if (field.DependsOnField === fieldKey) {
                const options = this.GetDependentOptions(field);
                if (options.length === 1) {
                    this.FormSourceSpecificConfig[field.Key] = options[0].ID;
                } else {
                    this.FormSourceSpecificConfig[field.Key] = '';
                }
            }
        }
    }

    // ── Detail panels ──
    public SelectedFeedItem: ContentItemDetail | null = null;
    public ShowItemDetail = false;
    public SelectedSource: SourceDetailInfo | null = null;
    public ShowSourceDetail = false;
    public SourceDetailLoading = false;

    // ── D4: Source detail status filter ──
    /** Filter content items in source detail by pipeline status */
    public SourceDetailStatusFilter: ItemPipelineStatus | 'All' = 'All';
    /** Available status options for the filter dropdown */
    public readonly SourceDetailStatusOptions: (ItemPipelineStatus | 'All')[] = ['All', 'Complete', 'Processing', 'Failed', 'Pending'];

    // ── D7: Source detail pagination ──
    /** Current page index (0-based) for source detail content list */
    public SourceDetailPage = 0;
    /** Number of content items per page in source detail */
    public readonly SourceDetailPageSize = 10;

    /**
     * Returns source detail content items filtered by SourceDetailStatusFilter,
     * then sliced to the current page.
     */
    public get FilteredSourceDetailItems(): ContentItemDetail[] {
        if (!this.SelectedSource) return [];
        const items = this.SourceDetailStatusFilter === 'All'
            ? this.SelectedSource.ContentItems
            : this.SelectedSource.ContentItems.filter(
                  ci => ci.EmbeddingStatus === this.SourceDetailStatusFilter ||
                        ci.TaggingStatus === this.SourceDetailStatusFilter
              );
        const start = this.SourceDetailPage * this.SourceDetailPageSize;
        return items.slice(start, start + this.SourceDetailPageSize);
    }

    /** Total number of filtered items (before pagination) */
    public get FilteredSourceDetailTotal(): number {
        if (!this.SelectedSource) return 0;
        if (this.SourceDetailStatusFilter === 'All') return this.SelectedSource.ContentItems.length;
        return this.SelectedSource.ContentItems.filter(
            ci => ci.EmbeddingStatus === this.SourceDetailStatusFilter ||
                  ci.TaggingStatus === this.SourceDetailStatusFilter
        ).length;
    }

    /** Total pages for source detail pagination */
    public get SourceDetailTotalPages(): number {
        return Math.max(1, Math.ceil(this.FilteredSourceDetailTotal / this.SourceDetailPageSize));
    }

    /** Navigate to the previous page in source detail content list */
    public SourceDetailPrevPage(): void {
        if (this.SourceDetailPage > 0) {
            this.SourceDetailPage--;
            this.cdr.detectChanges();
        }
    }

    /** Navigate to the next page in source detail content list */
    public SourceDetailNextPage(): void {
        if (this.SourceDetailPage < this.SourceDetailTotalPages - 1) {
            this.SourceDetailPage++;
            this.cdr.detectChanges();
        }
    }

    /** Handle change of the source detail status filter dropdown */
    public OnSourceDetailStatusFilterChange(): void {
        this.SourceDetailPage = 0;
        this.cdr.detectChanges();
    }

    /**
     * D4: Placeholder handler for retrying failed items in source detail.
     * Re-runs the pipeline for the current source. In the future this could
     * target only Failed items.
     */
    public RetryFailedItems(): void {
        if (!this.SelectedSource) return;
        const failedCount = this.SelectedSource.ContentItems.filter(
            ci => ci.EmbeddingStatus === 'Failed' || ci.TaggingStatus === 'Failed'
        ).length;
        if (failedCount === 0) {
            MJNotificationService.Instance.CreateSimpleNotification('No failed items to retry', 'info', 2500);
            return;
        }
        MJNotificationService.Instance.CreateSimpleNotification(
            `Retry queued for ${failedCount} failed item${failedCount > 1 ? 's' : ''}. Pipeline will re-process on next run.`,
            'info',
            3000
        );
    }

    /** Returns the CSS class for a pipeline status badge color */
    public GetStatusBadgeClass(status: ItemPipelineStatus): string {
        switch (status) {
            case 'Complete': return 'at-status-badge-complete';
            case 'Processing': return 'at-status-badge-processing';
            case 'Failed': return 'at-status-badge-failed';
            case 'Pending': return 'at-status-badge-pending';
        }
    }

    // Dropdown options for forms
    public SourceTypeOptions: DropdownOption[] = [];
    public ContentTypeOptions: DropdownOption[] = [];
    public FileTypeOptions: DropdownOption[] = [];
    public AIModelOptions: DropdownOption[] = [];
    public EmbeddingModelOptions: DropdownOption[] = [];
    public VectorIndexOptions: DropdownOption[] = [];

    // Tree-dropdown configs for AI model selection (vendor → model grouping)
    public AIModelVendorBranch: TreeBranchConfig = {
        EntityName: 'MJ: AI Vendors',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-building',
        OrderBy: 'Name ASC',
    };
    public AllModelsLeaf: TreeLeafConfig = {
        EntityName: 'MJ: AI Models',
        ParentField: '',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-brain',
        OrderBy: '__mj_CreatedAt DESC',
        JunctionConfig: {
            EntityName: 'MJ: AI Model Vendors',
            LeafForeignKey: 'ModelID',
            BranchForeignKey: 'VendorID',
        },
    };
    /** Branch config filtered to only vendors that have at least one embedding model */
    public EmbeddingVendorBranch: TreeBranchConfig = {
        EntityName: 'MJ: AI Vendors',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-building',
        OrderBy: 'Name ASC',
        ExtraFilter: `ID IN (SELECT mv.VendorID FROM [__mj].vwAIModelVendors mv JOIN [__mj].vwAIModels m ON mv.ModelID = m.ID WHERE m.AIModelType = 'Embeddings')`,
    };
    public EmbeddingModelsLeaf: TreeLeafConfig = {
        EntityName: 'MJ: AI Models',
        ParentField: '',
        DisplayField: 'Name',
        IDField: 'ID',
        DefaultIcon: 'fa-solid fa-vector-square',
        ExtraFilter: "AIModelType = 'Embeddings'",
        OrderBy: '__mj_CreatedAt DESC',
        JunctionConfig: {
            EntityName: 'MJ: AI Model Vendors',
            LeafForeignKey: 'ModelID',
            BranchForeignKey: 'VendorID',
        },
    };

    // ── Raw data cache ──
    private contentSourcesRaw: Record<string, unknown>[] = [];
    private contentItemsRaw: Record<string, unknown>[] = [];
    private contentTagsRaw: Record<string, unknown>[] = [];
    private contentRunsRaw: Record<string, unknown>[] = [];
    private contentSourceTypesRaw: Record<string, unknown>[] = [];
    private contentTypesRaw: Record<string, unknown>[] = [];
    private contentFileTypesRaw: Record<string, unknown>[] = [];
    private aiModelsRaw: Record<string, unknown>[] = [];

    // ── Lifecycle ──

    private static readonly PREFS_KEY = 'KH_Tags_Preferences';
    private static readonly VALID_TABS: TabName[] = ['tags', 'taxonomy', 'suggestions', 'health'];

    async ngAfterViewInit(): Promise<void> {
        await Promise.all([
            KnowledgeHubMetadataEngine.Instance.Config(false),
            UserInfoEngine.Instance.Config(false),
        ]);
        this.loadClassifyPreferences();
        this.applyIncomingConfiguration();
        // Restoring a non-default saved tab here changes ActiveTab (and the derived
        // header subtitle) after the first render already checked the default 'tags'.
        // Flush it in its own pass so the bindings don't trip NG0100.
        this.cdr.detectChanges();

        // Tags dashboard's default landing is the Tag Library — load that data
        // (and the entity-record-document cache used by drill-down) up front.
        await Promise.all([this.loadTagLibraryData(), this.loadEntityRecordDocCache()]);
        this.tabDataLoaded.add('tags');

        // If preferences/config set a non-default initial tab, load it eagerly.
        if (this.ActiveTab !== 'tags' && !this.tabDataLoaded.has(this.ActiveTab)) {
            await this.loadTabData(this.ActiveTab);
            this.tabDataLoaded.add(this.ActiveTab);
            // The eager load updates header-subtitle inputs (e.g. taxonomy tag
            // count); flush so the new subtitle doesn't trip NG0100 on next check.
            this.cdr.detectChanges();
        }

        this.IsLoading = false;
        this.registerAgentTools();
        this.emitAgentContext();

        // D9: If navigated with tagSearch, switch to tags tab and pre-fill search
        await this.handleInitialTagSearch();

        this.cdr.detectChanges();
        this.NotifyLoadComplete();
    }

    /**
     * D9: Read incoming configuration from ResourceData (e.g. from Analytics tag navigation).
     * Sets the initial tab and tag search query if provided.
     */
    private applyIncomingConfiguration(): void {
        const config = this.Data?.Configuration as Record<string, unknown> | undefined;
        if (!config) return;

        const initialTab = config['initialTab'] as TabName | undefined;
        if (initialTab) {
            this.ActiveTab = initialTab;
        }
    }

    /**
     * D9: If a tagSearch parameter was provided via configuration, switch to the tags tab
     * and apply the search filter after tag data loads.
     */
    private async handleInitialTagSearch(): Promise<void> {
        const config = this.Data?.Configuration as Record<string, unknown> | undefined;
        const tagSearch = config?.['tagSearch'] as string | undefined;
        if (!tagSearch) return;

        // Ensure tag data is loaded
        if (!this.tabDataLoaded.has('tags')) {
            await this.loadTabData('tags');
            this.tabDataLoaded.add('tags');
        }

        this.TagSearchQuery = tagSearch;
        this.FilterTags();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Report current classify dashboard state to the agent */
    private emitAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            ActiveTab: this.ActiveTab,
            SourceCount: this.contentSourcesRaw.length,
            ContentItemCount: this.contentItemsRaw.length,
            TagCount: this.contentTagsRaw.length,
            PipelineStatus: this.IsRunning ? 'running' : 'idle',
            PipelineProgress: this.RunProgress,
            ShowPipelineConfig: this.ShowPipelineConfig,
        });
    }

    /** Register client tools the agent can invoke on the Classify dashboard */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchClassifyTab',
                Description: 'Switch to a specific tab in the Classify dashboard',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        tab: { type: 'string', enum: ['pipeline', 'sources', 'types', 'tags', 'taxonomy', 'history'], description: 'The tab to switch to' },
                    },
                    required: ['tab'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    await this.SwitchTab(params['tab'] as TabName);
                    return { Success: true, Data: { ActiveTab: this.ActiveTab } };
                },
            },
            {
                Name: 'RunClassificationPipeline',
                Description: 'Trigger the content classification pipeline. Optionally filter to specific content source IDs.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        sourceIDs: { type: 'array', items: { type: 'string' }, description: 'Optional array of ContentSource IDs to process. Omit to run all.' },
                    },
                },
                Handler: async (params: Record<string, unknown>) => {
                    const sourceIDs = params['sourceIDs'] as string[] | undefined;
                    await this.RunPipeline(sourceIDs);
                    return { Success: true, Data: { PipelineStatus: 'running' } };
                },
            },
            {
                Name: 'SearchClassifyTags',
                Description: 'Filter the tag library by a search query',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search text to filter tags by' },
                    },
                    required: ['query'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    this.TagSearchQuery = String(params['query'] ?? '');
                    this.FilterTags();
                    return { Success: true, Data: { MatchCount: this.FilteredTagRows.length } };
                },
            },
        ]);
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Classify';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-tags';
    }

    // ── Tab switching ──

    /** Wraps `NavItems` for `<mj-left-nav>`. */
    public get navSections(): MJLeftNavSection[] {
        return [{
            items: this.NavItems.map(n => ({
                id: n.Tab,
                label: n.Label,
                icon: n.Icon,
                badge: n.BadgeText || undefined
            }))
        }];
    }

    /** Title rendered in the per-section `<mj-page-header-interior>`. */
    public get currentTabTitle(): string {
        switch (this.ActiveTab) {
            case 'tags':        return 'Overview';
            case 'taxonomy':    return 'Taxonomy Governance';
            case 'suggestions': return 'Suggestions Inbox';
            case 'health':      return 'Tag Health';
        }
        return '';
    }

    /** Subtitle rendered in the per-section `<mj-page-header-interior>`. */
    public get currentTabSubtitle(): string {
        switch (this.ActiveTab) {
            case 'tags':        return `${this.TagRows.length} unique tags across all content sources`;
            case 'taxonomy':    return 'Manage tag hierarchy, resolve duplicates, and monitor taxonomy health';
            case 'suggestions': return `${this.SuggestionRows.length} pending · select rows for bulk approve / reject`;
            case 'health':      return 'Automated signals about taxonomy quality';
        }
        return '';
    }

    /** Adapter for `<mj-left-nav>`'s `(ItemClicked)` output. */
    public onNavItemClicked(item: MJLeftNavItem): void {
        void this.SwitchTab(item.id as TabName);
    }

    public async SwitchTab(tab: TabName): Promise<void> {
        if (tab === this.ActiveTab) return;
        this.ActiveTab = tab;
        this.persistClassifyPreferences();
        this.emitAgentContext();
        this.cdr.detectChanges();

        if (!this.tabDataLoaded.has(tab)) {
            await this.loadTabData(tab);
            this.tabDataLoaded.add(tab);
            this.cdr.detectChanges();
        }
    }

    private async loadTabData(tab: TabName): Promise<void> {
        switch (tab) {
            case 'pipeline':
                await this.LoadPipelineData();
                break;
            case 'sources':
                await this.loadSourcesData();
                break;
            case 'types':
                await this.loadContentTypesData();
                break;
            case 'tags':
                await this.loadTagLibraryData();
                break;
            case 'taxonomy':
                await this.loadTaxonomyData();
                // Pull pending suggestions so the Duplicates / Orphans sub-tabs are populated.
                await this.loadSuggestions();
                break;
            case 'history':
                await this.loadRunHistoryData();
                break;
            case 'suggestions':
                await this.loadSuggestions();
                break;
            case 'health':
                // Health tab uses already-loaded suggestion totals + threshold defaults.
                if (this.SuggestionRows.length === 0) await this.loadSuggestions();
                break;
        }
    }

    // ════════════════════════════════════════════
    // PIPELINE TAB — Data Loading & Building
    // ════════════════════════════════════════════

    public async LoadPipelineData(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [sourcesResult, itemsResult, runsResult, tagsResult, sourceTypesResult, contentTypesResult] = await rv.RunViews([
                { EntityName: 'MJ: Content Sources', OrderBy: 'Name', ResultType: 'simple' },
                { EntityName: 'MJ: Content Items', OrderBy: '__mj_UpdatedAt DESC', MaxRows: 200, ResultType: 'simple', Fields: ['ID', 'Name', 'ContentSourceID', 'ContentSourceTypeID', 'ContentSource', 'ContentSourceType', 'ContentType', 'ContentFileType', 'URL', 'Text', 'Checksum', 'EntityRecordDocumentID', '__mj_CreatedAt', '__mj_UpdatedAt'] },
                { EntityName: 'MJ: Content Process Runs', OrderBy: 'StartTime DESC', MaxRows: 100, ResultType: 'simple' },
                { EntityName: 'MJ: Content Item Tags', ResultType: 'simple', Fields: ['ID', 'ItemID', 'Item', 'Tag', 'TagID', 'Weight', '__mj_CreatedAt'] },
                { EntityName: 'MJ: Content Source Types', ResultType: 'simple' },
                { EntityName: 'MJ: Content Types', ResultType: 'simple' }
            ]);

            this.contentSourcesRaw = sourcesResult.Success ? sourcesResult.Results : [];
            this.contentItemsRaw = itemsResult.Success ? itemsResult.Results : [];
            this.contentRunsRaw = runsResult.Success ? runsResult.Results : [];
            this.contentTagsRaw = tagsResult.Success ? tagsResult.Results : [];
            this.contentSourceTypesRaw = sourceTypesResult.Success ? sourceTypesResult.Results : [];
            this.contentTypesRaw = contentTypesResult.Success ? contentTypesResult.Results : [];

            // Use TotalRowCount for accurate KPI/badge counts (the Results arrays are
            // capped by MaxRows for feed display, but TotalRowCount reflects the full DB count)
            this.totalContentItemCount = itemsResult.Success ? itemsResult.TotalRowCount : 0;
            this.totalContentTagCount = tagsResult.Success ? tagsResult.TotalRowCount : 0;

            // Load ScheduledAction entities referenced by sources so cron descriptions are available
            await this.loadScheduledActionsForSources();

            this.buildNavItems();
            this.buildKPIMetrics();
            this.buildPipelineStages();
            this.buildFeedItems();
            this.buildSourceMinis();
            this.buildTrendingTags();
        } catch (error) {
            console.error('[Autotagging] Error loading pipeline data:', error);
        }
    }

    private buildNavItems(): void {
        // Tags dashboard shows only tag-related sections. The pipeline / sources /
        // types / history surfaces live in the Classify dashboard instead.
        this.NavItems = [
            { Tab: 'tags', Icon: 'fa-solid fa-chart-simple', Label: 'Overview', BadgeText: String(this.totalContentTagCount), BadgeClass: '' },
            { Tab: 'taxonomy', Icon: 'fa-solid fa-sitemap', Label: 'Taxonomy', BadgeText: String(this.tagsRaw.length || ''), BadgeClass: '' },
            { Tab: 'suggestions', Icon: 'fa-solid fa-inbox', Label: 'Suggestions', BadgeText: String(this.PendingSuggestionCount || ''), BadgeClass: '' },
            { Tab: 'health', Icon: 'fa-solid fa-heart-pulse', Label: 'Health', BadgeText: '', BadgeClass: '' },
        ];
    }

    private buildKPIMetrics(): void {
        const sourceCount = this.contentSourcesRaw.length;
        const itemCount = this.totalContentItemCount;
        const tagCount = this.totalContentTagCount;
        const errorCount = this.contentRunsRaw.filter(r => (r['Status'] as string)?.toLowerCase() === 'error' || (r['Status'] as string)?.toLowerCase() === 'failed').length;

        this.KPIMetrics = [
            { Label: 'Active Sources', Value: sourceCount, Icon: 'fa-solid fa-satellite-dish', Trend: '', TrendUp: true },
            { Label: 'Content Items', Value: itemCount, Icon: 'fa-solid fa-file-lines', Trend: '', TrendUp: true },
            { Label: 'Tags Generated', Value: tagCount, Icon: 'fa-solid fa-tags', Trend: tagCount > 0 && itemCount > 0 ? `${(tagCount / itemCount).toFixed(1)} avg/item` : '', TrendUp: true },
            { Label: 'Errors', Value: errorCount, Icon: 'fa-solid fa-circle-exclamation', Trend: '', TrendUp: false }
        ];
    }

    private buildPipelineStages(): void {
        this.PipelineStages = [
            { Name: 'Ingest', Icon: 'fa-solid fa-download', Status: 'idle', Count: '\u2014' },
            { Name: 'Extract', Icon: 'fa-solid fa-file-lines', Status: 'idle', Count: '\u2014' },
            { Name: 'Chunk', Icon: 'fa-solid fa-scissors', Status: 'idle', Count: '\u2014' },
            { Name: 'Tag', Icon: 'fa-solid fa-tags', Status: 'idle', Count: '\u2014' },
            { Name: 'Vectorize', Icon: 'fa-solid fa-vector-square', Status: 'idle', Count: '\u2014' }
        ];
    }

    private buildFeedItems(): void {
        const tagsByItem = this.countTagsByItem();

        this.FeedItems = this.contentItemsRaw.map(item => {
            const itemId = item['ID'] as string;
            const normalizedId = NormalizeUUID(itemId);
            const itemTags = this.getTopTagsForItem(itemId, 3);
            return {
                Name: (item['Name'] as string) ?? 'Unnamed Item',
                SourceName: (item['ContentSource'] as string) ?? 'Unknown',
                Tags: itemTags,
                TimeAgo: this.formatRelativeTime(item['__mj_UpdatedAt'] as string),
                Status: this.inferItemStatus(tagsByItem.get(normalizedId) ?? 0)
            };
        });
    }

    private buildSourceMinis(): void {
        // When items are capped by MaxRows, countItemsBySource() undercounts.
        // For a single source, use the accurate totalContentItemCount instead.
        const singleSource = this.contentSourcesRaw.length === 1;
        const itemCountBySource = singleSource ? null : this.countItemsBySource();
        this.SourceMinis = this.contentSourcesRaw.map(source => {
            const id = source['ID'] as string;
            const itemCount = singleSource ? this.totalContentItemCount : (itemCountBySource!.get(id) ?? 0);
            const typeName = (source['ContentSourceType'] as string) ?? 'Unknown';
            return {
                ID: id,
                Name: (source['Name'] as string) ?? 'Unnamed',
                Icon: this.GetSourceTypeIcon(typeName),
                Meta: `${this.formatNumber(itemCount)} items`,
                StatusClass: 'active' as const
            };
        });
    }

    /**
     * D6: Build trending tags weighted by recency (last 7 days).
     * Counts tags from ContentItemTag records created in the last 7 days
     * and weights by frequency. Falls back to all-time data if no recent tags.
     */
    private buildTrendingTags(): void {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
        const recentTags = this.contentTagsRaw.filter(tag => {
            const d = tag['__mj_CreatedAt'] as string | undefined;
            return d && new Date(d) >= sevenDaysAgo;
        });

        const scored = this.computeTrendingFromTags(recentTags.length > 0 ? recentTags : this.contentTagsRaw);
        const maxScore = scored.length > 0 ? scored[0].score : 1;

        this.TrendingTags = scored.map(s => ({
            Tag: s.tag,
            AvgWeight: s.weight,
            SizeClass: s.score >= maxScore * 0.7 ? 'large' : s.score >= maxScore * 0.3 ? '' : 'small'
        }));
    }

    /**
     * Compute scored trending tags from a given set of tag records.
     * Returns top 12 tags sorted by score (frequency x avg weight).
     */
    private computeTrendingFromTags(tags: Record<string, unknown>[]): { tag: string; count: number; weight: number; score: number }[] {
        const counts = new Map<string, number>();
        const weightSums = new Map<string, number>();
        for (const tag of tags) {
            const t = tag['Tag'] as string;
            const w = Number(tag['Weight'] ?? 0.5);
            if (t) {
                counts.set(t, (counts.get(t) ?? 0) + 1);
                weightSums.set(t, (weightSums.get(t) ?? 0) + w);
            }
        }
        return Array.from(counts.entries()).map(([tag, count]) => {
            const weight = count > 0 ? (weightSums.get(tag) ?? 0) / count : 1.0;
            return { tag, count, weight, score: count * weight };
        }).sort((a, b) => b.score - a.score).slice(0, 12);
    }

    // ════════════════════════════════════════════
    // SOURCES TAB
    // ════════════════════════════════════════════

    private async loadSourcesData(): Promise<void> {
        await this.ensureBaseDataLoaded();
        this.buildSourceCards();
    }

    private buildSourceCards(): void {
        // When there's a single source, use the accurate total counts from TotalRowCount
        // instead of counting from the capped contentItemsRaw/contentTagsRaw arrays.
        const singleSource = this.contentSourcesRaw.length === 1;
        const itemCountBySource = singleSource ? null : this.countItemsBySource();
        const tagCountBySource = singleSource ? null : this.countTagsBySource();
        const lastRunBySource = this.getLastRunBySource();

        this.SourceCards = this.contentSourcesRaw.map(source => {
            const id = source['ID'] as string;
            const itemCount = singleSource ? this.totalContentItemCount : (itemCountBySource!.get(id) ?? 0);
            const tagCount = singleSource ? this.totalContentTagCount : (tagCountBySource!.get(id) ?? 0);
            const avgTags = itemCount > 0 ? (tagCount / itemCount).toFixed(1) : '0';
            const lastRun = lastRunBySource.get(id);
            const typeName = (source['ContentSourceType'] as string) ?? 'Unknown';
            const lastRunStatus = lastRun ? (lastRun['Status'] as string)?.toLowerCase() : null;
            const hasError = lastRunStatus === 'error' || lastRunStatus === 'failed';

            const scheduledActionID = (source['ScheduledActionID'] as string | null) ?? null;
            const scheduledActionName = (source['ScheduledAction'] as string | null) ?? null;
            const cronExpr = scheduledActionID ? this.getScheduledActionCron(scheduledActionID) : null;

            return {
                ID: id,
                Name: (source['Name'] as string) ?? 'Unnamed Source',
                SourceTypeName: typeName,
                ContentTypeName: (source['ContentType'] as string) ?? 'Unknown',
                FileTypeName: (source['ContentFileType'] as string) ?? 'Unknown',
                Icon: this.GetSourceTypeIcon(typeName),
                StatusClass: hasError ? 'error' as const : 'active' as const,
                StatusLabel: hasError ? 'Error' : 'Active',
                URL: (source['URL'] as string) ?? '',
                ItemCount: itemCount,
                TagCount: tagCount,
                AvgTags: avgTags,
                LastRunAgo: lastRun ? this.formatRelativeTime(lastRun['StartTime'] as string) : 'Never',
                ContentSourceTypeID: source['ContentSourceTypeID'] as string,
                ContentTypeID: source['ContentTypeID'] as string,
                ContentFileTypeID: source['ContentFileTypeID'] as string,
                EmbeddingModelID: (source['EmbeddingModelID'] as string) ?? '',
                VectorIndexID: (source['VectorIndexID'] as string) ?? '',
                EntityID: (source['EntityID'] as string) ?? '',
                EntityDocumentID: (source['EntityDocumentID'] as string) ?? '',
                RequiresFileType: this.sourceTypeRequiresFileType(source['ContentSourceTypeID'] as string),
                ScheduledActionID: scheduledActionID,
                ScheduledActionName: scheduledActionName,
                ScheduleDescription: cronExpr ? CronToHumanReadable(cronExpr) : null,
            };
        });
    }

    /** Resolve the entity record ID from the EntityRecordDocument for entity-sourced content items */
    private resolveEntityRecordID(item: Record<string, unknown>, sourceId: string): string | null {
        const erdID = item['EntityRecordDocumentID'] as string | null;
        if (!erdID) return null;
        return this.entityRecordDocCache.get(NormalizeUUID(erdID)) ?? null;
    }

    /** Resolve the entity name for an entity-sourced content source */
    private resolveEntityName(sourceId: string): string | null {
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const source = engine.ContentSources.find(cs => UUIDsEqual(cs.ID, sourceId));
            if (!source?.EntityID) return null;
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, source.EntityID));
            return entityInfo?.Name ?? null;
        } catch {
            return null;
        }
    }

    /** Check if a source type's Configuration says RequiresFileType !== false */
    private sourceTypeRequiresFileType(sourceTypeID: string): boolean {
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const st = engine.ContentSourceTypes.find(t => UUIDsEqual(t.ID, sourceTypeID));
            return st?.ConfigurationObject?.RequiresFileType !== false;
        } catch {
            return true;
        }
    }

    // ════════════════════════════════════════════
    // CONTENT TYPES TAB
    // ════════════════════════════════════════════

    private async loadContentTypesData(): Promise<void> {
        if (this.contentTypesRaw.length === 0) {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView({ EntityName: 'MJ: Content Types', ResultType: 'simple' });
            if (result.Success) this.contentTypesRaw = result.Results;
        }
        await this.ensureBaseDataLoaded();
        this.buildContentTypeCards();
    }

    private buildContentTypeCards(): void {
        const sourcesUsingByType = this.countSourcesByContentType();
        // When items are capped by MaxRows, countItemsByContentType undercounts.
        // For a single content type, use the accurate totalContentItemCount.
        const singleType = this.contentTypesRaw.length === 1;
        const itemsByType = singleType ? null : this.countItemsByContentType();

        this.ContentTypeCards = this.contentTypesRaw.map(ct => {
            const id = ct['ID'] as string;
            const minTags = (ct['MinTags'] as number) ?? 1;
            const maxTags = (ct['MaxTags'] as number) ?? 10;
            const range = 15; // max possible
            return {
                ID: id,
                Name: (ct['Name'] as string) ?? 'Unnamed',
                Description: (ct['Description'] as string) ?? '',
                AIModelName: (ct['AIModel'] as string) ?? 'Default Model',
                AIModelID: (ct['AIModelID'] as string) ?? '',
                MinTags: minTags,
                MaxTags: maxTags,
                SourcesUsing: sourcesUsingByType.get(id) ?? 0,
                ItemsTagged: singleType ? this.totalContentItemCount : (itemsByType!.get(id) ?? 0),
                RangeLeftPct: Math.round((minTags / range) * 100),
                RangeRightPct: Math.round(100 - (maxTags / range) * 100),
                EmbeddingModelID: (ct['EmbeddingModelID'] as string) ?? '',
                VectorIndexID: (ct['VectorIndexID'] as string) ?? ''
            };
        });
    }

    // ════════════════════════════════════════════
    // TAG LIBRARY TAB
    // ════════════════════════════════════════════

    private async loadTagLibraryData(): Promise<void> {
        await this.ensureBaseDataLoaded();
        this.buildTagRows();
        this.buildTagCloud();
        this.buildTagsBySource();
        this.FilteredTagRows = this.TagRows;
    }

    private buildTagRows(): void {
        const tagCounts = this.countAllTags();
        const avgWeights = this.computeAvgWeights();
        const tagSourceMap = this.getTopSourcePerTag();
        const tagFirstSeen = this.getFirstSeenPerTag();
        const sorted = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
        const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

        this.TagRows = sorted.map(([tag, count]) => ({
            Tag: tag,
            UsageCount: count,
            AvgWeight: avgWeights.get(tag) ?? 1.0,
            BarWidthPct: Math.round((count / maxCount) * 100),
            TopSource: tagSourceMap.get(tag) ?? 'Unknown',
            FirstSeen: tagFirstSeen.get(tag) ?? ''
        }));
    }

    private buildTagCloud(): void {
        const tagCounts = this.countAllTags();
        const avgWeights = this.computeAvgWeights();
        // Sort by a combined score: usage count * avg weight (so high-weight, high-count tags bubble up)
        const scored = Array.from(tagCounts.entries()).map(([tag, count]) => {
            const weight = avgWeights.get(tag) ?? 1.0;
            return { tag, count, weight, score: count * weight };
        }).sort((a, b) => b.score - a.score).slice(0, 20);
        const maxScore = scored.length > 0 ? scored[0].score : 1;

        this.TagCloud = scored.map(s => ({
            Tag: s.tag,
            AvgWeight: s.weight,
            SizeClass: s.score >= maxScore * 0.7 ? 'large' : s.score >= maxScore * 0.3 ? '' : 'small'
        }));

        // Build WordCloudItem[] for the mj-word-cloud component
        this.TagCloudWordItems = scored.map(s => ({
            Text: s.tag,
            Weight: maxScore > 0 ? s.score / maxScore : 0,
            Metadata: { Count: s.count, AvgWeight: s.weight }
        }));
    }

    private buildTagsBySource(): void {
        const sourceTagCounts = new Map<string, number>();
        const itemSourceMap = new Map<string, string>();
        for (const item of this.contentItemsRaw) {
            itemSourceMap.set(item['ID'] as string, (item['ContentSource'] as string) ?? 'Unknown');
        }
        for (const tag of this.contentTagsRaw) {
            const source = itemSourceMap.get(tag['ItemID'] as string) ?? 'Unknown';
            sourceTagCounts.set(source, (sourceTagCounts.get(source) ?? 0) + 1);
        }
        this.TagsBySource = Array.from(sourceTagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ SourceName: name, Count: count }));
    }

    /** Convert a string ID to a CompositeKey for tree-dropdown binding */
    public ToCompositeKey(id: string | null | undefined): CompositeKey | null {
        if (!id) return null;
        return new CompositeKey([{ FieldName: 'ID', Value: id }]);
    }

    /** Extract the ID string from a CompositeKey (from tree-dropdown ValueChange) */
    public FromCompositeKey(key: CompositeKey | CompositeKey[] | null): string {
        if (!key) return '';
        const ck = Array.isArray(key) ? key[0] : key;
        if (!ck?.KeyValuePairs?.length) return '';
        return String(ck.KeyValuePairs[0].Value || '');
    }

    public FilterTags(): void {
        const q = this.TagSearchQuery.toLowerCase().trim();
        this.FilteredTagRows = q
            ? this.TagRows.filter(r => r.Tag.toLowerCase().includes(q))
            : this.TagRows;
        this.cdr.detectChanges();
    }

    /** Drill down into content items matching a specific tag */
    public DrillDownTag(tagName: string): void {
        if (this.SelectedDrillDownTag === tagName) {
            this.CloseDrillDownTag();
            return;
        }
        this.SelectedDrillDownTag = tagName;

        // Find all content items that have this tag
        const matchingItemIDs = new Map<string, number>(); // itemID → weight
        for (const tag of this.contentTagsRaw) {
            if ((tag['Tag'] as string) === tagName) {
                matchingItemIDs.set(
                    NormalizeUUID(tag['ItemID'] as string),
                    Number(tag['Weight'] ?? 1)
                );
            }
        }

        this.TagDrillDownItems = [];
        for (let i = 0; i < this.contentItemsRaw.length; i++) {
            const item = this.contentItemsRaw[i];
            const normalizedID = NormalizeUUID(item['ID'] as string);
            const weight = matchingItemIDs.get(normalizedID);
            if (weight !== undefined) {
                this.TagDrillDownItems.push({
                    ID: item['ID'] as string,
                    Name: (item['Name'] as string) ?? 'Unnamed',
                    SourceName: (item['ContentSource'] as string) ?? 'Unknown',
                    Weight: weight,
                    UpdatedAt: this.formatShortDate((item['__mj_UpdatedAt'] as string) ?? ''),
                    FeedIndex: i,
                });
            }
        }

        // Sort by weight descending
        this.TagDrillDownItems.sort((a, b) => b.Weight - a.Weight);
        this.cdr.detectChanges();
    }

    public CloseDrillDownTag(): void {
        this.SelectedDrillDownTag = null;
        this.TagDrillDownItems = [];
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // RUN HISTORY TAB
    // ════════════════════════════════════════════

    private async loadRunHistoryData(): Promise<void> {
        if (this.contentRunsRaw.length === 0) {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView({
                EntityName: 'MJ: Content Process Runs',
                OrderBy: 'StartTime DESC',
                MaxRows: 200,
                ResultType: 'simple'
            });
            if (result.Success) this.contentRunsRaw = result.Results;
        }
        this.buildRunHistoryRows();
        this.buildHistorySourceOptions();
        this.FilteredRunRows = this.RunHistoryRows;
    }

    private buildRunHistoryRows(): void {
        this.RunHistoryRows = this.contentRunsRaw.map(run => {
            const status = (run['Status'] as string) ?? 'Unknown';
            const startTime = run['StartTime'] as string | null;
            const endTime = run['EndTime'] as string | null;
            const duration = this.computeDuration(startTime, endTime);
            const processedItems = run['ProcessedItems'] as number | null;
            const errorCount = run['ErrorCount'] as number | null;
            const statusLower = status.toLowerCase();
            const isFailed = statusLower === 'error' || statusLower === 'failed';
            const isRunning = statusLower === 'running' || statusLower === 'processing';
            const hasErrors = (errorCount ?? 0) > 0;

            return {
                ID: run['ID'] as string,
                Status: this.displayStatus(status),
                StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
                SourceName: (run['Source'] as string) ?? 'Unknown',
                StartedDisplay: startTime ? this.formatDate(startTime) : '\u2014',
                Duration: duration,
                Items: processedItems != null ? this.formatNumber(processedItems) : '\u2014',
                Tags: '\u2014',
                Errors: hasErrors ? this.formatNumber(errorCount!) : (isFailed ? status : '0'),
                ErrorClass: isFailed || hasErrors ? 'run-error-text' : ''
            };
        });
    }

    private buildHistorySourceOptions(): void {
        const sources = new Set<string>();
        for (const run of this.contentRunsRaw) {
            const s = run['Source'] as string;
            if (s) sources.add(s);
        }
        this.HistorySourceOptions = Array.from(sources).sort();
    }

    public FilterRunHistory(): void {
        this.FilteredRunRows = this.RunHistoryRows.filter(row => {
            if (this.HistorySourceFilter && row.SourceName !== this.HistorySourceFilter) return false;
            if (this.HistoryStatusFilter && row.StatusClass !== this.HistoryStatusFilter) return false;
            return true;
        });
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // D3/D8: RUN HISTORY DETAIL SLIDE-IN
    // ════════════════════════════════════════════

    /**
     * D3/D8: Open the detail view for a specific run, loading ContentProcessRunDetail records.
     */
    public async OpenRunDetail(runID: string): Promise<void> {
        if (this.SelectedRunID === runID) {
            this.CloseRunDetail();
            return;
        }
        this.SelectedRunID = runID;
        this.IsLoadingRunDetail = true;
        this.RunDetailRows = [];
        this.cdr.detectChanges();

        await this.loadRunDetailRows(runID);

        this.IsLoadingRunDetail = false;
        this.cdr.detectChanges();
    }

    /** D3/D8: Close the run detail slide-in */
    public CloseRunDetail(): void {
        this.SelectedRunID = null;
        this.RunDetailRows = [];
        this.IsLoadingRunDetail = false;
        this.cdr.detectChanges();
    }

    /**
     * D2/D3/D8: Load ContentProcessRunDetail records for a given run and map to RunDetailRow[].
     */
    private async loadRunDetailRows(runID: string): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: 'MJ: Content Process Run Details',
            ExtraFilter: `ContentProcessRunID='${runID}'`,
            OrderBy: 'ContentSource',
            ResultType: 'simple',
        });
        if (result.Success) {
            this.RunDetailRows = this.mapRunDetailRecords(result.Results);
        }
    }

    /**
     * D2: Load live per-source progress for the currently running pipeline.
     * Called when the pipeline is actively running.
     */
    public async LoadLiveRunDetails(): Promise<void> {
        // Find the most recent running pipeline run
        const runningRun = this.contentRunsRaw.find(r => {
            const status = String(r['Status'] || '').toLowerCase();
            return status === 'running' || status === 'processing' || status === 'in progress';
        });
        if (!runningRun) {
            this.LiveRunDetailRows = [];
            return;
        }

        this.IsLoadingLiveDetails = true;
        this.cdr.detectChanges();

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: 'MJ: Content Process Run Details',
            ExtraFilter: `ContentProcessRunID='${String(runningRun['ID'])}'`,
            OrderBy: 'ContentSource',
            ResultType: 'simple',
        });
        if (result.Success) {
            this.LiveRunDetailRows = this.mapRunDetailRecords(result.Results);
        }

        this.IsLoadingLiveDetails = false;
        this.cdr.detectChanges();
    }

    /** Map raw ContentProcessRunDetail records to RunDetailRow[] */
    private mapRunDetailRecords(records: Record<string, unknown>[]): RunDetailRow[] {
        return records.map(d => {
            const status = String(d['Status'] || 'Pending');
            const statusLower = status.toLowerCase();
            const isFailed = statusLower === 'failed' || statusLower === 'error';
            const isRunning = statusLower === 'running' || statusLower === 'processing';
            const startTime = d['StartTime'] ? new Date(String(d['StartTime'])) : null;
            const endTime = d['EndTime'] ? new Date(String(d['EndTime'])) : null;
            const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : 0;
            const durationStr = durationMs > 60000 ? `${Math.round(durationMs / 60000)}m` : `${Math.round(durationMs / 1000)}s`;

            return {
                SourceName: String(d['ContentSource'] || 'Unknown'),
                SourceType: String(d['ContentSourceType'] || ''),
                Status: this.displayStatus(status),
                StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
                ItemsProcessed: Number(d['ItemsProcessed'] || 0),
                ItemsTagged: Number(d['ItemsTagged'] || 0),
                ItemsVectorized: Number(d['ItemsVectorized'] || 0),
                ErrorCount: Number(d['ErrorCount'] || 0),
                TotalTokens: Number(d['TotalTokensUsed'] || 0),
                TotalCost: Number(d['TotalCost'] || 0),
                Duration: durationStr,
            };
        });
    }

    // ════════════════════════════════════════════
    // SLIDE-IN FORM — Sources
    // ════════════════════════════════════════════

    public async OpenAddSourceForm(): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.resetSourceForm();
        this.FormMode = 'add-source';
        this.cdr.detectChanges();
    }

    public async OpenEditSourceForm(card: SourceCard): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.FormSourceName = card.Name;
        this.FormSourceTypeID = card.ContentSourceTypeID;
        this.FormContentTypeID = card.ContentTypeID;
        this.FormFileTypeID = card.ContentFileTypeID;
        this.FormSourceURL = card.URL;
        this.FormSourceEntityID = card.EntityID ?? '';
        this.FormSourceEntityDocID = card.EntityDocumentID ?? '';
        this.FormSourceEmbeddingModelID = card.EmbeddingModelID ?? '';
        this.FormSourceVectorIndexID = card.VectorIndexID ?? '';
        this.EditingSourceID = card.ID;

        // Populate FormSourceSpecificConfig from existing Configuration JSON
        this.FormSourceSpecificConfig = {};
        const rawSource = this.contentSourcesRaw.find(s => UUIDsEqual(s['ID'] as string, card.ID));
        if (rawSource) {
            const configStr = rawSource['Configuration'] as string | null;
            if (configStr) {
                try {
                    const parsed = JSON.parse(configStr);
                    const specific = parsed?.SourceSpecificConfiguration as Record<string, string> | undefined;
                    if (specific) {
                        this.FormSourceSpecificConfig = { ...specific };
                    }
                } catch {
                    // Configuration not valid JSON, ignore
                }
            }
        }

        this.FormMode = 'edit-source';
        this.cdr.detectChanges();
    }

    public async SaveSource(): Promise<void> {
        if (this.FormSaving) return;

        // Validate required fields before saving
        if (!this.FormSourceName.trim()) {
            MJNotificationService.Instance.CreateSimpleNotification('Please enter a source name.', 'warning', 3000);
            return;
        }
        if (!this.FormSourceTypeID) {
            MJNotificationService.Instance.CreateSimpleNotification('Please select a source type.', 'warning', 3000);
            return;
        }

        // For non-Entity source types, ContentType is required
        if (!this.IsEntitySourceTypeSelected && this.SelectedSourceTypeRequiresContentType) {
            if (!this.FormContentTypeID) {
                if (this.ContentTypeOptions.length === 0) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'No content types are configured. Please create a content type first in the Content Types section.',
                        'warning', 5000
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Please select a content type.',
                        'warning', 3000
                    );
                }
                return;
            }
        }

        this.FormSaving = true;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJContentSourceEntity>('MJ: Content Sources');

            if (this.FormMode === 'edit-source' && this.EditingSourceID) {
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.EditingSourceID }]));
            } else {
                entity.NewRecord();
            }

            entity.Name = this.FormSourceName;
            entity.ContentSourceTypeID = this.FormSourceTypeID;

            // For Entity source type, ContentType and FileType are not relevant
            // but the DB columns are NOT NULL, so default to the first available value
            if (this.IsEntitySourceTypeSelected) {
                const engine = KnowledgeHubMetadataEngine.Instance;
                if (!entity.ContentTypeID) {
                    if (engine.ContentTypes.length === 0) {
                        this.FormSaving = false;
                        this.cdr.detectChanges();
                        this.ShowNoContentTypeWarning = true;
                        return;
                    }
                    entity.ContentTypeID = engine.ContentTypes[0].ID;
                }
                if (!entity.ContentFileTypeID && engine.ContentFileTypes.length > 0) {
                    entity.ContentFileTypeID = engine.ContentFileTypes[0].ID;
                }
            } else {
                entity.ContentTypeID = this.FormContentTypeID;
                entity.ContentFileTypeID = this.FormFileTypeID;
            }

            // Store source-type-specific values from the dynamic form
            // For Entity type: EntityID and EntityDocumentID go on the entity directly
            if (this.IsEntitySourceTypeSelected) {
                entity.EntityID = this.FormSourceSpecificConfig['EntityID'] || null;
                const entityDocID = this.FormSourceSpecificConfig['EntityDocumentID'];
                if (entityDocID) {
                    entity.EntityDocumentID = entityDocID;
                } else {
                    // Auto-select first doc if only one exists
                    const docField = this.SelectedSourceTypeFields.find(f => f.Type === 'entity-doc-picker');
                    const docs = docField ? this.GetDependentOptions(docField) : [];
                    entity.EntityDocumentID = docs.length > 0 ? docs[0].ID : null;
                }
                entity.URL = '';
            } else {
                entity.EntityID = null;
                entity.EntityDocumentID = null;
                // URL comes from dynamic fields for RSS/Website, or empty for others
                entity.URL = this.FormSourceSpecificConfig['URL'] || '';
            }

            // Store the full SourceSpecificConfiguration in the Configuration JSON
            const currentConfig = entity.ConfigurationObject ?? {};
            currentConfig.SourceSpecificConfiguration = { ...this.FormSourceSpecificConfig };
            entity.ConfigurationObject = currentConfig;

            entity.EmbeddingModelID = this.FormSourceEmbeddingModelID || null;
            entity.VectorIndexID = this.FormSourceVectorIndexID || null;

            const saved = await entity.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.FormMode === 'edit-source' ? 'Source updated' : 'Source created', 'success', 2500
                );
                this.CloseForm();
                await this.refreshSourcesTab();
            } else {
                // CP-4: Show detailed error from LatestResult
                const errorDetail = entity.LatestResult?.Message ?? 'Unknown error';
                console.error('[Classify] Save source failed:', entity.LatestResult);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save source: ${errorDetail}`, 'error', 5000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[Classify] Save source exception:', error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.FormSaving = false;
            this.cdr.detectChanges();
        }
    }

    public async DeleteSource(card: SourceCard): Promise<void> {
        if (!confirm(`Delete source "${card.Name}"? This cannot be undone.`)) return;

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Content Sources');
            await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: card.ID }]));
            const deleted = await entity.Delete();
            if (deleted) {
                MJNotificationService.Instance.CreateSimpleNotification('Source deleted', 'success', 2500);
                await this.refreshSourcesTab();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to delete source', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    // ════════════════════════════════════════════
    // SCHEDULE DIALOG — Quick Schedule for Source
    // ════════════════════════════════════════════

    /**
     * Opens the schedule dialog pre-filled for the given source card.
     * Defaults to a daily 2 AM cron expression.
     * @param card The source card to create a schedule for
     */
    public OpenScheduleDialog(card: SourceCard): void {
        this.SchedulingSourceCard = card;
        this.ScheduleCron = '0 2 * * *';
        this.ScheduleEnabled = true;
        this.ShowScheduleDialog = true;
        this.cdr.detectChanges();
    }

    /** Closes the schedule dialog without saving */
    public CloseScheduleDialog(): void {
        this.ShowScheduleDialog = false;
        this.SchedulingSourceCard = null;
        this.cdr.detectChanges();
    }

    /**
     * Saves a new ScheduledAction for the current source, links it
     * via ContentSource.ScheduledActionID, and creates the default
     * action params for the Autotag and Vectorize action.
     */
    public async SaveSchedule(): Promise<void> {
        if (this.ScheduleSaving || !this.SchedulingSourceCard) return;
        this.ScheduleSaving = true;
        this.cdr.detectChanges();

        const card = this.SchedulingSourceCard;

        try {
            const md = this.ProviderToUse;

            // 1. Find the "Autotag and Vectorize Content" action
            const actionID = await this.findAutotagActionID();
            if (!actionID) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Could not find the "Autotag and Vectorize Content" action. Please check action configuration.',
                    'error', 5000
                );
                return;
            }

            // 2. Create the ScheduledAction
            const scheduledAction = await md.GetEntityObject<MJScheduledActionEntity>('MJ: Scheduled Actions');
            scheduledAction.NewRecord();
            scheduledAction.Name = `Autotag: ${card.Name}`;
            scheduledAction.Description = `Automated classification pipeline for content source "${card.Name}"`;
            scheduledAction.ActionID = actionID;
            scheduledAction.Type = 'Custom';
            scheduledAction.CronExpression = this.ScheduleCron;
            scheduledAction.CustomCronExpression = this.ScheduleCron;
            scheduledAction.Status = this.ScheduleEnabled ? 'Active' : 'Disabled';
            scheduledAction.Timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const saved = await scheduledAction.Save();
            if (!saved) {
                const errorDetail = scheduledAction.LatestResult?.Message ?? 'Unknown error';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to create schedule: ${errorDetail}`, 'error', 5000
                );
                return;
            }

            // 3. Create ScheduledActionParam for sourceIDs
            await this.createSourceIDParam(scheduledAction.ID, actionID, card.ID);

            // 4. Link ScheduledAction to ContentSource
            await this.linkScheduleToSource(card.ID, scheduledAction.ID);

            // 5. Cache the new action for cron display
            this.scheduledActionsCache.set(NormalizeUUID(scheduledAction.ID), scheduledAction);

            MJNotificationService.Instance.CreateSimpleNotification(
                `Schedule created: ${CronToHumanReadable(this.ScheduleCron)}`, 'success', 3000
            );

            this.CloseScheduleDialog();
            await this.refreshSourcesTab();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[Classify] Schedule creation error:', error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.ScheduleSaving = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Removes the schedule from a source card by unlinking the ScheduledActionID.
     * @param card The source card to remove the schedule from
     */
    public async RemoveSchedule(card: SourceCard): Promise<void> {
        if (!card.ScheduledActionID) return;
        if (!confirm(`Remove the schedule "${card.ScheduleDescription ?? 'schedule'}" from "${card.Name}"?`)) return;

        try {
            await this.linkScheduleToSource(card.ID, null);
            MJNotificationService.Instance.CreateSimpleNotification('Schedule removed from source', 'success', 2500);
            await this.refreshSourcesTab();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    /**
     * Returns the human-readable schedule description for a source card.
     * Used in the template to display schedule indicators.
     */
    public GetScheduleLabel(card: SourceCard): string {
        return card.ScheduleDescription ?? 'Scheduled';
    }

    /**
     * Returns a human-readable preview of a cron expression for the schedule dialog.
     * @param cron The cron expression to preview
     */
    public GetCronPreview(cron: string): string {
        return CronToHumanReadable(cron);
    }

    /** Looks up the cron expression for a cached ScheduledAction by ID */
    private getScheduledActionCron(scheduledActionID: string): string | null {
        const cached = this.scheduledActionsCache.get(NormalizeUUID(scheduledActionID));
        return cached?.CronExpression ?? null;
    }

    /**
     * Loads ScheduledAction entities referenced by content sources into the local cache.
     * Called during initial data load so cron descriptions are available for card rendering.
     */
    private async loadScheduledActionsForSources(): Promise<void> {
        const actionIDs = this.contentSourcesRaw
            .map(s => s['ScheduledActionID'] as string | null)
            .filter((id): id is string => id != null);

        if (actionIDs.length === 0) return;

        const uniqueIDs = [...new Set(actionIDs.map(id => NormalizeUUID(id)))];
        // Skip IDs already cached
        const toLoad = uniqueIDs.filter(id => !this.scheduledActionsCache.has(id));
        if (toLoad.length === 0) return;

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const filter = toLoad.map(id => `'${id}'`).join(',');
        const result = await rv.RunView<MJScheduledActionEntity>({
            EntityName: 'MJ: Scheduled Actions',
            ExtraFilter: `ID IN (${filter})`,
            ResultType: 'entity_object',
        });

        if (result.Success) {
            for (const action of result.Results) {
                this.scheduledActionsCache.set(NormalizeUUID(action.ID), action);
            }
        }
    }

    /** Finds the Action ID for "Autotag and Vectorize Content" by querying actions */
    private async findAutotagActionID(): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Actions',
            ExtraFilter: `Name = 'Autotag and Vectorize Content'`,
            Fields: ['ID'],
            ResultType: 'simple',
            MaxRows: 1,
        });
        if (result.Success && result.Results.length > 0) {
            return result.Results[0].ID;
        }
        return null;
    }

    /**
     * Creates a ScheduledActionParam that passes the source ID to the action.
     * Looks up the "EntityNames" action param and sets the source ID as its value.
     */
    private async createSourceIDParam(scheduledActionID: string, actionID: string, sourceID: string): Promise<void> {
        // Find the "EntityNames" action param to get its ID
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const paramResult = await rv.RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Action Params',
            ExtraFilter: `ActionID = '${actionID}' AND Name = 'EntityNames'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
            MaxRows: 1,
        });

        if (!paramResult.Success || paramResult.Results.length === 0) {
            console.warn('[Classify] Could not find EntityNames action param for source ID scheduling');
            return;
        }

        const md = this.ProviderToUse;
        const param = await md.GetEntityObject<MJScheduledActionParamEntity>('MJ: Scheduled Action Params');
        param.NewRecord();
        param.ScheduledActionID = scheduledActionID;
        param.ActionParamID = paramResult.Results[0].ID;
        param.ValueType = 'Static';
        param.Value = sourceID;

        const saved = await param.Save();
        if (!saved) {
            console.warn('[Classify] Failed to save schedule param:', param.LatestResult?.Message);
        }
    }

    /**
     * Links (or unlinks) a ScheduledAction to a ContentSource by updating
     * the ContentSource.ScheduledActionID field.
     */
    private async linkScheduleToSource(sourceID: string, scheduledActionID: string | null): Promise<void> {
        const md = this.ProviderToUse;
        const entity = await md.GetEntityObject<MJContentSourceEntity>('MJ: Content Sources');
        await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: sourceID }]));
        entity.ScheduledActionID = scheduledActionID;
        const saved = await entity.Save();
        if (!saved) {
            throw new Error(entity.LatestResult?.Message ?? 'Failed to update content source');
        }
    }

    // ════════════════════════════════════════════
    // SLIDE-IN FORM — Content Types
    // ════════════════════════════════════════════

    public async OpenAddTypeForm(): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.resetTypeForm();
        this.FormMode = 'add-type';
        this.cdr.detectChanges();
    }

    public async OpenEditTypeForm(card: ContentTypeCard): Promise<void> {
        await this.ensureFormDropdownsLoaded();
        this.FormTypeName = card.Name;
        this.FormTypeDescription = card.Description;
        this.FormTypeAIModelID = card.AIModelID;
        this.FormTypeMinTags = card.MinTags;
        this.FormTypeMaxTags = card.MaxTags;
        this.FormTypeEmbeddingModelID = card.EmbeddingModelID ?? '';
        this.FormTypeVectorIndexID = card.VectorIndexID ?? '';
        this.EditingTypeID = card.ID;
        this.FormMode = 'edit-type';
        this.cdr.detectChanges();
    }

    public async SaveContentType(): Promise<void> {
        if (this.FormSaving) return;
        this.FormSaving = true;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Content Types');

            if (this.FormMode === 'edit-type' && this.EditingTypeID) {
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.EditingTypeID }]));
            } else {
                entity.NewRecord();
            }

            entity.Set('Name', this.FormTypeName);
            entity.Set('Description', this.FormTypeDescription);
            entity.Set('AIModelID', this.FormTypeAIModelID);
            entity.Set('MinTags', this.FormTypeMinTags);
            entity.Set('MaxTags', this.FormTypeMaxTags);
            entity.Set('EmbeddingModelID', this.FormTypeEmbeddingModelID || null);
            entity.Set('VectorIndexID', this.FormTypeVectorIndexID || null);

            const saved = await entity.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.FormMode === 'edit-type' ? 'Content type updated' : 'Content type created', 'success', 2500
                );
                this.CloseForm();
                await this.refreshContentTypesTab();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to save content type', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        } finally {
            this.FormSaving = false;
            this.cdr.detectChanges();
        }
    }

    public CloseForm(): void {
        this.FormMode = 'none';
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // PIPELINE RUN
    // ════════════════════════════════════════════

    /**
     * Run the pipeline for a specific content source only.
     */
    public async RunPipelineForSource(contentSourceID: string): Promise<void> {
        return this.RunPipeline([contentSourceID]);
    }

    public async RunPipeline(contentSourceIDs?: string[]): Promise<void> {
        if (this.IsRunning) return;

        const provider = this.ProviderToUse as GraphQLDataProvider;
        if (!provider) return;

        this.IsRunning = true;
        this.IsPaused = false;
        this.RunProgress = 0;
        this.RunStage = 'Starting...';
        this.RunCurrentItem = '';
        this.CurrentPipelineRunID = null;
        this.CurrentProcessRunID = null;
        this.cdr.detectChanges();

        try {
            const aiClient = new GraphQLAIClient(provider);
            const result = await aiClient.RunAutotagPipeline(
                contentSourceIDs ? { contentSourceIDs } : undefined
            );

            if (!result.Success || !result.PipelineRunID) {
                this.IsRunning = false;
                this.RunStage = '';
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Pipeline failed: ${result.ErrorMessage ?? 'Unknown error'}`, 'error', 5000
                );
                this.cdr.detectChanges();
                return;
            }

            this.CurrentPipelineRunID = result.PipelineRunID;
            this.subscribeToPipelineProgress(result.PipelineRunID);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[Autotagging] Error starting pipeline:', msg);
            this.IsRunning = false;
            this.RunStage = '';
            MJNotificationService.Instance.CreateSimpleNotification(`Pipeline error: ${msg}`, 'error', 5000);
            this.cdr.detectChanges();
        }
    }

    /**
     * Pause a running classification pipeline. The server sets CancellationRequested
     * on the process run so the engine pauses gracefully after the current batch.
     */
    public async PausePipeline(): Promise<void> {
        if (!this.IsRunning || this.IsPaused || !this.CurrentProcessRunID) return;

        const provider = this.ProviderToUse as GraphQLDataProvider;
        if (!provider) return;

        try {
            const aiClient = new GraphQLAIClient(provider);
            const result = await aiClient.PauseClassificationPipeline(this.CurrentProcessRunID);
            if (result.Success) {
                this.IsPaused = true;
                this.RunStage = 'Pausing...';
                MJNotificationService.Instance.CreateSimpleNotification('Pipeline pause requested', 'info', 3000);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Pause failed: ${result.ErrorMessage ?? 'Unknown error'}`, 'error', 4000
                );
            }
            this.cdr.detectChanges();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Pause error: ${msg}`, 'error', 4000);
        }
    }

    /**
     * Resume a paused classification pipeline from its last completed offset.
     */
    public async ResumePipeline(): Promise<void> {
        if (!this.IsPaused || !this.CurrentProcessRunID) return;

        const provider = this.ProviderToUse as GraphQLDataProvider;
        if (!provider) return;

        try {
            const aiClient = new GraphQLAIClient(provider);
            const result = await aiClient.ResumeClassificationPipeline(this.CurrentProcessRunID);
            if (result.Success) {
                this.IsPaused = false;
                this.IsRunning = true;
                this.RunStage = 'Resuming...';
                if (result.PipelineRunID) {
                    this.CurrentPipelineRunID = result.PipelineRunID;
                    this.subscribeToPipelineProgress(result.PipelineRunID);
                }
                MJNotificationService.Instance.CreateSimpleNotification('Pipeline resumed', 'success', 3000);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Resume failed: ${result.ErrorMessage ?? 'Unknown error'}`, 'error', 4000
                );
            }
            this.cdr.detectChanges();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Resume error: ${msg}`, 'error', 4000);
        }
    }

    /**
     * Cancel a running or paused pipeline. Uses pause mechanism and resets UI state.
     */
    public async CancelPipeline(): Promise<void> {
        if (!this.CurrentProcessRunID && !this.IsRunning) return;

        const provider = this.ProviderToUse as GraphQLDataProvider;
        if (!provider) return;

        // If we have a process run ID, request server-side cancellation
        if (this.CurrentProcessRunID) {
            try {
                const aiClient = new GraphQLAIClient(provider);
                await aiClient.PauseClassificationPipeline(this.CurrentProcessRunID);
            } catch {
                // Best-effort cancellation — proceed with UI reset regardless
            }
        }

        this.IsRunning = false;
        this.IsPaused = false;
        this.RunProgress = 0;
        this.RunStage = '';
        this.RunCurrentItem = '';
        this.CurrentPipelineRunID = null;
        this.CurrentProcessRunID = null;
        MJNotificationService.Instance.CreateSimpleNotification('Pipeline cancelled', 'info', 3000);
        this.cdr.detectChanges();
    }

    private subscribeToPipelineProgress(pipelineRunID: string): void {
        const provider = this.ProviderToUse as GraphQLDataProvider;
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
                this.IsPaused = false;
                this.RunStage = success ? 'Complete' : 'Error';
                this.RunProgress = success ? 100 : 0;
                this.CurrentPipelineRunID = null;
                this.CurrentProcessRunID = null;

                for (const stage of this.PipelineStages) {
                    stage.Status = 'idle';
                    stage.Count = '\u2014';
                }

                if (success) {
                    this.tabDataLoaded.clear();
                    // Reload pipeline data AND refresh ERD cache (new EntityRecordDocuments
                    // may have been created by the pipeline for entity sources)
                    this.entityRecordDocCache.clear();
                    await Promise.all([
                        this.LoadPipelineData(),
                        this.loadEntityRecordDocCache(),
                    ]);
                    this.tabDataLoaded.add('pipeline');
                    MJNotificationService.Instance.CreateSimpleNotification('Pipeline complete', 'success', 3000);
                }
                this.cdr.detectChanges();
            });
        };

        const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                if (this.IsRunning) finishPipeline(true);
            }, 30000);
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

                this.RunProgress = Math.min(100, Math.max(0, pct));
                this.RunStage = this.formatStageName(stage);
                this.RunCurrentItem = currentItem ?? '';
                this.updateStagesForActiveRun(stage);
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

    private updateStagesForActiveRun(activeStageCode: string): void {
        const stageCodeToName: Record<string, string> = {
            'ingest': 'Ingest', 'extract': 'Extract', 'chunk': 'Chunk',
            'tag': 'Tag', 'autotag': 'Tag', 'vectorize': 'Vectorize'
        };
        const activeName = stageCodeToName[activeStageCode] ?? '';
        let passedActive = false;

        for (const stage of this.PipelineStages) {
            if (stage.Name === activeName) {
                stage.Status = 'active';
                passedActive = true;
            } else if (!passedActive) {
                stage.Status = 'complete';
            } else {
                stage.Status = 'idle';
            }
        }
    }

    private formatStageName(stage: string): string {
        const map: Record<string, string> = {
            'extract': 'Extracting content', 'autotag': 'Running autotaggers',
            'vectorize': 'Vectorizing content', 'complete': 'Complete',
            'error': 'Error', 'ingest': 'Ingesting', 'chunk': 'Chunking',
            'tag': 'Tagging'
        };
        return map[stage] ?? stage;
    }

    // ════════════════════════════════════════════
    // HELPER — Aggregation utilities
    // ════════════════════════════════════════════

    private countTagsByItem(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const tag of this.contentTagsRaw) {
            const itemId = NormalizeUUID(tag['ItemID'] as string);
            if (itemId) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
        }
        return counts;
    }

    private getTopTagsForItem(itemId: string, max: number): string[] {
        const tags: string[] = [];
        for (const tag of this.contentTagsRaw) {
            if (UUIDsEqual(tag['ItemID'] as string, itemId)) {
                tags.push(tag['Tag'] as string);
                if (tags.length >= max) break;
            }
        }
        return tags;
    }

    private countItemsBySource(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of this.contentItemsRaw) {
            const sourceId = item['ContentSourceID'] as string;
            if (sourceId) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
        }
        return counts;
    }

    private countTagsBySource(): Map<string, number> {
        const itemSourceMap = new Map<string, string>();
        for (const item of this.contentItemsRaw) {
            itemSourceMap.set(item['ID'] as string, item['ContentSourceID'] as string);
        }
        const counts = new Map<string, number>();
        for (const tag of this.contentTagsRaw) {
            const sourceId = itemSourceMap.get(tag['ItemID'] as string);
            if (sourceId) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
        }
        return counts;
    }

    private getLastRunBySource(): Map<string, Record<string, unknown>> {
        const map = new Map<string, Record<string, unknown>>();
        for (const run of this.contentRunsRaw) {
            const sourceId = run['SourceID'] as string;
            if (sourceId && !map.has(sourceId)) {
                map.set(sourceId, run);
            }
        }
        return map;
    }

    private countAllTags(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const tag of this.contentTagsRaw) {
            const t = tag['Tag'] as string;
            if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        return counts;
    }

    /** Compute average weight per tag across all occurrences */
    private computeAvgWeights(): Map<string, number> {
        const sums = new Map<string, number>();
        const counts = new Map<string, number>();
        for (const tag of this.contentTagsRaw) {
            const t = tag['Tag'] as string;
            const w = Number(tag['Weight'] ?? 0.5);
            if (t) {
                sums.set(t, (sums.get(t) ?? 0) + w);
                counts.set(t, (counts.get(t) ?? 0) + 1);
            }
        }
        const avgs = new Map<string, number>();
        for (const [t, sum] of sums) {
            avgs.set(t, Math.round((sum / (counts.get(t) ?? 1)) * 100) / 100);
        }
        return avgs;
    }

    private getTopSourcePerTag(): Map<string, string> {
        const tagSourceCounts = new Map<string, Map<string, number>>();
        const itemSourceMap = new Map<string, string>();
        for (const item of this.contentItemsRaw) {
            itemSourceMap.set(item['ID'] as string, (item['ContentSource'] as string) ?? 'Unknown');
        }
        for (const tag of this.contentTagsRaw) {
            const t = tag['Tag'] as string;
            const source = itemSourceMap.get(tag['ItemID'] as string) ?? 'Unknown';
            if (!tagSourceCounts.has(t)) tagSourceCounts.set(t, new Map());
            const inner = tagSourceCounts.get(t)!;
            inner.set(source, (inner.get(source) ?? 0) + 1);
        }
        const result = new Map<string, string>();
        for (const [tag, sourceCounts] of tagSourceCounts) {
            let maxSource = 'Unknown';
            let maxCount = 0;
            for (const [source, count] of sourceCounts) {
                if (count > maxCount) { maxSource = source; maxCount = count; }
            }
            result.set(tag, maxSource);
        }
        return result;
    }

    private getFirstSeenPerTag(): Map<string, string> {
        const result = new Map<string, string>();
        for (const tag of this.contentTagsRaw) {
            const t = tag['Tag'] as string;
            if (t && !result.has(t)) {
                const date = tag['__mj_CreatedAt'] as string;
                result.set(t, date ? this.formatShortDate(date) : '');
            }
        }
        return result;
    }

    private countSourcesByContentType(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const source of this.contentSourcesRaw) {
            const typeId = source['ContentTypeID'] as string;
            if (typeId) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
        }
        return counts;
    }

    private countItemsByContentType(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of this.contentItemsRaw) {
            const typeId = item['ContentTypeID'] as string;
            if (typeId) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
        }
        return counts;
    }

    private inferItemStatus(tagCount: number): 'complete' | 'processing' | 'error' {
        return tagCount > 0 ? 'complete' : 'processing';
    }

    // ════════════════════════════════════════════
    // HELPER — Formatting
    // ════════════════════════════════════════════

    public formatRelativeTime(dateStr: string | null | undefined): string {
        if (!dateStr) return 'Never';
        const now = new Date();
        const then = new Date(dateStr);
        const diffMs = now.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    public formatNumber(n: number): string {
        return n.toLocaleString();
    }

    /** Returns font size in rem for a tag based on its weight (0.0-1.0). Range: 0.7rem to 1.0rem */
    public TagFontSize(weight: number): string {
        const min = 0.7;
        const max = 1.0;
        return `${min + (max - min) * Math.min(1, Math.max(0, weight))}rem`;
    }

    /** Format weight as percentage for display in tag chip */
    public FormatWeight(weight: number): string {
        return `${Math.round(weight * 100)}%`;
    }

    private formatShortDate(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    }

    private formatDate(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch {
            return dateStr;
        }
    }

    private computeDuration(start: string | null, end: string | null): string {
        if (!start) return '\u2014';
        const s = new Date(start);
        const e = end ? new Date(end) : new Date();
        const ms = e.getTime() - s.getTime();
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        const mins = Math.floor(ms / 60000);
        const secs = Math.round((ms % 60000) / 1000);
        return `${mins}m ${secs}s`;
    }

    private displayStatus(status: string): string {
        const lower = status.toLowerCase();
        if (lower === 'complete' || lower === 'completed' || lower === 'done') return 'Complete';
        if (lower === 'error' || lower === 'failed') return 'Failed';
        if (lower === 'running' || lower === 'processing') return 'Running';
        return status;
    }

    public GetSourceTypeIcon(typeName: string): string {
        const iconMap: Record<string, string> = {
            'Web': 'fa-solid fa-globe', 'Web Crawler': 'fa-solid fa-globe',
            'API': 'fa-solid fa-plug', 'Database': 'fa-solid fa-database',
            'File': 'fa-solid fa-file-alt', 'Email': 'fa-solid fa-envelope',
            'RSS': 'fa-solid fa-rss', 'RSS Feed': 'fa-solid fa-rss',
            'CMS': 'fa-solid fa-newspaper', 'PDF': 'fa-solid fa-file-pdf'
        };
        return iconMap[typeName] ?? 'fa-solid fa-folder';
    }

    // ════════════════════════════════════════════
    // HELPER — Data loading
    // ════════════════════════════════════════════

    private async ensureBaseDataLoaded(): Promise<void> {
        if (this.contentSourcesRaw.length > 0 && this.contentItemsRaw.length > 0) return;
        await this.LoadPipelineData();
    }

    private async ensureFormDropdownsLoaded(): Promise<void> {
        try {
            // Use KnowledgeHubMetadataEngine for cached reference data — instant, no RunView needed
            const engine = KnowledgeHubMetadataEngine.Instance;
            await engine.Config(false); // no-op if already loaded

            this.SourceTypeOptions = engine.ContentSourceTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            this.ContentTypeOptions = engine.ContentTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            this.FileTypeOptions = engine.ContentFileTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            this.VectorIndexOptions = engine.VectorIndexes.map(vi => ({ ID: vi.ID, Name: vi.Name }));

            // AI Models from AIEngineBase (already cached)
            if (this.AIModelOptions.length === 0) {
                const aiEngine = AIEngineBase.Instance;
                await aiEngine.Config(false);
                this.AIModelOptions = aiEngine.Models.map(m => ({ ID: m.ID, Name: m.Name }));
                this.EmbeddingModelOptions = aiEngine.Models
                    .filter(m => m.AIModelType?.trim().toLowerCase() === 'embeddings')
                    .map(m => ({ ID: m.ID, Name: m.Name }));
            }
        } catch (error) {
            console.error('[Autotagging] Error loading form dropdowns:', error);
        }
    }

    private resetSourceForm(): void {
        this.FormSourceName = '';
        this.FormSourceTypeID = '';
        this.FormContentTypeID = '';
        this.FormFileTypeID = '';
        this.FormSourceURL = '';
        this.FormSourceEntityID = '';
        this.FormSourceEntityDocID = '';
        this.FormSourceEmbeddingModelID = '';
        this.FormSourceVectorIndexID = '';
        this.EditingSourceID = '';
        this.FormSourceSpecificConfig = {};
    }

    private resetTypeForm(): void {
        this.FormTypeName = '';
        this.FormTypeDescription = '';
        this.FormTypeAIModelID = '';
        this.FormTypeMinTags = 1;
        this.FormTypeMaxTags = 10;
        this.FormTypeEmbeddingModelID = '';
        this.FormTypeVectorIndexID = '';
        this.EditingTypeID = '';
    }

    private async refreshSourcesTab(): Promise<void> {
        this.tabDataLoaded.delete('sources');
        this.tabDataLoaded.delete('pipeline');
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({ EntityName: 'MJ: Content Sources', OrderBy: 'Name', ResultType: 'simple' });
        if (result.Success) this.contentSourcesRaw = result.Results;
        await this.loadScheduledActionsForSources();
        this.buildSourceCards();
        this.buildNavItems();
        this.cdr.detectChanges();
    }

    private async refreshContentTypesTab(): Promise<void> {
        this.tabDataLoaded.delete('types');
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({ EntityName: 'MJ: Content Types', ResultType: 'simple' });
        if (result.Success) this.contentTypesRaw = result.Results;
        this.buildContentTypeCards();
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // DETAIL PANELS — Feed Item / Content Item
    // ════════════════════════════════════════════

    public OpenFeedItemDetail(index: number): void {
        const feed = this.FeedItems[index];
        if (!feed) return;

        const rawItem = this.contentItemsRaw[index];
        if (!rawItem) return;

        const itemId = rawItem['ID'] as string;
        const allTags = this.getAllWeightedTagsForItem(itemId);
        const tagCount = allTags.length;

        const contentSourceTypeID = (rawItem['ContentSourceTypeID'] as string) ?? '';
        const requiresContentType = this.sourceTypeRequiresFileType(contentSourceTypeID);

        // For entity sources, resolve the entity record ID from the EntityRecordDocument
        let entityRecordID: string | null = null;
        let entityName: string | null = null;
        if (!requiresContentType) {
            const source = this.contentSourcesRaw.find(s => UUIDsEqual(s['ID'] as string, rawItem['ContentSourceID'] as string));
            if (source) {
                const entityID = source['EntityID'] as string | null;
                if (entityID) {
                    const md = this.ProviderToUse;
                    const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
                    entityName = entityInfo?.Name ?? null;
                    // Get RecordID from the EntityRecordDocument linked to this content item
                    const erdID = rawItem['EntityRecordDocumentID'] as string | null;
                    if (erdID) {
                        const erd = this.entityRecordDocCache.get(NormalizeUUID(erdID));
                        entityRecordID = erd ?? null;
                    }
                }
            }
        }

        const statuses = this.inferPipelineStatuses(rawItem, tagCount);
        this.SelectedFeedItem = {
            ID: itemId,
            Name: feed.Name,
            SourceName: feed.SourceName,
            SourceTypeName: (rawItem['ContentSourceType'] as string) ?? 'Unknown',
            ContentTypeName: (rawItem['ContentType'] as string) ?? 'Unknown',
            FileTypeName: (rawItem['ContentFileType'] as string) ?? '',
            URL: (rawItem['URL'] as string) ?? '',
            TextContent: (rawItem['Text'] as string) ?? '',
            Checksum: (rawItem['Checksum'] as string) ?? '',
            Tags: allTags,
            CreatedAt: this.formatDate((rawItem['__mj_CreatedAt'] as string) ?? ''),
            UpdatedAt: this.formatDate((rawItem['__mj_UpdatedAt'] as string) ?? ''),
            ContentSourceID: (rawItem['ContentSourceID'] as string) ?? '',
            ContentSourceTypeID: contentSourceTypeID,
            StatusDot: feed.Status,
            TagCount: tagCount,
            RequiresContentType: requiresContentType,
            EntityRecordID: entityRecordID,
            EntityName: entityName,
            EmbeddingStatus: statuses.EmbeddingStatus,
            TaggingStatus: statuses.TaggingStatus,
        };
        this.ShowItemDetail = true;
        this.cdr.detectChanges();
    }

    public OpenContentItemDetail(item: ContentItemDetail): void {
        this.SelectedFeedItem = item;
        this.ShowItemDetail = true;
        this.cdr.detectChanges();
    }

    /** Open content item detail slide-in by content item ID (used from tag drill-down) */
    public OpenItemDetailByID(contentItemID: string): void {
        const rawIndex = this.contentItemsRaw.findIndex(i => UUIDsEqual(i['ID'] as string, contentItemID));
        if (rawIndex < 0) return;

        const rawItem = this.contentItemsRaw[rawIndex];
        const itemId = rawItem['ID'] as string;
        const allTags = this.getAllWeightedTagsForItem(itemId);
        const contentSourceTypeID = (rawItem['ContentSourceTypeID'] as string) ?? '';
        const requiresContentType = this.sourceTypeRequiresFileType(contentSourceTypeID);

        let entityRecordID: string | null = null;
        let entityName: string | null = null;
        if (!requiresContentType) {
            const source = this.contentSourcesRaw.find(s => UUIDsEqual(s['ID'] as string, rawItem['ContentSourceID'] as string));
            if (source) {
                const entityID = source['EntityID'] as string | null;
                if (entityID) {
                    const md = this.ProviderToUse;
                    const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
                    entityName = entityInfo?.Name ?? null;
                    const erdID = rawItem['EntityRecordDocumentID'] as string | null;
                    if (erdID) {
                        entityRecordID = this.entityRecordDocCache.get(NormalizeUUID(erdID)) ?? null;
                    }
                }
            }
        }

        const statuses2 = this.inferPipelineStatuses(rawItem, allTags.length);
        this.SelectedFeedItem = {
            ID: itemId,
            Name: (rawItem['Name'] as string) ?? 'Unnamed',
            SourceName: (rawItem['ContentSource'] as string) ?? 'Unknown',
            SourceTypeName: (rawItem['ContentSourceType'] as string) ?? 'Unknown',
            ContentTypeName: (rawItem['ContentType'] as string) ?? 'Unknown',
            FileTypeName: (rawItem['ContentFileType'] as string) ?? '',
            URL: (rawItem['URL'] as string) ?? '',
            TextContent: (rawItem['Text'] as string) ?? '',
            Checksum: (rawItem['Checksum'] as string) ?? '',
            Tags: allTags,
            CreatedAt: this.formatDate((rawItem['__mj_CreatedAt'] as string) ?? ''),
            UpdatedAt: this.formatDate((rawItem['__mj_UpdatedAt'] as string) ?? ''),
            ContentSourceID: (rawItem['ContentSourceID'] as string) ?? '',
            ContentSourceTypeID: contentSourceTypeID,
            StatusDot: allTags.length > 0 ? 'complete' : 'processing',
            TagCount: allTags.length,
            RequiresContentType: requiresContentType,
            EntityRecordID: entityRecordID,
            EntityName: entityName,
            EmbeddingStatus: statuses2.EmbeddingStatus,
            TaggingStatus: statuses2.TaggingStatus,
        };
        this.ShowItemDetail = true;
        this.cdr.detectChanges();
    }

    public CloseItemDetail(): void {
        this.ShowItemDetail = false;
        this.SelectedFeedItem = null;
        this.cdr.detectChanges();
    }

    public OpenRecordFromItem(item: ContentItemDetail): void {
        const md = this.ProviderToUse;
        const pkey = new CompositeKey();

        // For entity sources: navigate to the actual entity record, not the ContentItem
        if (item.EntityName && item.EntityRecordID) {
            const entityInfo = md.Entities.find(e => e.Name === item.EntityName);
            if (entityInfo) {
                pkey.LoadFromURLSegment(entityInfo, item.EntityRecordID);
            } else {
                pkey.KeyValuePairs = [{ FieldName: 'ID', Value: item.EntityRecordID }];
            }
            this.navigationService.OpenEntityRecord(item.EntityName, pkey);
        } else {
            // For non-entity sources: open the ContentItem record
            pkey.KeyValuePairs = [{ FieldName: 'ID', Value: item.ID }];
            this.navigationService.OpenEntityRecord('MJ: Content Items', pkey);
        }
    }

    /** Cache: EntityRecordDocument ID → RecordID */
    private entityRecordDocCache = new Map<string, string>();

    /** Load ERD RecordIDs for entity-sourced content items */
    private async loadEntityRecordDocCache(): Promise<void> {
        if (this.entityRecordDocCache.size > 0) return;
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string; RecordID: string }>({
            EntityName: 'MJ: Entity Record Documents',
            ResultType: 'simple',
            Fields: ['ID', 'RecordID'],
        });
        if (result.Success) {
            for (const erd of result.Results) {
                this.entityRecordDocCache.set(NormalizeUUID(erd.ID), erd.RecordID);
            }
        }
    }

    private getAllWeightedTagsForItem(itemId: string): WeightedTag[] {
        const tags: WeightedTag[] = [];
        for (const tag of this.contentTagsRaw) {
            if (UUIDsEqual(tag['ItemID'] as string, itemId)) {
                tags.push({
                    Tag: tag['Tag'] as string,
                    Weight: Number(tag['Weight'] ?? 1),
                });
            }
        }
        return tags.sort((a, b) => b.Weight - a.Weight);
    }

    /**
     * D4: Infer embedding and tagging pipeline statuses for a content item.
     * Uses tag count and run history heuristics since dedicated status columns
     * are not yet available on the ContentItem entity.
     */
    private inferPipelineStatuses(
        rawItem: Record<string, unknown>,
        tagCount: number
    ): { EmbeddingStatus: ItemPipelineStatus; TaggingStatus: ItemPipelineStatus } {
        const explicitEmbedding = rawItem['EmbeddingStatus'] as string | undefined;
        const explicitTagging = rawItem['TaggingStatus'] as string | undefined;
        if (explicitEmbedding || explicitTagging) {
            return {
                EmbeddingStatus: this.mapStatusString(explicitEmbedding),
                TaggingStatus: this.mapStatusString(explicitTagging),
            };
        }

        const hasChecksum = !!(rawItem['Checksum'] as string);
        const hasText = !!((rawItem['Text'] as string)?.trim());
        const sourceID = rawItem['ContentSourceID'] as string;
        const lastRun = this.contentRunsRaw.find(r => r['SourceID'] as string === sourceID);
        const lastRunFailed = lastRun &&
            ((lastRun['Status'] as string)?.toLowerCase() === 'error' ||
             (lastRun['Status'] as string)?.toLowerCase() === 'failed');

        let embeddingStatus: ItemPipelineStatus = 'Pending';
        if (hasChecksum || hasText) embeddingStatus = 'Complete';
        else if (lastRunFailed) embeddingStatus = 'Failed';

        let taggingStatus: ItemPipelineStatus = 'Pending';
        if (tagCount > 0) taggingStatus = 'Complete';
        else if (embeddingStatus === 'Complete') taggingStatus = lastRunFailed ? 'Failed' : 'Pending';
        else if (lastRunFailed) taggingStatus = 'Failed';

        return { EmbeddingStatus: embeddingStatus, TaggingStatus: taggingStatus };
    }

    /** Map a raw status string to the ItemPipelineStatus union */
    private mapStatusString(status: string | undefined): ItemPipelineStatus {
        if (!status) return 'Pending';
        const lower = status.toLowerCase();
        if (lower === 'complete' || lower === 'completed' || lower === 'done') return 'Complete';
        if (lower === 'processing' || lower === 'running') return 'Processing';
        if (lower === 'failed' || lower === 'error') return 'Failed';
        return 'Pending';
    }

    // ════════════════════════════════════════════
    // DETAIL PANELS — Source Detail
    // ════════════════════════════════════════════

    public async OpenSourceDetail(card: SourceCard): Promise<void> {
        this.SourceDetailLoading = true;
        this.SourceDetailPage = 0;
        this.SourceDetailStatusFilter = 'All';
        this.ShowSourceDetail = true;
        this.cdr.detectChanges();

        try {
            const sourceItems = await this.loadContentItemsForSource(card.ID);
            const sourceRuns = await this.loadRunHistoryForSource(card.ID);

            const embeddingModelName = this.resolveEmbeddingModelName(card.EmbeddingModelID);
            const vectorIndexName = this.resolveVectorIndexName(card.VectorIndexID);
            const errorCount = sourceRuns.filter(r => r.StatusClass === 'failed').length;

            this.SelectedSource = {
                ID: card.ID,
                Name: card.Name,
                SourceTypeName: card.SourceTypeName,
                FileTypeName: card.FileTypeName,
                ContentTypeName: card.ContentTypeName,
                RequiresFileType: card.RequiresFileType,
                StatusClass: card.StatusClass,
                StatusLabel: card.StatusLabel,
                Icon: card.Icon,
                URL: card.URL,
                EmbeddingModelName: embeddingModelName,
                VectorIndexName: vectorIndexName,
                ItemCount: card.ItemCount,
                TagCount: card.TagCount,
                AvgTags: card.AvgTags,
                LastRunAgo: card.LastRunAgo,
                ErrorCount: errorCount,
                ContentItems: sourceItems,
                RunHistory: sourceRuns
            };
        } catch (error) {
            console.error('[Autotagging] Error loading source detail:', error);
        } finally {
            this.SourceDetailLoading = false;
            this.cdr.detectChanges();
        }
    }

    public CloseSourceDetail(): void {
        this.ShowSourceDetail = false;
        this.SelectedSource = null;
        this.cdr.detectChanges();
    }

    public OpenRecordFromSource(source: SourceDetailInfo): void {
        const pkey = new CompositeKey();
        pkey.KeyValuePairs = [{ FieldName: 'ID', Value: source.ID }];
        this.navigationService.OpenEntityRecord('MJ: Content Sources', pkey);
    }

    public OpenEditSourceFromDetail(): void {
        if (!this.SelectedSource) return;
        const card = this.SourceCards.find(c => UUIDsEqual(c.ID, this.SelectedSource!.ID));
        if (card) {
            this.CloseSourceDetail();
            this.OpenEditSourceForm(card);
        }
    }

    public async RunSourceFromDetail(): Promise<void> {
        this.CloseSourceDetail();
        await this.RunPipeline();
    }

    public async DeleteSourceFromDetail(): Promise<void> {
        if (!this.SelectedSource) return;
        const card = this.SourceCards.find(c => UUIDsEqual(c.ID, this.SelectedSource!.ID));
        if (card) {
            this.CloseSourceDetail();
            await this.DeleteSource(card);
        }
    }

    private async loadContentItemsForSource(sourceId: string): Promise<ContentItemDetail[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID='${sourceId}'`,
            OrderBy: '__mj_UpdatedAt DESC',
            MaxRows: 100,
            ResultType: 'simple'
        });

        if (!result.Success) return [];

        const tagsByItem = this.countTagsByItem();
        return result.Results.map(item => {
            const itemId = item['ID'] as string;
            const allTags = this.getAllWeightedTagsForItem(itemId);
            const tagCount = tagsByItem.get(itemId) ?? allTags.length;
            const contentSourceTypeID = (item['ContentSourceTypeID'] as string) ?? '';
            const itemStatuses = this.inferPipelineStatuses(item, tagCount);
            return {
                ID: itemId,
                Name: (item['Name'] as string) ?? 'Unnamed',
                SourceName: (item['ContentSource'] as string) ?? '',
                SourceTypeName: (item['ContentSourceType'] as string) ?? '',
                ContentTypeName: (item['ContentType'] as string) ?? '',
                FileTypeName: (item['ContentFileType'] as string) ?? '',
                URL: (item['URL'] as string) ?? '',
                TextContent: (item['Text'] as string) ?? '',
                Checksum: (item['Checksum'] as string) ?? '',
                Tags: allTags,
                CreatedAt: this.formatDate((item['__mj_CreatedAt'] as string) ?? ''),
                UpdatedAt: this.formatDate((item['__mj_UpdatedAt'] as string) ?? ''),
                ContentSourceID: sourceId,
                ContentSourceTypeID: contentSourceTypeID,
                StatusDot: tagCount > 0 ? 'complete' : 'processing',
                TagCount: tagCount,
                RequiresContentType: this.sourceTypeRequiresFileType(contentSourceTypeID),
                EntityRecordID: this.resolveEntityRecordID(item, sourceId),
                EntityName: this.resolveEntityName(sourceId),
                EmbeddingStatus: itemStatuses.EmbeddingStatus,
                TaggingStatus: itemStatuses.TaggingStatus,
            };
        });
    }

    private async loadRunHistoryForSource(sourceId: string): Promise<RunHistoryRow[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: 'MJ: Content Process Runs',
            ExtraFilter: `SourceID='${sourceId}'`,
            OrderBy: 'StartTime DESC',
            MaxRows: 10,
            ResultType: 'simple'
        });

        if (!result.Success) return [];

        return result.Results.map(run => {
            const status = (run['Status'] as string) ?? 'Unknown';
            const startTime = run['StartTime'] as string | null;
            const endTime = run['EndTime'] as string | null;
            const duration = this.computeDuration(startTime, endTime);
            const processedItems = run['ProcessedItems'] as number | null;
            const errorCount = run['ErrorCount'] as number | null;
            const statusLower = status.toLowerCase();
            const isFailed = statusLower === 'error' || statusLower === 'failed';
            const isRunning = statusLower === 'running' || statusLower === 'processing';
            const hasErrors = (errorCount ?? 0) > 0;

            return {
                ID: run['ID'] as string,
                Status: this.displayStatus(status),
                StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
                SourceName: (run['Source'] as string) ?? 'Unknown',
                StartedDisplay: startTime ? this.formatDate(startTime) : '\u2014',
                Duration: duration,
                Items: processedItems != null ? this.formatNumber(processedItems) : '\u2014',
                Tags: '\u2014',
                Errors: hasErrors ? this.formatNumber(errorCount!) : (isFailed ? status : '0'),
                ErrorClass: isFailed || hasErrors ? 'run-error-text' : ''
            };
        });
    }

    private resolveEmbeddingModelName(modelId: string): string {
        if (!modelId) return 'System default';
        const aiEngine = AIEngineBase.Instance;
        const model = aiEngine.Models.find(m => UUIDsEqual(m.ID, modelId));
        return model ? model.Name : 'Unknown';
    }

    private resolveVectorIndexName(indexId: string): string {
        if (!indexId) return 'System default';
        const engine = KnowledgeHubMetadataEngine.Instance;
        const idx = engine.GetVectorIndexById(indexId);
        return idx ? idx.Name : 'Unknown';
    }

    // ════════════════════════════════════════════
    // TAXONOMY GOVERNANCE TAB
    // ════════════════════════════════════════════

    /** Taxonomy sub-tabs as `TabConfig[]` for `<mj-tab-nav>`. Counts on
     *  Duplicates and Orphans surface as warning/error-variant badges. */
    public get taxSubTabsConfig(): TabConfig[] {
        return [
            { key: 'tree',       label: 'Tree View',  icon: 'fa-solid fa-sitemap' },
            { key: 'duplicates', label: 'Duplicates', icon: 'fa-solid fa-link',
              badge: this.TaxDuplicates.length > 0 ? this.TaxDuplicates.length : null,
              badgeVariant: 'warning' },
            { key: 'orphans',    label: 'Orphans',    icon: 'fa-solid fa-ban',
              badge: this.TaxOrphans.length > 0 ? this.TaxOrphans.length : null,
              badgeVariant: 'error' },
            { key: 'treemap',    label: 'Treemap',    icon: 'fa-solid fa-chart-tree-map' },
            { key: 'audit',      label: 'Audit Log',  icon: 'fa-solid fa-scroll' }
        ];
    }

    /** Adapter for `<mj-tab-nav>`'s string-typed `(TabChange)` output. */
    public onTaxSubTabChange(key: string): void {
        if (key === 'tree' || key === 'duplicates' || key === 'orphans' || key === 'treemap' || key === 'audit') {
            this.SwitchTaxSubTab(key);
        }
    }

    public SwitchTaxSubTab(sub: TaxonomySubTab): void {
        this.TaxSubTab = sub;
        this.cdr.detectChanges();
    }

    /**
     * Loads all data needed by the Taxonomy Governance sub-tabs:
     * Tags, Tagged Items, Tag Audit Logs, and cross-references content item tags.
     */
    private async loadTaxonomyData(): Promise<void> {
        try {
            // Tags come from the TagEngineBase cache (browser-safe BaseEngine that
            // caches MJ: Tags and stays fresh via BaseEntity save/delete events) —
            // no need to RunView them here. Only tagged-items + audit logs are fetched.
            await TagEngineBase.Instance.Config(false, undefined, this.ProviderToUse);

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [taggedItemsResult, auditResult] = await rv.RunViews([
                { EntityName: 'MJ: Tagged Items', ResultType: 'simple' },
                { EntityName: 'MJ: Tag Audit Logs', OrderBy: '__mj_CreatedAt DESC', MaxRows: 200, ResultType: 'simple' }
            ]);

            this.tagsRaw = TagEngineBase.Instance.Tags
                .map(t => t.GetAll())
                .sort((a, b) => String(a['Name'] ?? '').localeCompare(String(b['Name'] ?? '')));
            this.taggedItemsRaw = taggedItemsResult.Success ? taggedItemsResult.Results : [];
            this.tagAuditLogsRaw = auditResult.Success ? auditResult.Results : [];

            // Also ensure content item tags are loaded for cross-referencing
            await this.ensureBaseDataLoaded();

            // Load per-tag aggregates (weights + counts) via server-side SQL
            await this.loadTagAggregates();

            this.buildTaxTree();
            // Duplicates + Orphans are now server-driven from MJ:Tag Suggestions
            // (populated by TagHealthJob). The legacy client-side detectors
            // are no longer invoked here; the data flows in via
            // `populateDuplicatesFromSuggestions()` /
            // `populateOrphansFromSuggestions()` after `loadSuggestions()`.
            this.buildTaxTreemap();
            this.buildTaxAuditLog();
            this.buildTaxHealth();
            this.populateDuplicatesFromSuggestions();
            this.populateOrphansFromSuggestions();
        } catch (error) {
            console.error('[Autotagging] Error loading taxonomy data:', error);
        }
    }

    /**
     * Server-driven replacement for buildTaxDuplicates(). Reads pending
     * `MJ:Tag Suggestions` rows with `Reason='MergeCandidate'` and projects
     * each into the `TaxDuplicatePair` shape the existing Duplicates sub-tab
     * UI expects. The UI's "Merge" button still calls `MergeTags()` (which
     * we now route through the server-side `PromoteTagSuggestion` mutation
     * via the wrapper below).
     */
    private populateDuplicatesFromSuggestions(): void {
        const merges = this.SuggestionRows.filter(s => s.Reason === 'MergeCandidate' && s.BestMatchTagID);
        const pairs: TaxDuplicatePair[] = merges.map(s => {
            const score = s.BestMatchScore ?? 0;
            return {
                TagA: s.ProposedName,
                TagB: s.BestMatchName ?? '',
                TagAID: s.ID,            // suggestion ID; we route through it
                TagBID: s.BestMatchTagID!,
                Similarity: Math.round(score * 100),
                SeverityClass: score >= 0.85 ? 'high' : 'moderate',
                IsExactDuplicate: false,
                ExactDuplicateCount: 0,
                AllIDs: [],
            };
        });
        pairs.sort((a, b) => b.Similarity - a.Similarity);
        this.TaxDuplicates = pairs;
    }

    /**
     * Server-driven replacement for buildTaxOrphans(). Reads pending
     * `MJ:Tag Suggestions` with `Reason='LowUsage'` and projects each into
     * the `TaxOrphanCard` shape. The existing Orphans UI's bulk-delete
     * actions still hit `MJ:Tags.Delete()` directly — those go through the
     * server-side `MJTagEntityServer` Delete override (which cleans up FK
     * references) so the workflow is unchanged.
     */
    private populateOrphansFromSuggestions(): void {
        const lows = this.SuggestionRows.filter(s => s.Reason === 'LowUsage' && s.BestMatchTagID);
        this.TaxOrphans = lows.map(s => {
            const tag = this.tagsRaw.find(t => UUIDsEqual(t['ID'] as string, s.BestMatchTagID!));
            return {
                ID: s.BestMatchTagID!,
                Name: tag ? (tag['Name'] as string) : s.ProposedName,
                UsageCount: this.tagAggregateCounts.get(NormalizeUUID(s.BestMatchTagID!)) ?? 0,
                AvgWeight: this.tagAggregateWeights.get(NormalizeUUID(s.BestMatchTagID!)) ?? 0,
                FirstSeen: tag ? this.formatShortDate((tag['__mj_CreatedAt'] as string) ?? '') : '',
                LastSeen:  tag ? this.formatShortDate((tag['__mj_UpdatedAt'] as string) ?? '') : '',
                IsSelected: false,
            };
        });
    }

    // ── Tree View ──

    /**
     * Builds the taxonomy tree from raw tag data, wiring up parent-child
     * relationships and attaching item counts and average weights.
     */
    private buildTaxTree(): void {
        const tagMap = new Map<string, TaxTreeNode>();
        const tagItemCounts = this.tagAggregateCounts;
        const tagAvgWeights = this.tagAggregateWeights;

        // Create flat node list from raw tags (exclude merged/soft-deleted tags)
        const activeTags = this.tagsRaw.filter(t => (t['Status'] as string)?.toLowerCase() !== 'merged');
        for (const tag of activeTags) {
            const id = tag['ID'] as string;
            const normalizedId = NormalizeUUID(id);
            const name = (tag['Name'] as string) ?? 'Unnamed';
            const itemCount = tagItemCounts.get(normalizedId) ?? 0;
            const avgWeight = tagAvgWeights.get(normalizedId) ?? 0;

            tagMap.set(normalizedId, {
                ID: id,
                Name: name,
                DisplayName: (tag['DisplayName'] as string) ?? name,
                Description: (tag['Description'] as string) ?? '',
                ParentID: (tag['ParentID'] as string) ?? null,
                Depth: 0,
                Children: [],
                ItemCount: itemCount,
                AvgWeight: avgWeight,
                HealthColor: this.computeTagHealth(itemCount, avgWeight),
                IsExpanded: false,
                IsSelected: false,
                FirstSeen: this.formatShortDate((tag['__mj_CreatedAt'] as string) ?? '')
            });
        }

        // Build parent-child relationships
        const roots: TaxTreeNode[] = [];
        for (const node of tagMap.values()) {
            const normalizedParent = node.ParentID ? NormalizeUUID(node.ParentID) : null;
            if (normalizedParent && tagMap.has(normalizedParent)) {
                tagMap.get(normalizedParent)!.Children.push(node);
            } else {
                roots.push(node);
            }
        }

        // Compute depths and aggregate child counts
        this.computeTreeDepths(roots, 0);
        this.propagateItemCounts(roots);

        // Sort children alphabetically
        this.sortTreeNodes(roots);

        // Expand top two levels by default
        for (const root of roots) {
            root.IsExpanded = true;
            for (const child of root.Children) {
                child.IsExpanded = true;
            }
        }

        this.TaxTreeNodes = roots;
        this.TaxFlatNodes = this.flattenTree(roots);
        this.TaxFilteredNodes = this.TaxFlatNodes;

        // Select first node if available
        if (this.TaxFlatNodes.length > 0) {
            this.SelectTaxNode(this.TaxFlatNodes[0]);
        }
    }

    private computeTreeDepths(nodes: TaxTreeNode[], depth: number): void {
        for (const node of nodes) {
            node.Depth = depth;
            this.computeTreeDepths(node.Children, depth + 1);
        }
    }

    private propagateItemCounts(nodes: TaxTreeNode[]): number {
        let total = 0;
        for (const node of nodes) {
            const childCount = this.propagateItemCounts(node.Children);
            node.ItemCount = node.ItemCount + childCount;
            total += node.ItemCount;
        }
        return total;
    }

    private sortTreeNodes(nodes: TaxTreeNode[]): void {
        nodes.sort((a, b) => a.Name.localeCompare(b.Name));
        for (const node of nodes) {
            this.sortTreeNodes(node.Children);
        }
    }

    private flattenTree(nodes: TaxTreeNode[]): TaxTreeNode[] {
        const result: TaxTreeNode[] = [];
        for (const node of nodes) {
            result.push(node);
            if (node.IsExpanded && node.Children.length > 0) {
                result.push(...this.flattenTree(node.Children));
            }
        }
        return result;
    }

    private computeTagHealth(itemCount: number, avgWeight: number): 'green' | 'yellow' | 'red' {
        if (itemCount === 0) return 'red';
        if (itemCount <= 2 || avgWeight < 0.3) return 'yellow';
        return 'green';
    }

    /**
     * Counts the number of items referencing each tag, combining both
     * Tagged Items and Content Item Tags. Uses NormalizeUUID for
     * cross-platform UUID case consistency.
     */
    private countItemsByTag(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const ti of this.taggedItemsRaw) {
            const tagId = ti['TagID'] as string;
            if (tagId) {
                const key = NormalizeUUID(tagId);
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
        // Also count from content item tags that reference TagID
        for (const cit of this.contentTagsRaw) {
            const tagId = cit['TagID'] as string;
            if (tagId) {
                const key = NormalizeUUID(tagId);
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
        return counts;
    }

    /**
     * Loads per-tag average weights and item counts via a server-side SQL aggregation.
     * This avoids loading all 17K+ TaggedItem rows to the browser.
     */
    /**
     * Loads per-tag average weights and item counts via the "Tag Aggregates" saved query.
     * This runs a SQL GROUP BY on the server, avoiding loading 17K+ TaggedItem rows to the browser.
     */
    private async loadTagAggregates(): Promise<void> {
        this.tagAggregateWeights.clear();
        this.tagAggregateCounts.clear();
        try {
            const rq = new RunQuery();
            const result = await rq.RunQuery({
                QueryName: 'Tag Aggregates',
                CategoryPath: '/MJ/Tags'
            });
            if (result.Success) {
                for (const row of result.Results) {
                    const tagId = row['TagID'] as string;
                    if (tagId) {
                        const key = NormalizeUUID(tagId);
                        this.tagAggregateWeights.set(key, Number(row['AvgWeight'] ?? 0));
                        this.tagAggregateCounts.set(key, Number(row['ItemCount'] ?? 0));
                    }
                }
            }
        } catch (error) {
            console.error('[Autotagging] Error loading tag aggregates:', error);
        }
    }

    public ToggleTaxNode(node: TaxTreeNode): void {
        if (node.Children.length > 0) {
            node.IsExpanded = !node.IsExpanded;
            this.TaxFlatNodes = this.flattenTree(this.TaxTreeNodes);
            this.applyTaxTreeFilter();
            this.cdr.detectChanges();
        }
    }

    public SelectTaxNode(node: TaxTreeNode): void {
        // Deselect previous
        for (const n of this.TaxFlatNodes) {
            n.IsSelected = false;
        }
        node.IsSelected = true;
        this.TaxSelectedNode = node;
        this.TaxIsEditing = false;
        this.loadRecentItemsForTag(node);
        // Hydrate the governance/scope/synonyms detail underneath the existing tree-node detail.
        this.syncSelectedTagFull(node);
        this.cdr.detectChanges();
    }

    /**
     * MJTagEntity backing the currently-selected TaxTreeNode. Exposed for the
     * governance / scope / synonyms detail panel that lives below the existing
     * Tree right-side detail. Populated by `syncSelectedTagFull` whenever the
     * tree selection changes.
     */
    public SelectedTagFull: MJTagEntity | null = null;

    private syncSelectedTagFull(node: TaxTreeNode): void {
        // Look up the entity from the cached `tagsRaw`. tagsRaw rows are
        // plain JSON (loaded via RunView simple ResultType), so we need the
        // raw fields directly — we don't load a full MJTagEntity here to
        // avoid an extra DB round-trip per click. The fields we read on the
        // template (IsGlobal, AllowAutoGrow, etc.) are all present in the
        // raw row from the `vwTags` view.
        const raw = this.tagsRaw.find(t => UUIDsEqual(t['ID'] as string, node.ID));
        if (!raw) {
            this.SelectedTagFull = null;
            this.SelectedTagSynonyms = [];
            this.SelectedTagScopes = [];
            return;
        }
        // Cast through unknown so the template can use typed properties on raw fields.
        this.SelectedTagFull = raw as unknown as MJTagEntity;

        // Synonyms — query view is fine here since the cardinality per tag is small.
        this.SelectedTagSynonyms = [];
        this.SelectedTagScopes = [];
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        rv.RunViews([
            { EntityName: 'MJ: Tag Synonyms', ExtraFilter: `TagID='${node.ID}'`, ResultType: 'simple' },
            { EntityName: 'MJ: Tag Scopes', ExtraFilter: `TagID='${node.ID}'`, ResultType: 'simple' },
        ]).then(([synRes, scopeRes]) => {
            if (synRes.Success) {
                this.SelectedTagSynonyms = (synRes.Results as Array<Record<string, unknown>>).map(r => ({
                    ID: r['ID'] as string,
                    Synonym: r['Synonym'] as string,
                    Source: r['Source'] as string,
                    CreatedAt: new Date(r['__mj_CreatedAt'] as string),
                }));
            }
            if (scopeRes.Success) {
                this.SelectedTagScopes = (scopeRes.Results as Array<Record<string, unknown>>).map(r => ({
                    ID: r['ID'] as string,
                    ScopeEntityID: r['ScopeEntityID'] as string,
                    ScopeRecordID: r['ScopeRecordID'] as string,
                    EntityName: (r['ScopeEntity'] as string) ?? 'Unknown entity',
                    DisplayName: r['ScopeRecordID'] as string,
                }));
            }
            this.cdr.detectChanges();
        });
    }

    public IsGlobalLocked(): boolean {
        return this.SelectedTagFull != null && this.SelectedTagScopes.length > 0;
    }

    /**
     * Toggle a per-tag governance flag. Persists via a fresh MJTagEntity load
     * + Save so the server-side `MJTagEntityServer` Save() override can run
     * the IsGlobal⊕TagScope invariant check.
     */
    public async ToggleGovernanceFlag(
        field: 'AllowAutoGrow' | 'IsFrozen' | 'RequiresReview' | 'IsGlobal'
    ): Promise<void> {
        if (!this.SelectedTagFull || !this.TaxSelectedNode) return;
        if (field === 'IsGlobal' && this.IsGlobalLocked()) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Cannot toggle Global while scope rows exist. Remove all scope rows first or use Edit scope…',
                'warning', 5000
            );
            return;
        }
        const currentValue = (this.SelectedTagFull as unknown as Record<string, unknown>)[field] as boolean;
        await this.persistTagField(this.TaxSelectedNode.ID, field, !currentValue);
    }

    public async SaveSelectedTagNumber(
        field: 'MaxChildren' | 'MaxDescendantDepth' | 'MinWeight',
        raw: string
    ): Promise<void> {
        if (!this.TaxSelectedNode) return;
        const trimmed = raw.trim();
        const value: number | null = trimmed === '' ? null : Number(trimmed);
        if (value !== null && !Number.isFinite(value)) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `"${raw}" is not a valid number for ${field}.`, 'error', 4000
            );
            return;
        }
        await this.persistTagField(this.TaxSelectedNode.ID, field, value);
    }

    private async persistTagField(tagID: string, field: keyof MJTagEntity, value: unknown): Promise<void> {
        this.SelectedTagSavingField[field as string] = true;
        this.cdr.detectChanges();
        try {
            const md = this.ProviderToUse;
            const fresh = await md.GetEntityObject<MJTagEntity>('MJ: Tags', md.CurrentUser);
            const loaded = await fresh.Load(tagID);
            if (!loaded) throw new Error(`Failed to load tag ${tagID}`);
            (fresh as unknown as Record<string, unknown>)[field as string] = value;
            const ok = await fresh.Save();
            if (!ok) throw new Error(fresh.LatestResult?.CompleteMessage ?? 'Save failed');
            // Mirror back into the cached tagsRaw row so the toggles reflect immediately.
            const raw = this.tagsRaw.find(t => UUIDsEqual(t['ID'] as string, tagID));
            if (raw) (raw as Record<string, unknown>)[field as string] = value;
            if (this.SelectedTagFull) {
                (this.SelectedTagFull as unknown as Record<string, unknown>)[field as string] = value;
            }
            MJNotificationService.Instance.CreateSimpleNotification(
                `Saved ${String(field)} on "${this.TaxSelectedNode?.Name}".`,
                'info', 1800
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Failed to save ${String(field)}: ${msg}`, 'error', 5000
            );
        } finally {
            this.SelectedTagSavingField[field as string] = false;
            this.cdr.detectChanges();
        }
    }

    /** Inline synonym add. Server-side TagSynonymEntity Save handles uniqueness. */
    public async AddSynonym(): Promise<void> {
        const text = this.NewSynonymName.trim();
        if (!text || !this.TaxSelectedNode) return;
        if (this.SelectedTagSynonyms.some(s => s.Synonym.toLowerCase() === text.toLowerCase())) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `"${text}" is already a synonym for this tag.`, 'warning', 3000
            );
            return;
        }
        try {
            const md = this.ProviderToUse;
            const syn = await md.GetEntityObject<MJTagSynonymEntity>('MJ: Tag Synonyms', md.CurrentUser);
            syn.NewRecord();
            syn.TagID = this.TaxSelectedNode.ID;
            syn.Synonym = text;
            syn.Source = this.NewSynonymSource;
            const ok = await syn.Save();
            if (!ok) throw new Error(syn.LatestResult?.CompleteMessage ?? 'Save failed');
            this.SelectedTagSynonyms = [
                ...this.SelectedTagSynonyms,
                { ID: syn.ID, Synonym: syn.Synonym, Source: syn.Source, CreatedAt: new Date() }
            ];
            this.NewSynonymName = '';
            MJNotificationService.Instance.CreateSimpleNotification(
                `Added synonym "${text}".`, 'info', 2000
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Failed to add synonym: ${msg}`, 'error', 5000
            );
        } finally {
            this.cdr.detectChanges();
        }
    }

    public async RemoveSynonym(row: SynonymRow): Promise<void> {
        if (!this.TaxSelectedNode) return;
        if (!confirm(`Remove synonym "${row.Synonym}"?`)) return;
        try {
            const md = this.ProviderToUse;
            const syn = await md.GetEntityObject<MJTagSynonymEntity>('MJ: Tag Synonyms', md.CurrentUser);
            const loaded = await syn.Load(row.ID);
            if (!loaded) throw new Error('Synonym not found.');
            const ok = await syn.Delete();
            if (!ok) throw new Error(syn.LatestResult?.CompleteMessage ?? 'Delete failed');
            this.SelectedTagSynonyms = this.SelectedTagSynonyms.filter(s => !UUIDsEqual(s.ID, row.ID));
            MJNotificationService.Instance.CreateSimpleNotification(
                `Removed synonym "${row.Synonym}".`, 'info', 1800
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Failed to remove synonym: ${msg}`, 'error', 5000
            );
        } finally {
            this.cdr.detectChanges();
        }
    }

    /**
     * Open the scope dialog. Implementation note: a full dual-pane scope
     * editor is on the roadmap; for the first pass we surface a simple
     * "remove all scope rows + flip to global" button so admins can promote
     * a scoped tag to global, plus a notification pointing them to the
     * Suggestions/admin path for finer-grained scope assignments.
     */
    public async OpenScopeDialog(): Promise<void> {
        if (!this.TaxSelectedNode || !this.SelectedTagFull) return;
        // Phase-1 minimal implementation: confirm + clear + flip global.
        // Full dual-pane editor (entity picker, parent-subset validation,
        // batch save) lives in the standalone TagGovernance dashboard and
        // will be folded in on the next iteration of this dashboard.
        if (this.SelectedTagScopes.length === 0 && !this.SelectedTagFull.IsGlobal) {
            // Empty scope + non-global = currently unreachable. Promote to global.
            if (!confirm('This tag has no scope rows and is not global — it is currently unreachable. Promote to global?')) return;
            await this.persistTagField(this.TaxSelectedNode.ID, 'IsGlobal', true);
            return;
        }
        if (this.SelectedTagScopes.length > 0) {
            if (!confirm(`Remove all ${this.SelectedTagScopes.length} scope row(s) and promote to global? This makes the tag visible to all tenants.`)) return;
            try {
                const md = this.ProviderToUse;
                for (const sc of this.SelectedTagScopes) {
                    const row = await md.GetEntityObject<MJTagScopeEntity>('MJ: Tag Scopes', md.CurrentUser);
                    const loaded = await row.Load(sc.ID);
                    if (loaded) await row.Delete();
                }
                this.SelectedTagScopes = [];
                await this.persistTagField(this.TaxSelectedNode.ID, 'IsGlobal', true);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Tag promoted to global.', 'info', 2500
                );
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to promote: ${msg}`, 'error', 5000
                );
            }
            return;
        }
        MJNotificationService.Instance.CreateSimpleNotification(
            'Tag is already global.', 'info', 2200
        );
    }

    public FilterTaxTree(): void {
        this.applyTaxTreeFilter();
        this.cdr.detectChanges();
    }

    private applyTaxTreeFilter(): void {
        const q = this.TaxTreeSearch.toLowerCase().trim();
        if (!q) {
            this.TaxFilteredNodes = this.TaxFlatNodes;
        } else {
            this.TaxFilteredNodes = this.TaxFlatNodes.filter(n =>
                n.Name.toLowerCase().includes(q) || n.DisplayName.toLowerCase().includes(q)
            );
        }
    }

    public GetTaxBreadcrumb(node: TaxTreeNode): { ID: string; Name: string }[] {
        const breadcrumb: { ID: string; Name: string }[] = [];
        const tagMap = new Map<string, Record<string, unknown>>();
        for (const t of this.tagsRaw) {
            tagMap.set(t['ID'] as string, t);
        }

        let currentID: string | null = node.ParentID;
        while (currentID) {
            const parent = tagMap.get(currentID);
            if (!parent) break;
            breadcrumb.unshift({ ID: currentID, Name: (parent['Name'] as string) ?? '' });
            currentID = (parent['ParentID'] as string) ?? null;
        }
        return breadcrumb;
    }

    public NavigateToBreadcrumb(tagId: string): void {
        const node = this.TaxFlatNodes.find(n => UUIDsEqual(n.ID, tagId));
        if (node) {
            this.SelectTaxNode(node);
        }
    }

    private loadRecentItemsForTag(node: TaxTreeNode): void {
        // Find content item tags that reference this tag's ID.
        // Use the 'Item' view field (ContentItem name) directly from the tag record
        // instead of looking up from the capped contentItemsRaw array.
        const matchingTags = this.contentTagsRaw.filter(cit =>
            UUIDsEqual(cit['TagID'] as string, node.ID)
        ).slice(0, 5);

        this.TaxRecentItems = matchingTags.map(cit => ({
            Name: (cit['Item'] as string) ?? 'Unnamed Item',
            Weight: Number(cit['Weight'] ?? 0.5),
            Date: this.formatShortDate((cit['__mj_CreatedAt'] as string) ?? ''),
            Icon: 'fa-solid fa-file-lines'
        }));
    }

    // ── Tag Operations ──

    public StartEditTag(): void {
        if (!this.TaxSelectedNode) return;
        this.TaxIsEditing = true;
        this.TaxEditName = this.TaxSelectedNode.Name;
        this.TaxEditDescription = this.TaxSelectedNode.Description;
        this.cdr.detectChanges();
    }

    public CancelEditTag(): void {
        this.TaxIsEditing = false;
        this.cdr.detectChanges();
    }

    public async SaveEditTag(): Promise<void> {
        if (!this.TaxSelectedNode) return;
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
            await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.TaxSelectedNode.ID }]));
            entity.Set('Name', this.TaxEditName);
            entity.Set('Description', this.TaxEditDescription);
            const saved = await entity.Save();
            if (saved) {
                this.TaxSelectedNode.Name = this.TaxEditName;
                this.TaxSelectedNode.DisplayName = this.TaxEditName;
                this.TaxSelectedNode.Description = this.TaxEditDescription;
                this.TaxIsEditing = false;
                this.addTaxAuditEntry('renamed', this.TaxEditName);
                MJNotificationService.Instance.CreateSimpleNotification('Tag updated', 'success', 2500);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to update tag', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
        this.cdr.detectChanges();
    }

    public async MoveTag(node: TaxTreeNode, newParentId: string | null): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
            await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: node.ID }]));
            entity.Set('ParentID', newParentId);
            const saved = await entity.Save();
            if (saved) {
                this.addTaxAuditEntry('moved', node.Name);
                MJNotificationService.Instance.CreateSimpleNotification('Tag moved', 'success', 2500);
                await this.RefreshTaxonomyData();
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    public DeleteTag(node: TaxTreeNode): void {
        this.OpenConfirmDialog(
            'Delete Tag',
            `Delete tag "${node.Name}"? This will also remove all tagged item associations.`,
            async () => {
                try {
                    const md = this.ProviderToUse;
                    const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                    await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: node.ID }]));
                    const deleted = await entity.Delete();
                    if (deleted) {
                        this.addTaxAuditEntry('deleted', node.Name);
                        MJNotificationService.Instance.CreateSimpleNotification('Tag deleted', 'success', 2500);
                        await this.RefreshTaxonomyData();
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
                }
            }
        );
    }

    // ── Create Tag ──

    /** Open create tag dialog for a root-level tag */
    public OpenCreateRootTag(): void {
        this.CreateTagParentID = null;
        this.CreateTagParentLabel = 'Root level';
        this.CreateTagName = '';
        this.CreateTagDescription = '';
        this.ShowCreateTagDialog = true;
        this.cdr.detectChanges();
    }

    /** Open create tag dialog as child of the selected node */
    public OpenCreateChildTag(): void {
        if (!this.TaxSelectedNode) return;
        this.OpenCreateChildTagFor(this.TaxSelectedNode);
    }

    /** Open create tag dialog as child of a specific node */
    public OpenCreateChildTagFor(node: TaxTreeNode): void {
        this.CreateTagParentID = node.ID;
        this.CreateTagParentLabel = `under "${node.Name}"`;
        this.CreateTagName = '';
        this.CreateTagDescription = '';
        this.ShowCreateTagDialog = true;
        this.cdr.detectChanges();
    }

    /** Close create tag dialog */
    public CloseCreateTagDialog(): void {
        this.ShowCreateTagDialog = false;
        this.cdr.detectChanges();
    }

    /** Save the new tag */
    public async SaveNewTag(): Promise<void> {
        const name = this.CreateTagName.trim();
        if (!name) return;

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
            entity.NewRecord();
            entity.Set('Name', name);
            entity.Set('DisplayName', name);
            entity.Set('Description', this.CreateTagDescription.trim() || null);
            entity.Set('ParentID', this.CreateTagParentID);
            const saved = await entity.Save();
            if (saved) {
                this.addTaxAuditEntry('created', name);
                MJNotificationService.Instance.CreateSimpleNotification(`Tag "${name}" created`, 'success', 2500);
                this.ShowCreateTagDialog = false;
                await this.RefreshTaxonomyData();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to save tag', 'error', 4000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    // ── Multi-Select & Drag Reparent ──

    /** Toggle multi-select mode on/off */
    public ToggleMultiSelectMode(): void {
        this.TaxMultiSelectMode = !this.TaxMultiSelectMode;
        if (!this.TaxMultiSelectMode) {
            this.TaxSelectedIDs.clear();
        }
        this.cdr.detectChanges();
    }

    /** Toggle a node's selection in multi-select mode */
    public ToggleNodeSelection(node: TaxTreeNode, event: Event): void {
        event.stopPropagation();
        if (this.TaxSelectedIDs.has(node.ID)) {
            this.TaxSelectedIDs.delete(node.ID);
        } else {
            this.TaxSelectedIDs.add(node.ID);
        }
        this.cdr.detectChanges();
    }

    /** Check if a node is selected in multi-select mode */
    public IsNodeMultiSelected(nodeID: string): boolean {
        return this.TaxSelectedIDs.has(nodeID);
    }

    /** Handle drag start on a tree node */
    public OnTreeNodeDragStart(event: DragEvent, node: TaxTreeNode): void {
        if (!event.dataTransfer) return;
        // If dragging a multi-selected node, drag all selected; otherwise just this one
        const dragIDs = this.TaxMultiSelectMode && this.TaxSelectedIDs.has(node.ID)
            ? [...this.TaxSelectedIDs]
            : [node.ID];
        event.dataTransfer.setData('text/plain', JSON.stringify(dragIDs));
        event.dataTransfer.effectAllowed = 'move';
    }

    /** Handle drag over a tree node (drop target) */
    public OnTreeNodeDragOver(event: DragEvent, node: TaxTreeNode): void {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        this.TaxDragOverNodeID = node.ID;
    }

    /** Handle drag leave */
    public OnTreeNodeDragLeave(): void {
        this.TaxDragOverNodeID = null;
    }

    /** Handle drop — reparent dragged node(s) under the drop target */
    public async OnTreeNodeDrop(event: DragEvent, targetNode: TaxTreeNode): Promise<void> {
        event.preventDefault();
        this.TaxDragOverNodeID = null;

        const data = event.dataTransfer?.getData('text/plain');
        if (!data) return;

        let dragIDs: string[];
        try { dragIDs = JSON.parse(data); } catch { return; }

        // Prevent dropping onto itself or a descendant
        const targetDescendants = this.collectDescendantIds(targetNode);
        const validIDs = dragIDs.filter(id =>
            !UUIDsEqual(id, targetNode.ID) && !targetDescendants.has(NormalizeUUID(id))
        );

        if (validIDs.length === 0) return;

        this.TaxTreeSaving = true;
        this.cdr.detectChanges();

        const md = this.ProviderToUse;
        let movedCount = 0;
        for (const tagID of validIDs) {
            try {
                const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: tagID }]));
                entity.Set('ParentID', targetNode.ID);
                const saved = await entity.Save();
                if (saved) movedCount++;
            } catch {
                // continue with remaining
            }
        }

        if (movedCount > 0) {
            const label = movedCount === 1 ? '1 tag' : `${movedCount} tags`;
            MJNotificationService.Instance.CreateSimpleNotification(`Moved ${label} under "${targetNode.Name}"`, 'success', 2500);
            this.addTaxAuditEntry('moved', `${movedCount} tag(s) → ${targetNode.Name}`);
            this.TaxSelectedIDs.clear();
            await this.RefreshTaxonomyData();
        }

        this.TaxTreeSaving = false;
        this.cdr.detectChanges();
    }

    /** Handle drop on the "Root" drop zone (make root-level) */
    public async OnDropToRoot(event: DragEvent): Promise<void> {
        event.preventDefault();
        this.TaxDragOverNodeID = null;

        const data = event.dataTransfer?.getData('text/plain');
        if (!data) return;

        let dragIDs: string[];
        try { dragIDs = JSON.parse(data); } catch { return; }

        this.TaxTreeSaving = true;
        this.cdr.detectChanges();

        const md = this.ProviderToUse;
        let movedCount = 0;
        for (const tagID of dragIDs) {
            try {
                const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: tagID }]));
                if (entity.Get('ParentID') != null) {
                    entity.Set('ParentID', null);
                    const saved = await entity.Save();
                    if (saved) movedCount++;
                }
            } catch {
                // continue
            }
        }

        if (movedCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(`Moved ${movedCount} tag(s) to root`, 'success', 2500);
            this.addTaxAuditEntry('moved', `${movedCount} tag(s) → root`);
            this.TaxSelectedIDs.clear();
            await this.RefreshTaxonomyData();
        }

        this.TaxTreeSaving = false;
        this.cdr.detectChanges();
    }

    public IsMerging = false;

    public async MergeTags(sourceTagId: string, targetTagId: string, sourceName: string, targetName: string): Promise<void> {
        if (this.IsMerging) return; // Prevent duplicate calls from button spam
        this.IsMerging = true;
        this.cdr.detectChanges();

        try {
            // Re-parent tagged items from source to target
            const itemsToMove = this.taggedItemsRaw.filter(ti => (ti['TagID'] as string) === sourceTagId);
            const md = this.ProviderToUse;
            for (const ti of itemsToMove) {
                const entity = await md.GetEntityObject<BaseEntity>('MJ: Tagged Items');
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: ti['ID'] as string }]));
                entity.Set('TagID', targetTagId);
                await entity.Save();
            }

            // Re-parent children of source under target
            const childTags = this.tagsRaw.filter(t => (t['ParentID'] as string) === sourceTagId);
            for (const child of childTags) {
                const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: child['ID'] as string }]));
                entity.Set('ParentID', targetTagId);
                await entity.Save();
            }

            // Clean up co-occurrence records before delete (FK constraint)
            await this.cleanupTagReferences(sourceTagId);

            // Delete source tag (original behavior — hard delete)
            const sourceEntity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
            await sourceEntity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: sourceTagId }]));
            await sourceEntity.Delete();

            this.addTaxAuditEntry('merged', `${sourceName} into ${targetName}`);
            MJNotificationService.Instance.CreateSimpleNotification(`Merged "${sourceName}" into "${targetName}"`, 'success', 3000);
            await this.RefreshTaxonomyData();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Merge error: ${msg}`, 'error', 4000);
        } finally {
            this.IsMerging = false;
            this.cdr.detectChanges();
        }
    }

    public async MakeChildTag(childTagId: string, parentTagId: string): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
            await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: childTagId }]));
            entity.Set('ParentID', parentTagId);
            const saved = await entity.Save();
            if (saved) {
                this.addTaxAuditEntry('moved', (entity.Get('Name') as string) ?? 'tag');
                MJNotificationService.Instance.CreateSimpleNotification('Tag reparented', 'success', 2500);
                await this.RefreshTaxonomyData();
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    public DismissDuplicate(pair: TaxDuplicatePair): void {
        this.TaxDuplicates = this.TaxDuplicates.filter(d => d !== pair);
        this.TaxHealth.Duplicates = this.TaxDuplicates.length;
        this.cdr.detectChanges();
    }

    // ── Duplicates ──

    private buildTaxDuplicates(): void {
        const tags = this.tagsRaw
            .filter(t => (t['Status'] as string)?.toLowerCase() !== 'merged')
            .map(t => ({
                ID: t['ID'] as string,
                Name: (t['Name'] as string) ?? ''
            }));

        const pairs: TaxDuplicatePair[] = [];

        // 1. Group exact-name duplicates (case-insensitive) into single entries
        const exactGroups = this.groupExactNameDuplicates(tags);
        const consumedIDs = new Set<string>();

        for (const [, group] of exactGroups) {
            if (group.length < 2) continue;
            // Emit one consolidated entry per group of exact-name duplicates
            pairs.push({
                TagA: group[0].Name,
                TagB: group[0].Name,
                TagAID: group[0].ID,
                TagBID: group[1].ID,
                Similarity: 100,
                SeverityClass: 'high',
                IsExactDuplicate: true,
                ExactDuplicateCount: group.length,
                AllIDs: group.map(t => t.ID)
            });
            for (const t of group) consumedIDs.add(t.ID);
        }

        // 2. Fuzzy/similar pairs — skip any tags already covered by exact-name groups
        for (let i = 0; i < tags.length; i++) {
            if (consumedIDs.has(tags[i].ID)) continue;
            for (let j = i + 1; j < tags.length; j++) {
                if (consumedIDs.has(tags[j].ID)) continue;
                const sim = this.computeStringSimilarity(tags[i].Name, tags[j].Name);
                if (sim >= 0.70) {
                    pairs.push({
                        TagA: tags[i].Name,
                        TagB: tags[j].Name,
                        TagAID: tags[i].ID,
                        TagBID: tags[j].ID,
                        Similarity: Math.round(sim * 100),
                        SeverityClass: sim >= 0.85 ? 'high' : 'moderate',
                        IsExactDuplicate: false,
                        ExactDuplicateCount: 0,
                        AllIDs: []
                    });
                }
            }
        }

        pairs.sort((a, b) => b.Similarity - a.Similarity);
        this.TaxDuplicates = pairs;
    }

    /** Group tags by case-insensitive name, returning only groups with 2+ members */
    private groupExactNameDuplicates(tags: { ID: string; Name: string }[]): Map<string, { ID: string; Name: string }[]> {
        const groups = new Map<string, { ID: string; Name: string }[]>();
        for (const tag of tags) {
            const key = tag.Name.toLowerCase().trim();
            const group = groups.get(key);
            if (group) {
                group.push(tag);
            } else {
                groups.set(key, [tag]);
            }
        }
        return groups;
    }

    /**
     * Enhanced string similarity: separator normalization, abbreviation,
     * pluralization, token-overlap Jaccard, containment, and Levenshtein.
     * Returns the highest score among all heuristics.
     */
    private computeStringSimilarity(a: string, b: string): number {
        const la = a.toLowerCase().trim();
        const lb = b.toLowerCase().trim();
        if (la === lb) return 1.0;

        // Strip separators and compare
        const normA = la.replace(/[\s\-_&]+/g, '');
        const normB = lb.replace(/[\s\-_&]+/g, '');
        if (normA === normB) return 0.98;

        let best = 0;

        // Abbreviation
        if (this.isAbbreviationOf(la, lb) || this.isAbbreviationOf(lb, la)) {
            best = Math.max(best, 0.90);
        }

        // Pluralization
        best = Math.max(best, this.computePluralizationScore(la, lb));

        // Token Jaccard
        best = Math.max(best, this.computeTokenJaccardSimilarity(la, lb));

        // Containment
        if (lb.includes(la) || la.includes(lb)) {
            const shorter = la.length < lb.length ? la : lb;
            const longer = la.length < lb.length ? lb : la;
            best = Math.max(best, shorter.length / longer.length);
        }

        // Levenshtein
        const dist = this.levenshteinDistance(la, lb);
        const maxLen = Math.max(la.length, lb.length);
        if (maxLen > 0) {
            best = Math.max(best, 1 - dist / maxLen);
        }

        return best;
    }

    /** Scores simple English pluralization differences */
    private computePluralizationScore(a: string, b: string): number {
        const shorter = a.length <= b.length ? a : b;
        const longer = a.length <= b.length ? b : a;
        if (longer === shorter + 's') return 0.95;
        if (longer === shorter + 'es') return 0.95;
        if (shorter.endsWith('y') && longer === shorter.slice(0, -1) + 'ies') return 0.95;
        return 0;
    }

    /** Jaccard similarity on word tokens */
    private computeTokenJaccardSimilarity(a: string, b: string): number {
        const tokensA = new Set(a.split(/[\s\-_&]+/).filter(w => w.length > 0));
        const tokensB = new Set(b.split(/[\s\-_&]+/).filter(w => w.length > 0));
        if (tokensA.size === 0 || tokensB.size === 0) return 0;
        let intersection = 0;
        for (const token of tokensA) {
            if (tokensB.has(token)) intersection++;
        }
        const union = tokensA.size + tokensB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }

    private isAbbreviationOf(short: string, long: string): boolean {
        if (short.length >= long.length) return false;
        if (short.length < 2) return false;

        // Check if short is initials of words in long
        const words = long.split(/[\s\-_&]+/).filter(w => w.length > 0);
        if (words.length < 2) return false;
        const initials = words.map(w => w[0]).join('');
        return initials === short;
    }

    private levenshteinDistance(a: string, b: string): number {
        const m = a.length;
        const n = b.length;
        const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    // ── Orphans ──

    /**
     * Finds orphan tags: no parent, no children, and zero usage.
     * A tag with even 1 connection is not orphaned — it's just a leaf.
     * Uses NormalizeUUID for consistent cross-platform UUID comparisons.
     */
    private buildTaxOrphans(): void {
        const tagItemCounts = this.tagAggregateCounts;
        const tagAvgWeights = this.tagAggregateWeights;
        const hasChildren = new Set<string>();
        for (const t of this.tagsRaw) {
            const pid = t['ParentID'] as string;
            if (pid) hasChildren.add(NormalizeUUID(pid));
        }

        this.TaxOrphans = this.tagsRaw
            .filter(t => {
                const normalizedId = NormalizeUUID(t['ID'] as string);
                const parentId = t['ParentID'] as string | null;
                const status = (t['Status'] as string)?.toLowerCase();
                const itemCount = tagItemCounts.get(normalizedId) ?? 0;
                // Skip merged tags — they're soft-deleted
                if (status === 'merged') return false;
                // Orphan: no parent, no children, and zero connections
                return !parentId && !hasChildren.has(normalizedId) && itemCount === 0;
            })
            .map(t => {
                const id = t['ID'] as string;
                const normalizedId = NormalizeUUID(id);
                const itemCount = tagItemCounts.get(normalizedId) ?? 0;
                return {
                    ID: id,
                    Name: (t['Name'] as string) ?? 'Unnamed',
                    UsageCount: itemCount,
                    AvgWeight: tagAvgWeights.get(normalizedId) ?? 0,
                    FirstSeen: this.formatShortDate((t['__mj_CreatedAt'] as string) ?? ''),
                    LastSeen: this.formatShortDate((t['__mj_UpdatedAt'] as string) ?? ''),
                    IsSelected: false
                };
            })
            .sort((a, b) => a.UsageCount - b.UsageCount);
    }

    public ToggleOrphanSelection(orphan: TaxOrphanCard): void {
        orphan.IsSelected = !orphan.IsSelected;
        this.TaxAllOrphansSelected = this.TaxOrphans.every(o => o.IsSelected);
        this.cdr.detectChanges();
    }

    public ToggleAllOrphans(): void {
        this.TaxAllOrphansSelected = !this.TaxAllOrphansSelected;
        for (const o of this.TaxOrphans) {
            o.IsSelected = this.TaxAllOrphansSelected;
        }
        this.cdr.detectChanges();
    }

    /**
     * Clean up TagCoOccurrence records that reference a tag before deleting it.
     * Without this, the FK constraint on TagCoOccurrence blocks the delete.
     */
    private async cleanupTagReferences(tagId: string): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const coOccResult = await rv.RunView<BaseEntity>({
            EntityName: 'MJ: Tag Co Occurrences',
            ExtraFilter: `TagAID='${tagId}' OR TagBID='${tagId}'`,
            ResultType: 'entity_object'
        });
        if (coOccResult.Success) {
            for (const coOcc of coOccResult.Results) {
                await coOcc.Delete();
            }
        }
    }

    public DeleteOrphan(orphan: TaxOrphanCard): void {
        this.OpenConfirmDialog(
            'Delete Orphan Tag',
            `Delete orphan tag "${orphan.Name}"?`,
            async () => {
                try {
                    await this.cleanupTagReferences(orphan.ID);
                    const md = this.ProviderToUse;
                    const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                    await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: orphan.ID }]));
                    const deleted = await entity.Delete();
                    if (deleted) {
                        this.addTaxAuditEntry('deleted', orphan.Name);
                        MJNotificationService.Instance.CreateSimpleNotification('Orphan tag deleted', 'success', 2500);
                        this.TaxOrphans = this.TaxOrphans.filter(o => !UUIDsEqual(o.ID, orphan.ID));
                        this.TaxHealth.Orphaned = this.TaxOrphans.length;
                        this.cdr.detectChanges();
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
                }
            }
        );
    }

    public BulkDeleteOrphans(): void {
        const selected = this.TaxOrphans.filter(o => o.IsSelected);
        if (selected.length === 0) return;

        this.OpenConfirmDialog(
            'Bulk Delete Orphan Tags',
            `Delete ${selected.length} selected orphan tag${selected.length > 1 ? 's' : ''}? This cannot be undone.`,
            async () => {
                const md = this.ProviderToUse;
                let deletedCount = 0;
                for (const orphan of selected) {
                    try {
                        await this.cleanupTagReferences(orphan.ID);
                        const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                        await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: orphan.ID }]));
                        if (await entity.Delete()) {
                            deletedCount++;
                            this.addTaxAuditEntry('deleted', orphan.Name);
                        }
                    } catch {
                        // continue with remaining
                    }
                }

                MJNotificationService.Instance.CreateSimpleNotification(`Deleted ${deletedCount} tags`, 'success', 3000);
                this.TaxOrphans = this.TaxOrphans.filter(o => !o.IsSelected);
                this.TaxHealth.Orphaned = this.TaxOrphans.length;
                this.TaxAllOrphansSelected = false;
                this.cdr.detectChanges();
            }
        );
    }

    /** Delete all orphan tags at once with a styled confirmation dialog */
    public DeleteAllOrphans(): void {
        if (this.TaxOrphans.length === 0) return;
        this.OpenConfirmDialog(
            'Delete All Orphaned Tags',
            `Delete all ${this.TaxOrphans.length} orphaned tag${this.TaxOrphans.length > 1 ? 's' : ''}? This cannot be undone.`,
            async () => {
                const md = this.ProviderToUse;
                let deletedCount = 0;
                for (const orphan of this.TaxOrphans) {
                    try {
                        const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                        await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: orphan.ID }]));
                        if (await entity.Delete()) {
                            deletedCount++;
                            this.addTaxAuditEntry('deleted', orphan.Name);
                        }
                    } catch {
                        // continue with remaining
                    }
                }

                MJNotificationService.Instance.CreateSimpleNotification(`Deleted ${deletedCount} orphan tags`, 'success', 3000);
                this.TaxOrphans = [];
                this.TaxHealth.Orphaned = 0;
                this.TaxAllOrphansSelected = false;
                this.cdr.detectChanges();
            }
        );
    }

    // ── Treemap ──

    private buildTaxTreemap(): void {
        // Build treemap cells from root-level tags, sized by item count
        const tagItemCounts = this.countItemsByTag();

        // Group tags by root parent
        const rootGroups = new Map<string, { Name: string; TotalItems: number }>();
        for (const node of this.TaxTreeNodes) {
            rootGroups.set(node.ID, { Name: node.Name, TotalItems: node.ItemCount });
        }

        const colorFamilies = ['at-tm-blue', 'at-tm-green', 'at-tm-purple', 'at-tm-orange'];
        const cells: TaxTreemapCell[] = [];
        let colorIdx = 0;

        // For each root, add children as cells
        for (const root of this.TaxTreeNodes) {
            const family = colorFamilies[colorIdx % colorFamilies.length];
            let shadeIdx = 1;

            // Add root children (or the root itself if it has no children)
            const childNodes = root.Children.length > 0 ? root.Children : [root];
            const sortedChildren = [...childNodes].sort((a, b) => b.ItemCount - a.ItemCount);

            for (const child of sortedChildren.slice(0, 4)) {
                cells.push({
                    ID: child.ID,
                    Name: child.Name,
                    ItemCount: child.ItemCount,
                    ColorClass: `${family}-${shadeIdx}`,
                    RowSpan: child.ItemCount > 10 ? 2 : 1
                });
                shadeIdx++;
            }
            colorIdx++;
        }

        this.TaxTreemapCells = cells;

        // KPIs
        const totalTags = this.tagsRaw.length;
        const maxDepth = this.TaxFlatNodes.length > 0
            ? Math.max(...this.TaxFlatNodes.map(n => n.Depth))
            : 0;
        const avgDepth = this.TaxFlatNodes.length > 0
            ? (this.TaxFlatNodes.reduce((sum, n) => sum + n.Depth, 0) / this.TaxFlatNodes.length).toFixed(1)
            : '0';
        const mostUsed = this.TaxFlatNodes.length > 0
            ? [...this.TaxFlatNodes].sort((a, b) => b.ItemCount - a.ItemCount)[0]?.Name ?? 'None'
            : 'None';

        this.TaxTreemapKPIs = [
            { Label: 'Total Tags', Value: String(totalTags) },
            { Label: 'Avg Depth', Value: avgDepth },
            { Label: 'Max Depth', Value: String(maxDepth) },
            { Label: 'Most Used Tag', Value: mostUsed }
        ];
    }

    // ── Audit Log ──

    /**
     * Builds the audit timeline from the MJ: Tag Audit Logs entity.
     * Falls back to synthesizing "created" events from tag creation dates
     * if no real audit log records exist yet.
     */
    private buildTaxAuditLog(): void {
        if (this.tagAuditLogsRaw.length > 0) {
            this.TaxAuditEvents = this.buildAuditEventsFromLogs();
        } else {
            this.TaxAuditEvents = this.synthesizeAuditEventsFromTags();
        }
    }

    /**
     * Maps real Tag Audit Log records into TaxAuditEvent objects.
     * Uses the view's denormalized Tag, PerformedByUser, and RelatedTag fields.
     */
    private buildAuditEventsFromLogs(): TaxAuditEvent[] {
        const events: TaxAuditEvent[] = [];

        for (const log of this.tagAuditLogsRaw) {
            const action = (log['Action'] as string) ?? '';
            const type = this.mapAuditActionToType(action);
            if (!type) continue;

            const tagName = (log['Tag'] as string) ?? 'Unknown';
            const relatedTag = (log['RelatedTag'] as string) ?? '';
            const user = (log['PerformedByUser'] as string) ?? 'System';
            const createdAt = (log['__mj_CreatedAt'] as string) ?? '';
            const details = this.parseAuditDetails(log['Details'] as string | null);

            events.push({
                Type: type,
                Description: this.buildAuditDescription(type, tagName, relatedTag, details),
                TagRef: tagName,
                User: user,
                Timestamp: this.formatDate(createdAt),
                DayHeader: this.formatDayHeader(createdAt)
            });
        }

        return events;
    }

    /**
     * Synthesizes audit events from tag __mj_CreatedAt dates when no
     * real audit log records exist. Used as a fallback only.
     */
    private synthesizeAuditEventsFromTags(): TaxAuditEvent[] {
        const events: TaxAuditEvent[] = [];
        for (const tag of this.tagsRaw) {
            const name = (tag['Name'] as string) ?? 'Unnamed';
            const createdAt = tag['__mj_CreatedAt'] as string;
            if (createdAt) {
                events.push({
                    Type: 'created',
                    Description: 'Tag created',
                    TagRef: name,
                    User: 'System',
                    Timestamp: this.formatDate(createdAt),
                    DayHeader: this.formatDayHeader(createdAt)
                });
            }
        }
        events.sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
        return events.slice(0, 50);
    }

    /**
     * Maps a PascalCase DB Action value (e.g. "Renamed") to the lowercase
     * TaxAuditAction type used in the UI. Returns null for unrecognized values.
     */
    private mapAuditActionToType(action: string): TaxAuditAction | null {
        const mapped = action.toLowerCase() as TaxAuditAction;
        const validTypes: Set<string> = new Set<string>([
            'created', 'merged', 'moved', 'deleted', 'renamed',
            'deprecated', 'descriptionchanged', 'reactivated', 'split'
        ]);
        return validTypes.has(mapped) ? mapped : null;
    }

    /**
     * Safely parses the JSON Details column from a Tag Audit Log record.
     * Returns an empty object on parse failure.
     */
    private parseAuditDetails(details: string | null): Record<string, string> {
        if (!details) return {};
        try {
            return JSON.parse(details) as Record<string, string>;
        } catch {
            return {};
        }
    }

    /**
     * Builds a human-readable description for an audit event based on the
     * action type and any additional context from the related tag or details JSON.
     */
    private buildAuditDescription(type: TaxAuditAction, tagName: string, relatedTag: string, details: Record<string, string>): string {
        switch (type) {
            case 'created':
                return 'Tag created';
            case 'renamed': {
                const oldName = details['OldName'];
                return oldName ? `Renamed from "${oldName}"` : 'Tag renamed';
            }
            case 'moved': {
                return 'Tag moved to new parent';
            }
            case 'merged':
                return relatedTag ? `Merged into "${relatedTag}"` : 'Tags merged';
            case 'split':
                return relatedTag ? `Split from "${relatedTag}"` : 'Tag split';
            case 'deleted':
                return 'Tag deleted';
            case 'deprecated':
                return 'Tag deprecated';
            case 'reactivated':
                return 'Tag reactivated';
            case 'descriptionchanged':
                return 'Description updated';
            default:
                return `Tag ${type}`;
        }
    }

    /**
     * Adds a local-only audit entry to the top of the timeline for
     * immediate UI feedback after a user action (merge, delete, etc.).
     */
    private addTaxAuditEntry(type: TaxAuditAction, tagRef: string): void {
        const now = new Date().toISOString();
        this.TaxAuditEvents.unshift({
            Type: type,
            Description: this.buildAuditDescription(type, tagRef, '', {}),
            TagRef: tagRef,
            User: 'You',
            Timestamp: this.formatDate(now),
            DayHeader: 'Today'
        });
    }

    public ToggleTaxAuditFilter(type: string): void {
        if (this.TaxAuditFilterTypes.has(type)) {
            this.TaxAuditFilterTypes.delete(type);
        } else {
            this.TaxAuditFilterTypes.add(type);
        }
        this.cdr.detectChanges();
    }

    public GetFilteredAuditEvents(): TaxAuditEvent[] {
        return this.TaxAuditEvents.filter(e => this.TaxAuditFilterTypes.has(e.Type));
    }

    private formatDayHeader(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (d.toDateString() === today.toDateString()) return 'Today';
            if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
            return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        } catch {
            return '';
        }
    }

    // ── Health Stats ──

    private buildTaxHealth(): void {
        const total = this.tagsRaw.length;
        const orphaned = this.TaxOrphans.length;
        const duplicates = this.TaxDuplicates.length;
        const needAttention = this.TaxFlatNodes.filter(n => n.HealthColor === 'yellow').length;
        const healthy = total - orphaned - needAttention;

        this.TaxHealth = { Total: total, Healthy: Math.max(0, healthy), NeedAttention: needAttention, Orphaned: orphaned, Duplicates: duplicates };
    }

    /** Returns the Font Awesome icon class for an audit event action type. */
    public GetTaxAuditIcon(type: string): string {
        const map: Record<string, string> = {
            'created': 'fa-solid fa-plus',
            'merged': 'fa-solid fa-code-merge',
            'moved': 'fa-solid fa-arrows-up-down',
            'deleted': 'fa-solid fa-trash',
            'renamed': 'fa-solid fa-pen',
            'deprecated': 'fa-solid fa-ban',
            'descriptionchanged': 'fa-solid fa-file-pen',
            'reactivated': 'fa-solid fa-rotate-left',
            'split': 'fa-solid fa-code-branch'
        };
        return map[type] ?? 'fa-solid fa-circle';
    }

    // ── Confirmation Dialog ──

    /** Opens a styled confirmation dialog, replacing browser `confirm()`. */
    public OpenConfirmDialog(title: string, message: string, action: () => Promise<void>): void {
        this.ConfirmDialogTitle = title;
        this.ConfirmDialogMessage = message;
        this.confirmDialogAction = action;
        this.ShowConfirmDialog = true;
        this.cdr.detectChanges();
    }

    /** User confirmed the dialog action */
    public async ConfirmDialogAccept(): Promise<void> {
        this.ShowConfirmDialog = false;
        if (this.confirmDialogAction) {
            await this.confirmDialogAction();
        }
        this.confirmDialogAction = null;
        this.cdr.detectChanges();
    }

    /** User cancelled the confirmation dialog */
    public ConfirmDialogCancel(): void {
        this.ShowConfirmDialog = false;
        this.confirmDialogAction = null;
        this.cdr.detectChanges();
    }

    // ── Split Dialog ──

    /** Opens the split-tag dialog for a given tree node */
    public OpenSplitDialog(node: TaxTreeNode): void {
        this.splitTargetNode = node;
        this.SplitChildNames = '';
        this.ShowSplitDialog = true;
        this.cdr.detectChanges();
    }

    /** Closes the split-tag dialog without action */
    public CloseSplitDialog(): void {
        this.ShowSplitDialog = false;
        this.splitTargetNode = null;
        this.SplitChildNames = '';
        this.cdr.detectChanges();
    }

    /** Executes the split operation, creating child tags from comma-separated names */
    public async ExecuteSplit(): Promise<void> {
        if (!this.splitTargetNode || !this.SplitChildNames.trim()) return;
        const names = this.SplitChildNames.split(',')
            .map(n => n.trim())
            .filter(n => n.length > 0);
        if (names.length === 0) return;

        this.ShowSplitDialog = false;
        const nodeName = this.splitTargetNode.Name;
        const parentId = this.splitTargetNode.ParentID;

        try {
            const md = this.ProviderToUse;
            for (const name of names) {
                const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
                entity.NewRecord();
                entity.Set('Name', name);
                entity.Set('DisplayName', name);
                entity.Set('ParentID', parentId);
                await entity.Save();
            }

            this.addTaxAuditEntry('split', `${nodeName} into ${names.join(', ')}`);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Split "${nodeName}" into ${names.length} new tags`, 'success', 3000
            );
            await this.RefreshTaxonomyData();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Split error: ${msg}`, 'error', 4000);
        }
        this.splitTargetNode = null;
        this.SplitChildNames = '';
        this.cdr.detectChanges();
    }

    // ── Move Dialog ──

    /** Opens the move-tag dialog for a given tree node */
    public OpenMoveDialog(node: TaxTreeNode): void {
        this.moveTargetNode = node;
        this.MoveNewParentID = node.ParentID;
        this.ShowMoveDialog = true;
        this.cdr.detectChanges();
    }

    /** Closes the move-tag dialog without action */
    public CloseMoveDialog(): void {
        this.ShowMoveDialog = false;
        this.moveTargetNode = null;
        this.MoveNewParentID = null;
        this.cdr.detectChanges();
    }

    /** Returns flat list of tags eligible as move targets (excludes the node being moved and its descendants) */
    public GetMoveTargetOptions(): { ID: string; Name: string; Depth: number }[] {
        if (!this.moveTargetNode) return [];
        const excludeIds = this.collectDescendantIds(this.moveTargetNode);
        excludeIds.add(NormalizeUUID(this.moveTargetNode.ID));

        return this.TaxFlatNodes
            .filter(n => !excludeIds.has(NormalizeUUID(n.ID)))
            .map(n => ({ ID: n.ID, Name: n.Name, Depth: n.Depth }));
    }

    /** Collects IDs of all descendants of a node */
    private collectDescendantIds(node: TaxTreeNode): Set<string> {
        const ids = new Set<string>();
        for (const child of node.Children) {
            ids.add(NormalizeUUID(child.ID));
            for (const id of this.collectDescendantIds(child)) {
                ids.add(id);
            }
        }
        return ids;
    }

    /** Executes the move operation */
    public async ExecuteMove(): Promise<void> {
        if (!this.moveTargetNode) return;
        const newParent = this.MoveNewParentID;
        this.ShowMoveDialog = false;

        await this.MoveTag(this.moveTargetNode, newParent);
        this.moveTargetNode = null;
        this.MoveNewParentID = null;
        this.cdr.detectChanges();
    }

    // ── Merge Into Dialog ──

    public OpenMergeIntoDialog(node: TaxTreeNode): void {
        this.MergeSourceTag = node;
        this.MergeTargetID = null;
        this.MergeTargetData = this.GetMergeTargetOptions().map(o => ({
            ID: o.ID,
            Label: `${'  '.repeat(o.Depth)}${o.Name} (${o.ItemCount})`
        }));
        this.ShowMergeIntoDialog = true;
        this.cdr.detectChanges();
    }

    public OnMergeTargetSelected(value: unknown): void {
        this.MergeTargetID = value != null ? String(value) : null;
    }

    public CloseMergeIntoDialog(): void {
        this.ShowMergeIntoDialog = false;
        this.MergeSourceTag = null;
        this.MergeTargetID = null;
        this.cdr.detectChanges();
    }

    /** Returns flat list of tags eligible as merge targets (excludes the source tag) */
    public GetMergeTargetOptions(): { ID: string; Name: string; Depth: number; ItemCount: number }[] {
        if (!this.MergeSourceTag) return [];
        const sourceNormalized = NormalizeUUID(this.MergeSourceTag.ID);

        return this.TaxFlatNodes
            .filter(n => NormalizeUUID(n.ID) !== sourceNormalized)
            .map(n => ({ ID: n.ID, Name: n.Name, Depth: n.Depth, ItemCount: n.ItemCount }));
    }

    public async ExecuteMergeInto(): Promise<void> {
        if (!this.MergeSourceTag || !this.MergeTargetID) return;
        const targetNode = this.TaxFlatNodes.find(n => UUIDsEqual(n.ID, this.MergeTargetID!));
        const targetName = targetNode?.Name ?? 'Unknown';
        const sourceName = this.MergeSourceTag.Name;
        const sourceId = this.MergeSourceTag.ID;
        const targetId = this.MergeTargetID;

        this.ShowMergeIntoDialog = false;
        await this.MergeTags(sourceId, targetId, sourceName, targetName);
        this.MergeSourceTag = null;
        this.MergeTargetID = null;
    }

    // ── Treemap Drill-In ──

    /** Opens treemap drill-in panel for the given cell */
    public OpenTreemapDrillIn(cell: TaxTreemapCell): void {
        const node = this.TaxFlatNodes.find(n => UUIDsEqual(n.ID, cell.ID));
        if (node) {
            this.TreemapDrillInNode = node;
            this.ShowTreemapDrillIn = true;
            this.loadRecentItemsForTag(node);
            this.cdr.detectChanges();
        }
    }

    /** Closes treemap drill-in panel */
    public CloseTreemapDrillIn(): void {
        this.ShowTreemapDrillIn = false;
        this.TreemapDrillInNode = null;
        this.cdr.detectChanges();
    }

    /** Navigate from treemap drill-in to the tag in the tree view */
    public DrillInToTreeView(node: TaxTreeNode): void {
        this.CloseTreemapDrillIn();
        this.SwitchTaxSubTab('tree');
        this.SelectTaxNode(node);
    }

    public async RefreshTaxonomyData(): Promise<void> {
        this.tabDataLoaded.delete('taxonomy');
        await this.loadTaxonomyData();
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // CONTENT ITEM DUPLICATES (G3)
    // ════════════════════════════════════════════

    /** Load pending content item duplicates for review */
    public async LoadContentDuplicates(): Promise<void> {
        this.IsLoadingDuplicates = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<{
                ID: string; ContentItemA: string; ContentItemB: string;
                ContentItemAID: string; ContentItemBID: string;
                SimilarityScore: number; DetectionMethod: string; Status: string;
            }>({
                EntityName: 'MJ: Content Item Duplicates',
                ExtraFilter: `Status = 'Pending'`,
                OrderBy: 'SimilarityScore DESC',
                MaxRows: 100,
                ResultType: 'simple'
            });

            if (result.Success) {
                // Look up source names for items
                const itemIDs = new Set<string>();
                for (const row of result.Results) {
                    itemIDs.add(row.ContentItemAID);
                    itemIDs.add(row.ContentItemBID);
                }

                const sourceNameMap = await this.resolveItemSourceNames(Array.from(itemIDs));

                this.ContentDuplicates = result.Results.map(row => ({
                    ID: row.ID,
                    ItemAName: row.ContentItemA || 'Unknown',
                    ItemASource: sourceNameMap.get(row.ContentItemAID) ?? 'Unknown',
                    ItemBName: row.ContentItemB || 'Unknown',
                    ItemBSource: sourceNameMap.get(row.ContentItemBID) ?? 'Unknown',
                    SimilarityScore: row.SimilarityScore,
                    DetectionMethod: row.DetectionMethod,
                    Status: row.Status as ContentDuplicateRow['Status'],
                }));
            }
        } catch (error) {
            console.error('[Classify] Error loading content duplicates:', error);
        } finally {
            this.IsLoadingDuplicates = false;
            this.cdr.detectChanges();
        }
    }

    /** Resolve content source names for a list of content item IDs */
    private async resolveItemSourceNames(itemIDs: string[]): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        if (itemIDs.length === 0) return map;

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const idFilter = itemIDs.map(id => `ID='${id}'`).join(' OR ');
        const result = await rv.RunView<{ ID: string; ContentSource: string }>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `(${idFilter})`,
            Fields: ['ID', 'ContentSource'],
            ResultType: 'simple'
        });

        if (result.Success) {
            for (const row of result.Results) {
                map.set(row.ID, row.ContentSource || 'Unknown');
            }
        }
        return map;
    }

    /** Confirm a content duplicate pair */
    public async ConfirmContentDuplicate(dupRow: ContentDuplicateRow): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJContentItemDuplicateEntity>('MJ: Content Item Duplicates');
            const loaded = await entity.Load(dupRow.ID);
            if (!loaded) return;

            entity.Status = 'Confirmed';
            const saved = await entity.Save();
            if (saved) {
                this.ContentDuplicates = this.ContentDuplicates.filter(d => !UUIDsEqual(d.ID, dupRow.ID));
                MJNotificationService.Instance.CreateSimpleNotification('Duplicate confirmed', 'success', 2000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 3000);
        }
        this.cdr.detectChanges();
    }

    /** Dismiss a content duplicate pair */
    public async DismissContentDuplicate(dupRow: ContentDuplicateRow): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJContentItemDuplicateEntity>('MJ: Content Item Duplicates');
            const loaded = await entity.Load(dupRow.ID);
            if (!loaded) return;

            entity.Status = 'Dismissed';
            entity.Resolution = 'NotDuplicate';
            const saved = await entity.Save();
            if (saved) {
                this.ContentDuplicates = this.ContentDuplicates.filter(d => !UUIDsEqual(d.ID, dupRow.ID));
                MJNotificationService.Instance.CreateSimpleNotification('Duplicate dismissed', 'success', 2000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 3000);
        }
        this.cdr.detectChanges();
    }

    // ========================================================================
    // SUGGESTIONS — server-driven from MJ:Tag Suggestions
    // ========================================================================

    /** Load all pending suggestions and refresh the filtered view + nav badge. */
    public async loadSuggestions(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const sugsResult = await rv.RunView<Record<string, unknown>>({
                EntityName: 'MJ: Tag Suggestions',
                ExtraFilter: `Status='Pending'`,
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'simple',
                MaxRows: 1000,
            });
            if (!sugsResult.Success) {
                MJNotificationService.Instance.CreateSimpleNotification(`Failed to load suggestions: ${sugsResult.ErrorMessage}`, 'error', 5000);
                this.SuggestionRows = [];
            } else {
                this.SuggestionRows = sugsResult.Results.map(r => {
                    const matchID = (r['BestMatchTagID'] as string) ?? null;
                    const matchTag = matchID ? this.tagsRaw.find(t => UUIDsEqual(t['ID'] as string, matchID)) : null;
                    const matchName = matchTag ? (matchTag['Name'] as string) : null;
                    return {
                        ID: r['ID'] as string,
                        ProposedName: r['ProposedName'] as string,
                        Reason: r['Reason'] as string,
                        BestMatchTagID: matchID,
                        BestMatchName: matchName,
                        BestMatchPath: matchTag ? this.computeTagPath(matchTag) : null,
                        BestMatchScore: (r['BestMatchScore'] as number) ?? null,
                        SourceContentSourceID: (r['SourceContentSourceID'] as string) ?? null,
                        SourceContentItemID: (r['SourceContentItemID'] as string) ?? null,
                        SourceText: (r['SourceText'] as string) ?? null,
                        CreatedAt: new Date(r['__mj_CreatedAt'] as string),
                        Status: r['Status'] as string,
                        selected: false,
                        dispositionInProgress: null,
                    } as SuggestionRow;
                });
            }
            this.PendingSuggestionCount = this.SuggestionRows.length;
            this.applySuggestionFilters();
            // Refresh nav badge
            this.buildNavItems();
            this.cdr.detectChanges();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error loading suggestions: ${msg}`, 'error', 5000);
        }
    }

    /** Walk the parent chain to build a › -separated breadcrumb for a tag. */
    private computeTagPath(tag: Record<string, unknown>): string {
        const parts: string[] = [tag['Name'] as string];
        let cursorID = (tag['ParentID'] as string) ?? null;
        const guard = new Set<string>();
        while (cursorID && !guard.has(cursorID) && parts.length < 8) {
            guard.add(cursorID);
            const next = this.tagsRaw.find(t => UUIDsEqual(t['ID'] as string, cursorID!));
            if (!next) break;
            parts.unshift(next['Name'] as string);
            cursorID = (next['ParentID'] as string) ?? null;
        }
        return parts.join(' › ');
    }

    /**
     * Coerce the min-score number-input event into either a number or null,
     * then re-apply filters. Inline arrow expressions in the template can't
     * disambiguate `Event` vs `number` so we route through this helper.
     */
    public OnMinScoreChange(value: number | string | null | undefined): void {
        if (value == null || value === '' || (typeof value === 'string' && value.trim() === '')) {
            this.SuggestionFilterMinScore = null;
        } else {
            const n = typeof value === 'number' ? value : Number(value);
            this.SuggestionFilterMinScore = Number.isFinite(n) ? n : null;
        }
        this.applySuggestionFilters();
    }

    public applySuggestionFilters(): void {
        const reason = this.SuggestionFilterReason;
        const minScore = this.SuggestionFilterMinScore;
        const search = this.SuggestionSearch.trim().toLowerCase();
        this.SuggestionRowsFiltered = this.SuggestionRows.filter(r => {
            if (reason && r.Reason !== reason) return false;
            if (minScore != null && (r.BestMatchScore == null || r.BestMatchScore < minScore)) return false;
            if (search) {
                const haystack = `${r.ProposedName} ${r.BestMatchName ?? ''} ${r.SourceText ?? ''}`.toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });
        this.cdr.detectChanges();
    }

    public ToggleSuggestionSelected(row: SuggestionRow, ev: Event): void {
        ev.stopPropagation();
        row.selected = !row.selected;
        this.cdr.detectChanges();
    }

    public ToggleAllSuggestions(checked: boolean): void {
        for (const r of this.SuggestionRowsFiltered) r.selected = checked;
        this.cdr.detectChanges();
    }

    public SelectedSuggestionCount(): number {
        return this.SuggestionRowsFiltered.filter(r => r.selected).length;
    }

    public SelectSuggestion(row: SuggestionRow): void {
        this.SuggestionSelected = row;
        this.cdr.detectChanges();
    }

    public CloseDrawer(): void {
        this.SuggestionSelected = null;
        this.cdr.detectChanges();
    }

    /** Server-driven: routes through TagGovernanceResolver mutations. */
    public async DispositionSuggestion(row: SuggestionRow, kind: 'create-new' | 'merge' | 'reject'): Promise<void> {
        if (!row || row.dispositionInProgress) return;
        row.dispositionInProgress = kind;
        this.cdr.detectChanges();
        try {
            const provider = this.ProviderToUse as GraphQLDataProvider;
            if (!provider) throw new Error('No GraphQL provider available.');
            const client = new GraphQLAIClient(provider);
            if (kind === 'reject') {
                const r = await client.RejectTagSuggestion({ suggestionID: row.ID });
                if (!r.Success) throw new Error(r.ErrorMessage ?? 'reject failed');
                MJNotificationService.Instance.CreateSimpleNotification(`Rejected "${row.ProposedName}".`, 'info', 2200);
            } else {
                const r = await client.PromoteTagSuggestion({
                    suggestionID: row.ID,
                    strategy: kind === 'merge' ? 'merge-into-existing' : 'create-new',
                    targetTagID: kind === 'merge' ? row.BestMatchTagID ?? undefined : undefined,
                });
                if (!r.Success) throw new Error(r.ErrorMessage ?? 'promote failed');
                if (kind === 'merge') {
                    MJNotificationService.Instance.CreateSimpleNotification(`Merged "${row.ProposedName}" into "${r.ResolvedTagName ?? row.BestMatchName}".`, 'info', 2500);
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(`Created tag "${r.ResolvedTagName ?? row.ProposedName}".`, 'info', 2500);
                }
            }
            this.SuggestionRows = this.SuggestionRows.filter(r => !UUIDsEqual(r.ID, row.ID));
            this.PendingSuggestionCount = this.SuggestionRows.length;
            this.applySuggestionFilters();
            this.buildNavItems();
            if (this.SuggestionSelected && UUIDsEqual(this.SuggestionSelected.ID, row.ID)) this.SuggestionSelected = null;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Failed to ${kind}: ${msg}`, 'error', 6000);
        } finally {
            row.dispositionInProgress = null;
            this.cdr.detectChanges();
        }
    }

    public async BulkApprove(): Promise<void> {
        const selected = this.SuggestionRowsFiltered.filter(r => r.selected);
        if (selected.length === 0) return;
        if (!confirm(`Approve ${selected.length} suggestion(s)? Each will merge into its best match (when available) or be created as a new tag.`)) return;
        this.SuggestionBulkInProgress = true;
        for (const row of selected) {
            const kind = row.BestMatchTagID ? 'merge' : 'create-new';
            await this.DispositionSuggestion(row, kind);
        }
        this.SuggestionBulkInProgress = false;
    }

    public async BulkReject(): Promise<void> {
        const selected = this.SuggestionRowsFiltered.filter(r => r.selected);
        if (selected.length === 0) return;
        if (!confirm(`Reject ${selected.length} suggestion(s)?`)) return;
        this.SuggestionBulkInProgress = true;
        for (const row of selected) await this.DispositionSuggestion(row, 'reject');
        this.SuggestionBulkInProgress = false;
    }

    public ReasonClass(reason: string): string {
        switch (reason) {
            case 'MergeCandidate':       return 'merge';
            case 'BelowThreshold':       return 'below';
            case 'ConstrainedMode':
            case 'AmbiguousMatch':       return 'constrained';
            case 'ParentFrozen':
            case 'MaxChildrenExceeded':
            case 'MaxDepthExceeded':
            case 'BelowMinWeight':       return 'frozen';
            case 'RequiresReview':       return 'review';
            case 'LowUsage':             return 'lowusage';
            case 'WideNode':             return 'widenode';
            case 'AutoGrowDisabled':
            case 'MaxItemTagsExceeded':  return 'autogrow';
            default:                     return '';
        }
    }

    // ========================================================================
    // TAG HEALTH — wraps the server TagHealthJob via GraphQL
    // ========================================================================

    public async RunHealthNow(): Promise<void> {
        if (this.HealthRunning) return;
        this.HealthRunning = true;
        this.cdr.detectChanges();
        const activityID = this.activityService.Start('Tag health check', { icon: 'fa-solid fa-heart-pulse' });
        let healthOk = false;
        try {
            const provider = this.ProviderToUse as GraphQLDataProvider;
            if (!provider) throw new Error('No GraphQL provider available.');
            const client = new GraphQLAIClient(provider);
            const r = await client.RunTagHealth({
                minCoOccurrence: this.HealthThresholds.minCoOccurrence,
                minNameSimilarity: this.HealthThresholds.minNameSimilarity,
                minEmbeddingSimilarity: this.HealthThresholds.minEmbeddingSimilarity,
                maxUsage: this.HealthThresholds.maxUsage,
                maxImplicitChildren: this.HealthThresholds.maxImplicitChildren,
            });
            if (!r.Success) throw new Error(r.ErrorMessage ?? 'health run failed');
            this.LastHealthSummary = {
                mergeCount: r.MergeCount,
                lowUsageCount: r.LowUsageCount,
                wideNodeCount: r.WideNodeCount,
                durationMs: r.DurationMs,
                runAt: new Date(),
            };
            this.HealthRunHistory = [
                { When: new Date(), Trigger: 'Manual · UI', TagsScanned: this.tagsRaw.length, Merge: r.MergeCount, LowUsage: r.LowUsageCount, WideNode: r.WideNodeCount, DurationMs: r.DurationMs },
                ...this.HealthRunHistory,
            ].slice(0, 12);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Tag Health: ${r.MergeCount} merge / ${r.LowUsageCount} low-usage / ${r.WideNodeCount} wide-node in ${r.DurationMs}ms.`,
                'info', 4000
            );
            // Pull in the new pending suggestions so Duplicates / Orphans / Suggestions all reflect
            await this.loadSuggestions();
            healthOk = true;
            this.activityService.Complete(activityID, 'success',
                `${r.MergeCount} merge · ${r.LowUsageCount} low-usage · ${r.WideNodeCount} wide-node`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Tag Health failed: ${msg}`, 'error', 5000);
            this.activityService.Complete(activityID, 'error', msg);
        } finally {
            if (!healthOk && this.activityService.Activities.find(a => a.ID === activityID && a.Status === 'running')) {
                this.activityService.Complete(activityID, 'error');
            }
            this.HealthRunning = false;
            this.cdr.detectChanges();
        }
    }

    public async RebuildEmbeddings(): Promise<void> {
        if (this.RebuildEmbeddingsRunning) return;
        if (!confirm('Rebuild embeddings for all tags whose model doesn\'t match the configured embedding model? This can take time.')) return;
        this.RebuildEmbeddingsRunning = true;
        this.cdr.detectChanges();
        try {
            const provider = this.ProviderToUse as GraphQLDataProvider;
            if (!provider) throw new Error('No GraphQL provider available.');
            const client = new GraphQLAIClient(provider);
            const r = await client.RebuildTagEmbeddings();
            if (!r.Success) throw new Error(r.ErrorMessage ?? 'rebuild failed');
            MJNotificationService.Instance.CreateSimpleNotification(`Refreshed ${r.Refreshed}/${r.Total} tag embeddings.`, 'info', 4000);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Rebuild failed: ${msg}`, 'error', 5000);
        } finally {
            this.RebuildEmbeddingsRunning = false;
            this.cdr.detectChanges();
        }
    }
}

export function LoadTagsResource(): void {
    // Prevents tree-shaking
}

// ================================================================
// Cron-to-Human-Readable Utility
// ================================================================

/**
 * Converts a 5-part or 6-part cron expression to a human-readable English string.
 *
 * Handles common patterns:
 *   `0 * * * *`      -> "Every hour"
 *   `0 2 * * *`      -> "Daily at 2:00 AM"
 *   `0 2 * * 1`      -> "Weekly on Monday at 2:00 AM"
 *   `star/15 * * * *` -> "Every 15 minutes"  (where star = asterisk)
 *   `0 0 1 * *`      -> "Monthly on day 1 at 12:00 AM"
 *
 * Falls back to returning the raw cron string for unrecognized patterns.
 *
 * @param cron A cron expression string (5 or 6 parts)
 * @returns A human-readable description or the raw cron if unrecognized
 */
export function CronToHumanReadable(cron: string): string {
    if (!cron) return 'No schedule';

    const parts = cron.trim().split(/\s+/);
    const p = parseCronParts(parts);
    if (!p) return cron;

    return formatCronParts(p) ?? cron;
}

/** Internal cron field tuple */
interface CronFields {
    Minute: string;
    Hour: string;
    DayOfMonth: string;
    Month: string;
    DayOfWeek: string;
}

/**
 * Parses 5-part or 6-part cron expressions into normalized fields.
 * 6-part expressions have a leading seconds field that is discarded.
 */
function parseCronParts(parts: string[]): CronFields | null {
    if (parts.length === 5) {
        return { Minute: parts[0], Hour: parts[1], DayOfMonth: parts[2], Month: parts[3], DayOfWeek: parts[4] };
    }
    if (parts.length === 6) {
        return { Minute: parts[1], Hour: parts[2], DayOfMonth: parts[3], Month: parts[4], DayOfWeek: parts[5] };
    }
    return null;
}

/**
 * Attempts to map parsed cron fields to a human-readable string.
 * Returns null when the pattern is not recognized.
 */
function formatCronParts(p: CronFields): string | null {
    // Every N minutes: */N * * * *
    if (p.Minute.startsWith('*/') && p.Hour === '*' && p.DayOfMonth === '*' && p.Month === '*' && p.DayOfWeek === '*') {
        const interval = parseInt(p.Minute.slice(2), 10);
        if (interval === 1) return 'Every minute';
        return `Every ${interval} minutes`;
    }

    // Every hour at minute M: M * * * *
    if (!p.Minute.includes('*') && !p.Minute.includes('/') && p.Hour === '*' && p.DayOfMonth === '*' && p.Month === '*' && p.DayOfWeek === '*') {
        return 'Every hour';
    }

    // Every N hours: 0 */N * * *
    if (!p.Minute.includes('*') && !p.Minute.includes('/') && p.Hour.startsWith('*/') && p.DayOfMonth === '*') {
        const interval = parseInt(p.Hour.slice(2), 10);
        if (interval === 1) return 'Every hour';
        return `Every ${interval} hours`;
    }

    // Specific hour + minute with wildcard or specific day fields
    if (!p.Minute.includes('*') && !p.Minute.includes('/') &&
        !p.Hour.includes('*') && !p.Hour.includes('/') &&
        p.Month === '*') {

        const hour = parseInt(p.Hour, 10);
        const minute = parseInt(p.Minute, 10);
        const timeStr = formatTimeOfDay(hour, minute);

        // Weekly: specific day of week
        if (p.DayOfWeek !== '*' && p.DayOfMonth === '*') {
            const dayName = dayOfWeekToName(p.DayOfWeek);
            return `Weekly on ${dayName} at ${timeStr}`;
        }

        // Monthly: specific day of month
        if (p.DayOfMonth !== '*' && p.DayOfWeek === '*') {
            return `Monthly on day ${p.DayOfMonth} at ${timeStr}`;
        }

        // Daily
        if (p.DayOfMonth === '*' && p.DayOfWeek === '*') {
            return `Daily at ${timeStr}`;
        }
    }

    return null;
}

/** Formats hour and minute to 12-hour AM/PM time string */
function formatTimeOfDay(hour: number, minute: number): string {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const m = minute.toString().padStart(2, '0');
    return `${h}:${m} ${ampm}`;
}

/** Maps day-of-week cron values (0-7 or SUN-SAT) to English names */
function dayOfWeekToName(dow: string): string {
    const names: Record<string, string> = {
        '0': 'Sunday', '1': 'Monday', '2': 'Tuesday',
        '3': 'Wednesday', '4': 'Thursday', '5': 'Friday',
        '6': 'Saturday', '7': 'Sunday',
        'SUN': 'Sunday', 'MON': 'Monday', 'TUE': 'Tuesday',
        'WED': 'Wednesday', 'THU': 'Thursday', 'FRI': 'Friday',
        'SAT': 'Saturday',
    };
    return names[dow.toUpperCase()] ?? dow;
}
