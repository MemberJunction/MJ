/**
 * @fileoverview Content Autotagging Dashboard
 *
 * Full dashboard for the content autotagging pipeline with left-nav and 5 tabs:
 * Pipeline Monitor, Sources Management, Content Types, Tag Library, Run History.
 * Supports CRUD on sources and content types via slide-in forms,
 * pipeline triggering with real-time GraphQL subscription progress.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseEntity, CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TreeBranchConfig, TreeLeafConfig } from '@memberjunction/ng-trees';
import { ResourceData, KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { WordCloudItem } from '@memberjunction/ng-word-cloud';

// ── Tab type ──

type TabName = 'pipeline' | 'sources' | 'types' | 'tags' | 'history';

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
    Tags: string[];
    CreatedAt: string;
    UpdatedAt: string;
    ContentSourceID: string;
    StatusDot: 'complete' | 'processing' | 'error';
    TagCount: number;
}

interface SourceDetailInfo {
    ID: string;
    Name: string;
    SourceTypeName: string;
    FileTypeName: string;
    ContentTypeName: string;
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

@RegisterClass(BaseResourceComponent, 'AutotaggingPipelineResource')
@Component({
    standalone: false,
    selector: 'app-autotagging-pipeline-resource',
    templateUrl: './autotagging-pipeline-resource.component.html',
    styleUrls: ['./autotagging-pipeline-resource.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class AutotaggingPipelineResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private destroy$ = new Subject<void>();
    private cdr = inject(ChangeDetectorRef);
    private navigationService = inject(NavigationService);

    // ── Global state ──
    public IsLoading = true;

    // ── Tab state ──
    public ActiveTab: TabName = 'pipeline';
    private tabDataLoaded = new Set<TabName>();

    // ── Left nav ──
    public NavItems: NavItem[] = [];

    // ── Pipeline tab ──
    public KPIMetrics: KPIMetric[] = [];
    public PipelineStages: PipelineStageInfo[] = [];
    public FeedItems: FeedItem[] = [];
    public SourceMinis: SourceMini[] = [];
    public TrendingTags: TagCloudItem[] = [];

    // Pipeline run state
    public IsRunning = false;
    public RunProgress = 0;
    public RunStage = '';
    public RunCurrentItem = '';

    // ── Sources tab ──
    public SourceCards: SourceCard[] = [];

    // ── Content Types tab ──
    public ContentTypeCards: ContentTypeCard[] = [];

    // ── Tag Library tab ──
    public TagRows: TagRow[] = [];
    public TagCloud: TagCloudItem[] = [];
    public TagCloudWordItems: WordCloudItem[] = [];
    public TagsBySource: TagBySource[] = [];
    public TagSearchQuery = '';
    public FilteredTagRows: TagRow[] = [];

    // ── Run History tab ──
    public RunHistoryRows: RunHistoryRow[] = [];
    public HistorySourceFilter = '';
    public HistoryStatusFilter = '';
    public FilteredRunRows: RunHistoryRow[] = [];
    public HistorySourceOptions: string[] = [];

    // ── Slide-in form ──
    public FormMode: FormMode = 'none';
    public FormSaving = false;

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

    // Embedding model + vector index form fields (Content Source overrides)
    public FormSourceEmbeddingModelID = '';
    public FormSourceVectorIndexID = '';

    // ── Detail panels ──
    public SelectedFeedItem: ContentItemDetail | null = null;
    public ShowItemDetail = false;
    public SelectedSource: SourceDetailInfo | null = null;
    public ShowSourceDetail = false;
    public SourceDetailLoading = false;

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

    async ngAfterViewInit(): Promise<void> {
        await this.LoadPipelineData();
        this.tabDataLoaded.add('pipeline');
        this.IsLoading = false;
        this.cdr.detectChanges();
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

    // ── Tab switching ──

    public async SwitchTab(tab: TabName): Promise<void> {
        if (tab === this.ActiveTab) return;
        this.ActiveTab = tab;
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
            case 'history':
                await this.loadRunHistoryData();
                break;
        }
    }

    // ════════════════════════════════════════════
    // PIPELINE TAB — Data Loading & Building
    // ════════════════════════════════════════════

    public async LoadPipelineData(): Promise<void> {
        try {
            const rv = new RunView();
            const [sourcesResult, itemsResult, runsResult, tagsResult, sourceTypesResult, contentTypesResult] = await rv.RunViews([
                { EntityName: 'MJ: Content Sources', OrderBy: 'Name', ResultType: 'simple' },
                { EntityName: 'MJ: Content Items', OrderBy: '__mj_UpdatedAt DESC', MaxRows: 200, ResultType: 'simple', Fields: ['ID', 'Name', 'ContentSourceID', 'ContentSource', 'ContentSourceType', 'ContentType', 'ContentFileType', 'URL', 'TextContent', 'Checksum', '__mj_CreatedAt', '__mj_UpdatedAt'] },
                { EntityName: 'MJ: Content Process Runs', OrderBy: 'StartTime DESC', MaxRows: 100, ResultType: 'simple' },
                { EntityName: 'MJ: Content Item Tags', ResultType: 'simple', Fields: ['ID', 'ItemID', 'Tag', 'Weight', '__mj_CreatedAt'] },
                { EntityName: 'MJ: Content Source Types', ResultType: 'simple' },
                { EntityName: 'MJ: Content Types', ResultType: 'simple' }
            ]);

            this.contentSourcesRaw = sourcesResult.Success ? sourcesResult.Results : [];
            this.contentItemsRaw = itemsResult.Success ? itemsResult.Results : [];
            this.contentRunsRaw = runsResult.Success ? runsResult.Results : [];
            this.contentTagsRaw = tagsResult.Success ? tagsResult.Results : [];
            this.contentSourceTypesRaw = sourceTypesResult.Success ? sourceTypesResult.Results : [];
            this.contentTypesRaw = contentTypesResult.Success ? contentTypesResult.Results : [];

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
        this.NavItems = [
            { Tab: 'pipeline', Icon: 'fa-solid fa-gauge-high', Label: 'Pipeline', BadgeText: this.IsRunning ? 'Live' : '', BadgeClass: 'nav-badge-live' },
            { Tab: 'sources', Icon: 'fa-solid fa-database', Label: 'Sources', BadgeText: String(this.contentSourcesRaw.length), BadgeClass: '' },
            { Tab: 'types', Icon: 'fa-solid fa-sliders', Label: 'Content Types', BadgeText: String(this.contentTypesRaw.length), BadgeClass: '' },
            { Tab: 'tags', Icon: 'fa-solid fa-tag', Label: 'Tag Library', BadgeText: String(this.contentTagsRaw.length), BadgeClass: '' },
        ];
    }

    private buildKPIMetrics(): void {
        const sourceCount = this.contentSourcesRaw.length;
        const itemCount = this.contentItemsRaw.length;
        const tagCount = this.contentTagsRaw.length;
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

        this.FeedItems = this.contentItemsRaw.slice(0, 50).map(item => {
            const itemId = item['ID'] as string;
            const itemTags = this.getTopTagsForItem(itemId, 3);
            return {
                Name: (item['Name'] as string) ?? 'Unnamed Item',
                SourceName: (item['ContentSource'] as string) ?? 'Unknown',
                Tags: itemTags,
                TimeAgo: this.formatRelativeTime(item['__mj_UpdatedAt'] as string),
                Status: this.inferItemStatus(tagsByItem.get(itemId) ?? 0)
            };
        });
    }

    private buildSourceMinis(): void {
        const itemCountBySource = this.countItemsBySource();
        this.SourceMinis = this.contentSourcesRaw.map(source => {
            const id = source['ID'] as string;
            const itemCount = itemCountBySource.get(id) ?? 0;
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

    private buildTrendingTags(): void {
        const tagCounts = this.countAllTags();
        const avgWeights = this.computeAvgWeights();
        const scored = Array.from(tagCounts.entries()).map(([tag, count]) => {
            const weight = avgWeights.get(tag) ?? 1.0;
            return { tag, count, weight, score: count * weight };
        }).sort((a, b) => b.score - a.score).slice(0, 12);
        const maxScore = scored.length > 0 ? scored[0].score : 1;

        this.TrendingTags = scored.map(s => ({
            Tag: s.tag,
            AvgWeight: s.weight,
            SizeClass: s.score >= maxScore * 0.7 ? 'large' : s.score >= maxScore * 0.3 ? '' : 'small'
        }));
    }

    // ════════════════════════════════════════════
    // SOURCES TAB
    // ════════════════════════════════════════════

    private async loadSourcesData(): Promise<void> {
        await this.ensureBaseDataLoaded();
        this.buildSourceCards();
    }

    private buildSourceCards(): void {
        const itemCountBySource = this.countItemsBySource();
        const tagCountBySource = this.countTagsBySource();
        const lastRunBySource = this.getLastRunBySource();

        this.SourceCards = this.contentSourcesRaw.map(source => {
            const id = source['ID'] as string;
            const itemCount = itemCountBySource.get(id) ?? 0;
            const tagCount = tagCountBySource.get(id) ?? 0;
            const avgTags = itemCount > 0 ? (tagCount / itemCount).toFixed(1) : '0';
            const lastRun = lastRunBySource.get(id);
            const typeName = (source['ContentSourceType'] as string) ?? 'Unknown';
            const lastRunStatus = lastRun ? (lastRun['Status'] as string)?.toLowerCase() : null;
            const hasError = lastRunStatus === 'error' || lastRunStatus === 'failed';

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
                VectorIndexID: (source['VectorIndexID'] as string) ?? ''
            };
        });
    }

    // ════════════════════════════════════════════
    // CONTENT TYPES TAB
    // ════════════════════════════════════════════

    private async loadContentTypesData(): Promise<void> {
        if (this.contentTypesRaw.length === 0) {
            const rv = new RunView();
            const result = await rv.RunView({ EntityName: 'MJ: Content Types', ResultType: 'simple' });
            if (result.Success) this.contentTypesRaw = result.Results;
        }
        await this.ensureBaseDataLoaded();
        this.buildContentTypeCards();
    }

    private buildContentTypeCards(): void {
        const sourcesUsingByType = this.countSourcesByContentType();
        const itemsByType = this.countItemsByContentType();

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
                ItemsTagged: itemsByType.get(id) ?? 0,
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

    // ════════════════════════════════════════════
    // RUN HISTORY TAB
    // ════════════════════════════════════════════

    private async loadRunHistoryData(): Promise<void> {
        if (this.contentRunsRaw.length === 0) {
            const rv = new RunView();
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
            const statusLower = status.toLowerCase();
            const isFailed = statusLower === 'error' || statusLower === 'failed';
            const isRunning = statusLower === 'running' || statusLower === 'processing';

            return {
                ID: run['ID'] as string,
                Status: this.displayStatus(status),
                StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
                SourceName: (run['Source'] as string) ?? 'Unknown',
                StartedDisplay: startTime ? this.formatDate(startTime) : '\u2014',
                Duration: duration,
                Items: processedItems != null ? this.formatNumber(processedItems) : '\u2014',
                Tags: '\u2014',
                Errors: isFailed ? status : '0',
                ErrorClass: isFailed ? 'run-error-text' : ''
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
        this.FormSourceEmbeddingModelID = card.EmbeddingModelID ?? '';
        this.FormSourceVectorIndexID = card.VectorIndexID ?? '';
        this.EditingSourceID = card.ID;
        this.FormMode = 'edit-source';
        this.cdr.detectChanges();
    }

    public async SaveSource(): Promise<void> {
        if (this.FormSaving) return;
        this.FormSaving = true;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Content Sources');

            if (this.FormMode === 'edit-source' && this.EditingSourceID) {
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.EditingSourceID }]));
            } else {
                entity.NewRecord();
            }

            entity.Set('Name', this.FormSourceName);
            entity.Set('ContentSourceTypeID', this.FormSourceTypeID);
            entity.Set('ContentTypeID', this.FormContentTypeID);
            entity.Set('ContentFileTypeID', this.FormFileTypeID);
            entity.Set('URL', this.FormSourceURL);
            entity.Set('EmbeddingModelID', this.FormSourceEmbeddingModelID || null);
            entity.Set('VectorIndexID', this.FormSourceVectorIndexID || null);

            const saved = await entity.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.FormMode === 'edit-source' ? 'Source updated' : 'Source created', 'success', 2500
                );
                this.CloseForm();
                await this.refreshSourcesTab();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to save source', 'error', 3000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        } finally {
            this.FormSaving = false;
            this.cdr.detectChanges();
        }
    }

    public async DeleteSource(card: SourceCard): Promise<void> {
        if (!confirm(`Delete source "${card.Name}"? This cannot be undone.`)) return;

        try {
            const md = new Metadata();
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
            const md = new Metadata();
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
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Pipeline failed: ${result.ErrorMessage ?? 'Unknown error'}`, 'error', 5000
                );
                this.cdr.detectChanges();
                return;
            }

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

                for (const stage of this.PipelineStages) {
                    stage.Status = 'idle';
                    stage.Count = '\u2014';
                }

                if (success) {
                    this.tabDataLoaded.clear();
                    await this.LoadPipelineData();
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

                this.RunProgress = pct;
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
            const itemId = tag['ItemID'] as string;
            if (itemId) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
        }
        return counts;
    }

    private getTopTagsForItem(itemId: string, max: number): string[] {
        const tags: string[] = [];
        for (const tag of this.contentTagsRaw) {
            if ((tag['ItemID'] as string) === itemId) {
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
            let maxSource = '';
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
        this.FormSourceEmbeddingModelID = '';
        this.FormSourceVectorIndexID = '';
        this.EditingSourceID = '';
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
        const rv = new RunView();
        const result = await rv.RunView({ EntityName: 'MJ: Content Sources', OrderBy: 'Name', ResultType: 'simple' });
        if (result.Success) this.contentSourcesRaw = result.Results;
        this.buildSourceCards();
        this.buildNavItems();
        this.cdr.detectChanges();
    }

    private async refreshContentTypesTab(): Promise<void> {
        this.tabDataLoaded.delete('types');
        const rv = new RunView();
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
        const allTags = this.getAllTagsForItem(itemId);
        const tagCount = allTags.length;

        this.SelectedFeedItem = {
            ID: itemId,
            Name: feed.Name,
            SourceName: feed.SourceName,
            SourceTypeName: (rawItem['ContentSourceType'] as string) ?? 'Unknown',
            ContentTypeName: (rawItem['ContentType'] as string) ?? 'Unknown',
            FileTypeName: (rawItem['ContentFileType'] as string) ?? '',
            URL: (rawItem['URL'] as string) ?? '',
            TextContent: (rawItem['TextContent'] as string) ?? '',
            Checksum: (rawItem['Checksum'] as string) ?? '',
            Tags: allTags,
            CreatedAt: this.formatDate((rawItem['__mj_CreatedAt'] as string) ?? ''),
            UpdatedAt: this.formatDate((rawItem['__mj_UpdatedAt'] as string) ?? ''),
            ContentSourceID: (rawItem['ContentSourceID'] as string) ?? '',
            StatusDot: feed.Status,
            TagCount: tagCount
        };
        this.ShowItemDetail = true;
        this.cdr.detectChanges();
    }

    public OpenContentItemDetail(item: ContentItemDetail): void {
        this.SelectedFeedItem = item;
        this.ShowItemDetail = true;
        this.cdr.detectChanges();
    }

    public CloseItemDetail(): void {
        this.ShowItemDetail = false;
        this.SelectedFeedItem = null;
        this.cdr.detectChanges();
    }

    public OpenRecordFromItem(item: ContentItemDetail): void {
        const md = new Metadata();
        const pkey = new CompositeKey();
        pkey.KeyValuePairs = [{ FieldName: 'ID', Value: item.ID }];
        this.navigationService.OpenEntityRecord('MJ: Content Items', pkey);
    }

    private getAllTagsForItem(itemId: string): string[] {
        const tags: string[] = [];
        for (const tag of this.contentTagsRaw) {
            if ((tag['ItemID'] as string) === itemId) {
                tags.push(tag['Tag'] as string);
            }
        }
        return tags;
    }

    // ════════════════════════════════════════════
    // DETAIL PANELS — Source Detail
    // ════════════════════════════════════════════

    public async OpenSourceDetail(card: SourceCard): Promise<void> {
        this.SourceDetailLoading = true;
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
        const rv = new RunView();
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
            const allTags = this.getAllTagsForItem(itemId);
            const tagCount = tagsByItem.get(itemId) ?? allTags.length;
            return {
                ID: itemId,
                Name: (item['Name'] as string) ?? 'Unnamed',
                SourceName: (item['ContentSource'] as string) ?? '',
                SourceTypeName: (item['ContentSourceType'] as string) ?? '',
                ContentTypeName: (item['ContentType'] as string) ?? '',
                FileTypeName: (item['ContentFileType'] as string) ?? '',
                URL: (item['URL'] as string) ?? '',
                TextContent: (item['TextContent'] as string) ?? '',
                Checksum: (item['Checksum'] as string) ?? '',
                Tags: allTags,
                CreatedAt: this.formatDate((item['__mj_CreatedAt'] as string) ?? ''),
                UpdatedAt: this.formatDate((item['__mj_UpdatedAt'] as string) ?? ''),
                ContentSourceID: sourceId,
                StatusDot: tagCount > 0 ? 'complete' : 'processing',
                TagCount: tagCount
            };
        });
    }

    private async loadRunHistoryForSource(sourceId: string): Promise<RunHistoryRow[]> {
        const rv = new RunView();
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
            const statusLower = status.toLowerCase();
            const isFailed = statusLower === 'error' || statusLower === 'failed';
            const isRunning = statusLower === 'running' || statusLower === 'processing';

            return {
                ID: run['ID'] as string,
                Status: this.displayStatus(status),
                StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
                SourceName: (run['Source'] as string) ?? 'Unknown',
                StartedDisplay: startTime ? this.formatDate(startTime) : '\u2014',
                Duration: duration,
                Items: processedItems != null ? this.formatNumber(processedItems) : '\u2014',
                Tags: '\u2014',
                Errors: isFailed ? status : '0',
                ErrorClass: isFailed ? 'run-error-text' : ''
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
}

export function LoadAutotaggingPipelineResource(): void {
    // Prevents tree-shaking
}
