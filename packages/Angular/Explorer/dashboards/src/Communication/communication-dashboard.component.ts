import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import {
    buildCommunicationAgentContext,
    isValidCommunicationTab,
    COMMUNICATION_LOG_STATUSES,
    CommunicationLogStatus,
} from './communication-agent-context';
import { validateEnumParam } from '../shared/agent-tool-validation';
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
    public navigationItems: string[] = ['monitor', 'logs', 'providers', 'templates', 'runs', 'settings'];

    private stateChangeSubject = new Subject<CommunicationDashboardState>();

    // Child resource components are mounted lazily (only after their tab is first
    // visited) and live inside @if blocks, so these queries resolve to a ref only
    // while their tab is the active, mounted one. They are read defensively — a null
    // ref simply means that surface's counts aren't available yet.
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
            // counts (if any) reach the agent.
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
        const tabIndex = this.navigationItems.indexOf(this.activeTab);
        const labels = ['Monitor', 'Logs', 'Providers', 'Templates', 'Runs', 'Settings'];
        return tabIndex >= 0 ? labels[tabIndex] : 'Communication Management';
    }

    // ================================================================
    // AI Agent Context & Client Tools
    //
    // 🚨 SAFETY BOUNDARY — NAVIGATIONAL + READ-ONLY-DISPLAY ONLY 🚨
    // The Communication dashboard sends real messages and manages providers and
    // templates. The agent context and client tools registered here are strictly
    // NAVIGATIONAL / READ-ONLY-DISPLAY: tab switches, a refresh of already-visible
    // data, and a status filter on the (read-only) message-log list.
    //
    // The following side-effecting operations that exist on this surface (in the
    // child resource components) are DELIBERATELY NOT exposed to the agent:
    //   - Sending / composing messages (onSend / new-message resource) — irreversible
    //     outbound side effect.
    //   - Creating / editing / deleting templates or providers — config mutation.
    //   - Any test-send / "send sample" action.
    // Context exposes only aggregate counts and the active filter — never message
    // bodies, recipient lists, provider credentials, or template content.
    // ================================================================

    /**
     * Publish the current Communication dashboard state to the AI agent via
     * NavigationService. Re-invoked on every meaningful state change (tab switch,
     * refresh start/end, and a tick after a tab mounts) so the agent always sees a
     * fresh, read-only snapshot. Per-feature counts are harvested from whichever
     * child resource components are currently mounted; unmounted tabs report `null`
     * (the helper then omits them rather than reporting a misleading 0).
     */
    private publishAgentContext(): void {
        const logStatus = this.logsChild ? (this.logsChild.statusFilter as CommunicationLogStatus) : null;
        const context = buildCommunicationAgentContext({
            ActiveTab: isValidCommunicationTab(this.activeTab) ? this.activeTab : 'monitor',
            ActiveTabLabel: this.getCurrentTabLabel(),
            VisitedTabs: Array.from(this.visitedTabs),
            IsRefreshing: this.isRefreshing,
            LogCount: this.logsChild ? this.logsChild.logs.length : null,
            FilteredLogCount: this.logsChild ? this.logsChild.filteredLogs.length : null,
            LogStatusFilter: logStatus,
            ProviderCount: this.providersChild ? this.providersChild.providerCards.length : null,
            TemplateCount: this.templatesChild ? this.templatesChild.allTemplates.length : null,
            RunCount: this.runsChild ? this.runsChild.runs.length : null,
            RecentSentCount: this.monitorChild ? this.monitorChild.stats.totalSent : null,
            FailedCount: this.monitorChild ? this.monitorChild.stats.failed : null,
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Register the navigational / read-only client tools the agent may invoke.
     * Every Handler is tolerant: it validates input and returns
     * `{ Success: false, ErrorMessage }` rather than throwing. See the SAFETY
     * BOUNDARY comment above for the operations intentionally NOT exposed.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchCommunicationTab',
                Description: 'Switch the active Communication dashboard tab. Valid tabs: monitor, logs, providers, templates, runs, settings.',
                ParameterSchema: {
                    type: 'object',
                    properties: { tab: { type: 'string', enum: ['monitor', 'logs', 'providers', 'templates', 'runs', 'settings'] } },
                    required: ['tab'],
                },
                Handler: async (params: Record<string, unknown>) => this.handleSwitchTabTool(params),
            },
            {
                Name: 'RefreshCommunicationData',
                Description: 'Refresh the currently-displayed Communication data. Read-only — re-loads existing data, sends nothing.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.onRefresh();
                    return { Success: true };
                },
            },
            {
                Name: 'FilterLogsBy',
                Description:
                    "Filter the message-log list by delivery status. Valid statuses: Complete, Failed, Pending, or '' to clear. Only applies when the Logs tab is open.",
                ParameterSchema: {
                    type: 'object',
                    properties: { status: { type: 'string', enum: ['', 'Complete', 'Failed', 'Pending'] } },
                    required: ['status'],
                },
                Handler: async (params: Record<string, unknown>) => this.handleFilterLogsTool(params),
            },
        ]);
    }

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
}
