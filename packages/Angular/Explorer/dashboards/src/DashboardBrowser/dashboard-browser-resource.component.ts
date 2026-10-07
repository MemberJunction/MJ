import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { merge } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LogError } from '@memberjunction/core';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, DashboardFavoritesService } from '@memberjunction/ng-shared';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';
import { ResourceData, MJDashboardEntity, MJDashboardCategoryEntity, DashboardEngine, DashboardUserPermissions, MJDashboardCategoryLinkEntity, MJDashboardPermissionEntity, UserInfoEngine } from '@memberjunction/core-entities';
import {
    BuildDashboardBrowserAgentContext,
    IsValidBrowserViewMode,
} from './dashboard-browser-agent-context';
import {
    BrowseLocation,
    BuildLibraryRailSections,
    CountDashboardsByCategory,
    CountLibraryDashboards,
    DASHBOARD_LIBRARY_FILTERS,
    DashboardLibraryFilter,
    FilterDashboardsForLibrary,
    IsBrowsableDashboard,
    IsCategoryFolderLocation,
    IsDashboardLibraryFilter,
    LibraryEmptyState,
    LibraryEmptyStateText,
    LibraryFilterContext,
    LocationQueryParams,
    ParseRailItemId,
    RailActiveItemId,
    ResolveBrowseLocation,
    SameBrowseLocation,
    ToggleExpandedId,
    UNCATEGORIZED_CATEGORY_ID,
    VisibleLibraryDashboards,
    WithExpandedAncestors,
} from './dashboard-library-filter';
import { GetRecentDashboardIds, ObserveRecentDashboardChanges } from '../shared/dashboard-recents';
import { ObserveDashboardLibraryChanges } from '../shared/dashboard-library-changes';
import { BuildOwnerLabels, LoadDashboardOwnerNames, OwnerIdsToLoad } from '../shared/dashboard-owner-names';
import { CreateBlankDashboard, DashboardNameMaxLength, DashboardsAppOpenOptions } from '../shared/dashboards-app.helpers';
import {
    AgentToolResult,
    ValidateStringParam,
} from '../shared/agent-tool-validation';
import type {
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
    DashboardFavoriteToggleEvent,
} from '@memberjunction/ng-dashboard-viewer';
import { DASHBOARD_NAME_MAX_LENGTH } from '@memberjunction/ng-dashboard-viewer';

/**
 * Local shape for an agent client tool. Matches the inline array type that
 * `NavigationService.SetAgentClientTools` accepts, so the tool builders can
 * compose typed `AgentClientTool[]` arrays without `any`.
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
 * Library page of the Dashboards app. A left rail picks a Library filter (All, Mine, Shared with
 * me, Favorites, Recently opened), a category or Uncategorized; the generic
 * DashboardBrowserComponent lists the result. Every list is flat, favorites first, then the
 * dashboards opened last, then the rest; a category opens as a folder. Cards show a star the user
 * can toggle and the owner ("You" or the owner's name). A click opens the dashboard in a tab of the
 * Dashboards app, in place of the preview tab, so Back returns to the Library. A Shift, Ctrl or Cmd
 * click opens it in a separate tab. New dashboard asks for the name first, then opens the new
 * dashboard in edit mode.
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

    /**
     * Free-text search the agent has applied to the dashboard list (via the
     * SearchDashboards tool). Reported in the agent context so the agent knows
     * how the visible list is currently narrowed; cleared by ClearDashboardFilters.
     */
    private agentSearchText = '';

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

    // True once a load has applied the tab's creation-time query params. That
    // snapshot never changes, so later loads must not apply it again.
    private _initialQueryParamsApplied = false;

    private favorites = inject(DashboardFavoritesService);
    private recentAccess = inject(RecentAccessService);
    private appManager = inject(ApplicationManager);
    private notifications = inject(MJNotificationService);

    /** The active Library filter. A category is only selected under `all`. */
    public LibraryFilter: DashboardLibraryFilter = 'all';

    /** The dashboards given to the browser: the loaded list for the current location, in the Library order. */
    public VisibleDashboards: MJDashboardEntity[] = [];

    /** IDs of the user's favorite dashboards, for the card stars. */
    public FavoriteIds: string[] = [];

    /** Each dashboard's owner text ("You" or the owner's name), keyed by dashboard ID. */
    public OwnerLabels = new Map<string, string>();

    /** What an empty flat list shows at the current location. */
    public EmptyState: LibraryEmptyStateText = LibraryEmptyState({ Filter: 'all', CategoryId: null });

    /** Owner names read so far, keyed by normalized user ID. '' = the read did not return the user. */
    private ownerNames = new Map<string, string>();

    /** Normalized IDs of the owners whose names are being read. */
    private ownerReadsInFlight = new Set<string>();

    /** How many dashboards the browser shows for each Library filter. */
    public LibraryCounts: Record<DashboardLibraryFilter, number> = { all: 0, mine: 0, shared: 0, favorites: 0, recent: 0 };

    /** The rail's Library and Categories sections. */
    public RailSections: MJLeftNavSection[] = [];

    /** Rail ids of the expanded category tree items. */
    public RailExpandedIds: string[] = [];

    /** Whether the rail is collapsed to icons. Saved per user. */
    public RailCollapsed = false;

    /** True while the New dashboard dialog is open. */
    public ShowNewDashboardDialog = false;

    /** True while the dashboard named in the New dashboard dialog is being created. */
    public IsCreatingDashboard = false;

    /** The longest name the New dashboard dialog accepts. */
    public NewDashboardNameMaxLength = DASHBOARD_NAME_MAX_LENGTH;

    /** The category the dashboard named in the dialog is filed in; null for no category. */
    private newDashboardCategoryId: string | null = null;

    private static readonly RAIL_COLLAPSED_SETTING = 'mj.dashboards.browseRailCollapsed';

    // True once the top-level categories have been expanded on first load.
    private railExpansionInitialized = false;

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

        // Favorites and recents change while the Library is also a background tab. RecentItems fires
        // right after a dashboard open is logged; the record-log cache that recents are read from
        // reloads about 1.5 s later and then ObserveRecentDashboardChanges fires.
        merge(this.favorites.Changed$, this.recentAccess.RecentItems, ObserveRecentDashboardChanges())
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.onLibrarySourcesChanged());
        // The dashboard cache also changes while the Library is a background tab (saves and deletes
        // in other tabs or sessions), so the Library re-reads it and refreshes the view.
        ObserveDashboardLibraryChanges()
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.onLibraryCacheChanged());
        this.loadDashboards();
        this.loadViewPreference();
        this.registerAgentTools();
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
        // The Library filter and category need no list lookup — apply them eagerly either way.
        // Only a location change is reported to the agent, so the delivery that only removes the
        // `dashboard` param (after a `?dashboard=` link opens its dashboard) reports nothing.
        const previous = this.currentLocation;
        this.applyLocation(ResolveBrowseLocation(params) ?? { Filter: 'all', CategoryId: null });
        if (!SameBrowseLocation(previous, this.currentLocation)) {
            this.emitAgentContext();
        }

        if (params['dashboard'] && this.Dashboards.length === 0) {
            // List not loaded yet — defer the dashboard open until it is.
            this._pendingQueryParams = params;
            this.cdr.detectChanges();
            return;
        }
        this.applyDashboardSelectionFromParams(params);
    }

    /**
     * Opens the dashboard named by the `dashboard` query param,
     * then removes the param, so a reload does not open it again and the same
     * link opens it next time. Requires the dashboard list to be loaded.
     */
    private applyDashboardSelectionFromParams(params: Record<string, string>): void {
        const dashboardId = params['dashboard'] || null;
        if (dashboardId) {
            const dashboard = this.Dashboards.find(d => UUIDsEqual(d.ID, dashboardId));
            if (dashboard) {
                this.openDashboard(dashboard);
            }
            this.clearDashboardQueryParam();
        }
        this.cdr.detectChanges();
    }

    /**
     * Removes the `dashboard` query param from this tab. Deferred to a microtask
     * because UpdateQueryParams does nothing while OnQueryParamsChanged is being
     * delivered.
     */
    private clearDashboardQueryParam(): void {
        queueMicrotask(() => this.UpdateQueryParams({ dashboard: null }));
    }

    /**
     * Opens a dashboard in a tab of the Dashboards app (see DashboardsAppOpenOptions), in edit mode
     * when `openInEditMode` is set, and in a separate tab when `openInNewTab` is set. The Library
     * itself stays on the list.
     */
    private openDashboard(dashboard: MJDashboardEntity, openInEditMode = false, openInNewTab = false): void {
        this.navigationService.OpenDashboard(dashboard.ID, dashboard.Name, DashboardsAppOpenOptions(this.appManager, openInEditMode, openInNewTab));
    }

    // ========================================
    // BaseResourceComponent Implementation
    // ========================================

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Library';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-layer-group';
    }

    // ========================================
    // Library Rail
    // ========================================

    /** The rail item for the current Library filter or category. */
    public get RailActiveId(): string {
        return RailActiveItemId(this.currentLocation, this.Categories);
    }

    /** True unless one category's folder is open: every other location is a flat list. */
    public get IsFlatView(): boolean {
        return !IsCategoryFolderLocation(this.currentLocation);
    }

    /** Moves the Library to the Library filter, category or Uncategorized of the clicked rail item. */
    public OnRailItemClicked(item: MJLeftNavItem): void {
        const location = ParseRailItemId(item.id);
        if (location) {
            this.moveTo(location);
        }
    }

    /** Expands or collapses a category in the rail tree. */
    public OnRailItemToggled(item: MJLeftNavItem): void {
        this.RailExpandedIds = ToggleExpandedId(this.RailExpandedIds, item.id);
        this.cdr.detectChanges();
    }

    /** Collapses or expands the whole rail and saves the choice for the user. */
    public OnRailCollapsedChange(collapsed: boolean): void {
        this.RailCollapsed = collapsed;
        UserInfoEngine.Instance.SetSettingDebounced(DashboardBrowserResourceComponent.RAIL_COLLAPSED_SETTING, String(collapsed));
    }

    private get currentLocation(): BrowseLocation {
        return { Filter: this.LibraryFilter, CategoryId: this.SelectedCategoryId };
    }

    /** Applies a location the user chose, writes it to the URL, and reports it to the agent. */
    private moveTo(location: BrowseLocation): void {
        this.applyLocation(location);
        this.updateUrlQueryParams();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    /** Sets the Library filter and category, then recomputes what the browser and the rail show. */
    private applyLocation(location: BrowseLocation): void {
        this.LibraryFilter = location.Filter;
        this.SelectedCategoryId = location.CategoryId;
        this.refreshLibraryView();
    }

    /**
     * Recomputes what the browser and the rail show from the current state: the visible dashboards,
     * the stars, the owners, the empty state, the counts and the rail sections.
     */
    private refreshLibraryView(): void {
        const context = this.libraryContext();
        this.VisibleDashboards = VisibleLibraryDashboards(this.Dashboards, this.currentLocation, context, this.EffectiveCategoryMap);
        this.FavoriteIds = context.FavoriteIds;
        this.OwnerLabels = BuildOwnerLabels(this.Dashboards, context.CurrentUserId, this.ownerNames);
        this.EmptyState = LibraryEmptyState(this.currentLocation);
        this.LibraryCounts = CountLibraryDashboards(this.Dashboards, context);
        const categoryCounts = CountDashboardsByCategory(this.Dashboards, this.Categories, this.EffectiveCategoryMap);
        this.RailSections = BuildLibraryRailSections(this.LibraryCounts, this.Categories, categoryCounts.ByCategory, categoryCounts.Uncategorized);
        this.refreshRailExpansion();
    }

    /**
     * Expands the top-level categories the first time there are any, then keeps the user's
     * choices, adding only the folders above the selected category so it stays visible.
     */
    private refreshRailExpansion(): void {
        if (!this.railExpansionInitialized && this.Categories.length > 0) {
            const topLevelItems = this.RailSections.flatMap(section => section.items);
            this.RailExpandedIds = topLevelItems.filter(item => item.children?.length).map(item => item.id);
            this.railExpansionInitialized = true;
        }
        this.RailExpandedIds = WithExpandedAncestors(this.RailExpandedIds, this.SelectedCategoryId, this.Categories);
    }

    private libraryContext(): LibraryFilterContext {
        return {
            CurrentUserId: this.ProviderToUse.CurrentUser.ID,
            FavoriteIds: this.favorites.FavoriteIds(),
            RecentIds: GetRecentDashboardIds(this.ProviderToUse),
        };
    }

    /**
     * Favorites or recents changed: recompute the view, which re-sorts it, and re-render. Does not
     * report to the agent, because these changes also arrive while the Library is a background tab
     * and the agent context belongs to the active tab.
     */
    private onLibrarySourcesChanged(): void {
        this.refreshLibraryView();
        this.cdr.detectChanges();
    }

    /**
     * The dashboard cache changed: re-read it, refresh the view and read the names of new owners.
     * Does not report to the agent, because this also runs while the Library is a background tab.
     */
    private onLibraryCacheChanged(): void {
        this.readLibraryFromEngine();
        this.refreshLibraryView();
        this.cdr.detectChanges();
        void this.refreshOwnerNames();
    }

    // ========================================
    // Agent Context & Client Tools
    //
    // 🔒 SAFETY BOUNDARY: the Library page exposes ONLY read-only /
    // navigational tools to the AI agent: SearchDashboards, OpenDashboard (opens
    // the dashboard), RefreshDashboardList, SelectLibraryFilter,
    // SelectCategory, FilterByCategory, ClearDashboardFilters, SwitchViewMode, and
    // the read-only detail tools GetCategoryHierarchy and GetDashboardShares.
    //
    // Mutating operations — create / delete / save / share / move a dashboard,
    // create / delete a category, add or remove a favorite — are intentionally
    // NOT exposed. The agent helps the user find, open, and understand dashboards
    // (the category tree and who a dashboard is shared with); the user performs
    // every mutation from the UI, including the star on a card. Do NOT add a
    // mutating tool here without revisiting this boundary.
    // ========================================

    /**
     * Report the current browser state to the AI agent (async chat agent and
     * realtime co-agent). Re-emit whenever the list, search, category filter,
     * view mode, or loading state changes.
     */
    private emitAgentContext(): void {
        const context = this.libraryContext();
        this.navigationService.SetAgentContext(this, BuildDashboardBrowserAgentContext({
            VisibleDashboardNames: this.VisibleDashboards.map(d => d.Name || '(untitled)'),
            TotalDashboardCount: this.totalAccessibleDashboardCount,
            FilteredDashboardCount: this.VisibleDashboards.length,
            LibraryFilter: this.LibraryFilter,
            LibraryCounts: this.LibraryCounts,
            RecentlyOpenedNames: FilterDashboardsForLibrary(this.Dashboards.filter(IsBrowsableDashboard), 'recent', context).map(d => d.Name),
            SearchText: this.agentSearchText,
            AvailableCategoryNames: this.Categories.map(c => c.Name),
            SelectedCategoryId: this.SelectedCategoryId,
            SelectedCategoryName: this.selectedCategoryName,
            ViewMode: this.ViewMode,
            IsLoading: this.isLoading,
        }));
    }

    /** The name of the selected category, "Uncategorized" for that list, or null for none. */
    private get selectedCategoryName(): string | null {
        if (this.SelectedCategoryId === UNCATEGORIZED_CATEGORY_ID) {
            return 'Uncategorized';
        }
        const selectedCategory = this.SelectedCategoryId
            ? this.Categories.find(c => UUIDsEqual(c.ID, this.SelectedCategoryId)) ?? null
            : null;
        return selectedCategory?.Name ?? null;
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
     * Registers the agent client tools. The Library always shows the list, so the
     * tool set never changes and is registered once.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [...this.commonTools(), ...this.listModeTools()]);
    }

    /**
     * Tools to find, open, and reload dashboards, plus the read-only detail
     * tools (category tree, shares).
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
                Description: 'Open a dashboard. Accepts either the dashboard NAME (as listed in VisibleDashboards) or its ID.',
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
                Description: 'List who a dashboard is shared with and their access level (read/edit/delete/share). Pass the dashboard ID or name. Read-only — returns no secrets.',
                ParameterSchema: { type: 'object', properties: { dashboardId: { type: 'string', description: 'The dashboard ID or name.' } }, required: ['dashboardId'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.agentGetDashboardShares(params['dashboardId']);
                },
            },
        ];
    }

    /**
     * Tools that shape the list — the Library filter, category filtering, clear
     * filters, and view-mode toggling.
     */
    private listModeTools(): AgentClientTool[] {
        return [
            {
                Name: 'SelectLibraryFilter',
                Description: 'Show one Library list from the rail: "all" (every dashboard: favorites first, then the ones opened last, then the rest), "mine" (dashboards the user owns), "shared" (dashboards shared with the user), "favorites", or "recent" (recently opened, the most recent first). Clears any category filter.',
                ParameterSchema: { type: 'object', properties: { filter: { type: 'string', enum: [...DASHBOARD_LIBRARY_FILTERS] } }, required: ['filter'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    return this.agentSelectLibraryFilter(params['filter']);
                },
            },
            {
                Name: 'SelectCategory',
                Description: 'Filter the dashboard list to a category. Accepts either the category NAME (as listed in AvailableCategories) or its ID, or "Uncategorized" for the dashboards in no category. Pass an empty string to clear the category filter (show the whole list).',
                ParameterSchema: { type: 'object', properties: { category: { type: 'string', description: 'The category name or ID to filter by, or "Uncategorized". Empty string clears the filter.' } }, required: ['category'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = ValidateStringParam(params['category'], 'category');
                    if (!v.ok) return v.result;
                    return this.agentSelectCategory(v.value);
                },
            },
            {
                Name: 'FilterByCategory',
                Description: 'Filter the dashboard list to a category by its ID. Pass an empty string to clear the category filter (show the whole list). Prefer SelectCategory, which also accepts a category name.',
                ParameterSchema: { type: 'object', properties: { categoryId: { type: 'string' } }, required: ['categoryId'] },
                Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
                    const v = ValidateStringParam(params['categoryId'], 'categoryId');
                    if (!v.ok) return v.result;
                    return this.agentSelectCategory(v.value);
                },
            },
            {
                Name: 'ClearDashboardFilters',
                Description: 'Clear all active dashboard-list filters — the text search, the Library filter and the category filter — and return to the full list (All dashboards).',
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
     * Filter the dashboard list by a text query against name + description.
     * The generic browser owns the category/view chrome; this surfaces a
     * name/description filter via the same selected-category mechanism is not
     * applicable, so we narrow the in-memory list the browser renders.
     */
    private agentSearchDashboards(query: string): AgentToolResult {
        this.agentSearchText = query.trim();
        this.Dashboards = this.readSearchedDashboards();
        this.refreshLibraryView();
        this.emitAgentContext();
        this.cdr.detectChanges();
        return { Success: true };
    }

    /** Show one Library list; clears any category filter. */
    private agentSelectLibraryFilter(rawFilter: unknown): AgentToolResult {
        if (!IsDashboardLibraryFilter(rawFilter)) {
            return { Success: false, ErrorMessage: `filter must be one of: ${DASHBOARD_LIBRARY_FILTERS.join(', ')}.` };
        }
        this.moveTo({ Filter: rawFilter, CategoryId: null });
        return { Success: true };
    }

    /**
     * Apply a category filter by NAME or ID (empty string clears it). Resolves a
     * supplied name (case-insensitive) to its id against the loaded, accessible
     * category list — mirroring the Data Explorer's SelectView name→id resolution.
     * "Uncategorized" (when no category has that name) shows the dashboards in no
     * category. A category is shown under the All Library filter.
     */
    private agentSelectCategory(categoryNameOrId: string): AgentToolResult {
        const raw = categoryNameOrId.trim();

        // Empty string clears the filter.
        if (!raw) {
            this.moveTo({ Filter: this.LibraryFilter, CategoryId: null });
            return { Success: true };
        }

        // Prefer an exact id match, then fall back to a case-insensitive name match.
        const lowered = raw.toLowerCase();
        const match =
            this.Categories.find(c => UUIDsEqual(c.ID, raw)) ??
            this.Categories.find(c => (c.Name || '').toLowerCase() === lowered);

        if (!match && lowered === UNCATEGORIZED_CATEGORY_ID) {
            this.moveTo({ Filter: 'all', CategoryId: UNCATEGORIZED_CATEGORY_ID });
            return { Success: true };
        }

        if (!match) {
            const available = this.Categories.map(c => c.Name).join(', ') || '(none)';
            return { Success: false, ErrorMessage: `No accessible category named or identified by "${raw}". Available categories: ${available}.` };
        }

        this.moveTo({ Filter: 'all', CategoryId: match.ID });
        return { Success: true };
    }

    /** Clear the text search, the Library filter and the category filter, returning to All dashboards. */
    private agentClearDashboardFilters(): AgentToolResult {
        this.agentSearchText = '';

        // Restore the full accessible list (the search may have narrowed this.dashboards).
        this.Dashboards = this.readSearchedDashboards();

        this.moveTo({ Filter: 'all', CategoryId: null });
        return { Success: true };
    }

    /**
     * Open a dashboard by NAME or ID. Resolves against the full
     * accessible list (see {@link resolveDashboardForTool}), so a prior search
     * that narrowed the visible list does not hide it.
     */
    private agentOpenDashboard(dashboardNameOrId: string): AgentToolResult {
        const resolved = this.resolveDashboardForTool(dashboardNameOrId);
        if (!resolved.ok) return resolved.result;
        this.openDashboard(resolved.dashboard);
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
    // Read-only detail tools (GetCategoryHierarchy / GetDashboardShares).
    // These return descriptive data only — no mutations, never throw.
    // ========================================

    /**
     * Resolve a tool's dashboard param (ID **or** name) to an accessible
     * dashboard: an exact ID match first, then a case-insensitive name match.
     * Returns a tolerant error result when the param is missing or nothing
     * matches.
     */
    private resolveDashboardForTool(
        rawParam: unknown,
    ): { ok: true; dashboard: MJDashboardEntity } | { ok: false; result: AgentToolResult } {
        const raw = typeof rawParam === 'string' ? rawParam.trim() : '';
        if (!raw) {
            return { ok: false, result: { Success: false, ErrorMessage: 'A dashboard ID or name is required.' } };
        }

        // Search the full accessible set (not this.Dashboards, which a prior
        // search may have narrowed).
        const md = this.ProviderToUse;
        const accessible = DashboardEngine.Instance.GetAccessibleDashboards(md.CurrentUser.ID);

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

    // ========================================
    // Event Handlers from Generic Browser
    // ========================================

    /**
     * Handle dashboard open request from generic browser: open the dashboard, in a separate tab for a
     * Shift, Ctrl or Cmd click.
     */
    public OnDashboardOpen(event: DashboardOpenEvent): void {
        this.openDashboard(event.Dashboard, false, event.OpenInNewTab);
    }

    /** @deprecated Use {@link OnDashboardOpen}. */
    public onDashboardOpen(event: DashboardOpenEvent): void {
      return this.OnDashboardOpen(event);
    }

    /**
     * Handle dashboard edit request from generic browser: open it in edit mode.
     */
    public OnDashboardEdit(event: DashboardEditEvent): void {
        this.openDashboard(event.Dashboard, true);
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
                this.refreshLibraryView();
            } else {
                console.error('Failed to delete dashboards — all changes rolled back');
            }
        } catch (err) {
            console.error('Failed to delete dashboards:', err);
        } finally {
            this.isLoading = false;
            this.emitAgentContext();
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
                // The folder view follows the moved dashboards; a flat Library list still shows them.
                this.applyLocation(this.IsFlatView ? this.currentLocation : { Filter: 'all', CategoryId: event.TargetCategoryId });
                this.updateUrlQueryParams();
            } else {
                console.error('Failed to move dashboards — all changes rolled back');
            }
        } catch (err) {
            console.error('Failed to move dashboards:', err);
        } finally {
            this.isLoading = false;
            this.emitAgentContext();
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link OnDashboardMove}. */
    public async onDashboardMove(event: DashboardMoveEvent): Promise<void> {
      return this.OnDashboardMove(event);
    }

    /** The generic browser asks for a new dashboard (its New menu or an empty state): asks for the name first. */
    public async OnDashboardCreate(event: DashboardCreateEvent): Promise<void> {
        this.OpenNewDashboardDialog(event.CategoryId);
    }

    /** @deprecated Use {@link OnDashboardCreate}. */
    public async onDashboardCreate(event: DashboardCreateEvent): Promise<void> {
      return this.OnDashboardCreate(event);
    }

    /** Stars or unstars a dashboard from its card. Changed$ then re-sorts the Library. */
    public async OnDashboardFavoriteToggle(event: DashboardFavoriteToggleEvent): Promise<void> {
        const dashboard = event.Dashboard;
        try {
            const isFavorite = await this.favorites.Toggle(dashboard.ID);
            const message = isFavorite ? `Added "${dashboard.Name}" to favorites` : `Removed "${dashboard.Name}" from favorites`;
            this.notifications.CreateSimpleNotification(message, 'success', 2000);
            this.emitAgentContext();
        } catch (error) {
            LogError(`Dashboards Library: could not change the favorite: ${error instanceof Error ? error.message : String(error)}`);
            this.notifications.CreateSimpleNotification('Could not change the favorite', 'error', 3000);
        }
    }

    /**
     * Handle folder navigation in the generic browser and update the URL. Entering a
     * folder shows it under the All Library filter; going back to the root shows the
     * current Library filter's flat list.
     */
    public OnCategoryChange(event: CategoryChangeEvent): void {
        this.moveTo({ Filter: event.CategoryId ? 'all' : this.LibraryFilter, CategoryId: event.CategoryId });
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
                this.refreshLibraryView();
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
            this.emitAgentContext();
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
                this.refreshLibraryView();
            } else {
                console.error('[DashboardBrowserResource] Failed to delete categories — all changes rolled back');
            }
        } catch (err) {
            console.error('[DashboardBrowserResource] Exception deleting category:', err);
        } finally {
            this.isLoading = false;
            this.emitAgentContext();
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link OnCategoryDelete}. */
    public async onCategoryDelete(event: CategoryDeleteEvent): Promise<void> {
      return this.OnCategoryDelete(event);
    }

    // ========================================
    // Public Methods - Dashboard CRUD
    // ========================================

    /**
     * Opens the New dashboard dialog. The dashboard is filed in `categoryId`, else in the open
     * category folder, else in no category.
     */
    public OpenNewDashboardDialog(categoryId?: string | null): void {
        this.newDashboardCategoryId = categoryId ?? (IsCategoryFolderLocation(this.currentLocation) ? this.SelectedCategoryId : null);
        this.NewDashboardNameMaxLength = DashboardNameMaxLength(this.ProviderToUse);
        this.ShowNewDashboardDialog = true;
        this.cdr.detectChanges();
    }

    /** Closes the New dashboard dialog and creates nothing. */
    public OnNewDashboardCancelled(): void {
        this.ShowNewDashboardDialog = false;
        this.cdr.detectChanges();
    }

    /**
     * Creates the dashboard named in the dialog, reloads the cache the dashboard tab reads from, puts
     * the dashboard first in the list, and opens it in edit mode in a tab of the Dashboards app. When
     * the save fails, the dialog stays open with the name and the user is told. A second call while
     * the dashboard is being created does nothing.
     */
    public async OnNewDashboardNamed(name: string): Promise<void> {
        if (this.IsCreatingDashboard) return;
        this.setCreatingDashboard(true);
        try {
            const dashboard = await CreateBlankDashboard(this.ProviderToUse, name, this.newDashboardCategoryId);
            if (!dashboard) {
                this.notifications.CreateSimpleNotification('Could not create the dashboard', 'error', 3000);
                return;
            }
            await this.reloadDashboardCache();
            this.ShowNewDashboardDialog = false;
            this.Dashboards = [dashboard, ...this.Dashboards.filter(d => !UUIDsEqual(d.ID, dashboard.ID))];
            this.refreshLibraryView();
            this.emitAgentContext();
            this.openDashboard(dashboard, true);
        } finally {
            this.setCreatingDashboard(false);
        }
    }

    /** @deprecated Use {@link OpenNewDashboardDialog}. */
    public async CreateDashboard(categoryId?: string | null): Promise<void> {
        this.OpenNewDashboardDialog(categoryId);
    }

    /** @deprecated Use {@link OpenNewDashboardDialog}. */
    public async createDashboard(categoryId?: string | null): Promise<void> {
      return this.CreateDashboard(categoryId);
    }

    /** Sets whether the named dashboard is being created, and re-renders the dialog. */
    private setCreatingDashboard(creating: boolean): void {
        this.IsCreatingDashboard = creating;
        this.cdr.detectChanges();
    }

    // ========================================
    // Private Methods - Data Loading
    // ========================================

    /** Reloads the dashboard cache before the new dashboard's tab opens: the tab reads the dashboard from it. A failure is only logged. */
    private async reloadDashboardCache(): Promise<void> {
        try {
            await DashboardEngine.Instance.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
        } catch (error) {
            LogError(`Dashboards Library: could not reload the dashboards: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async loadDashboards(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            // Use DashboardEngine for consistent cached data. RecentAccessService is loaded only as a
            // change trigger; Recently opened reads the record-log cache (GetRecentDashboardIds).
            const engine = DashboardEngine.Instance;
            await Promise.all([engine.Config(false), this.recentAccess.LoadRecentItems()]);

            this.readLibraryFromEngine();

            console.debug('[DashboardBrowserResource] Loaded from DashboardEngine:', {
                dashboardCount: this.Dashboards.length,
                categoryCount: this.Categories.length,
                sharedDashboardsInEffectiveMap: this.EffectiveCategoryMap.size,
                categories: this.Categories.map(c => ({ id: c.ID, name: c.Name, parentId: c.ParentID }))
            });

            // List is now loaded — apply any query-param selection. Use params deferred by
            // OnQueryParamsChanged during the load if present. Otherwise the first load reads
            // the tab's creation-time params (covers hosts that give no tab id); later loads
            // skip that snapshot, which would reopen a dashboard that was already opened.
            const params = this._pendingQueryParams ?? (this._initialQueryParamsApplied ? null : this.GetQueryParams());
            this._pendingQueryParams = null;
            this._initialQueryParamsApplied = true;
            // Params without `lib` or `category` keep the current location.
            this.applyLocation((params && ResolveBrowseLocation(params)) ?? this.currentLocation);
            if (params && Object.keys(params).length > 0) {
                this.applyDashboardSelectionFromParams(params);
            }

            this.emitAgentContext();
            void this.refreshOwnerNames();
        } catch (err) {
            console.error('Failed to load dashboards:', err);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.detectChanges();
        }
    }

    /**
     * Reads the library from the engine cache: the dashboards the user can access (narrowed by an
     * agent search), the categories owned by or shared with the user (by name), and the permission
     * and effective-category maps.
     */
    private readLibraryFromEngine(): void {
        const engine = DashboardEngine.Instance;
        const currentUserId = this.ProviderToUse.CurrentUser.ID;
        this.Dashboards = this.readSearchedDashboards();
        this.Categories = [...engine.GetAccessibleCategories(currentUserId)].sort((a, b) =>
            a.Name.localeCompare(b.Name)
        );
        this.buildPermissionMaps(engine, currentUserId);
    }

    /**
     * The dashboards the user can access whose name or description contains the agent's search text
     * (all when there is none). The Library order is applied when the view is refreshed.
     */
    private readSearchedDashboards(): MJDashboardEntity[] {
        const accessible = DashboardEngine.Instance.GetAccessibleDashboards(this.ProviderToUse.CurrentUser.ID);
        const q = this.agentSearchText.toLowerCase();
        return q
            ? accessible.filter(d =>
                (d.Name || '').toLowerCase().includes(q) ||
                (d.Description || '').toLowerCase().includes(q))
            : [...accessible];
    }

    /**
     * Reads the names of owners not read yet and not being read, then shows them on the cards.
     * Never throws.
     */
    private async refreshOwnerNames(): Promise<void> {
        const provider = this.ProviderToUse;
        const userId = provider.CurrentUser.ID;
        const missing = OwnerIdsToLoad(DashboardEngine.Instance.GetAccessibleDashboards(userId), userId, this.ownerNames)
            .filter(id => !this.ownerReadsInFlight.has(id));
        if (missing.length === 0) return;
        missing.forEach(id => this.ownerReadsInFlight.add(id));
        try {
            const loaded = await LoadDashboardOwnerNames(provider, missing);
            for (const id of missing) this.ownerNames.set(id, loaded.get(id) ?? '');
            this.refreshLibraryView();
            this.cdr.detectChanges();
        } catch (error) {
            LogError(`Dashboards Library: could not read the dashboard owners: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            missing.forEach(id => this.ownerReadsInFlight.delete(id));
        }
    }

    /**
     * Builds the permission map, and the effective category of each shared dashboard, for every
     * dashboard the user can access. An agent search that narrows the list does not narrow the maps.
     */
    private buildPermissionMaps(engine: DashboardEngine, currentUserId: string): void {
        this.DashboardPermissionsMap = new Map();
        this.EffectiveCategoryMap = new Map();

        // Get category links for current user (from engine's cached data)
        const userCategoryLinks = engine.DashboardCategoryLinks.filter(
            link => UUIDsEqual(link.UserID, currentUserId)
        );

        for (const dashboard of engine.GetAccessibleDashboards(currentUserId)) {
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
    }

    // ========================================
    // Private Methods - URL Query Params
    // ========================================

    /**
     * Update the URL query params for the current tab: the Library filter (`lib`,
     * omitted for All), the category filter, and no `dashboard` param (the Library
     * never shows a dashboard itself).
     * Routes through BaseResourceComponent.UpdateQueryParams, which updates the tab
     * configuration (triggering the shell's URL sync while respecting app-scoped
     * routes) and is auto-suppressed while delivering OnQueryParamsChanged so
     * reflecting URL → state never loops back into a redundant URL push.
     */
    private updateUrlQueryParams(): void {
        this.UpdateQueryParams({
            ...LocationQueryParams(this.currentLocation),
            dashboard: null,
        });
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
        this.RailCollapsed = UserInfoEngine.Instance.GetSetting(DashboardBrowserResourceComponent.RAIL_COLLAPSED_SETTING) === 'true';
    }

    private saveViewPreference(mode: DashboardBrowserViewMode): void {
        // TODO: Save to User Settings entity
        localStorage.setItem('dashboard-browser-view-mode', mode);
    }
}
