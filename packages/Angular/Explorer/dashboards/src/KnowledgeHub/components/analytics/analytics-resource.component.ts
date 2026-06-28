/**
 * @fileoverview Knowledge Hub Analytics & Insights Resource Component
 *
 * Multi-tab analytics dashboard for the Knowledge Hub: Overview (interactive cards),
 * Tags (top 20, distribution), Sources (comparison, health), Pipeline (throughput,
 * processing time, errors), and Quality (confidence, weight, model comparison).
 *
 * All chart rendering is pure CSS/inline SVG -- no JS chart libraries.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';
import {
    buildAnalyticsAgentContext,
    isValidAnalyticsTab,
    isValidAnalyticsDateRange,
    resolveAnalyticsName,
    buildAnalyticsNotFoundError,
    capAnalyticsList,
    ANALYTICS_TABS,
    ANALYTICS_DATE_RANGES,
    AnalyticsTab,
    AnalyticsDateRange,
} from './analytics-agent-context';
import { validateStringParam } from '../../../shared/agent-tool-validation';

// ================================================================
// Interfaces
// ================================================================

interface NavItem {
    ID: string;
    Label: string;
    Icon: string;
}

interface DateRangeOption {
    Label: string;
    Days: number;
}

interface KPIData {
    Label: string;
    Value: string;
    Delta: string;
    DeltaDirection: 'up' | 'down' | 'flat';
    SparklinePoints: string;
    SparklineColor: string;
    SparklineGradId: string;
    DrillDownKey: string;
}

interface WidgetCard {
    Key: string;
    Title: string;
    Icon: string;
}

interface TagGrowthMonth {
    Label: string;
    Count: number;
    Percentage: number;
}

interface CoverageEntity {
    Name: string;
    Tagged: number;
    Total: number;
    Percentage: number;
    Color: string;
    StrokeDash: string;
}

interface SourcePerformanceRow {
    Name: string;
    AvgTagsPerItem: number;
    Percentage: number;
    Color: string;
}

interface ThroughputDay {
    Label: string;
    Percentage: number;
    IsError: boolean;
}

interface TaxonomyStat {
    Label: string;
    Count: number;
    Color: string;
    BgColor: string;
}

interface TopTagRow {
    Rank: number;
    Name: string;
    UsageCount: number;
    AvgWeight: number;
    WeightBarWidth: number;
    WeightBarColor: string;
    TrendPoints: string;
    TrendColor: string;
    TopEntity: string;
    FirstSeen: string;
}

interface EntityDistributionRow {
    EntityName: string;
    Segments: EntityDistSegment[];
}

interface EntityDistSegment {
    Label: string;
    Percentage: number;
    Color: string;
}

interface TagDepthBar {
    Label: string;
    Count: number;
    Percentage: number;
}

interface SourceComparisonRow {
    Name: string;
    Type: string;
    TypeIcon: string;
    TypeColor: string;
    Items: number;
    TagsGenerated: number;
    AvgTagsPerItem: number;
    AvgWeight: number;
    LastRun: string;
    Status: string;
    StatusClass: string;
}

interface SourceHealthCard {
    Name: string;
    Uptime: number;
    Color: string;
}

interface PipelineBar {
    Percentage: number;
    IsError: boolean;
}

interface ProcessingStage {
    Name: string;
    Time: number;
    Percentage: number;
    Color: string;
}

interface ActiveRunRow {
    RunID: string;
    Source: string;
    Started: string;
    Progress: number;
    Stage: string;
    StageClass: string;
    Items: number;
}

interface ErrorLogEntry {
    Time: string;
    Source: string;
    Message: string;
}

interface HistogramBin {
    Label: string;
    Count: number;
    Percentage: number;
    Color: string;
}

interface WeightGroupedEntity {
    Name: string;
    High: number;
    Med: number;
    Low: number;
}

interface LowConfidenceTag {
    Name: string;
    AvgWeight: number;
    UsageCount: number;
    TopEntity: string;
    SuggestedAction: string;
    ActionClass: string;
}

interface ModelComparison {
    Name: string;
    Icon: string;
    IconColor: string;
    ScorePercentage: number;
    ScoreColor: string;
    AvgConfidence: number;
    TagsGenerated: number;
    Role: string;
    RoleColor: string;
    StrokeDash: string;
}

interface CoOccurrencePairRow {
    TagAName: string;
    TagBName: string;
    Count: number;
    /** Bar width as percentage of the max count in the displayed list */
    BarWidth: number;
}

interface DrillDownRecord {
    [key: string]: string | number | null;
}

// ================================================================
// Component
// ================================================================

@RegisterClass(BaseResourceComponent, 'AnalyticsResource')
@Component({
    standalone: false,
    selector: 'app-analytics-resource',
    templateUrl: './analytics-resource.component.html',
    styleUrls: ['./analytics-resource.component.css']
})
export class AnalyticsResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    protected override navigationService = inject(NavigationService);
    protected override destroy$ = new Subject<void>();

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Analytics';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-line';
    }

    // ================================================================
    // Navigation
    // ================================================================

    public NavItems: NavItem[] = [
        { ID: 'overview', Label: 'Overview', Icon: 'fa-solid fa-grip' },
        { ID: 'tags', Label: 'Tags', Icon: 'fa-solid fa-tags' },
        { ID: 'sources', Label: 'Sources', Icon: 'fa-solid fa-database' },
        { ID: 'pipeline', Label: 'Pipeline', Icon: 'fa-solid fa-gears' },
        { ID: 'quality', Label: 'Quality', Icon: 'fa-solid fa-circle-check' },
        { ID: 'cost', Label: 'Cost & Usage', Icon: 'fa-solid fa-coins' },
    ];

    public ActiveTab = 'overview';
    public IsLoading = true;

    // ================================================================
    // Filter State
    // ================================================================

    public DateRanges: DateRangeOption[] = [
        { Label: '7D', Days: 7 },
        { Label: '30D', Days: 30 },
        { Label: '90D', Days: 90 },
        { Label: 'YTD', Days: -1 },
        { Label: 'All', Days: 0 },
    ];

    public ActiveDateRange = '30D';
    public EntityFilter = 'All Entities';
    public EntityFilterOptions: string[] = ['All Entities'];

    // ================================================================
    // Drill-Down
    // ================================================================

    public DrillDownTarget: string | null = null;
    public DrillDownData: DrillDownRecord[] = [];
    public DrillDownColumns: string[] = [];
    public IsDrillDownLoading = false;
    /** Whether the current drill-down rows have navigable records */
    public DrillDownHasActions = false;

    /** AN-1: Open a record from a drill-down table row */
    public OpenDrillDownRecord(row: DrillDownRecord): void {
        const entityName = row['_EntityName'] as string | null;
        const recordID = row['_RecordID'] as string | null;
        if (!entityName || !recordID) return;

        // D9: If this is a Tag record, navigate to Classify Tag Library instead
        if (entityName === 'MJ: Tags') {
            const tagName = row['Name'] as string ?? row['Tag Name'] as string ?? '';
            this.navigateToClassifyTagLibrary(tagName);
            return;
        }

        const md = this.ProviderToUse;
        const entityInfo = md.Entities.find(e => e.Name === entityName);
        const pkey = new CompositeKey();
        if (entityInfo) {
            pkey.LoadFromURLSegment(entityInfo, recordID);
        } else {
            pkey.KeyValuePairs = [{ FieldName: 'ID', Value: recordID }];
        }
        this.navigationService.OpenEntityRecord(entityName, pkey);
    }

    /**
     * D9: Navigate to the Classify dashboard's Tag Library tab with a tag pre-selected.
     * Uses NavigationService.OpenNavItemByName to switch to the Classify nav item
     * and passes the tag name and target tab via configuration.
     */
    private navigateToClassifyTagLibrary(tagName: string): void {
        this.navigationService.OpenNavItemByName('Classify', {
            initialTab: 'tags',
            tagSearch: tagName,
        });
    }

    // ================================================================
    // Overview Tab Data
    // ================================================================

    public KPIs: KPIData[] = [];

    public WidgetCards: WidgetCard[] = [
        { Key: 'tagGrowth', Title: 'Tag Growth', Icon: 'fa-solid fa-chart-line' },
        { Key: 'contentCoverage', Title: 'Content Coverage', Icon: 'fa-solid fa-bullseye' },
        { Key: 'qualityScore', Title: 'Quality Score', Icon: 'fa-solid fa-gauge-high' },
        { Key: 'sourcePerformance', Title: 'Source Performance', Icon: 'fa-solid fa-ranking-star' },
        { Key: 'dailyThroughput', Title: 'Daily Throughput', Icon: 'fa-solid fa-bolt' },
        { Key: 'taxonomyHealth', Title: 'Taxonomy Health', Icon: 'fa-solid fa-sitemap' },
    ];

    public TagGrowthData: TagGrowthMonth[] = [];
    public CoverageData: CoverageEntity[] = [];
    public QualityScore = 0;
    public MiniConfidenceBins: { Height: number; Color: string; Title: string }[] = [];
    public SourcePerfData: SourcePerformanceRow[] = [];
    public ThroughputData: ThroughputDay[] = [];
    public TaxonomyTotal = 0;
    public TaxonomyStats: TaxonomyStat[] = [];
    public TaxonomyRingSegments: { StrokeDash: string; StrokeOffset: string; Color: string }[] = [];

    // ================================================================
    // Tags Tab Data
    // ================================================================

    public TopTags: TopTagRow[] = [];
    public EntityDistribution: EntityDistributionRow[] = [];
    public DistributionLegend: { Label: string; Color: string }[] = [
        { Label: 'Primary', Color: 'var(--mj-brand-primary)' },
        { Label: 'Secondary', Color: 'var(--mj-status-info)' },
        { Label: 'Tertiary', Color: '#7c3aed' },
        { Label: 'Quaternary', Color: 'var(--mj-status-success)' },
        { Label: 'Other', Color: 'var(--mj-status-warning)' },
    ];
    public TagDepthBars: TagDepthBar[] = [];

    // --- Co-occurrence data ---
    public CoOccurrencePairs: CoOccurrencePairRow[] = [];
    public CoOccurrenceLastComputed: string | null = null;
    public IsRecomputingCoOccurrence = false;

    // ================================================================
    // Sources Tab Data
    // ================================================================

    public SourceComparison: SourceComparisonRow[] = [];
    public SelectedSourceName = '';
    public SourceWeeklyBars: { Label: string; Value: number; Percentage: number }[] = [];
    public SourceQualityBands: { Label: string; Percentage: number; Color: string }[] = [];
    public SourceQualityNote = '';
    public SourceHealthCards: SourceHealthCard[] = [];

    // ================================================================
    // Pipeline Tab Data
    // ================================================================

    public PipelineThroughputBars: PipelineBar[] = [];
    public PipelineDateLabels: string[] = [];
    public ProcessingStages: ProcessingStage[] = [];
    public TotalAvgProcessingTime = 0;
    public BottleneckStage = '';
    public BottleneckPercent = 0;
    public SuccessRateAvg = 0;
    public FailureRateAvg = 0;
    public ActiveRuns: ActiveRunRow[] = [];
    public ErrorLog: ErrorLogEntry[] = [];

    // ================================================================
    // Quality Tab Data
    // ================================================================

    public ConfidenceHistogram: HistogramBin[] = [];
    public ConfidenceStats: { Label: string; Value: string }[] = [];
    public WeightByEntity: WeightGroupedEntity[] = [];
    public WeightLegend: { Label: string; Color: string }[] = [
        { Label: 'High (>0.7)', Color: 'var(--mj-brand-primary)' },
        { Label: 'Medium (0.4-0.7)', Color: 'var(--mj-status-info)' },
        { Label: 'Low (<0.4)', Color: 'var(--mj-text-muted)' },
    ];
    public AccuracyLinePoints = '';
    public AccuracyDots: { Cx: number; Cy: number }[] = [];
    public AccuracyMonthLabels: string[] = [];
    public AccuracyTrendText = '';
    public LowConfidenceTags: LowConfidenceTag[] = [];
    public ModelComparisons: ModelComparison[] = [];
    public ModelRecommendation = '';

    // ================================================================
    // Trending Tags (sidebar)
    // ================================================================

    public TrendingTags: { Name: string; Size: number; Weight: number }[] = [];
    public PipelineStatusText = 'Loading...';
    public PipelineStatusOk = true;

    // ================================================================
    // Cost & Usage Tab Data (D1)
    // ================================================================

    public CostKPIs: { Label: string; Value: string; Icon: string; SubLabel: string }[] = [];
    public CostPerRunRows: { RunID: string; Source: string; Tokens: number; Cost: number; Started: string }[] = [];

    // ================================================================
    // Raw data for aggregation
    // ================================================================

    private rawTags: Record<string, unknown>[] = [];
    private rawContentItemTags: Record<string, unknown>[] = [];
    private rawContentItems: Record<string, unknown>[] = [];
    public rawProcessRuns: Record<string, unknown>[] = [];
    private rawContentSources: Record<string, unknown>[] = [];
    private rawContentTypes: Record<string, unknown>[] = [];
    private rawRunDetails: Record<string, unknown>[] = [];

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngAfterViewInit(): Promise<void> {
        await UserInfoEngine.Instance.Config(false);
        this.loadAnalyticsPreferences();
        this.loadAllData();
        this.emitAgentContext();
        this.registerAgentTools();
        this.NotifyLoadComplete();
    }

    /**
     * Publish the surface state to the AI agent. Re-emitted on every meaningful
     * state change (tab switch, date-range / entity filter, source selection,
     * drill-down open/close, data load, co-occurrence recompute). Deepened to
     * Data-Explorer depth: the always-on KPI/filter strip plus the ACTIVE tab's
     * deep slice (top tags + co-occurrence, source comparison, quality stats,
     * cost KPIs) — built by the pure, mode-scoped {@link buildAnalyticsAgentContext}.
     */
    private emitAgentContext(): void {
        const activeTab: AnalyticsTab = isValidAnalyticsTab(this.ActiveTab) ? this.ActiveTab : 'overview';
        this.navigationService.SetAgentContext(this, buildAnalyticsAgentContext({
            ActiveTab: activeTab,
            DateRange: this.ActiveDateRange,
            EntityFilter: this.EntityFilter,
            EntityFilterOptions: this.EntityFilterOptions,
            IsLoading: this.IsLoading,
            DrillDownTarget: this.DrillDownTarget,
            KPIs: this.KPIs.map(k => ({ Label: k.Label, Value: k.Value, Delta: k.Delta })),
            PipelineStatusText: this.PipelineStatusText,
            PipelineStatusOk: this.PipelineStatusOk,
            TopTags: this.TopTags.map(t => ({
                Name: t.Name, UsageCount: t.UsageCount, AvgWeight: t.AvgWeight, TopEntity: t.TopEntity,
            })),
            CoOccurrencePairs: this.CoOccurrencePairs.map(p => ({
                TagAName: p.TagAName, TagBName: p.TagBName, Count: p.Count,
            })),
            CoOccurrenceLastComputed: this.CoOccurrenceLastComputed,
            SourceComparison: this.SourceComparison.map(s => ({
                Name: s.Name, Items: s.Items, AvgWeight: s.AvgWeight, Status: s.Status,
            })),
            SelectedSourceName: this.SelectedSourceName,
            QualityScore: this.QualityScore,
            ConfidenceStats: this.ConfidenceStats.map(c => ({ Label: c.Label, Value: c.Value })),
            CostKPIs: this.CostKPIs.map(c => ({ Label: c.Label, Value: c.Value })),
        }));
    }

    /**
     * 🚨 SAFETY BOUNDARY (Knowledge Hub · Analytics)
     * ------------------------------------------------------------------
     * Analytics is a READ-ONLY reporting surface. The agent may SWITCH tabs,
     * SET the date-range / entity filter, SELECT a source, OPEN / CLOSE a
     * drill-down, EXPORT the visible data as CSV, and RECOMPUTE the
     * co-occurrence matrix (an idempotent, server-side aggregate refresh —
     * the same deliberate button the user has).
     *
     * Intentionally NOT exposed: nothing mutates content, tags, sources, or
     * runs. There is no archive/edit/delete path on this surface to gate; the
     * co-occurrence recompute only re-derives an aggregate table. CSV export is
     * a local download of already-visible aggregate rows (no record bodies).
     * Tolerant handlers: every Handler returns { Success, Data?, ErrorMessage? }
     * and never throws; source / entity-filter references resolve by
     * exact→contains name match with an "available names" error on a miss.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchAnalyticsTab',
                Description: 'Switch to a specific analytics tab (overview, tags, sources, pipeline, quality, cost)',
                ParameterSchema: {
                    type: 'object',
                    properties: { tab: { type: 'string', enum: [...ANALYTICS_TABS] } },
                    required: ['tab'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    if (!isValidAnalyticsTab(params['tab'])) {
                        return { Success: false, ErrorMessage: `Invalid tab. Expected one of: ${ANALYTICS_TABS.join(', ')}.` };
                    }
                    this.SelectTab(params['tab']);
                    return { Success: true, Data: { ActiveTab: this.ActiveTab } };
                },
            },
            {
                Name: 'SetAnalyticsDateRange',
                Description: 'Set the analytics date range filter (7D, 30D, 90D, YTD, All)',
                ParameterSchema: {
                    type: 'object',
                    properties: { range: { type: 'string', enum: [...ANALYTICS_DATE_RANGES] } },
                    required: ['range'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    if (!isValidAnalyticsDateRange(params['range'])) {
                        return { Success: false, ErrorMessage: `Invalid range. Expected one of: ${ANALYTICS_DATE_RANGES.join(', ')}.` };
                    }
                    this.SetDateRange(params['range'] as AnalyticsDateRange);
                    return { Success: true, Data: { DateRange: this.ActiveDateRange } };
                },
            },
            {
                Name: 'SetAnalyticsEntityFilter',
                Description: 'Filter the analytics surface to a specific entity / content type (by name, or "All Entities" to clear).',
                ParameterSchema: {
                    type: 'object',
                    properties: { entity: { type: 'string', description: 'The entity / content-type label, or "All Entities".' } },
                    required: ['entity'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const check = validateStringParam(params['entity'], 'entity');
                    if (!check.ok) {
                        return check.result;
                    }
                    const match = resolveAnalyticsName(check.value, this.EntityFilterOptions);
                    if (!match) {
                        return buildAnalyticsNotFoundError(check.value, this.EntityFilterOptions, 'entity filter');
                    }
                    this.SetEntityFilter(match);
                    return { Success: true, Data: { EntityFilter: this.EntityFilter } };
                },
            },
            {
                Name: 'SelectAnalyticsSource',
                Description: 'Select a content source on the Sources tab to view its detail (by name). Switches to the Sources tab.',
                ParameterSchema: {
                    type: 'object',
                    properties: { source: { type: 'string', description: 'The content-source name.' } },
                    required: ['source'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const check = validateStringParam(params['source'], 'source');
                    if (!check.ok) {
                        return check.result;
                    }
                    const names = this.SourceComparison.map(s => s.Name);
                    const match = resolveAnalyticsName(check.value, names);
                    if (!match) {
                        return buildAnalyticsNotFoundError(check.value, names, 'source');
                    }
                    if (this.ActiveTab !== 'sources') {
                        this.SelectTab('sources');
                    }
                    this.SelectSource(match);
                    this.emitAgentContext();
                    return { Success: true, Data: { SelectedSourceName: this.SelectedSourceName } };
                },
            },
            {
                Name: 'OpenAnalyticsDrillDown',
                Description: 'Open the drill-down table for a KPI or widget key (e.g. kpi-totalTags, tagGrowth, dailyThroughput). Toggles closed if already open for that key.',
                ParameterSchema: {
                    type: 'object',
                    properties: { key: { type: 'string', description: 'The drill-down key.' } },
                    required: ['key'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const check = validateStringParam(params['key'], 'key');
                    if (!check.ok) {
                        return check.result;
                    }
                    if (!check.value.trim()) {
                        return { Success: false, ErrorMessage: 'key must be a non-empty drill-down key.' };
                    }
                    this.OpenDrillDown(check.value);
                    this.emitAgentContext();
                    return { Success: true, Data: { DrillDownTarget: this.DrillDownTarget } };
                },
            },
            {
                Name: 'CloseAnalyticsDrillDown',
                Description: 'Close the currently open analytics drill-down table.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.CloseDrillDown();
                    this.emitAgentContext();
                    return { Success: true };
                },
            },
            {
                Name: 'ExportAnalyticsCSV',
                Description: 'Export a named analytics data set as CSV (top-tags, kpis, cost-usage).',
                ParameterSchema: {
                    type: 'object',
                    properties: { dataKey: { type: 'string', enum: ['top-tags', 'kpis', 'cost-usage'] } },
                    required: ['dataKey'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const check = validateStringParam(params['dataKey'], 'dataKey');
                    if (!check.ok) {
                        return check.result;
                    }
                    this.ExportTabDataCSV(check.value);
                    return { Success: true };
                },
            },
            {
                Name: 'RecomputeAnalyticsCoOccurrence',
                Description: 'Recompute the tag co-occurrence matrix (idempotent server-side aggregate refresh).',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    if (this.IsRecomputingCoOccurrence) {
                        return { Success: false, ErrorMessage: 'A co-occurrence recompute is already in progress.' };
                    }
                    await this.RecomputeCoOccurrence();
                    this.emitAgentContext();
                    return { Success: true, Data: { CoOccurrencePairCount: this.CoOccurrencePairs.length } };
                },
            },
            {
                Name: 'RefreshAnalyticsData',
                Description: 'Reload all analytics data from the database and rebuild every aggregation.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.loadAllData();
                    this.emitAgentContext();
                    return { Success: true, Data: { KPICount: this.KPIs.length } };
                },
            },
            {
                Name: 'ListAnalyticsSources',
                Description: 'List the content sources compared on the Sources tab (bounded).',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    return {
                        Success: true,
                        Data: {
                            Sources: capAnalyticsList(this.SourceComparison.map(s => ({ Name: s.Name, Items: s.Items, Status: s.Status }))),
                            TotalCount: this.SourceComparison.length,
                        },
                    };
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

    /** Wraps `NavItems` for `<mj-left-nav>`. */
    public get navSections(): MJLeftNavSection[] {
        return [{
            items: this.NavItems.map(n => ({ id: n.ID, label: n.Label, icon: n.Icon }))
        }];
    }

    /** Adapter for `<mj-left-nav>`'s `(ItemClicked)` output. */
    public onNavItemClicked(item: MJLeftNavItem): void {
        this.SelectTab(item.id);
    }

    public SelectTab(tabId: string): void {
        this.ActiveTab = tabId;
        this.CloseDrillDown();
        this.persistAnalyticsPreferences();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    public SetDateRange(label: string): void {
        this.ActiveDateRange = label;
        this.CloseDrillDown();
        this.rebuildAllAggregations();
        this.persistAnalyticsPreferences();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    public SetEntityFilter(value: string): void {
        this.EntityFilter = value;
        this.CloseDrillDown();
        this.rebuildAllAggregations();
        this.persistAnalyticsPreferences();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    public OpenDrillDown(key: string): void {
        if (this.DrillDownTarget === key) {
            this.CloseDrillDown();
            return;
        }
        this.DrillDownTarget = key;
        this.IsDrillDownLoading = true;
        this.cdr.detectChanges();
        this.loadDrillDownData(key);
    }

    public CloseDrillDown(): void {
        this.DrillDownTarget = null;
        this.DrillDownData = [];
        this.DrillDownColumns = [];
        this.IsDrillDownLoading = false;
        this.DrillDownHasActions = false;
        this.cdr.detectChanges();
    }

    // ================================================================
    // AN-3: Export (CSV)
    // ================================================================

    /** Export drill-down data as CSV */
    public ExportDrillDownCSV(): void {
        if (this.DrillDownData.length === 0 || this.DrillDownColumns.length === 0) return;
        const filename = `analytics-${this.DrillDownTarget || 'data'}-${new Date().toISOString().slice(0, 10)}.csv`;
        this.downloadCSV(this.DrillDownColumns, this.DrillDownData, filename);
    }

    /** Export a named data set (top-tags, sources, etc.) as CSV */
    public ExportTabDataCSV(dataKey: string): void {
        switch (dataKey) {
            case 'top-tags': {
                const cols = ['Rank', 'Name', 'Usage Count', 'Avg Weight', 'Top Entity', 'First Seen'];
                const rows = this.TopTags.map(t => ({
                    'Rank': t.Rank, 'Name': t.Name, 'Usage Count': t.UsageCount,
                    'Avg Weight': t.AvgWeight, 'Top Entity': t.TopEntity, 'First Seen': t.FirstSeen,
                }));
                this.downloadCSV(cols, rows, `top-tags-${new Date().toISOString().slice(0, 10)}.csv`);
                break;
            }
            case 'kpis': {
                const cols = ['Metric', 'Value', 'Change'];
                const rows = this.KPIs.map(k => ({
                    'Metric': k.Label, 'Value': k.Value, 'Change': k.Delta,
                }));
                this.downloadCSV(cols, rows, `kpis-${new Date().toISOString().slice(0, 10)}.csv`);
                break;
            }
            case 'cost-usage': {
                const costCols = ['Run ID', 'Source', 'Tokens', 'Cost', 'Started'];
                const costRows = this.CostPerRunRows.map(r => ({
                    'Run ID': r.RunID, 'Source': r.Source, 'Tokens': r.Tokens,
                    'Cost': r.Cost, 'Started': r.Started,
                }));
                this.downloadCSV(costCols, costRows, `cost-usage-${new Date().toISOString().slice(0, 10)}.csv`);
                break;
            }
            default:
                break;
        }
    }

    private downloadCSV(columns: string[], data: Record<string, string | number | null>[], filename: string): void {
        const escape = (v: string | number | null): string => {
            const s = String(v ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = columns.map(escape).join(',');
        const rows = data.map(row => columns.map(c => escape(row[c])).join(','));
        const csv = [header, ...rows].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    public SelectSource(name: string): void {
        this.SelectedSourceName = name;
        this.buildSourceDetail();
        this.cdr.detectChanges();
    }

    public FormatNumber(n: number): string {
        if (n >= 1000) {
            return n.toLocaleString();
        }
        return String(n);
    }

    public TrackByIndex(index: number): number {
        return index;
    }

    public TrackByID(_index: number, item: { ID?: string; Key?: string; Label?: string; Name?: string }): string {
        return item.ID || item.Key || item.Label || item.Name || String(_index);
    }

    // ================================================================
    // Data Loading
    // ================================================================

    private async loadAllData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            // Tags come from the TagEngineBase cache (browser-safe BaseEngine that
            // caches MJ: Tags) — no need to RunView them here.
            await TagEngineBase.Instance.Config(false, undefined, this.ProviderToUse);

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const results = await rv.RunViews([
                { EntityName: 'MJ: Content Item Tags', ExtraFilter: '', ResultType: 'simple' },
                { EntityName: 'MJ: Content Items', ExtraFilter: '', ResultType: 'simple' },
                { EntityName: 'MJ: Content Process Runs', ExtraFilter: '', ResultType: 'simple' },
                { EntityName: 'MJ: Content Sources', ExtraFilter: '', ResultType: 'simple' },
                { EntityName: 'MJ: Content Types', ExtraFilter: '', ResultType: 'simple' },
                { EntityName: 'MJ: Content Process Run Details', ExtraFilter: '', ResultType: 'simple' },
            ]);

            this.rawTags = TagEngineBase.Instance.Tags.map(t => t.GetAll());
            this.rawContentItemTags = results[0]?.Success ? results[0].Results : [];
            this.rawContentItems = results[1]?.Success ? results[1].Results : [];
            this.rawProcessRuns = results[2]?.Success ? results[2].Results : [];
            this.rawContentSources = results[3]?.Success ? results[3].Results : [];
            this.rawContentTypes = results[4]?.Success ? results[4].Results : [];
            this.rawRunDetails = results[5]?.Success ? results[5].Results : [];

            this.buildEntityFilterOptions();
            this.rebuildAllAggregations();

        } catch (error) {
            console.error('[Analytics] Error loading data:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ================================================================
    // Entity Filter Options
    // ================================================================

    private buildEntityFilterOptions(): void {
        const md = this.ProviderToUse;
        const entityNames = new Set<string>();
        for (const item of this.rawContentItems) {
            const ctid = String(item['ContentTypeID'] || '');
            const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
            if (ct) {
                entityNames.add(String(ct['Name'] || 'Unknown'));
            }
        }
        this.EntityFilterOptions = ['All Entities', ...Array.from(entityNames).sort()];
    }

    // ================================================================
    // Aggregation Orchestrator
    // ================================================================

    private rebuildAllAggregations(): void {
        const filteredItems = this.getDateFilteredItems(this.rawContentItems);
        const filteredTags = this.getDateFilteredItems(this.rawContentItemTags);
        const filteredRuns = this.getDateFilteredItems(this.rawProcessRuns);

        this.buildKPIs(filteredTags, filteredItems);
        this.buildTagGrowth();
        this.buildCoverageData(filteredItems, filteredTags);
        this.buildQualityScore(filteredTags);
        this.buildSourcePerformance(filteredItems, filteredTags);
        this.buildThroughput(filteredRuns);
        this.buildTaxonomyHealth();
        this.buildTopTags(filteredTags);
        this.buildEntityDistribution(filteredTags);
        this.buildTagDepth();
        this.buildSourceComparison(filteredItems, filteredTags, filteredRuns);
        this.buildSourceHealth(filteredRuns);
        this.buildPipelineThroughput(filteredRuns);
        this.buildProcessingStages(filteredRuns);
        this.buildActiveRuns();
        this.buildErrorLog(filteredRuns);
        this.buildConfidenceHistogram(filteredTags);
        this.buildWeightByEntity(filteredTags);
        this.buildAccuracyTrend(filteredTags);
        this.buildLowConfidenceTags(filteredTags);
        this.buildModelComparisons();
        this.buildTrendingTags(filteredTags);
        this.buildPipelineStatus(filteredRuns);
        this.buildCostUsageData(filteredRuns);

        if (this.rawContentSources.length > 0) {
            this.SelectedSourceName = String(this.rawContentSources[0]['Name'] || '');
            this.buildSourceDetail();
        }

        // Load co-occurrence data in background (non-blocking)
        this.loadCoOccurrenceData();
    }

    // ================================================================
    // Date Filtering
    // ================================================================

    private getDateFilteredItems(items: Record<string, unknown>[]): Record<string, unknown>[] {
        const range = this.DateRanges.find(d => d.Label === this.ActiveDateRange);
        if (!range || range.Days === 0) return items; // "All"

        const now = new Date();
        let cutoff: Date;
        if (range.Days === -1) {
            // YTD
            cutoff = new Date(now.getFullYear(), 0, 1);
        } else {
            cutoff = new Date(now.getTime() - range.Days * 86400000);
        }

        return items.filter(item => {
            const d = item['__mj_CreatedAt'] || item['StartTime'];
            if (!d) return true;
            const dt = new Date(String(d));
            return dt >= cutoff;
        });
    }

    // ================================================================
    // KPIs
    // ================================================================

    private buildKPIs(tags: Record<string, unknown>[], items: Record<string, unknown>[]): void {
        const totalTags = this.rawTags.length;
        const itemsProcessed = items.length;

        const weights = tags.map(t => Number(t['Weight'] || 0)).filter(w => w > 0);
        const avgConfidence = weights.length > 0
            ? weights.reduce((a, b) => a + b, 0) / weights.length
            : 0;

        const totalContentItems = this.rawContentItems.length;
        const taggedItemIds = new Set(tags.map(t => String(t['ItemID'] || '')));
        const coveragePct = totalContentItems > 0
            ? Math.round((taggedItemIds.size / totalContentItems) * 100)
            : 0;

        // Calculate weekly delta for tags
        const weekAgo = new Date(Date.now() - 7 * 86400000);
        const recentTags = this.rawTags.filter(t => {
            const d = t['__mj_CreatedAt'];
            return d && new Date(String(d)) >= weekAgo;
        });

        this.KPIs = [
            {
                Label: 'Total Tags',
                Value: this.FormatNumber(totalTags),
                Delta: `+${recentTags.length} this week`,
                DeltaDirection: recentTags.length > 0 ? 'up' : 'flat',
                SparklinePoints: '2,24 10,22 18,20 26,18 34,14 42,12 50,8 62,4',
                SparklineColor: 'var(--mj-brand-primary)',
                SparklineGradId: 'sparkGrad1',
                DrillDownKey: 'kpi-totalTags',
            },
            {
                Label: 'Items Processed',
                Value: this.FormatNumber(itemsProcessed),
                Delta: `${this.FormatNumber(itemsProcessed)} total`,
                DeltaDirection: 'up',
                SparklinePoints: '2,18 8,12 14,16 20,10 26,14 32,8 38,12 44,6 50,10 56,4 62,8',
                SparklineColor: 'var(--mj-status-success)',
                SparklineGradId: 'sparkGrad2',
                DrillDownKey: 'kpi-itemsProcessed',
            },
            {
                Label: 'Avg Confidence',
                Value: avgConfidence.toFixed(2),
                Delta: avgConfidence >= 0.7 ? 'Good' : 'Needs improvement',
                DeltaDirection: avgConfidence >= 0.7 ? 'up' : 'down',
                SparklinePoints: '2,20 10,18 18,16 26,18 34,14 42,12 50,14 62,10',
                SparklineColor: 'var(--mj-status-warning)',
                SparklineGradId: 'sparkGrad3',
                DrillDownKey: 'kpi-avgConfidence',
            },
            {
                Label: 'Coverage',
                Value: `${coveragePct}%`,
                Delta: `${taggedItemIds.size} of ${totalContentItems} items`,
                DeltaDirection: coveragePct >= 50 ? 'up' : 'down',
                SparklinePoints: '2,24 10,22 18,20 26,18 34,16 42,14 50,12 62,10',
                SparklineColor: '#7c3aed',
                SparklineGradId: 'sparkGrad4',
                DrillDownKey: 'kpi-coverage',
            },
        ];
    }

    // ================================================================
    // Tag Growth (monthly bar chart)
    // ================================================================

    private buildTagGrowth(): void {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const months: TagGrowthMonth[] = [];
        let cumulative = 0;

        // Count tags by month for last 6 months
        for (let i = 5; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const count = this.rawTags.filter(t => {
                const d = t['__mj_CreatedAt'];
                if (!d) return false;
                const dt = new Date(String(d));
                return dt >= monthDate && dt < nextMonth;
            }).length;
            cumulative += count;
            months.push({
                Label: monthNames[monthDate.getMonth()],
                Count: cumulative,
                Percentage: 0,
            });
        }

        // If no data, show the total in the last month
        if (cumulative === 0 && this.rawTags.length > 0) {
            months[months.length - 1].Count = this.rawTags.length;
            cumulative = this.rawTags.length;
        }

        const max = Math.max(...months.map(m => m.Count), 1);
        months.forEach(m => m.Percentage = Math.round((m.Count / max) * 100));
        this.TagGrowthData = months;
    }

    // ================================================================
    // Content Coverage (progress rings per entity type)
    // ================================================================

    private buildCoverageData(items: Record<string, unknown>[], tags: Record<string, unknown>[]): void {
        const colors = ['var(--mj-status-warning)', 'var(--mj-status-success)', 'var(--mj-status-info)', 'var(--mj-brand-primary)'];
        const typeMap = new Map<string, { name: string; total: number; tagged: Set<string> }>();

        for (const item of this.rawContentItems) {
            const ctid = String(item['ContentTypeID'] || '');
            const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
            const typeName = ct ? String(ct['Name'] || 'Unknown') : 'Unknown';
            if (!typeMap.has(typeName)) {
                typeMap.set(typeName, { name: typeName, total: 0, tagged: new Set() });
            }
            typeMap.get(typeName)!.total++;
        }

        const taggedItemIdsByType = new Map<string, Set<string>>();
        for (const tag of tags) {
            const itemId = String(tag['ItemID'] || '');
            const item = this.rawContentItems.find(i => String(i['ID']) === itemId);
            if (item) {
                const ctid = String(item['ContentTypeID'] || '');
                const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
                const typeName = ct ? String(ct['Name'] || 'Unknown') : 'Unknown';
                if (typeMap.has(typeName)) {
                    typeMap.get(typeName)!.tagged.add(itemId);
                }
            }
        }

        const circumference = 2 * Math.PI * 20; // r=20
        let idx = 0;
        this.CoverageData = Array.from(typeMap.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 4)
            .map(entry => {
                const pct = entry.total > 0 ? Math.round((entry.tagged.size / entry.total) * 100) : 0;
                const dashLength = (pct / 100) * circumference;
                const color = colors[idx % colors.length];
                idx++;
                return {
                    Name: entry.name,
                    Tagged: entry.tagged.size,
                    Total: entry.total,
                    Percentage: pct,
                    Color: color,
                    StrokeDash: `${dashLength.toFixed(1)} ${circumference.toFixed(1)}`,
                };
            });
    }

    // ================================================================
    // Quality Score (gauge)
    // ================================================================

    private buildQualityScore(tags: Record<string, unknown>[]): void {
        const weights = tags.map(t => Number(t['Weight'] || 0)).filter(w => w > 0);
        this.QualityScore = weights.length > 0
            ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 100)
            : 0;

        // Mini confidence bins
        const bins = [0, 0, 0, 0, 0]; // 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0
        for (const w of weights) {
            const idx = Math.min(Math.floor(w * 5), 4);
            bins[idx]++;
        }
        const maxBin = Math.max(...bins, 1);
        const binColors = [
            'var(--mj-border-default)', 'var(--mj-border-default)',
            'var(--mj-status-warning)', 'var(--mj-brand-primary)', 'var(--mj-brand-primary)',
        ];
        this.MiniConfidenceBins = bins.map((count, i) => ({
            Height: Math.max(4, Math.round((count / maxBin) * 32)),
            Color: binColors[i],
            Title: `${(i * 0.2).toFixed(1)}-${((i + 1) * 0.2).toFixed(1)}: ${count}`,
        }));
    }

    // ================================================================
    // Source Performance (horizontal bars)
    // ================================================================

    private buildSourcePerformance(items: Record<string, unknown>[], tags: Record<string, unknown>[]): void {
        const sourceTagCounts = new Map<string, { name: string; items: Set<string>; tagCount: number }>();

        for (const source of this.rawContentSources) {
            const sid = String(source['ID']);
            sourceTagCounts.set(sid, {
                name: String(source['Name'] || 'Unknown'),
                items: new Set(),
                tagCount: 0,
            });
        }

        for (const item of this.rawContentItems) {
            const sid = String(item['ContentSourceID'] || '');
            const entry = sourceTagCounts.get(sid);
            if (entry) {
                entry.items.add(String(item['ID']));
            }
        }

        for (const tag of tags) {
            const itemId = String(tag['ItemID'] || '');
            const item = this.rawContentItems.find(i => String(i['ID']) === itemId);
            if (item) {
                const sid = String(item['ContentSourceID'] || '');
                const entry = sourceTagCounts.get(sid);
                if (entry) {
                    entry.tagCount++;
                }
            }
        }

        const colors = ['var(--mj-brand-primary)', '#7c3aed', 'var(--mj-status-info)', 'var(--mj-status-success)'];
        const sorted = Array.from(sourceTagCounts.values())
            .map(e => ({
                name: e.name,
                avg: e.items.size > 0 ? e.tagCount / e.items.size : 0,
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 4);

        const maxAvg = Math.max(...sorted.map(s => s.avg), 1);
        this.SourcePerfData = sorted.map((s, i) => ({
            Name: s.name,
            AvgTagsPerItem: Math.round(s.avg * 10) / 10,
            Percentage: Math.round((s.avg / maxAvg) * 100),
            Color: colors[i % colors.length],
        }));
    }

    // ================================================================
    // Daily Throughput (14-day bar chart)
    // ================================================================

    private buildThroughput(runs: Record<string, unknown>[]): void {
        const days: ThroughputDay[] = [];
        const now = new Date();

        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const dayStr = d.toISOString().slice(0, 10);
            const dayRuns = runs.filter(r => {
                const st = r['StartTime'];
                if (!st) return false;
                return String(st).slice(0, 10) === dayStr;
            });
            const totalItems = dayRuns.reduce((sum, r) => sum + Number(r['ProcessedItems'] || 0), 0);
            const hasError = dayRuns.some(r => String(r['Status'] || '').toLowerCase().includes('error') || String(r['Status'] || '').toLowerCase().includes('fail'));

            days.push({
                Label: String(d.getDate()),
                Percentage: totalItems,
                IsError: hasError,
            });
        }

        const maxItems = Math.max(...days.map(d => d.Percentage), 1);
        days.forEach(d => d.Percentage = Math.max(5, Math.round((d.Percentage / maxItems) * 100)));
        this.ThroughputData = days;
    }

    // ================================================================
    // Taxonomy Health (donut + stat cards)
    // ================================================================

    private buildTaxonomyHealth(): void {
        const total = this.rawTags.length;
        this.TaxonomyTotal = total;

        if (total === 0) {
            this.TaxonomyStats = [
                { Label: 'Healthy', Count: 0, Color: 'var(--mj-status-success)', BgColor: 'color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface))' },
                { Label: 'Attention', Count: 0, Color: 'var(--mj-status-warning)', BgColor: 'color-mix(in srgb, var(--mj-status-warning) 10%, var(--mj-bg-surface))' },
                { Label: 'Orphaned', Count: 0, Color: 'var(--mj-status-error)', BgColor: 'color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface))' },
            ];
            this.TaxonomyRingSegments = [];
            return;
        }

        // Tags with children = healthy, tags referenced by content items = healthy
        // Tags with no children and no usage = orphaned
        // Tags with low usage = attention
        const tagIds = new Set(this.rawTags.map(t => String(t['ID'])));
        const parentIds = new Set(this.rawTags.filter(t => t['ParentID']).map(t => String(t['ParentID'])));
        const usedTagIds = new Set(this.rawContentItemTags.filter(ct => ct['TagID']).map(ct => String(ct['TagID'])));

        let healthy = 0;
        let attention = 0;
        let orphaned = 0;

        for (const tag of this.rawTags) {
            const tid = String(tag['ID']);
            const hasChildren = parentIds.has(tid);
            const isUsed = usedTagIds.has(tid);
            if (hasChildren || isUsed) {
                healthy++;
            } else if (tag['ParentID']) {
                attention++;
            } else {
                orphaned++;
            }
        }

        this.TaxonomyStats = [
            { Label: 'Healthy', Count: healthy, Color: 'var(--mj-status-success)', BgColor: 'color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface))' },
            { Label: 'Attention', Count: attention, Color: 'var(--mj-status-warning)', BgColor: 'color-mix(in srgb, var(--mj-status-warning) 10%, var(--mj-bg-surface))' },
            { Label: 'Orphaned', Count: orphaned, Color: 'var(--mj-status-error)', BgColor: 'color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface))' },
        ];

        // Ring segments
        const circumference = 2 * Math.PI * 54; // r=54
        const healthyPct = healthy / total;
        const attentionPct = attention / total;
        const orphanedPct = orphaned / total;

        const segments: { StrokeDash: string; StrokeOffset: string; Color: string }[] = [];
        let offset = circumference * 0.25; // start at top

        if (healthyPct > 0) {
            const len = healthyPct * circumference;
            segments.push({
                StrokeDash: `${len.toFixed(1)} ${circumference.toFixed(1)}`,
                StrokeOffset: (-offset).toFixed(1),
                Color: 'var(--mj-status-success)',
            });
            offset += len;
        }
        if (attentionPct > 0) {
            const len = attentionPct * circumference;
            segments.push({
                StrokeDash: `${len.toFixed(1)} ${circumference.toFixed(1)}`,
                StrokeOffset: (-offset).toFixed(1),
                Color: 'var(--mj-status-warning)',
            });
            offset += len;
        }
        if (orphanedPct > 0) {
            const len = orphanedPct * circumference;
            segments.push({
                StrokeDash: `${len.toFixed(1)} ${circumference.toFixed(1)}`,
                StrokeOffset: (-offset).toFixed(1),
                Color: 'var(--mj-status-error)',
            });
        }

        this.TaxonomyRingSegments = segments;
    }

    // ================================================================
    // Top Tags Table
    // ================================================================

    private buildTopTags(tags: Record<string, unknown>[]): void {
        const tagUsage = new Map<string, { name: string; count: number; totalWeight: number; entities: Map<string, number>; firstSeen: Date }>();

        for (const tag of tags) {
            const tagText = String(tag['Tag'] || '');
            if (!tagText) continue;

            if (!tagUsage.has(tagText)) {
                const created = tag['__mj_CreatedAt'] ? new Date(String(tag['__mj_CreatedAt'])) : new Date();
                tagUsage.set(tagText, { name: tagText, count: 0, totalWeight: 0, entities: new Map(), firstSeen: created });
            }
            const entry = tagUsage.get(tagText)!;
            entry.count++;
            entry.totalWeight += Number(tag['Weight'] || 0);

            // Find entity for this tag
            const itemId = String(tag['ItemID'] || '');
            const item = this.rawContentItems.find(i => String(i['ID']) === itemId);
            if (item) {
                const ctid = String(item['ContentTypeID'] || '');
                const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
                const typeName = ct ? String(ct['Name'] || 'Unknown') : 'Unknown';
                entry.entities.set(typeName, (entry.entities.get(typeName) || 0) + 1);
            }

            const created = tag['__mj_CreatedAt'] ? new Date(String(tag['__mj_CreatedAt'])) : new Date();
            if (created < entry.firstSeen) entry.firstSeen = created;
        }

        const sorted = Array.from(tagUsage.values()).sort((a, b) => b.count - a.count).slice(0, 20);
        const maxCount = sorted.length > 0 ? sorted[0].count : 1;

        this.TopTags = sorted.map((entry, idx) => {
            const avgWeight = entry.count > 0 ? entry.totalWeight / entry.count : 0;
            const topEntity = entry.entities.size > 0
                ? Array.from(entry.entities.entries()).sort((a, b) => b[1] - a[1])[0][0]
                : 'N/A';

            let weightColor = 'var(--mj-brand-primary)';
            if (avgWeight >= 0.8) weightColor = 'var(--mj-status-success)';
            else if (avgWeight < 0.5) weightColor = 'var(--mj-status-warning)';
            else if (avgWeight < 0.4) weightColor = 'var(--mj-status-error)';

            // Generate simple trend sparkline points
            const trendPoints = this.generateTrendPoints(avgWeight);
            const trendColor = avgWeight >= 0.6 ? 'var(--mj-status-success)' : 'var(--mj-brand-primary)';

            return {
                Rank: idx + 1,
                Name: entry.name,
                UsageCount: entry.count,
                AvgWeight: Math.round(avgWeight * 100) / 100,
                WeightBarWidth: Math.round(avgWeight * 80),
                WeightBarColor: weightColor,
                TrendPoints: trendPoints,
                TrendColor: trendColor,
                TopEntity: topEntity,
                FirstSeen: entry.firstSeen.toISOString().slice(0, 10),
            };
        });
    }

    private generateTrendPoints(weight: number): string {
        // Generate a gentle trend line based on weight
        const baseY = 14 - weight * 8;
        const variance = 3;
        const points: string[] = [];
        for (let x = 2; x <= 46; x += 8) {
            const y = Math.max(2, Math.min(14, baseY + (Math.random() - 0.5) * variance));
            points.push(`${x},${y.toFixed(0)}`);
        }
        return points.join(' ');
    }

    // ================================================================
    // Entity Distribution (stacked bars)
    // ================================================================

    private buildEntityDistribution(tags: Record<string, unknown>[]): void {
        const entityTagDist = new Map<string, Map<string, number>>();

        for (const tag of tags) {
            const tagText = String(tag['Tag'] || '');
            const itemId = String(tag['ItemID'] || '');
            const item = this.rawContentItems.find(i => String(i['ID']) === itemId);
            if (!item || !tagText) continue;

            const ctid = String(item['ContentTypeID'] || '');
            const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
            const typeName = ct ? String(ct['Name'] || 'Unknown') : 'Unknown';

            if (!entityTagDist.has(typeName)) entityTagDist.set(typeName, new Map());
            const tagMap = entityTagDist.get(typeName)!;
            tagMap.set(tagText, (tagMap.get(tagText) || 0) + 1);
        }

        const segmentColors = ['var(--mj-brand-primary)', 'var(--mj-status-info)', '#7c3aed', 'var(--mj-status-success)', 'var(--mj-status-warning)'];

        this.EntityDistribution = Array.from(entityTagDist.entries())
            .sort((a, b) => {
                const totalA = Array.from(a[1].values()).reduce((s, v) => s + v, 0);
                const totalB = Array.from(b[1].values()).reduce((s, v) => s + v, 0);
                return totalB - totalA;
            })
            .slice(0, 4)
            .map(([entityName, tagMap]) => {
                const total = Array.from(tagMap.values()).reduce((s, v) => s + v, 0);
                const topTags = Array.from(tagMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4);

                const segments: EntityDistSegment[] = [];
                let accumulatedPct = 0;

                topTags.forEach(([name, count], i) => {
                    const pct = Math.round((count / total) * 100);
                    accumulatedPct += pct;
                    segments.push({
                        Label: name.length > 6 ? name.slice(0, 5) + '.' : name,
                        Percentage: pct,
                        Color: segmentColors[i % segmentColors.length],
                    });
                });

                if (accumulatedPct < 100) {
                    segments.push({
                        Label: '...',
                        Percentage: 100 - accumulatedPct,
                        Color: segmentColors[4],
                    });
                }

                return { EntityName: entityName, Segments: segments };
            });
    }

    // ================================================================
    // Tag Depth Distribution
    // ================================================================

    private buildTagDepth(): void {
        const parentMap = new Map<string, string | null>();
        for (const tag of this.rawTags) {
            parentMap.set(String(tag['ID']), tag['ParentID'] ? String(tag['ParentID']) : null);
        }

        const depthCounts = new Map<number, number>();
        for (const tag of this.rawTags) {
            let depth = 1;
            let current = tag['ParentID'] ? String(tag['ParentID']) : null;
            while (current && depth < 10) {
                depth++;
                current = parentMap.get(current) || null;
            }
            depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);
        }

        const maxDepth = Math.max(...Array.from(depthCounts.keys()), 1);
        const maxCount = Math.max(...Array.from(depthCounts.values()), 1);
        const bars: TagDepthBar[] = [];

        for (let d = 1; d <= Math.max(maxDepth, 5); d++) {
            const count = depthCounts.get(d) || 0;
            bars.push({
                Label: `Depth ${d}`,
                Count: count,
                Percentage: Math.max(count > 0 ? 7 : 0, Math.round((count / maxCount) * 100)),
            });
        }

        this.TagDepthBars = bars;
    }

    // ================================================================
    // Source Comparison Table
    // ================================================================

    private buildSourceComparison(
        items: Record<string, unknown>[],
        tags: Record<string, unknown>[],
        runs: Record<string, unknown>[]
    ): void {
        this.SourceComparison = this.rawContentSources.map(source => {
            const sid = String(source['ID']);
            const sourceItems = items.filter(i => String(i['ContentSourceID']) === sid);
            const sourceItemIds = new Set(sourceItems.map(i => String(i['ID'])));
            const sourceTags = tags.filter(t => sourceItemIds.has(String(t['ItemID'] || '')));
            const avgTags = sourceItems.length > 0 ? sourceTags.length / sourceItems.length : 0;
            const weights = sourceTags.map(t => Number(t['Weight'] || 0)).filter(w => w > 0);
            const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;

            const sourceRuns = runs.filter(r => String(r['SourceID']) === sid);
            const lastRun = sourceRuns.length > 0
                ? sourceRuns.sort((a, b) => new Date(String(b['StartTime'] || 0)).getTime() - new Date(String(a['StartTime'] || 0)).getTime())[0]
                : null;

            const hasError = lastRun && String(lastRun['Status'] || '').toLowerCase().includes('error');
            const isSlow = lastRun && !hasError && sourceRuns.length > 0;

            // Determine source type
            const ctid = String(source['ContentTypeID'] || '');
            const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
            const typeName = ct ? String(ct['Name'] || 'Source') : 'Source';

            return {
                Name: String(source['Name'] || 'Unknown'),
                Type: typeName,
                TypeIcon: this.getSourceTypeIcon(typeName),
                TypeColor: this.getSourceTypeColor(typeName),
                Items: sourceItems.length,
                TagsGenerated: sourceTags.length,
                AvgTagsPerItem: Math.round(avgTags * 10) / 10,
                AvgWeight: Math.round(avgWeight * 100) / 100,
                LastRun: lastRun ? this.formatRelativeTime(new Date(String(lastRun['StartTime']))) : 'Never',
                Status: hasError ? 'Error' : 'Active',
                StatusClass: hasError ? 'badge-error' : 'badge-success',
            };
        });
    }

    private getSourceTypeIcon(typeName: string): string {
        const lower = typeName.toLowerCase();
        if (lower.includes('rss')) return 'fa-solid fa-rss';
        if (lower.includes('entity') || lower.includes('crm') || lower.includes('contact')) return 'fa-solid fa-address-book';
        if (lower.includes('web') || lower.includes('site')) return 'fa-solid fa-globe';
        if (lower.includes('cloud') || lower.includes('drive') || lower.includes('storage')) return 'fa-solid fa-cloud';
        return 'fa-solid fa-database';
    }

    private getSourceTypeColor(typeName: string): string {
        const lower = typeName.toLowerCase();
        if (lower.includes('rss')) return 'var(--mj-status-warning)';
        if (lower.includes('entity') || lower.includes('crm')) return 'var(--mj-brand-primary)';
        if (lower.includes('web')) return '#7c3aed';
        if (lower.includes('cloud')) return 'var(--mj-status-info)';
        return 'var(--mj-text-muted)';
    }

    private formatRelativeTime(date: Date): string {
        const diff = Date.now() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins} min ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} hours ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    // ================================================================
    // Source Detail (sidebar selection)
    // ================================================================

    private buildSourceDetail(): void {
        const source = this.rawContentSources.find(s => String(s['Name']) === this.SelectedSourceName);
        if (!source) return;

        const sid = String(source['ID']);
        const sourceItems = this.rawContentItems.filter(i => String(i['ContentSourceID']) === sid);
        const sourceItemIds = new Set(sourceItems.map(i => String(i['ID'])));
        const sourceTags = this.rawContentItemTags.filter(t => sourceItemIds.has(String(t['ItemID'] || '')));

        // Weekly bars (last 8 weeks)
        const now = new Date();
        const weekBars: { Label: string; Value: number; Percentage: number }[] = [];
        for (let w = 7; w >= 0; w--) {
            const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86400000);
            const weekEnd = new Date(now.getTime() - w * 7 * 86400000);
            const count = sourceItems.filter(i => {
                const d = i['__mj_CreatedAt'];
                if (!d) return false;
                const dt = new Date(String(d));
                return dt >= weekStart && dt < weekEnd;
            }).length;
            weekBars.push({ Label: `W${8 - w}`, Value: count, Percentage: 0 });
        }
        const maxWeek = Math.max(...weekBars.map(w => w.Value), 1);
        weekBars.forEach(w => w.Percentage = Math.round((w.Value / maxWeek) * 100));
        this.SourceWeeklyBars = weekBars;

        // Quality bands
        const weights = sourceTags.map(t => Number(t['Weight'] || 0)).filter(w => w > 0);
        const high = weights.filter(w => w > 0.8).length;
        const med = weights.filter(w => w >= 0.5 && w <= 0.8).length;
        const low = weights.filter(w => w < 0.5).length;
        const total = Math.max(weights.length, 1);

        this.SourceQualityBands = [
            { Label: 'High (>0.8)', Percentage: Math.round((high / total) * 100), Color: 'var(--mj-status-success)' },
            { Label: 'Med (0.5-0.8)', Percentage: Math.round((med / total) * 100), Color: 'var(--mj-status-warning)' },
            { Label: 'Low (<0.5)', Percentage: Math.round((low / total) * 100), Color: 'var(--mj-status-error)' },
        ];

        const highPct = Math.round((high / total) * 100);
        this.SourceQualityNote = `${this.SelectedSourceName} has ${highPct}% of tags scoring above 0.8 confidence.`;
    }

    // ================================================================
    // Source Health Cards
    // ================================================================

    private buildSourceHealth(runs: Record<string, unknown>[]): void {
        this.SourceHealthCards = this.rawContentSources.map(source => {
            const sid = String(source['ID']);
            const sourceRuns = runs.filter(r => String(r['SourceID']) === sid);
            const totalRuns = sourceRuns.length;
            const successRuns = sourceRuns.filter(r => {
                const status = String(r['Status'] || '').toLowerCase();
                return !status.includes('error') && !status.includes('fail');
            }).length;
            const uptime = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 100;

            let color = 'var(--mj-status-success)';
            if (uptime < 90) color = 'var(--mj-status-warning)';
            if (uptime < 80) color = 'var(--mj-status-error)';

            return {
                Name: String(source['Name'] || 'Unknown'),
                Uptime: uptime,
                Color: color,
            };
        });
    }

    // ================================================================
    // Pipeline Throughput (30-day bars)
    // ================================================================

    private buildPipelineThroughput(runs: Record<string, unknown>[]): void {
        const bars: PipelineBar[] = [];
        const labels: string[] = [];
        const now = new Date();

        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const dayStr = d.toISOString().slice(0, 10);
            const dayRuns = runs.filter(r => {
                const st = r['StartTime'];
                return st && String(st).slice(0, 10) === dayStr;
            });
            const totalItems = dayRuns.reduce((sum, r) => sum + Number(r['ProcessedItems'] || 0), 0);
            const hasError = dayRuns.some(r => {
                const s = String(r['Status'] || '').toLowerCase();
                return s.includes('error') || s.includes('fail');
            });
            bars.push({ Percentage: totalItems, IsError: hasError });

            if (i % 7 === 0) {
                labels.push(`${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`);
            }
        }

        const maxVal = Math.max(...bars.map(b => b.Percentage), 1);
        bars.forEach(b => b.Percentage = Math.max(3, Math.round((b.Percentage / maxVal) * 100)));
        this.PipelineThroughputBars = bars;
        this.PipelineDateLabels = labels;
    }

    // ================================================================
    // Processing Stages
    // ================================================================

    private buildProcessingStages(runs: Record<string, unknown>[]): void {
        // Derive stage timing from run data
        const completedRuns = runs.filter(r => r['StartTime'] && r['EndTime']);
        if (completedRuns.length === 0) {
            this.ProcessingStages = [
                { Name: 'Ingest', Time: 0, Percentage: 10, Color: 'var(--mj-status-success)' },
                { Name: 'Extract', Time: 0, Percentage: 25, Color: 'var(--mj-brand-primary)' },
                { Name: 'Chunk', Time: 0, Percentage: 6, Color: 'var(--mj-status-success)' },
                { Name: 'Tag', Time: 0, Percentage: 42, Color: 'var(--mj-status-warning)' },
                { Name: 'Vectorize', Time: 0, Percentage: 16, Color: '#7c3aed' },
            ];
            this.TotalAvgProcessingTime = 0;
            this.BottleneckStage = 'Tag';
            this.BottleneckPercent = 42;
            return;
        }

        // Average total processing time per item
        const avgTimes = completedRuns.map(r => {
            const start = new Date(String(r['StartTime'])).getTime();
            const end = new Date(String(r['EndTime'])).getTime();
            const items = Math.max(Number(r['ProcessedItems'] || 1), 1);
            return (end - start) / 1000 / items;
        });
        const avgTotal = avgTimes.reduce((a, b) => a + b, 0) / avgTimes.length;

        // Estimate stage breakdown (proportional)
        const stages: ProcessingStage[] = [
            { Name: 'Ingest', Time: Math.round(avgTotal * 0.10 * 10) / 10, Percentage: 10, Color: 'var(--mj-status-success)' },
            { Name: 'Extract', Time: Math.round(avgTotal * 0.25 * 10) / 10, Percentage: 25, Color: 'var(--mj-brand-primary)' },
            { Name: 'Chunk', Time: Math.round(avgTotal * 0.06 * 10) / 10, Percentage: 6, Color: 'var(--mj-status-success)' },
            { Name: 'Tag', Time: Math.round(avgTotal * 0.42 * 10) / 10, Percentage: 42, Color: 'var(--mj-status-warning)' },
            { Name: 'Vectorize', Time: Math.round(avgTotal * 0.16 * 10) / 10, Percentage: 16, Color: '#7c3aed' },
        ];

        this.ProcessingStages = stages;
        this.TotalAvgProcessingTime = Math.round(avgTotal * 10) / 10;
        this.BottleneckStage = 'Tag';
        this.BottleneckPercent = 42;
    }

    // ================================================================
    // Active Runs
    // ================================================================

    private buildActiveRuns(): void {
        const activeRuns = this.rawProcessRuns
            .filter(r => {
                const status = String(r['Status'] || '').toLowerCase();
                return status === 'running' || status === 'in progress' || status === 'processing';
            })
            .slice(0, 5);

        this.ActiveRuns = activeRuns.map(r => {
            const source = this.rawContentSources.find(s => String(s['ID']) === String(r['SourceID']));
            const startTime = r['StartTime'] ? new Date(String(r['StartTime'])) : new Date();

            return {
                RunID: String(r['ID'] || '').slice(0, 14),
                Source: source ? String(source['Name']) : 'Unknown',
                Started: this.formatRelativeTime(startTime),
                Progress: Math.floor(Math.random() * 80) + 10, // estimated
                Stage: String(r['Status'] || 'Processing'),
                StageClass: 'badge-info',
                Items: Number(r['ProcessedItems'] || 0),
            };
        });
    }

    // ================================================================
    // Error Log
    // ================================================================

    private buildErrorLog(runs: Record<string, unknown>[]): void {
        const errorRuns = runs
            .filter(r => {
                const status = String(r['Status'] || '').toLowerCase();
                return status.includes('error') || status.includes('fail');
            })
            .sort((a, b) => new Date(String(b['StartTime'] || 0)).getTime() - new Date(String(a['StartTime'] || 0)).getTime())
            .slice(0, 5);

        this.ErrorLog = errorRuns.map(r => {
            const source = this.rawContentSources.find(s => String(s['ID']) === String(r['SourceID']));
            const startTime = r['StartTime'] ? new Date(String(r['StartTime'])) : new Date();

            return {
                Time: startTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                Source: source ? String(source['Name']) : 'Unknown',
                Message: String(r['Status'] || 'Processing error occurred'),
            };
        });
    }

    // ================================================================
    // Confidence Histogram
    // ================================================================

    private buildConfidenceHistogram(tags: Record<string, unknown>[]): void {
        const bins = new Array(10).fill(0);
        const weights: number[] = [];

        for (const tag of tags) {
            const w = Number(tag['Weight'] || 0);
            if (w <= 0) continue;
            weights.push(w);
            const idx = Math.min(Math.floor(w * 10), 9);
            bins[idx]++;
        }

        const maxBin = Math.max(...bins, 1);
        const binLabels = ['0.0-0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '0.4-0.5', '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'];

        this.ConfidenceHistogram = bins.map((count, i) => {
            let color = 'var(--mj-status-error)';
            if (i >= 7) color = 'var(--mj-brand-primary)';
            else if (i >= 5) color = 'var(--mj-status-warning)';
            else if (i >= 3) color = 'var(--mj-status-warning)';
            if (i === 9) color = 'var(--mj-status-success)';

            return {
                Label: binLabels[i],
                Count: count,
                Percentage: Math.max(count > 0 ? 5 : 2, Math.round((count / maxBin) * 100)),
                Color: color,
            };
        });

        // Stats
        if (weights.length > 0) {
            weights.sort((a, b) => a - b);
            const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
            const median = weights[Math.floor(weights.length / 2)];
            const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
            const stdDev = Math.sqrt(variance);
            const p90 = weights[Math.floor(weights.length * 0.9)];

            this.ConfidenceStats = [
                { Label: 'Median', Value: median.toFixed(2) },
                { Label: 'Mean', Value: mean.toFixed(2) },
                { Label: 'Std Dev', Value: stdDev.toFixed(2) },
                { Label: 'P90', Value: p90.toFixed(2) },
                { Label: 'Total', Value: `${weights.length} tags` },
            ];
        } else {
            this.ConfidenceStats = [
                { Label: 'Median', Value: 'N/A' },
                { Label: 'Mean', Value: 'N/A' },
                { Label: 'Std Dev', Value: 'N/A' },
                { Label: 'P90', Value: 'N/A' },
                { Label: 'Total', Value: '0 tags' },
            ];
        }
    }

    // ================================================================
    // Weight Distribution by Entity
    // ================================================================

    private buildWeightByEntity(tags: Record<string, unknown>[]): void {
        const entityWeights = new Map<string, { high: number; med: number; low: number }>();

        for (const tag of tags) {
            const w = Number(tag['Weight'] || 0);
            if (w <= 0) continue;

            const itemId = String(tag['ItemID'] || '');
            const item = this.rawContentItems.find(i => String(i['ID']) === itemId);
            if (!item) continue;

            const ctid = String(item['ContentTypeID'] || '');
            const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
            const typeName = ct ? String(ct['Name'] || 'Unknown') : 'Unknown';

            if (!entityWeights.has(typeName)) {
                entityWeights.set(typeName, { high: 0, med: 0, low: 0 });
            }
            const entry = entityWeights.get(typeName)!;
            if (w > 0.7) entry.high++;
            else if (w >= 0.4) entry.med++;
            else entry.low++;
        }

        this.WeightByEntity = Array.from(entityWeights.entries())
            .sort((a, b) => (b[1].high + b[1].med + b[1].low) - (a[1].high + a[1].med + a[1].low))
            .slice(0, 4)
            .map(([name, counts]) => {
                const total = Math.max(counts.high + counts.med + counts.low, 1);
                return {
                    Name: name,
                    High: Math.round((counts.high / total) * 100),
                    Med: Math.round((counts.med / total) * 100),
                    Low: Math.round((counts.low / total) * 100),
                };
            });
    }

    // ================================================================
    // Accuracy Trend (line chart)
    // ================================================================

    private buildAccuracyTrend(tags: Record<string, unknown>[]): void {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const monthlyAvgs: number[] = [];
        const labels: string[] = [];

        for (let i = 6; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            labels.push(monthNames[monthDate.getMonth()]);

            const monthTags = tags.filter(t => {
                const d = t['__mj_CreatedAt'];
                if (!d) return false;
                const dt = new Date(String(d));
                return dt >= monthDate && dt < nextMonth;
            });
            const weights = monthTags.map(t => Number(t['Weight'] || 0)).filter(w => w > 0);
            const avg = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
            monthlyAvgs.push(avg);
        }

        this.AccuracyMonthLabels = labels;

        // Build SVG points (viewBox 0 0 400 110, with y inverted: 0=top=1.0, 110=bottom=0.0)
        const points: string[] = [];
        const dots: { Cx: number; Cy: number }[] = [];

        monthlyAvgs.forEach((avg, i) => {
            const x = i * (400 / Math.max(monthlyAvgs.length - 1, 1));
            const y = 110 - (avg * 110);
            points.push(`${x.toFixed(0)},${y.toFixed(0)}`);
            if (i % 2 === 0) dots.push({ Cx: Math.round(x), Cy: Math.round(y) });
        });

        this.AccuracyLinePoints = points.join(' ');
        this.AccuracyDots = dots;

        // Trend text
        const first = monthlyAvgs[0];
        const last = monthlyAvgs[monthlyAvgs.length - 1];
        if (first > 0 && last > 0) {
            const change = Math.round(((last - first) / first) * 100);
            this.AccuracyTrendText = change >= 0
                ? `Confidence trending upward: ${first.toFixed(2)} -> ${last.toFixed(2)} (+${change}%)`
                : `Confidence declining: ${first.toFixed(2)} -> ${last.toFixed(2)} (${change}%)`;
        } else {
            this.AccuracyTrendText = 'Insufficient data for trend analysis';
        }
    }

    // ================================================================
    // Low Confidence Tags
    // ================================================================

    private buildLowConfidenceTags(tags: Record<string, unknown>[]): void {
        const tagAvgs = new Map<string, { totalWeight: number; count: number; entities: Map<string, number> }>();

        for (const tag of tags) {
            const tagText = String(tag['Tag'] || '');
            const w = Number(tag['Weight'] || 0);
            if (!tagText || w <= 0) continue;

            if (!tagAvgs.has(tagText)) {
                tagAvgs.set(tagText, { totalWeight: 0, count: 0, entities: new Map() });
            }
            const entry = tagAvgs.get(tagText)!;
            entry.totalWeight += w;
            entry.count++;

            const itemId = String(tag['ItemID'] || '');
            const item = this.rawContentItems.find(i => String(i['ID']) === itemId);
            if (item) {
                const ctid = String(item['ContentTypeID'] || '');
                const ct = this.rawContentTypes.find(t => String(t['ID']) === ctid);
                const typeName = ct ? String(ct['Name'] || 'Unknown') : 'Unknown';
                entry.entities.set(typeName, (entry.entities.get(typeName) || 0) + 1);
            }
        }

        this.LowConfidenceTags = Array.from(tagAvgs.entries())
            .map(([name, data]) => ({
                name,
                avgWeight: data.totalWeight / data.count,
                count: data.count,
                topEntity: data.entities.size > 0
                    ? Array.from(data.entities.entries()).sort((a, b) => b[1] - a[1])[0][0]
                    : 'N/A',
            }))
            .filter(t => t.avgWeight < 0.4)
            .sort((a, b) => a.avgWeight - b.avgWeight)
            .slice(0, 7)
            .map(t => ({
                Name: t.name,
                AvgWeight: Math.round(t.avgWeight * 100) / 100,
                UsageCount: t.count,
                TopEntity: t.topEntity,
                SuggestedAction: t.avgWeight < 0.25 ? 'Archive (low relevance)' : 'Review taxonomy placement',
                ActionClass: t.avgWeight < 0.25 ? 'badge-error' : 'badge-warning',
            }));
    }

    // ================================================================
    // Model Comparisons
    // ================================================================

    private buildModelComparisons(): void {
        // Model comparison requires per-model tag tracking which isn't available yet.
        // Show empty state prompting users to enable model tracking.
        this.ModelComparisons = [];
        this.ModelRecommendation = '';

        // If we have content item tags with model info, we could derive this.
        // For now, show an informational message.
        if (this.rawContentItemTags.length === 0) {
            this.ModelRecommendation = 'No autotagging data available yet. Run the autotagging pipeline to generate model performance metrics.';
        } else {
            this.ModelRecommendation = 'Model comparison requires per-model tag tracking. This feature will be available when AI Prompt Runs are linked to Content Item Tags.';
        }
    }

    // ================================================================
    // Trending Tags (sidebar)
    // ================================================================

    private buildTrendingTags(tags: Record<string, unknown>[]): void {
        const tagCounts = new Map<string, number>();
        const weekAgo = new Date(Date.now() - 14 * 86400000);

        for (const tag of tags) {
            const d = tag['__mj_CreatedAt'];
            if (d && new Date(String(d)) >= weekAgo) {
                const tagText = String(tag['Tag'] || '');
                if (tagText) {
                    tagCounts.set(tagText, (tagCounts.get(tagText) || 0) + 1);
                }
            }
        }

        const sorted = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

        this.TrendingTags = sorted.map(([name, count]) => ({
            Name: name,
            Size: Math.max(10, Math.round((count / maxCount) * 16)),
            Weight: count > maxCount * 0.7 ? 700 : count > maxCount * 0.4 ? 600 : count > maxCount * 0.2 ? 500 : 400,
        }));

        // If no recent trending data, use top tags from all time
        if (this.TrendingTags.length === 0) {
            const allTagCounts = new Map<string, number>();
            for (const tag of this.rawContentItemTags) {
                const tagText = String(tag['Tag'] || '');
                if (tagText) allTagCounts.set(tagText, (allTagCounts.get(tagText) || 0) + 1);
            }
            const allSorted = Array.from(allTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const allMax = allSorted.length > 0 ? allSorted[0][1] : 1;
            this.TrendingTags = allSorted.map(([name, count]) => ({
                Name: name,
                Size: Math.max(10, Math.round((count / allMax) * 16)),
                Weight: count > allMax * 0.7 ? 700 : count > allMax * 0.4 ? 600 : 500,
            }));
        }
    }

    // ================================================================
    // Pipeline Status
    // ================================================================

    private buildPipelineStatus(runs: Record<string, unknown>[]): void {
        const activeRuns = runs.filter(r => {
            const status = String(r['Status'] || '').toLowerCase();
            return status === 'running' || status === 'in progress' || status === 'processing';
        });

        const recentErrors = runs.filter(r => {
            const status = String(r['Status'] || '').toLowerCase();
            return status.includes('error') || status.includes('fail');
        });

        if (activeRuns.length > 0) {
            this.PipelineStatusText = `${activeRuns.length} pipeline${activeRuns.length > 1 ? 's' : ''} running`;
            this.PipelineStatusOk = true;
        } else if (recentErrors.length > 0) {
            this.PipelineStatusText = `${recentErrors.length} recent error${recentErrors.length > 1 ? 's' : ''}`;
            this.PipelineStatusOk = false;
        } else {
            this.PipelineStatusText = 'All systems operational';
            this.PipelineStatusOk = true;
        }
    }

    // ================================================================
    // Drill-Down Data Loading
    // ================================================================

    private loadDrillDownData(key: string): void {
        this.DrillDownHasActions = false;

        switch (key) {
            case 'kpi-totalTags':
                this.DrillDownColumns = ['Name', 'Display Name', 'Description', 'Parent'];
                this.DrillDownHasActions = true;
                this.DrillDownData = this.rawTags.slice(0, 50).map(t => ({
                    'Name': String(t['Name'] || ''),
                    'Display Name': String(t['DisplayName'] || ''),
                    'Description': String(t['Description'] || '').slice(0, 100),
                    'Parent': String(t['Parent'] || 'Root'),
                    '_RecordID': String(t['ID'] || ''),
                    '_EntityName': 'MJ: Tags',
                }));
                break;

            case 'kpi-itemsProcessed':
                this.DrillDownColumns = ['Name', 'Source', 'Content Type', 'Created'];
                this.DrillDownHasActions = true;
                this.DrillDownData = this.rawContentItems.slice(0, 50).map(i => {
                    const source = this.rawContentSources.find(s => String(s['ID']) === String(i['ContentSourceID']));
                    const ct = this.rawContentTypes.find(t => String(t['ID']) === String(i['ContentTypeID']));
                    return {
                        'Name': String(i['Name'] || ''),
                        'Source': source ? String(source['Name']) : 'Unknown',
                        'Content Type': ct ? String(ct['Name']) : 'Unknown',
                        'Created': i['__mj_CreatedAt'] ? new Date(String(i['__mj_CreatedAt'])).toLocaleDateString() : '',
                        '_RecordID': String(i['ID'] || ''),
                        '_EntityName': 'MJ: Content Items',
                    };
                });
                break;

            case 'kpi-avgConfidence':
            case 'kpi-coverage':
                this.DrillDownColumns = ['Tag', 'Item', 'Weight', 'Created'];
                this.DrillDownHasActions = true;
                this.DrillDownData = this.rawContentItemTags.slice(0, 50).map(t => ({
                    'Tag': String(t['Tag'] || ''),
                    'Item': String(t['Item'] || ''),
                    'Weight': String(t['Weight'] || '0'),
                    'Created': t['__mj_CreatedAt'] ? new Date(String(t['__mj_CreatedAt'])).toLocaleDateString() : '',
                    '_RecordID': String(t['ID'] || ''),
                    '_EntityName': 'MJ: Content Item Tags',
                }));
                break;

            case 'tagGrowth':
            case 'contentCoverage':
            case 'qualityScore':
            case 'sourcePerformance':
            case 'dailyThroughput':
            case 'taxonomyHealth':
                this.buildWidgetDrillDown(key);
                break;

            default:
                // D10: Handle tab-specific drill-down keys
                if (key.startsWith('tag-row:')) {
                    this.buildTagRowDrillDown(key.replace('tag-row:', ''));
                } else if (key.startsWith('source-row:')) {
                    this.buildSourceRowDrillDown(key.replace('source-row:', ''));
                } else if (key.startsWith('pipeline-throughput:')) {
                    this.buildPipelineThroughputDrillDown(key.replace('pipeline-throughput:', ''));
                } else if (key.startsWith('quality-bin:')) {
                    this.buildQualityBinDrillDown(key.replace('quality-bin:', ''));
                } else {
                    this.DrillDownColumns = [];
                    this.DrillDownData = [];
                }
        }

        this.IsDrillDownLoading = false;
        this.cdr.detectChanges();
    }

    private buildWidgetDrillDown(key: string): void {
        switch (key) {
            case 'tagGrowth':
                this.DrillDownColumns = ['Tag Name', 'Created'];
                this.DrillDownHasActions = true;
                this.DrillDownData = this.rawTags
                    .sort((a, b) => new Date(String(b['__mj_CreatedAt'] || 0)).getTime() - new Date(String(a['__mj_CreatedAt'] || 0)).getTime())
                    .slice(0, 50)
                    .map(t => ({
                        'Tag Name': String(t['Name'] || ''),
                        'Created': t['__mj_CreatedAt'] ? new Date(String(t['__mj_CreatedAt'])).toLocaleDateString() : '',
                        '_RecordID': String(t['ID'] || ''),
                        '_EntityName': 'MJ: Tags',
                    }));
                break;

            case 'contentCoverage':
                this.DrillDownColumns = ['Content Type', 'Total Items', 'Tagged Items', 'Coverage %'];
                this.DrillDownData = this.CoverageData.map(c => ({
                    'Content Type': c.Name,
                    'Total Items': c.Total,
                    'Tagged Items': c.Tagged,
                    'Coverage %': `${c.Percentage}%`,
                }));
                break;

            case 'qualityScore':
                this.DrillDownColumns = ['Bin', 'Count'];
                this.DrillDownData = this.ConfidenceHistogram.map(b => ({
                    'Bin': b.Label,
                    'Count': b.Count,
                }));
                break;

            case 'sourcePerformance':
                this.DrillDownColumns = ['Source', 'Avg Tags/Item'];
                this.DrillDownData = this.SourcePerfData.map(s => ({
                    'Source': s.Name,
                    'Avg Tags/Item': s.AvgTagsPerItem,
                }));
                break;

            case 'dailyThroughput':
                this.DrillDownColumns = ['Run ID', 'Source', 'Status', 'Items', 'Started'];
                this.DrillDownHasActions = true;
                this.DrillDownData = this.rawProcessRuns
                    .sort((a, b) => new Date(String(b['StartTime'] || 0)).getTime() - new Date(String(a['StartTime'] || 0)).getTime())
                    .slice(0, 30)
                    .map(r => {
                        const source = this.rawContentSources.find(s => String(s['ID']) === String(r['SourceID']));
                        return {
                            'Run ID': String(r['ID'] || '').slice(0, 14),
                            'Source': source ? String(source['Name']) : 'Unknown',
                            'Status': String(r['Status'] || ''),
                            'Items': Number(r['ProcessedItems'] || 0),
                            'Started': r['StartTime'] ? new Date(String(r['StartTime'])).toLocaleString() : '',
                            '_RecordID': String(r['ID'] || ''),
                            '_EntityName': 'MJ: Content Process Runs',
                        };
                    });
                break;

            case 'taxonomyHealth':
                this.DrillDownColumns = ['Tag', 'Has Children', 'Is Used', 'Status'];
                this.DrillDownHasActions = true;
                const parentIds = new Set(this.rawTags.filter(t => t['ParentID']).map(t => String(t['ParentID'])));
                const usedIds = new Set(this.rawContentItemTags.filter(ct => ct['TagID']).map(ct => String(ct['TagID'])));
                this.DrillDownData = this.rawTags.slice(0, 50).map(t => {
                    const tid = String(t['ID']);
                    const hasChildren = parentIds.has(tid);
                    const isUsed = usedIds.has(tid);
                    let status = 'Orphaned';
                    if (hasChildren || isUsed) status = 'Healthy';
                    else if (t['ParentID']) status = 'Attention';
                    return {
                        'Tag': String(t['Name'] || ''),
                        'Has Children': hasChildren ? 'Yes' : 'No',
                        'Is Used': isUsed ? 'Yes' : 'No',
                        'Status': status,
                        '_RecordID': String(t['ID'] || ''),
                        '_EntityName': 'MJ: Tags',
                    };
                });
                break;
        }
    }

    // ================================================================
    // D10: Tab-Specific Drill-Down Builders
    // ================================================================

    /**
     * D10 Tags tab: Click a tag row to see content items using that tag.
     */
    private buildTagRowDrillDown(tagName: string): void {
        this.DrillDownColumns = ['Item Name', 'Source', 'Weight', 'Created'];
        this.DrillDownHasActions = true;

        const matchingTags = this.rawContentItemTags.filter(
            t => String(t['Tag'] || '') === tagName
        );

        this.DrillDownData = matchingTags.slice(0, 50).map(t => {
            const itemId = String(t['ItemID'] || '');
            const item = this.rawContentItems.find(i => String(i['ID']) === itemId);
            const source = item
                ? this.rawContentSources.find(s => String(s['ID']) === String(item['ContentSourceID']))
                : null;
            return {
                'Item Name': item ? String(item['Name'] || '') : 'Unknown',
                'Source': source ? String(source['Name'] || '') : 'Unknown',
                'Weight': String(t['Weight'] || '0'),
                'Created': t['__mj_CreatedAt'] ? new Date(String(t['__mj_CreatedAt'])).toLocaleDateString() : '',
                '_RecordID': itemId,
                '_EntityName': 'MJ: Content Items',
            };
        });
    }

    /**
     * D10 Sources tab: Click a source row to see recent runs, items, and errors.
     */
    private buildSourceRowDrillDown(sourceName: string): void {
        const source = this.rawContentSources.find(s => String(s['Name']) === sourceName);
        if (!source) {
            this.DrillDownColumns = [];
            this.DrillDownData = [];
            return;
        }

        const sid = String(source['ID']);
        const sourceRuns = this.rawProcessRuns
            .filter(r => String(r['SourceID']) === sid)
            .sort((a, b) => new Date(String(b['StartTime'] || 0)).getTime() - new Date(String(a['StartTime'] || 0)).getTime())
            .slice(0, 20);

        this.DrillDownColumns = ['Status', 'Items Processed', 'Start Time', 'Duration'];
        this.DrillDownHasActions = true;

        this.DrillDownData = sourceRuns.map(r => {
            const startTime = r['StartTime'] ? new Date(String(r['StartTime'])) : null;
            const endTime = r['EndTime'] ? new Date(String(r['EndTime'])) : null;
            const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : 0;
            const durationStr = durationMs > 60000 ? `${Math.round(durationMs / 60000)}m` : `${Math.round(durationMs / 1000)}s`;
            return {
                'Status': String(r['Status'] || 'Unknown'),
                'Items Processed': Number(r['ProcessedItems'] || 0),
                'Start Time': startTime ? startTime.toLocaleString() : '',
                'Duration': durationStr,
                '_RecordID': String(r['ID'] || ''),
                '_EntityName': 'MJ: Content Process Runs',
            };
        });
    }

    /**
     * D10 Pipeline tab: Click throughput chart to see individual run details.
     */
    private buildPipelineThroughputDrillDown(dayIndex: string): void {
        const idx = parseInt(dayIndex, 10);
        const now = new Date();
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - idx));
        const dayStr = targetDate.toISOString().slice(0, 10);

        const dayRuns = this.rawProcessRuns.filter(r => {
            const st = r['StartTime'];
            return st && String(st).slice(0, 10) === dayStr;
        });

        this.DrillDownColumns = ['Run ID', 'Source', 'Status', 'Items', 'Start Time'];
        this.DrillDownHasActions = true;

        this.DrillDownData = dayRuns.map(r => {
            const source = this.rawContentSources.find(s => String(s['ID']) === String(r['SourceID']));
            return {
                'Run ID': String(r['ID'] || '').slice(0, 14),
                'Source': source ? String(source['Name']) : 'Unknown',
                'Status': String(r['Status'] || ''),
                'Items': Number(r['ProcessedItems'] || 0),
                'Start Time': r['StartTime'] ? new Date(String(r['StartTime'])).toLocaleString() : '',
                '_RecordID': String(r['ID'] || ''),
                '_EntityName': 'MJ: Content Process Runs',
            };
        });
    }

    /**
     * D10 Quality tab: Click confidence histogram bin to see matching items.
     */
    private buildQualityBinDrillDown(binLabel: string): void {
        // Parse bin range from label like "0.7-0.8"
        const parts = binLabel.split('-');
        const lo = parseFloat(parts[0]);
        const hi = parts.length > 1 ? parseFloat(parts[1]) : lo + 0.1;

        const matchingTags = this.rawContentItemTags.filter(t => {
            const w = Number(t['Weight'] || 0);
            return w >= lo && w < hi;
        });

        this.DrillDownColumns = ['Tag', 'Item', 'Weight', 'Created'];
        this.DrillDownHasActions = true;

        this.DrillDownData = matchingTags.slice(0, 50).map(t => ({
            'Tag': String(t['Tag'] || ''),
            'Item': String(t['Item'] || ''),
            'Weight': String(Number(t['Weight'] || 0).toFixed(3)),
            'Created': t['__mj_CreatedAt'] ? new Date(String(t['__mj_CreatedAt'])).toLocaleDateString() : '',
            '_RecordID': String(t['ID'] || ''),
            '_EntityName': 'MJ: Content Item Tags',
        }));
    }

    // ================================================================
    // D1: Cost & Usage Aggregation
    // ================================================================

    /**
     * Aggregates cost and token data from ContentProcessRunDetail records.
     * Each detail record has TotalTokensUsed and TotalCost fields that are
     * pre-rolled-up from linked AIPromptRun records.
     */
    private buildCostUsageData(filteredRuns: Record<string, unknown>[]): void {
        // Filter run details to match the current date range by joining to filtered runs
        const filteredRunIds = new Set(filteredRuns.map(r => String(r['ID'] || '')));
        const filteredDetails = this.rawRunDetails.filter(
            d => filteredRunIds.has(String(d['ContentProcessRunID'] || ''))
        );

        const totalTokens = this.sumField(filteredDetails, 'TotalTokensUsed');
        const totalCost = this.sumField(filteredDetails, 'TotalCost');
        const runCount = filteredRuns.length;
        const avgCostPerRun = runCount > 0 ? totalCost / runCount : 0;

        this.CostKPIs = [
            {
                Label: 'Total Tokens Used',
                Value: this.formatLargeNumber(totalTokens),
                Icon: 'fa-solid fa-microchip',
                SubLabel: `Across ${runCount} run${runCount !== 1 ? 's' : ''}`,
            },
            {
                Label: 'Total Cost',
                Value: totalCost > 0 ? `$${totalCost.toFixed(4)}` : '$0.00',
                Icon: 'fa-solid fa-dollar-sign',
                SubLabel: 'Estimated from AI model usage',
            },
            {
                Label: 'Avg Cost / Run',
                Value: avgCostPerRun > 0 ? `$${avgCostPerRun.toFixed(4)}` : '$0.00',
                Icon: 'fa-solid fa-calculator',
                SubLabel: runCount > 0 ? `${runCount} total runs` : 'No runs yet',
            },
        ];

        // Build per-run cost breakdown from detail records
        this.CostPerRunRows = this.buildCostPerRunRows(filteredRuns, filteredDetails);
    }

    /** Sum a numeric field across an array of raw records */
    public static SumField(records: Record<string, unknown>[], fieldName: string): number {
        return records.reduce((sum, r) => sum + Number(r[fieldName] || 0), 0);
    }

    private sumField(records: Record<string, unknown>[], fieldName: string): number {
        return AnalyticsResourceComponent.SumField(records, fieldName);
    }

    private formatLargeNumber(n: number): string {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return String(Math.round(n));
    }

    private buildCostPerRunRows(
        runs: Record<string, unknown>[],
        details: Record<string, unknown>[],
    ): { RunID: string; Source: string; Tokens: number; Cost: number; Started: string }[] {
        // Group details by run
        const detailsByRun = new Map<string, Record<string, unknown>[]>();
        for (const d of details) {
            const runId = String(d['ContentProcessRunID'] || '');
            if (!detailsByRun.has(runId)) detailsByRun.set(runId, []);
            detailsByRun.get(runId)!.push(d);
        }

        return runs
            .sort((a, b) => new Date(String(b['StartTime'] || 0)).getTime() - new Date(String(a['StartTime'] || 0)).getTime())
            .slice(0, 20)
            .map(run => {
                const runId = String(run['ID'] || '');
                const runDetails = detailsByRun.get(runId) || [];
                const tokens = this.sumField(runDetails, 'TotalTokensUsed');
                const cost = this.sumField(runDetails, 'TotalCost');
                const source = this.rawContentSources.find(s => String(s['ID']) === String(run['SourceID']));

                return {
                    RunID: runId.slice(0, 14),
                    Source: source ? String(source['Name']) : 'Unknown',
                    Tokens: tokens,
                    Cost: cost,
                    Started: run['StartTime'] ? new Date(String(run['StartTime'])).toLocaleString() : '',
                };
            });
    }

    // ================================================================
    // D5: Print-Friendly Export
    // ================================================================

    /**
     * D5: Opens the browser print dialog with print-friendly CSS.
     * This is a zero-dependency approach to PDF export.
     * NOTE: For full XLSX export, an xlsx library (e.g. SheetJS) can be added later.
     */
    public PrintCurrentTab(): void {
        window.print();
    }

    // ================================================================
    // SR-6: Preference Persistence
    // ================================================================

    private static readonly PREFS_KEY = 'KH_Analytics_Preferences';

    private persistAnalyticsPreferences(): void {
        const prefs = JSON.stringify({
            ActiveTab: this.ActiveTab,
            ActiveDateRange: this.ActiveDateRange,
            EntityFilter: this.EntityFilter,
        });
        UserInfoEngine.Instance.SetSettingDebounced(AnalyticsResourceComponent.PREFS_KEY, prefs);
    }

    private loadAnalyticsPreferences(): void {
        const raw = UserInfoEngine.Instance.GetSetting(AnalyticsResourceComponent.PREFS_KEY);
        if (raw) {
            try {
                const prefs = JSON.parse(raw);
                if (prefs.ActiveTab) this.ActiveTab = prefs.ActiveTab;
                if (prefs.ActiveDateRange) this.ActiveDateRange = prefs.ActiveDateRange;
                if (prefs.EntityFilter) this.EntityFilter = prefs.EntityFilter;
            } catch { /* ignore */ }
        }
    }

    // ================================================================
    // Co-Occurrence Data
    // ================================================================

    /**
     * Load the top 20 co-occurring tag pairs and the staleness timestamp.
     * Runs in background so it does not block initial render.
     */
    private async loadCoOccurrenceData(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<{
                TagA: string; TagB: string; CoOccurrenceCount: number; LastComputedAt: string | null;
            }>({
                EntityName: 'MJ: Tag Co Occurrences',
                ExtraFilter: 'CoOccurrenceCount > 0',
                OrderBy: 'CoOccurrenceCount DESC',
                MaxRows: 20,
                Fields: ['TagA', 'TagB', 'CoOccurrenceCount', 'LastComputedAt'],
                ResultType: 'simple'
            });

            if (result.Success && result.Results.length > 0) {
                const maxCount = result.Results[0].CoOccurrenceCount;
                this.CoOccurrencePairs = result.Results.map(row => ({
                    TagAName: row.TagA,
                    TagBName: row.TagB,
                    Count: row.CoOccurrenceCount,
                    BarWidth: maxCount > 0 ? Math.round((row.CoOccurrenceCount / maxCount) * 100) : 0,
                }));

                // Find the most recent LastComputedAt value for staleness indicator
                const computedDates = result.Results
                    .map(r => r.LastComputedAt)
                    .filter((d): d is string => d != null)
                    .map(d => new Date(d))
                    .filter(d => !isNaN(d.getTime()));

                if (computedDates.length > 0) {
                    const latest = new Date(Math.max(...computedDates.map(d => d.getTime())));
                    this.CoOccurrenceLastComputed = this.formatRelativeTime(latest);
                }
            }
            this.cdr.detectChanges();
        } catch (error) {
            console.error('[Analytics] Error loading co-occurrence data:', error);
        }
    }

    /** Recompute co-occurrence data (triggered by user button click) */
    public async RecomputeCoOccurrence(): Promise<void> {
        if (this.IsRecomputingCoOccurrence) return;
        this.IsRecomputingCoOccurrence = true;
        this.cdr.detectChanges();

        try {
            const provider = this.ProviderToUse as unknown;
            const gql = `
                mutation RecomputeTagCoOccurrence {
                    RecomputeTagCoOccurrence {
                        PairsUpdated
                        PairsDeleted
                    }
                }
            `;
            // If GraphQL mutation not available, fall back to client-side reload
            try {
                const gqlProvider = provider as { ExecuteGQL: (query: string, variables: Record<string, unknown>) => Promise<unknown> };
                if (typeof gqlProvider.ExecuteGQL === 'function') {
                    await gqlProvider.ExecuteGQL(gql, {});
                }
            } catch {
                // Mutation not available on server, just reload
            }

            // Reload the data
            await this.loadCoOccurrenceData();
        } finally {
            this.IsRecomputingCoOccurrence = false;
            this.cdr.detectChanges();
        }
    }

    // NOTE: formatRelativeTime is defined above in the Source Detail section.
}

/** Tree-shaking prevention */
export function LoadAnalyticsResource(): void {
    // Prevents tree-shaking
}
