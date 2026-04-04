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

type TabName = 'pipeline' | 'sources' | 'types' | 'tags' | 'taxonomy' | 'history';

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
    Name: string;
    ItemCount: number;
    ColorClass: string;
    RowSpan: number;
}

interface TaxAuditEvent {
    Type: 'created' | 'merged' | 'moved' | 'deleted' | 'renamed';
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
    public TaxAuditFilterTypes = new Set<string>(['created', 'merged', 'moved', 'deleted', 'renamed']);
    public TaxHealth: TaxHealthStat = { Total: 0, Healthy: 0, NeedAttention: 0, Orphaned: 0, Duplicates: 0 };
    public TaxRecentItems: { Name: string; Weight: number; Date: string; Icon: string }[] = [];
    public TaxTreemapKPIs: { Label: string; Value: string }[] = [];
    public TaxIsEditing = false;

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

    // Raw taxonomy data cache
    private tagsRaw: Record<string, unknown>[] = [];
    private taggedItemsRaw: Record<string, unknown>[] = [];

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

    // Entity source fields (shown when source type is "Entity")
    public FormSourceEntityID = '';
    public FormSourceEntityDocID = '';

    // Embedding model + vector index form fields (Content Source overrides)
    public FormSourceEmbeddingModelID = '';
    public FormSourceVectorIndexID = '';

    /**
     * Whether the currently selected source type is "Entity", which switches
     * the URL field to Entity/EntityDocument pickers.
     */
    public get IsEntitySourceTypeSelected(): boolean {
        if (!this.FormSourceTypeID) return false;
        const sourceType = this.SourceTypeOptions.find(o => o.ID === this.FormSourceTypeID);
        return sourceType?.Name?.toLowerCase() === 'entity';
    }

    /** Entities that have at least one EntityDocument configured */
    public get EntitiesWithDocuments(): { ID: string; Name: string }[] {
        try {
            const engine = KnowledgeHubMetadataEngine.Instance;
            const docs = engine.GetActiveEntityDocuments();
            const entityMap = new Map<string, string>();
            const md = new Metadata();
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
            const md = new Metadata();
            const entityInfo = md.Entities.find(e => e.ID === this.FormSourceEntityID);
            if (!entityInfo) return [];
            return engine.GetActiveEntityDocuments()
                .filter(d => (d.Get('Entity') as string) === entityInfo.Name)
                .map(d => ({ ID: d.ID, Name: d.Name }));
        } catch {
            return [];
        }
    }

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
            case 'taxonomy':
                await this.loadTaxonomyData();
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
            { Tab: 'taxonomy', Icon: 'fa-solid fa-sitemap', Label: 'Taxonomy', BadgeText: String(this.tagsRaw.length || ''), BadgeClass: '' },
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
                VectorIndexID: (source['VectorIndexID'] as string) ?? '',
                EntityID: (source['EntityID'] as string) ?? '',
                EntityDocumentID: (source['EntityDocumentID'] as string) ?? ''
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
        this.FormSourceEntityID = card.EntityID ?? '';
        this.FormSourceEntityDocID = card.EntityDocumentID ?? '';
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
            entity.Set('URL', this.IsEntitySourceTypeSelected ? null : this.FormSourceURL);
            entity.Set('EntityID', this.IsEntitySourceTypeSelected ? this.FormSourceEntityID || null : null);
            entity.Set('EntityDocumentID', this.IsEntitySourceTypeSelected ? (this.FormSourceEntityDocID || this.EntityDocOptionsForSelectedEntity[0]?.ID || null) : null);
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
        this.FormSourceEntityID = '';
        this.FormSourceEntityDocID = '';
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

    // ════════════════════════════════════════════
    // TAXONOMY GOVERNANCE TAB
    // ════════════════════════════════════════════

    public SwitchTaxSubTab(sub: TaxonomySubTab): void {
        this.TaxSubTab = sub;
        this.cdr.detectChanges();
    }

    private async loadTaxonomyData(): Promise<void> {
        try {
            const rv = new RunView();
            const [tagsResult, taggedItemsResult] = await rv.RunViews([
                { EntityName: 'MJ: Tags', OrderBy: 'Name', ResultType: 'simple' },
                { EntityName: 'MJ: Tagged Items', ResultType: 'simple' }
            ]);

            this.tagsRaw = tagsResult.Success ? tagsResult.Results : [];
            this.taggedItemsRaw = taggedItemsResult.Success ? taggedItemsResult.Results : [];

            // Also ensure content item tags are loaded for cross-referencing
            await this.ensureBaseDataLoaded();

            this.buildTaxTree();
            this.buildTaxDuplicates();
            this.buildTaxOrphans();
            this.buildTaxTreemap();
            this.buildTaxAuditLog();
            this.buildTaxHealth();
        } catch (error) {
            console.error('[Autotagging] Error loading taxonomy data:', error);
        }
    }

    // ── Tree View ──

    private buildTaxTree(): void {
        const tagMap = new Map<string, TaxTreeNode>();
        const tagItemCounts = this.countItemsByTag();
        const tagAvgWeights = this.computeTagAvgWeights();

        // Create flat node list from raw tags
        for (const tag of this.tagsRaw) {
            const id = tag['ID'] as string;
            const name = (tag['Name'] as string) ?? 'Unnamed';
            const itemCount = tagItemCounts.get(id) ?? 0;
            const avgWeight = tagAvgWeights.get(id) ?? 0;

            tagMap.set(id, {
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
            if (node.ParentID && tagMap.has(node.ParentID)) {
                tagMap.get(node.ParentID)!.Children.push(node);
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

    private countItemsByTag(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const ti of this.taggedItemsRaw) {
            const tagId = ti['TagID'] as string;
            if (tagId) counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
        }
        // Also count from content item tags that reference TagID
        for (const cit of this.contentTagsRaw) {
            const tagId = cit['TagID'] as string;
            if (tagId) counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
        }
        return counts;
    }

    private computeTagAvgWeights(): Map<string, number> {
        const sums = new Map<string, number>();
        const counts = new Map<string, number>();
        for (const cit of this.contentTagsRaw) {
            const tagId = cit['TagID'] as string;
            const w = Number(cit['Weight'] ?? 0.5);
            if (tagId) {
                sums.set(tagId, (sums.get(tagId) ?? 0) + w);
                counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
            }
        }
        const avgs = new Map<string, number>();
        for (const [t, sum] of sums) {
            avgs.set(t, Math.round((sum / (counts.get(t) ?? 1)) * 100) / 100);
        }
        return avgs;
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
        this.cdr.detectChanges();
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
        const node = this.TaxFlatNodes.find(n => n.ID === tagId);
        if (node) {
            this.SelectTaxNode(node);
        }
    }

    private loadRecentItemsForTag(node: TaxTreeNode): void {
        // Find content item tags that reference this tag's ID
        const recentItems: { Name: string; Weight: number; Date: string; Icon: string }[] = [];
        const matchingTags = this.contentTagsRaw.filter(cit =>
            (cit['TagID'] as string) === node.ID
        ).slice(0, 5);

        for (const cit of matchingTags) {
            const itemId = cit['ItemID'] as string;
            const item = this.contentItemsRaw.find(i => (i['ID'] as string) === itemId);
            const itemName = item ? ((item['Name'] as string) ?? 'Unnamed Item') : 'Unknown Item';
            const sourceType = item ? ((item['ContentSourceType'] as string) ?? '') : '';
            const icon = sourceType.toLowerCase().includes('web') ? 'fa-solid fa-globe'
                : sourceType.toLowerCase().includes('rss') ? 'fa-solid fa-rss'
                : 'fa-solid fa-file-lines';

            recentItems.push({
                Name: itemName,
                Weight: Number(cit['Weight'] ?? 0.5),
                Date: this.formatShortDate((cit['__mj_CreatedAt'] as string) ?? ''),
                Icon: icon
            });
        }

        this.TaxRecentItems = recentItems;
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
            const md = new Metadata();
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
            const md = new Metadata();
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

    public async DeleteTag(node: TaxTreeNode): Promise<void> {
        if (!confirm(`Delete tag "${node.Name}"? This will also remove all tagged item associations.`)) return;
        try {
            const md = new Metadata();
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

    public async MergeTags(sourceTagId: string, targetTagId: string, sourceName: string, targetName: string): Promise<void> {
        try {
            // Re-parent tagged items from source to target
            const itemsToMove = this.taggedItemsRaw.filter(ti => (ti['TagID'] as string) === sourceTagId);
            const md = new Metadata();
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

            // Delete source tag
            const sourceEntity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
            await sourceEntity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: sourceTagId }]));
            await sourceEntity.Delete();

            this.addTaxAuditEntry('merged', `${sourceName} into ${targetName}`);
            MJNotificationService.Instance.CreateSimpleNotification(`Merged "${sourceName}" into "${targetName}"`, 'success', 3000);
            await this.RefreshTaxonomyData();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Merge error: ${msg}`, 'error', 4000);
        }
    }

    public async MakeChildTag(childTagId: string, parentTagId: string): Promise<void> {
        try {
            const md = new Metadata();
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
        const tags = this.tagsRaw.map(t => ({
            ID: t['ID'] as string,
            Name: (t['Name'] as string) ?? ''
        }));

        const pairs: TaxDuplicatePair[] = [];

        for (let i = 0; i < tags.length; i++) {
            for (let j = i + 1; j < tags.length; j++) {
                const sim = this.computeStringSimilarity(tags[i].Name, tags[j].Name);
                if (sim >= 0.70) {
                    pairs.push({
                        TagA: tags[i].Name,
                        TagB: tags[j].Name,
                        TagAID: tags[i].ID,
                        TagBID: tags[j].ID,
                        Similarity: Math.round(sim * 100),
                        SeverityClass: sim >= 0.85 ? 'high' : 'moderate'
                    });
                }
            }
        }

        pairs.sort((a, b) => b.Similarity - a.Similarity);
        this.TaxDuplicates = pairs;
    }

    /** Simple string similarity using normalized Levenshtein-like approach and abbreviation detection */
    private computeStringSimilarity(a: string, b: string): number {
        const la = a.toLowerCase().trim();
        const lb = b.toLowerCase().trim();

        if (la === lb) return 1.0;

        // Check if one is an abbreviation of the other
        if (this.isAbbreviationOf(la, lb) || this.isAbbreviationOf(lb, la)) {
            return 0.90;
        }

        // Check if one contains the other
        if (lb.includes(la) || la.includes(lb)) {
            const shorter = la.length < lb.length ? la : lb;
            const longer = la.length < lb.length ? lb : la;
            return shorter.length / longer.length;
        }

        // Levenshtein distance-based similarity
        const dist = this.levenshteinDistance(la, lb);
        const maxLen = Math.max(la.length, lb.length);
        return maxLen > 0 ? 1 - dist / maxLen : 0;
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

    private buildTaxOrphans(): void {
        const tagItemCounts = this.countItemsByTag();
        const hasChildren = new Set<string>();
        for (const t of this.tagsRaw) {
            const pid = t['ParentID'] as string;
            if (pid) hasChildren.add(pid);
        }

        this.TaxOrphans = this.tagsRaw
            .filter(t => {
                const id = t['ID'] as string;
                const parentId = t['ParentID'] as string | null;
                const itemCount = tagItemCounts.get(id) ?? 0;
                // Orphan: no parent, no children, low usage
                return !parentId && !hasChildren.has(id) && itemCount <= 3;
            })
            .map(t => {
                const id = t['ID'] as string;
                const itemCount = tagItemCounts.get(id) ?? 0;
                const avgWeights = this.computeTagAvgWeights();
                return {
                    ID: id,
                    Name: (t['Name'] as string) ?? 'Unnamed',
                    UsageCount: itemCount,
                    AvgWeight: avgWeights.get(id) ?? 0,
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

    public async DeleteOrphan(orphan: TaxOrphanCard): Promise<void> {
        if (!confirm(`Delete orphan tag "${orphan.Name}"?`)) return;
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<BaseEntity>('MJ: Tags');
            await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: orphan.ID }]));
            const deleted = await entity.Delete();
            if (deleted) {
                this.addTaxAuditEntry('deleted', orphan.Name);
                MJNotificationService.Instance.CreateSimpleNotification('Orphan tag deleted', 'success', 2500);
                this.TaxOrphans = this.TaxOrphans.filter(o => o.ID !== orphan.ID);
                this.TaxHealth.Orphaned = this.TaxOrphans.length;
                this.cdr.detectChanges();
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        }
    }

    public async BulkDeleteOrphans(): Promise<void> {
        const selected = this.TaxOrphans.filter(o => o.IsSelected);
        if (selected.length === 0) return;
        if (!confirm(`Delete ${selected.length} selected orphan tags?`)) return;

        const md = new Metadata();
        let deletedCount = 0;
        for (const orphan of selected) {
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

        MJNotificationService.Instance.CreateSimpleNotification(`Deleted ${deletedCount} tags`, 'success', 3000);
        this.TaxOrphans = this.TaxOrphans.filter(o => !o.IsSelected);
        this.TaxHealth.Orphaned = this.TaxOrphans.length;
        this.TaxAllOrphansSelected = false;
        this.cdr.detectChanges();
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

    private buildTaxAuditLog(): void {
        // Build audit events from tag creation dates and known changes
        const events: TaxAuditEvent[] = [];

        for (const tag of this.tagsRaw) {
            const name = (tag['Name'] as string) ?? 'Unnamed';
            const createdAt = tag['__mj_CreatedAt'] as string;
            if (createdAt) {
                events.push({
                    Type: 'created',
                    Description: `Tag created`,
                    TagRef: name,
                    User: 'System',
                    Timestamp: this.formatDate(createdAt),
                    DayHeader: this.formatDayHeader(createdAt)
                });
            }
        }

        // Sort by date descending
        events.sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
        this.TaxAuditEvents = events.slice(0, 50);
    }

    private addTaxAuditEntry(type: TaxAuditEvent['Type'], tagRef: string): void {
        const now = new Date().toISOString();
        this.TaxAuditEvents.unshift({
            Type: type,
            Description: `Tag ${type}`,
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

    public GetTaxAuditIcon(type: string): string {
        const map: Record<string, string> = {
            'created': 'fa-solid fa-plus',
            'merged': 'fa-solid fa-code-merge',
            'moved': 'fa-solid fa-arrows-up-down',
            'deleted': 'fa-solid fa-trash',
            'renamed': 'fa-solid fa-pen'
        };
        return map[type] ?? 'fa-solid fa-circle';
    }

    public async RefreshTaxonomyData(): Promise<void> {
        this.tabDataLoaded.delete('taxonomy');
        await this.loadTaxonomyData();
        this.cdr.detectChanges();
    }
}

export function LoadAutotaggingPipelineResource(): void {
    // Prevents tree-shaking
}
