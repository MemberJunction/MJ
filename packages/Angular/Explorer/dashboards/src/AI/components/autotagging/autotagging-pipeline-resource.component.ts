/**
 * @fileoverview Content Autotagging Dashboard
 *
 * Full dashboard for the content autotagging pipeline with left-nav and 5 tabs:
 * Pipeline Monitor, Sources Management, Content Types, Tag Library, Run History.
 * Supports CRUD on sources and content types via slide-in forms,
 * pipeline triggering with real-time GraphQL subscription progress.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject, ViewChild, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseEntity, CompositeKey, RunView } from '@memberjunction/core';
import { TreeBranchConfig, TreeLeafConfig } from '@memberjunction/ng-trees';
import { ResourceData, KnowledgeHubMetadataEngine, MJContentSourceEntity, MJContentSourceTypeEntity_IContentSourceTypeField, MJScheduledActionEntity, MJContentItemDuplicateEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ClassifyTagsTabComponent } from './tabs/tags-tab.component';


// ── Shared types (extracted to ./shared/classify.types.ts) ──
import { TabName, NavItem, KPIMetric, PipelineStageInfo, FeedItem, SourceMini, SourceCard, ContentTypeCard, TagCloudItem, DropdownOption, ContentDuplicateRow, RunDetailRow, WeightedTag, ItemPipelineStatus, ContentItemDetail, FormMode } from './shared/classify.types';

@RegisterClass(BaseResourceComponent, 'AutotaggingPipelineResource')
@Component({
    standalone: false,
    selector: 'app-autotagging-pipeline-resource',
    templateUrl: './autotagging-pipeline-resource.component.html',
    styleUrls: ['./autotagging-pipeline-resource.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class AutotaggingPipelineResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    protected override destroy$ = new Subject<void>();
    private cdr = inject(ChangeDetectorRef);
    protected override navigationService = inject(NavigationService);

    // ── Global state ──
    public IsLoading = true;

    // ── Accurate total counts from TotalRowCount (not capped by MaxRows) ──
    private totalContentItemCount = 0;
    private totalContentTagCount = 0;

    // ── Tab state ──
    public ActiveTab: TabName = 'pipeline';
    private tabDataLoaded = new Set<TabName>();

    /** Live reference to the Tag Library tab (for deep-link + agent-tool search). */
    @ViewChild(ClassifyTagsTabComponent) private tagsTab?: ClassifyTagsTabComponent;

    // ── Left nav ──
    public NavItems: NavItem[] = [];

    // ── Pipeline tab ──
    public KPIMetrics: KPIMetric[] = [];
    public PipelineStages: PipelineStageInfo[] = [];
    public FeedItems: FeedItem[] = [];
    public SourceMinis: SourceMini[] = [];
    public TrendingTags: TagCloudItem[] = [];

    // Pipeline feed search/sort/pagination moved to ClassifyPipelineTabComponent
    // (tab-local presentational state). The host still builds FeedItems and owns
    // OpenFeedItemDetail(index) — the tab emits the original index back up.

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
        UserInfoEngine.Instance.SetSettingDebounced(AutotaggingPipelineResourceComponent.PREFS_KEY, prefs);
    }

    private loadClassifyPreferences(): void {
        const raw = UserInfoEngine.Instance.GetSetting(AutotaggingPipelineResourceComponent.PREFS_KEY);
        if (raw) {
            try {
                const prefs = JSON.parse(raw);
                // Guard against stale persisted state that doesn't match the
                // current Classify rail (e.g. 'tags'/'taxonomy' from when those
                // surfaces lived here, or a value seeded by a sibling dashboard).
                if (prefs.ActiveTab && AutotaggingPipelineResourceComponent.VALID_TABS.includes(prefs.ActiveTab)) {
                    this.ActiveTab = prefs.ActiveTab;
                }
                if (prefs.ShowPipelineConfig != null) this.ShowPipelineConfig = prefs.ShowPipelineConfig;
            } catch { /* ignore */ }
        }
    }

    // FormatTokenCount moved to ClassifyPipelineTabComponent (only the pipeline
    // config panel used it; the tab uses formatTokenCount from shared).

    // ── Sources tab ──
    // SourceCards + buildSourceCards() + the source-detail slide-in + the
    // quick-schedule dialog moved to ClassifySourcesTabComponent. The host still
    // owns the Content Duplicates section (rendered alongside the sources tab).
    public ContentDuplicates: ContentDuplicateRow[] = [];
    public IsLoadingDuplicates = false;

    // ── Content Types tab ──
    // ContentTypeCards + buildContentTypeCards() moved to ClassifyTypesTabComponent.

    // ── Tag Library tab ──
    // State + view-model building moved to ClassifyTagsTabComponent, which
    // rebuilds from its [ContentTags]/[ContentItems] inputs.

    // D2: Pipeline Monitor — live per-source progress
    public LiveRunDetailRows: RunDetailRow[] = [];
    public IsLoadingLiveDetails = false;

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

    // Slide-in is the QUICK-EDIT surface for content sources. We only expose the
    // most-useful subset of the new knobs here; the full surface (other budgets,
    // URL pattern, root URL, taxonomy mode, thresholds, …) lives on the entity
    // form opened via the "Open Advanced settings →" link below.
    //
    // Decisions:
    //   - MaxItemsPerRun: the single most-asked-for cap → always shown
    //   - MaxDepth + the two crawl toggles: Website-only, the symptom that
    //     started this whole work
    //   - Everything else: too niche for the quick-edit surface
    public FormMaxItemsPerRun: number | null = null;
    public FormMaxDepth: number | null = null;
    public FormCrawlSitesInLowerLevelDomain: boolean = true;
    public FormCrawlOtherSitesInTopLevelDomain: boolean = false;

    /** True when the form's selected source type is Website — gates the crawler knobs. */
    public get IsWebsiteSourceTypeSelected(): boolean {
        if (!this.FormSourceTypeID) return false;
        const t = this.SourceTypeOptions.find(o => UUIDsEqual(o.ID, this.FormSourceTypeID));
        return t != null && t.Name?.trim().toLowerCase() === 'website';
    }

    // ── Schedule dialog ──
    // The quick-schedule dialog (state + save/remove logic) moved to
    // ClassifySourcesTabComponent.

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
    // The Source Detail slide-in (state, pagination, status filter, retry, badge
    // class) moved to ClassifySourcesTabComponent. The item-detail slide-in below
    // stays in the host (shared by the pipeline feed + tag drill-down + sources).
    public SelectedFeedItem: ContentItemDetail | null = null;
    public ShowItemDetail = false;

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
    /** Exposes the raw run rows to the Run History tab component via `[Runs]`. */
    public get ContentRunsRaw(): Record<string, unknown>[] {
        return this.contentRunsRaw;
    }
    private contentSourceTypesRaw: Record<string, unknown>[] = [];
    private contentTypesRaw: Record<string, unknown>[] = [];
    private contentFileTypesRaw: Record<string, unknown>[] = [];
    private aiModelsRaw: Record<string, unknown>[] = [];

    /** Exposes raw content types to the Content Types tab via `[ContentTypes]`. */
    public get ContentTypesRaw(): Record<string, unknown>[] {
        return this.contentTypesRaw;
    }
    /** Exposes raw content sources to the Content Types tab via `[Sources]`. */
    public get ContentSourcesRaw(): Record<string, unknown>[] {
        return this.contentSourcesRaw;
    }
    /** Exposes raw content items to the Content Types / Tag Library tabs via `[Items]`/`[ContentItems]`. */
    public get ContentItemsRaw(): Record<string, unknown>[] {
        return this.contentItemsRaw;
    }
    /** Exposes raw content item tags to the Tag Library tab via `[ContentTags]`. */
    public get ContentTagsRaw(): Record<string, unknown>[] {
        return this.contentTagsRaw;
    }
    /** Exposes the accurate total item count to the Content Types / Sources tabs via `[TotalItemCount]`. */
    public get TotalContentItemCount(): number {
        return this.totalContentItemCount;
    }
    /** Exposes the accurate total tag count to the Sources tab via `[TotalTagCount]`. */
    public get TotalContentTagCount(): number {
        return this.totalContentTagCount;
    }
    /** Exposes the cached ScheduledAction entities to the Sources tab via `[ScheduledActions]`. */
    public get ScheduledActionsCache(): Map<string, MJScheduledActionEntity> {
        return this.scheduledActionsCache;
    }
    /** Exposes the EntityRecordDocument ID→RecordID cache to the Sources tab via `[EntityRecordDocCache]`. */
    public get EntityRecordDocCacheMap(): Map<string, string> {
        return this.entityRecordDocCache;
    }

    /**
     * Reload the shared source list after the Sources tab mutates a source
     * (delete / schedule change). Rebinding `contentSourcesRaw` flows through the
     * tab's `[Sources]` input setter, which rebuilds its cards.
     */
    public async OnSourcesDataChanged(): Promise<void> {
        await this.refreshSourcesTab();
    }

    /**
     * Hook for the Taxonomy tab's `(DataChanged)` output. The taxonomy tab owns
     * and reloads its own data; the host has no shared taxonomy surface to
     * refresh today, so this is a no-op placeholder kept for future cross-tab wiring.
     */
    public OnTaxonomyDataChanged(): void {
        // No host-owned taxonomy surface to refresh; the tab manages its own data.
    }

    // ── Lifecycle ──

    private static readonly PREFS_KEY = 'KH_Classify_Preferences';
    private static readonly VALID_TABS: TabName[] = ['pipeline', 'sources', 'types', 'history'];

    async ngAfterViewInit(): Promise<void> {
        await Promise.all([
            KnowledgeHubMetadataEngine.Instance.Config(false),
            UserInfoEngine.Instance.Config(false),
        ]);
        this.loadClassifyPreferences();
        this.applyIncomingConfiguration();
        await Promise.all([this.LoadPipelineData(), this.loadEntityRecordDocCache()]);
        this.tabDataLoaded.add('pipeline');

        // If user preferences or incoming config set a non-pipeline initial tab,
        // eagerly load that tab's data so it is not blank on first render.
        if (this.ActiveTab !== 'pipeline' && !this.tabDataLoaded.has(this.ActiveTab)) {
            await this.loadTabData(this.ActiveTab);
            this.tabDataLoaded.add(this.ActiveTab);
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

        // Switch to the tags tab so ClassifyTagsTabComponent renders and the
        // ViewChild resolves, ensuring its data is loaded.
        if (this.ActiveTab !== 'tags') {
            this.ActiveTab = 'tags';
        }
        if (!this.tabDataLoaded.has('tags')) {
            await this.loadTabData('tags');
            this.tabDataLoaded.add('tags');
        }
        this.cdr.detectChanges();

        this.tagsTab?.ApplySearch(tagSearch);
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
                    // Ensure the Tag Library tab is active + rendered so its
                    // ViewChild resolves, then delegate the search to it.
                    await this.SwitchTab('tags');
                    this.cdr.detectChanges();
                    const matchCount = this.tagsTab?.ApplySearch(String(params['query'] ?? '')) ?? 0;
                    return { Success: true, Data: { MatchCount: matchCount } };
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

    /**
     * Wraps `NavItems` for `<mj-left-nav>`. Hardcoded "Run History" item goes
     * into a second `MJLeftNavSection` — the rail's natural section break
     * replaces the bespoke `.at-nav-divider` line.
     */
    public get navSections(): MJLeftNavSection[] {
        return [
            {
                items: this.NavItems.map(n => ({
                    id: n.Tab,
                    label: n.Label,
                    icon: n.Icon,
                    badge: n.BadgeText || undefined
                }))
            },
            {
                items: [{
                    id: 'history',
                    label: 'Run History',
                    icon: 'fa-solid fa-clock-rotate-left'
                }]
            }
        ];
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
        // Classify dashboard owns the autotag pipeline run-management surface.
        // Tag Library + Taxonomy moved to the canonical "Tags" dashboard
        // (TagsResourceComponent under Knowledge Hub) — this nav intentionally
        // omits them. The underlying state + methods remain in this file as
        // dead code for the moment; a follow-up will strip them.
        this.NavItems = [
            { Tab: 'pipeline', Icon: 'fa-solid fa-gauge-high', Label: 'Pipeline', BadgeText: this.IsRunning ? 'Live' : '', BadgeClass: 'nav-badge-live' },
            { Tab: 'sources', Icon: 'fa-solid fa-database', Label: 'Sources', BadgeText: String(this.contentSourcesRaw.length), BadgeClass: '' },
            { Tab: 'types', Icon: 'fa-solid fa-sliders', Label: 'Content Types', BadgeText: String(this.contentTypesRaw.length), BadgeClass: '' },
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
        // Just ensure the shared raw data is loaded; ClassifySourcesTabComponent
        // rebuilds its source cards from its [Sources]/[Items]/[Tags]/[Runs] inputs.
        await this.ensureBaseDataLoaded();
    }

    // buildSourceCards() + the source-detail/schedule helpers
    // (resolveEntityRecordID, resolveEntityName, countTagsBySource,
    // getLastRunBySource, getScheduledActionCron, resolveEmbeddingModelName,
    // resolveVectorIndexName, loadContentItemsForSource, loadRunHistoryForSource)
    // moved to ClassifySourcesTabComponent.

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
        // Card building lives in ClassifyTypesTabComponent, which rebuilds from
        // its [ContentTypes]/[Sources]/[Items]/[TotalItemCount] inputs.
    }

    // ════════════════════════════════════════════
    // TAG LIBRARY TAB
    // ════════════════════════════════════════════

    private async loadTagLibraryData(): Promise<void> {
        // Just ensure the shared raw data is loaded; ClassifyTagsTabComponent
        // rebuilds its view models from the [ContentTags]/[ContentItems] inputs.
        await this.ensureBaseDataLoaded();
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

        // Populate quick-edit knobs + FormSourceSpecificConfig from Configuration JSON.
        // Reset to defaults first so a previously-edited source's values don't leak in.
        this.FormSourceSpecificConfig = {};
        this.FormMaxItemsPerRun = null;
        this.FormMaxDepth = null;
        this.FormCrawlSitesInLowerLevelDomain = true;
        this.FormCrawlOtherSitesInTopLevelDomain = false;
        const rawSource = this.contentSourcesRaw.find(s => UUIDsEqual(s['ID'] as string, card.ID));
        if (rawSource) {
            const configStr = rawSource['Configuration'] as string | null;
            if (configStr) {
                try {
                    const parsed = JSON.parse(configStr) as Record<string, unknown> | null;
                    const specific = parsed?.['SourceSpecificConfiguration'] as Record<string, string> | undefined;
                    if (specific) {
                        this.FormSourceSpecificConfig = { ...specific };
                    }
                    // Run-budget knob — pulled directly off the typed Configuration.
                    const items = parsed?.['MaxItemsPerRun'];
                    if (typeof items === 'number' && Number.isFinite(items)) {
                        this.FormMaxItemsPerRun = items;
                    }
                    // Website sub-object — only populates the inputs when present
                    // (matches the autotagger's "unset = default" semantics).
                    const website = parsed?.['Website'] as Record<string, unknown> | undefined;
                    if (website) {
                        const depth = website['MaxDepth'];
                        if (typeof depth === 'number' && Number.isFinite(depth)) {
                            this.FormMaxDepth = depth;
                        }
                        if (typeof website['CrawlSitesInLowerLevelDomain'] === 'boolean') {
                            this.FormCrawlSitesInLowerLevelDomain = website['CrawlSitesInLowerLevelDomain'] as boolean;
                        }
                        if (typeof website['CrawlOtherSitesInTopLevelDomain'] === 'boolean') {
                            this.FormCrawlOtherSitesInTopLevelDomain = website['CrawlOtherSitesInTopLevelDomain'] as boolean;
                        }
                    }
                } catch {
                    // Configuration not valid JSON, ignore
                }
            }
        }

        this.FormMode = 'edit-source';
        this.cdr.detectChanges();
    }

    /**
     * Open the full entity form for the source currently being edited in the
     * slide-in. Quick-edit covers the most-used knobs; the entity form (with
     * the dynamically-mounted BaseFormPanel slots) exposes everything else
     * — taxonomy mode, thresholds, all five run-budget caps, URL pattern,
     * root URL, etc.
     */
    public async OpenAdvancedSourceSettings(): Promise<void> {
        if (!this.EditingSourceID) return;
        this.CloseForm();
        await this.navigationService.OpenEntityRecord(
            'MJ: Content Sources',
            CompositeKey.FromID(this.EditingSourceID),
        );
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

            // Persist the quick-edit knobs that don't have their own DB columns
            // (the rest live on the typed Configuration JSON sub-objects). The
            // advanced settings flow on the entity form can override more fields
            // — we only touch the keys the slide-in exposes so we don't clobber
            // unrelated values an operator set there earlier.
            if (this.FormMaxItemsPerRun != null && Number.isFinite(this.FormMaxItemsPerRun)) {
                currentConfig.MaxItemsPerRun = this.FormMaxItemsPerRun;
            } else {
                // Empty input = "unlimited" — strip the key so the autotagger
                // sees no cap (rather than 0 = "process zero items").
                delete currentConfig.MaxItemsPerRun;
            }

            if (this.IsWebsiteSourceTypeSelected) {
                const website = { ...(currentConfig.Website ?? {}) };
                if (this.FormMaxDepth != null && Number.isFinite(this.FormMaxDepth)) {
                    website.MaxDepth = this.FormMaxDepth;
                } else {
                    delete website.MaxDepth;
                }
                website.CrawlSitesInLowerLevelDomain = this.FormCrawlSitesInLowerLevelDomain;
                website.CrawlOtherSitesInTopLevelDomain = this.FormCrawlOtherSitesInTopLevelDomain;
                currentConfig.Website = website;
            }

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

    // DeleteSource(), the quick-schedule dialog (Open/Close/Save/Remove + cron
    // label/preview helpers + getScheduledActionCron, findAutotagActionID,
    // createSourceIDParam, linkScheduleToSource) moved to
    // ClassifySourcesTabComponent. loadScheduledActionsForSources() stays here
    // because the host's LoadPipelineData / refreshSourcesTab populate the cache
    // it exposes to the tab via [ScheduledActions].

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

    // countTagsBySource() / getLastRunBySource() moved to
    // ClassifySourcesTabComponent (only the source cards used them).
    // countSourcesByContentType() / countItemsByContentType() moved to
    // ClassifyTypesTabComponent along with buildContentTypeCards().

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
        // Quick-edit knobs — defaults match the autotagger's runtime defaults.
        this.FormMaxItemsPerRun = null;
        this.FormMaxDepth = null;
        this.FormCrawlSitesInLowerLevelDomain = true;
        this.FormCrawlOtherSitesInTopLevelDomain = false;
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
        // The new contentSourcesRaw reference flows to ClassifySourcesTabComponent
        // via [Sources]="ContentSourcesRaw", which rebuilds its cards on input change.
        this.buildNavItems();
        this.cdr.detectChanges();
    }

    private async refreshContentTypesTab(): Promise<void> {
        this.tabDataLoaded.delete('types');
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({ EntityName: 'MJ: Content Types', ResultType: 'simple' });
        if (result.Success) this.contentTypesRaw = result.Results;
        // The new contentTypesRaw reference flows to ClassifyTypesTabComponent via
        // [ContentTypes]="ContentTypesRaw", which rebuilds its cards on input change.
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
}

export function LoadAutotaggingPipelineResource(): void {
    // Prevents tree-shaking
}
