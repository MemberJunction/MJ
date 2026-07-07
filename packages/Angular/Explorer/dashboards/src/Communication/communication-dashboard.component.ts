import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import {
    buildCommunicationAgentContext,
    isValidCommunicationTab,
    communicationTabLabel,
    resolveCommunicationItem,
    capCommunicationList,
    COMMUNICATION_TABS,
    COMMUNICATION_LOG_STATUSES,
    CommunicationTab,
    CommunicationLogStatus,
    CommunicationSurfaceContext,
    CommunicationItemCandidate,
} from './communication-agent-context';
import { validateEnumParam, validateStringParam } from '../shared/agent-tool-validation';
import { CommunicationLogsResourceComponent } from './communication-logs-resource.component';
import { CommunicationProvidersResourceComponent } from './communication-providers-resource.component';
import { CommunicationTemplatesResourceComponent } from './communication-templates-resource.component';
import { CommunicationRunsResourceComponent } from './communication-runs-resource.component';
import { CommunicationMonitorResourceComponent } from './communication-monitor-resource.component';

interface CommunicationDashboardState {
    activeTab: string;
}

/** Tolerant result shape returned by this dashboard's agent client-tool handlers. */
interface CommunicationToolResult {
    Success: boolean;
    ErrorMessage?: string;
}

/** The tool-definition shape NavigationService.SetAgentClientTools accepts. */
interface CommunicationAgentTool {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/** A per-surface tracked selection (id + display name), set by the agent's select tools. */
interface SelectedCommunicationItem {
    id: string;
    name: string;
}

@Component({
  standalone: false,
    selector: 'mj-communication-dashboard',
    templateUrl: './communication-dashboard.component.html',
    styleUrls: ['./communication-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'CommunicationDashboard')
export class CommunicationDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
    public isLoading = false;
    public isRefreshing = false;
    public activeTab = 'monitor';
    public selectedIndex = 0;

    private visitedTabs = new Set<string>();
    public navigationItems: string[] = [...COMMUNICATION_TABS];

    private stateChangeSubject = new Subject<CommunicationDashboardState>();

    // Per-surface agent selection. The agent's SelectLog / SelectProvider / SelectTemplate /
    // SelectRun tools record what was last picked so the context can report it by id+name
    // (and the Open* tools can act on it). Read-only — selecting never mutates anything.
    private selectedLog: SelectedCommunicationItem | null = null;
    private selectedProvider: SelectedCommunicationItem | null = null;
    private selectedTemplate: SelectedCommunicationItem | null = null;
    private selectedRun: SelectedCommunicationItem | null = null;

    // Child resource components are mounted lazily (only after their tab is first
    // visited) and live inside @if blocks, so these queries resolve to a ref only
    // while their tab is the active, mounted one. They are read defensively — a null
    // ref simply means that surface's state isn't available yet.
    @ViewChild(CommunicationLogsResourceComponent) private logsChild?: CommunicationLogsResourceComponent;
    @ViewChild(CommunicationProvidersResourceComponent) private providersChild?: CommunicationProvidersResourceComponent;
    @ViewChild(CommunicationTemplatesResourceComponent) private templatesChild?: CommunicationTemplatesResourceComponent;
    @ViewChild(CommunicationRunsResourceComponent) private runsChild?: CommunicationRunsResourceComponent;
    @ViewChild(CommunicationMonitorResourceComponent) private monitorChild?: CommunicationMonitorResourceComponent;

    constructor(private cdr: ChangeDetectorRef) {
        super();
        this.setupStateManagement();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return "Communications";
    }

    ngAfterViewInit(): void {
        this.visitedTabs.add(this.activeTab);
        this.emitStateChange();
        // Wire the agent context + client tools (see SAFETY BOUNDARY below).
        this.registerAgentClientTools();
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.stateChangeSubject.complete();
    }

    public onTabChange(tabId: string): void {
        this.activeTab = tabId;
        const index = this.navigationItems.indexOf(tabId);
        this.selectedIndex = index >= 0 ? index : 0;

        setTimeout(() => {
            SharedService.Instance.InvokeManualResize();
            // The newly-mounted child has had a tick to load; re-publish so its
            // deep state reaches the agent and re-scope the tool set to the new tab.
            this.publishAgentContext();
        }, 100);

        this.visitedTabs.add(tabId);
        this.emitStateChange();
        // Immediate re-emit reflects the tab switch even before the child loads.
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public hasVisited(tabId: string): boolean {
        return this.visitedTabs.has(tabId);
    }

    public onRefresh(): void {
        this.isRefreshing = true;
        this.cdr.markForCheck();
        this.publishAgentContext();
        setTimeout(() => {
            this.isRefreshing = false;
            this.cdr.markForCheck();
            this.publishAgentContext();
        }, 1000);
    }

    private setupStateManagement(): void {
        this.stateChangeSubject.pipe(
            debounceTime(50)
        ).subscribe(state => {
            this.UserStateChanged.emit(state);
        });
    }

    private emitStateChange(): void {
        const state: CommunicationDashboardState = {
            activeTab: this.activeTab
        };
        this.stateChangeSubject.next(state);
    }

    public loadUserState(state: Partial<CommunicationDashboardState>): void {
        if (state.activeTab) {
            this.activeTab = state.activeTab;
            const index = this.navigationItems.indexOf(state.activeTab);
            this.selectedIndex = index >= 0 ? index : 0;
            this.visitedTabs.add(state.activeTab);
        }
        this.cdr.markForCheck();
    }

    initDashboard(): void {
        try {
            this.isLoading = true;
        } catch (error) {
            console.error('Error initializing Communication dashboard:', error);
            this.Error.emit(new Error('Failed to initialize Communication dashboard. Please try again.'));
        } finally {
            this.isLoading = false;
        }
    }

    loadData(): void {
        if (this.Config?.userState) {
            setTimeout(() => {
                if (this.Config?.userState) {
                    this.loadUserState(this.Config.userState);
                }
            }, 0);
        }
        this.NotifyLoadComplete();
    }

    public getCurrentTabLabel(): string {
        return communicationTabLabel(this.activeTab);
    }

    // ================================================================
    // AI Agent Context & Client Tools
    //
    // 🚨 SAFETY BOUNDARY — NAVIGATIONAL + READ-ONLY-DISPLAY ONLY 🚨
    // The Communication dashboard sends real messages and manages providers and
    // templates. The agent context and client tools registered here are strictly
    // READ / FILTER / SEARCH / SELECT / NAVIGATE: tab switches, a refresh of
    // already-visible data, status/category filters + free-text search on the
    // (read-only) lists, selecting a visible row by id/name, and opening a
    // template / provider / log / run record in a tab.
    //
    // The following side-effecting operations that exist on this surface (in the
    // child resource components) are DELIBERATELY NOT exposed to the agent:
    //   - Sending / composing messages (onSend / new-message resource) — irreversible
    //     outbound side effect.
    //   - Creating / editing / deleting templates or providers — config mutation.
    //   - Any test-send / "send sample" action.
    // Context exposes only aggregate counts, the active filters/search, and the
    // salient DISPLAY names of visible rows — never message bodies, recipient lists,
    // provider credentials, or template content.
    // ================================================================

    /**
     * Publish the current Communication dashboard state to the AI agent via
     * NavigationService, then re-scope the tool set to the active tab. Re-invoked on
     * every meaningful state change (tab switch, refresh start/end, agent filter/select
     * action, and a tick after a tab mounts) so the agent always sees a fresh, read-only
     * snapshot. Only the ACTIVE surface's deep state is harvested — context is mode-scoped
     * to whatever tab is open, mirroring the Data Explorer pattern.
     */
    private publishAgentContext(): void {
        const context = buildCommunicationAgentContext({
            ActiveTab: isValidCommunicationTab(this.activeTab) ? this.activeTab : 'monitor',
            ActiveTabLabel: this.getCurrentTabLabel(),
            VisitedTabs: Array.from(this.visitedTabs),
            IsRefreshing: this.isRefreshing,
            Surface: this.harvestActiveSurface(),
        });
        this.navigationService.SetAgentContext(this, context);
        this.syncAgentToolsForMode();
    }

    /**
     * Harvest the deep, per-surface state slice for the ACTIVE tab from whichever child
     * resource component is mounted. Returns `{ Surface: 'none' }` when the active tab's
     * child isn't available (settings tab, or a tab restored from saved state whose
     * content hasn't loaded yet) — so context truthfully reports "not loaded" rather than
     * fabricating zeros.
     */
    private harvestActiveSurface(): CommunicationSurfaceContext {
        switch (this.activeTab) {
            case 'monitor':
                return this.harvestMonitorSurface();
            case 'logs':
                return this.harvestLogsSurface();
            case 'providers':
                return this.harvestProvidersSurface();
            case 'templates':
                return this.harvestTemplatesSurface();
            case 'runs':
                return this.harvestRunsSurface();
            default:
                return { Surface: 'none' };
        }
    }

    private harvestMonitorSurface(): CommunicationSurfaceContext {
        const c = this.monitorChild;
        if (!c) {
            return { Surface: 'none' };
        }
        return {
            Surface: 'monitor',
            TotalSent: c.stats.totalSent,
            DeliveryRate: c.stats.deliveryRate,
            Pending: c.stats.pending,
            Failed: c.stats.failed,
            ProviderHealthNames: capCommunicationList(c.providerHealth.map(p => p.Name)),
            ProviderHealthCount: c.providerHealth.length,
            ChannelNames: c.channelBreakdown.map(ch => ch.Name),
            RecentActivityNames: capCommunicationList(
                c.recentLogs.map(l => `${l.CommunicationProviderMessageType || 'Message'} · ${l.CommunicationProvider || 'Unknown'} · ${l.Status}`),
            ),
        };
    }

    private harvestLogsSurface(): CommunicationSurfaceContext {
        const c = this.logsChild;
        if (!c) {
            return { Surface: 'none' };
        }
        return {
            Surface: 'logs',
            LogCount: c.logs.length,
            FilteredLogCount: c.filteredLogs.length,
            StatusFilter: c.statusFilter as CommunicationLogStatus,
            SearchText: c.SearchText,
            VisibleLogSummaries: capCommunicationList(c.filteredLogs.map(l => this.logDisplayName(l))),
            SelectedItemId: this.selectedLog?.id ?? null,
            SelectedItemName: this.selectedLog?.name ?? null,
        };
    }

    private harvestProvidersSurface(): CommunicationSurfaceContext {
        const c = this.providersChild;
        if (!c) {
            return { Surface: 'none' };
        }
        return {
            Surface: 'providers',
            ProviderCount: c.providerCards.length,
            ActiveProviderCount: c.providerCards.filter(p => p.Entity.Status === 'Active').length,
            ProviderNames: capCommunicationList(c.providerCards.map(p => p.Entity.Name)),
            SelectedItemId: this.selectedProvider?.id ?? null,
            SelectedItemName: this.selectedProvider?.name ?? null,
        };
    }

    private harvestTemplatesSurface(): CommunicationSurfaceContext {
        const c = this.templatesChild;
        if (!c) {
            return { Surface: 'none' };
        }
        return {
            Surface: 'templates',
            TemplateCount: c.allTemplates.length,
            FilteredTemplateCount: c.filteredTemplates.length,
            CategoryFilter: c.categoryFilter,
            SearchText: c.SearchText,
            AvailableCategories: capCommunicationList(c.categories),
            VisibleTemplateNames: capCommunicationList(c.filteredTemplates.map(t => t.Entity.Name)),
            SelectedItemId: this.selectedTemplate?.id ?? null,
            SelectedItemName: this.selectedTemplate?.name ?? null,
        };
    }

    private harvestRunsSurface(): CommunicationSurfaceContext {
        const c = this.runsChild;
        if (!c) {
            return { Surface: 'none' };
        }
        return {
            Surface: 'runs',
            RunCount: c.runs.length,
            ActiveRunCount: c.summary.active,
            CompletedRunCount: c.summary.completed,
            SuccessRate: c.summary.successRate,
            VisibleRunSummaries: capCommunicationList(c.runs.map(r => `${this.runDisplayName(r.ID)} · ${r.Status}`)),
            SelectedItemId: this.selectedRun?.id ?? null,
            SelectedItemName: this.selectedRun?.name ?? null,
        };
    }

    /** The display label the runs timeline shows for a run ("Run #<short-id>"). */
    private runDisplayName(id: string): string {
        return `Run #${(id || '').substring(0, 8)}`;
    }

    /**
     * The on-screen display summary for a log row ("<provider> · <type> · <status>"),
     * used both for context publishing and for name-based resolution by the agent's
     * Select/Open log tools — so the agent can refer to a row exactly as it's described
     * in context.
     */
    private logDisplayName(log: { CommunicationProvider?: string; CommunicationProviderMessageType?: string; Status: string }): string {
        return `${log.CommunicationProvider || 'Unknown'} · ${log.CommunicationProviderMessageType || 'Message'} · ${log.Status}`;
    }

    /** id+name candidates for the visible (filtered) log rows. Empty when the Logs tab isn't mounted. */
    private logCandidates(): CommunicationItemCandidate[] {
        return (this.logsChild?.filteredLogs ?? []).map(l => ({ ID: l.ID, Name: this.logDisplayName(l) }));
    }

    // -- Mode-scoped client tools -------------------------------------------------

    /**
     * Tracks which tool set was last registered, so the mode-scoped re-registration
     * ({@link syncAgentToolsForMode}) only fires on a tab transition rather than on
     * every state change.
     */
    private lastRegisteredToolMode: CommunicationTab | null = null;

    /**
     * Re-scope the agent's client tools to the ACTIVE tab. Each surface exposes a
     * different set of affordances (logs filter by status + search + select/open a log;
     * templates filter by category + search + select/open a template; providers select/
     * open a provider; runs select/open a run; monitor is read-only), so a logs-only tool
     * is never exposed while the Providers tab is open and vice-versa. The COMMON tools
     * (switch tab, refresh) are always present. Because {@link publishAgentContext} fires
     * on every state change but the tool set only changes on the tab flip, this guards on
     * {@link lastRegisteredToolMode} and only calls into NavigationService when the active
     * tab actually changes.
     */
    private syncAgentToolsForMode(): void {
        const mode = isValidCommunicationTab(this.activeTab) ? this.activeTab : 'monitor';
        if (mode === this.lastRegisteredToolMode) {
            return;
        }
        this.lastRegisteredToolMode = mode;
        this.navigationService.SetAgentClientTools(this, [
            ...this.buildCommonTools(),
            ...this.buildSurfaceTools(mode),
        ]);
    }

    /**
     * Register the navigational / read-only client tools the agent may invoke. Called
     * once on mount; {@link syncAgentToolsForMode} re-registers the surface-scoped slice
     * on every tab change. See the SAFETY BOUNDARY comment above for the operations
     * intentionally NOT exposed.
     */
    private registerAgentClientTools(): void {
        this.lastRegisteredToolMode = null;
        this.syncAgentToolsForMode();
    }

    private buildAgentTool(
        name: string,
        description: string,
        parameterSchema: Record<string, unknown>,
        handler: (params: Record<string, unknown>) => Promise<unknown>,
    ): CommunicationAgentTool {
        return { Name: name, Description: description, ParameterSchema: parameterSchema, Handler: handler };
    }

    /** COMMON tools — available on EVERY tab (switch tab + refresh). */
    private buildCommonTools(): CommunicationAgentTool[] {
        return [
            this.buildAgentTool(
                'SwitchCommunicationTab',
                'Switch the active Communication dashboard tab. Valid tabs: monitor, logs, providers, templates, runs, settings.',
                {
                    type: 'object',
                    properties: { tab: { type: 'string', enum: [...COMMUNICATION_TABS] } },
                    required: ['tab'],
                },
                async (params) => this.handleSwitchTabTool(params),
            ),
            this.buildAgentTool(
                'RefreshCommunicationData',
                'Refresh the currently-displayed Communication data. Read-only — re-loads existing data, sends nothing.',
                { type: 'object', properties: {} },
                async () => {
                    this.onRefresh();
                    return { Success: true };
                },
            ),
        ];
    }

    /** The surface-scoped tool slice for the active tab. */
    private buildSurfaceTools(mode: CommunicationTab): CommunicationAgentTool[] {
        switch (mode) {
            case 'logs':
                return this.buildLogsTools();
            case 'providers':
                return this.buildProvidersTools();
            case 'templates':
                return this.buildTemplatesTools();
            case 'runs':
                return this.buildRunsTools();
            case 'monitor':
            case 'settings':
            default:
                return [];
        }
    }

    private buildLogsTools(): CommunicationAgentTool[] {
        return [
            this.buildAgentTool(
                'FilterLogsBy',
                "Filter the message-log list by delivery status. Valid statuses: Complete, Failed, Pending, or '' to clear.",
                {
                    type: 'object',
                    properties: { status: { type: 'string', enum: [...COMMUNICATION_LOG_STATUSES] } },
                    required: ['status'],
                },
                async (params) => this.handleFilterLogsTool(params),
            ),
            this.buildAgentTool(
                'SearchLogs',
                'Type into the log-list search box to filter logs by provider, message type, status, or error text.',
                { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                async (params) => this.handleSearchLogsTool(params),
            ),
            this.buildAgentTool(
                'SelectLog',
                'Select a visible message-log row by its id or a display value (provider / message type / status). Read-only — records the selection so it can be opened or referenced.',
                { type: 'object', properties: { log: { type: 'string' } }, required: ['log'] },
                async (params) => this.handleSelectLogTool(params),
            ),
            this.buildAgentTool(
                'OpenLog',
                'Open a message-log record in a tab by id or display value. Defaults to the currently-selected log when no argument is given. Read-only navigation.',
                { type: 'object', properties: { log: { type: 'string' } } },
                async (params) => this.handleOpenLogTool(params),
            ),
        ];
    }

    private buildProvidersTools(): CommunicationAgentTool[] {
        return [
            this.buildAgentTool(
                'SelectProvider',
                'Select a configured provider card by its name or id. Read-only — records the selection so it can be opened or referenced.',
                { type: 'object', properties: { provider: { type: 'string' } }, required: ['provider'] },
                async (params) => this.handleSelectProviderTool(params),
            ),
            this.buildAgentTool(
                'OpenProvider',
                'Open a provider record in a tab by name or id. Defaults to the currently-selected provider when no argument is given. Read-only navigation — does NOT edit the provider.',
                { type: 'object', properties: { provider: { type: 'string' } } },
                async (params) => this.handleOpenProviderTool(params),
            ),
        ];
    }

    private buildTemplatesTools(): CommunicationAgentTool[] {
        return [
            this.buildAgentTool(
                'FilterTemplatesByCategory',
                "Filter the template list by category, or pass '' to clear the filter.",
                { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
                async (params) => this.handleFilterTemplatesTool(params),
            ),
            this.buildAgentTool(
                'SearchTemplates',
                'Type into the template-list search box to filter templates by name, description, or category.',
                { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                async (params) => this.handleSearchTemplatesTool(params),
            ),
            this.buildAgentTool(
                'SelectTemplate',
                'Select a visible template by its name or id. Read-only — records the selection so it can be opened or referenced.',
                { type: 'object', properties: { template: { type: 'string' } }, required: ['template'] },
                async (params) => this.handleSelectTemplateTool(params),
            ),
            this.buildAgentTool(
                'OpenTemplate',
                'Open a template record in a tab by name or id. Defaults to the currently-selected template when no argument is given. Read-only navigation — does NOT edit the template.',
                { type: 'object', properties: { template: { type: 'string' } } },
                async (params) => this.handleOpenTemplateTool(params),
            ),
        ];
    }

    private buildRunsTools(): CommunicationAgentTool[] {
        return [
            this.buildAgentTool(
                'SelectRun',
                'Select a visible bulk-run by its id or display label ("Run #<short-id>"). Read-only — records the selection so it can be opened or referenced.',
                { type: 'object', properties: { run: { type: 'string' } }, required: ['run'] },
                async (params) => this.handleSelectRunTool(params),
            ),
            this.buildAgentTool(
                'OpenRun',
                'Open a bulk communication-run record in a tab by id or display label. Defaults to the currently-selected run when no argument is given. Read-only navigation.',
                { type: 'object', properties: { run: { type: 'string' } } },
                async (params) => this.handleOpenRunTool(params),
            ),
        ];
    }

    // -- Tolerant tool handlers ---------------------------------------------------

    private handleSwitchTabTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateEnumParam(params?.['tab'], this.navigationItems as readonly string[], 'tab');
        if (!v.ok) {
            return v.result;
        }
        this.onTabChange(v.value);
        return { Success: true };
    }

    private handleFilterLogsTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateEnumParam(params?.['status'], COMMUNICATION_LOG_STATUSES, 'status');
        if (!v.ok) {
            return v.result;
        }
        if (!this.logsChild) {
            return { Success: false, ErrorMessage: 'The Logs tab is not open. Switch to the Logs tab before filtering logs.' };
        }
        this.logsChild.onStatusFilter(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleSearchLogsTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateStringParam(params?.['query'], 'query');
        if (!v.ok) {
            return v.result;
        }
        if (!this.logsChild) {
            return { Success: false, ErrorMessage: 'The Logs tab is not open. Switch to the Logs tab before searching logs.' };
        }
        this.logsChild.onSearchValue(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleSelectLogTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateStringParam(params?.['log'], 'log');
        if (!v.ok) {
            return v.result;
        }
        if (!this.logsChild) {
            return { Success: false, ErrorMessage: 'The Logs tab is not open. Switch to the Logs tab first.' };
        }
        const match = resolveCommunicationItem(v.value, this.logCandidates());
        if (!match) {
            return { Success: false, ErrorMessage: `No visible log matches "${v.value}".` };
        }
        this.selectedLog = { id: match.ID, name: match.Name };
        this.publishAgentContext();
        return { Success: true };
    }

    private handleOpenLogTool(params: Record<string, unknown>): CommunicationToolResult {
        const ref = typeof params?.['log'] === 'string' ? (params['log'] as string) : '';
        if (ref && this.logsChild) {
            const match = resolveCommunicationItem(ref, this.logCandidates());
            if (match) {
                this.selectedLog = { id: match.ID, name: match.Name };
            }
        }
        if (!this.selectedLog) {
            return { Success: false, ErrorMessage: 'No log to open. Select a log first or pass an id / display value.' };
        }
        this.navigationService.OpenEntityRecord('MJ: Communication Logs', CompositeKey.FromID(this.selectedLog.id));
        return { Success: true };
    }

    private handleSelectProviderTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateStringParam(params?.['provider'], 'provider');
        if (!v.ok) {
            return v.result;
        }
        if (!this.providersChild) {
            return { Success: false, ErrorMessage: 'The Providers tab is not open. Switch to the Providers tab first.' };
        }
        const candidates: CommunicationItemCandidate[] = this.providersChild.providerCards.map(p => ({ ID: p.Entity.ID, Name: p.Entity.Name }));
        const match = resolveCommunicationItem(v.value, candidates);
        if (!match) {
            return { Success: false, ErrorMessage: `No provider matches "${v.value}".` };
        }
        this.selectedProvider = { id: match.ID, name: match.Name };
        this.publishAgentContext();
        return { Success: true };
    }

    private handleOpenProviderTool(params: Record<string, unknown>): CommunicationToolResult {
        const ref = typeof params?.['provider'] === 'string' ? (params['provider'] as string) : '';
        if (ref && this.providersChild) {
            const candidates: CommunicationItemCandidate[] = this.providersChild.providerCards.map(p => ({ ID: p.Entity.ID, Name: p.Entity.Name }));
            const match = resolveCommunicationItem(ref, candidates);
            if (match) {
                this.selectedProvider = { id: match.ID, name: match.Name };
            }
        }
        if (!this.selectedProvider) {
            return { Success: false, ErrorMessage: 'No provider to open. Select a provider first or pass a name / id.' };
        }
        this.navigationService.OpenEntityRecord('MJ: Communication Providers', CompositeKey.FromID(this.selectedProvider.id));
        return { Success: true };
    }

    private handleFilterTemplatesTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateStringParam(params?.['category'], 'category');
        if (!v.ok) {
            return v.result;
        }
        if (!this.templatesChild) {
            return { Success: false, ErrorMessage: 'The Templates tab is not open. Switch to the Templates tab first.' };
        }
        this.templatesChild.onCategoryFilter(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleSearchTemplatesTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateStringParam(params?.['query'], 'query');
        if (!v.ok) {
            return v.result;
        }
        if (!this.templatesChild) {
            return { Success: false, ErrorMessage: 'The Templates tab is not open. Switch to the Templates tab first.' };
        }
        this.templatesChild.onSearchValue(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleSelectTemplateTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateStringParam(params?.['template'], 'template');
        if (!v.ok) {
            return v.result;
        }
        if (!this.templatesChild) {
            return { Success: false, ErrorMessage: 'The Templates tab is not open. Switch to the Templates tab first.' };
        }
        const candidates: CommunicationItemCandidate[] = this.templatesChild.filteredTemplates.map(t => ({ ID: t.Entity.ID, Name: t.Entity.Name }));
        const match = resolveCommunicationItem(v.value, candidates);
        if (!match) {
            return { Success: false, ErrorMessage: `No visible template matches "${v.value}".` };
        }
        this.selectedTemplate = { id: match.ID, name: match.Name };
        this.publishAgentContext();
        return { Success: true };
    }

    private handleOpenTemplateTool(params: Record<string, unknown>): CommunicationToolResult {
        const ref = typeof params?.['template'] === 'string' ? (params['template'] as string) : '';
        if (ref && this.templatesChild) {
            const candidates: CommunicationItemCandidate[] = this.templatesChild.filteredTemplates.map(t => ({ ID: t.Entity.ID, Name: t.Entity.Name }));
            const match = resolveCommunicationItem(ref, candidates);
            if (match) {
                this.selectedTemplate = { id: match.ID, name: match.Name };
            }
        }
        if (!this.selectedTemplate) {
            return { Success: false, ErrorMessage: 'No template to open. Select a template first or pass a name / id.' };
        }
        this.navigationService.OpenEntityRecord('MJ: Templates', CompositeKey.FromID(this.selectedTemplate.id));
        return { Success: true };
    }

    private handleSelectRunTool(params: Record<string, unknown>): CommunicationToolResult {
        const v = validateStringParam(params?.['run'], 'run');
        if (!v.ok) {
            return v.result;
        }
        if (!this.runsChild) {
            return { Success: false, ErrorMessage: 'The Runs tab is not open. Switch to the Runs tab first.' };
        }
        const candidates: CommunicationItemCandidate[] = this.runsChild.runs.map(r => ({ ID: r.ID, Name: this.runDisplayName(r.ID) }));
        const match = resolveCommunicationItem(v.value, candidates);
        if (!match) {
            return { Success: false, ErrorMessage: `No visible run matches "${v.value}".` };
        }
        this.selectedRun = { id: match.ID, name: match.Name };
        this.publishAgentContext();
        return { Success: true };
    }

    private handleOpenRunTool(params: Record<string, unknown>): CommunicationToolResult {
        const ref = typeof params?.['run'] === 'string' ? (params['run'] as string) : '';
        if (ref && this.runsChild) {
            const candidates: CommunicationItemCandidate[] = this.runsChild.runs.map(r => ({ ID: r.ID, Name: this.runDisplayName(r.ID) }));
            const match = resolveCommunicationItem(ref, candidates);
            if (match) {
                this.selectedRun = { id: match.ID, name: match.Name };
            }
        }
        if (!this.selectedRun) {
            return { Success: false, ErrorMessage: 'No run to open. Select a run first or pass an id / display label.' };
        }
        this.navigationService.OpenEntityRecord('MJ: Communication Runs', CompositeKey.FromID(this.selectedRun.id));
        return { Success: true };
    }
}
