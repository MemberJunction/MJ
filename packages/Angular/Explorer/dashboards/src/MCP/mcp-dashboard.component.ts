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
import { Subject, BehaviorSubject, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { BaseDashboard } from '@memberjunction/ng-shared';
import {
    ResourceData,
    MJMCPServerEntity,
    MJMCPServerConnectionEntity,
    MJMCPServerToolEntity,
    MJMCPToolExecutionLogEntity,
    MJMCPToolFavoriteEntity,
    MCPEngine,
    UserInfoEngine,
    MJOAuthAuthorizationStateEntity,
    MJOAuthClientRegistrationEntity,
    MJOAuthTokenEntity,
    MJCredentialEntity
} from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { RegisterClass , UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { MCPToolsService, MCPSyncState, MCPSyncResult } from './services/mcp-tools.service';
import {
    BuildMCPAgentContextFull,
    IsValidMCPTab,
    IsValidToolsViewMode,
    ResolveMCPItem,
    BuildMCPNotFoundError,
    MCP_TABS,
    MCP_TOOLS_VIEW_MODES,
    MCP_LOG_SORT_COLUMNS,
    type MCPAgentContextInput,
    type MCPTabContextInput,
    type MCPNamedItem,
} from './mcp-agent-context';
import { ValidateEnumParam, ValidateStringParam } from '../shared/agent-tool-validation';
import type { AgentToolResult } from '../shared/agent-tool-validation';

/**
 * Local alias for the client-tool shape `NavigationService.SetAgentClientTools`
 * accepts. Declared here (not imported) so we don't add a re-export across the
 * shared validation file (mirrors the Testing dashboard's local alias).
 */
type MCPAgentTool = {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
};

/**
 * User preferences for the MCP Dashboard
 */
interface MCPDashboardUserPreferences {
    toolsViewMode: ToolsViewMode;
    toolsSortBy: ToolsSortBy;
    toolsSortAscending: boolean;
    logsSortColumn: 'status' | 'server' | 'tool' | 'connection' | 'started' | 'duration' | 'error';
    logsSortAscending: boolean;
    searchTerm: string;
    serverStatus: string;
    connectionStatus: string;
    toolStatus: string;
    logStatus: string;
    filterPanelVisible: boolean;
}

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
    // OAuth configuration fields
    OAuthIssuerURL?: string | null;
    OAuthScopes?: string | null;
    OAuthMetadataCacheTTLMinutes?: number | null;
    OAuthClientID?: string | null;
    OAuthClientSecretEncrypted?: string | null;
    OAuthRequirePKCE?: boolean;
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
    CredentialID: string | null;
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
 * MCP tool summary returned by paginated GraphQL query (Part 3.2 scale path).
 * Omits heavy fields like InputSchema so thousands of rows stay light.
 */
export interface MCPToolSummary {
    ID: string;
    MCPServerID: string;
    ToolName: string;
    ToolTitle: string | null;
    ToolDescription: string | null;
    Status: string;
    ServerName: string | null;
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
    InputArgs?: string | null;
    Result?: string | null;
    ServerName?: string;
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
    /** Part 3.3 — tools tab server filter (ID of selected server, or 'all') */
    toolsServer?: string;
    /** Part 3.3 — tools tab category filter (derived from snake_case ToolName prefix, or 'all') */
    toolsCategory?: string;
    /** Part 3.6 — restrict Tools tab to favorited tools only */
    favoritesOnly?: boolean;
    /** Part 3.3 — restrict Tools tab to tools that appear in recent execution logs */
    recentOnly?: boolean;
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

/** Parameter config for the inline test tool form */
interface TestParamConfig {
    name: string;
    type: string;
    description: string;
    required: boolean;
    enumValues: unknown[];
}

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
  standalone: false,
    selector: 'mj-mcp-dashboard',
    templateUrl: './mcp-dashboard.component.html',
    styleUrls: ['./mcp-dashboard.component.css']
})
export class MCPDashboardComponent extends BaseDashboard implements OnInit, AfterViewInit, OnDestroy {

    // ========================================
    // State
    // ========================================

    // Settings persistence
    private readonly USER_SETTINGS_KEY = 'MCP.Dashboard.UserPreferences';
    private settingsPersistSubject = new Subject<void>();
    private settingsLoaded = false;

    private metadata = this.ProviderToUse;

    public Servers: MCPServerData[] = [];

    /** @deprecated Use {@link Servers}. */
    public get servers(): MCPServerData[] {
      return this.Servers;
    }
    /** @deprecated Use {@link Servers}. */
    public set servers(value: MCPServerData[]) {
      this.Servers = value;
    }
    public Connections: MCPConnectionData[] = [];

    /** @deprecated Use {@link Connections}. */
    public get connections(): MCPConnectionData[] {
      return this.Connections;
    }
    /** @deprecated Use {@link Connections}. */
    public set connections(value: MCPConnectionData[]) {
      this.Connections = value;
    }
    public tools: MCPToolData[] = [];
    public ExecutionLogs: MCPExecutionLogData[] = [];

    /** @deprecated Use {@link ExecutionLogs}. */
    public get executionLogs(): MCPExecutionLogData[] {
      return this.ExecutionLogs;
    }
    /** @deprecated Use {@link ExecutionLogs}. */
    public set executionLogs(value: MCPExecutionLogData[]) {
      this.ExecutionLogs = value;
    }

    /**
     * Precomputed tools-by-server index (key = NormalizeUUID(MCPServerID)).
     * Rebuilt once whenever tools/connections load (see buildToolsByServerMap),
     * so the server/connection card @for blocks read tools via an O(1) Map lookup
     * instead of re-filtering the whole tools array on every change-detection pass.
     */
    private toolsByServerID = new Map<string, MCPToolData[]>();

    public FilteredServers: MCPServerData[] = [];

    /** @deprecated Use {@link FilteredServers}. */
    public get filteredServers(): MCPServerData[] {
      return this.FilteredServers;
    }
    /** @deprecated Use {@link FilteredServers}. */
    public set filteredServers(value: MCPServerData[]) {
      this.FilteredServers = value;
    }
    public FilteredConnections: MCPConnectionData[] = [];

    /** @deprecated Use {@link FilteredConnections}. */
    public get filteredConnections(): MCPConnectionData[] {
      return this.FilteredConnections;
    }
    /** @deprecated Use {@link FilteredConnections}. */
    public set filteredConnections(value: MCPConnectionData[]) {
      this.FilteredConnections = value;
    }
    public FilteredTools: MCPToolData[] = [];

    /** @deprecated Use {@link FilteredTools}. */
    public get filteredTools(): MCPToolData[] {
      return this.FilteredTools;
    }
    /** @deprecated Use {@link FilteredTools}. */
    public set filteredTools(value: MCPToolData[]) {
      this.FilteredTools = value;
    }
    public FilteredLogs: MCPExecutionLogData[] = [];

    /** @deprecated Use {@link FilteredLogs}. */
    public get filteredLogs(): MCPExecutionLogData[] {
      return this.FilteredLogs;
    }
    /** @deprecated Use {@link FilteredLogs}. */
    public set filteredLogs(value: MCPExecutionLogData[]) {
      this.FilteredLogs = value;
    }

    /** Part 3.2 — paginated tools (scales to thousands). Appended as user scrolls. */
    public PagedTools: MCPToolSummary[] = [];

    /** @deprecated Use {@link PagedTools}. */
    public get pagedTools(): MCPToolSummary[] {
      return this.PagedTools;
    }
    /** @deprecated Use {@link PagedTools}. */
    public set pagedTools(value: MCPToolSummary[]) {
      this.PagedTools = value;
    }
    public ToolsTotalCount = 0;

    /** @deprecated Use {@link ToolsTotalCount}. */
    public get toolsTotalCount() {
      return this.ToolsTotalCount;
    }
    /** @deprecated Use {@link ToolsTotalCount}. */
    public set toolsTotalCount(value) {
      this.ToolsTotalCount = value;
    }
    public ToolsLoading = false;

    /** @deprecated Use {@link ToolsLoading}. */
    public get toolsLoading() {
      return this.ToolsLoading;
    }
    /** @deprecated Use {@link ToolsLoading}. */
    public set toolsLoading(value) {
      this.ToolsLoading = value;
    }
    public ToolsSkip = 0;

    /** @deprecated Use {@link ToolsSkip}. */
    public get toolsSkip() {
      return this.ToolsSkip;
    }
    /** @deprecated Use {@link ToolsSkip}. */
    public set toolsSkip(value) {
      this.ToolsSkip = value;
    }
    public ToolsPageSize = 50;

    /** @deprecated Use {@link ToolsPageSize}. */
    public get toolsPageSize() {
      return this.ToolsPageSize;
    }
    /** @deprecated Use {@link ToolsPageSize}. */
    public set toolsPageSize(value) {
      this.ToolsPageSize = value;
    }
    public UseScalablePagination = false;

    /** @deprecated Use {@link UseScalablePagination}. */
    public get useScalablePagination() {
      return this.UseScalablePagination;
    }
    /** @deprecated Use {@link UseScalablePagination}. */
    public set useScalablePagination(value) {
      this.UseScalablePagination = value;
    }

    /** Part 3.6 — favorited tool IDs for the current user. */
    public FavoritedToolIDs = new Set<string>();

    /** @deprecated Use {@link FavoritedToolIDs}. */
    public get favoritedToolIDs() {
      return this.FavoritedToolIDs;
    }
    /** @deprecated Use {@link FavoritedToolIDs}. */
    public set favoritedToolIDs(value) {
      this.FavoritedToolIDs = value;
    }

    /** Part 3.5 — Test dialog search string for tool combobox-style filter */
    public TestToolSearch = '';

    /** Part 3.3 — derived data for the filter panel */
    public ToolsAvailableServers: Array<{ ID: string; Name: string }> = [];

    /** @deprecated Use {@link ToolsAvailableServers}. */
    public get toolsAvailableServers(): Array<{ ID: string; Name: string }> {
      return this.ToolsAvailableServers;
    }
    /** @deprecated Use {@link ToolsAvailableServers}. */
    public set toolsAvailableServers(value: Array<{ ID: string; Name: string }>) {
      this.ToolsAvailableServers = value;
    }
    public ToolsAvailableCategories: Array<{ category: string; count: number }> = [];

    /** @deprecated Use {@link ToolsAvailableCategories}. */
    public get toolsAvailableCategories(): Array<{ category: string; count: number }> {
      return this.ToolsAvailableCategories;
    }
    /** @deprecated Use {@link ToolsAvailableCategories}. */
    public set toolsAvailableCategories(value: Array<{ category: string; count: number }>) {
      this.ToolsAvailableCategories = value;
    }

    /** Part 3.4 — tool counts from GetMCPToolCounts (global, respects search) */
    public ToolsGlobalCount: number = 0;

    /** @deprecated Use {@link ToolsGlobalCount}. */
    public get toolsGlobalCount(): number {
      return this.ToolsGlobalCount;
    }
    /** @deprecated Use {@link ToolsGlobalCount}. */
    public set toolsGlobalCount(value: number) {
      this.ToolsGlobalCount = value;
    }
    /** Per-server tool count map used for "(N tools)" badge on group headers */
    public ToolCountByServer: Record<string, number> = {};

    /** @deprecated Use {@link ToolCountByServer}. */
    public get toolCountByServer(): Record<string, number> {
      return this.ToolCountByServer;
    }
    /** @deprecated Use {@link ToolCountByServer}. */
    public set toolCountByServer(value: Record<string, number>) {
      this.ToolCountByServer = value;
    }
    /** Part 3.4 — auto-collapse threshold for server groups */
    public readonly AUTO_COLLAPSE_THRESHOLD = 100;

    public Stats: MCPDashboardStats = {
        totalServers: 0,
        activeServers: 0,
        totalConnections: 0,
        activeConnections: 0,
        totalTools: 0,
        activeTools: 0,
        recentExecutions: 0,
        failedExecutions: 0
    };

    /** @deprecated Use {@link Stats}. */
    public get stats(): MCPDashboardStats {
      return this.Stats;
    }
    /** @deprecated Use {@link Stats}. */
    public set stats(value: MCPDashboardStats) {
      this.Stats = value;
    }

    public ActiveTab: MCPDashboardTab = 'servers';

    /**
     * The tab the agent tool-set was last registered for. Mode-scoping guard:
     * the safe tool surface differs per tab (servers/connections/tools/logs), so
     * `syncAgentToolsForMode()` only re-registers on a tab transition. Mirrors the
     * Data Explorer's `lastRegisteredToolMode`.
     */
    private lastRegisteredToolMode: MCPDashboardTab | null = null;

    public IsLoading = false;
    public ErrorMessage: string | null = null;

    public Filters$ = new BehaviorSubject<MCPDashboardFilters>({
        searchTerm: '',
        serverStatus: 'all',
        connectionStatus: 'all',
        toolStatus: 'all',
        logStatus: 'all'
    });

    /** @deprecated Use {@link Filters$}. */
    public get filters$() {
      return this.Filters$;
    }
    /** @deprecated Use {@link Filters$}. */
    public set filters$(value) {
      this.Filters$ = value;
    }

    // Dialog state
    public ShowServerDialog = false;
    public ShowConnectionDialog = false;
    public ShowTestToolDialog = false;
    public EditingServer: MCPServerData | null = null;
    public EditingConnection: MCPConnectionData | null = null;

    // Inline server form state (avoids sub-component DI issues)
    public ServerForm = {
        Name: '', Description: '', TransportType: 'StreamableHTTP',
        ServerURL: '', Command: '', DefaultAuthType: 'None', Status: 'Active',
        RateLimitPerMinute: null as number | null,
        RateLimitPerHour: null as number | null,
        RequestTimeoutMs: 60000
    };
    public ServerFormSaving = false;
    public ServerFormError: string | null = null;
    public readonly TransportTypes = [
        { value: 'StreamableHTTP', label: 'Streamable HTTP' },
        { value: 'SSE', label: 'Server-Sent Events' },
        { value: 'Stdio', label: 'Standard I/O' },
        { value: 'WebSocket', label: 'WebSocket' }
    ];
    public readonly AuthTypes = [
        { value: 'None', label: 'None' },
        { value: 'Bearer', label: 'Bearer Token' },
        { value: 'APIKey', label: 'API Key' },
        { value: 'OAuth2', label: 'OAuth 2.0' },
        { value: 'Basic', label: 'Basic Auth' }
    ];

    // Inline connection form state
    public ConnectionForm = {
        MCPServerID: '', Name: '', Description: '', BearerToken: '', Status: 'Active'
    };
    public ConnectionFormSaving = false;
    public ConnectionFormError: string | null = null;

    // Inline test tool form state
    public TestStep: 'select' | 'configure' | 'results' = 'select';
    public TestToolServerID: string | null = null;
    public TestToolConnectionID: string | null = null;
    public TestToolID: string | null = null;
    public TestFilteredConnections: MCPConnectionData[] = [];
    public TestFilteredTools: MCPToolData[] = [];
    public TestSelectedTool: MCPToolData | null = null;
    public TestParamConfigs: TestParamConfig[] = [];
    public TestParamValues: Record<string, string> = {};
    public TestIsExecuting = false;
    public TestExecutionResult: { Success: boolean; ErrorMessage?: string; Result?: string; DurationMs?: number } | null = null;

    // Log detail panel state
    public ShowLogDetailPanel = false;
    public SelectedLog: MCPExecutionLogData | null = null;
    // Collapsible state for the log detail sections (Input Args / Result / Error)
    public LogInputArgsExpanded = true;
    public LogResultExpanded = true;
    public LogErrorExpanded = true;

    // Expandable server/connection cards
    public ExpandedServerID: string | null = null;
    public ExpandedConnectionID: string | null = null;

    // Logs sorting state
    public LogsSortColumn: 'status' | 'server' | 'tool' | 'connection' | 'started' | 'duration' | 'error' = 'started';
    public LogsSortAscending = false; // Default to descending (most recent first)

    // Tools tab state
    public ToolsViewMode: ToolsViewMode = 'card';
    public ToolsSortBy: ToolsSortBy = 'server';
    public ToolsSortAscending = true;
    public ServerGroups: MCPServerGroup[] = [];
    public ExpandedToolId: string | null = null;

    // Sync state
    public SyncStates = new Map<string, MCPSyncState>();
    private syncSubscriptions = new Map<string, Subscription>();

    // Filter panel state
    public FilterPanelVisible = true;

    // ========================================
    // Lifecycle
    // ========================================

    protected override destroy$ = new Subject<void>();

    constructor(
        private cdr: ChangeDetectorRef,
        private mcpToolsService: MCPToolsService,
        private confirm: MJConfirmService
    ) {
        super();

        // Set up debounced settings persistence
        this.settingsPersistSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.persistUserPreferences();
        });
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        // Check for OAuth completion redirect
        this.checkOAuthCompletion();

        // Load saved user preferences first
        this.loadUserPreferences();

        // Read initial tab from query params (deep link / direct URL)
        const initialParams = this.GetQueryParams();
        if (initialParams['tab'] && this.isValidTab(initialParams['tab'])) {
            this.ActiveTab = initialParams['tab'] as MCPDashboardTab;
        }

        // Apply configuration params if passed via NavigationService
        this.applyConfigurationParams();
    }

    /**
     * Called by the framework when the URL query params change due to
     * browser back/forward navigation or a deep link.
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
        const tab = params['tab'] as MCPDashboardTab | undefined;
        if (tab && this.isValidTab(tab) && tab !== this.ActiveTab) {
            this.ActiveTab = tab;
            // Keep the mode-scoped agent tools + deep context aligned with the tab
            // when it changes via back/forward or a deep link.
            this.syncAgentToolsForMode();
            this.publishAgentContext();
            this.cdr.detectChanges();
        }
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

    // ========================================
    // User Settings Persistence
    // ========================================

    /**
     * Load saved user preferences from the UserInfoEngine
     */
    private loadUserPreferences(): void {
        try {
            const savedPrefs = UserInfoEngine.Instance.GetSetting(this.USER_SETTINGS_KEY);
            if (savedPrefs) {
                const prefs = JSON.parse(savedPrefs) as MCPDashboardUserPreferences;
                this.applyUserPreferencesFromStorage(prefs);
            }
        } catch (error) {
            console.warn('[MCPDashboard] Failed to load user preferences:', error);
        } finally {
            this.settingsLoaded = true;
        }
    }

    /**
     * Apply loaded preferences to component state
     */
    private applyUserPreferencesFromStorage(prefs: MCPDashboardUserPreferences): void {
        if (prefs.toolsViewMode) {
            this.ToolsViewMode = prefs.toolsViewMode;
        }
        if (prefs.toolsSortBy) {
            this.ToolsSortBy = prefs.toolsSortBy;
        }
        if (prefs.toolsSortAscending !== undefined) {
            this.ToolsSortAscending = prefs.toolsSortAscending;
        }
        if (prefs.logsSortColumn) {
            this.LogsSortColumn = prefs.logsSortColumn;
        }
        if (prefs.logsSortAscending !== undefined) {
            this.LogsSortAscending = prefs.logsSortAscending;
        }
        // Apply filter preferences
        const currentFilters = this.Filters$.value;
        this.Filters$.next({
            ...currentFilters,
            searchTerm: prefs.searchTerm || '',
            serverStatus: prefs.serverStatus || 'all',
            connectionStatus: prefs.connectionStatus || 'all',
            toolStatus: prefs.toolStatus || 'all',
            logStatus: prefs.logStatus || 'all'
        });
        // Apply filter panel visibility
        if (prefs.filterPanelVisible !== undefined) {
            this.FilterPanelVisible = prefs.filterPanelVisible;
        }
    }

    /**
     * Get current preferences as an object for saving
     */
    private getCurrentPreferences(): MCPDashboardUserPreferences {
        const currentFilters = this.Filters$.value;
        return {
            toolsViewMode: this.ToolsViewMode,
            toolsSortBy: this.ToolsSortBy,
            toolsSortAscending: this.ToolsSortAscending,
            logsSortColumn: this.LogsSortColumn,
            logsSortAscending: this.LogsSortAscending,
            searchTerm: currentFilters.searchTerm,
            serverStatus: currentFilters.serverStatus,
            connectionStatus: currentFilters.connectionStatus,
            toolStatus: currentFilters.toolStatus,
            logStatus: currentFilters.logStatus,
            filterPanelVisible: this.FilterPanelVisible
        };
    }

    /**
     * Persist user preferences to storage (debounced)
     */
    private saveUserPreferencesDebounced(): void {
        if (!this.settingsLoaded) return; // Don't save during initial load
        this.settingsPersistSubject.next();
    }

    /**
     * Actually persist user preferences to the UserInfoEngine
     */
    private async persistUserPreferences(): Promise<void> {
        try {
            const prefs = this.getCurrentPreferences();
            await UserInfoEngine.Instance.SetSetting(this.USER_SETTINGS_KEY, JSON.stringify(prefs));
        } catch (error) {
            console.warn('[MCPDashboard] Failed to persist user preferences:', error);
        }
    }

    // Required by BaseResourceComponent
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'MCP Management';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-plug-circle-bolt';
    }

    protected initDashboard(): void {
        this.setupFilterSubscription();
    }

    protected loadData(): void {
        this.LoadAllData();
    }

    ngAfterViewInit(): void {
        this.publishAgentContext();
        this.syncAgentToolsForMode();
        this.cdr.markForCheck();
    }

    // ================================================================
    // AI Agent Context & Client Tools — DEEP enrichment (Data-Explorer depth)
    //
    // 🚨 SAFETY BOUNDARY — READ-ONLY / NAVIGATIONAL ONLY 🚨
    // MCP is a credential-bearing surface. Servers carry OAuth client secrets,
    // connections carry bearer tokens, and OAuth token / client-registration /
    // credential entities are in scope here. The agent context and client tools
    // registered below are strictly READ / FILTER / SORT / SELECT / NAVIGATE +
    // a read-only favorite-toggle preference:
    //   - tab switches, free-text search, per-tab status filters, server/category
    //     filter, favorites/recent toggles, tools view-mode, logs sort
    //   - SELECT a server / connection / tool / log (by id OR name) — highlights /
    //     expands / opens the detail panel
    //   - OPEN the selected record in a tab for VIEWING (OpenEntityRecord — never edits)
    //   - data refresh (read-only reload)
    //
    // 🔒 DELIBERATELY NOT exposed to the agent (must stay human-initiated):
    //   - create / edit / delete of servers and connections
    //   - MCP tool EXECUTION / test-with-params (untrusted LLM-supplied args
    //     against real, side-effecting external tools) — NO execute path
    //   - ANY secret/credential value: server URL/command, bearer token, OAuth
    //     client secret, encrypted credential, or tool input/output payload
    //
    // Context exposes ONLY aggregate + per-tab counts, navigation/filter state,
    // the user's own search terms, and user-facing DISPLAY names (server / tool /
    // connection names; log labels are tool-name + status only) — never secrets,
    // never tool args, never tool results.
    //
    // MODE-SCOPING (mirrors the Data Explorer / Testing dashboards): the safe tool
    // surface differs per active tab, so `SetAgentClientTools` re-registers ONLY on
    // a tab transition (guarded by {@link lastRegisteredToolMode}). COMMON tools
    // (tab switch, search, refresh, clear filters) are always present; per-tab
    // tools (server/connection/tool/log select+open+filter+sort) appear only while
    // their tab is active.
    // ================================================================

    /**
     * Publish the current MCP dashboard state to the AI agent. Re-invoked on every
     * meaningful state change (data load, filter/search change, tab switch,
     * view-mode/sort change, selection change). The shaping lives in the pure
     * {@link buildMCPAgentContextFull} helper so it stays unit-testable and the
     * secret-free guarantee is auditable in one place.
     */
    private publishAgentContext(): void {
        const top: MCPAgentContextInput = {
            ActiveTab: this.ActiveTab,
            ServerCount: this.Stats.totalServers,
            ActiveServerCount: this.Stats.activeServers,
            ConnectionCount: this.Stats.totalConnections,
            ToolCount: this.Stats.totalTools,
            RecentExecutionCount: this.Stats.recentExecutions,
            FailedExecutionCount: this.Stats.failedExecutions,
            CurrentSearchTerm: this.Filters$.value.searchTerm,
            ToolsViewMode: this.ToolsViewMode,
        };
        this.navigationService.SetAgentContext(this, BuildMCPAgentContextFull(top, this.buildActiveTabContext()));
    }

    /** Build the deep per-tab context slice for whichever tab is active. */
    private buildActiveTabContext(): MCPTabContextInput {
        const f = this.Filters$.value;
        switch (this.ActiveTab) {
            case 'connections': {
                const selected = this.Connections.find(c => this.ExpandedConnectionID && UUIDsEqual(c.ID, this.ExpandedConnectionID)) ?? null;
                return {
                    Tab: 'connections',
                    Data: {
                        ConnectionCount: this.Connections.length,
                        FilteredConnectionCount: this.FilteredConnections.length,
                        ConnectionStatusFilter: f.connectionStatus ?? 'all',
                        VisibleConnectionNames: this.FilteredConnections.map(c => c.Name),
                        SelectedConnectionId: selected?.ID ?? null,
                        SelectedConnectionName: selected?.Name ?? null,
                    },
                };
            }
            case 'tools': {
                const selected = this.tools.find(t => this.ExpandedToolId && UUIDsEqual(t.ID, this.ExpandedToolId)) ?? null;
                const serverFilter = f.toolsServer ?? 'all';
                const serverFilterName = serverFilter && serverFilter !== 'all'
                    ? (this.ToolsAvailableServers.find(s => UUIDsEqual(s.ID, serverFilter))?.Name ?? null)
                    : null;
                return {
                    Tab: 'tools',
                    Data: {
                        ToolCount: this.tools.length,
                        FilteredToolCount: this.FilteredTools.length,
                        ToolsViewMode: this.ToolsViewMode,
                        ToolStatusFilter: f.toolStatus ?? 'all',
                        ServerFilter: serverFilter,
                        ServerFilterName: serverFilterName,
                        CategoryFilter: f.toolsCategory ?? 'all',
                        FavoritesOnly: f.favoritesOnly ?? false,
                        RecentOnly: f.recentOnly ?? false,
                        FavoriteToolCount: this.FavoritedToolIDs.size,
                        VisibleToolNames: this.FilteredTools.map(t => t.ToolTitle || t.ToolName),
                        AvailableServerNames: this.ToolsAvailableServers.map(s => s.Name),
                        AvailableCategoryNames: this.ToolsAvailableCategories.map(c => c.category),
                        SelectedToolId: selected?.ID ?? null,
                        SelectedToolName: selected ? (selected.ToolTitle || selected.ToolName) : null,
                    },
                };
            }
            case 'logs': {
                return {
                    Tab: 'logs',
                    Data: {
                        ExecutionCount: this.ExecutionLogs.length,
                        FilteredExecutionCount: this.FilteredLogs.length,
                        FailedExecutionCount: this.ExecutionLogs.filter(l => l.Status === 'Error').length,
                        LogStatusFilter: f.logStatus ?? 'all',
                        SortColumn: this.LogsSortColumn,
                        SortDirection: this.LogsSortAscending ? 'asc' : 'desc',
                        VisibleLogLabels: this.FilteredLogs.map(l => this.logLabel(l)),
                        SelectedLogId: this.SelectedLog?.ID ?? null,
                        SelectedLogName: this.SelectedLog?.ToolName ?? null,
                        DetailPanelOpen: this.ShowLogDetailPanel,
                    },
                };
            }
            case 'servers':
            default: {
                const selected = this.Servers.find(s => this.ExpandedServerID && UUIDsEqual(s.ID, this.ExpandedServerID)) ?? null;
                return {
                    Tab: 'servers',
                    Data: {
                        ServerCount: this.Servers.length,
                        FilteredServerCount: this.FilteredServers.length,
                        ActiveServerCount: this.Stats.activeServers,
                        ServerStatusFilter: f.serverStatus ?? 'all',
                        VisibleServerNames: this.FilteredServers.map(s => s.Name),
                        SelectedServerId: selected?.ID ?? null,
                        SelectedServerName: selected?.Name ?? null,
                    },
                };
            }
        }
    }

    /**
     * Build a non-secret display label for a log row: the tool name plus its
     * status (e.g. "github_search · Error"). NEVER includes InputArgs or Result.
     */
    private logLabel(log: MCPExecutionLogData): string {
        const tool = log.ToolName || '(unknown tool)';
        return log.Status ? `${tool} · ${log.Status}` : tool;
    }

    // ----------------------------------------------------------------
    // Mode-scoped client-tool registration
    // ----------------------------------------------------------------

    /**
     * Register the safe client-tool set for the ACTIVE tab. `SetAgentClientTools`
     * replaces the registered set wholesale, so we only re-register on a tab
     * transition (guarded by {@link lastRegisteredToolMode}). Common tools are
     * always present; per-tab tools swap so e.g. a logs-only SelectLog is never
     * visible while Servers is open.
     *
     * 🔒 SAFETY: every tool below is read / filter / sort / select / navigate /
     * favorite-toggle / refresh. No tool creates, edits, deletes, executes an MCP
     * tool, or returns a secret. See the SAFETY BOUNDARY comment above.
     */
    private syncAgentToolsForMode(): void {
        const tab = this.ActiveTab;
        if (this.lastRegisteredToolMode === tab) {
            return;
        }
        this.lastRegisteredToolMode = tab;
        this.navigationService.SetAgentClientTools(this, this.buildToolsForMode(tab));
    }

    /** Compose the safe tool list for a given tab: common tools + per-tab tools. */
    private buildToolsForMode(tab: MCPDashboardTab): MCPAgentTool[] {
        const tools: MCPAgentTool[] = [...this.buildCommonMCPTools()];
        switch (tab) {
            case 'servers':
                tools.push(...this.buildServersTools());
                break;
            case 'connections':
                tools.push(...this.buildConnectionsTools());
                break;
            case 'tools':
                tools.push(...this.buildToolsTabTools());
                break;
            case 'logs':
                tools.push(...this.buildLogsTools());
                break;
        }
        return tools;
    }

    /** Tools available on EVERY tab: tab switch, search, refresh, clear filters. */
    private buildCommonMCPTools(): MCPAgentTool[] {
        return [
            {
                Name: 'SwitchMCPTab',
                Description: 'Switch the active MCP dashboard tab. Valid tabs: servers, connections, tools, logs.',
                ParameterSchema: { type: 'object', properties: { tab: { type: 'string', enum: ['servers', 'connections', 'tools', 'logs'] } }, required: ['tab'] },
                Handler: async (params: Record<string, unknown>) => this.toolSwitchTab(params),
            },
            {
                Name: 'SearchMCPTools',
                Description: 'Set the free-text search term applied to the current MCP tab (filters servers/connections/tools/logs by name/description).',
                ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                Handler: async (params: Record<string, unknown>) => this.toolSearch(params),
            },
            {
                Name: 'RefreshMCPData',
                Description: 'Reload all MCP dashboard data. Read-only — does not create, modify, or execute anything.',
                ParameterSchema: { type: 'object', properties: { forceRefresh: { type: 'boolean' } } },
                Handler: async (params: Record<string, unknown>) => this.toolRefresh(params),
            },
            {
                Name: 'ClearMCPFilters',
                Description: 'Reset all MCP dashboard filters (search, status, server, category, favorites, recent) to their defaults.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.ResetAllFilters();
                    this.publishAgentContext();
                    return { Success: true };
                },
            },
        ];
    }

    /** Servers-tab tools: filter by status, select/open a server. */
    private buildServersTools(): MCPAgentTool[] {
        return [
            {
                Name: 'FilterServersByStatus',
                Description: 'Restrict the Servers tab to a status, or "all" to clear.',
                ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByStatus('server', params),
            },
            {
                Name: 'SelectServer',
                Description: 'Select (expand) an MCP server by its ID or name, revealing its details panel. Read-only navigation — does not edit or execute.',
                ParameterSchema: { type: 'object', properties: { server: { type: 'string' } }, required: ['server'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectServer(params),
            },
            {
                Name: 'OpenServerRecord',
                Description: 'Open the selected MCP server\'s record in a new tab for VIEWING (read-only). Pass a server ID or name, or omit to open the currently selected server.',
                ParameterSchema: { type: 'object', properties: { server: { type: 'string' } } },
                Handler: async (params: Record<string, unknown>) => this.toolOpenServerRecord(params),
            },
        ];
    }

    /** Connections-tab tools: filter by status, select/open a connection, navigate to its server. */
    private buildConnectionsTools(): MCPAgentTool[] {
        return [
            {
                Name: 'FilterConnectionsByStatus',
                Description: 'Restrict the Connections tab to a status, or "all" to clear.',
                ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByStatus('connection', params),
            },
            {
                Name: 'SelectConnection',
                Description: 'Select (expand) an MCP connection by its ID or name, revealing its details panel. Read-only navigation.',
                ParameterSchema: { type: 'object', properties: { connection: { type: 'string' } }, required: ['connection'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectConnection(params),
            },
            {
                Name: 'OpenConnectionRecord',
                Description: 'Open an MCP connection\'s record in a new tab for VIEWING (read-only). Pass a connection ID or name, or omit to open the currently selected connection.',
                ParameterSchema: { type: 'object', properties: { connection: { type: 'string' } } },
                Handler: async (params: Record<string, unknown>) => this.toolOpenConnectionRecord(params),
            },
            {
                Name: 'NavigateToConnectionServer',
                Description: 'Open the parent MCP server record for a connection (by connection ID or name, or the selected one) in a new tab for VIEWING. Related-record navigation, read-only.',
                ParameterSchema: { type: 'object', properties: { connection: { type: 'string' } } },
                Handler: async (params: Record<string, unknown>) => this.toolNavigateToConnectionServer(params),
            },
        ];
    }

    /** Tools-tab tools: filter (status/server/category/favorites/recent), view-mode, favorite toggle, select/open. */
    private buildToolsTabTools(): MCPAgentTool[] {
        return [
            {
                Name: 'FilterToolsByStatus',
                Description: 'Restrict the Tools tab to a tool status, or "all" to clear.',
                ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByStatus('tool', params),
            },
            {
                Name: 'FilterMCPToolsByServer',
                Description: 'Restrict the Tools tab to a single MCP server by its ID or name, or "all" to clear the server filter.',
                ParameterSchema: { type: 'object', properties: { server: { type: 'string' } }, required: ['server'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByServer(params),
            },
            {
                Name: 'FilterToolsByCategory',
                Description: 'Restrict the Tools tab to a category (the snake_case prefix of tool names), or "all" to clear.',
                ParameterSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByCategory(params),
            },
            {
                Name: 'ToggleToolsFavoritesOnly',
                Description: 'Toggle (or set) restricting the Tools tab to favorited tools only.',
                ParameterSchema: { type: 'object', properties: { enabled: { type: 'boolean' } } },
                Handler: async (params: Record<string, unknown>) => this.toolToggleFavoritesOnly(params),
            },
            {
                Name: 'SetToolsViewMode',
                Description: 'Set the Tools tab view mode. Valid modes: card, list.',
                ParameterSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['card', 'list'] } }, required: ['mode'] },
                Handler: async (params: Record<string, unknown>) => this.toolSetToolsViewMode(params),
            },
            {
                Name: 'ToggleMCPToolFavorite',
                Description: 'Toggle the favorite flag for an MCP tool (by ID or name) for the current user. Read/navigational preference only — does NOT execute or modify the tool.',
                ParameterSchema: { type: 'object', properties: { tool: { type: 'string' } }, required: ['tool'] },
                Handler: async (params: Record<string, unknown>) => this.toolToggleFavorite(params),
            },
            {
                Name: 'SelectTool',
                Description: 'Select (expand) an MCP tool by its ID or name, revealing its details. Read-only navigation — does NOT execute the tool.',
                ParameterSchema: { type: 'object', properties: { tool: { type: 'string' } }, required: ['tool'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectTool(params),
            },
            {
                Name: 'OpenToolRecord',
                Description: 'Open an MCP tool\'s record in a new tab for VIEWING (read-only). Pass a tool ID or name, or omit to open the currently selected tool. Does NOT execute the tool.',
                ParameterSchema: { type: 'object', properties: { tool: { type: 'string' } } },
                Handler: async (params: Record<string, unknown>) => this.toolOpenToolRecord(params),
            },
        ];
    }

    /** Logs-tab tools: filter by status, sort, select/open a log. */
    private buildLogsTools(): MCPAgentTool[] {
        return [
            {
                Name: 'FilterLogsByStatus',
                Description: 'Restrict the Logs tab to an execution status, or "all" to clear.',
                ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByStatus('log', params),
            },
            {
                Name: 'SortLogs',
                Description: 'Sort the execution-logs table by a column. Columns: status, server, tool, connection, started, duration, error. Clicking the same column again toggles direction.',
                ParameterSchema: { type: 'object', properties: { column: { type: 'string', enum: ['status', 'server', 'tool', 'connection', 'started', 'duration', 'error'] } }, required: ['column'] },
                Handler: async (params: Record<string, unknown>) => this.toolSortLogs(params),
            },
            {
                Name: 'SelectLog',
                Description: 'Select an execution log by its ID (or a tool-name match) to open its detail panel for VIEWING. Read-only navigation. Note: the panel never exposes credentials.',
                ParameterSchema: { type: 'object', properties: { log: { type: 'string' } }, required: ['log'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectLog(params),
            },
            {
                Name: 'OpenLogRecord',
                Description: 'Open an execution-log record in a new tab for VIEWING (read-only). Pass a log ID, or omit to open the currently selected log.',
                ParameterSchema: { type: 'object', properties: { log: { type: 'string' } } },
                Handler: async (params: Record<string, unknown>) => this.toolOpenLogRecord(params),
            },
        ];
    }

    // ----------------------------------------------------------------
    // Tolerant tool handlers (validate input, never throw)
    // ----------------------------------------------------------------

    /** Switch the active tab after validating it. */
    private toolSwitchTab(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateEnumParam(params?.['tab'], MCP_TABS, 'tab');
        if (!v.ok) return v.result;
        this.SetActiveTab(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Set the dashboard search term. */
    private toolSearch(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['query'], 'query');
        if (!v.ok) return v.result;
        this.OnSearchChange(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Set a per-tab status filter ('all' or a status string). Tolerant of any string. */
    private toolFilterByStatus(kind: 'server' | 'connection' | 'tool' | 'log', params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['status'], 'status');
        if (!v.ok) return v.result;
        this.OnStatusFilterChange(kind, v.value || 'all');
        this.publishAgentContext();
        return { Success: true };
    }

    /** Restrict the Tools tab to a single server (by ID or name; 'all' to clear). */
    private toolFilterByServer(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['server'], 'server');
        if (!v.ok) return v.result;
        const raw = v.value;
        // Ensure the Tools tab is active so the filter is meaningful.
        this.SetActiveTab('tools');
        if (!raw || raw === 'all') {
            this.OnFilterFieldChange('toolsServer', 'all');
            this.publishAgentContext();
            return { Success: true };
        }
        const candidates: MCPNamedItem[] = this.ToolsAvailableServers.map(s => ({ ID: s.ID, Name: s.Name }));
        const match = ResolveMCPItem(raw, candidates);
        if (!match) {
            return { Success: false, ErrorMessage: BuildMCPNotFoundError(raw, candidates, 'server') };
        }
        this.OnFilterFieldChange('toolsServer', match.ID);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Restrict the Tools tab to a category prefix ('all' to clear). Tolerant. */
    private toolFilterByCategory(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['category'], 'category');
        if (!v.ok) return v.result;
        const cat = v.value || 'all';
        this.SetActiveTab('tools');
        if (cat !== 'all' && !this.ToolsAvailableCategories.some(c => c.category === cat)) {
            const sample = this.ToolsAvailableCategories.slice(0, 6).map(c => c.category).join(', ');
            return { Success: false, ErrorMessage: `Category "${cat}" is not available. Available categories include: ${sample || '(none)'}.` };
        }
        this.OnFilterFieldChange('toolsCategory', cat);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Toggle (or explicitly set) the favorites-only filter on the Tools tab. */
    private toolToggleFavoritesOnly(params: Record<string, unknown>): AgentToolResult {
        this.SetActiveTab('tools');
        const raw = params?.['enabled'];
        const enabled = typeof raw === 'boolean' ? raw : !(this.Filters$.value.favoritesOnly ?? false);
        this.OnFilterFieldChange('favoritesOnly', enabled);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Toggle a tool's favorite flag for the current user (by ID or name). */
    private async toolToggleFavorite(params: Record<string, unknown>): Promise<AgentToolResult> {
        const v = ValidateStringParam(params?.['tool'], 'tool');
        if (!v.ok) return v.result;
        const match = ResolveMCPItem(v.value, this.toolCandidates());
        if (!match) {
            return { Success: false, ErrorMessage: BuildMCPNotFoundError(v.value, this.toolCandidates(), 'tool') };
        }
        try {
            await this.ToggleFavorite(match.ID);
            this.publishAgentContext();
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : 'Toggle favorite failed.' };
        }
    }

    /** Reload all dashboard data (read-only). */
    private async toolRefresh(params: Record<string, unknown>): Promise<AgentToolResult> {
        const forceRefresh = params?.['forceRefresh'] === true;
        try {
            await this.LoadAllData(forceRefresh);
            this.publishAgentContext();
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : 'Refresh failed.' };
        }
    }

    /** Switch the Tools tab view mode after validating it. */
    private toolSetToolsViewMode(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateEnumParam(params?.['mode'], MCP_TOOLS_VIEW_MODES, 'mode');
        if (!v.ok) return v.result;
        this.SetToolsViewMode(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Sort the logs table by a validated column. */
    private toolSortLogs(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateEnumParam(params?.['column'], MCP_LOG_SORT_COLUMNS, 'column');
        if (!v.ok) return v.result;
        this.SetActiveTab('logs');
        this.OnLogSortColumn(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    // --- selection / open helpers ---

    /** Name-and-ID candidates for the tool resolver (tool display name = title || name). */
    private toolCandidates(): MCPNamedItem[] {
        return this.tools.map(t => ({ ID: t.ID, Name: t.ToolTitle || t.ToolName }));
    }

    /** Resolve a server reference (ID or name); returns the row or a tolerant error. */
    private resolveServerRef(raw: string): { ok: true; server: MCPServerData } | { ok: false; result: AgentToolResult } {
        const candidates: MCPNamedItem[] = this.Servers.map(s => ({ ID: s.ID, Name: s.Name }));
        const match = ResolveMCPItem(raw, candidates);
        if (!match) {
            return { ok: false, result: { Success: false, ErrorMessage: BuildMCPNotFoundError(raw, candidates, 'server') } };
        }
        const server = this.Servers.find(s => UUIDsEqual(s.ID, match.ID))!;
        return { ok: true, server };
    }

    /** Resolve a connection reference (ID or name); returns the row or a tolerant error. */
    private resolveConnectionRef(raw: string): { ok: true; connection: MCPConnectionData } | { ok: false; result: AgentToolResult } {
        const candidates: MCPNamedItem[] = this.Connections.map(c => ({ ID: c.ID, Name: c.Name }));
        const match = ResolveMCPItem(raw, candidates);
        if (!match) {
            return { ok: false, result: { Success: false, ErrorMessage: BuildMCPNotFoundError(raw, candidates, 'connection') } };
        }
        const connection = this.Connections.find(c => UUIDsEqual(c.ID, match.ID))!;
        return { ok: true, connection };
    }

    /** Select (expand) a server by ID or name. */
    private toolSelectServer(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['server'], 'server');
        if (!v.ok) return v.result;
        const r = this.resolveServerRef(v.value);
        if (!r.ok) return r.result;
        this.SetActiveTab('servers');
        if (!this.IsServerExpanded(r.server)) {
            this.ToggleServerExpand(r.server);
        }
        this.publishAgentContext();
        return { Success: true };
    }

    /** Open a server record in a tab (view-only). Defaults to the selected server. */
    private toolOpenServerRecord(params: Record<string, unknown>): AgentToolResult {
        const raw = typeof params?.['server'] === 'string' ? (params['server'] as string) : '';
        let server: MCPServerData | null = null;
        if (raw) {
            const r = this.resolveServerRef(raw);
            if (!r.ok) return r.result;
            server = r.server;
        } else {
            server = this.Servers.find(s => this.ExpandedServerID && UUIDsEqual(s.ID, this.ExpandedServerID)) ?? null;
            if (!server) return { Success: false, ErrorMessage: 'No server is selected. Pass a server ID or name, or select one first.' };
        }
        this.navigationService.OpenEntityRecord('MJ: MCP Servers', CompositeKey.FromID(server.ID));
        return { Success: true };
    }

    /** Select (expand) a connection by ID or name. */
    private toolSelectConnection(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['connection'], 'connection');
        if (!v.ok) return v.result;
        const r = this.resolveConnectionRef(v.value);
        if (!r.ok) return r.result;
        this.SetActiveTab('connections');
        if (!this.IsConnectionExpanded(r.connection)) {
            this.ToggleConnectionExpand(r.connection);
        }
        this.publishAgentContext();
        return { Success: true };
    }

    /** Open a connection record in a tab (view-only). Defaults to the selected connection. */
    private toolOpenConnectionRecord(params: Record<string, unknown>): AgentToolResult {
        const raw = typeof params?.['connection'] === 'string' ? (params['connection'] as string) : '';
        let connection: MCPConnectionData | null = null;
        if (raw) {
            const r = this.resolveConnectionRef(raw);
            if (!r.ok) return r.result;
            connection = r.connection;
        } else {
            connection = this.Connections.find(c => this.ExpandedConnectionID && UUIDsEqual(c.ID, this.ExpandedConnectionID)) ?? null;
            if (!connection) return { Success: false, ErrorMessage: 'No connection is selected. Pass a connection ID or name, or select one first.' };
        }
        this.navigationService.OpenEntityRecord('MJ: MCP Server Connections', CompositeKey.FromID(connection.ID));
        return { Success: true };
    }

    /** Navigate to the parent server of a connection (related-record, view-only). */
    private toolNavigateToConnectionServer(params: Record<string, unknown>): AgentToolResult {
        const raw = typeof params?.['connection'] === 'string' ? (params['connection'] as string) : '';
        let connection: MCPConnectionData | null = null;
        if (raw) {
            const r = this.resolveConnectionRef(raw);
            if (!r.ok) return r.result;
            connection = r.connection;
        } else {
            connection = this.Connections.find(c => this.ExpandedConnectionID && UUIDsEqual(c.ID, this.ExpandedConnectionID)) ?? null;
            if (!connection) return { Success: false, ErrorMessage: 'No connection is selected. Pass a connection ID or name, or select one first.' };
        }
        const server = this.Servers.find(s => UUIDsEqual(s.ID, connection!.MCPServerID));
        if (!server) return { Success: false, ErrorMessage: `The parent server for connection "${connection.Name}" is not loaded.` };
        this.navigationService.OpenEntityRecord('MJ: MCP Servers', CompositeKey.FromID(server.ID));
        return { Success: true };
    }

    /** Select (expand) a tool by ID or name. Does NOT execute the tool. */
    private toolSelectTool(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['tool'], 'tool');
        if (!v.ok) return v.result;
        const match = ResolveMCPItem(v.value, this.toolCandidates());
        if (!match) return { Success: false, ErrorMessage: BuildMCPNotFoundError(v.value, this.toolCandidates(), 'tool') };
        const tool = this.tools.find(t => UUIDsEqual(t.ID, match.ID))!;
        this.SetActiveTab('tools');
        if (!this.IsToolExpanded(tool)) {
            this.ToggleToolExpand(tool);
        }
        this.publishAgentContext();
        return { Success: true };
    }

    /** Open a tool record in a tab (view-only). Defaults to the selected tool. Does NOT execute. */
    private toolOpenToolRecord(params: Record<string, unknown>): AgentToolResult {
        const raw = typeof params?.['tool'] === 'string' ? (params['tool'] as string) : '';
        let tool: MCPToolData | null = null;
        if (raw) {
            const match = ResolveMCPItem(raw, this.toolCandidates());
            if (!match) return { Success: false, ErrorMessage: BuildMCPNotFoundError(raw, this.toolCandidates(), 'tool') };
            tool = this.tools.find(t => UUIDsEqual(t.ID, match.ID)) ?? null;
        } else {
            tool = this.tools.find(t => this.ExpandedToolId && UUIDsEqual(t.ID, this.ExpandedToolId)) ?? null;
            if (!tool) return { Success: false, ErrorMessage: 'No tool is selected. Pass a tool ID or name, or select one first.' };
        }
        this.navigationService.OpenEntityRecord('MJ: MCP Server Tools', CompositeKey.FromID(tool!.ID));
        return { Success: true };
    }

    /** Select a log (open its detail panel) by ID or tool-name match. */
    private async toolSelectLog(params: Record<string, unknown>): Promise<AgentToolResult> {
        const v = ValidateStringParam(params?.['log'], 'log');
        if (!v.ok) return v.result;
        const candidates: MCPNamedItem[] = this.FilteredLogs.map(l => ({ ID: l.ID, Name: l.ToolName }));
        const match = ResolveMCPItem(v.value, candidates);
        if (!match) return { Success: false, ErrorMessage: BuildMCPNotFoundError(v.value, candidates, 'log') };
        const log = this.ExecutionLogs.find(l => UUIDsEqual(l.ID, match.ID));
        if (!log) return { Success: false, ErrorMessage: `Log "${v.value}" is no longer loaded.` };
        this.SetActiveTab('logs');
        await this.OnLogClick(log);
        this.publishAgentContext();
        return { Success: true };
    }

    /** Open a log record in a tab (view-only). Defaults to the selected log. */
    private toolOpenLogRecord(params: Record<string, unknown>): AgentToolResult {
        const raw = typeof params?.['log'] === 'string' ? (params['log'] as string) : '';
        let log: MCPExecutionLogData | null = null;
        if (raw) {
            const candidates: MCPNamedItem[] = this.ExecutionLogs.map(l => ({ ID: l.ID, Name: l.ToolName }));
            const match = ResolveMCPItem(raw, candidates);
            if (!match) return { Success: false, ErrorMessage: BuildMCPNotFoundError(raw, candidates, 'log') };
            log = this.ExecutionLogs.find(l => UUIDsEqual(l.ID, match.ID)) ?? null;
        } else {
            log = this.SelectedLog;
            if (!log) return { Success: false, ErrorMessage: 'No log is selected. Pass a log ID, or select one first.' };
        }
        this.navigationService.OpenEntityRecord('MJ: MCP Tool Execution Logs', CompositeKey.FromID(log!.ID));
        return { Success: true };
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
     * Loads all dashboard data using MCPEngine for cached entities
     * and RunView for execution logs (historical data loaded on-demand)
     * @param forceRefresh - If true, forces MCPEngine to reload from database (use after sync operations)
     */
    public async LoadAllData(forceRefresh: boolean = false): Promise<void> {
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();

        try {
            // Initialize MCPEngine and load execution logs in parallel
            // forceRefresh=true is needed after sync operations since backend changes
            // won't trigger local BaseEntity events
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            // Dialect-neutral 7-day cutoff: compute in JS and inject an ISO-8601
            // literal rather than DATEADD/GETUTCDATE, which don't exist on PostgreSQL.
            const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const [, logsResult] = await Promise.all([
                MCPEngine.Instance.Config(forceRefresh),
                rv.RunView<MJMCPToolExecutionLogEntity>({
                    EntityName: 'MJ: MCP Tool Execution Logs',
                    ExtraFilter: `StartedAt >= '${sevenDaysAgoIso}'`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 100,
                    ResultType: 'simple'
                })
            ]);

            // Get cached data from MCPEngine and convert to interface types
            this.Servers = MCPEngine.Instance.Servers.map(s => ({
                ID: s.ID,
                Name: s.Name,
                Description: s.Description,
                TransportType: s.TransportType,
                ServerURL: s.ServerURL,
                Command: s.Command,
                DefaultAuthType: s.DefaultAuthType,
                Status: s.Status,
                RateLimitPerMinute: s.RateLimitPerMinute,
                RateLimitPerHour: s.RateLimitPerHour,
                LastSyncAt: s.LastSyncAt,
                // OAuth configuration fields
                OAuthIssuerURL: s.OAuthIssuerURL,
                OAuthScopes: s.OAuthScopes,
                OAuthMetadataCacheTTLMinutes: s.OAuthMetadataCacheTTLMinutes,
                OAuthClientID: s.OAuthClientID,
                OAuthClientSecretEncrypted: s.OAuthClientSecretEncrypted,
                OAuthRequirePKCE: s.OAuthRequirePKCE
            }));

            this.Connections = MCPEngine.Instance.Connections.map(c => ({
                ID: c.ID,
                MCPServerID: c.MCPServerID,
                Name: c.Name,
                Description: c.Description,
                Status: c.Status,
                CompanyID: c.CompanyID,
                CredentialID: c.CredentialID ?? null,
                AutoSyncTools: c.AutoSyncTools,
                LogToolCalls: c.LogToolCalls,
                LastConnectedAt: c.LastConnectedAt,
                LastErrorMessage: c.LastErrorMessage
            }));

            this.tools = MCPEngine.Instance.Tools.map(t => ({
                ID: t.ID,
                MCPServerID: t.MCPServerID,
                ToolName: t.ToolName,
                ToolTitle: t.ToolTitle,
                ToolDescription: t.ToolDescription,
                InputSchema: t.InputSchema,
                Status: t.Status,
                DiscoveredAt: t.DiscoveredAt,
                LastSeenAt: t.LastSeenAt
            }));

            // Index tools by server ID once, now that tools/connections are loaded.
            this.buildToolsByServerMap();

            if (logsResult.Success) {
                // Map database column names to UI interface property names
                this.ExecutionLogs = (logsResult.Results || []).map(log => this.mapLogFromDatabase(log));
            }

            // Enrich data with counts and names
            this.enrichServerData();
            this.enrichConnectionData();
            this.enrichToolData();
            this.enrichLogData();

            // Calculate stats
            this.calculateStats();

            // Populate filter dropdowns from loaded data (needed even outside Scale mode)
            this.ToolsAvailableServers = this.Servers.map(s => ({ ID: s.ID, Name: s.Name }));
            this.ToolsAvailableCategories = this.ComputeCategoriesFromTools();

            // Apply filters
            this.ApplyFilters();

            // Refresh the agent context now that counts/stats are recomputed.
            this.publishAgentContext();

            // Load user's favorites (Part 3.6) — fire and forget
            this.LoadFavorites();

        } catch (error) {
            this.ErrorMessage = `Failed to load data: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link LoadAllData}. */
    public async loadAllData(forceRefresh: boolean = false): Promise<void> {
      return this.LoadAllData(forceRefresh);
    }

    private enrichServerData(): void {
        for (const server of this.Servers) {
            server.ConnectionCount = this.Connections.filter(c => UUIDsEqual(c.MCPServerID, server.ID)).length
            server.ToolCount = this.tools.filter(t => UUIDsEqual(t.MCPServerID, server.ID)).length
        }
    }

    private enrichConnectionData(): void {
        for (const conn of this.Connections) {
            const server = this.Servers.find(s => UUIDsEqual(s.ID, conn.MCPServerID));
            conn.ServerName = server?.Name ?? 'Unknown';
        }
    }

    private enrichToolData(): void {
        for (const tool of this.tools) {
            const server = this.Servers.find(s => UUIDsEqual(s.ID, tool.MCPServerID));
            tool.ServerName = server?.Name ?? 'Unknown';
        }
    }

    private enrichLogData(): void {
        for (const log of this.ExecutionLogs) {
            const conn = this.Connections.find(c => UUIDsEqual(c.ID, log.ConnectionID));
            log.ConnectionName = conn?.Name ?? log.ConnectionName ?? 'Unknown';
            // Add server name via connection
            if (conn) {
                const server = this.Servers.find(s => UUIDsEqual(s.ID, conn.MCPServerID));
                log.ServerName = server?.Name ?? 'Unknown';
            } else {
                log.ServerName = log.ServerName ?? 'Unknown';
            }
        }
        // Sort logs by StartedAt descending (most recent first)
        this.ExecutionLogs.sort((a, b) => {
            const dateA = new Date(a.StartedAt).getTime();
            const dateB = new Date(b.StartedAt).getTime();
            return dateB - dateA;
        });
    }

    /**
     * Maps database log entity to UI interface format
     * Handles column name differences between DB schema and UI interface
     */
    private mapLogFromDatabase(dbLog: MJMCPToolExecutionLogEntity): MCPExecutionLogData {
        // Determine status from Success boolean
        let status: string;
        if (dbLog.Success === true) {
            status = 'Success';
        } else if (dbLog.Success === false) {
            status = 'Error';
        } else {
            // null means still running
            status = 'Running';
        }

        return {
            ID: dbLog.ID,
            ConnectionID: dbLog.MCPServerConnectionID,
            ToolID: dbLog.MCPServerToolID,
            ToolName: dbLog.ToolName || 'Unknown',
            Status: status,
            StartedAt: dbLog.StartedAt,
            CompletedAt: dbLog.EndedAt,
            DurationMs: dbLog.DurationMs,
            UserID: dbLog.UserID,
            UserName: dbLog.User,
            ErrorMessage: dbLog.ErrorMessage,
            InputArgs: dbLog.InputParameters,
            Result: dbLog.OutputContent,
            ConnectionName: dbLog.MCPServerConnection,
            ServerName: undefined // Will be enriched later
        };
    }

    private calculateStats(): void {
        this.Stats = {
            totalServers: this.Servers.length,
            activeServers: this.Servers.filter(s => s.Status === 'Active').length,
            totalConnections: this.Connections.length,
            activeConnections: this.Connections.filter(c => c.Status === 'Active').length,
            totalTools: this.tools.length,
            activeTools: this.tools.filter(t => t.Status === 'Active').length,
            recentExecutions: this.ExecutionLogs.length,
            failedExecutions: this.ExecutionLogs.filter(l => l.Status === 'Error').length
        };
    }

    // ========================================
    // Filtering
    // ========================================

    private setupFilterSubscription(): void {
        this.Filters$
            .pipe(
                debounceTime(300),
                distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
                takeUntil(this.destroy$)
            )
            .subscribe(() => {
                this.ApplyFilters();
                // Re-emit agent context so search / filter / tab-clear changes are
                // reflected in the AI agent's view of this surface.
                this.publishAgentContext();
                this.cdr.detectChanges();
            });
    }

    public ApplyFilters(): void {
        const filters = this.Filters$.value;
        const search = filters.searchTerm.toLowerCase();

        // Filter servers
        this.FilteredServers = this.Servers.filter(s => {
            const matchesSearch = !search ||
                s.Name.toLowerCase().includes(search) ||
                (s.Description?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.serverStatus === 'all' || s.Status === filters.serverStatus;
            return matchesSearch && matchesStatus;
        });

        // Filter connections
        this.FilteredConnections = this.Connections.filter(c => {
            const matchesSearch = !search ||
                c.Name.toLowerCase().includes(search) ||
                (c.ServerName?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.connectionStatus === 'all' || c.Status === filters.connectionStatus;
            return matchesSearch && matchesStatus;
        });

        // Filter tools (legacy grouped view — now also honors Server / Category / Favorites-only filters)
        this.FilteredTools = this.tools.filter(t => {
            const matchesSearch = !search ||
                t.ToolName.toLowerCase().includes(search) ||
                (t.ToolTitle?.toLowerCase().includes(search) ?? false) ||
                (t.ToolDescription?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.toolStatus === 'all' || t.Status === filters.toolStatus;
            const matchesServer = !filters.toolsServer || filters.toolsServer === 'all' ||
                UUIDsEqual(t.MCPServerID, filters.toolsServer);
            const cat = t.ToolName.indexOf('_') > 0 ? t.ToolName.substring(0, t.ToolName.indexOf('_')) : t.ToolName;
            const matchesCategory = !filters.toolsCategory || filters.toolsCategory === 'all' || cat === filters.toolsCategory;
            const matchesFavorite = !filters.favoritesOnly || this.IsFavorited(t.ID);
            const matchesRecent = !filters.recentOnly || this.RecentToolIDSet().has(NormalizeUUID(t.ID));
            return matchesSearch && matchesStatus && matchesServer && matchesCategory && matchesFavorite && matchesRecent;
        });

        // Build server groups for the tools tab
        this.buildServerGroups();

        // Filter logs
        this.FilteredLogs = this.ExecutionLogs.filter(l => {
            const matchesSearch = !search ||
                l.ToolName.toLowerCase().includes(search) ||
                (l.ConnectionName?.toLowerCase().includes(search) ?? false) ||
                (l.ServerName?.toLowerCase().includes(search) ?? false);
            const matchesStatus = filters.logStatus === 'all' || l.Status === filters.logStatus;
            return matchesSearch && matchesStatus;
        });

        // Apply current sort
        this.sortFilteredLogs();
    }

    /** @deprecated Use {@link ApplyFilters}. */
    public applyFilters(): void {
      return this.ApplyFilters();
    }

    public OnSearchChange(term: string): void {
        const current = this.Filters$.value;
        this.Filters$.next({ ...current, searchTerm: term });
        this.saveUserPreferencesDebounced();
    }

    /** @deprecated Use {@link OnSearchChange}. */
    public onSearchChange(term: string): void {
      return this.OnSearchChange(term);
    }

    public OnStatusFilterChange(filterType: string, value: string): void {
        const current = this.Filters$.value;
        switch (filterType) {
            case 'server':
                this.Filters$.next({ ...current, serverStatus: value });
                break;
            case 'connection':
                this.Filters$.next({ ...current, connectionStatus: value });
                break;
            case 'tool':
                this.Filters$.next({ ...current, toolStatus: value });
                break;
            case 'log':
                this.Filters$.next({ ...current, logStatus: value });
                break;
        }
        this.saveUserPreferencesDebounced();
    }

    /** @deprecated Use {@link OnStatusFilterChange}. */
    public onStatusFilterChange(filterType: string, value: string): void {
      return this.OnStatusFilterChange(filterType, value);
    }

    // ========================================
    // Filter Panel
    // ========================================

    /**
     * Toggle filter panel visibility
     */
    public ToggleFilterPanel(): void {
        this.FilterPanelVisible = !this.FilterPanelVisible;
        this.saveUserPreferencesDebounced();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleFilterPanel}. */
    public toggleFilterPanel(): void {
      return this.ToggleFilterPanel();
    }

    /**
     * Handle filter changes from the filter panel component
     */
    public OnFiltersChange(filters: MCPDashboardFilters): void {
        this.Filters$.next(filters);
        this.saveUserPreferencesDebounced();
        // Part 3.3/3.4 — when Tools tab is active in scale mode, reload the paginated list + counts
        if (this.ActiveTab === 'tools' && this.UseScalablePagination) {
            this.LoadToolsPage(true);
            this.LoadToolCounts();
        }
    }

    /** @deprecated Use {@link OnFiltersChange}. */
    public onFiltersChange(filters: MCPDashboardFilters): void {
      return this.OnFiltersChange(filters);
    }

    /** Inlined filter panel — single-field update helper */
    public OnFilterFieldChange(field: keyof MCPDashboardFilters, value: unknown): void {
        const updated = { ...this.Filters$.value, [field]: value };
        this.OnFiltersChange(updated as MCPDashboardFilters);
    }

    /** @deprecated Use {@link OnFilterFieldChange}. */
    public onFilterFieldChange(field: keyof MCPDashboardFilters, value: unknown): void {
      return this.OnFilterFieldChange(field, value);
    }

    /** Count of non-default filter dimensions, used for "Filters (N)" badge */
    public activeFilterCount(): number {
        const f = this.Filters$.value;
        let n = 0;
        if (f.searchTerm) n++;
        if (f.serverStatus && f.serverStatus !== 'all') n++;
        if (f.connectionStatus && f.connectionStatus !== 'all') n++;
        if (f.toolStatus && f.toolStatus !== 'all') n++;
        if (f.logStatus && f.logStatus !== 'all') n++;
        if (f.toolsServer && f.toolsServer !== 'all') n++;
        if (f.toolsCategory && f.toolsCategory !== 'all') n++;
        if (f.favoritesOnly) n++;
        if (f.recentOnly) n++;
        return n;
    }

    /** Derive category list (snake_case prefix) + counts from the currently loaded tools. */
    public ComputeCategoriesFromTools(): Array<{ category: string; count: number }> {
        const counts = new Map<string, number>();
        for (const t of this.tools) {
            const idx = t.ToolName.indexOf('_');
            const cat = idx > 0 ? t.ToolName.substring(0, idx) : t.ToolName;
            counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => a.category.localeCompare(b.category));
    }

    /** @deprecated Use {@link ComputeCategoriesFromTools}. */
    public computeCategoriesFromTools(): Array<{ category: string; count: number }> {
      return this.ComputeCategoriesFromTools();
    }

    public ResetAllFilters(): void {
        this.OnFiltersChange({
            searchTerm: '',
            serverStatus: 'all',
            connectionStatus: 'all',
            toolStatus: 'all',
            logStatus: 'all',
            toolsServer: 'all',
            toolsCategory: 'all',
            favoritesOnly: false,
            recentOnly: false
        });
    }

    /** @deprecated Use {@link ResetAllFilters}. */
    public resetAllFilters(): void {
      return this.ResetAllFilters();
    }

    /** Reset only the popover filters — leave searchTerm (toolbar) untouched. */
    public ResetPopoverFilters(): void {
        const current = this.Filters$.value;
        this.OnFiltersChange({
            ...current,
            serverStatus: 'all',
            connectionStatus: 'all',
            toolStatus: 'all',
            logStatus: 'all',
            toolsServer: 'all',
            toolsCategory: 'all',
            favoritesOnly: false,
            recentOnly: false
        });
    }

    /** @deprecated Use {@link ResetPopoverFilters}. */
    public resetPopoverFilters(): void {
      return this.ResetPopoverFilters();
    }

    /** Tools-tab view-mode options for the shared <mj-view-toggle>. */
    public readonly ToolsViewOptions = [
        { key: 'card', icon: 'fa-solid fa-grip', title: 'Card View' },
        { key: 'list', icon: 'fa-solid fa-list', title: 'List View' },
    ];

    /** @deprecated Use {@link ToolsViewOptions}. */
    public get toolsViewOptions() {
      return this.ToolsViewOptions;
    }

    /** Tab config consumed by the centralized <mj-tab-nav>. */
    public get McpTabs(): import('@memberjunction/ng-ui-components').TabConfig[] {
        return [
            { key: 'servers',     label: 'Servers',     icon: 'fa-solid fa-server',     badge: this.Servers.length },
            { key: 'connections', label: 'Connections', icon: 'fa-solid fa-link',       badge: this.Connections.length },
            { key: 'tools',       label: 'Tools',       icon: 'fa-solid fa-wrench',     badge: this.tools.length },
            { key: 'logs',        label: 'Logs',        icon: 'fa-solid fa-list-check', badge: this.ExecutionLogs.length, badgeVariant: this.Stats.failedExecutions > 0 ? 'error' : 'default' },
        ];
    }

    /** @deprecated Use {@link McpTabs}. */
    public get mcpTabs(): import('@memberjunction/ng-ui-components').TabConfig[] {
      return this.McpTabs;
    }

    /** Active filter count excluding searchTerm (surfaced separately via toolbar mj-page-search). */
    public get ActiveFilterCount(): number {
        const f = this.Filters$.value;
        let n = 0;
        if (f.serverStatus && f.serverStatus !== 'all') n++;
        if (f.connectionStatus && f.connectionStatus !== 'all') n++;
        if (f.toolStatus && f.toolStatus !== 'all') n++;
        if (f.logStatus && f.logStatus !== 'all') n++;
        if (f.toolsServer && f.toolsServer !== 'all') n++;
        if (f.toolsCategory && f.toolsCategory !== 'all') n++;
        if (f.favoritesOnly) n++;
        if (f.recentOnly) n++;
        return n;
    }

    /** Values record consumed by the centralized <mj-filter-panel>, scoped to the current tab. */
    public get McpFilterValues(): Record<string, unknown> {
        const f = this.Filters$.value;
        return {
            serverStatus:     f.serverStatus,
            connectionStatus: f.connectionStatus,
            toolStatus:       f.toolStatus,
            logStatus:        f.logStatus,
            toolsServer:      f.toolsServer,
            toolsCategory:    f.toolsCategory,
            favoritesOnly:    f.favoritesOnly,
            recentOnly:       f.recentOnly,
        };
    }

    /** @deprecated Use {@link McpFilterValues}. */
    public get mcpFilterValues(): Record<string, unknown> {
      return this.McpFilterValues;
    }

    /** Field config built dynamically based on the active tab. */
    public get McpFilterFields(): import('@memberjunction/ng-ui-components').FilterFieldConfig[] {
        const fields: import('@memberjunction/ng-ui-components').FilterFieldConfig[] = [];

        if (this.ActiveTab === 'tools') {
            fields.push({
                key: 'toolsServer',
                type: 'dropdown',
                label: 'Server',
                icon: 'fa-solid fa-server',
                filterable: this.ToolsAvailableServers.length > 10,
                options: [
                    { text: 'All Servers', value: 'all' },
                    ...this.ToolsAvailableServers.map(s => ({ text: s.Name, value: s.ID })),
                ],
            });
            fields.push({
                key: 'toolsCategory',
                type: 'dropdown',
                label: 'Category',
                icon: 'fa-solid fa-tags',
                filterable: this.ToolsAvailableCategories.length > 10,
                options: [
                    { text: 'All Categories', value: 'all' },
                    ...this.ToolsAvailableCategories.map(c => ({ text: `${c.category} (${c.count})`, value: c.category })),
                ],
            });
        }

        // Per-tab status filter
        if (this.ActiveTab === 'servers') {
            fields.push({
                key: 'serverStatus',
                type: 'dropdown',
                label: 'Server Status',
                icon: 'fa-solid fa-toggle-on',
                options: [
                    { text: 'All Statuses', value: 'all' },
                    { text: 'Active',       value: 'Active' },
                    { text: 'Inactive',     value: 'Inactive' },
                ],
            });
        } else if (this.ActiveTab === 'connections') {
            fields.push({
                key: 'connectionStatus',
                type: 'dropdown',
                label: 'Connection Status',
                icon: 'fa-solid fa-toggle-on',
                options: [
                    { text: 'All Statuses', value: 'all' },
                    { text: 'Active',       value: 'Active' },
                    { text: 'Inactive',     value: 'Inactive' },
                    { text: 'Error',        value: 'Error' },
                ],
            });
        } else if (this.ActiveTab === 'tools') {
            fields.push({
                key: 'toolStatus',
                type: 'dropdown',
                label: 'Tool Status',
                icon: 'fa-solid fa-toggle-on',
                options: [
                    { text: 'All Statuses', value: 'all' },
                    { text: 'Active',       value: 'Active' },
                    { text: 'Deprecated',   value: 'Deprecated' },
                ],
            });
            // Boolean toggles as chips (active = true, all = false)
            fields.push({
                key: 'favoritesOnly',
                type: 'chips',
                label: 'Favorites',
                icon: 'fa-solid fa-star',
                chipOptions: [
                    { text: 'All',             value: false },
                    { text: 'Favorites only',  value: true, icon: 'fa-solid fa-star' },
                ],
            });
            fields.push({
                key: 'recentOnly',
                type: 'chips',
                label: 'Recency',
                icon: 'fa-solid fa-clock-rotate-left',
                chipOptions: [
                    { text: 'All',                  value: false },
                    { text: 'Recently used only',   value: true, icon: 'fa-solid fa-clock-rotate-left' },
                ],
            });
        } else if (this.ActiveTab === 'logs') {
            fields.push({
                key: 'logStatus',
                type: 'dropdown',
                label: 'Log Status',
                icon: 'fa-solid fa-circle-check',
                options: [
                    { text: 'All Statuses', value: 'all' },
                    { text: 'Success',      value: 'Success' },
                    { text: 'Error',        value: 'Error' },
                    { text: 'Running',      value: 'Running' },
                ],
            });
        }

        return fields;
    }

    /** @deprecated Use {@link McpFilterFields}. */
    public get mcpFilterFields(): import('@memberjunction/ng-ui-components').FilterFieldConfig[] {
      return this.McpFilterFields;
    }

    /** Receive updated values from <mj-filter-panel> and propagate to filters$. */
    public OnFilterValuesChange(values: Record<string, unknown>): void {
        const current = this.Filters$.value;
        this.OnFiltersChange({
            ...current,
            serverStatus:     (values['serverStatus']     as string) ?? current.serverStatus,
            connectionStatus: (values['connectionStatus'] as string) ?? current.connectionStatus,
            toolStatus:       (values['toolStatus']       as string) ?? current.toolStatus,
            logStatus:        (values['logStatus']        as string) ?? current.logStatus,
            toolsServer:      (values['toolsServer']      as string) ?? current.toolsServer,
            toolsCategory:    (values['toolsCategory']    as string) ?? current.toolsCategory,
            favoritesOnly:    (values['favoritesOnly']    as boolean) ?? false,
            recentOnly:       (values['recentOnly']       as boolean) ?? false,
        });
    }

    /** @deprecated Use {@link OnFilterValuesChange}. */
    public onFilterValuesChange(values: Record<string, unknown>): void {
      return this.OnFilterValuesChange(values);
    }

    /** Update searchTerm from the toolbar mj-page-search. */
    public OnSearchTermChange(value: string): void {
        const current = this.Filters$.value;
        this.OnFiltersChange({ ...current, searchTerm: value ?? '' });
    }

    /** @deprecated Use {@link OnSearchTermChange}. */
    public onSearchTermChange(value: string): void {
      return this.OnSearchTermChange(value);
    }

    /**
     * Get the current filtered count based on active tab
     */
    public get CurrentFilteredCount(): number {
        switch (this.ActiveTab) {
            case 'servers':
                return this.FilteredServers.length;
            case 'connections':
                return this.FilteredConnections.length;
            case 'tools':
                return this.FilteredTools.length;
            case 'logs':
                return this.FilteredLogs.length;
            default:
                return 0;
        }
    }

    /**
     * Get the total count based on active tab
     */
    public get CurrentTotalCount(): number {
        switch (this.ActiveTab) {
            case 'servers':
                return this.Servers.length;
            case 'connections':
                return this.Connections.length;
            case 'tools':
                return this.tools.length;
            case 'logs':
                return this.ExecutionLogs.length;
            default:
                return 0;
        }
    }

    /**
     * Get current filters value (non-observable)
     */
    public get CurrentFilters(): MCPDashboardFilters {
        return this.Filters$.value;
    }

    // ========================================
    // Tab Navigation
    // ========================================

    /**
     * Sets the active tab and updates URL for deep linking
     */
    public SetActiveTab(tab: MCPDashboardTab): void {
        if (this.ActiveTab === tab) return;

        this.ActiveTab = tab;

        // Clear filters that belong to OTHER tabs — they're not applicable here
        // and would otherwise stay stuck in state (counted in the badge, hidden from
        // the popover form). searchTerm is universal and preserved.
        const current = this.Filters$.value;
        this.OnFiltersChange({
            ...current,
            serverStatus:     'all',
            connectionStatus: 'all',
            toolStatus:       'all',
            logStatus:        'all',
            toolsServer:      'all',
            toolsCategory:    'all',
            favoritesOnly:    false,
            recentOnly:       false,
        });

        this.UpdateQueryParams({ tab: this.ActiveTab });
        // Mode-scoping: swap the agent's per-tab tool set on the tab transition,
        // then re-publish the now-tab-scoped deep context.
        this.syncAgentToolsForMode();
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link SetActiveTab}. */
    public setActiveTab(tab: MCPDashboardTab): void {
      return this.SetActiveTab(tab);
    }

    // ========================================
    // Server Operations
    // ========================================

    public CreateServer(): void {
        this.EditingServer = null;
        this.ServerForm = { Name: '', Description: '', TransportType: 'StreamableHTTP', ServerURL: '', Command: '', DefaultAuthType: 'None', Status: 'Active', RateLimitPerMinute: null, RateLimitPerHour: null, RequestTimeoutMs: 60000 };
        this.ServerFormError = null;
        this.ShowServerDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CreateServer}. */
    public createServer(): void {
      return this.CreateServer();
    }

    public EditServer(server: MCPServerData): void {
        this.EditingServer = server;
        this.ServerForm = {
            Name: server.Name,
            Description: server.Description ?? '',
            TransportType: server.TransportType,
            ServerURL: server.ServerURL ?? '',
            Command: server.Command ?? '',
            DefaultAuthType: server.DefaultAuthType,
            Status: server.Status,
            RateLimitPerMinute: server.RateLimitPerMinute,
            RateLimitPerHour: server.RateLimitPerHour,
            RequestTimeoutMs: 60000
        };
        this.ServerFormError = null;
        this.ShowServerDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link EditServer}. */
    public editServer(server: MCPServerData): void {
      return this.EditServer(server);
    }

    public async DeleteServer(server: MCPServerData): Promise<void> {
        // Check for related connections first
        const relatedConnections = this.Connections.filter((c: MCPConnectionData) => UUIDsEqual(c.MCPServerID, server.ID));
        const relatedTools = this.tools.filter((t: MCPToolData) => UUIDsEqual(t.MCPServerID, server.ID));

        if (relatedConnections.length > 0 || relatedTools.length > 0) {
            const parts: string[] = [];
            if (relatedConnections.length > 0) {
                parts.push(`${relatedConnections.length} connection(s)`);
            }
            if (relatedTools.length > 0) {
                parts.push(`${relatedTools.length} tool(s)`);
            }

            const confirmed = await this.confirm.ConfirmDelete({
                title: 'Delete server',
                message: `Delete server "${server.Name}"? It has ${parts.join(' and ')}.`,
                detail: 'All related records will be deleted. This cannot be undone.',
            });
            if (!confirmed) {
                return;
            }

            // Delete related connections first (which will cascade to connection tools/permissions)
            for (const conn of relatedConnections) {
                try {
                    await this.deleteConnectionInternal(conn.ID);
                } catch (error) {
                    this.ErrorMessage = `Failed to delete related connection "${conn.Name}": ${error instanceof Error ? error.message : String(error)}`;
                    this.cdr.detectChanges();
                    return;
                }
            }

            // Delete related tools
            for (const tool of relatedTools) {
                try {
                    await this.deleteToolInternal(tool.ID);
                } catch (error) {
                    this.ErrorMessage = `Failed to delete related tool "${tool.ToolName}": ${error instanceof Error ? error.message : String(error)}`;
                    this.cdr.detectChanges();
                    return;
                }
            }
        } else {
            const confirmed = await this.confirm.ConfirmDelete({
                title: 'Delete server',
                message: `Delete server "${server.Name}"?`,
            });
            if (!confirmed) {
                return;
            }
        }

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJMCPServerEntity>('MJ: MCP Servers');
            const loaded = await entity.Load(server.ID);
            if (!loaded) {
                this.ErrorMessage = `Server not found: ${server.Name}`;
                this.cdr.detectChanges();
                return;
            }

            const deleted = await entity.Delete();
            if (!deleted) {
                const errorMsg = entity.LatestResult?.Message || entity.LatestResult?.CompleteMessage || 'Unknown error';
                this.ErrorMessage = `Failed to delete server: ${errorMsg}`;
                this.cdr.detectChanges();
                return;
            }

            await this.LoadAllData();
        } catch (error) {
            this.ErrorMessage = `Failed to delete server: ${error instanceof Error ? error.message : String(error)}`;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link DeleteServer}. */
    public async deleteServer(server: MCPServerData): Promise<void> {
      return this.DeleteServer(server);
    }

    /**
     * Internal helper to delete a tool by ID without confirmation
     */
    private async deleteToolInternal(toolId: string): Promise<void> {
        const md = this.ProviderToUse;
        const entity = await md.GetEntityObject<MJMCPServerToolEntity>('MJ: MCP Server Tools');
        const loaded = await entity.Load(toolId);
        if (!loaded) {
            throw new Error(`Tool not found`);
        }
        const deleted = await entity.Delete();
        if (!deleted) {
            const errorMsg = entity.LatestResult?.Message || entity.LatestResult?.CompleteMessage || 'Delete failed';
            throw new Error(errorMsg);
        }
    }

    /**
     * Internal helper to delete a connection by ID without confirmation.
     * Handles deletion of all related records that don't have ON DELETE CASCADE:
     * - MCP Tool Execution Logs
     * - OAuth Authorization States
     * - OAuth Client Registrations
     * - OAuth Tokens
     */
    private async deleteConnectionInternal(connectionId: string): Promise<void> {
        console.log(`[MCPDashboard] deleteConnectionInternal called for connectionId: ${connectionId}`);
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const md = this.ProviderToUse;
        const tg = await md.CreateTransactionGroup();

        // Queue deletes for execution logs
        const logsResult = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: MCP Tool Execution Logs',
            ExtraFilter: `MCPServerConnectionID='${connectionId}'`,
            Fields: ['ID'],
            ResultType: 'simple'
        });
        if (logsResult.Success && logsResult.Results) {
            console.log(`[MCPDashboard] Queueing ${logsResult.Results.length} execution logs for delete`);
            for (const log of logsResult.Results) {
                const logEntity = await md.GetEntityObject<MJMCPToolExecutionLogEntity>('MJ: MCP Tool Execution Logs');
                if (await logEntity.Load(log.ID)) {
                    logEntity.TransactionGroup = tg;
                    await logEntity.Delete();
                } else {
                    console.warn(`[MCPDashboard] Could not load execution log ${log.ID} - may have been already deleted`);
                }
            }
        }

        // Queue deletes for OAuth Authorization States
        const authStatesResult = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: O Auth Authorization States',
            ExtraFilter: `MCPServerConnectionID='${connectionId}'`,
            Fields: ['ID'],
            ResultType: 'simple'
        });
        if (authStatesResult.Success && authStatesResult.Results) {
            console.log(`[MCPDashboard] Queueing ${authStatesResult.Results.length} OAuth Authorization States for delete`);
            for (const state of authStatesResult.Results) {
                const stateEntity = await md.GetEntityObject<MJOAuthAuthorizationStateEntity>('MJ: O Auth Authorization States');
                if (await stateEntity.Load(state.ID)) {
                    stateEntity.TransactionGroup = tg;
                    await stateEntity.Delete();
                } else {
                    console.warn(`[MCPDashboard] Could not load OAuth Authorization State ${state.ID} - may have been already deleted`);
                }
            }
        }

        // Queue deletes for OAuth Client Registrations
        const clientRegsResult = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: O Auth Client Registrations',
            ExtraFilter: `MCPServerConnectionID='${connectionId}'`,
            Fields: ['ID'],
            ResultType: 'simple'
        });
        if (clientRegsResult.Success && clientRegsResult.Results) {
            console.log(`[MCPDashboard] Queueing ${clientRegsResult.Results.length} OAuth Client Registrations for delete`);
            for (const reg of clientRegsResult.Results) {
                const regEntity = await md.GetEntityObject<MJOAuthClientRegistrationEntity>('MJ: O Auth Client Registrations');
                if (await regEntity.Load(reg.ID)) {
                    regEntity.TransactionGroup = tg;
                    await regEntity.Delete();
                } else {
                    console.warn(`[MCPDashboard] Could not load OAuth Client Registration ${reg.ID} - may have been already deleted`);
                }
            }
        }

        // Queue deletes for OAuth Tokens
        const tokensResult = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: O Auth Tokens',
            ExtraFilter: `MCPServerConnectionID='${connectionId}'`,
            Fields: ['ID'],
            ResultType: 'simple'
        });
        if (tokensResult.Success && tokensResult.Results) {
            console.log(`[MCPDashboard] Queueing ${tokensResult.Results.length} OAuth Tokens for delete`);
            for (const token of tokensResult.Results) {
                const tokenEntity = await md.GetEntityObject<MJOAuthTokenEntity>('MJ: O Auth Tokens');
                if (await tokenEntity.Load(token.ID)) {
                    tokenEntity.TransactionGroup = tg;
                    await tokenEntity.Delete();
                } else {
                    console.warn(`[MCPDashboard] Could not load OAuth Token ${token.ID} - may have been already deleted`);
                }
            }
        }

        // Queue the connection delete last
        const entity = await md.GetEntityObject<MJMCPServerConnectionEntity>('MJ: MCP Server Connections');
        const loaded = await entity.Load(connectionId);
        if (!loaded) {
            throw new Error(`Connection not found`);
        }
        entity.TransactionGroup = tg;
        await entity.Delete();

        // Submit everything atomically — if anything fails, the whole cascade rolls back
        if (!await tg.Submit()) {
            const errorMsg = entity.LatestResult?.Message || entity.LatestResult?.CompleteMessage || 'Delete failed';
            throw new Error(`Failed to delete connection and related records: ${errorMsg}`);
        }
        console.log('[MCPDashboard] Connection and all related records deleted atomically');
    }

    public async OnServerDialogClose(result: { saved: boolean }): Promise<void> {
        this.ShowServerDialog = false;
        this.EditingServer = null;
        if (result.saved) {
            await this.LoadAllData();
        }
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnServerDialogClose}. */
    public async onServerDialogClose(result: { saved: boolean }): Promise<void> {
      return this.OnServerDialogClose(result);
    }

    public CancelServerForm(): void {
        this.ShowServerDialog = false;
        this.ServerFormError = null;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CancelServerForm}. */
    public cancelServerForm(): void {
      return this.CancelServerForm();
    }

    public async SaveServerForm(): Promise<void> {
        if (!this.ServerForm.Name?.trim()) {
            this.ServerFormError = 'Name is required';
            this.cdr.detectChanges();
            return;
        }
        if ((this.ServerForm.TransportType === 'StreamableHTTP' || this.ServerForm.TransportType === 'SSE' || this.ServerForm.TransportType === 'WebSocket') && !this.ServerForm.ServerURL?.trim()) {
            this.ServerFormError = 'Server URL is required for this transport type';
            this.cdr.detectChanges();
            return;
        }
        this.ServerFormSaving = true;
        this.ServerFormError = null;
        this.cdr.detectChanges();
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJMCPServerEntity>('MJ: MCP Servers');
            if (this.EditingServer?.ID) {
                await entity.Load(this.EditingServer.ID);
            } else {
                entity.NewRecord();
            }
            entity.Name = this.ServerForm.Name.trim();
            entity.Description = this.ServerForm.Description?.trim() || null;
            entity.TransportType = this.ServerForm.TransportType as MJMCPServerEntity['TransportType'];
            entity.ServerURL = this.ServerForm.ServerURL?.trim() || null;
            entity.Command = this.ServerForm.Command?.trim() || null;
            entity.DefaultAuthType = this.ServerForm.DefaultAuthType as MJMCPServerEntity['DefaultAuthType'];
            entity.Status = this.ServerForm.Status as MJMCPServerEntity['Status'];
            entity.RateLimitPerMinute = this.ServerForm.RateLimitPerMinute ?? null;
            entity.RateLimitPerHour = this.ServerForm.RateLimitPerHour ?? null;
            entity.RequestTimeoutMs = this.ServerForm.RequestTimeoutMs ?? 60000;
            const saved = await entity.Save();
            if (!saved) {
                throw new Error(entity.LatestResult?.CompleteMessage ?? 'Save failed');
            }
            this.ShowServerDialog = false;
            await this.LoadAllData();
        } catch (err) {
            this.ServerFormError = err instanceof Error ? err.message : String(err);
        } finally {
            this.ServerFormSaving = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link SaveServerForm}. */
    public async saveServerForm(): Promise<void> {
      return this.SaveServerForm();
    }

    // ========================================
    // Connection Operations
    // ========================================

    public createConnection(): void {
        this.EditingConnection = null;
        this.ConnectionForm = { MCPServerID: this.Servers[0]?.ID ?? '', Name: '', Description: '', BearerToken: '', Status: 'Active' };
        this.ConnectionFormError = null;
        this.ShowConnectionDialog = true;
        this.cdr.detectChanges();
    }

    public CancelConnectionForm(): void {
        this.ShowConnectionDialog = false;
        this.ConnectionFormError = null;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CancelConnectionForm}. */
    public cancelConnectionForm(): void {
      return this.CancelConnectionForm();
    }

    public async SaveConnectionForm(): Promise<void> {
        if (!this.ConnectionForm.MCPServerID) {
            this.ConnectionFormError = 'Please select a server';
            this.cdr.detectChanges();
            return;
        }
        if (!this.ConnectionForm.Name?.trim()) {
            this.ConnectionFormError = 'Name is required';
            this.cdr.detectChanges();
            return;
        }
        this.ConnectionFormSaving = true;
        this.ConnectionFormError = null;
        this.cdr.detectChanges();
        try {
            const md = this.ProviderToUse;
            let credentialID: string | null = null;

            // If a bearer token was provided, create a Credential record for it
            if (this.ConnectionForm.BearerToken?.trim()) {
                await CredentialEngine.Instance.Config();
                const credType = CredentialEngine.Instance.CredentialTypes
                    .find(t => /bearer|api/i.test(t.Name));
                const credTypeID = credType?.ID ?? null;
                if (credTypeID) {
                    const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials');
                    cred.NewRecord();
                    cred.CredentialTypeID = credTypeID;
                    cred.Name = `${this.ConnectionForm.Name.trim()} Token`;
                    cred.Values = JSON.stringify({ apiKey: this.ConnectionForm.BearerToken.trim() });
                    const credSaved = await cred.Save();
                    if (!credSaved) throw new Error(cred.LatestResult?.CompleteMessage ?? 'Failed to save credential');
                    credentialID = cred.ID;
                }
            }

            const entity = await md.GetEntityObject<MJMCPServerConnectionEntity>('MJ: MCP Server Connections');
            entity.NewRecord();
            entity.MCPServerID = this.ConnectionForm.MCPServerID;
            entity.Name = this.ConnectionForm.Name.trim();
            entity.Description = this.ConnectionForm.Description?.trim() || null;
            entity.Status = this.ConnectionForm.Status as MJMCPServerConnectionEntity['Status'];
            entity.CredentialID = credentialID;
            entity.AutoSyncTools = true;
            entity.LogToolCalls = true;
            entity.LogInputParameters = true;
            entity.LogOutputContent = true;
            const saved = await entity.Save();
            if (!saved) throw new Error(entity.LatestResult?.CompleteMessage ?? 'Save failed');
            this.ShowConnectionDialog = false;
            await this.LoadAllData();
        } catch (err) {
            this.ConnectionFormError = err instanceof Error ? err.message : String(err);
        } finally {
            this.ConnectionFormSaving = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link SaveConnectionForm}. */
    public async saveConnectionForm(): Promise<void> {
      return this.SaveConnectionForm();
    }

    public EditConnection(connection: MCPConnectionData): void {
        this.EditingConnection = connection;
        this.ShowConnectionDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link EditConnection}. */
    public editConnection(connection: MCPConnectionData): void {
      return this.EditConnection(connection);
    }

    public async DeleteConnection(connection: MCPConnectionData): Promise<void> {
        // Check for related execution logs
        const relatedLogs = this.ExecutionLogs.filter(l => UUIDsEqual(l.ConnectionID, connection.ID));

        if (relatedLogs.length > 0) {
            const confirmed = await this.confirm.ConfirmDelete({
                title: 'Delete connection',
                message: `Delete connection "${connection.Name}"? It has ${relatedLogs.length} execution log(s).`,
                detail: 'All related logs will be deleted. This cannot be undone.',
            });
            if (!confirmed) {
                return;
            }
        } else {
            const confirmed = await this.confirm.ConfirmDelete({
                title: 'Delete connection',
                message: `Delete connection "${connection.Name}"?`,
            });
            if (!confirmed) {
                return;
            }
        }

        try {
            // Use the internal method which handles deleting related records
            await this.deleteConnectionInternal(connection.ID);
            await this.LoadAllData();
        } catch (error) {
            this.ErrorMessage = `Failed to delete connection: ${error instanceof Error ? error.message : String(error)}`;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link DeleteConnection}. */
    public async deleteConnection(connection: MCPConnectionData): Promise<void> {
      return this.DeleteConnection(connection);
    }

    public async OnConnectionDialogClose(result: { saved: boolean }): Promise<void> {
        this.ShowConnectionDialog = false;
        this.EditingConnection = null;
        if (result.saved) {
            await this.LoadAllData();
        }
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnConnectionDialogClose}. */
    public async onConnectionDialogClose(result: { saved: boolean }): Promise<void> {
      return this.OnConnectionDialogClose(result);
    }

    // ========================================
    // Tool Operations
    // ========================================

    /**
     * Toggle tool card expansion for details view
     */
    public ToggleToolExpand(tool: MCPToolData): void {
        if (UUIDsEqual(this.ExpandedToolId, tool.ID)) {
            this.ExpandedToolId = null;
        } else {
            this.ExpandedToolId = tool.ID;
        }
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleToolExpand}. */
    public toggleToolExpand(tool: MCPToolData): void {
      return this.ToggleToolExpand(tool);
    }

    /**
     * Check if a tool card is expanded
     */
    public IsToolExpanded(tool: MCPToolData): boolean {
        return UUIDsEqual(this.ExpandedToolId, tool.ID);
    }

    /** @deprecated Use {@link IsToolExpanded}. */
    public isToolExpanded(tool: MCPToolData): boolean {
      return this.IsToolExpanded(tool);
    }

    /**
     * Set tools view mode (card or list)
     */
    public SetToolsViewMode(mode: ToolsViewMode): void {
        this.ToolsViewMode = mode;
        this.cdr.detectChanges();
        this.saveUserPreferencesDebounced();
    }

    /** @deprecated Use {@link SetToolsViewMode}. */
    public setToolsViewMode(mode: ToolsViewMode): void {
      return this.SetToolsViewMode(mode);
    }

    /**
     * Set tools sort option
     */
    public SetToolsSort(sortBy: ToolsSortBy): void {
        if (this.ToolsSortBy === sortBy) {
            // Toggle ascending/descending
            this.ToolsSortAscending = !this.ToolsSortAscending;
        } else {
            this.ToolsSortBy = sortBy;
            this.ToolsSortAscending = true;
        }
        this.buildServerGroups();
        this.cdr.detectChanges();
        this.saveUserPreferencesDebounced();
    }

    /** @deprecated Use {@link SetToolsSort}. */
    public setToolsSort(sortBy: ToolsSortBy): void {
      return this.SetToolsSort(sortBy);
    }

    /**
     * Toggle server group expansion
     */
    public ToggleServerGroup(group: MCPServerGroup): void {
        group.expanded = !group.expanded;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleServerGroup}. */
    public toggleServerGroup(group: MCPServerGroup): void {
      return this.ToggleServerGroup(group);
    }

    /**
     * Build server groups from tools data
     */
    private buildServerGroups(): void {
        // Group tools by server
        const serverMap = new Map<string, MCPToolData[]>();

        for (const tool of this.FilteredTools) {
            const serverId = tool.MCPServerID;
            if (!serverMap.has(serverId)) {
                serverMap.set(serverId, []);
            }
            serverMap.get(serverId)!.push(tool);
        }

        // Build server groups
        this.ServerGroups = [];
        for (const server of this.Servers) {
            const tools = serverMap.get(server.ID) || [];
            if (tools.length > 0) {
                // Sort tools within group
                this.sortTools(tools);

                // Part 3.4 — auto-collapse groups exceeding the threshold
                const startExpanded = tools.length <= this.AUTO_COLLAPSE_THRESHOLD;
                this.ServerGroups.push({
                    server,
                    tools,
                    expanded: startExpanded
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
    public OpenTestToolDialog(tool?: MCPToolData, connection?: MCPConnectionData): void {
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

        this.TestStep = 'select';
        this.TestExecutionResult = null;
        this.testUpdateFilteredLists();
        this.ShowTestToolDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenTestToolDialog}. */
    public openTestToolDialog(tool?: MCPToolData, connection?: MCPConnectionData): void {
      return this.OpenTestToolDialog(tool, connection);
    }

    /**
     * Close Test Tool dialog
     */
    public OnTestToolDialogClose(): void {
        this.TestCloseDialog();
    }

    /** @deprecated Use {@link OnTestToolDialogClose}. */
    public onTestToolDialogClose(): void {
      return this.OnTestToolDialogClose();
    }

    // ========================================
    // Inline Test Tool Methods
    // ========================================

    private testUpdateFilteredLists(): void {
        if (this.TestToolServerID) {
            this.TestFilteredConnections = this.Connections.filter(
                c => UUIDsEqual(c.MCPServerID, this.TestToolServerID!) && c.Status === 'Active'
            );
            this.TestFilteredTools = this.tools.filter(
                t => UUIDsEqual(t.MCPServerID, this.TestToolServerID!) && t.Status === 'Active'
            );
            if (this.TestFilteredConnections.length > 0 && !this.TestToolConnectionID) {
                this.TestToolConnectionID = this.TestFilteredConnections[0].ID;
            }
        } else {
            this.TestFilteredConnections = [];
            this.TestFilteredTools = [];
        }
    }

    public OnTestServerChange(value: string): void {
        this.TestToolServerID = value || null;
        this.TestToolConnectionID = null;
        this.TestToolID = null;
        this.testUpdateFilteredLists();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnTestServerChange}. */
    public onTestServerChange(value: string): void {
      return this.OnTestServerChange(value);
    }

    public OnTestConnectionChange(value: string): void {
        this.TestToolConnectionID = value || null;
    }

    /** @deprecated Use {@link OnTestConnectionChange}. */
    public onTestConnectionChange(value: string): void {
      return this.OnTestConnectionChange(value);
    }

    public OnTestToolSelectChange(value: string): void {
        this.TestToolID = value || null;
    }

    /** @deprecated Use {@link OnTestToolSelectChange}. */
    public onTestToolSelectChange(value: string): void {
      return this.OnTestToolSelectChange(value);
    }

    public get TestCanProceed(): boolean {
        return !!this.TestToolServerID && !!this.TestToolConnectionID && !!this.TestToolID;
    }

    public TestProceedToConfig(): void {
        if (!this.TestCanProceed) return;
        this.TestSelectedTool = this.tools.find(t => UUIDsEqual(t.ID, this.TestToolID!)) ?? null;
        if (!this.TestSelectedTool) return;
        this.testParseSchema();
        this.TestStep = 'configure';
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link TestProceedToConfig}. */
    public testProceedToConfig(): void {
      return this.TestProceedToConfig();
    }

    private testParseSchema(): void {
        this.TestParamConfigs = [];
        this.TestParamValues = {};
        if (!this.TestSelectedTool?.InputSchema) return;
        try {
            const schema = JSON.parse(this.TestSelectedTool.InputSchema) as {
                properties?: Record<string, { type?: string | string[]; description?: string; enum?: unknown[] }>;
                required?: string[];
            };
            const required = schema.required ?? [];
            for (const [name, prop] of Object.entries(schema.properties ?? {})) {
                const rawType = prop.type;
                const type = Array.isArray(rawType)
                    ? (rawType.filter(t => t !== 'null')[0] ?? 'string')
                    : (rawType ?? 'string');
                this.TestParamConfigs.push({
                    name, type, description: prop.description ?? '',
                    required: required.includes(name), enumValues: prop.enum ?? []
                });
                this.TestParamValues[name] = '';
            }
            this.TestParamConfigs.sort((a, b) => (a.required === b.required ? 0 : a.required ? -1 : 1));
        } catch (e) {
            console.error('Failed to parse tool schema', e);
        }
    }

    public TestSetParam(name: string, value: string): void {
        this.TestParamValues[name] = value;
    }

    /** @deprecated Use {@link TestSetParam}. */
    public testSetParam(name: string, value: string): void {
      return this.TestSetParam(name, value);
    }

    public get TestIsValid(): boolean {
        return this.TestParamConfigs.filter(p => p.required).every(p => !!this.TestParamValues[p.name]);
    }

    public async TestExecuteTool(): Promise<void> {
        if (!this.TestIsValid || !this.TestToolConnectionID || !this.TestToolID) return;
        this.TestIsExecuting = true;
        this.cdr.detectChanges();

        const inputArgs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(this.TestParamValues)) {
            if (v !== '') inputArgs[k] = v;
        }

        const mutation = gql`
            mutation ExecuteMCPTool($input: ExecuteMCPToolInput!) {
                ExecuteMCPTool(input: $input) { Success ErrorMessage Result DurationMs }
            }
        `;

        try {
            const result = await GraphQLDataProvider.Instance.ExecuteGQL(mutation, {
                input: {
                    ConnectionID: this.TestToolConnectionID,
                    ToolID: this.TestToolID,
                    ToolName: this.TestSelectedTool?.ToolName,
                    InputArgs: JSON.stringify(inputArgs)
                }
            });
            this.TestExecutionResult = result?.ExecuteMCPTool ?? { Success: false, ErrorMessage: 'No result returned' };
        } catch (e) {
            this.TestExecutionResult = { Success: false, ErrorMessage: e instanceof Error ? e.message : String(e) };
        } finally {
            this.TestIsExecuting = false;
            this.TestStep = 'results';
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link TestExecuteTool}. */
    public async testExecuteTool(): Promise<void> {
      return this.TestExecuteTool();
    }

    public TestGoBack(): void {
        this.TestStep = this.TestStep === 'results' ? 'configure' : 'select';
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link TestGoBack}. */
    public testGoBack(): void {
      return this.TestGoBack();
    }

    public TestRunAgain(): void {
        this.TestExecutionResult = null;
        this.TestStep = 'configure';
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link TestRunAgain}. */
    public testRunAgain(): void {
      return this.TestRunAgain();
    }

    public TestCloseDialog(): void {
        this.ShowTestToolDialog = false;
        this.TestStep = 'select';
        this.TestSelectedTool = null;
        this.TestParamConfigs = [];
        this.TestParamValues = {};
        this.TestExecutionResult = null;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link TestCloseDialog}. */
    public testCloseDialog(): void {
      return this.TestCloseDialog();
    }

    public FormatTestResult(result: unknown): string {
        if (result == null) return '';
        if (typeof result === 'string') return result;
        try {
            return JSON.stringify(result, null, 2);
        } catch {
            return String(result);
        }
    }

    /** @deprecated Use {@link FormatTestResult}. */
    public formatTestResult(result: unknown): string {
      return this.FormatTestResult(result);
    }

    /**
     * Part 3.2 — loads a page of tools via the paginated resolver.
     * Uses the same GraphQLDataProvider + gql pattern as testExecuteTool above.
     */
    public async LoadToolsPage(reset: boolean = true): Promise<void> {
        if (this.ToolsLoading) return;
        this.ToolsLoading = true;
        if (reset) {
            this.ToolsSkip = 0;
            this.PagedTools = [];
        }
        try {
            const filters = this.Filters$.value;
            const query = gql`
                query GetMCPToolsPage($skip: Int!, $take: Int!, $searchText: String, $serverID: String, $category: String) {
                    GetMCPToolsPage(skip: $skip, take: $take, searchText: $searchText, serverID: $serverID, category: $category) {
                        items { ID MCPServerID ToolName ToolTitle ToolDescription Status ServerName }
                        totalCount
                        hasMore
                    }
                }
            `;
            const result = await GraphQLDataProvider.Instance.ExecuteGQL(query, {
                skip: this.ToolsSkip,
                take: this.ToolsPageSize,
                searchText: filters.searchTerm || null,
                serverID: (filters.toolsServer && filters.toolsServer !== 'all') ? filters.toolsServer : null,
                category: (filters.toolsCategory && filters.toolsCategory !== 'all') ? filters.toolsCategory : null
            });
            const page = result?.GetMCPToolsPage;
            if (page) {
                this.PagedTools = reset ? page.items : [...this.PagedTools, ...page.items];
                this.ToolsTotalCount = page.totalCount;
                this.ToolsSkip = this.PagedTools.length;
            }
        } catch (e) {
            console.error('[MCPDashboard] loadToolsPage failed:', e);
        } finally {
            this.ToolsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link LoadToolsPage}. */
    public async loadToolsPage(reset: boolean = true): Promise<void> {
      return this.LoadToolsPage(reset);
    }

    public OnToolsScrolledIndexChange(index: number): void {
        if (!this.UseScalablePagination || this.ToolsLoading) return;
        if (this.PagedTools.length >= this.ToolsTotalCount) return;
        if (index + 20 >= this.PagedTools.length) {
            this.LoadToolsPage(false);
        }
    }

    /** @deprecated Use {@link OnToolsScrolledIndexChange}. */
    public onToolsScrolledIndexChange(index: number): void {
      return this.OnToolsScrolledIndexChange(index);
    }

    /** Native-scroll infinite-load: triggers next page when user nears the bottom */
    public OnToolsScrollNative(event: Event): void {
        if (!this.UseScalablePagination || this.ToolsLoading) return;
        if (this.PagedTools.length >= this.ToolsTotalCount) return;
        const el = event.target as HTMLElement;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
            this.LoadToolsPage(false);
        }
    }

    /** @deprecated Use {@link OnToolsScrollNative}. */
    public onToolsScrollNative(event: Event): void {
      return this.OnToolsScrollNative(event);
    }

    public ToggleScalableMode(enabled: boolean): void {
        this.UseScalablePagination = enabled;
        if (enabled && this.PagedTools.length === 0) {
            this.LoadToolsPage(true);
            this.LoadToolCounts();
        }
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleScalableMode}. */
    public toggleScalableMode(enabled: boolean): void {
      return this.ToggleScalableMode(enabled);
    }

    /**
     * Part 3.4 — fetch global + per-server + per-category counts (used for badges
     * and to populate the category filter dropdown). Respects current search filter.
     */
    public async LoadToolCounts(): Promise<void> {
        try {
            const filters = this.Filters$.value;
            const query = gql`
                query GetMCPToolCounts($serverID: String, $searchText: String) {
                    GetMCPToolCounts(serverID: $serverID, searchText: $searchText) {
                        totalCount
                        countByServer { serverID serverName count }
                        countByCategory { category count }
                    }
                }
            `;
            const result = await GraphQLDataProvider.Instance.ExecuteGQL(query, {
                serverID: (filters.toolsServer && filters.toolsServer !== 'all') ? filters.toolsServer : null,
                searchText: filters.searchTerm || null
            });
            const counts = result?.GetMCPToolCounts;
            if (counts) {
                this.ToolsGlobalCount = counts.totalCount;
                this.ToolCountByServer = {};
                (counts.countByServer || []).forEach((r: { serverID: string; count: number }) => {
                    this.ToolCountByServer[r.serverID] = r.count;
                });
                this.ToolsAvailableCategories = (counts.countByCategory || [])
                    .filter((c: { category: string }) => c.category && c.category.length > 0)
                    .sort((a: { category: string }, b: { category: string }) => a.category.localeCompare(b.category));
                // Available servers derived from the servers list (already loaded)
                this.ToolsAvailableServers = this.Servers.map(s => ({ ID: s.ID, Name: s.Name }));
                this.cdr.detectChanges();
            }
        } catch (e) {
            console.warn('[MCPDashboard] loadToolCounts failed:', e);
        }
    }

    /** @deprecated Use {@link LoadToolCounts}. */
    public async loadToolCounts(): Promise<void> {
      return this.LoadToolCounts();
    }

    /** Part 3.4 — returns tool count for a server (falls back to ServerGroups length for legacy view) */
    public GetServerToolCount(serverID: string): number {
        return this.ToolCountByServer[serverID] ?? this.tools.filter(t => UUIDsEqual(t.MCPServerID, serverID)).length;
    }

    /** @deprecated Use {@link GetServerToolCount}. */
    public getServerToolCount(serverID: string): number {
      return this.GetServerToolCount(serverID);
    }

    public TrackPagedTool(_index: number, tool: MCPToolSummary): string {
        return tool.ID;
    }

    /** @deprecated Use {@link TrackPagedTool}. */
    public trackPagedTool(_index: number, tool: MCPToolSummary): string {
      return this.TrackPagedTool(_index, tool);
    }

    /** Part 3.6 — Scale mode display. When a client-side filter (Favorites/Recently-used) is active,
     *  bypass server pagination and filter the fully-loaded local `this.tools` list so the filter
     *  considers ALL tools, not just the current 50-row page. */
    public get VisiblePagedTools(): MCPToolSummary[] {
        const f = this.Filters$.value;
        if (f.favoritesOnly || f.recentOnly) {
            const search = (f.searchTerm || '').toLowerCase();
            const recent = f.recentOnly ? this.RecentToolIDSet() : null;
            return this.tools
                .filter(t => {
                    if (f.favoritesOnly && !this.IsFavorited(t.ID)) return false;
                    if (recent && !recent.has(NormalizeUUID(t.ID))) return false;
                    if (f.toolsServer && f.toolsServer !== 'all' && !UUIDsEqual(t.MCPServerID, f.toolsServer)) return false;
                    if (f.toolsCategory && f.toolsCategory !== 'all') {
                        const idx = t.ToolName.indexOf('_');
                        const cat = idx > 0 ? t.ToolName.substring(0, idx) : t.ToolName;
                        if (cat !== f.toolsCategory) return false;
                    }
                    if (search && !(
                        t.ToolName.toLowerCase().includes(search) ||
                        (t.ToolTitle?.toLowerCase().includes(search) ?? false) ||
                        (t.ToolDescription?.toLowerCase().includes(search) ?? false)
                    )) return false;
                    return true;
                })
                .map(t => ({
                    ID: t.ID,
                    MCPServerID: t.MCPServerID,
                    ToolName: t.ToolName,
                    ToolTitle: t.ToolTitle ?? null,
                    ToolDescription: t.ToolDescription ?? null,
                    Status: t.Status,
                    ServerName: t.ServerName ?? null
                }));
        }
        return this.PagedTools;
    }

    /** @deprecated Use {@link VisiblePagedTools}. */
    public get visiblePagedTools(): MCPToolSummary[] {
      return this.VisiblePagedTools;
    }

    /** Scale-mode denominator. In bypass-pagination mode (favorites/recent filters), the user
     *  sees the fully filtered local list, so the "of N" reflects that filtered total.
     *  Otherwise we show the server-side total for the current query. */
    public ScaleDenominator(): number {
        const f = this.Filters$.value;
        if (f.favoritesOnly || f.recentOnly) {
            return this.VisiblePagedTools.length;
        }
        return this.ToolsTotalCount;
    }

    /** @deprecated Use {@link ScaleDenominator}. */
    public scaleDenominator(): number {
      return this.ScaleDenominator();
    }

    /** Part 3.5 — recently used tool IDs derived from execution logs (dedup, max 5) */
    public get TestRecentToolIDs(): string[] {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const log of this.ExecutionLogs) {
            if (!log.ToolID) continue;
            if (seen.has(log.ToolID)) continue;
            seen.add(log.ToolID);
            out.push(log.ToolID);
            if (out.length >= 5) break;
        }
        return out;
    }

    /** Part 3.5 — Test dialog combobox: filtered tools with recent-first ordering */
    public get TestComboboxTools(): MCPToolData[] {
        const term = this.TestToolSearch.trim().toLowerCase();
        const base = this.TestFilteredTools.filter(t =>
            !term ||
            t.ToolName.toLowerCase().includes(term) ||
            (t.ToolTitle && t.ToolTitle.toLowerCase().includes(term)) ||
            (t.ToolDescription && t.ToolDescription.toLowerCase().includes(term))
        );
        const recentSet = new Set(this.TestRecentToolIDs);
        const recent = base.filter(t => recentSet.has(t.ID));
        const rest = base.filter(t => !recentSet.has(t.ID));
        return [...recent, ...rest];
    }

    public IsRecentTestTool(toolID: string): boolean {
        return this.TestRecentToolIDs.includes(toolID);
    }

    /** @deprecated Use {@link IsRecentTestTool}. */
    public isRecentTestTool(toolID: string): boolean {
      return this.IsRecentTestTool(toolID);
    }

    public OnTestToolSearchChange(value: string): void {
        this.TestToolSearch = value;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnTestToolSearchChange}. */
    public onTestToolSearchChange(value: string): void {
      return this.OnTestToolSearchChange(value);
    }

    public PickTestTool(toolID: string): void {
        this.TestToolID = toolID;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link PickTestTool}. */
    public pickTestTool(toolID: string): void {
      return this.PickTestTool(toolID);
    }

    /**
     * Part 3.6 — load the current user's favorited tool IDs.
     */
    public async LoadFavorites(): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const currentUserID = md.CurrentUser?.ID;
            if (!currentUserID) return;
            // MCPEngine caches MCP: Tool Favorites via BaseEngine CacheLocal — Config() is
            // idempotent, and the cache auto-invalidates on Save/Delete via BaseEntity events,
            // so repeat loads hit the Global Object Store with no DB round-trip.
            await MCPEngine.Instance.Config();
            const userFavorites = MCPEngine.Instance.GetFavoritesByUser(currentUserID);
            this.FavoritedToolIDs = new Set(userFavorites.map(f => NormalizeUUID(f.MCPServerToolID)));
            this.cdr.detectChanges();
        } catch (e) {
            console.warn('[MCPDashboard] loadFavorites failed:', e);
        }
    }

    /** @deprecated Use {@link LoadFavorites}. */
    public async loadFavorites(): Promise<void> {
      return this.LoadFavorites();
    }

    public IsFavorited(toolID: string): boolean {
        return this.FavoritedToolIDs.has(NormalizeUUID(toolID));
    }

    /** @deprecated Use {@link IsFavorited}. */
    public isFavorited(toolID: string): boolean {
      return this.IsFavorited(toolID);
    }

    /** Part 3.3 — set of tool IDs seen in recent execution logs (last N unique). */
    public RecentToolIDSet(): Set<string> {
        const out = new Set<string>();
        for (const log of this.ExecutionLogs) {
            if (log.ToolID) out.add(NormalizeUUID(log.ToolID));
        }
        return out;
    }

    /** @deprecated Use {@link RecentToolIDSet}. */
    public recentToolIDSet(): Set<string> {
      return this.RecentToolIDSet();
    }

    public async ToggleFavorite(toolID: string, event?: Event): Promise<void> {
        if (event) event.stopPropagation();
        const md = this.ProviderToUse;
        const currentUserID = md.CurrentUser?.ID;
        if (!currentUserID) {
            console.warn('[MCPDashboard] toggleFavorite: no current user');
            return;
        }
        const normalizedID = NormalizeUUID(toolID);
        const isFav = this.FavoritedToolIDs.has(normalizedID);
        try {
            if (isFav) {
                // Find the existing favorite in MCPEngine's cache and Delete via the entity —
                // BaseEngine's event-driven cache sync will drop it from _Favorites automatically.
                await MCPEngine.Instance.Config();
                const entity = MCPEngine.Instance.GetFavoriteByUserAndTool(currentUserID, toolID);
                if (!entity) {
                    // Cache says it's missing but UI thought it was favorited — drop from the
                    // local Set so the UI reconciles.
                    this.FavoritedToolIDs.delete(normalizedID);
                } else {
                    const deleted = await entity.Delete();
                    if (!deleted) {
                        console.warn('[MCPDashboard] Delete favorite failed:', entity.LatestResult?.CompleteMessage);
                        return;
                    }
                    this.FavoritedToolIDs.delete(normalizedID);
                }
            } else {
                const entity = await md.GetEntityObject<MJMCPToolFavoriteEntity>('MJ: MCP Tool Favorites');
                entity.NewRecord();
                entity.UserID = currentUserID;
                entity.MCPServerToolID = toolID;
                const saved = await entity.Save();
                if (!saved) {
                    console.warn('[MCPDashboard] Save favorite failed:', entity.LatestResult?.CompleteMessage);
                    return;
                }
                this.FavoritedToolIDs.add(normalizedID);
            }
            // Force a new Set instance so Angular change detection picks it up
            this.FavoritedToolIDs = new Set(this.FavoritedToolIDs);
            this.cdr.detectChanges();
        } catch (e) {
            console.error('[MCPDashboard] toggleFavorite failed:', e);
        }
    }

    /** @deprecated Use {@link ToggleFavorite}. */
    public async toggleFavorite(toolID: string, event?: Event): Promise<void> {
      return this.ToggleFavorite(toolID, event);
    }

    public FormatLogJson(value: string | null | undefined): string {
        if (!value) return '';
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        } catch {
            return value;
        }
    }

    /** @deprecated Use {@link FormatLogJson}. */
    public formatLogJson(value: string | null | undefined): string {
      return this.FormatLogJson(value);
    }

    /**
     * Parse and return input schema as formatted JSON
     */
    public GetFormattedInputSchema(tool: MCPToolData): string {
        if (!tool.InputSchema) return 'No input schema';
        try {
            const schema = JSON.parse(tool.InputSchema);
            return JSON.stringify(schema, null, 2);
        } catch {
            return tool.InputSchema;
        }
    }

    /** @deprecated Use {@link GetFormattedInputSchema}. */
    public getFormattedInputSchema(tool: MCPToolData): string {
      return this.GetFormattedInputSchema(tool);
    }

    /**
     * Get parameter count from input schema
     */
    public GetParamCount(tool: MCPToolData): number {
        if (!tool.InputSchema) return 0;
        try {
            const schema = JSON.parse(tool.InputSchema);
            return Object.keys(schema.properties || {}).length;
        } catch {
            return 0;
        }
    }

    /** @deprecated Use {@link GetParamCount}. */
    public getParamCount(tool: MCPToolData): number {
      return this.GetParamCount(tool);
    }

    /**
     * Get required parameter count from input schema
     */
    public GetRequiredParamCount(tool: MCPToolData): number {
        if (!tool.InputSchema) return 0;
        try {
            const schema = JSON.parse(tool.InputSchema);
            return (schema.required || []).length;
        } catch {
            return 0;
        }
    }

    /** @deprecated Use {@link GetRequiredParamCount}. */
    public getRequiredParamCount(tool: MCPToolData): number {
      return this.GetRequiredParamCount(tool);
    }

    // ========================================
    // Sync Operations
    // ========================================

    /**
     * Syncs tools for a specific connection
     */
    public async SyncConnectionTools(connection: MCPConnectionData): Promise<void> {
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
                // Force refresh to show updated tools - backend changes don't trigger local events
                await this.LoadAllData(true);
            } else if (result.RequiresOAuth || result.RequiresReauthorization) {
                // OAuth authorization is required - initiate fresh OAuth flow with frontend callback
                // Note: We ignore result.AuthorizationUrl because it was built with the server's callback URL
                // We need to initiate a fresh flow that uses the frontend callback URL
                console.log(`[MCPDashboard] OAuth ${result.RequiresReauthorization ? 're-' : ''}authorization required, initiating frontend OAuth flow...`);
                await this.InitiateOAuthFlow(connectionId);
            } else {
                this.ErrorMessage = `Sync failed: ${result.ErrorMessage}`;
            }
        } catch (error) {
            this.ErrorMessage = `Sync error: ${error instanceof Error ? error.message : String(error)}`;
        }

        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link SyncConnectionTools}. */
    public async syncConnectionTools(connection: MCPConnectionData): Promise<void> {
      return this.SyncConnectionTools(connection);
    }

    /**
     * Gets the sync state for a connection
     */
    public GetSyncState(connectionId: string): MCPSyncState | undefined {
        return this.SyncStates.get(connectionId);
    }

    /** @deprecated Use {@link GetSyncState}. */
    public getSyncState(connectionId: string): MCPSyncState | undefined {
      return this.GetSyncState(connectionId);
    }

    /**
     * Checks if a connection is currently syncing
     */
    public IsSyncing(connectionId: string): boolean {
        return this.mcpToolsService.isSyncing(connectionId);
    }

    /** @deprecated Use {@link IsSyncing}. */
    public isSyncing(connectionId: string): boolean {
      return this.IsSyncing(connectionId);
    }

    /**
     * Gets sync progress message for a connection
     */
    public GetSyncProgressMessage(connectionId: string): string {
        const state = this.SyncStates.get(connectionId);
        if (!state?.progress) return '';
        return state.progress.message;
    }

    /** @deprecated Use {@link GetSyncProgressMessage}. */
    public getSyncProgressMessage(connectionId: string): string {
      return this.GetSyncProgressMessage(connectionId);
    }

    // ========================================
    // OAuth Operations
    // ========================================

    /**
     * Checks for OAuth completion by looking for query params set by the OAuth callback
     */
    private checkOAuthCompletion(): void {
        const params = this.GetQueryParams();

        if (params['oauth'] === 'success') {
            // OAuth completed successfully
            const connectionId = params['connectionId'];
            console.log(`[MCPDashboard] OAuth authorization completed for connection: ${connectionId}`);

            // Show success notification
            this.showSuccessNotification('OAuth authorization completed successfully');

            // Clear the OAuth query params, preserving the tab param
            this.UpdateQueryParams({ oauth: null, connectionId: null, error: null, error_description: null });

            // Refresh data to pick up new OAuth state
            this.LoadAllData(true);
        } else if (params['oauth'] === 'error') {
            // OAuth failed
            const errorMessage = params['error_description'] || 'Authorization failed';
            console.error(`[MCPDashboard] OAuth authorization failed: ${params['error'] ?? 'unknown_error'} - ${errorMessage}`);

            // Show error message
            this.ErrorMessage = `OAuth authorization failed: ${errorMessage}`;

            // Clear the OAuth query params
            this.UpdateQueryParams({ oauth: null, connectionId: null, error: null, error_description: null });
        }
    }

    /**
     * Shows a success notification (temporary)
     */
    private showSuccessNotification(message: string): void {
        // For now, use a simple console log and clear any error message
        console.log(`[MCPDashboard] Success: ${message}`);
        this.ErrorMessage = null;
        // TODO: Implement proper toast/notification system
    }

    /**
     * Initiates OAuth authorization flow for a connection.
     * Stores the current URL and redirects directly to the OAuth provider.
     * Always uses the frontend callback URL so the OAuth redirect comes back to MJExplorer.
     *
     * @param connectionId - The MCP connection ID requiring OAuth
     */
    public async InitiateOAuthFlow(connectionId: string): Promise<void> {
        // Store current URL for return after OAuth completion
        // Store both full URL and path-only version for cross-origin scenarios
        const currentUrl = window.location.href;
        const currentPath = window.location.pathname + window.location.search;

        // Store in both localStorage and sessionStorage for redundancy
        localStorage.setItem('oauth_return_url', currentUrl);
        localStorage.setItem('oauth_return_path', currentPath);
        sessionStorage.setItem('oauth_return_url', currentUrl);
        sessionStorage.setItem('oauth_return_path', currentPath);

        console.log('[MCPDashboard] Stored OAuth return URL:', currentUrl);
        console.log('[MCPDashboard] Stored OAuth return path:', currentPath);

        // Initiate OAuth via GraphQL to get the URL with frontend callback
        const result = await this.initiateMCPOAuth(connectionId);
        if (result.Success && result.AuthorizationUrl) {
            console.log('[MCPDashboard] Redirecting to OAuth provider:', result.AuthorizationUrl);
            window.location.href = result.AuthorizationUrl;
        } else {
            this.ErrorMessage = result.ErrorMessage || 'Failed to initiate OAuth authorization';
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link InitiateOAuthFlow}. */
    public async initiateOAuthFlow(connectionId: string): Promise<void> {
      return this.InitiateOAuthFlow(connectionId);
    }

    /**
     * Calls the InitiateMCPOAuth mutation with frontend callback URL
     */
    private async initiateMCPOAuth(connectionId: string): Promise<{
        Success: boolean;
        AuthorizationUrl?: string;
        ErrorMessage?: string;
    }> {
        try {
            const { GraphQLDataProvider, gql } = await import('@memberjunction/graphql-dataprovider');

            const mutation = gql`
                mutation InitiateMCPOAuth($input: InitiateMCPOAuthInput!) {
                    InitiateMCPOAuth(input: $input) {
                        Success
                        ErrorMessage
                        AuthorizationUrl
                        StateParameter
                    }
                }
            `;

            // Use the frontend callback URL so we handle the OAuth redirect
            const frontendCallbackUrl = `${window.location.origin}/oauth/callback`;

            const result = await GraphQLDataProvider.Instance.ExecuteGQL(mutation, {
                input: {
                    ConnectionID: connectionId,
                    FrontendCallbackUrl: frontendCallbackUrl
                }
            });

            return result?.InitiateMCPOAuth || { Success: false, ErrorMessage: 'No result returned' };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { Success: false, ErrorMessage: message };
        }
    }

    // ========================================
    // Utility Methods
    // ========================================

    public GetStatusClass(status: string): string {
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

    /** @deprecated Use {@link GetStatusClass}. */
    public getStatusClass(status: string): string {
      return this.GetStatusClass(status);
    }

    public GetTransportIcon(transportType: string): string {
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

    /** @deprecated Use {@link GetTransportIcon}. */
    public getTransportIcon(transportType: string): string {
      return this.GetTransportIcon(transportType);
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

    // ========================================
    // Logs Sorting
    // ========================================

    /**
     * Handles click on a sortable column header
     */
    public OnLogSortColumn(column: typeof this.LogsSortColumn): void {
        if (this.LogsSortColumn === column) {
            // Toggle sort direction
            this.LogsSortAscending = !this.LogsSortAscending;
        } else {
            // New column, default to descending for dates/duration, ascending for text
            this.LogsSortColumn = column;
            this.LogsSortAscending = column !== 'started' && column !== 'duration';
        }
        this.sortFilteredLogs();
        this.cdr.detectChanges();
        this.saveUserPreferencesDebounced();
    }

    /** @deprecated Use {@link OnLogSortColumn}. */
    public onLogSortColumn(column: typeof this.LogsSortColumn): void {
      return this.OnLogSortColumn(column);
    }

    /**
     * Sorts the filtered logs based on current sort settings
     */
    private sortFilteredLogs(): void {
        const direction = this.LogsSortAscending ? 1 : -1;

        this.FilteredLogs.sort((a, b) => {
            let valA: string | number | Date | null;
            let valB: string | number | Date | null;

            switch (this.LogsSortColumn) {
                case 'status':
                    valA = a.Status || '';
                    valB = b.Status || '';
                    break;
                case 'server':
                    valA = a.ServerName || '';
                    valB = b.ServerName || '';
                    break;
                case 'tool':
                    valA = a.ToolName || '';
                    valB = b.ToolName || '';
                    break;
                case 'connection':
                    valA = a.ConnectionName || '';
                    valB = b.ConnectionName || '';
                    break;
                case 'started':
                    valA = a.StartedAt ? new Date(a.StartedAt).getTime() : 0;
                    valB = b.StartedAt ? new Date(b.StartedAt).getTime() : 0;
                    break;
                case 'duration':
                    valA = a.DurationMs ?? -1;
                    valB = b.DurationMs ?? -1;
                    break;
                case 'error':
                    valA = a.ErrorMessage || '';
                    valB = b.ErrorMessage || '';
                    break;
                default:
                    return 0;
            }

            if (typeof valA === 'string' && typeof valB === 'string') {
                return valA.localeCompare(valB) * direction;
            }
            if (valA < valB) return -1 * direction;
            if (valA > valB) return 1 * direction;
            return 0;
        });
    }

    /**
     * Gets the sort indicator class for a column header
     */
    public GetLogSortClass(column: typeof this.LogsSortColumn): string {
        if (this.LogsSortColumn !== column) return '';
        return this.LogsSortAscending ? 'sorted-asc' : 'sorted-desc';
    }

    /** @deprecated Use {@link GetLogSortClass}. */
    public getLogSortClass(column: typeof this.LogsSortColumn): string {
      return this.GetLogSortClass(column);
    }

    // ========================================
    // Log Detail Panel
    // ========================================

    /**
     * Handles click on a log row to show detail panel
     */
    public async OnLogClick(log: MCPExecutionLogData): Promise<void> {
        // Load full log details if needed (InputArgs, Result)
        if (!log.InputArgs && !log.Result) {
            try {
                const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                const result = await rv.RunView<MJMCPToolExecutionLogEntity>({
                    EntityName: 'MJ: MCP Tool Execution Logs',
                    ExtraFilter: `ID='${log.ID}'`,
                    ResultType: 'simple'
                });
                if (result.Success && result.Results.length > 0) {
                    const fullLog = this.mapLogFromDatabase(result.Results[0]);
                    // Merge full log data (preserving already enriched fields)
                    log.InputArgs = fullLog.InputArgs;
                    log.Result = fullLog.Result;
                    log.ErrorMessage = fullLog.ErrorMessage || log.ErrorMessage;
                }
            } catch (error) {
                console.warn('[MCPDashboard] Failed to load full log details:', error);
            }
        }

        // Enrich with server name
        const connection = this.Connections.find(c => UUIDsEqual(c.ID, log.ConnectionID));
        if (connection) {
            log.ServerName = connection.ServerName;
        }

        this.SelectedLog = log;
        this.ShowLogDetailPanel = true;
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnLogClick}. */
    public async onLogClick(log: MCPExecutionLogData): Promise<void> {
      return this.OnLogClick(log);
    }

    /**
     * Closes the log detail panel
     */
    public OnLogDetailClose(): void {
        this.ShowLogDetailPanel = false;
        this.SelectedLog = null;
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnLogDetailClose}. */
    public onLogDetailClose(): void {
      return this.OnLogDetailClose();
    }

    /**
     * Handles run again from log detail panel
     */
    public OnRunAgainFromLog(event: { toolId: string; connectionId: string }): void {
        this.ShowLogDetailPanel = false;
        this.SelectedLog = null;

        // Open test tool dialog with pre-selected tool and connection
        const tool = this.tools.find(t => UUIDsEqual(t.ID, event.toolId));
        const connection = this.Connections.find(c => UUIDsEqual(c.ID, event.connectionId));

        if (tool) {
            this.TestToolServerID = tool.MCPServerID;
            this.TestToolID = tool.ID;
        }
        if (connection) {
            this.TestToolConnectionID = connection.ID;
        }

        this.ShowTestToolDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnRunAgainFromLog}. */
    public onRunAgainFromLog(event: { toolId: string; connectionId: string }): void {
      return this.OnRunAgainFromLog(event);
    }

    // ========================================
    // Expandable Server/Connection Cards
    // ========================================

    /**
     * Toggles server card expansion
     */
    public ToggleServerExpand(server: MCPServerData): void {
        if (UUIDsEqual(this.ExpandedServerID, server.ID)) {
            this.ExpandedServerID = null;
        } else {
            this.ExpandedServerID = server.ID;
            // Collapse any expanded connection
            this.ExpandedConnectionID = null;
        }
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleServerExpand}. */
    public toggleServerExpand(server: MCPServerData): void {
      return this.ToggleServerExpand(server);
    }

    /**
     * Toggles connection card expansion
     */
    public ToggleConnectionExpand(conn: MCPConnectionData): void {
        if (UUIDsEqual(this.ExpandedConnectionID, conn.ID)) {
            this.ExpandedConnectionID = null;
        } else {
            this.ExpandedConnectionID = conn.ID;
            // Collapse any expanded server
            this.ExpandedServerID = null;
        }
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ToggleConnectionExpand}. */
    public toggleConnectionExpand(conn: MCPConnectionData): void {
      return this.ToggleConnectionExpand(conn);
    }

    /**
     * Checks if a server card is expanded
     */
    public IsServerExpanded(server: MCPServerData): boolean {
        return UUIDsEqual(this.ExpandedServerID, server.ID);
    }

    /** @deprecated Use {@link IsServerExpanded}. */
    public isServerExpanded(server: MCPServerData): boolean {
      return this.IsServerExpanded(server);
    }

    /**
     * Checks if a connection card is expanded
     */
    public IsConnectionExpanded(conn: MCPConnectionData): boolean {
        return UUIDsEqual(this.ExpandedConnectionID, conn.ID);
    }

    /** @deprecated Use {@link IsConnectionExpanded}. */
    public isConnectionExpanded(conn: MCPConnectionData): boolean {
      return this.IsConnectionExpanded(conn);
    }

    /**
     * Partition `this.tools` into the {@link toolsByServerID} index, keyed by the
     * normalized MCPServerID. Called once whenever tools/connections load so the
     * server/connection card `@for` blocks read tools via an O(1) Map lookup instead
     * of re-filtering the whole tools array on every change-detection pass.
     */
    private buildToolsByServerMap(): void {
        const map = new Map<string, MCPToolData[]>();
        for (const tool of this.tools) {
            const key = NormalizeUUID(tool.MCPServerID);
            const bucket = map.get(key);
            if (bucket) {
                bucket.push(tool);
            } else {
                map.set(key, [tool]);
            }
        }
        this.toolsByServerID = map;
    }

    /**
     * Gets tools for a specific server (O(1) lookup against the precomputed index).
     */
    public GetToolsForServer(serverId: string): MCPToolData[] {
        return this.toolsByServerID.get(NormalizeUUID(serverId)) ?? [];
    }

    /** @deprecated Use {@link GetToolsForServer}. */
    public getToolsForServer(serverId: string): MCPToolData[] {
      return this.GetToolsForServer(serverId);
    }

    /**
     * Gets tools for a specific connection (via its server, O(1) lookup).
     */
    public GetToolsForConnection(connectionId: string): MCPToolData[] {
        const connection = this.Connections.find(c => UUIDsEqual(c.ID, connectionId));
        if (!connection) return [];
        return this.toolsByServerID.get(NormalizeUUID(connection.MCPServerID)) ?? [];
    }

    /** @deprecated Use {@link GetToolsForConnection}. */
    public getToolsForConnection(connectionId: string): MCPToolData[] {
      return this.GetToolsForConnection(connectionId);
    }

    /**
     * Opens test tool dialog with a specific tool from expanded card
     */
    public RunToolFromCard(tool: MCPToolData, connection?: MCPConnectionData): void {
        this.TestToolServerID = tool.MCPServerID;
        this.TestToolID = tool.ID;
        this.TestToolConnectionID = connection?.ID ?? null;
        this.ShowTestToolDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link RunToolFromCard}. */
    public runToolFromCard(tool: MCPToolData, connection?: MCPConnectionData): void {
      return this.RunToolFromCard(tool, connection);
    }
}
