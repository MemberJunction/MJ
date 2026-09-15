import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJDashboardEntity, MJDashboardCategoryEntity, MJDashboardPartTypeEntity, DashboardEngine, DashboardUserPermissions, MJDashboardCategoryLinkEntity, MJDashboardPermissionEntity } from '@memberjunction/core-entities';
import { ShareDialogResult } from './dashboard-share-dialog.component';
import {
    BuildDashboardBrowserAgentContext,
    IsValidBrowserViewMode,
    OpenedDashboardPanelSummary,
} from './dashboard-browser-agent-context';
import {
    AgentToolResult,
    ValidateStringParam,
} from '../shared/agent-tool-validation';
import {
    DashboardViewerComponent,
    DashboardNavRequestEvent,
    PanelInteractionEvent,
    AddPanelResult,
    createDefaultDashboardConfig,
    extractPanelsFromLayout,
    DashboardConfig,
    DashboardPanel,
    EditPartDialogResult,
    // Browser event types from generic component
    DashboardOpenEvent,
    DashboardEditEvent,
    DashboardDeleteEvent,
    DashboardMoveEvent,
    DashboardCreateEvent,
    CategoryCreateEvent,
    CategoryDeleteEvent,
    CategoryChangeEvent,
    ViewPreferenceChangeEvent,
    DashboardBrowserViewMode,
    BreadcrumbNavigateEvent
} from '@memberjunction/ng-dashboard-viewer';
/**
 * Mode for the dashboard browser
 */
type BrowserMode = 'list' | 'view' | 'edit';

/**
 * Local shape for an agent client tool. Matches the inline array type that
 * `NavigationService.SetAgentClientTools` accepts, so the mode-scoped tool
 * builders can compose typed `AgentClientTool[]` arrays without `any`.
 */
interface AgentClientTool {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Tolerant result shape for the read-only DETAIL tools, which return a data
 * payload on success. Extends the shared {@link AgentToolResult} (Success /
 * ErrorMessage) with an optional `Data` object. Kept local to DashboardBrowser
 * (the shared validation module is intentionally not modified).
 */
type AgentToolDataResult = AgentToolResult & { Data?: Record<string, unknown> };

/**
 * Resource component for browsing, creating, and editing dashboards.
 * Uses the generic DashboardBrowserComponent for list mode and handles
 * view/edit mode internally with routing integration.
 */
@RegisterClass(BaseResourceComponent, 'DashboardBrowserResource')
@Component({
  standalone: false,
    selector: 'mj-dashboard-browser-resource',
    templateUrl: './dashboard-browser-resource.component.html',
    styleUrls: ['./dashboard-browser-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardBrowserResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    // ========================================
    // State
    // ========================================

    public Mode: BrowserMode = 'list';

    /** @deprecated Use {@link Mode}. */
    public get mode(): BrowserMode {
      return this.Mode;
    }
    /** @deprecated Use {@link Mode}. */
    public set mode(value: BrowserMode) {
      this.Mode = value;
    }
    public isLoading = false;
    public Dashboards: MJDashboardEntity[] = [];

    /** @deprecated Use {@link Dashboards}. */
    public get dashboards(): MJDashboardEntity[] {
      return this.Dashboards;
    }
    /** @deprecated Use {@link Dashboards}. */
    public set dashboards(value: MJDashboardEntity[]) {
      this.Dashboards = value;
    }
    public Categories: MJDashboardCategoryEntity[] = [];

    /** @deprecated Use {@link Categories}. */
    public get categories(): MJDashboardCategoryEntity[] {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value: MJDashboardCategoryEntity[]) {
      this.Categories = value;
    }
    public SelectedDashboard: MJDashboardEntity | null = null;

    /** @deprecated Use {@link SelectedDashboard}. */
    public get selectedDashboard(): MJDashboardEntity | null {
      return this.SelectedDashboard;
    }
    /** @deprecated Use {@link SelectedDashboard}. */
    public set selectedDashboard(value: MJDashboardEntity | null) {
      this.SelectedDashboard = value;
    }
    public SelectedCategoryId: string | null = null;

    /** @deprecated Use {@link SelectedCategoryId}. */
    public get selectedCategoryId(): string | null {
      return this.SelectedCategoryId;
    }
    /** @deprecated Use {@link SelectedCategoryId}. */
    public set selectedCategoryId(value: string | null) {
      this.SelectedCategoryId = value;
    }
    public ViewMode: DashboardBrowserViewMode = 'cards';

    /** @deprecated Use {@link ViewMode}. */
    public get viewMode(): DashboardBrowserViewMode {
      return this.ViewMode;
    }
    /** @deprecated Use {@link ViewMode}. */
    public set viewMode(value: DashboardBrowserViewMode) {
      this.ViewMode = value;
    }
    public ShowAddPanelDialog = false;

    /** @deprecated Use {@link ShowAddPanelDialog}. */
    public get showAddPanelDialog() {
      return this.ShowAddPanelDialog;
    }
    /** @deprecated Use {@link ShowAddPanelDialog}. */
    public set showAddPanelDialog(value) {
      this.ShowAddPanelDialog = value;
    }

    /**
     * Free-text search the agent has applied to the dashboard list (via the
     * SearchDashboards tool). Reported in the agent context so the agent knows
     * how the visible list is currently narrowed; cleared by ClearDashboardFilters.
     */
    private agentSearchText = '';

    /**
     * Which tool-set ('list' vs 'open') is currently registered with the agent.
     * The Dashboard Browser exposes different tools depending on whether the user
     * is browsing the list or has a dashboard open (mirrors the Data Explorer's
     * mode-scoped tools). We only re-register on the flip — see
     * {@link syncAgentToolsForMode}.
     */
    private lastRegisteredToolMode: 'list' | 'open' | null = null;

    // Config dialog state
    public ShowConfigDialog = false;

    /** @deprecated Use {@link ShowConfigDialog}. */
    public get showConfigDialog() {
      return this.ShowConfigDialog;
    }
    /** @deprecated Use {@link ShowConfigDialog}. */
    public set showConfigDialog(value) {
      this.ShowConfigDialog = value;
    }
    public ConfigDialogPanel: DashboardPanel | null = null;

    /** @deprecated Use {@link ConfigDialogPanel}. */
    public get configDialogPanel(): DashboardPanel | null {
      return this.ConfigDialogPanel;
    }
    /** @deprecated Use {@link ConfigDialogPanel}. */
    public set configDialogPanel(value: DashboardPanel | null) {
      this.ConfigDialogPanel = value;
    }
    public ConfigDialogPartType: MJDashboardPartTypeEntity | null = null;

    /** @deprecated Use {@link ConfigDialogPartType}. */
    public get configDialogPartType(): MJDashboardPartTypeEntity | null {
      return this.ConfigDialogPartType;
    }
    /** @deprecated Use {@link ConfigDialogPartType}. */
    public set configDialogPartType(value: MJDashboardPartTypeEntity | null) {
      this.ConfigDialogPartType = value;
    }
    public ConfigDialogClass: string = '';

    /** @deprecated Use {@link ConfigDialogClass}. */
    public get configDialogClass(): string {
      return this.ConfigDialogClass;
    }
    /** @deprecated Use {@link ConfigDialogClass}. */
    public set configDialogClass(value: string) {
      this.ConfigDialogClass = value;
    }

    // Confirm dialog state
    public ShowConfirmDialog = false;

    /** @deprecated Use {@link ShowConfirmDialog}. */
    public get showConfirmDialog() {
      return this.ShowConfirmDialog;
    }
    /** @deprecated Use {@link ShowConfirmDialog}. */
    public set showConfirmDialog(value) {
      this.ShowConfirmDialog = value;
    }
    public ConfirmPanelId: string = '';

    /** @deprecated Use {@link ConfirmPanelId}. */
    public get confirmPanelId(): string {
      return this.ConfirmPanelId;
    }
    /** @deprecated Use {@link ConfirmPanelId}. */
    public set confirmPanelId(value: string) {
      this.ConfirmPanelId = value;
    }
    public ConfirmPanelTitle: string = '';

    /** @deprecated Use {@link ConfirmPanelTitle}. */
    public get confirmPanelTitle(): string {
      return this.ConfirmPanelTitle;
    }
    /** @deprecated Use {@link ConfirmPanelTitle}. */
    public set confirmPanelTitle(value: string) {
      this.ConfirmPanelTitle = value;
    }

    // Share dialog state
    public ShowShareDialog = false;

    /** @deprecated Use {@link ShowShareDialog}. */
    public get showShareDialog() {
      return this.ShowShareDialog;
    }
    /** @deprecated Use {@link ShowShareDialog}. */
    public set showShareDialog(value) {
      this.ShowShareDialog = value;
    }

    // Edit mode state for name/description
    public EditingName = '';

    /** @deprecated Use {@link EditingName}. */
    public get editingName() {
      return this.EditingName;
    }
    /** @deprecated Use {@link EditingName}. */
    public set editingName(value) {
      this.EditingName = value;
    }
    public EditingDescription = '';

    /** @deprecated Use {@link EditingDescription}. */
    public get editingDescription() {
      return this.EditingDescription;
    }
    /** @deprecated Use {@link EditingDescription}. */
    public set editingDescription(value) {
      this.EditingDescription = value;
    }
    private originalName = '';
    private originalDescription = '';
    private originalConfig = '';

    // Permission state for selected dashboard
    public SelectedDashboardPermissions: DashboardUserPermissions = {
        DashboardID: '',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: true,
        IsOwner: true,
        PermissionSource: 'owner'
    };

    /** @deprecated Use {@link SelectedDashboardPermissions}. */
    public get selectedDashboardPermissions(): DashboardUserPermissions {
      return this.SelectedDashboardPermissions;
    }
    /** @deprecated Use {@link SelectedDashboardPermissions}. */
    public set selectedDashboardPermissions(value: DashboardUserPermissions) {
      this.SelectedDashboardPermissions = value;
    }

    // Permission map for all dashboards (used by browser component)
    public DashboardPermissionsMap: Map<string, DashboardUserPermissions> = new Map();

    /** @deprecated Use {@link DashboardPermissionsMap}. */
    public get dashboardPermissionsMap(): Map<string, DashboardUserPermissions> {
      return this.DashboardPermissionsMap;
    }
    /** @deprecated Use {@link DashboardPermissionsMap}. */
    public set dashboardPermissionsMap(value: Map<string, DashboardUserPermissions>) {
      this.DashboardPermissionsMap = value;
    }

    // Effective category map for shared dashboards (maps dashboard ID to effective category for display)
    public EffectiveCategoryMap: Map<string, string | null> = new Map();

    /** @deprecated Use {@link EffectiveCategoryMap}. */
    public get effectiveCategoryMap(): Map<string, string | null> {
      return this.EffectiveCategoryMap;
    }
    /** @deprecated Use {@link EffectiveCategoryMap}. */
    public set effectiveCategoryMap(value: Map<string, string | null>) {
      this.EffectiveCategoryMap = value;
    }

    // Query params that arrived before the dashboard list finished loading (cold
    // load / deep link / pin navigation). Applied once loadDashboards() completes.
    private _pendingQueryParams: Record<string, string> | null = null;

    @ViewChild('dashboardViewer') dashboardViewer!: DashboardViewerComponent;

    // ========================================
    // Constructor
    // ========================================

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        super.ngOnInit();
        // super.ngOnInit() wires up the query-param delivery. Any deep-link/pin params
        // that arrive before loadDashboards() finishes are captured by OnQueryParamsChanged
        // into _pendingQueryParams and applied once the dashboard list is available.
        this.loadDashboards();
        this.loadViewPreference();
        this.syncAgentToolsForMode();
        this.emitAgentContext();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    // ========================================
    // Query-Param Round-Trip (back/forward, deep links, Home pins)
    // ========================================

    /**
     * React to query-param changes from browser back/forward, deep links, and Home
     * pin navigation. Driven by BaseResourceComponent's reactive tab-param stream,
     * which reaches this component even when it's cached/detached — the path the old
     * ActivatedRoute subscription could not reliably cover.
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        // Category is a cheap assignment with no list lookup — apply it eagerly either way.
        this.SelectedCategoryId = params['category'] || null;

        if (params['dashboard'] && this.Dashboards.length === 0) {
            // List not loaded yet — defer the dashboard selection until it is.
            this._pendingQueryParams = params;
            this.cdr.detectChanges();
            return;
        }
        this.applyDashboardSelectionFromParams(params);
    }

    /**
     * Open/close the dashboard to match the `dashboard` query param. Requires the
     * dashboard list to be loaded. URL pushes from openDashboard()/backToList() are
     * auto-suppressed while delivering, so this reflects URL → state without looping.
     */
    private applyDashboardSelectionFromParams(params: Record<string, string>): void {
        const dashboardId = params['dashboard'] || null;
        const currentDashboardId = this.SelectedDashboard?.ID || null;
        if (dashboardId === currentDashboardId) {
            this.cdr.detectChanges();
            return;
        }

        if (dashboardId) {
            const dashboard = this.Dashboards.find(d => UUIDsEqual(d.ID, dashboardId));
            if (dashboard) {
                this.OpenDashboard(dashboard);
            }
        } else {
            this.BackToList();
        }
    }

    // ========================================
    // BaseResourceComponent Implementation
    // ========================================

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Dashboards';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-gauge-high';
    }

    // ========================================
    // Agent Context & Client Tools
    //
    // 🔒 SAFETY BOUNDARY: the Dashboard Browser exposes ONLY read-only /
    // navigational tools to the AI agent. The tool-set is MODE-SCOPED (mirrors
    // the Data Explorer):
    //   COMMON (both modes): SearchDashboards, OpenDashboard (by name/id —
    //     still useful while viewing, to switch dashboards), RefreshDashboardList.
    //   LIST mode only: SelectCategory, FilterByCategory, ClearDashboardFilters,
    //     SwitchViewMode.
    //   OPEN mode only (a dashboard is open): BackToList, GetDashboardPanels,
    //     GetDashboardDetail.
    //   READ-ONLY DETAIL (registered in both modes alongside the above):
    //     GetCategoryHierarchy, GetDashboardShares (and GetDashboardDetail).
    //
    // Mutating operations — create / delete / save / share / move a dashboard,
    // create / delete a category, add / remove / configure a panel — are
    // intentionally NOT exposed. The agent helps the user find, open, and
    // understand dashboards (including the panels on the open one, its owner,
    // dates, access level, the category tree, and who it's shared with); the
    // user performs every mutation from the UI. Do NOT add a mutating tool here
    // without revisiting this boundary.
    // ========================================

    /**
     * Report the current browser state to the AI agent (async chat agent and
     * realtime co-agent). Re-emit whenever mode, selection, category filter,
     * view mode, or loading state changes.
     */
    private emitAgentContext(): void {
        // Keep the registered tool-set aligned with the current mode before we
        // publish context, so the agent's tool manifest and context agree.
        this.syncAgentToolsForMode();

        const selectedCategory = this.SelectedCategoryId
            ? this.Categories.find(c => UUIDsEqual(c.ID, this.SelectedCategoryId!)) ?? null
            : null;

        const dashboardOpen = this.Mode !== 'list' && this.SelectedDashboard !== null;

        this.navigationService.SetAgentContext(this, BuildDashboardBrowserAgentContext({
            Mode: this.Mode,
            SelectedDashboardId: this.SelectedDashboard?.ID ?? null,
            SelectedDashboardName: this.SelectedDashboard?.Name ?? null,
            VisibleDashboardNames: this.Dashboards.map(d => d.Name || '(untitled)'),
            TotalDashboardCount: this.totalAccessibleDashboardCount,
            FilteredDashboardCount: this.Dashboards.length,
            SearchText: this.agentSearchText,
            AvailableCategoryNames: this.Categories.map(c => c.Name),
            SelectedCategoryId: this.SelectedCategoryId,
            SelectedCategoryName: selectedCategory?.Name ?? null,
            ViewMode: this.ViewMode,
            IsLoading: this.isLoading,
            // Opened-dashboard awareness (only meaningful when a dashboard is open)
            OpenedDashboardName: dashboardOpen ? (this.SelectedDashboard?.Name ?? null) : null,
            OpenedDashboardId: dashboardOpen ? (this.SelectedDashboard?.ID ?? null) : null,
            OpenedDashboardIsEditing: this.Mode === 'edit',
            OpenedDashboardCanEdit: dashboardOpen ? this.SelectedDashboardPermissions.CanEdit : false,
            OpenedDashboardPanels: dashboardOpen ? this.readOpenedDashboardPanels() : [],
        }));
    }

    /**
     * Read the panels/widgets on the currently-open dashboard from the viewer.
     *
     * The viewer holds the live `DashboardConfig` whose `layout` embeds each
     * panel in Golden Layout's componentState; {@link extractPanelsFromLayout}
     * pulls them out. We resolve each panel's part-type name via the viewer's
     * `getPartTypeForPanel`. Tolerant by design — if the viewer isn't mounted
     * yet (e.g. context emitted before @ViewChild resolves) we return an empty
     * list rather than throwing.
     *
     * @returns a descriptive panel summary list (never null)
     */
    private readOpenedDashboardPanels(): OpenedDashboardPanelSummary[] {
        const viewer = this.dashboardViewer;
        if (!viewer) return [];

        try {
            const config = viewer.getConfig();
            const panels = extractPanelsFromLayout(config?.layout ?? null);
            return panels.map(panel => {
                const partType = viewer.getPartTypeForPanel(panel.id);
                const summary: OpenedDashboardPanelSummary = {
                    Title: panel.title || '(untitled panel)',
                    PartTypeName: partType?.Name || panel.config?.type || 'Unknown',
                };
                const icon = panel.icon || partType?.Icon || undefined;
                if (icon) {
                    summary.Icon = icon;
                }
                return summary;
            });
        } catch {
            // Reading panels is best-effort; never let it break context emission.
            return [];
        }
    }

    /**
     * The total number of dashboards accessible to the current user, independent
     * of any in-memory search narrowing the agent has applied. `this.dashboards`
     * shrinks when SearchDashboards filters it, so we read the unfiltered count
     * straight from the engine to keep TotalDashboardCount honest.
     */
    private get totalAccessibleDashboardCount(): number {
        const md = this.ProviderToUse;
        return DashboardEngine.Instance.GetAccessibleDashboards(md.CurrentUser.ID).length;
    }

    /**
     * Re-register the agent client tools when the effective tool-mode flips.
     *
     * The Dashboard Browser surfaces different tools depending on whether the
     * user is browsing the list ('list') or has a dashboard open ('open' — the
     * view/edit modes collapse to one tool-mode here). We compute the effective
     * mode, and only when it differs from {@link lastRegisteredToolMode} do we
     * call `SetAgentClientTools` with `[...common, ...(list ? list : open)]`.
     * Guarding on the flip avoids re-registering on every context emission.
     *
     * Mirrors the Data Explorer's mode-scoped tool approach.
     */
    private syncAgentToolsForMode(): void {
        const effective: 'list' | 'open' = this.Mode === 'list' ? 'list' : 'open';
        if (effective === this.lastRegisteredToolMode) {
            return;
        }
        this.lastRegisteredToolMode = effective;

        const scoped = effective === 'list' ? this.listModeTools() : this.openModeTools();
        this.navigationService.SetAgentClientTools(this, [...this.commonTools(), ...scoped]);
    }

    /**
     * Tools available in BOTH modes — find, switch to, and reload dashboards.
     * OpenDashboard stays available while viewing so the agent can switch to
     * another dashboard without first going back to the list.
     */
    private commonTools(): AgentClientTool[] {
        return [
            {
                Name: 'SearchDashboards',
                Description: 'Search/filter the dashboard list by a text query matching dashboard name or description.',
                ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = ValidateStringParam(params['query'], 'query');
                    if (!v.ok) return v.result;
                    return this.agentSearchDashboards(v.value);
                },
            },
            {
                Name: 'OpenDashboard',
                Description: 'Open a dashboard for viewing (inline). Accepts either the dashboard NAME (as listed in VisibleDashboards) or its ID. Works from the list and while another dashboard is open (to switch).',
                ParameterSchema: { type: 'object', properties: { dashboard: { type: 'string', description: 'The dashboard name or ID to open.' }, dashboardId: { type: 'string', description: 'Deprecated alias for "dashboard" — the dashboard ID.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = ValidateStringParam(params['dashboard'] ?? params['dashboardId'], 'dashboard');
                    if (!v.ok) return v.result;
                    return this.agentOpenDashboard(v.value);
                },
            },
            {
                Name: 'RefreshDashboardList',
                Description: 'Reload the list of dashboards and categories from the server.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async (): Promise<AgentToolResult> => {
                    // loadDashboards() rebuilds the full list, so any prior agent
                    // search no longer applies — clear the tracked search text.
                    this.agentSearchText = '';
                    await this.loadDashboards();
                    this.emitAgentContext();
                    return { Success: true };
                },
            },
            {
                Name: 'GetCategoryHierarchy',
                Description: 'Get the dashboard category tree the user can access — each category\'s name, ID, parent ID, and the number of accessible dashboards filed directly under it. Read-only.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async (): Promise<AgentToolResult> => this.agentGetCategoryHierarchy(),
            },
            {
                Name: 'GetDashboardShares',
                Description: 'List who a dashboard is shared with and their access level (read/edit/delete/share). Defaults to the open dashboard; pass a dashboardId (or name) to inspect another accessible dashboard. Read-only — returns no secrets.',
                ParameterSchema: { type: 'object', properties: { dashboardId: { type: 'string', description: 'Optional dashboard ID or name. Defaults to the open dashboard.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.agentGetDashboardShares(params['dashboardId']);
                },
            },
        ];
    }

    /**
     * Tools available only while browsing the LIST — category filtering, clear
     * filters, and view-mode toggling. These have no meaning while a single
     * dashboard is open, so they're scoped out of the OPEN tool-set.
     */
    private listModeTools(): AgentClientTool[] {
        return [
            {
                Name: 'SelectCategory',
                Description: 'Filter the dashboard list to a category. Accepts either the category NAME (as listed in AvailableCategories) or its ID. Pass an empty string to clear the category filter (show root).',
                ParameterSchema: { type: 'object', properties: { category: { type: 'string', description: 'The category name or ID to filter by. Empty string clears the filter.' } }, required: ['category'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = ValidateStringParam(params['category'], 'category');
                    if (!v.ok) return v.result;
                    return this.agentSelectCategory(v.value);
                },
            },
            {
                Name: 'FilterByCategory',
                Description: 'Filter the dashboard list to a category by its ID. Pass an empty string to clear the category filter (show root). Prefer SelectCategory, which also accepts a category name.',
                ParameterSchema: { type: 'object', properties: { categoryId: { type: 'string' } }, required: ['categoryId'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = ValidateStringParam(params['categoryId'], 'categoryId');
                    if (!v.ok) return v.result;
                    return this.agentSelectCategory(v.value);
                },
            },
            {
                Name: 'ClearDashboardFilters',
                Description: 'Clear all active dashboard-list filters — both the text search and the category filter — and return to the full list at the root category.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async (): Promise<AgentToolResult> => this.agentClearDashboardFilters(),
            },
            {
                Name: 'SwitchViewMode',
                Description: 'Switch the dashboard list view mode between "cards" and "list".',
                ParameterSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['cards', 'list'] } }, required: ['mode'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.agentSwitchViewMode(params['mode']);
                },
            },
        ];
    }

    /**
     * Tools available only while a dashboard is OPEN (view/edit) — go back to
     * the list, inspect the open dashboard's panels, and read its detail
     * (owner, dates, access level). Scoped out of the LIST tool-set because
     * there's no open dashboard there.
     */
    private openModeTools(): AgentClientTool[] {
        return [
            {
                Name: 'BackToList',
                Description: 'Return from a dashboard view/edit back to the dashboard list.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async (): Promise<AgentToolResult> => {
                    this.BackToList();
                    this.emitAgentContext();
                    return { Success: true };
                },
            },
            {
                Name: 'GetDashboardPanels',
                Description: 'List the panels/widgets on a dashboard — each panel\'s title, part-type, and icon. Defaults to the open dashboard; pass a dashboardId (or name) to inspect another accessible dashboard. Read-only.',
                ParameterSchema: { type: 'object', properties: { dashboardId: { type: 'string', description: 'Optional dashboard ID or name. Defaults to the open dashboard.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.agentGetDashboardPanels(params['dashboardId']);
                },
            },
            {
                Name: 'GetDashboardDetail',
                Description: 'Get detail about a dashboard — owner, created/updated dates, category, and the current user\'s access level (CanRead/Edit/Delete/Share, IsOwner). Defaults to the open dashboard; pass a dashboardId (or name) for another accessible dashboard. Read-only.',
                ParameterSchema: { type: 'object', properties: { dashboardId: { type: 'string', description: 'Optional dashboard ID or name. Defaults to the open dashboard.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.agentGetDashboardDetail(params['dashboardId']);
                },
            },
        ];
    }

    /**
     * Filter the dashboard list by a text query against name + description.
     * The generic browser owns the category/view chrome; this surfaces a
     * name/description filter via the same selected-category mechanism is not
     * applicable, so we narrow the in-memory list the browser renders.
     */
    private agentSearchDashboards(query: string): AgentToolResult {
        const q = query.trim().toLowerCase();
        const engine = DashboardEngine.Instance;
        const md = this.ProviderToUse;
        const all = [...engine.GetAccessibleDashboards(md.CurrentUser.ID)];

        const matched = q
            ? all.filter(d =>
                (d.Name || '').toLowerCase().includes(q) ||
                (d.Description || '').toLowerCase().includes(q))
            : all;

        this.agentSearchText = query.trim();
        this.Dashboards = matched.sort((a, b) =>
            new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime());
        this.Mode = 'list';
        this.SelectedDashboard = null;
        this.emitAgentContext();
        this.cdr.detectChanges();
        return { Success: true };
    }

    /**
     * Apply a category filter by NAME or ID (empty string clears it) and return
     * to the list. Resolves a supplied name (case-insensitive) to its id against
     * the loaded, accessible category list — mirroring the Data Explorer's
     * SelectView name→id resolution.
     */
    private agentSelectCategory(categoryNameOrId: string): AgentToolResult {
        const raw = categoryNameOrId.trim();

        // Empty string clears the filter.
        if (!raw) {
            this.SelectedCategoryId = null;
            this.Mode = 'list';
            this.SelectedDashboard = null;
            this.updateUrlQueryParams();
            this.emitAgentContext();
            this.cdr.detectChanges();
            return { Success: true };
        }

        // Prefer an exact id match, then fall back to a case-insensitive name match.
        const lowered = raw.toLowerCase();
        const match =
            this.Categories.find(c => UUIDsEqual(c.ID, raw)) ??
            this.Categories.find(c => (c.Name || '').toLowerCase() === lowered);

        if (!match) {
            const available = this.Categories.map(c => c.Name).join(', ') || '(none)';
            return { Success: false, ErrorMessage: `No accessible category named or identified by "${raw}". Available categories: ${available}.` };
        }

        this.SelectedCategoryId = match.ID;
        this.Mode = 'list';
        this.SelectedDashboard = null;
        this.updateUrlQueryParams();
        this.emitAgentContext();
        this.cdr.detectChanges();
        return { Success: true };
    }

    /** Clear both the text search and the category filter, returning to the full root list. */
    private agentClearDashboardFilters(): AgentToolResult {
        this.agentSearchText = '';
        this.SelectedCategoryId = null;
        this.Mode = 'list';
        this.SelectedDashboard = null;

        // Restore the full accessible list (the search may have narrowed this.dashboards).
        const engine = DashboardEngine.Instance;
        const md = this.ProviderToUse;
        this.Dashboards = [...engine.GetAccessibleDashboards(md.CurrentUser.ID)].sort((a, b) =>
            new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime());

        this.updateUrlQueryParams();
        this.emitAgentContext();
        this.cdr.detectChanges();
        return { Success: true };
    }

    /**
     * Open a dashboard for inline viewing by NAME or ID. Resolves a supplied name
     * (case-insensitive) to its dashboard against the loaded, accessible list —
     * mirroring the Data Explorer's SelectView name→id resolution.
     */
    private agentOpenDashboard(dashboardNameOrId: string): AgentToolResult {
        const raw = dashboardNameOrId.trim();
        if (!raw) return { Success: false, ErrorMessage: 'A dashboard name or ID is required.' };

        // Search against the full accessible set (not just this.dashboards, which a
        // prior search may have narrowed) so the agent can open any dashboard by name.
        const engine = DashboardEngine.Instance;
        const md = this.ProviderToUse;
        const accessible = engine.GetAccessibleDashboards(md.CurrentUser.ID);

        const lowered = raw.toLowerCase();
        const dashboard =
            accessible.find(d => UUIDsEqual(d.ID, raw)) ??
            accessible.find(d => (d.Name || '').toLowerCase() === lowered);

        if (!dashboard) {
            const available = accessible.map(d => d.Name || '(untitled)').slice(0, 25).join(', ') || '(none)';
            return { Success: false, ErrorMessage: `No accessible dashboard named or identified by "${raw}". Available dashboards include: ${available}.` };
        }
        this.OpenDashboard(dashboard);
        this.emitAgentContext();
        return { Success: true };
    }

    /** Switch and persist the list view mode (cards | list). */
    private agentSwitchViewMode(rawMode: unknown): AgentToolResult {
        if (!IsValidBrowserViewMode(rawMode)) {
            return { Success: false, ErrorMessage: 'mode must be one of: cards, list.' };
        }
        this.ViewMode = rawMode;
        this.saveViewPreference(rawMode);
        this.emitAgentContext();
        this.cdr.detectChanges();
        return { Success: true };
    }

    // ========================================
    // Read-only detail tools (GetDashboardPanels / GetDashboardDetail /
    // GetCategoryHierarchy / GetDashboardShares).
    // These return descriptive data only — no mutations, never throw.
    // ========================================

    /**
     * Resolve an optional `dashboardId` tool param (ID **or** name, or omitted)
     * to a concrete accessible dashboard. When omitted/empty, defaults to the
     * currently-open dashboard. Returns null with a tolerant error result when
     * nothing matches.
     */
    private resolveDashboardForTool(
        rawParam: unknown,
    ): { ok: true; dashboard: MJDashboardEntity } | { ok: false; result: AgentToolResult } {
        const engine = DashboardEngine.Instance;
        const md = this.ProviderToUse;
        const accessible = engine.GetAccessibleDashboards(md.CurrentUser.ID);

        const raw = typeof rawParam === 'string' ? rawParam.trim() : '';

        // No param → default to the open dashboard.
        if (!raw) {
            if (this.SelectedDashboard) {
                return { ok: true, dashboard: this.SelectedDashboard };
            }
            return {
                ok: false,
                result: { Success: false, ErrorMessage: 'No dashboard is open. Provide a dashboardId (or name) to inspect a specific dashboard.' },
            };
        }

        const lowered = raw.toLowerCase();
        const dashboard =
            accessible.find(d => UUIDsEqual(d.ID, raw)) ??
            accessible.find(d => (d.Name || '').toLowerCase() === lowered);

        if (!dashboard) {
            const available = accessible.map(d => d.Name || '(untitled)').slice(0, 25).join(', ') || '(none)';
            return {
                ok: false,
                result: { Success: false, ErrorMessage: `No accessible dashboard named or identified by "${raw}". Available dashboards include: ${available}.` },
            };
        }
        return { ok: true, dashboard };
    }

    /**
     * Return the panel list for the open (or named) dashboard. For the open
     * dashboard we read live panels from the viewer; for another dashboard we
     * parse its persisted UIConfigDetails. Read-only.
     */
    private agentGetDashboardPanels(rawDashboardId: unknown): AgentToolDataResult {
        const resolved = this.resolveDashboardForTool(rawDashboardId);
        if (!resolved.ok) return resolved.result;
        const dashboard = resolved.dashboard;

        // If this is the currently-open dashboard, read the viewer's live panels
        // (reflects any in-session, unsaved layout edits).
        const isOpen = this.SelectedDashboard !== null && UUIDsEqual(dashboard.ID, this.SelectedDashboard.ID);
        const panels = isOpen
            ? this.readOpenedDashboardPanels()
            : this.readPanelsFromPersistedConfig(dashboard);

        return {
            Success: true,
            Data: {
                DashboardId: dashboard.ID,
                DashboardName: dashboard.Name,
                PanelCount: panels.length,
                Panels: panels,
            },
        };
    }

    /**
     * Parse a dashboard's persisted UIConfigDetails into a descriptive panel
     * summary list, resolving each panel's part-type name from the engine's
     * cached part types. Tolerant — returns [] on missing/invalid config.
     */
    private readPanelsFromPersistedConfig(dashboard: MJDashboardEntity): OpenedDashboardPanelSummary[] {
        const raw = dashboard.UIConfigDetails;
        if (!raw) return [];

        try {
            const parsed = JSON.parse(raw) as Partial<DashboardConfig> | null;
            const panels = extractPanelsFromLayout(parsed?.layout ?? null);
            const partTypes = DashboardEngine.Instance.DashboardPartTypes;

            return panels.map(panel => {
                const partType = partTypes.find(pt => UUIDsEqual(pt.ID, panel.partTypeId)) ?? null;
                const summary: OpenedDashboardPanelSummary = {
                    Title: panel.title || '(untitled panel)',
                    PartTypeName: partType?.Name || panel.config?.type || 'Unknown',
                };
                const icon = panel.icon || partType?.Icon || undefined;
                if (icon) {
                    summary.Icon = icon;
                }
                return summary;
            });
        } catch {
            return [];
        }
    }

    /**
     * Return owner / dates / category / access-level detail for the open (or
     * named) dashboard. Access level comes from the DashboardEngine permissions
     * already computed by the browser. Read-only.
     */
    private agentGetDashboardDetail(rawDashboardId: unknown): AgentToolDataResult {
        const resolved = this.resolveDashboardForTool(rawDashboardId);
        if (!resolved.ok) return resolved.result;
        const dashboard = resolved.dashboard;

        const md = this.ProviderToUse;
        const perms = DashboardEngine.Instance.GetDashboardPermissions(dashboard.ID, md.CurrentUser.ID);

        return {
            Success: true,
            Data: {
                DashboardId: dashboard.ID,
                DashboardName: dashboard.Name,
                Description: dashboard.Description ?? null,
                Owner: dashboard.User ?? null,
                CategoryName: dashboard.Category ?? null,
                CategoryId: dashboard.CategoryID ?? null,
                CreatedAt: this.toIsoOrNull(dashboard.__mj_CreatedAt),
                UpdatedAt: this.toIsoOrNull(dashboard.__mj_UpdatedAt),
                Access: {
                    CanRead: perms.CanRead,
                    CanEdit: perms.CanEdit,
                    CanDelete: perms.CanDelete,
                    CanShare: perms.CanShare,
                    IsOwner: perms.IsOwner,
                    PermissionSource: perms.PermissionSource,
                },
            },
        };
    }

    /**
     * Return the accessible category tree (name, ID, parent ID, and per-category
     * count of accessible dashboards filed directly under it). Read-only.
     */
    private agentGetCategoryHierarchy(): AgentToolDataResult {
        const md = this.ProviderToUse;
        const engine = DashboardEngine.Instance;
        const categories = engine.GetAccessibleCategories(md.CurrentUser.ID);
        const accessible = engine.GetAccessibleDashboards(md.CurrentUser.ID);

        const tree = categories.map(cat => ({
            Name: cat.Name,
            Id: cat.ID,
            ParentId: cat.ParentID ?? null,
            DashboardCount: accessible.filter(d => d.CategoryID && UUIDsEqual(d.CategoryID, cat.ID)).length,
        }));

        // Dashboards with no (accessible) category sit at the root.
        const rootDashboardCount = accessible.filter(d => !d.CategoryID).length;

        return {
            Success: true,
            Data: {
                CategoryCount: tree.length,
                RootDashboardCount: rootDashboardCount,
                Categories: tree,
            },
        };
    }

    /**
     * Return who a dashboard is shared with and their access level. Uses
     * DashboardEngine.GetDashboardShares (the real method) over the cached
     * permission records. Returns no secrets. Read-only.
     */
    private agentGetDashboardShares(rawDashboardId: unknown): AgentToolDataResult {
        const resolved = this.resolveDashboardForTool(rawDashboardId);
        if (!resolved.ok) return resolved.result;
        const dashboard = resolved.dashboard;

        const shares: MJDashboardPermissionEntity[] = DashboardEngine.Instance.GetDashboardShares(dashboard.ID);

        const sharedWith = shares.map(s => ({
            UserName: s.User ?? null,
            CanRead: s.CanRead,
            CanEdit: s.CanEdit,
            CanDelete: s.CanDelete,
            CanShare: s.CanShare,
            SharedByUserName: s.SharedByUser ?? null,
        }));

        return {
            Success: true,
            Data: {
                DashboardId: dashboard.ID,
                DashboardName: dashboard.Name,
                Owner: dashboard.User ?? null,
                ShareCount: sharedWith.length,
                SharedWith: sharedWith,
            },
        };
    }

    /** Format a date to ISO, tolerant of null/invalid values. */
    private toIsoOrNull(value: Date | null | undefined): string | null {
        if (!value) return null;
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? new Date(time).toISOString() : null;
    }

    // ========================================
    // Event Handlers from Generic Browser
    // ========================================

    /**
     * Handle dashboard open request from generic browser
     */
    public OnDashboardOpen(event: DashboardOpenEvent): void {
        if (event.OpenInNewTab) {
            // Open in a dedicated Explorer tab via NavigationService
            this.navigationService.OpenDashboard(
                event.Dashboard.ID,
                event.Dashboard.Name,
                { forceNewTab: true }
            );
        } else {
            // Open inline in the browser's view pane
            this.OpenDashboard(event.Dashboard);
        }
    }

    /** @deprecated Use {@link OnDashboardOpen}. */
    public onDashboardOpen(event: DashboardOpenEvent): void {
      return this.OnDashboardOpen(event);
    }

    /**
     * Open the current dashboard in its own dedicated Explorer tab
     */
    public openInNewTab(): void {
        if (this.SelectedDashboard) {
            this.navigationService.OpenDashboard(
                this.SelectedDashboard.ID,
                this.SelectedDashboard.Name,
                { forceNewTab: true }
            );
        }
    }

    /**
     * Handle dashboard edit request from generic browser
     */
    public OnDashboardEdit(event: DashboardEditEvent): void {
        this.EditDashboard(event.Dashboard);
    }

    /** @deprecated Use {@link OnDashboardEdit}. */
    public onDashboardEdit(event: DashboardEditEvent): void {
      return this.OnDashboardEdit(event);
    }

    /**
     * Handle dashboard delete request from generic browser
     */
    public async OnDashboardDelete(event: DashboardDeleteEvent): Promise<void> {
        // The generic browser handles the confirmation dialog
        // We just need to perform the actual deletion atomically
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            if (event.Dashboards.length === 0) return;

            const md = this.ProviderToUse;
            const tg = await md.CreateTransactionGroup();
            for (const dashboard of event.Dashboards) {
                dashboard.TransactionGroup = tg;
                await dashboard.Delete();
            }

            if (await tg.Submit()) {
                const deletedIds = new Set(event.Dashboards.map(d => d.ID));
                this.Dashboards = this.Dashboards.filter(d => !deletedIds.has(d.ID));
            } else {
                console.error('Failed to delete dashboards — all changes rolled back');
            }
        } catch (err) {
            console.error('Failed to delete dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link OnDashboardDelete}. */
    public async onDashboardDelete(event: DashboardDeleteEvent): Promise<void> {
      return this.OnDashboardDelete(event);
    }

    /**
     * Handle dashboard move request from generic browser.
     * For owned dashboards: updates the dashboard's CategoryID directly.
     * For shared dashboards: creates/updates a DashboardCategoryLink to organize without modifying the original.
     */
    public async OnDashboardMove(event: DashboardMoveEvent): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            if (event.Dashboards.length === 0) return;

            const md = this.ProviderToUse;
            const currentUserId = md.CurrentUser.ID;
            const tg = await md.CreateTransactionGroup();
            const sharedDashboardIds: string[] = [];

            for (const dashboard of event.Dashboards) {
                const permissions = DashboardEngine.Instance.GetDashboardPermissions(dashboard.ID, currentUserId);

                if (permissions.IsOwner) {
                    // Owner can modify the dashboard directly
                    dashboard.CategoryID = event.TargetCategoryId;
                    dashboard.TransactionGroup = tg;
                    await dashboard.Save();
                } else {
                    // Non-owner: create or update a category link instead
                    const existingLinks = DashboardEngine.Instance.DashboardCategoryLinks.filter(
                        link => UUIDsEqual(link.DashboardID, dashboard.ID) && UUIDsEqual(link.UserID, currentUserId)
                    );

                    let link: MJDashboardCategoryLinkEntity;
                    if (existingLinks.length > 0) {
                        link = existingLinks[0];
                        link.DashboardCategoryID = event.TargetCategoryId;
                    } else {
                        link = await md.GetEntityObject<MJDashboardCategoryLinkEntity>('MJ: Dashboard Category Links');
                        link.DashboardID = dashboard.ID;
                        link.UserID = currentUserId;
                        link.DashboardCategoryID = event.TargetCategoryId;
                    }
                    link.TransactionGroup = tg;
                    await link.Save();

                    sharedDashboardIds.push(dashboard.ID);
                }
            }

            if (await tg.Submit()) {
                // Update the effective category map for the shared dashboards now that the server confirmed
                for (const id of sharedDashboardIds) {
                    this.EffectiveCategoryMap.set(id, event.TargetCategoryId);
                }
                this.EffectiveCategoryMap = new Map(this.EffectiveCategoryMap);
                this.Dashboards = [...this.Dashboards];
                this.SelectedCategoryId = event.TargetCategoryId;
                this.updateUrlQueryParams();
            } else {
                console.error('Failed to move dashboards — all changes rolled back');
            }
        } catch (err) {
            console.error('Failed to move dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link OnDashboardMove}. */
    public async onDashboardMove(event: DashboardMoveEvent): Promise<void> {
      return this.OnDashboardMove(event);
    }

    /**
     * Handle create dashboard request from generic browser
     */
    public async OnDashboardCreate(event: DashboardCreateEvent): Promise<void> {
        await this.CreateDashboard(event.CategoryId);
    }

    /** @deprecated Use {@link OnDashboardCreate}. */
    public async onDashboardCreate(event: DashboardCreateEvent): Promise<void> {
      return this.OnDashboardCreate(event);
    }

    /**
     * Handle category change from generic browser - update URL
     */
    public OnCategoryChange(event: CategoryChangeEvent): void {
        this.SelectedCategoryId = event.CategoryId;
        this.updateUrlQueryParams();
        this.emitAgentContext();
    }

    /** @deprecated Use {@link OnCategoryChange}. */
    public onCategoryChange(event: CategoryChangeEvent): void {
      return this.OnCategoryChange(event);
    }

    /**
     * Handle view preference change from generic browser - persist
     */
    public OnViewPreferenceChange(event: ViewPreferenceChangeEvent): void {
        this.ViewMode = event.ViewMode;
        this.saveViewPreference(event.ViewMode);
        this.emitAgentContext();
    }

    /** @deprecated Use {@link OnViewPreferenceChange}. */
    public onViewPreferenceChange(event: ViewPreferenceChangeEvent): void {
      return this.OnViewPreferenceChange(event);
    }

    /**
     * Handle category create request from generic browser
     * Includes extensive logging for debugging category creation issues
     */
    public async OnCategoryCreate(event: CategoryCreateEvent): Promise<void> {
        console.debug('[DashboardBrowserResource] Category create requested:', {
            name: event.Name,
            parentCategoryId: event.ParentCategoryId
        });

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const md = this.ProviderToUse;
            console.debug('[DashboardBrowserResource] Current user:', {
                userId: md.CurrentUser?.ID,
                userName: md.CurrentUser?.Name,
                email: md.CurrentUser?.Email
            });

            const category = await md.GetEntityObject<MJDashboardCategoryEntity>('MJ: Dashboard Categories');
            console.debug('[DashboardBrowserResource] Created category entity object');

            // Set required fields
            category.Name = event.Name;
            category.UserID = md.CurrentUser.ID;

            if (event.ParentCategoryId) {
                category.ParentID = event.ParentCategoryId;
            }

            console.debug('[DashboardBrowserResource] Category fields before save:', {
                name: category.Name,
                userId: category.UserID,
                parentId: category.ParentID,
                allFields: category.Fields.map(f => ({ name: f.Name, value: f.Value, dirty: f.Dirty }))
            });

            const saved = await category.Save();

            console.debug('[DashboardBrowserResource] Save result:', {
                success: saved,
                latestResult: category.LatestResult,
                message: category.LatestResult?.Message,
                success2: category.LatestResult?.Success,
                id: category.ID
            });

            if (saved) {
                console.debug('[DashboardBrowserResource] Category saved successfully, ID:', category.ID);
                // Add to local array - engine will self-update
                this.Categories.push(category);
                this.Categories = [...this.Categories].sort((a, b) => a.Name.localeCompare(b.Name));
            } else {
                const errorMessage = category.LatestResult?.Message || 'Unknown error saving category';
                console.error('[DashboardBrowserResource] Failed to save category:', errorMessage);
                console.error('[DashboardBrowserResource] Full LatestResult:', JSON.stringify(category.LatestResult, null, 2));

                // Show toast or alert for user
                alert(`Failed to create category: ${errorMessage}`);
            }
        } catch (err) {
            console.error('[DashboardBrowserResource] Exception creating category:', err);
            alert(`Error creating category: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link OnCategoryCreate}. */
    public async onCategoryCreate(event: CategoryCreateEvent): Promise<void> {
      return this.OnCategoryCreate(event);
    }

    /**
     * Handle category delete request from generic browser
     * Performs recursive deletion of category and all children
     */
    public async OnCategoryDelete(event: CategoryDeleteEvent): Promise<void> {
        console.debug('[DashboardBrowserResource] Category delete requested:', event.Category.Name);

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            // Get all categories in child-first order so parent FKs are satisfied as we delete.
            // getChildCategoriesRecursive returns pre-order (parent before its descendants);
            // reversing that list gives a valid leaves-first order, then we append the root last.
            const descendants = this.getChildCategoriesRecursive(event.Category.ID);
            descendants.reverse();
            const categoriesToDelete = [...descendants, event.Category];

            console.debug('[DashboardBrowserResource] Deleting categories:', categoriesToDelete.map(c => c.Name));

            const categoryIds = new Set(categoriesToDelete.map(c => c.ID));
            const dashboardsToUncategorize = this.Dashboards.filter(d =>
                d.CategoryID && categoryIds.has(d.CategoryID)
            );

            // Queue dashboard uncategorize saves first, then category deletes — single atomic transaction
            const md = this.ProviderToUse;
            const tg = await md.CreateTransactionGroup();

            for (const dashboard of dashboardsToUncategorize) {
                dashboard.CategoryID = null!;
                dashboard.TransactionGroup = tg;
                await dashboard.Save();
            }

            for (const cat of categoriesToDelete) {
                cat.TransactionGroup = tg;
                await cat.Delete();
            }

            if (await tg.Submit()) {
                this.Categories = this.Categories.filter(c => !categoryIds.has(c.ID));
                this.Dashboards = [...this.Dashboards];
            } else {
                console.error('[DashboardBrowserResource] Failed to delete categories — all changes rolled back');
            }
        } catch (err) {
            console.error('[DashboardBrowserResource] Exception deleting category:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link OnCategoryDelete}. */
    public async onCategoryDelete(event: CategoryDeleteEvent): Promise<void> {
      return this.OnCategoryDelete(event);
    }

    /**
     * Handle breadcrumb navigation event
     * Navigates back to list view with optional category selection
     */
    public OnBreadcrumbNavigate(event: BreadcrumbNavigateEvent): void {
        console.debug('[DashboardBrowserResource] Breadcrumb navigate:', event);

        // CategoryId is null for root, or a category ID string
        this.SelectedCategoryId = event.CategoryId;
        this.BackToList();
        this.updateUrlQueryParams();
    }

    /** @deprecated Use {@link OnBreadcrumbNavigate}. */
    public onBreadcrumbNavigate(event: BreadcrumbNavigateEvent): void {
      return this.OnBreadcrumbNavigate(event);
    }

    // ========================================
    // Public Methods - Navigation
    // ========================================

    /**
     * Open a dashboard for viewing
     */
    public OpenDashboard(dashboard: MJDashboardEntity): void {
        this.SelectedDashboard = dashboard;
        this.Mode = 'view';

        // Compute permissions for the selected dashboard
        const md = this.ProviderToUse;
        this.SelectedDashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
            dashboard.ID,
            md.CurrentUser.ID
        );

        this.updateUrlQueryParams();
        this.NotifyDisplayNameChanged(dashboard.Name || 'Dashboard');
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenDashboard}. */
    public openDashboard(dashboard: MJDashboardEntity): void {
      return this.OpenDashboard(dashboard);
    }

    /**
     * Open a dashboard for editing
     */
    public EditDashboard(dashboard: MJDashboardEntity): void {
        // Check if user has edit permission
        const md = this.ProviderToUse;
        const permissions = DashboardEngine.Instance.GetDashboardPermissions(
            dashboard.ID,
            md.CurrentUser.ID
        );

        if (!permissions.CanEdit) {
            console.warn('User does not have permission to edit this dashboard');
            return;
        }

        this.SelectedDashboard = dashboard;
        this.SelectedDashboardPermissions = permissions;
        this.Mode = 'edit';

        // Initialize editing fields
        this.EditingName = dashboard.Name;
        this.EditingDescription = dashboard.Description || '';

        // Store originals for cancel
        this.originalName = dashboard.Name;
        this.originalDescription = dashboard.Description || '';
        this.originalConfig = dashboard.UIConfigDetails || '';

        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link EditDashboard}. */
    public editDashboard(dashboard: MJDashboardEntity): void {
      return this.EditDashboard(dashboard);
    }

    /**
     * Go back to list view
     */
    public BackToList(): void {
        this.SelectedDashboard = null;
        this.Mode = 'list';
        this.updateUrlQueryParams();
        this.NotifyDisplayNameChanged('Dashboards');
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link BackToList}. */
    public backToList(): void {
      return this.BackToList();
    }

    /**
     * Toggle edit mode for current dashboard
     */
    public ToggleEditMode(): void {
        if (this.Mode === 'view' && this.SelectedDashboard) {
            this.EditDashboard(this.SelectedDashboard);
        } else if (this.Mode === 'edit') {
            this.Mode = 'view';
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link ToggleEditMode}. */
    public toggleEditMode(): void {
      return this.ToggleEditMode();
    }

    /**
     * Open the share dialog for the current dashboard
     */
    public OpenShareDialog(): void {
        if (!this.SelectedDashboard) return;

        // Verify user has share permission
        if (!this.SelectedDashboardPermissions.CanShare) {
            console.warn('User does not have permission to share this dashboard');
            return;
        }

        this.ShowShareDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenShareDialog}. */
    public openShareDialog(): void {
      return this.OpenShareDialog();
    }

    /**
     * Close the share dialog
     */
    public CloseShareDialog(): void {
        this.ShowShareDialog = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseShareDialog}. */
    public closeShareDialog(): void {
      return this.CloseShareDialog();
    }

    /**
     * Handle share dialog result
     */
    public OnShareDialogResult(result: ShareDialogResult): void {
        this.ShowShareDialog = false;

        if (result.Action === 'save' && this.SelectedDashboard) {
            // Recompute permissions after sharing changes
            const md = this.ProviderToUse;
            this.SelectedDashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
                this.SelectedDashboard.ID,
                md.CurrentUser.ID
            );
        }

        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnShareDialogResult}. */
    public onShareDialogResult(result: ShareDialogResult): void {
      return this.OnShareDialogResult(result);
    }

    // ========================================
    // Public Methods - Dashboard CRUD
    // ========================================

    /**
     * Create a new dashboard
     */
    public async CreateDashboard(categoryId?: string | null): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const md = this.ProviderToUse;
            const dashboard = await md.GetEntityObject<MJDashboardEntity>('MJ: Dashboards');

            dashboard.Name = 'New Dashboard';
            dashboard.Description = '';
            dashboard.UserID = md.CurrentUser.ID;
            dashboard.UIConfigDetails = JSON.stringify(createDefaultDashboardConfig());

            if (categoryId) {
                dashboard.CategoryID = categoryId;
            } else if (this.SelectedCategoryId) {
                dashboard.CategoryID = this.SelectedCategoryId;
            }

            const saved = await dashboard.Save();

            if (saved) {
                this.Dashboards.unshift(dashboard);
                this.Dashboards = [...this.Dashboards];
                this.EditDashboard(dashboard);
            } else {
                console.error('Failed to save dashboard:', dashboard.LatestResult);
            }
        } catch (err) {
            console.error('Failed to create dashboard:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link CreateDashboard}. */
    public async createDashboard(categoryId?: string | null): Promise<void> {
      return this.CreateDashboard(categoryId);
    }

    /**
     * Save the current dashboard
     */
    public async SaveDashboard(): Promise<void> {
        if (!this.SelectedDashboard) return;

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            this.SelectedDashboard.Name = this.EditingName;
            this.SelectedDashboard.Description = this.EditingDescription;

            if (this.dashboardViewer) {
                await this.dashboardViewer.save();
            }

            this.originalName = this.EditingName;
            this.originalDescription = this.EditingDescription;
            this.originalConfig = this.SelectedDashboard.UIConfigDetails || '';

            // Update the dashboard in the list
            this.Dashboards = [...this.Dashboards];

            this.Mode = 'view';
        } catch (err) {
            console.error('Failed to save dashboard:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link SaveDashboard}. */
    public async saveDashboard(): Promise<void> {
      return this.SaveDashboard();
    }

    /**
     * Cancel editing and revert changes
     */
    public CancelEdit(): void {
        if (!this.SelectedDashboard) {
            this.BackToList();
            return;
        }

        this.SelectedDashboard.Name = this.originalName;
        this.SelectedDashboard.Description = this.originalDescription;
        this.SelectedDashboard.UIConfigDetails = this.originalConfig;

        this.EditingName = '';
        this.EditingDescription = '';

        this.Mode = 'view';
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CancelEdit}. */
    public cancelEdit(): void {
      return this.CancelEdit();
    }

    /**
     * Handle name input blur - validate name is not empty
     */
    public OnNameBlur(): void {
        if (!this.EditingName.trim()) {
            this.EditingName = this.originalName || 'Untitled Dashboard';
        }
    }

    /** @deprecated Use {@link OnNameBlur}. */
    public onNameBlur(): void {
      return this.OnNameBlur();
    }

    // ========================================
    // Public Methods - Part Management
    // ========================================

    /**
     * Open the Add Part dialog
     */
    public OpenAddPartDialog(): void {
        this.ShowAddPanelDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenAddPartDialog}. */
    public openAddPartDialog(): void {
      return this.OpenAddPartDialog();
    }

    /**
     * Handle panel interaction events from the viewer
     */
    public OnPanelInteraction(event: PanelInteractionEvent): void {
        if (event.interactionType !== 'custom') return;

        const action = event.payload?.['action'];

        switch (action) {
            case 'add-panel-requested':
                this.OpenAddPartDialog();
                break;

            case 'configure-part-requested':
                this.OpenConfigDialog(event.panelId);
                break;

            case 'remove-part-requested':
                this.OpenRemoveConfirmDialog(
                    event.panelId,
                    event.payload?.['panelTitle'] as string || 'this part'
                );
                break;
        }
    }

    /** @deprecated Use {@link OnPanelInteraction}. */
    public onPanelInteraction(event: PanelInteractionEvent): void {
      return this.OnPanelInteraction(event);
    }

    /**
     * Handle navigation events from panels
     */
    public OnNavigationRequested(event: DashboardNavRequestEvent): void {
        const request = event.request;
        const openInNewTab = request.openInNewTab || false;

        switch (request.type) {
            case 'OpenEntityRecord': {
                // Navigate to entity record
                // recordId is either a full "F1|v1||F2|v2" segment or a bare value; a bare value maps onto
                // the entity's real key column, whatever it is called
                const entity = this.ProviderToUse.Entities.find(e => e.Name === request.entityName);
                const compositeKey = CompositeKey.FromURLSegment(entity, request.recordId);
                this.navigationService.OpenEntityRecord(
                    request.entityName,
                    compositeKey,
                    { forceNewTab: openInNewTab }
                );
                break;
            }
            case 'OpenDashboard': {
                // Navigate to another dashboard
                const targetDashboard = this.Dashboards.find(d => UUIDsEqual(d.ID, request.dashboardId));
                if (targetDashboard) {
                    if (openInNewTab) {
                        this.navigationService.OpenDashboard(
                            targetDashboard.ID,
                            targetDashboard.Name,
                            { forceNewTab: true }
                        );
                    } else {
                        this.OpenDashboard(targetDashboard);
                    }
                }
                break;
            }
            case 'OpenQuery': {
                // Navigate to query viewer
                const md = this.ProviderToUse;
                const queryInfo = md.Queries.find(q => UUIDsEqual(q.ID, request.queryId));
                if (queryInfo) {
                    this.navigationService.OpenQuery(
                        request.queryId,
                        queryInfo.Name,
                        { forceNewTab: openInNewTab }
                    );
                }
                break;
            }
            case 'OpenNavItem': {
                // Navigate to a specific nav item within an application
                const appId = request.appName ? this.resolveAppId(request.appName) : undefined;
                this.navigationService.OpenNavItemByName(request.navItemName, undefined, appId, {
                    queryParams: request.queryParams
                });
                break;
            }
        }
    }

    /** @deprecated Use {@link OnNavigationRequested}. */
    public onNavigationRequested(event: DashboardNavRequestEvent): void {
      return this.OnNavigationRequested(event);
    }

    /**
     * Resolve an application name to its ID
     */
    private resolveAppId(appName: string): string | undefined {
        const md = this.ProviderToUse;
        const app = md.Applications.find(a => a.Name.toLowerCase() === appName.toLowerCase());
        return app?.ID;
    }

    /**
     * Handle add panel dialog result
     */
    public async OnPanelAdded(result: AddPanelResult): Promise<void> {
        if (this.dashboardViewer) {
            await this.dashboardViewer.addPanel(
                result.PartType.ID,
                result.Config,
                result.Title,
                result.Icon
            );
        }
        this.ShowAddPanelDialog = false;
        // Panel set changed — refresh opened-dashboard context for the agent.
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnPanelAdded}. */
    public async onPanelAdded(result: AddPanelResult): Promise<void> {
      return this.OnPanelAdded(result);
    }

    /**
     * Handle add panel dialog cancel
     */
    public OnAddPanelCancelled(): void {
        this.ShowAddPanelDialog = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnAddPanelCancelled}. */
    public onAddPanelCancelled(): void {
      return this.OnAddPanelCancelled();
    }

    // ========================================
    // Public Methods - Config Dialog
    // ========================================

    /**
     * Open the config dialog for a panel
     */
    public OpenConfigDialog(panelId: string): void {
        if (!this.dashboardViewer) return;

        const panel = this.dashboardViewer.getPanel(panelId);
        const partType = this.dashboardViewer.getPartTypeForPanel(panelId);

        if (!panel || !partType) {
            console.warn('Could not find panel or part type for config dialog');
            return;
        }

        this.ConfigDialogPanel = panel;
        this.ConfigDialogPartType = partType;
        this.ConfigDialogClass = partType.ConfigDialogClass || '';
        this.ShowConfigDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenConfigDialog}. */
    public openConfigDialog(panelId: string): void {
      return this.OpenConfigDialog(panelId);
    }

    /**
     * Handle config dialog save
     */
    public OnConfigDialogSaved(result: EditPartDialogResult): void {
        if (this.dashboardViewer && this.ConfigDialogPanel) {
            this.dashboardViewer.updatePanelConfig(
                this.ConfigDialogPanel.id,
                result.Config,
                result.Title,
                result.Icon
            );
        }
        this.closeConfigDialog();
        // A panel's title/icon/config may have changed — refresh agent context.
        this.emitAgentContext();
    }

    /** @deprecated Use {@link OnConfigDialogSaved}. */
    public onConfigDialogSaved(result: EditPartDialogResult): void {
      return this.OnConfigDialogSaved(result);
    }

    /**
     * Handle config dialog cancel
     */
    public OnConfigDialogCancelled(): void {
        this.closeConfigDialog();
    }

    /** @deprecated Use {@link OnConfigDialogCancelled}. */
    public onConfigDialogCancelled(): void {
      return this.OnConfigDialogCancelled();
    }

    /**
     * Close the config dialog
     */
    private closeConfigDialog(): void {
        this.ShowConfigDialog = false;
        this.ConfigDialogPanel = null;
        this.ConfigDialogPartType = null;
        this.ConfigDialogClass = '';
        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Remove Confirm Dialog
    // ========================================

    /**
     * Open the remove confirmation dialog
     */
    public OpenRemoveConfirmDialog(panelId: string, panelTitle: string): void {
        this.ConfirmPanelId = panelId;
        this.ConfirmPanelTitle = panelTitle;
        this.ShowConfirmDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenRemoveConfirmDialog}. */
    public openRemoveConfirmDialog(panelId: string, panelTitle: string): void {
      return this.OpenRemoveConfirmDialog(panelId, panelTitle);
    }

    /**
     * Handle remove confirmation
     */
    public OnRemoveConfirmed(): void {
        if (this.dashboardViewer && this.ConfirmPanelId) {
            this.dashboardViewer.confirmRemovePanel(this.ConfirmPanelId);
        }
        this.closeRemoveConfirmDialog();
        // Panel set changed — refresh opened-dashboard context for the agent.
        this.emitAgentContext();
    }

    /** @deprecated Use {@link OnRemoveConfirmed}. */
    public onRemoveConfirmed(): void {
      return this.OnRemoveConfirmed();
    }

    /**
     * Handle remove cancel
     */
    public OnRemoveCancelled(): void {
        this.closeRemoveConfirmDialog();
    }

    /** @deprecated Use {@link OnRemoveCancelled}. */
    public onRemoveCancelled(): void {
      return this.OnRemoveCancelled();
    }

    /**
     * Close the remove confirm dialog
     */
    private closeRemoveConfirmDialog(): void {
        this.ShowConfirmDialog = false;
        this.ConfirmPanelId = '';
        this.ConfirmPanelTitle = '';
        this.cdr.detectChanges();
    }

    // ========================================
    // Private Methods - Data Loading
    // ========================================

    private async loadDashboards(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            // Use DashboardEngine for consistent cached data
            const engine = DashboardEngine.Instance;
            await engine.Config(false); // Wait for engine to load data

            const md = this.ProviderToUse;
            const currentUserId = md.CurrentUser.ID;

            // Get data from engine - sort dashboards by updated date, categories by name
            // Filter dashboards to only those accessible to the current user
            this.Dashboards = [...engine.GetAccessibleDashboards(currentUserId)].sort((a, b) =>
                new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime()
            );
            // Filter categories to only those owned by or shared with the current user
            this.Categories = [...engine.GetAccessibleCategories(currentUserId)].sort((a, b) =>
                a.Name.localeCompare(b.Name)
            );

            // Build permissions map and effective category map for all dashboards
            this.DashboardPermissionsMap = new Map();
            this.EffectiveCategoryMap = new Map();

            // Get category links for current user (from engine's cached data)
            const userCategoryLinks = engine.DashboardCategoryLinks.filter(
                link => UUIDsEqual(link.UserID, currentUserId)
            );

            for (const dashboard of this.Dashboards) {
                const perms = engine.GetDashboardPermissions(dashboard.ID, currentUserId);
                this.DashboardPermissionsMap.set(dashboard.ID, perms);

                // For shared dashboards (not owned), determine effective category
                if (!perms.IsOwner) {
                    // Look for a category link for this dashboard
                    const categoryLink = userCategoryLinks.find(
                        link => UUIDsEqual(link.DashboardID, dashboard.ID)
                    );

                    if (categoryLink) {
                        // User has explicitly organized this shared dashboard
                        this.EffectiveCategoryMap.set(dashboard.ID, categoryLink.DashboardCategoryID);
                    } else {
                        // No link exists - show in root (null category)
                        this.EffectiveCategoryMap.set(dashboard.ID, null);
                    }
                }
                // For owned dashboards, we don't add to effectiveCategoryMap
                // so the browser will use the dashboard's actual CategoryID
            }

            console.debug('[DashboardBrowserResource] Loaded from DashboardEngine:', {
                dashboardCount: this.Dashboards.length,
                categoryCount: this.Categories.length,
                sharedDashboardsInEffectiveMap: this.EffectiveCategoryMap.size,
                categories: this.Categories.map(c => ({ id: c.ID, name: c.Name, parentId: c.ParentID }))
            });

            // List is now loaded — apply any query-param selection. Use params deferred by
            // OnQueryParamsChanged during the cold load if present, otherwise read the tab's
            // current params (covers deep links and Home pin navigation).
            const params = this._pendingQueryParams ?? this.GetQueryParams();
            this._pendingQueryParams = null;
            if (params && Object.keys(params).length > 0) {
                this.SelectedCategoryId = params['category'] || this.SelectedCategoryId;
                this.applyDashboardSelectionFromParams(params);
            }

            this.emitAgentContext();
            this.NotifyLoadComplete();
        } catch (err) {
            console.error('Failed to load dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ========================================
    // Private Methods - URL Query Params
    // ========================================

    /**
     * Update the URL query params for the current tab.
     * Routes through BaseResourceComponent.UpdateQueryParams, which updates the tab
     * configuration (triggering the shell's URL sync while respecting app-scoped
     * routes) and is auto-suppressed while delivering OnQueryParamsChanged so
     * reflecting URL → state never loops back into a redundant URL push.
     */
    private updateUrlQueryParams(): void {
        const queryParams: Record<string, string | null> = {};

        // Track category
        if (this.SelectedCategoryId) {
            queryParams['category'] = this.SelectedCategoryId;
        } else {
            queryParams['category'] = null;
        }

        // Track dashboard (for browser back/forward support)
        if (this.SelectedDashboard) {
            queryParams['dashboard'] = this.SelectedDashboard.ID;
        } else {
            queryParams['dashboard'] = null;
        }

        // Push via the base-class method (auto-suppressed during OnQueryParamsChanged
        // delivery) so the URL update respects app-scoped routes without loop-back.
        this.UpdateQueryParams(queryParams);
    }

    // ========================================
    // Private Methods - Category Helpers
    // ========================================

    /**
     * Get all child categories of a parent category recursively
     */
    private getChildCategoriesRecursive(parentId: string): MJDashboardCategoryEntity[] {
        const children: MJDashboardCategoryEntity[] = [];
        const directChildren = this.Categories.filter(c => UUIDsEqual(c.ParentID, parentId));

        for (const child of directChildren) {
            children.push(child);
            children.push(...this.getChildCategoriesRecursive(child.ID));
        }

        return children;
    }

    // ========================================
    // Private Methods - View Preference
    // ========================================

    private loadViewPreference(): void {
        // TODO: Load from User Settings entity
        const stored = localStorage.getItem('dashboard-browser-view-mode');
        if (stored === 'cards' || stored === 'list') {
            this.ViewMode = stored;
        }
    }

    private saveViewPreference(mode: DashboardBrowserViewMode): void {
        // TODO: Save to User Settings entity
        localStorage.setItem('dashboard-browser-view-mode', mode);
    }
}
