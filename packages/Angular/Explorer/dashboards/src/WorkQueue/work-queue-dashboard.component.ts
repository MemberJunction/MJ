import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { BaseDashboard, SharedService } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { ResourceData, WorkQueueSubscriptionStatsRow } from '@memberjunction/core-entities';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { WorkQueueEngineBase } from '@memberjunction/work-queue-base';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { WorkQueueOperatorService } from './services/work-queue-operator.service';
import {
    buildWorkQueueAgentContext,
    isValidPartitionCondition,
    isValidWorkQueueTab,
    resolveSubscription,
    WORK_QUEUE_PARTITION_CONDITIONS,
    WORK_QUEUE_TAB_LABELS,
    WORK_QUEUE_TABS,
    WorkQueuePartitionCondition,
    WorkQueueSubscriptionSnapshot,
    WorkQueueTab,
} from './work-queue-agent-context';
import type { WorkQueueOverviewRow, WorkQueueRecordOpenRequest, WorkQueueSubscriptionOption, WorkQueueTransportOption } from './work-queue-types';
import { AgentToolResult, validateEnumParam, validateStringParam } from '../shared/agent-tool-validation';

/** Client-tool shape NavigationService.SetAgentClientTools accepts (declared locally, not re-exported). */
type WorkQueueAgentTool = {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
};

interface WorkQueueDashboardState {
    activeTab: WorkQueueTab;
    subscription: string | null;
    condition: WorkQueuePartitionCondition | null;
}

/** Interval between automatic stats refreshes while the dashboard is visible (spec 09b §refresh). */
const AUTO_REFRESH_MS = 15_000;

/**
 * Work Queue operator dashboard (spec 09b): topology + live stats, dead-letter triage, Ordered partition state and
 * binding validation, on top of the seven WorkQueue.* remote operations. The dashboard owns the topology load
 * (WorkQueueEngineBase) and the stats read; each tab owns its own operation calls through WorkQueueOperatorService.
 *
 * 🔒 SAFETY BOUNDARY: the agent tools registered here are read-only and navigational. Replay and discard are
 * mutations that require the operator's explicit confirmation in the UI and are never exposed as tools.
 */
@Component({
    standalone: false,
    selector: 'mj-work-queue-dashboard',
    templateUrl: './work-queue-dashboard.component.html',
    styleUrls: ['./work-queue-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'WorkQueueDashboard')
export class WorkQueueDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
    public IsLoading = false;
    public LoadError: string | null = null;
    public ActiveTab: WorkQueueTab = 'overview';
    public SelectedSubscription: string | null = null;
    public PartitionCondition: WorkQueuePartitionCondition | null = null;
    public Rows: WorkQueueOverviewRow[] = [];
    public SubscriptionOptions: WorkQueueSubscriptionOption[] = [];
    public TransportOptions: WorkQueueTransportOption[] = [];
    public StatsFailures: string[] = [];
    public StatsLoaded = false;
    public LastRefreshedAt: Date | null = null;
    /** Update on MJ: Work Queue Subscriptions gates replay/discard (spec 09b §permissions). */
    public CanOperate = false;
    public DeadLetterCount: number | null = null;
    public SelectedDeadLetterCount = 0;
    public BlockedPartitionCount: number | null = null;
    public BindingErrorCount: number | null = null;
    public BindingWarningCount: number | null = null;

    private isVisible = true;
    private autoRefreshHandle: ReturnType<typeof setInterval> | null = null;
    private readonly stateChangeSubject = new Subject<WorkQueueDashboardState>();
    private lastRegisteredToolTab: WorkQueueTab | null = null;

    constructor(private readonly cdr: ChangeDetectorRef, private readonly operator: WorkQueueOperatorService) {
        super();
        this.stateChangeSubject.pipe(debounceTime(50)).subscribe((state) => this.UserStateChanged.emit(state));
    }

    // ------------------------------------------------------------------ lifecycle

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Work Queue';
    }

    public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-layer-group';
    }

    public ngAfterViewInit(): void {
        this.publishAgentContext();
        this.syncAgentToolsForTab();
        this.startAutoRefresh();
    }

    public override ngOnDestroy(): void {
        super.ngOnDestroy();
        this.stopAutoRefresh();
        this.stateChangeSubject.complete();
    }

    public override SetVisible(visible: boolean): void {
        super.SetVisible(visible);
        this.isVisible = visible;
        if (visible) {
            void this.refreshStats();
        }
    }

    protected initDashboard(): void {
        this.applyQueryParams(this.GetQueryParams());
        this.CanOperate = this.resolveCanOperate();
    }

    protected async loadData(): Promise<void> {
        this.applyUserState();
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            await WorkQueueEngineBase.Instance.Config(true, undefined, this.ProviderToUse);
            this.buildTopology();
            await this.refreshStats();
        } catch (error) {
            this.LoadError = error instanceof Error ? error.message : String(error);
        } finally {
            this.IsLoading = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        this.applyQueryParams(params);
        this.syncAgentToolsForTab();
        this.publishAgentContext();
    }

    // ------------------------------------------------------------------ template API

    public get Tabs(): TabConfig[] {
        const deadLettered = this.StatsLoaded ? this.Rows.reduce((n, r) => n + (r.Stats?.DeadLettered ?? 0), 0) : 0;
        const blocked = this.StatsLoaded ? this.Rows.reduce((n, r) => n + (r.Stats?.BlockedKeys ?? 0), 0) : 0;
        return [
            { key: 'overview', label: WORK_QUEUE_TAB_LABELS.overview, icon: 'fa-solid fa-gauge-high' },
            { key: 'dead-letters', label: WORK_QUEUE_TAB_LABELS['dead-letters'], icon: 'fa-solid fa-envelope-open-text', badge: deadLettered > 0 ? deadLettered : null },
            { key: 'partitions', label: WORK_QUEUE_TAB_LABELS.partitions, icon: 'fa-solid fa-list-ol', badge: blocked > 0 ? blocked : null },
            { key: 'bindings', label: WORK_QUEUE_TAB_LABELS.bindings, icon: 'fa-solid fa-link', badge: (this.BindingErrorCount ?? 0) > 0 ? this.BindingErrorCount : null },
        ];
    }

    public get TotalPending(): number {
        return this.Rows.reduce((n, r) => n + (r.Stats?.Pending ?? 0), 0);
    }

    public get TotalInFlight(): number {
        return this.Rows.reduce((n, r) => n + (r.Stats?.InFlight ?? 0), 0);
    }

    public get TotalDeadLettered(): number {
        return this.Rows.reduce((n, r) => n + (r.Stats?.DeadLettered ?? 0), 0);
    }

    public get TotalBlockedKeys(): number {
        return this.Rows.reduce((n, r) => n + (r.Stats?.BlockedKeys ?? 0), 0);
    }

    public OnTabChange(tabId: string): void {
        if (!isValidWorkQueueTab(tabId) || tabId === this.ActiveTab) return;
        this.ActiveTab = tabId;
        setTimeout(() => SharedService.Instance.InvokeManualResize(), 100);
        this.UpdateQueryParams({ section: tabId });
        this.emitStateChange();
        this.syncAgentToolsForTab();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnSubscriptionChange(name: string | null): void {
        this.SelectedSubscription = name;
        this.UpdateQueryParams({ subscription: name });
        this.emitStateChange();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnConditionChange(condition: WorkQueuePartitionCondition | null): void {
        this.PartitionCondition = condition;
        this.UpdateQueryParams({ condition });
        this.emitStateChange();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /** Overview row click: jump to the dead letters of that subscription. */
    public OnOverviewSubscriptionSelected(name: string): void {
        this.SelectedSubscription = name;
        this.ActiveTab = 'dead-letters';
        this.UpdateQueryParams({ section: 'dead-letters', subscription: name });
        this.emitStateChange();
        this.syncAgentToolsForTab();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnOpenRecord(request: WorkQueueRecordOpenRequest): void {
        // first-pk-ok: MJ core work-queue entities are single-column ID keyed
        this.navigationService.OpenEntityRecord(request.EntityName, CompositeKey.FromID(request.ID));
    }

    public OnDeadLettersLoaded(event: { Count: number; Selected: number }): void {
        this.DeadLetterCount = event.Count;
        this.SelectedDeadLetterCount = event.Selected;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnPartitionsLoaded(event: { Count: number; Blocked: number }): void {
        this.BlockedPartitionCount = event.Blocked;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnBindingsLoaded(event: { Errors: number; Warnings: number }): void {
        this.BindingErrorCount = event.Errors;
        this.BindingWarningCount = event.Warnings;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /** A tab reports that replay/discard changed queue state: re-read stats so badges and totals catch up. */
    public OnQueueChanged(): void {
        void this.refreshStats();
    }

    // ------------------------------------------------------------------ data

    private buildTopology(): void {
        const engine = WorkQueueEngineBase.Instance;
        this.TransportOptions = engine.Transports.map((t) => ({ ID: t.ID, Name: t.Name, DriverClass: t.DriverClass, Status: t.Status }));
        this.Rows = engine.Subscriptions.flatMap((s) => {
            const topic = engine.TopicOf(s);
            const transport = topic ? engine.TransportOf(topic) : undefined;
            if (!topic || !transport) return [];
            return [{
                TransportID: transport.ID,
                Transport: transport.Name,
                DriverClass: transport.DriverClass,
                TopicID: topic.ID,
                Topic: topic.Name,
                IsFifo: topic.IsFifo,
                SubscriptionID: s.ID,
                Subscription: s.Name,
                PartitionMode: s.PartitionMode,
                Status: s.Status,
                HostType: s.HostType,
                HandlerKey: s.HandlerKey,
                Stats: null,
                Error: null,
            }];
        });
        this.SubscriptionOptions = this.Rows.map((r) => ({
            ID: r.SubscriptionID, Name: r.Subscription, Topic: r.Topic, Transport: r.Transport, DriverClass: r.DriverClass, PartitionMode: r.PartitionMode, Status: r.Status,
        }));
    }

    private async refreshStats(): Promise<void> {
        if (this.Rows.length === 0) {
            this.StatsLoaded = true;
            this.LastRefreshedAt = new Date();
            return;
        }
        try {
            const output = await this.operator.GetStats(this.ProviderToUse);
            const byName = new Map<string, WorkQueueSubscriptionStatsRow>(output.subscriptions.map((s) => [s.SubscriptionName, s]));
            const failures = new Map(output.failures.map((f) => [f.subscriptionName, f.error]));
            this.Rows = this.Rows.map((r) => ({ ...r, Stats: byName.get(r.Subscription) ?? r.Stats, Error: failures.get(r.Subscription) ?? null }));
            this.StatsFailures = output.failures.map((f) => `${f.subscriptionName}: ${f.error}`);
            this.StatsLoaded = true;
            this.LastRefreshedAt = new Date();
            this.LoadError = null;
        } catch (error) {
            this.LoadError = error instanceof Error ? error.message : String(error);
        }
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    private startAutoRefresh(): void {
        this.stopAutoRefresh();
        this.autoRefreshHandle = setInterval(() => {
            if (this.isVisible && !this.IsLoading && typeof document !== 'undefined' && !document.hidden) {
                void this.refreshStats();
            }
        }, AUTO_REFRESH_MS);
    }

    private stopAutoRefresh(): void {
        if (this.autoRefreshHandle !== null) {
            clearInterval(this.autoRefreshHandle);
            this.autoRefreshHandle = null;
        }
    }

    private resolveCanOperate(): boolean {
        const provider = this.ProviderToUse;
        const entity = provider.EntityByName('MJ: Work Queue Subscriptions');
        const user = provider.CurrentUser;
        if (!entity || !user) return false;
        return entity.GetUserPermisions(user).CanUpdate;
    }

    // ------------------------------------------------------------------ state

    private applyQueryParams(params: Record<string, string>): void {
        const section = params['section'];
        if (isValidWorkQueueTab(section)) this.ActiveTab = section;
        if ('subscription' in params) this.SelectedSubscription = params['subscription'] || null;
        const condition = params['condition'];
        if (!condition) {
            if ('condition' in params) this.PartitionCondition = null;
        } else if (isValidPartitionCondition(condition)) {
            this.PartitionCondition = condition;
        }
        this.cdr.markForCheck();
    }

    private applyUserState(): void {
        const state = this.Config?.userState as Partial<WorkQueueDashboardState> | undefined;
        if (!state) return;
        // Deep-link params win over remembered state; only fill what the URL did not set.
        const params = this.GetQueryParams();
        if (!params['section'] && isValidWorkQueueTab(state.activeTab)) this.ActiveTab = state.activeTab;
        if (!('subscription' in params) && state.subscription !== undefined) this.SelectedSubscription = state.subscription;
        if (!('condition' in params) && (state.condition === null || isValidPartitionCondition(state.condition))) this.PartitionCondition = state.condition ?? null;
    }

    private emitStateChange(): void {
        this.stateChangeSubject.next({ activeTab: this.ActiveTab, subscription: this.SelectedSubscription, condition: this.PartitionCondition });
    }

    // ------------------------------------------------------------------ agent surface

    private get subscriptionSnapshots(): WorkQueueSubscriptionSnapshot[] {
        return this.Rows.map((r) => ({
            ID: r.SubscriptionID,
            Name: r.Subscription,
            Topic: r.Topic,
            Transport: r.Transport,
            PartitionMode: r.PartitionMode,
            Status: r.Status,
            Pending: r.Stats?.Pending ?? null,
            InFlight: r.Stats?.InFlight ?? null,
            DeadLettered: r.Stats?.DeadLettered ?? null,
            BlockedKeys: r.Stats?.BlockedKeys ?? null,
            OldestPendingAgeSeconds: r.Stats?.OldestPendingAgeSeconds ?? null,
        }));
    }

    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, buildWorkQueueAgentContext({
            ActiveTab: this.ActiveTab,
            Subscriptions: this.subscriptionSnapshots,
            StatsFailures: this.StatsFailures,
            StatsLoaded: this.StatsLoaded,
            SelectedSubscription: this.SelectedSubscription,
            PartitionCondition: this.PartitionCondition,
            DeadLetterCount: this.DeadLetterCount,
            SelectedDeadLetterCount: this.SelectedDeadLetterCount,
            BindingErrorCount: this.BindingErrorCount,
            BindingWarningCount: this.BindingWarningCount,
            LastRefreshedAt: this.LastRefreshedAt?.toISOString() ?? null,
        }));
    }

    private syncAgentToolsForTab(): void {
        if (this.lastRegisteredToolTab === this.ActiveTab) return;
        this.lastRegisteredToolTab = this.ActiveTab;
        const tools = [...this.buildCommonTools()];
        if (this.ActiveTab === 'partitions') tools.push(this.buildFilterPartitionsTool());
        this.navigationService.SetAgentClientTools(this, tools);
    }

    private buildCommonTools(): WorkQueueAgentTool[] {
        return [
            {
                Name: 'SwitchWorkQueueTab',
                Description: `Switch the Work Queue dashboard to a tab. One of: ${WORK_QUEUE_TABS.join(', ')}.`,
                ParameterSchema: { type: 'object', properties: { tab: { type: 'string', enum: [...WORK_QUEUE_TABS] } }, required: ['tab'] },
                Handler: async (params): Promise<AgentToolResult> => {
                    const tab = validateEnumParam(params['tab'], WORK_QUEUE_TABS, 'tab');
                    if (!tab.ok) return tab.result;
                    this.OnTabChange(tab.value);
                    return { Success: true };
                },
            },
            {
                Name: 'RefreshWorkQueue',
                Description: 'Reload the topology and re-read the stats of every subscription.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async (): Promise<AgentToolResult> => {
                    await this.Refresh();
                    return { Success: true };
                },
            },
            {
                Name: 'SelectSubscription',
                Description: 'Select a subscription by name or ID; the Dead Letters and Partitions tabs show that subscription.',
                ParameterSchema: { type: 'object', properties: { subscription: { type: 'string' } }, required: ['subscription'] },
                Handler: async (params): Promise<AgentToolResult> => this.selectSubscriptionTool(params['subscription']),
            },
            {
                Name: 'OpenSubscriptionRecord',
                Description: 'Open the MJ: Work Queue Subscriptions record for a subscription (by name or ID) in a new tab.',
                ParameterSchema: { type: 'object', properties: { subscription: { type: 'string' } }, required: ['subscription'] },
                Handler: async (params): Promise<AgentToolResult> => {
                    const resolved = this.resolveSubscriptionParam(params['subscription']);
                    if (!resolved.ok) return resolved.result;
                    this.OnOpenRecord({ EntityName: 'MJ: Work Queue Subscriptions', ID: resolved.value.ID });
                    return { Success: true };
                },
            },
            {
                Name: 'GetSubscriptionStats',
                Description: 'Return the latest stats (pending, in flight, dead-lettered, blocked keys, oldest pending age) for one subscription, or all when omitted.',
                ParameterSchema: { type: 'object', properties: { subscription: { type: 'string' } } },
                Handler: async (params): Promise<AgentToolResult & { Stats?: WorkQueueSubscriptionSnapshot[] }> => {
                    if (params['subscription'] === undefined) return { Success: true, Stats: this.subscriptionSnapshots };
                    const resolved = this.resolveSubscriptionParam(params['subscription']);
                    if (!resolved.ok) return resolved.result;
                    return { Success: true, Stats: this.subscriptionSnapshots.filter((s) => s.ID === resolved.value.ID) };
                },
            },
        ];
    }

    private buildFilterPartitionsTool(): WorkQueueAgentTool {
        return {
            Name: 'FilterPartitions',
            Description: `Filter the Partitions tab by condition (${WORK_QUEUE_PARTITION_CONDITIONS.join(', ')}); pass an empty string to clear.`,
            ParameterSchema: { type: 'object', properties: { condition: { type: 'string', enum: ['', ...WORK_QUEUE_PARTITION_CONDITIONS] } }, required: ['condition'] },
            Handler: async (params): Promise<AgentToolResult> => {
                if (params['condition'] === '') {
                    this.OnConditionChange(null);
                    return { Success: true };
                }
                const condition = validateEnumParam(params['condition'], WORK_QUEUE_PARTITION_CONDITIONS, 'condition');
                if (!condition.ok) return condition.result;
                this.OnConditionChange(condition.value);
                return { Success: true };
            },
        };
    }

    private selectSubscriptionTool(raw: unknown): AgentToolResult {
        const resolved = this.resolveSubscriptionParam(raw);
        if (!resolved.ok) return resolved.result;
        this.OnSubscriptionChange(resolved.value.Name);
        return { Success: true };
    }

    private resolveSubscriptionParam(raw: unknown): { ok: true; value: WorkQueueSubscriptionOption } | { ok: false; result: AgentToolResult } {
        const query = validateStringParam(raw, 'subscription');
        if (!query.ok) return query;
        const resolution = resolveSubscription(this.SubscriptionOptions, query.value);
        switch (resolution.Kind) {
            case 'Match':
                return { ok: true, value: resolution.Item };
            case 'Ambiguous':
                return { ok: false, result: { Success: false, ErrorMessage: `"${query.value}" matches several subscriptions: ${resolution.Matches.map((m) => m.Name).join(', ')}.` } };
            default:
                return { ok: false, result: { Success: false, ErrorMessage: `No subscription matches "${query.value}".` } };
        }
    }
}
