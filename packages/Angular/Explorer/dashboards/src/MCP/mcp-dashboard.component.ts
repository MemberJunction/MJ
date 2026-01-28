/**
 * @fileoverview MCP (Model Context Protocol) Management Dashboard
 *
 * Provides a comprehensive admin interface for managing MCP servers,
 * connections, tools, and viewing execution logs.
 *
 * Uses left sidebar navigation with query string deep linking via NavigationService.
 *
 * @module MCP Dashboard
 */

import { Component, OnDestroy, ChangeDetectorRef, AfterViewInit, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject, BehaviorSubject, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';
import { BaseDashboard, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MCPServerEntity, MCPServerConnectionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { MCPToolsService, MCPSyncState, MCPSyncResult } from './services/mcp-tools.service';

/**
 * Interface for MCP Server data
 */
export interface MCPServerData {
    ID: string;
    Name: string;
    Description: string | null;
    TransportType: string;
    ServerURL: string | null;
    Command: string | null;
    DefaultAuthType: string;
    Status: string;
    RateLimitPerMinute: number | null;
    RateLimitPerHour: number | null;
    LastSyncAt: Date | null;
    ConnectionCount?: number;
    ToolCount?: number;
}

/**
 * Interface for MCP Connection data
 */
export interface MCPConnectionData {
    ID: string;
    MCPServerID: string;
    ServerName?: string;
    Name: string;
    Description: string | null;
    Status: string;
    CompanyID: string | null;
    AutoSyncTools: boolean;
    LogToolCalls: boolean;
    LastConnectedAt: Date | null;
    LastErrorMessage: string | null;
}

/**
 * Interface for MCP Tool data
 */
export interface MCPToolData {
    ID: string;
    MCPServerID: string;
    ServerName?: string;
    ToolName: string;
    ToolTitle: string | null;
    ToolDescription: string | null;
    InputSchema: string;
    Status: string;
    DiscoveredAt: Date;
    LastSeenAt: Date;
}

/**
 * Interface for server group (tools grouped by server)
 */
export interface MCPServerGroup {
    server: MCPServerData;
    tools: MCPToolData[];
    expanded: boolean;
}

/**
 * Tools view mode
 */
export type ToolsViewMode = 'card' | 'list';

/**
 * Tools sort options
 */
export type ToolsSortBy = 'name' | 'server' | 'discovered' | 'lastSeen';

/**
 * Interface for MCP Execution Log data
 */
export interface MCPExecutionLogData {
    ID: string;
    ConnectionID: string;
    ConnectionName?: string;
    ToolID: string | null;
    ToolName: string;
    Status: string;
    StartedAt: Date;
    CompletedAt: Date | null;
    DurationMs: number | null;
    UserID: string;
    UserName?: string;
    ErrorMessage: string | null;
}

/**
 * Dashboard filter options
 */
export interface MCPDashboardFilters {
    searchTerm: string;
    serverStatus: string;
    connectionStatus: string;
    toolStatus: string;
    logStatus: string;
}

/**
 * Dashboard statistics
 */
export interface MCPDashboardStats {
    totalServers: number;
    activeServers: number;
    totalConnections: number;
    activeConnections: number;
    totalTools: number;
    activeTools: number;
    recentExecutions: number;
    failedExecutions: number;
}

/**
 * Active tab type
 */
export type MCPDashboardTab = 'servers' | 'connections' | 'tools' | 'logs';

/**
 * MCP Management Dashboard Component
 *
 * Provides a tab-based interface for managing:
 * - MCP Servers
 * - MCP Connections
 * - MCP Tools
 * - Execution Logs
 */
@RegisterClass(BaseDashboard, 'MCPDashboard')
@Component({
    selector: 'mj-mcp-dashboard',
    templateUrl: './mcp-dashboard.component.html',
    styleUrls: ['./mcp-dashboard.component.css']
})
export class MCPDashboardComponent extends BaseDashboard implements OnInit, AfterViewInit, OnDestroy {

    // ========================================
    // State
    // ========================================

    private metadata = new Metadata();

    public servers: MCPServerData[] = [];
    public connections: MCPConnectionData[] = [];
    public tools: MCPToolData[] = [];
    public executionLogs: MCPExecutionLogData[] = [];

    public filteredServers: MCPServerData[] = [];
    public filteredConnections: MCPConnectionData[] = [];
    public filteredTools: MCPToolData[] = [];
    public filteredLogs: MCPExecutionLogData[] = [];

    public stats: MCPDashboardStats = {
        totalServers: 0,
        activeServers: 0,
        totalConnections: 0,
        activeConnections: 0,
        totalTools: 0,
        activeTools: 0,
        recentExecutions: 0,
        failedExecutions: 0
    };

    public ActiveTab: MCPDashboardTab = 'servers';
    public IsLoading = false;
    public ErrorMessage: string | null = null;

    public filters$ = new BehaviorSubject<MCPDashboardFilters>({
        searchTerm: '',
        serverStatus: 'all',
        connectionStatus: 'all',
        toolStatus: 'all',
        logStatus: 'all'
    });

    // Dialog state
    public ShowServerDialog = false;
    public ShowConnectionDialog = false;
    public ShowTestToolDialog = false;
    public EditingServer: MCPServerData | null = null;
    public EditingConnection: MCPConnectionData | null = null;

    // Test tool dialog pre-selection
    public TestToolServerID: string | null = null;
    public TestToolConnectionID: string | null = null;
    public TestToolID: string | null = null;

    // Tools tab state
    public ToolsViewMode: ToolsViewMode = 'card';
    public ToolsSortBy: ToolsSortBy = 'server';
    public ToolsSortAscending = true;
    public ServerGroups: MCPServerGroup[] = [];
    public ExpandedToolId: string | null = null;

    // Navigation state
    private skipUrlUpdate = true;
    private lastNavigatedUrl: string = '';

    // Sync state
    public SyncStates = new Map<string, MCPSyncState>();
    private syncSubscriptions = new Map<string, Subscription>();

    // ========================================
    // Lifecycle
    // ========================================

    private destroy$ = new Subject<void>();

    constructor(
        private cdr: ChangeDetectorRef,
        private router: Router,
        private navigationService: NavigationService,
        private mcpToolsService: MCPToolsService
    ) {
        super();
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        // Parse initial URL state
        this.parseAndApplyUrlState();

        // Apply configuration params if passed via NavigationService
        this.applyConfigurationParams();

        // Enable URL updates after initialization
        this.skipUrlUpdate = false;

        // Subscribe to router events to handle browser back/forward
        this.subscribeToRouterEvents();
    }

    /**
     * Parses the current URL query string and applies the tab state
     */
    private parseAndApplyUrlState(): void {
        const urlState = this.parseUrlState();
        if (urlState?.tab) {
            this.ActiveTab = urlState.tab;
        }
        this.lastNavigatedUrl = this.router.url;
    }

    /**
     * Parses URL query string to extract navigation state
     */
    private parseUrlState(): { tab?: MCPDashboardTab } | null {
        const url = this.router.url;
        const queryIndex = url.indexOf('?');
        if (queryIndex === -1) return null;

        const queryString = url.substring(queryIndex + 1);
        const params = new URLSearchParams(queryString);
        const tab = params.get('tab') as MCPDashboardTab | null;

        if (tab && this.isValidTab(tab)) {
            return { tab };
        }
        return null;
    }

    /**
     * Validates that a tab value is a valid MCPDashboardTab
     */
    private isValidTab(tab: string): tab is MCPDashboardTab {
        return ['servers', 'connections', 'tools', 'logs'].includes(tab);
    }

    /**
     * Applies configuration params passed via NavigationService
     */
    private applyConfigurationParams(): void {
        const config = this.Data?.Configuration;
        if (config?.tab && this.isValidTab(config.tab as string)) {
            this.ActiveTab = config.tab as MCPDashboardTab;
        }
    }

    /**
     * Subscribes to router NavigationEnd events to handle browser back/forward
     */
    private subscribeToRouterEvents(): void {
        this.router.events
            .pipe(
                filter((event): event is NavigationEnd => event instanceof NavigationEnd),
                takeUntil(this.destroy$)
            )
            .subscribe(event => {
                const currentUrl = event.urlAfterRedirects || event.url;
                if (currentUrl !== this.lastNavigatedUrl) {
                    this.onExternalNavigation(currentUrl);
                }
            });
    }

    /**
     * Handles external navigation (browser back/forward)
     */
    private onExternalNavigation(url: string): void {
        this.lastNavigatedUrl = url;
        const queryIndex = url.indexOf('?');
        if (queryIndex === -1) return;

        const queryString = url.substring(queryIndex + 1);
        const params = new URLSearchParams(queryString);
        const tab = params.get('tab') as MCPDashboardTab | null;

        if (tab && this.isValidTab(tab) && tab !== this.ActiveTab) {
            this.skipUrlUpdate = true;
            this.ActiveTab = tab;
            this.cdr.detectChanges();
            this.skipUrlUpdate = false;
        }
    }

    /**
     * Updates URL query string to reflect current state using NavigationService
     */
    private updateUrl(): void {
        if (this.skipUrlUpdate) return;

        const queryParams: Record<string, string | null> = {
            tab: this.ActiveTab
        };

        this.navigationService.UpdateActiveTabQueryParams(queryParams);
        this.lastNavigatedUrl = this.router.url;
    }

    // Required by BaseResourceComponent
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'MCP Management';
    }

    // Required by BaseDashboard
    protected initDashboard(): void {
        this.setupFilterSubscription();
    }

    // Required by BaseDashboard
    protected loadData(): void {
        this.loadAllData();
    }

    ngAfterViewInit(): void {
        this.cdr.detectChanges();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
        // Cleanup sync subscriptions
        this.syncSubscriptions.forEach(sub => sub.unsubscribe());
        this.syncSubscriptions.clear();
    }

    // ========================================
    // Data Loading
    // ========================================

    /**
     * Loads all dashboard data in parallel
     */
    public async loadAllData(): Promise<void> {
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const rv = new RunView();

            // Load all data in parallel
            const [serversResult, connectionsResult, toolsResult, logsResult] = await Promise.all([
                rv.RunView<MCPServerData>({
                    EntityName: 'MJ: MCP Servers',
                    ResultType: 'simple'
                }),
                rv.RunView<MCPConnectionData>({
                    EntityName: 'MJ: MCP Server Connections',
                    ResultType: 'simple'
                }),
                rv.RunView<MCPToolData>({
                    EntityName: 'MJ: MCP Server Tools',
                    ResultType: 'simple'
                }),
                rv.RunView<MCPExecutionLogData>({
                    EntityName: 'MJ: MCP Tool Execution Logs',
                    ExtraFilter: `StartedAt >= DATEADD(day, -7, GETUTCDATE())`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 100,
                    ResultType: 'simple'
                })
            ]);

            if (serversResult.Success) {
                this.servers = serversResult.Results || [];
            }
            if (connectionsResult.Success) {
                this.connections = connectionsResult.Results || [];
            }
            if (toolsResult.Success) {
                this.tools = toolsResult.Results || [];
            }
            if (logsResult.Success) {
                this.executionLogs = logsResult.Results || [];
            }

            // Enrich data with counts and names
            this.enrichServerData();
            this.enrichConnectionData();
            this.enrichToolData();
            this.enrichLogData();

            // Calculate stats
            this.calculateStats();

            // Apply filters
            this.applyFilters();

        } catch (error) {
            this.ErrorMessage = `Failed to load data: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private enrichServerData(): void {
        for (const server of this.servers) {
            server.ConnectionCount = this.connections.filter(c => c.MCPServerID === server.ID).length;
            server.ToolCount = this.tools.filter(t => t.MCPServerID === server.ID).length;
        }
    }

    private enrichConnectionData(): void {
        for (const conn of this.connections) {
            const server = this.servers.find(s => s.ID === conn.MCPServerID);
            conn.ServerName = server?.Name ?? 'Unknown';
        }
    }

    private enrichToolData(): void {
        for (const tool of this.tools) {
            const server = this.servers.find(s => s.ID === tool.MCPServerID);
            tool.ServerName = server?.Name ?? 'Unknown';
        }
    }

    private enrichLogData(): void {
        for (const log of this.executionLogs) {
            const conn = this.connections.find(c => c.ID === log.ConnectionID);
            log.ConnectionName = conn?.Name ?? 'Unknown';
        }
    }

    private calculateStats(): void {
        this.stats = {
            totalServers: this.servers.length,
            activeServers: this.servers.filter(s => s.Status === 'Active').length,
            totalConnections: this.connections.length,
            activeConnections: this.connections.filter(c => c.Status === 'Active').length,
            totalTools: this.tools.length,
            activeTools: this.tools.filter(t => t.Status === 'Active').length,
            recentExecutions: this.executionLogs.length,
            failedExecutions: this.executionLogs.filter(l => l.Status === 'Error').length
        };
    }

    // ========================================
    // Filtering
    // ========================================

    private setupFilterSubscription(): void {
        this.filters$
            .pipe(
                debounceTime(300),
                distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
                takeUntil(this.destroy$)
            )
            .subscribe(() => {
                this.applyFilters();
                this.cdr.detectChanges();
            });
    }

    public applyFilters(): void {
        const filters = this.filters$.value;
        const search = filters.searchTerm.toLowerCase();

        // Filter servers
        this.filteredServers = this.servers.filter(s => {
            const matchesSearch = !search ||
                s.Name.toLowerCase().includes(search) ||
                (s.Description?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.serverStatus === 'all' || s.Status === filters.serverStatus;
            return matchesSearch && matchesStatus;
        });

        // Filter connections
        this.filteredConnections = this.connections.filter(c => {
            const matchesSearch = !search ||
                c.Name.toLowerCase().includes(search) ||
                (c.ServerName?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.connectionStatus === 'all' || c.Status === filters.connectionStatus;
            return matchesSearch && matchesStatus;
        });

        // Filter tools
        this.filteredTools = this.tools.filter(t => {
            const matchesSearch = !search ||
                t.ToolName.toLowerCase().includes(search) ||
                (t.ToolTitle?.toLowerCase().includes(search) ?? false) ||
                (t.ToolDescription?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.toolStatus === 'all' || t.Status === filters.toolStatus;
            return matchesSearch && matchesStatus;
        });

        // Build server groups for the tools tab
        this.buildServerGroups();

        // Filter logs
        this.filteredLogs = this.executionLogs.filter(l => {
            const matchesSearch = !search ||
                l.ToolName.toLowerCase().includes(search) ||
                (l.ConnectionName?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.logStatus === 'all' || l.Status === filters.logStatus;
            return matchesSearch && matchesStatus;
        });
    }

    public onSearchChange(term: string): void {
        const current = this.filters$.value;
        this.filters$.next({ ...current, searchTerm: term });
    }

    public onStatusFilterChange(filterType: string, value: string): void {
        const current = this.filters$.value;
        switch (filterType) {
            case 'server':
                this.filters$.next({ ...current, serverStatus: value });
                break;
            case 'connection':
                this.filters$.next({ ...current, connectionStatus: value });
                break;
            case 'tool':
                this.filters$.next({ ...current, toolStatus: value });
                break;
            case 'log':
                this.filters$.next({ ...current, logStatus: value });
                break;
        }
    }

    // ========================================
    // Tab Navigation
    // ========================================

    /**
     * Sets the active tab and updates URL for deep linking
     */
    public setActiveTab(tab: MCPDashboardTab): void {
        if (this.ActiveTab === tab) return;

        this.ActiveTab = tab;
        this.updateUrl();
        this.cdr.detectChanges();
    }

    // ========================================
    // Server Operations
    // ========================================

    public createServer(): void {
        this.EditingServer = null;
        this.ShowServerDialog = true;
        this.cdr.detectChanges();
    }

    public editServer(server: MCPServerData): void {
        this.EditingServer = server;
        this.ShowServerDialog = true;
        this.cdr.detectChanges();
    }

    public async deleteServer(server: MCPServerData): Promise<void> {
        if (!confirm(`Are you sure you want to delete server "${server.Name}"?`)) {
            return;
        }

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MCPServerEntity>('MJ: MCP Servers');
            const loaded = await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: server.ID }]));
            if (loaded) {
                await entity.Delete();
                await this.loadAllData();
            }
        } catch (error) {
            this.ErrorMessage = `Failed to delete server: ${error instanceof Error ? error.message : String(error)}`;
            this.cdr.detectChanges();
        }
    }

    public async onServerDialogClose(result: { saved: boolean }): Promise<void> {
        this.ShowServerDialog = false;
        this.EditingServer = null;
        if (result.saved) {
            await this.loadAllData();
        }
        this.cdr.detectChanges();
    }

    // ========================================
    // Connection Operations
    // ========================================

    public createConnection(): void {
        this.EditingConnection = null;
        this.ShowConnectionDialog = true;
        this.cdr.detectChanges();
    }

    public editConnection(connection: MCPConnectionData): void {
        this.EditingConnection = connection;
        this.ShowConnectionDialog = true;
        this.cdr.detectChanges();
    }

    public async deleteConnection(connection: MCPConnectionData): Promise<void> {
        if (!confirm(`Are you sure you want to delete connection "${connection.Name}"?`)) {
            return;
        }

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MCPServerConnectionEntity>('MJ: MCP Server Connections');
            const loaded = await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: connection.ID }]));
            if (loaded) {
                await entity.Delete();
                await this.loadAllData();
            }
        } catch (error) {
            this.ErrorMessage = `Failed to delete connection: ${error instanceof Error ? error.message : String(error)}`;
            this.cdr.detectChanges();
        }
    }

    public async onConnectionDialogClose(result: { saved: boolean }): Promise<void> {
        this.ShowConnectionDialog = false;
        this.EditingConnection = null;
        if (result.saved) {
            await this.loadAllData();
        }
        this.cdr.detectChanges();
    }

    // ========================================
    // Tool Operations
    // ========================================

    /**
     * Toggle tool card expansion for details view
     */
    public toggleToolExpand(tool: MCPToolData): void {
        if (this.ExpandedToolId === tool.ID) {
            this.ExpandedToolId = null;
        } else {
            this.ExpandedToolId = tool.ID;
        }
        this.cdr.detectChanges();
    }

    /**
     * Check if a tool card is expanded
     */
    public isToolExpanded(tool: MCPToolData): boolean {
        return this.ExpandedToolId === tool.ID;
    }

    /**
     * Set tools view mode (card or list)
     */
    public setToolsViewMode(mode: ToolsViewMode): void {
        this.ToolsViewMode = mode;
        this.cdr.detectChanges();
    }

    /**
     * Set tools sort option
     */
    public setToolsSort(sortBy: ToolsSortBy): void {
        if (this.ToolsSortBy === sortBy) {
            // Toggle ascending/descending
            this.ToolsSortAscending = !this.ToolsSortAscending;
        } else {
            this.ToolsSortBy = sortBy;
            this.ToolsSortAscending = true;
        }
        this.buildServerGroups();
        this.cdr.detectChanges();
    }

    /**
     * Toggle server group expansion
     */
    public toggleServerGroup(group: MCPServerGroup): void {
        group.expanded = !group.expanded;
        this.cdr.detectChanges();
    }

    /**
     * Build server groups from tools data
     */
    private buildServerGroups(): void {
        // Group tools by server
        const serverMap = new Map<string, MCPToolData[]>();

        for (const tool of this.filteredTools) {
            const serverId = tool.MCPServerID;
            if (!serverMap.has(serverId)) {
                serverMap.set(serverId, []);
            }
            serverMap.get(serverId)!.push(tool);
        }

        // Build server groups
        this.ServerGroups = [];
        for (const server of this.servers) {
            const tools = serverMap.get(server.ID) || [];
            if (tools.length > 0) {
                // Sort tools within group
                this.sortTools(tools);

                this.ServerGroups.push({
                    server,
                    tools,
                    expanded: true // Start expanded
                });
            }
        }

        // Sort server groups by tool count or name
        this.ServerGroups.sort((a, b) => {
            if (this.ToolsSortBy === 'server') {
                const nameCompare = a.server.Name.localeCompare(b.server.Name);
                return this.ToolsSortAscending ? nameCompare : -nameCompare;
            }
            // Sort by tool count (descending by default)
            const countCompare = b.tools.length - a.tools.length;
            return this.ToolsSortAscending ? -countCompare : countCompare;
        });
    }

    /**
     * Sort tools array in place
     */
    private sortTools(tools: MCPToolData[]): void {
        tools.sort((a, b) => {
            let compare = 0;
            switch (this.ToolsSortBy) {
                case 'name':
                    compare = (a.ToolTitle || a.ToolName).localeCompare(b.ToolTitle || b.ToolName);
                    break;
                case 'discovered':
                    compare = new Date(a.DiscoveredAt).getTime() - new Date(b.DiscoveredAt).getTime();
                    break;
                case 'lastSeen':
                    compare = new Date(a.LastSeenAt).getTime() - new Date(b.LastSeenAt).getTime();
                    break;
                default:
                    compare = (a.ToolTitle || a.ToolName).localeCompare(b.ToolTitle || b.ToolName);
            }
            return this.ToolsSortAscending ? compare : -compare;
        });
    }

    /**
     * Get total tool count across all groups
     */
    public get TotalToolCount(): number {
        return this.ServerGroups.reduce((sum, group) => sum + group.tools.length, 0);
    }

    /**
     * Open Test Tool dialog
     */
    public openTestToolDialog(tool?: MCPToolData, connection?: MCPConnectionData): void {
        if (tool) {
            this.TestToolServerID = tool.MCPServerID;
            this.TestToolID = tool.ID;
        } else {
            this.TestToolServerID = null;
            this.TestToolID = null;
        }

        if (connection) {
            this.TestToolConnectionID = connection.ID;
            if (!this.TestToolServerID) {
                this.TestToolServerID = connection.MCPServerID;
            }
        } else {
            this.TestToolConnectionID = null;
        }

        this.ShowTestToolDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Close Test Tool dialog
     */
    public onTestToolDialogClose(): void {
        this.ShowTestToolDialog = false;
        this.TestToolServerID = null;
        this.TestToolConnectionID = null;
        this.TestToolID = null;
        this.cdr.detectChanges();
    }

    /**
     * Parse and return input schema as formatted JSON
     */
    public getFormattedInputSchema(tool: MCPToolData): string {
        if (!tool.InputSchema) return 'No input schema';
        try {
            const schema = JSON.parse(tool.InputSchema);
            return JSON.stringify(schema, null, 2);
        } catch {
            return tool.InputSchema;
        }
    }

    /**
     * Get parameter count from input schema
     */
    public getParamCount(tool: MCPToolData): number {
        if (!tool.InputSchema) return 0;
        try {
            const schema = JSON.parse(tool.InputSchema);
            return Object.keys(schema.properties || {}).length;
        } catch {
            return 0;
        }
    }

    /**
     * Get required parameter count from input schema
     */
    public getRequiredParamCount(tool: MCPToolData): number {
        if (!tool.InputSchema) return 0;
        try {
            const schema = JSON.parse(tool.InputSchema);
            return (schema.required || []).length;
        } catch {
            return 0;
        }
    }

    // ========================================
    // Sync Operations
    // ========================================

    /**
     * Syncs tools for a specific connection
     */
    public async syncConnectionTools(connection: MCPConnectionData): Promise<void> {
        const connectionId = connection.ID;

        // Subscribe to sync state updates for this connection
        if (!this.syncSubscriptions.has(connectionId)) {
            const sub = this.mcpToolsService.getSyncState(connectionId)
                .pipe(takeUntil(this.destroy$))
                .subscribe(state => {
                    this.SyncStates.set(connectionId, state);
                    this.cdr.detectChanges();
                });
            this.syncSubscriptions.set(connectionId, sub);
        }

        try {
            const result: MCPSyncResult = await this.mcpToolsService.syncTools(connectionId);

            if (result.Success) {
                // Reload data to show updated tools
                await this.loadAllData();
            } else {
                this.ErrorMessage = `Sync failed: ${result.ErrorMessage}`;
            }
        } catch (error) {
            this.ErrorMessage = `Sync error: ${error instanceof Error ? error.message : String(error)}`;
        }

        this.cdr.detectChanges();
    }

    /**
     * Gets the sync state for a connection
     */
    public getSyncState(connectionId: string): MCPSyncState | undefined {
        return this.SyncStates.get(connectionId);
    }

    /**
     * Checks if a connection is currently syncing
     */
    public isSyncing(connectionId: string): boolean {
        return this.mcpToolsService.isSyncing(connectionId);
    }

    /**
     * Gets sync progress message for a connection
     */
    public getSyncProgressMessage(connectionId: string): string {
        const state = this.SyncStates.get(connectionId);
        if (!state?.progress) return '';
        return state.progress.message;
    }

    // ========================================
    // Utility Methods
    // ========================================

    public getStatusClass(status: string): string {
        switch (status) {
            case 'Active':
                return 'status-active';
            case 'Inactive':
                return 'status-inactive';
            case 'Error':
                return 'status-error';
            case 'Deprecated':
                return 'status-deprecated';
            default:
                return 'status-unknown';
        }
    }

    public getTransportIcon(transportType: string): string {
        switch (transportType) {
            case 'StreamableHTTP':
            case 'SSE':
                return 'fa-solid fa-globe';
            case 'Stdio':
                return 'fa-solid fa-terminal';
            case 'WebSocket':
                return 'fa-solid fa-plug';
            default:
                return 'fa-solid fa-question';
        }
    }

    public formatDate(date: Date | string | null): string {
        if (!date) return 'Never';
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleString();
    }

    public formatDuration(ms: number | null): string {
        if (ms === null) return '-';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadMCPDashboard(): void {
    // Ensures the component is not tree-shaken
}
