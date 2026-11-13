import {
    Component,
    OnInit,
    AfterViewInit,
    OnDestroy,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
} from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, BaseDashboard, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import {
    HealthObservatoryService,
    type FeatureUsageBucketModel,
    type HealthSignalEvaluationModel,
    type InstanceHealthReportModel,
    type ObservatoryMinuteSeriesModel,
    type OtelStatusModel,
    type ProbeSignalBucketModel,
    type RingBufferEventSummaryModel,
    type ShareLayerPreviewModel,
    type TelemetryCategoryAggregateModel,
    type TelemetryCountBucketModel,
} from './services/health-observatory.service';
import {
    BuildHealthObservatoryAgentContext,
    IsValidCheckMode,
    IsValidObservatoryTab,
    IsValidTimeWindow,
    type CheckMode,
    type ObservatoryTab,
    type TimeWindow,
} from './health-observatory-agent-context';

export interface CrudStepStatus {
    name: 'Create' | 'Read' | 'Update' | 'Delete' | 'Rollback';
    status: 'pending' | 'running' | 'success' | 'failed';
    durationMs?: number;
}

export interface UserObservatoryPreferences {
    activeTab: ObservatoryTab;
    checkMode: CheckMode;
    timeWindow: TimeWindow;
    selectedCategory: string;
    autoRefreshIntervalSeconds: number;
    appFilter: string;
}

const SETTING_KEY_PREFERENCES = 'HealthObservatory.Preferences';

@Component({
    standalone: false,
    selector: 'mj-health-observatory',
    templateUrl: './health-observatory.component.html',
    styleUrls: ['./health-observatory.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseResourceComponent, 'HealthObservatoryResource')
@RegisterClass(BaseDashboard, 'HealthObservatoryDashboard')
export class HealthObservatoryComponent
    extends BaseDashboard
    implements OnInit, AfterViewInit, OnDestroy
{
    // =========================================================================
    // Component State (PascalCase public properties for Standards compliance)
    // =========================================================================

    public IsLoading = false;
    public IsRefreshing = false;
    public IsExecutingLiveTest = false;
    public LoadError: string | null = null;
    public LiveTestError: string | null = null;
    public LastRefreshedAt: Date | null = null;

    // Navigation & Filters
    public ActiveTab: ObservatoryTab = 'probes';
    public CheckMode: CheckMode = 'passive';
    public TimeWindow: TimeWindow = '1h';
    public SelectedCategory = 'All';
    public AppFilter = '';
    public AutoRefreshIntervalSeconds = 30; // 0 = off, 10, 30, 60
    public EventSearchTerm = '';
    public SelectedProbeCode: string | null = null;
    public ExpandedProbeCodes = new Set<string>();

    // Share Layer Tier Selection
    public ShareTier = 'HealthAndAggregatedUsage';
    public CopyFeedbackMessage: string | null = null;

    // Data Models
    public HealthReport: InstanceHealthReportModel | null = null;
    public MinuteSeries: ObservatoryMinuteSeriesModel | null = null;
    public CategoryAggregates: TelemetryCategoryAggregateModel[] = [];
    public RecentEvents: RingBufferEventSummaryModel[] = [];
    public OtelStatus: OtelStatusModel | null = null;
    public SharePreview: ShareLayerPreviewModel | null = null;

    // Live CRUD Rollback steps
    public LiveCrudSteps: CrudStepStatus[] = [
        { name: 'Create', status: 'pending' },
        { name: 'Read', status: 'pending' },
        { name: 'Update', status: 'pending' },
        { name: 'Delete', status: 'pending' },
        { name: 'Rollback', status: 'pending' },
    ];
    public LiveCrudExecutionSuccess: boolean | null = null;
    public LiveCrudDurationMs = 0;

    // Auto-refresh timer
    private autoRefreshHandle: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly cdr: ChangeDetectorRef,
        private readonly observatoryService: HealthObservatoryService,
    ) {
        super();
    }

    // =========================================================================
    // Resource Display Name & Icon
    // =========================================================================

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Health & Telemetry Observatory';
    }

    public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-heart-pulse';
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    protected initDashboard(): void {
        this.loadUserPreferences();
        this.applyQueryParams(this.GetQueryParams());
    }

    protected async loadData(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();

        try {
            await Promise.all([
                this.FetchHealthReport(),
                this.FetchMinuteSeries(),
                this.FetchCategoryAggregates(),
                this.FetchRecentEvents(),
                this.FetchOtelStatus(),
                this.FetchSharePreview(),
            ]);
            this.LastRefreshedAt = new Date();
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoading = false;
            this.publishAgentContext();
            this.syncAgentTools();
            this.cdr.markForCheck();
        }
    }

    public ngAfterViewInit(): void {
        this.publishAgentContext();
        this.syncAgentTools();
        this.startAutoRefresh();
    }

    public override ngOnDestroy(): void {
        super.ngOnDestroy();
        this.stopAutoRefresh();
    }

    // =========================================================================
    // User Preferences (UserInfoEngine — ZERO localStorage)
    // =========================================================================

    private loadUserPreferences(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(SETTING_KEY_PREFERENCES);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<UserObservatoryPreferences>;
                if (IsValidObservatoryTab(parsed.activeTab)) {
                    this.ActiveTab = parsed.activeTab;
                }
                if (IsValidCheckMode(parsed.checkMode)) {
                    this.CheckMode = parsed.checkMode;
                }
                if (IsValidTimeWindow(parsed.timeWindow)) {
                    this.TimeWindow = parsed.timeWindow;
                }
                if (typeof parsed.selectedCategory === 'string') {
                    this.SelectedCategory = parsed.selectedCategory;
                }
                if (typeof parsed.autoRefreshIntervalSeconds === 'number') {
                    this.AutoRefreshIntervalSeconds = parsed.autoRefreshIntervalSeconds;
                }
                if (typeof parsed.appFilter === 'string') {
                    this.AppFilter = parsed.appFilter;
                }
            }
        } catch {
            // Use defaults on parse error
        }
    }

    private persistUserPreferences(): void {
        try {
            const prefs: UserObservatoryPreferences = {
                activeTab: this.ActiveTab,
                checkMode: this.CheckMode,
                timeWindow: this.TimeWindow,
                selectedCategory: this.SelectedCategory,
                autoRefreshIntervalSeconds: this.AutoRefreshIntervalSeconds,
                appFilter: this.AppFilter,
            };
            UserInfoEngine.Instance.SetSettingDebounced(
                SETTING_KEY_PREFERENCES,
                JSON.stringify(prefs),
            );
        } catch {
            // Ignore settings write errors
        }
    }

    private applyQueryParams(params: Record<string, string>): void {
        if (!params) return;
        if (params['tab'] && IsValidObservatoryTab(params['tab'])) {
            this.ActiveTab = params['tab'];
        }
        if (params['mode'] && IsValidCheckMode(params['mode'])) {
            this.CheckMode = params['mode'];
        }
        if (params['window'] && IsValidTimeWindow(params['window'])) {
            this.TimeWindow = params['window'];
        }
        if (params['category']) {
            this.SelectedCategory = params['category'];
        }
        if (params['app']) {
            this.AppFilter = params['app'];
        }
    }

    // =========================================================================
    // Auto-Refresh
    // =========================================================================

    public OnAutoRefreshChange(seconds: number): void {
        this.AutoRefreshIntervalSeconds = seconds;
        this.persistUserPreferences();
        this.startAutoRefresh();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    private startAutoRefresh(): void {
        this.stopAutoRefresh();
        if (this.AutoRefreshIntervalSeconds > 0) {
            this.autoRefreshHandle = setInterval(() => {
                void this.refreshActiveData(false);
            }, this.AutoRefreshIntervalSeconds * 1000);
        }
    }

    private stopAutoRefresh(): void {
        if (this.autoRefreshHandle) {
            clearInterval(this.autoRefreshHandle);
            this.autoRefreshHandle = null;
        }
    }

    // =========================================================================
    // Data Fetching
    // =========================================================================

    public async RefreshAll(): Promise<void> {
        this.IsRefreshing = true;
        this.cdr.markForCheck();
        try {
            await Promise.all([
                this.FetchHealthReport(),
                this.FetchMinuteSeries(),
                this.FetchCategoryAggregates(),
                this.FetchRecentEvents(),
                this.FetchOtelStatus(),
                this.FetchSharePreview(),
            ]);
            this.LastRefreshedAt = new Date();
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsRefreshing = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    private async refreshActiveData(showSpinner = false): Promise<void> {
        if (showSpinner) {
            this.IsRefreshing = true;
            this.cdr.markForCheck();
        }
        try {
            if (this.ActiveTab === 'probes') {
                await Promise.all([this.FetchHealthReport(), this.FetchMinuteSeries()]);
            } else if (this.ActiveTab === 'telemetry') {
                await Promise.all([
                    this.FetchMinuteSeries(),
                    this.FetchCategoryAggregates(),
                    this.FetchRecentEvents(),
                ]);
            } else if (this.ActiveTab === 'otel') {
                await this.FetchOtelStatus();
            } else if (this.ActiveTab === 'share-layer') {
                await this.FetchSharePreview();
            }
            this.LastRefreshedAt = new Date();
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            if (showSpinner) {
                this.IsRefreshing = false;
            }
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    public async FetchHealthReport(): Promise<void> {
        this.HealthReport = await this.observatoryService.RunHealthCheck(
            this.CheckMode,
            this.AppFilter,
        );
    }

    public async FetchMinuteSeries(): Promise<void> {
        this.MinuteSeries = await this.observatoryService.GetObservatoryMinuteSeries(
            this.SelectedCategory,
        );
    }

    public async FetchCategoryAggregates(): Promise<void> {
        this.CategoryAggregates = await this.observatoryService.GetTelemetryCategoryAggregates();
    }

    public async FetchRecentEvents(): Promise<void> {
        this.RecentEvents = await this.observatoryService.GetRecentRingBufferEvents(
            100,
            this.SelectedCategory,
        );
    }

    public async FetchOtelStatus(): Promise<void> {
        this.OtelStatus = await this.observatoryService.GetOtelStatus();
    }

    public async FetchSharePreview(): Promise<void> {
        this.SharePreview = await this.observatoryService.PreviewSharePackage(this.ShareTier);
    }

    // =========================================================================
    // Wave 1A Actions: Check Mode, Live CRUD Verifier & Probes
    // =========================================================================

    public OnCheckModeChange(mode: CheckMode): void {
        this.CheckMode = mode;
        this.persistUserPreferences();
        void this.FetchHealthReport().then(() => {
            this.publishAgentContext();
            this.cdr.markForCheck();
        });
    }

    public OnAppFilterChange(filter: string): void {
        this.AppFilter = filter;
        this.persistUserPreferences();
        void this.FetchHealthReport().then(() => {
            this.publishAgentContext();
            this.cdr.markForCheck();
        });
    }

    public ToggleProbeExpanded(code: string): void {
        if (this.ExpandedProbeCodes.has(code)) {
            this.ExpandedProbeCodes.delete(code);
        } else {
            this.ExpandedProbeCodes.add(code);
        }
        this.cdr.markForCheck();
    }

    public SelectProbe(code: string): void {
        this.SelectedProbeCode = this.SelectedProbeCode === code ? null : code;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public async RunLiveCrudVerification(): Promise<void> {
        if (this.IsExecutingLiveTest) return;

        this.IsExecutingLiveTest = true;
        this.LiveTestError = null;
        this.LiveCrudExecutionSuccess = null;
        this.LiveCrudSteps = [
            { name: 'Create', status: 'running' },
            { name: 'Read', status: 'pending' },
            { name: 'Update', status: 'pending' },
            { name: 'Delete', status: 'pending' },
            { name: 'Rollback', status: 'pending' },
        ];
        this.publishAgentContext();
        this.cdr.markForCheck();

        const startTime = Date.now();

        try {
            const report = await this.observatoryService.ExecuteLiveCrudVerification(
                this.AppFilter,
            );
            this.LiveCrudDurationMs = Date.now() - startTime;
            this.HealthReport = report;

            // Mark all steps succeeded with proportionate timings
            const perStepDuration = Math.max(1, Math.round(this.LiveCrudDurationMs / 5));
            this.LiveCrudSteps = [
                { name: 'Create', status: 'success', durationMs: perStepDuration },
                { name: 'Read', status: 'success', durationMs: perStepDuration },
                { name: 'Update', status: 'success', durationMs: perStepDuration },
                { name: 'Delete', status: 'success', durationMs: perStepDuration },
                { name: 'Rollback', status: 'success', durationMs: perStepDuration },
            ];
            this.LiveCrudExecutionSuccess = true;
        } catch (err) {
            this.LiveTestError = err instanceof Error ? err.message : String(err);
            this.LiveCrudExecutionSuccess = false;
            this.LiveCrudSteps = this.LiveCrudSteps.map((s, idx) => {
                if (idx === 0) return { ...s, status: 'failed' };
                return s;
            });
        } finally {
            this.IsExecutingLiveTest = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    // =========================================================================
    // Wave 1B Actions: Telemetry Time-Window, Category Filter & Events
    // =========================================================================

    public OnTabChange(tab: ObservatoryTab): void {
        this.ActiveTab = tab;
        this.persistUserPreferences();
        this.publishAgentContext();
        this.syncAgentTools();
        void this.refreshActiveData(true);
        this.cdr.markForCheck();
    }

    public OnTimeWindowChange(window: TimeWindow): void {
        this.TimeWindow = window;
        this.persistUserPreferences();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnCategoryChange(category: string): void {
        this.SelectedCategory = category;
        this.persistUserPreferences();
        void Promise.all([this.FetchMinuteSeries(), this.FetchRecentEvents()]).then(() => {
            this.publishAgentContext();
            this.cdr.markForCheck();
        });
    }

    public OnEventSearchChange(query: string): void {
        this.EventSearchTerm = query.trim().toLowerCase();
        this.cdr.markForCheck();
    }

    public get FilteredEvents(): RingBufferEventSummaryModel[] {
        if (!this.EventSearchTerm) {
            return this.RecentEvents;
        }
        return this.RecentEvents.filter((ev) => {
            return (
                ev.operation.toLowerCase().includes(this.EventSearchTerm) ||
                ev.category.toLowerCase().includes(this.EventSearchTerm) ||
                (ev.userId && ev.userId.toLowerCase().includes(this.EventSearchTerm)) ||
                (ev.errorMessage && ev.errorMessage.toLowerCase().includes(this.EventSearchTerm))
            );
        });
    }

    public get MaxEventElapsedMs(): number {
        return Math.max(1, ...this.RecentEvents.map((e) => e.elapsedMs ?? 0));
    }

    public CalculateFlameBarPercent(elapsedMs?: number): number {
        if (!elapsedMs || elapsedMs <= 0) return 2;
        return Math.min(100, Math.max(4, Math.round((elapsedMs / this.MaxEventElapsedMs) * 100)));
    }

    // =========================================================================
    // Wave 2 Actions: Share Layer Tier & Payload Copy
    // =========================================================================

    public OnShareTierChange(tier: string): void {
        this.ShareTier = tier;
        void this.FetchSharePreview().then(() => {
            this.publishAgentContext();
            this.cdr.markForCheck();
        });
    }

    public async CopySharePayload(): Promise<void> {
        if (!this.SharePreview?.payloadJson) return;
        try {
            await navigator.clipboard.writeText(this.SharePreview.payloadJson);
            this.CopyFeedbackMessage = 'Copied to clipboard!';
            setTimeout(() => {
                this.CopyFeedbackMessage = null;
                this.cdr.markForCheck();
            }, 2500);
            this.cdr.markForCheck();
        } catch {
            this.CopyFeedbackMessage = 'Failed to copy';
        }
    }

    // =========================================================================
    // SVG Chart Helpers
    // =========================================================================

    public get VolumeChartPoints(): string {
        const buckets = this.MinuteSeries?.countBuckets ?? [];
        if (buckets.length === 0) return '';
        const maxCount = Math.max(1, ...buckets.map((b) => b.count));
        const width = 600;
        const height = 120;
        const step = width / Math.max(1, buckets.length - 1);

        return buckets
            .map((b, idx) => {
                const x = idx * step;
                const y = height - (b.count / maxCount) * (height - 10) - 5;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    }

    public get VolumeChartAreaPath(): string {
        const points = this.VolumeChartPoints;
        if (!points) return '';
        return `M 0,120 L ${points} L 600,120 Z`;
    }

    public get DurationChartPoints(): string {
        const buckets = this.MinuteSeries?.countBuckets ?? [];
        if (buckets.length === 0) return '';
        const averages = buckets.map((b) => (b.count > 0 ? b.totalElapsedMs / b.count : 0));
        const maxAvg = Math.max(1, ...averages);
        const width = 600;
        const height = 120;
        const step = width / Math.max(1, buckets.length - 1);

        return averages
            .map((avg, idx) => {
                const x = idx * step;
                const y = height - (avg / maxAvg) * (height - 10) - 5;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    }

    public GetSparklinePointsForSignal(signalCode: string): string {
        const allBuckets = this.MinuteSeries?.probeSignalBuckets ?? [];
        const filtered = allBuckets.filter((b) => b.signalCode === signalCode);
        if (filtered.length === 0) return '0,10 60,10';
        const width = 60;
        const height = 20;
        const step = width / Math.max(1, filtered.length - 1);
        const maxDuration = Math.max(1, ...filtered.map((b) => b.totalDurationMs));

        return filtered
            .map((b, idx) => {
                const x = idx * step;
                const y = height - (b.totalDurationMs / maxDuration) * (height - 4) - 2;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    }

    // =========================================================================
    // Agent Context & Client Tools Wiring
    // =========================================================================

    private publishAgentContext(): void {
        if (!this.navigationService) return;

        const ctx = BuildHealthObservatoryAgentContext({
            activeTab: this.ActiveTab,
            checkMode: this.CheckMode,
            timeWindow: this.TimeWindow,
            selectedCategory: this.SelectedCategory,
            autoRefreshIntervalSeconds: this.AutoRefreshIntervalSeconds,
            appFilter: this.AppFilter,
            selectedProbeCode: this.SelectedProbeCode ?? undefined,
            healthReport: this.HealthReport,
            aggregates: this.CategoryAggregates,
            otelStatus: this.OtelStatus,
            sharePreview: this.SharePreview,
            isExecutingLiveTest: this.IsExecutingLiveTest,
            isLoading: this.IsLoading || this.IsRefreshing,
        });

        this.navigationService.SetAgentContext(this, ctx);
    }

    private syncAgentTools(): void {
        if (!this.navigationService) return;

        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchObservatoryTab',
                Description: 'Switches the active Health Observatory tab view',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        tab: {
                            type: 'string',
                            enum: ['probes', 'telemetry', 'otel', 'share-layer'],
                        },
                    },
                    required: ['tab'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const tab = params.tab;
                    if (IsValidObservatoryTab(tab)) {
                        this.OnTabChange(tab);
                        return { success: true, activeTab: tab };
                    }
                    return { success: false, error: `Invalid tab: ${String(tab)}` };
                },
            },
            {
                Name: 'RunHealthCheck',
                Description: 'Runs a passive or active health probe check across the instance',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        mode: {
                            type: 'string',
                            enum: ['passive', 'startup', 'readiness', 'live-test'],
                        },
                        appFilter: { type: 'string' },
                    },
                },
                Handler: async (params: Record<string, unknown>) => {
                    if (params.mode && IsValidCheckMode(params.mode)) {
                        this.CheckMode = params.mode;
                    }
                    if (typeof params.appFilter === 'string') {
                        this.AppFilter = params.appFilter;
                    }
                    await this.FetchHealthReport();
                    this.publishAgentContext();
                    this.cdr.markForCheck();
                    return {
                        success: true,
                        overallStatus: this.HealthReport?.overallStatus,
                        summaryCounts: this.HealthReport?.summaryCounts,
                    };
                },
            },
            {
                Name: 'ExecuteLiveCrudVerification',
                Description:
                    'Executes live CRUD functional verification with transactional rollback isolation',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        appFilter: { type: 'string' },
                    },
                },
                Handler: async (params: Record<string, unknown>) => {
                    if (typeof params.appFilter === 'string') {
                        this.AppFilter = params.appFilter;
                    }
                    await this.RunLiveCrudVerification();
                    return {
                        success: this.LiveCrudExecutionSuccess,
                        durationMs: this.LiveCrudDurationMs,
                        steps: this.LiveCrudSteps,
                    };
                },
            },
            {
                Name: 'FilterTelemetryByCategory',
                Description: 'Filters telemetry time-series and ring-buffer events by category',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        category: { type: 'string' },
                    },
                    required: ['category'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    if (typeof params.category === 'string') {
                        this.OnCategoryChange(params.category);
                        return { success: true, selectedCategory: this.SelectedCategory };
                    }
                    return { success: false, error: 'Category must be a string' };
                },
            },
            {
                Name: 'SetTimeWindow',
                Description: 'Sets the time window for telemetry aggregations',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        window: { type: 'string', enum: ['15m', '1h', '6h', '24h'] },
                    },
                    required: ['window'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    if (IsValidTimeWindow(params.window)) {
                        this.OnTimeWindowChange(params.window);
                        return { success: true, timeWindow: this.TimeWindow };
                    }
                    return { success: false, error: `Invalid window: ${String(params.window)}` };
                },
            },
            {
                Name: 'RefreshObservatoryData',
                Description: 'Refreshes all Health Observatory metrics, probes and telemetry data',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.RefreshAll();
                    return { success: true, refreshedAt: this.LastRefreshedAt?.toISOString() };
                },
            },
        ]);
    }
}
