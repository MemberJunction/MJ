import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJDashboardEntity, MJDashboardCategoryEntity, MJDashboardPartTypeEntity, DashboardEngine, DashboardUserPermissions, MJDashboardCategoryLinkEntity, MJDashboardPermissionEntity } from '@memberjunction/core-entities';
import { ShareDialogResult } from './dashboard-share-dialog.component';
import {
    buildDashboardBrowserAgentContext,
    isValidBrowserViewMode,
    OpenedDashboardPanelSummary,
} from './dashboard-browser-agent-context';
import {
    AgentToolResult,
    validateStringParam,
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

    public mode: BrowserMode = 'list';
    public isLoading = false;
    public dashboards: MJDashboardEntity[] = [];
    public categories: MJDashboardCategoryEntity[] = [];
    public selectedDashboard: MJDashboardEntity | null = null;
    public selectedCategoryId: string | null = null;
    public viewMode: DashboardBrowserViewMode = 'cards';
    public showAddPanelDialog = false;

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
    public showConfigDialog = false;
    public configDialogPanel: DashboardPanel | null = null;
    public configDialogPartType: MJDashboardPartTypeEntity | null = null;
    public configDialogClass: string = '';

    // Confirm dialog state
    public showConfirmDialog = false;
    public confirmPanelId: string = '';
    public confirmPanelTitle: string = '';

    // Share dialog state
    public showShareDialog = false;

    // Edit mode state for name/description
    public editingName = '';
    public editingDescription = '';
    private originalName = '';
    private originalDescription = '';
    private originalConfig = '';

    // Permission state for selected dashboard
    public selectedDashboardPermissions: DashboardUserPermissions = {
        DashboardID: '',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: true,
        IsOwner: true,
        PermissionSource: 'owner'
    };

    // Permission map for all dashboards (used by browser component)
    public dashboardPermissionsMap: Map<string, DashboardUserPermissions> = new Map();

    // Effective category map for shared dashboards (maps dashboard ID to effective category for display)
    public effectiveCategoryMap: Map<string, string | null> = new Map();

    private readonly _destroy$ = new Subject<void>();

    @ViewChild('dashboardViewer') dashboardViewer!: DashboardViewerComponent;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private cdr: ChangeDetectorRef,
        private route: ActivatedRoute) {
        super();
    }

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        super.ngOnInit();
        this.loadDashboards();
        this.subscribeToQueryParams();
        this.loadViewPreference();
        this.syncAgentToolsForMode();
        this.emitAgentContext();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this._destroy$.next();
        this._destroy$.complete();
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

        const selectedCategory = this.selectedCategoryId
            ? this.categories.find(c => UUIDsEqual(c.ID, this.selectedCategoryId!)) ?? null
            : null;

        const dashboardOpen = this.mode !== 'list' && this.selectedDashboard !== null;

        this.navigationService.SetAgentContext(this, buildDashboardBrowserAgentContext({
            Mode: this.mode,
            SelectedDashboardId: this.selectedDashboard?.ID ?? null,
            SelectedDashboardName: this.selectedDashboard?.Name ?? null,
            VisibleDashboardNames: this.dashboards.map(d => d.Name || '(untitled)'),
            TotalDashboardCount: this.TotalAccessibleDashboardCount,
            FilteredDashboardCount: this.dashboards.length,
            SearchText: this.agentSearchText,
            AvailableCategoryNames: this.categories.map(c => c.Name),
            SelectedCategoryId: this.selectedCategoryId,
            SelectedCategoryName: selectedCategory?.Name ?? null,
            ViewMode: this.viewMode,
            IsLoading: this.isLoading,
            // Opened-dashboard awareness (only meaningful when a dashboard is open)
            OpenedDashboardName: dashboardOpen ? (this.selectedDashboard?.Name ?? null) : null,
            OpenedDashboardId: dashboardOpen ? (this.selectedDashboard?.ID ?? null) : null,
            OpenedDashboardIsEditing: this.mode === 'edit',
            OpenedDashboardCanEdit: dashboardOpen ? this.selectedDashboardPermissions.CanEdit : false,
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
    private get TotalAccessibleDashboardCount(): number {
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
        const effective: 'list' | 'open' = this.mode === 'list' ? 'list' : 'open';
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
                    const v = validateStringParam(params['query'], 'query');
                    if (!v.ok) return v.result;
                    return this.AgentSearchDashboards(v.value);
                },
            },
            {
                Name: 'OpenDashboard',
                Description: 'Open a dashboard for viewing (inline). Accepts either the dashboard NAME (as listed in VisibleDashboards) or its ID. Works from the list and while another dashboard is open (to switch).',
                ParameterSchema: { type: 'object', properties: { dashboard: { type: 'string', description: 'The dashboard name or ID to open.' }, dashboardId: { type: 'string', description: 'Deprecated alias for "dashboard" — the dashboard ID.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = validateStringParam(params['dashboard'] ?? params['dashboardId'], 'dashboard');
                    if (!v.ok) return v.result;
                    return this.AgentOpenDashboard(v.value);
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
                Handler: async (): Promise<AgentToolResult> => this.AgentGetCategoryHierarchy(),
            },
            {
                Name: 'GetDashboardShares',
                Description: 'List who a dashboard is shared with and their access level (read/edit/delete/share). Defaults to the open dashboard; pass a dashboardId (or name) to inspect another accessible dashboard. Read-only — returns no secrets.',
                ParameterSchema: { type: 'object', properties: { dashboardId: { type: 'string', description: 'Optional dashboard ID or name. Defaults to the open dashboard.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.AgentGetDashboardShares(params['dashboardId']);
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
                    const v = validateStringParam(params['category'], 'category');
                    if (!v.ok) return v.result;
                    return this.AgentSelectCategory(v.value);
                },
            },
            {
                Name: 'FilterByCategory',
                Description: 'Filter the dashboard list to a category by its ID. Pass an empty string to clear the category filter (show root). Prefer SelectCategory, which also accepts a category name.',
                ParameterSchema: { type: 'object', properties: { categoryId: { type: 'string' } }, required: ['categoryId'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = validateStringParam(params['categoryId'], 'categoryId');
                    if (!v.ok) return v.result;
                    return this.AgentSelectCategory(v.value);
                },
            },
            {
                Name: 'ClearDashboardFilters',
                Description: 'Clear all active dashboard-list filters — both the text search and the category filter — and return to the full list at the root category.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async (): Promise<AgentToolResult> => this.AgentClearDashboardFilters(),
            },
            {
                Name: 'SwitchViewMode',
                Description: 'Switch the dashboard list view mode between "cards" and "list".',
                ParameterSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['cards', 'list'] } }, required: ['mode'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.AgentSwitchViewMode(params['mode']);
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
                    this.backToList();
                    this.emitAgentContext();
                    return { Success: true };
                },
            },
            {
                Name: 'GetDashboardPanels',
                Description: 'List the panels/widgets on a dashboard — each panel\'s title, part-type, and icon. Defaults to the open dashboard; pass a dashboardId (or name) to inspect another accessible dashboard. Read-only.',
                ParameterSchema: { type: 'object', properties: { dashboardId: { type: 'string', description: 'Optional dashboard ID or name. Defaults to the open dashboard.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.AgentGetDashboardPanels(params['dashboardId']);
                },
            },
            {
                Name: 'GetDashboardDetail',
                Description: 'Get detail about a dashboard — owner, created/updated dates, category, and the current user\'s access level (CanRead/Edit/Delete/Share, IsOwner). Defaults to the open dashboard; pass a dashboardId (or name) for another accessible dashboard. Read-only.',
                ParameterSchema: { type: 'object', properties: { dashboardId: { type: 'string', description: 'Optional dashboard ID or name. Defaults to the open dashboard.' } } },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.AgentGetDashboardDetail(params['dashboardId']);
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
    private AgentSearchDashboards(query: string): AgentToolResult {
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
        this.dashboards = matched.sort((a, b) =>
            new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime());
        this.mode = 'list';
        this.selectedDashboard = null;
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
    private AgentSelectCategory(categoryNameOrId: string): AgentToolResult {
        const raw = categoryNameOrId.trim();

        // Empty string clears the filter.
        if (!raw) {
            this.selectedCategoryId = null;
            this.mode = 'list';
            this.selectedDashboard = null;
            this.updateUrlQueryParams();
            this.emitAgentContext();
            this.cdr.detectChanges();
            return { Success: true };
        }

        // Prefer an exact id match, then fall back to a case-insensitive name match.
        const lowered = raw.toLowerCase();
        const match =
            this.categories.find(c => UUIDsEqual(c.ID, raw)) ??
            this.categories.find(c => (c.Name || '').toLowerCase() === lowered);

        if (!match) {
            const available = this.categories.map(c => c.Name).join(', ') || '(none)';
            return { Success: false, ErrorMessage: `No accessible category named or identified by "${raw}". Available categories: ${available}.` };
        }

        this.selectedCategoryId = match.ID;
        this.mode = 'list';
        this.selectedDashboard = null;
        this.updateUrlQueryParams();
        this.emitAgentContext();
        this.cdr.detectChanges();
        return { Success: true };
    }

    /** Clear both the text search and the category filter, returning to the full root list. */
    private AgentClearDashboardFilters(): AgentToolResult {
        this.agentSearchText = '';
        this.selectedCategoryId = null;
        this.mode = 'list';
        this.selectedDashboard = null;

        // Restore the full accessible list (the search may have narrowed this.dashboards).
        const engine = DashboardEngine.Instance;
        const md = this.ProviderToUse;
        this.dashboards = [...engine.GetAccessibleDashboards(md.CurrentUser.ID)].sort((a, b) =>
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
    private AgentOpenDashboard(dashboardNameOrId: string): AgentToolResult {
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
        this.openDashboard(dashboard);
        this.emitAgentContext();
        return { Success: true };
    }

    /** Switch and persist the list view mode (cards | list). */
    private AgentSwitchViewMode(rawMode: unknown): AgentToolResult {
        if (!isValidBrowserViewMode(rawMode)) {
            return { Success: false, ErrorMessage: 'mode must be one of: cards, list.' };
        }
        this.viewMode = rawMode;
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
            if (this.selectedDashboard) {
                return { ok: true, dashboard: this.selectedDashboard };
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
    private AgentGetDashboardPanels(rawDashboardId: unknown): AgentToolDataResult {
        const resolved = this.resolveDashboardForTool(rawDashboardId);
        if (!resolved.ok) return resolved.result;
        const dashboard = resolved.dashboard;

        // If this is the currently-open dashboard, read the viewer's live panels
        // (reflects any in-session, unsaved layout edits).
        const isOpen = this.selectedDashboard !== null && UUIDsEqual(dashboard.ID, this.selectedDashboard.ID);
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
    private AgentGetDashboardDetail(rawDashboardId: unknown): AgentToolDataResult {
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
    private AgentGetCategoryHierarchy(): AgentToolDataResult {
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
    private AgentGetDashboardShares(rawDashboardId: unknown): AgentToolDataResult {
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
    public onDashboardOpen(event: DashboardOpenEvent): void {
        if (event.OpenInNewTab) {
            // Open in a dedicated Explorer tab via NavigationService
            this.navigationService.OpenDashboard(
                event.Dashboard.ID,
                event.Dashboard.Name,
                { forceNewTab: true }
            );
        } else {
            // Open inline in the browser's view pane
            this.openDashboard(event.Dashboard);
        }
    }

    /**
     * Open the current dashboard in its own dedicated Explorer tab
     */
    public openInNewTab(): void {
        if (this.selectedDashboard) {
            this.navigationService.OpenDashboard(
                this.selectedDashboard.ID,
                this.selectedDashboard.Name,
                { forceNewTab: true }
            );
        }
    }

    /**
     * Handle dashboard edit request from generic browser
     */
    public onDashboardEdit(event: DashboardEditEvent): void {
        this.editDashboard(event.Dashboard);
    }

    /**
     * Handle dashboard delete request from generic browser
     */
    public async onDashboardDelete(event: DashboardDeleteEvent): Promise<void> {
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
                this.dashboards = this.dashboards.filter(d => !deletedIds.has(d.ID));
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

    /**
     * Handle dashboard move request from generic browser.
     * For owned dashboards: updates the dashboard's CategoryID directly.
     * For shared dashboards: creates/updates a DashboardCategoryLink to organize without modifying the original.
     */
    public async onDashboardMove(event: DashboardMoveEvent): Promise<void> {
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
                    this.effectiveCategoryMap.set(id, event.TargetCategoryId);
                }
                this.effectiveCategoryMap = new Map(this.effectiveCategoryMap);
                this.dashboards = [...this.dashboards];
                this.selectedCategoryId = event.TargetCategoryId;
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

    /**
     * Handle create dashboard request from generic browser
     */
    public async onDashboardCreate(event: DashboardCreateEvent): Promise<void> {
        await this.createDashboard(event.CategoryId);
    }

    /**
     * Handle category change from generic browser - update URL
     */
    public onCategoryChange(event: CategoryChangeEvent): void {
        this.selectedCategoryId = event.CategoryId;
        this.updateUrlQueryParams();
        this.emitAgentContext();
    }

    /**
     * Handle view preference change from generic browser - persist
     */
    public onViewPreferenceChange(event: ViewPreferenceChangeEvent): void {
        this.viewMode = event.ViewMode;
        this.saveViewPreference(event.ViewMode);
        this.emitAgentContext();
    }

    /**
     * Handle category create request from generic browser
     * Includes extensive logging for debugging category creation issues
     */
    public async onCategoryCreate(event: CategoryCreateEvent): Promise<void> {
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
                this.categories.push(category);
                this.categories = [...this.categories].sort((a, b) => a.Name.localeCompare(b.Name));
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

    /**
     * Handle category delete request from generic browser
     * Performs recursive deletion of category and all children
     */
    public async onCategoryDelete(event: CategoryDeleteEvent): Promise<void> {
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
            const dashboardsToUncategorize = this.dashboards.filter(d =>
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
                this.categories = this.categories.filter(c => !categoryIds.has(c.ID));
                this.dashboards = [...this.dashboards];
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

    /**
     * Handle breadcrumb navigation event
     * Navigates back to list view with optional category selection
     */
    public onBreadcrumbNavigate(event: BreadcrumbNavigateEvent): void {
        console.debug('[DashboardBrowserResource] Breadcrumb navigate:', event);

        // CategoryId is null for root, or a category ID string
        this.selectedCategoryId = event.CategoryId;
        this.backToList();
        this.updateUrlQueryParams();
    }

    // ========================================
    // Public Methods - Navigation
    // ========================================

    /**
     * Open a dashboard for viewing
     */
    public openDashboard(dashboard: MJDashboardEntity): void {
        this.selectedDashboard = dashboard;
        this.mode = 'view';

        // Compute permissions for the selected dashboard
        const md = this.ProviderToUse;
        this.selectedDashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
            dashboard.ID,
            md.CurrentUser.ID
        );

        this.updateUrlQueryParams();
        this.NotifyDisplayNameChanged(dashboard.Name || 'Dashboard');
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /**
     * Open a dashboard for editing
     */
    public editDashboard(dashboard: MJDashboardEntity): void {
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

        this.selectedDashboard = dashboard;
        this.selectedDashboardPermissions = permissions;
        this.mode = 'edit';

        // Initialize editing fields
        this.editingName = dashboard.Name;
        this.editingDescription = dashboard.Description || '';

        // Store originals for cancel
        this.originalName = dashboard.Name;
        this.originalDescription = dashboard.Description || '';
        this.originalConfig = dashboard.UIConfigDetails || '';

        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /**
     * Go back to list view
     */
    public backToList(): void {
        this.selectedDashboard = null;
        this.mode = 'list';
        this.updateUrlQueryParams();
        this.NotifyDisplayNameChanged('Dashboards');
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /**
     * Toggle edit mode for current dashboard
     */
    public toggleEditMode(): void {
        if (this.mode === 'view' && this.selectedDashboard) {
            this.editDashboard(this.selectedDashboard);
        } else if (this.mode === 'edit') {
            this.mode = 'view';
            this.cdr.detectChanges();
        }
    }

    /**
     * Open the share dialog for the current dashboard
     */
    public openShareDialog(): void {
        if (!this.selectedDashboard) return;

        // Verify user has share permission
        if (!this.selectedDashboardPermissions.CanShare) {
            console.warn('User does not have permission to share this dashboard');
            return;
        }

        this.showShareDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Close the share dialog
     */
    public closeShareDialog(): void {
        this.showShareDialog = false;
        this.cdr.detectChanges();
    }

    /**
     * Handle share dialog result
     */
    public onShareDialogResult(result: ShareDialogResult): void {
        this.showShareDialog = false;

        if (result.Action === 'save' && this.selectedDashboard) {
            // Recompute permissions after sharing changes
            const md = this.ProviderToUse;
            this.selectedDashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
                this.selectedDashboard.ID,
                md.CurrentUser.ID
            );
        }

        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Dashboard CRUD
    // ========================================

    /**
     * Create a new dashboard
     */
    public async createDashboard(categoryId?: string | null): Promise<void> {
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
            } else if (this.selectedCategoryId) {
                dashboard.CategoryID = this.selectedCategoryId;
            }

            const saved = await dashboard.Save();

            if (saved) {
                this.dashboards.unshift(dashboard);
                this.dashboards = [...this.dashboards];
                this.editDashboard(dashboard);
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

    /**
     * Save the current dashboard
     */
    public async saveDashboard(): Promise<void> {
        if (!this.selectedDashboard) return;

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            this.selectedDashboard.Name = this.editingName;
            this.selectedDashboard.Description = this.editingDescription;

            if (this.dashboardViewer) {
                await this.dashboardViewer.save();
            }

            this.originalName = this.editingName;
            this.originalDescription = this.editingDescription;
            this.originalConfig = this.selectedDashboard.UIConfigDetails || '';

            // Update the dashboard in the list
            this.dashboards = [...this.dashboards];

            this.mode = 'view';
        } catch (err) {
            console.error('Failed to save dashboard:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Cancel editing and revert changes
     */
    public cancelEdit(): void {
        if (!this.selectedDashboard) {
            this.backToList();
            return;
        }

        this.selectedDashboard.Name = this.originalName;
        this.selectedDashboard.Description = this.originalDescription;
        this.selectedDashboard.UIConfigDetails = this.originalConfig;

        this.editingName = '';
        this.editingDescription = '';

        this.mode = 'view';
        this.cdr.detectChanges();
    }

    /**
     * Handle name input blur - validate name is not empty
     */
    public onNameBlur(): void {
        if (!this.editingName.trim()) {
            this.editingName = this.originalName || 'Untitled Dashboard';
        }
    }

    // ========================================
    // Public Methods - Part Management
    // ========================================

    /**
     * Open the Add Part dialog
     */
    public openAddPartDialog(): void {
        this.showAddPanelDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handle panel interaction events from the viewer
     */
    public onPanelInteraction(event: PanelInteractionEvent): void {
        if (event.interactionType !== 'custom') return;

        const action = event.payload?.['action'];

        switch (action) {
            case 'add-panel-requested':
                this.openAddPartDialog();
                break;

            case 'configure-part-requested':
                this.openConfigDialog(event.panelId);
                break;

            case 'remove-part-requested':
                this.openRemoveConfirmDialog(
                    event.panelId,
                    event.payload?.['panelTitle'] as string || 'this part'
                );
                break;
        }
    }

    /**
     * Handle navigation events from panels
     */
    public onNavigationRequested(event: DashboardNavRequestEvent): void {
        const request = event.request;
        const openInNewTab = request.openInNewTab || false;

        switch (request.type) {
            case 'OpenEntityRecord': {
                // Navigate to entity record
                const compositeKey = new CompositeKey();
                compositeKey.SimpleLoadFromURLSegment(request.recordId);
                // If simple load didn't work (single ID without field name), look up actual PK field
                if (compositeKey.KeyValuePairs.length === 0) {
                    const md = this.ProviderToUse;
                    const entity = md.Entities.find(e => e.Name === request.entityName);
                    const pkFieldName = entity?.FirstPrimaryKey?.Name || 'ID';
                    compositeKey.LoadFromSingleKeyValuePair(pkFieldName, request.recordId);
                }
                this.navigationService.OpenEntityRecord(
                    request.entityName,
                    compositeKey,
                    { forceNewTab: openInNewTab }
                );
                break;
            }
            case 'OpenDashboard': {
                // Navigate to another dashboard
                const targetDashboard = this.dashboards.find(d => UUIDsEqual(d.ID, request.dashboardId));
                if (targetDashboard) {
                    if (openInNewTab) {
                        this.navigationService.OpenDashboard(
                            targetDashboard.ID,
                            targetDashboard.Name,
                            { forceNewTab: true }
                        );
                    } else {
                        this.openDashboard(targetDashboard);
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
    public async onPanelAdded(result: AddPanelResult): Promise<void> {
        if (this.dashboardViewer) {
            await this.dashboardViewer.addPanel(
                result.PartType.ID,
                result.Config,
                result.Title,
                result.Icon
            );
        }
        this.showAddPanelDialog = false;
        // Panel set changed — refresh opened-dashboard context for the agent.
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /**
     * Handle add panel dialog cancel
     */
    public onAddPanelCancelled(): void {
        this.showAddPanelDialog = false;
        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Config Dialog
    // ========================================

    /**
     * Open the config dialog for a panel
     */
    public openConfigDialog(panelId: string): void {
        if (!this.dashboardViewer) return;

        const panel = this.dashboardViewer.getPanel(panelId);
        const partType = this.dashboardViewer.getPartTypeForPanel(panelId);

        if (!panel || !partType) {
            console.warn('Could not find panel or part type for config dialog');
            return;
        }

        this.configDialogPanel = panel;
        this.configDialogPartType = partType;
        this.configDialogClass = partType.ConfigDialogClass || '';
        this.showConfigDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handle config dialog save
     */
    public onConfigDialogSaved(result: EditPartDialogResult): void {
        if (this.dashboardViewer && this.configDialogPanel) {
            this.dashboardViewer.updatePanelConfig(
                this.configDialogPanel.id,
                result.Config,
                result.Title,
                result.Icon
            );
        }
        this.closeConfigDialog();
        // A panel's title/icon/config may have changed — refresh agent context.
        this.emitAgentContext();
    }

    /**
     * Handle config dialog cancel
     */
    public onConfigDialogCancelled(): void {
        this.closeConfigDialog();
    }

    /**
     * Close the config dialog
     */
    private closeConfigDialog(): void {
        this.showConfigDialog = false;
        this.configDialogPanel = null;
        this.configDialogPartType = null;
        this.configDialogClass = '';
        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Remove Confirm Dialog
    // ========================================

    /**
     * Open the remove confirmation dialog
     */
    public openRemoveConfirmDialog(panelId: string, panelTitle: string): void {
        this.confirmPanelId = panelId;
        this.confirmPanelTitle = panelTitle;
        this.showConfirmDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handle remove confirmation
     */
    public onRemoveConfirmed(): void {
        if (this.dashboardViewer && this.confirmPanelId) {
            this.dashboardViewer.confirmRemovePanel(this.confirmPanelId);
        }
        this.closeRemoveConfirmDialog();
        // Panel set changed — refresh opened-dashboard context for the agent.
        this.emitAgentContext();
    }

    /**
     * Handle remove cancel
     */
    public onRemoveCancelled(): void {
        this.closeRemoveConfirmDialog();
    }

    /**
     * Close the remove confirm dialog
     */
    private closeRemoveConfirmDialog(): void {
        this.showConfirmDialog = false;
        this.confirmPanelId = '';
        this.confirmPanelTitle = '';
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
            this.dashboards = [...engine.GetAccessibleDashboards(currentUserId)].sort((a, b) =>
                new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime()
            );
            // Filter categories to only those owned by or shared with the current user
            this.categories = [...engine.GetAccessibleCategories(currentUserId)].sort((a, b) =>
                a.Name.localeCompare(b.Name)
            );

            // Build permissions map and effective category map for all dashboards
            this.dashboardPermissionsMap = new Map();
            this.effectiveCategoryMap = new Map();

            // Get category links for current user (from engine's cached data)
            const userCategoryLinks = engine.DashboardCategoryLinks.filter(
                link => UUIDsEqual(link.UserID, currentUserId)
            );

            for (const dashboard of this.dashboards) {
                const perms = engine.GetDashboardPermissions(dashboard.ID, currentUserId);
                this.dashboardPermissionsMap.set(dashboard.ID, perms);

                // For shared dashboards (not owned), determine effective category
                if (!perms.IsOwner) {
                    // Look for a category link for this dashboard
                    const categoryLink = userCategoryLinks.find(
                        link => UUIDsEqual(link.DashboardID, dashboard.ID)
                    );

                    if (categoryLink) {
                        // User has explicitly organized this shared dashboard
                        this.effectiveCategoryMap.set(dashboard.ID, categoryLink.DashboardCategoryID);
                    } else {
                        // No link exists - show in root (null category)
                        this.effectiveCategoryMap.set(dashboard.ID, null);
                    }
                }
                // For owned dashboards, we don't add to effectiveCategoryMap
                // so the browser will use the dashboard's actual CategoryID
            }

            console.debug('[DashboardBrowserResource] Loaded from DashboardEngine:', {
                dashboardCount: this.dashboards.length,
                categoryCount: this.categories.length,
                sharedDashboardsInEffectiveMap: this.effectiveCategoryMap.size,
                categories: this.categories.map(c => ({ id: c.ID, name: c.Name, parentId: c.ParentID }))
            });

            // After dashboards are loaded, check for deep-link from configuration
            // (e.g., pin navigation passes dashboard ID via queryParams in config)
            this.applyConfigurationState();

            // Also watch for late-arriving query params from pin navigation
            this.watchForLateQueryParams();

            this.emitAgentContext();
            this.NotifyLoadComplete();
        } catch (err) {
            console.error('Failed to load dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Apply initial state from resource configuration (handles pin navigation
     * and other deep-link scenarios where ActivatedRoute may not fire).
     */
    private applyConfigurationState(): void {
        const config = this.Data?.Configuration;
        if (!config) return;

        const qp = config['queryParams'] as Record<string, string> | undefined;
        const dashboardId = qp?.['dashboard'] || config['dashboard'] as string;
        const categoryId = qp?.['category'] || config['category'] as string;

        if (categoryId && categoryId !== this.selectedCategoryId) {
            this.selectedCategoryId = categoryId;
        }

        if (dashboardId && !this.selectedDashboard) {
            const dashboard = this.dashboards.find(d => UUIDsEqual(d.ID, dashboardId));
            if (dashboard) {
                this.openDashboard(dashboard);
            }
        }
    }

    /**
     * Check for late-arriving query params (e.g., from pin navigation where
     * UpdateActiveTabQueryParams runs after the component has already loaded).
     * Polls briefly for queryParams to appear in the URL.
     */
    private watchForLateQueryParams(): void {
        // Check every 200ms for up to 3 seconds for queryParams to appear
        // AND for dashboards to be loaded (both conditions must be met)
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (attempts > 15 || this.selectedDashboard) {
                clearInterval(interval);
                return;
            }
            // Re-check the URL directly since ActivatedRoute may not fire
            const url = window.location.href;
            const dashboardMatch = url.match(/[?&]dashboard=([^&]+)/);
            if (dashboardMatch && !this.selectedDashboard && this.dashboards.length > 0) {
                const dashboardId = decodeURIComponent(dashboardMatch[1]);
                const dashboard = this.dashboards.find(d => UUIDsEqual(d.ID, dashboardId));
                if (dashboard) {
                    this.openDashboard(dashboard);
                    this.cdr.detectChanges();
                    clearInterval(interval);
                }
            }
        }, 200);
    }

    // ========================================
    // Private Methods - URL Query Params
    // ========================================

    private subscribeToQueryParams(): void {
        this.route.queryParams
            .pipe(takeUntil(this._destroy$))
            .subscribe(params => {
                const categoryId = params['category'] || null;
                const dashboardId = params['dashboard'] || null;

                // Handle category change
                if (categoryId !== this.selectedCategoryId) {
                    this.selectedCategoryId = categoryId;
                }

                // Handle dashboard change (for browser back/forward)
                const currentDashboardId = this.selectedDashboard?.ID || null;
                if (dashboardId !== currentDashboardId) {
                    if (dashboardId) {
                        // Find and open the dashboard
                        const dashboard = this.dashboards.find(d => UUIDsEqual(d.ID, dashboardId));
                        if (dashboard) {
                            this.selectedDashboard = dashboard;
                            this.mode = 'view';
                        }
                    } else {
                        // Go back to list
                        this.selectedDashboard = null;
                        this.mode = 'list';
                    }
                }

                this.emitAgentContext();
                this.cdr.detectChanges();
            });
    }

    /**
     * Update the URL query params for the current tab.
     * Uses NavigationService to update the tab configuration, which triggers
     * the shell's URL sync mechanism to update the browser URL properly
     * while respecting app-scoped routes.
     */
    private updateUrlQueryParams(): void {
        const queryParams: Record<string, string | null> = {};

        // Track category
        if (this.selectedCategoryId) {
            queryParams['category'] = this.selectedCategoryId;
        } else {
            queryParams['category'] = null;
        }

        // Track dashboard (for browser back/forward support)
        if (this.selectedDashboard) {
            queryParams['dashboard'] = this.selectedDashboard.ID;
        } else {
            queryParams['dashboard'] = null;
        }

        // Use NavigationService to update query params properly
        // This ensures the URL update respects app-scoped routes
        this.navigationService.UpdateActiveTabQueryParams(queryParams);
    }

    // ========================================
    // Private Methods - Category Helpers
    // ========================================

    /**
     * Get all child categories of a parent category recursively
     */
    private getChildCategoriesRecursive(parentId: string): MJDashboardCategoryEntity[] {
        const children: MJDashboardCategoryEntity[] = [];
        const directChildren = this.categories.filter(c => UUIDsEqual(c.ParentID, parentId));

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
            this.viewMode = stored;
        }
    }

    private saveViewPreference(mode: DashboardBrowserViewMode): void {
        // TODO: Save to User Settings entity
        localStorage.setItem('dashboard-browser-view-mode', mode);
    }
}
