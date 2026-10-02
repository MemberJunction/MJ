import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { Subject, merge } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseResourceComponent, NavigationService, RecentAccessService, RecentAccessItem, HomeAppPinService, HomeAppPinnedItem, HomeAppPinInput, ActionPinConfiguration, DashboardFavoritesService, HomeDashboardTabsService, IsDashboardEntity } from '@memberjunction/ng-shared';
import { ResourceTypeForEntity } from '@memberjunction/ng-shared-generic';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { Metadata, CompositeKey, EntityRecordNameInput, RunView, PermissionConstrainedError, LogError } from '@memberjunction/core';
import { ResourceData, MJUserFavoriteEntity, MJUserNotificationEntity, UserInfoEngine, DashboardEngine, UserViewEngine, QueryEngine, MJDashboardEntity } from '@memberjunction/core-entities';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import type { DashboardNavRequestEvent } from '@memberjunction/ng-dashboard-viewer';
import { UserAppConfigComponent } from '@memberjunction/ng-explorer-settings';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ActionPinConfigResult } from './action-pin-config-dialog.component';
import { ActionPinRunResult } from './action-pin-runner-dialog.component';
import { BuildHomeAgentContext, BuildHomeNotFoundError, ResolveNamedRecord, NamedRecord, RecentItemSummary } from './home-agent-context';
import { BuildHomeDashboardStrip } from './home-dashboards-strip.helpers';
import {
  EmptyHomeDashboardTileSizes,
  HomeDashboardTileSizes,
  ParseHomeDashboardTileSizes,
  SerializeHomeDashboardTileSizes,
} from './home-dashboard-tile-layout';
import { ElementHasSize, ElementSizeWait } from './element-size-wait';
import {
  CreateHomeTabView,
  FindHomeTab,
  HOME_OVERVIEW_TAB_ID,
  HOME_OVERVIEW_TAB_NAME,
  HomeTabView,
  IsHomeOverviewTab,
  PlanHomeTabView,
  ResolveHomeTabReference,
} from './home-dashboard-tabs.helpers';
import { AgentToolResult, ValidateStringParam } from '../shared/agent-tool-validation';
import { AutoInstallDashboardsApp, CreateBlankDashboard, EnsureDashboardsApp } from '../shared/dashboards-app.helpers';
import { ObserveDashboardLibraryChanges, ObserveHomeTabsChanges } from '../shared/dashboard-library-changes';
import { GetRecentDashboardIds, ObserveRecentDashboardChanges } from '../shared/dashboard-recents';

/** The query param that names the open Home tab. The shell reads `tab` as a workspace tab id, so Home uses its own name. */
const HOME_TAB_QUERY_PARAM = 'homeTab';

/** User setting for the Dashboards strip: 'true' when collapsed, 'false' when open. A missing setting means open. */
const DASHBOARDS_COLLAPSED_SETTING = 'HomeApp.DashboardsCollapsed';

/** User setting for the Pinned section: 'true' when collapsed, 'false' when open. A missing setting means open. */
const PINNED_COLLAPSED_SETTING = 'HomeApp.PinnedCollapsed';

/** User setting for the row heights and tile widths of the Dashboards tiles (JSON; see home-dashboard-tile-layout.ts). */
const DASHBOARD_TILE_SIZES_SETTING = 'HomeApp.DashboardTileSizes';

/**
 * Cached app data with pre-computed values for optimal rendering performance
 */
interface AppDisplayData {
  app: BaseApplication;
  color: string;
  icon: string;
  navItemsCount: number;
  navItemsPreview: { Label: string; Icon: string }[];
  showMoreItems: boolean;
  moreItemsCount: number;
}

/**
 * Home Dashboard - Personalized home screen showing all available applications
 * with quick access navigation and configuration options.
 *
 * Uses OnPush change detection and cached computed values for optimal performance.
 * Registered as a BaseResourceComponent so it can be used as a Custom resource type
 * in nav items, allowing users to return to the Home dashboard after viewing orphan resources.
 */
@Component({
  standalone: false,
  selector: 'mj-home-dashboard',
  templateUrl: './home-dashboard.component.html',
  styleUrls: ['./home-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseResourceComponent, 'HomeDashboard')
export class HomeDashboardComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
  protected override destroy$ = new Subject<void>();
  private metadata = this.ProviderToUse;
  private pinService = inject(HomeAppPinService);
  private favoritesService = inject(DashboardFavoritesService);

  @ViewChild('appConfigDialog') AppConfigDialog!: UserAppConfigComponent;

  /** @deprecated Use {@link AppConfigDialog}. */
  get appConfigDialog(): UserAppConfigComponent {
    return this.AppConfigDialog;
  }
  /** @deprecated Use {@link AppConfigDialog}. */
  set appConfigDialog(value: UserAppConfigComponent) {
    this.AppConfigDialog = value;
  }

  // State
  public isLoading = true;
  public Apps: BaseApplication[] = [];

  /** @deprecated Use {@link Apps}. */
  public get apps(): BaseApplication[] {
    return this.Apps;
  }
  /** @deprecated Use {@link Apps}. */
  public set apps(value: BaseApplication[]) {
    this.Apps = value;
  }
  public AppsDisplayData: AppDisplayData[] = [];

  /** @deprecated Use {@link AppsDisplayData}. */
  public get appsDisplayData(): AppDisplayData[] {
    return this.AppsDisplayData;
  }
  /** @deprecated Use {@link AppsDisplayData}. */
  public set appsDisplayData(value: AppDisplayData[]) {
    this.AppsDisplayData = value;
  } // Pre-computed display data
  public CurrentUser: { Name: string; Email: string } | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  public get currentUser(): { Name: string; Email: string } | null {
    return this.CurrentUser;
  }
  /** @deprecated Use {@link CurrentUser}. */
  public set currentUser(value: { Name: string; Email: string } | null) {
    this.CurrentUser = value;
  }
  public ShowConfigDialog = false;

  /** @deprecated Use {@link ShowConfigDialog}. */
  public get showConfigDialog() {
    return this.ShowConfigDialog;
  }
  /** @deprecated Use {@link ShowConfigDialog}. */
  public set showConfigDialog(value) {
    this.ShowConfigDialog = value;
  }

  // Favorites
  public Favorites: MJUserFavoriteEntity[] = [];

  /** @deprecated Use {@link Favorites}. */
  public get favorites(): MJUserFavoriteEntity[] {
    return this.Favorites;
  }
  /** @deprecated Use {@link Favorites}. */
  public set favorites(value: MJUserFavoriteEntity[]) {
    this.Favorites = value;
  }
  public FavoritesLoading = true;

  /** @deprecated Use {@link FavoritesLoading}. */
  public get favoritesLoading() {
    return this.FavoritesLoading;
  }
  /** @deprecated Use {@link FavoritesLoading}. */
  public set favoritesLoading(value) {
    this.FavoritesLoading = value;
  }

  // Recents
  public RecentItems: RecentAccessItem[] = [];

  /** @deprecated Use {@link RecentItems}. */
  public get recentItems(): RecentAccessItem[] {
    return this.RecentItems;
  }
  /** @deprecated Use {@link RecentItems}. */
  public set recentItems(value: RecentAccessItem[]) {
    this.RecentItems = value;
  }
  public RecentsLoading = true;

  /** @deprecated Use {@link RecentsLoading}. */
  public get recentsLoading() {
    return this.RecentsLoading;
  }
  /** @deprecated Use {@link RecentsLoading}. */
  public set recentsLoading(value) {
    this.RecentsLoading = value;
  }

  // Dashboards strip
  /** The Config dashboard the user opened most recently, or null. */
  public ContinueDashboard: MJDashboardEntity | null = null;
  /** The user's favorite Config dashboards, newest favorite first. */
  public FavoriteDashboards: MJDashboardEntity[] = [];
  /** Ids of the user's favorite dashboards. */
  public FavoriteDashboardIds: string[] = [];
  /** How many Config dashboards the user can open. */
  public DashboardTotal = 0;
  /** How many of those dashboards other people own. */
  public DashboardSharedCount = 0;
  private creatingDashboard = false;

  // Home dashboard tabs
  /** The dashboards Home shows as tabs, in tab order. */
  public HomeTabs: MJDashboardEntity[] = [];
  /** The active tab: HOME_OVERVIEW_TAB_ID, or the ID of a dashboard in HomeTabs. */
  public HomeActiveTab = HOME_OVERVIEW_TAB_ID;
  /** The dashboard of the active tab, or null on Overview. */
  public ActiveHomeTabDashboard: MJDashboardEntity | null = null;
  /** The active tab's dashboard viewer: empty on Overview, else one. A new Key creates a new viewer. */
  public HomeTabViews: HomeTabView[] = [];
  /** True while the Manage home dashboards dialog is open. */
  public ShowHomePrefsDialog = false;
  /** True while a Remove tab request runs. */
  public IsRemovingHomeTab = false;
  private homeTabsService = inject(HomeDashboardTabsService);
  /** False until Home first reads its tabs. A tab the URL names waits for that read. */
  private homeTabsLoaded = false;
  private homeTabViewKey = 0;
  /** Watches the tab container while a viewer rebuild waits for the container to have a size. */
  private homeTabSizeWait = new ElementSizeWait(() => {
    this.syncHomeTabView();
    this.cdr.markForCheck();
  });
  @ViewChild('homeTabContainer') private homeTabContainer?: ElementRef<HTMLElement>;

  // Notifications
  public UnreadNotifications: MJUserNotificationEntity[] = [];

  /** @deprecated Use {@link UnreadNotifications}. */
  public get unreadNotifications(): MJUserNotificationEntity[] {
    return this.UnreadNotifications;
  }
  /** @deprecated Use {@link UnreadNotifications}. */
  public set unreadNotifications(value: MJUserNotificationEntity[]) {
    this.UnreadNotifications = value;
  }
  public NotificationsLoading = true;

  /** @deprecated Use {@link NotificationsLoading}. */
  public get notificationsLoading() {
    return this.NotificationsLoading;
  }
  /** @deprecated Use {@link NotificationsLoading}. */
  public set notificationsLoading(value) {
    this.NotificationsLoading = value;
  }

  // Sidebar state - default closed on all screen sizes
  public SidebarOpen = false;

  /** @deprecated Use {@link SidebarOpen}. */
  public get sidebarOpen() {
    return this.SidebarOpen;
  }
  /** @deprecated Use {@link SidebarOpen}. */
  public set sidebarOpen(value) {
    this.SidebarOpen = value;
  }

  // Pin empty-state dismissal preference (persisted in UserSettings via UserInfoEngine)
  public HidePinEmptyState = false;

  /** Whether the Dashboards strip is open. Saved for each user in the HomeApp.DashboardsCollapsed setting. */
  public DashboardsExpanded = true;
  /** Whether the Pinned section is open. Saved for each user in the HomeApp.PinnedCollapsed setting. */
  public PinnedExpanded = true;
  /** The row heights and tile widths of the Dashboards tiles. Saved for each user in the HomeApp.DashboardTileSizes setting. */
  public DashboardTileSizes: HomeDashboardTileSizes = EmptyHomeDashboardTileSizes();

  // Pin state
  public PinnedItems: HomeAppPinnedItem[] = [];
  public UngroupedPins: HomeAppPinnedItem[] = [];
  public PinGroups: string[] = [];
  public EditMode = false;
  public AddPanelOpen = false;
  public AddPanelSearchQuery = '';
  public AddPanelSelectedGroup = '';
  public AddPanelNewGroupName = '';
  public EditingPinId: string | null = null;
  public EditingGroupName: string | null = null;

  // Add pin panel - available resources
  public AvailableDashboards: { id: string; name: string; pinned: boolean }[] = [];
  public AvailableViews: { id: string; name: string; entityName: string; pinned: boolean }[] = [];
  public AvailableQueries: { id: string; name: string; pinned: boolean }[] = [];
  public AvailableActions: { id: string; name: string; description: string; pinned: boolean }[] = [];
  public AvailableApps: { appId: string; appName: string; icon: string; color: string; navItems: { label: string; icon: string; pinned: boolean }[] }[] = [];
  public AddPanelLoading = false;

  // Action pin dialog state
  public ActionConfigDialogVisible = false;
  public ActionConfigActionId: string | null = null;
  public ActionConfigActionName: string | null = null;
  public ActionConfigActionDescription: string | null = null;

  public ActionRunnerDialogVisible = false;
  public ActionRunnerPin: HomeAppPinnedItem | null = null;

  // Collapsible section state for Add Pin panel
  public PanelSectionCollapsed: Record<string, boolean> = {};

  // Pin context menu (ellipsis)
  public PinMenuVisible = false;
  public PinMenuX = 0;
  public PinMenuY = 0;
  public PinMenuPin: HomeAppPinnedItem | null = null;

  // Whether the Add Pin panel found the Data Explorer app. Query pins then open in its Queries nav item.
  public HasDataExplorerApp = false;

  // Drag state
  public DraggingPinId: string | null = null;
  public DragOverPinId: string | null = null;

  // Cached icon lookups to avoid repeated method calls
  private favoriteIconCache = new Map<string, string>();
  private resourceIconCache = new Map<string, string>();

  // Resolved display names for favorites (keyed by favorite ID)
  public FavoriteDisplayNames = new Map<string, string>();

  /** @deprecated Use {@link FavoriteDisplayNames}. */
  public get favoriteDisplayNames() {
    return this.FavoriteDisplayNames;
  }
  /** @deprecated Use {@link FavoriteDisplayNames}. */
  public set favoriteDisplayNames(value) {
    this.FavoriteDisplayNames = value;
  }

  /** True when Home shows its Overview sections: the Dashboards strip, Pinned and My Applications. */
  public get ShowOverview(): boolean {
    return !this.isLoading && !this.ActiveHomeTabDashboard;
  }

  /**
   * Check if sidebar has any content to show
   */
  get HasSidebarContent(): boolean {
    return this.UnreadNotifications.length > 0 ||
           this.Favorites.length > 0 ||
           this.RecentItems.length > 0 ||
           this.FavoritesLoading ||
           this.RecentsLoading;
  }

  /** @deprecated Use {@link HasSidebarContent}. */
  get hasSidebarContent(): boolean {
    return this.HasSidebarContent;
  }

  /**
   * Toggle sidebar visibility
   */
  ToggleSidebar(): void {
    this.SidebarOpen = !this.SidebarOpen;
  }

  /** @deprecated Use {@link ToggleSidebar}. */
  toggleSidebar(): void {
    return this.ToggleSidebar();
  }

  /**
   * Check if current device is mobile (width <= 768px)
   */
  private isMobileDevice(): boolean {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
  }

  constructor(
    private appManager: ApplicationManager,
    private recentAccessService: RecentAccessService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Home';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return '';
  }

  async ngAfterViewInit(): Promise<void> {
    // Get current user info
    this.CurrentUser = {
      Name: this.metadata.CurrentUser?.Name || 'User',
      Email: this.metadata.CurrentUser?.Email || ''
    };
    this.loadSectionStates();
    this.loadDashboardTileSizes();

    // The Home tab in Home's resource data, unless the tab's query-param stream already named one.
    // It waits for the first read of the tabs (see loadDashboardStrip).
    const initialTab = this.GetQueryParams()[HOME_TAB_QUERY_PARAM];
    if (initialTab && IsHomeOverviewTab(this.HomeActiveTab)) {
      this.activateHomeTab(initialTab);
    }

    // The Dashboards part of the first load: the automatic app install, the strip and the Home tabs
    const dashboardsLoad = this.loadDashboards();

    // Subscribe to loading state from ApplicationManager
    this.appManager.Loading
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        // Only update isLoading if manager is actively loading
        // (we start with isLoading=true and only set to false when we have apps)
        if (loading) {
          this.isLoading = true;
          this.cdr.markForCheck();
        }
      });

    // Subscribe to applications list, filtering out the Home app
    this.appManager.Applications
      .pipe(takeUntil(this.destroy$))
      .subscribe(async apps => {
        // Exclude the Home app from the list (users are already on Home)
        this.Apps = apps.filter(app => app.Name !== 'Home');

        // Pre-compute display data for all apps
        await this.computeAppsDisplayData();

        // The page shows once the Dashboards part of the first load is done (see loadDashboards)
        await dashboardsLoad;

        this.isLoading = false;
        this.NotifyLoadComplete();

        // Apps changed → keep the agent's view of the launcher in sync.
        this.publishAgentContext();

        this.cdr.markForCheck();
      });

    // Subscribe to unread notifications
    MJNotificationService.Notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.UnreadNotifications = notifications.filter(n => n.Unread).slice(0, 5);
        this.NotificationsLoading = false;
        this.publishAgentContext();
        this.cdr.markForCheck();
      });

    // Subscribe to recent items
    this.recentAccessService.RecentItems
      .pipe(takeUntil(this.destroy$))
      .subscribe(items => {
        this.RecentItems = this.deduplicateRecents(items).slice(0, 5);
        this.RecentsLoading = false;
        this.publishAgentContext();
        this.cdr.markForCheck();
      });

    this.subscribeToDashboardStripSources();
    this.subscribeToHomeTabSources();

    // Favorites and recents load asynchronously in the sidebar
    this.NotifyLoadComplete();

    // Load favorites and recents asynchronously (don't block rendering)
    this.loadFavorites();
    this.loadRecents();

    // Load pin empty-state dismissal preference
    const hideSetting = UserInfoEngine.Instance.GetSetting('HomeApp.HidePinEmptyState');
    this.HidePinEmptyState = hideSetting === 'true';

    // Load pinned items
    await this.pinService.LoadPins();
    this.pinService.Pins$
      .pipe(takeUntil(this.destroy$))
      .subscribe(pins => {
        this.PinnedItems = pins;
        this.UngroupedPins = this.pinService.GetUngroupedPins();
        this.PinGroups = this.pinService.GetGroups();
        this.publishAgentContext();
        this.cdr.markForCheck();
      });

    // Resolve display names for record-type pins that have raw ID titles
    this.resolveRecordPinNames();

    // Resolve missing icons for Custom pins
    this.resolveCustomPinIcons();

    // Pre-warm engines used by the Add Pin panel so the first click feels instant.
    // DashboardEngine and QueryEngine already auto-start; UserViewEngine and ActionEngineBase
    // don't, so kick them off in the background (fire-and-forget — Config(false) is idempotent
    // and they cache their results, so a subsequent OpenAddPinPanel() call will be a no-op).
    UserViewEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse)
      .catch(err => console.warn('[Home] UserViewEngine pre-warm failed', err));
    ActionEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse)
      .catch(err => console.warn('[Home] ActionEngineBase pre-warm failed', err));

    // Publish the initial agent context and register the client tools the AI agent
    // can invoke against the Home surface. Ongoing re-emits happen in the subscriptions
    // above (apps, notifications, recents, pins).
    this.publishAgentContext();
    this.registerAgentClientTools();
  }

  // ========================================
  // AI AGENT CONTEXT & CLIENT TOOLS
  // ========================================
  //
  // 🚨 SAFETY BOUNDARY: the Home dashboard exposes ONLY navigation / discovery /
  // panel-toggle operations to the agent. No pin create, no pin delete, no pin
  // rename, no group mutation, no reordering, and no Home tab add / remove /
  // reorder — those are user-confirm-driven or destructive and stay in the UI.
  // Every tool below maps to the exact same component method a user click would
  // call (OpenApp→onAppClick, OpenPin→OnPinClick, SwitchHomeTab→SetHomeTab,
  // search→AddPanel search field, panel/sidebar/edit-mode toggles). Handlers are
  // tolerant: they never throw, returning { Success, Data?, ErrorMessage? }.

  /**
   * Publish the current Home dashboard state to the AI agent via NavigationService.
   * The shaping lives in the pure {@link buildHomeAgentContext} helper so it stays
   * unit-testable. Called on init and on every meaningful state change.
   */
  private publishAgentContext(): void {
    const context = BuildHomeAgentContext({
      AppCount: this.Apps.length,
      VisibleAppCount: this.AppsDisplayData.length,
      AppNames: this.Apps.map(a => a.Name),
      PinnedItemCount: this.PinnedItems.length,
      PinGroupCount: this.PinGroups.length,
      PinGroupNames: this.PinGroups,
      PinNames: this.PinnedItems.map(p => p.DisplayName),
      UnreadNotifications: this.UnreadNotifications.length,
      NotificationTitles: this.UnreadNotifications.map(n => n.Title ?? '(untitled)'),
      RecentItemsCount: this.RecentItems.length,
      RecentItems: this.buildRecentItemSummaries(),
      EditMode: this.EditMode,
      AddPanelOpen: this.AddPanelOpen,
      SidebarOpen: this.SidebarOpen,
      AddPanelSearchQuery: this.AddPanelSearchQuery,
      ContinueDashboardName: this.ContinueDashboard?.Name ?? null,
      FavoriteDashboardNames: this.FavoriteDashboards.map(d => d.Name),
      DashboardTotal: this.DashboardTotal,
      HomeTabNames: this.HomeTabs.map(d => d.Name),
      ActiveHomeTab: this.ActiveHomeTabDashboard?.Name ?? HOME_OVERVIEW_TAB_NAME,
      ActiveHomeTabDashboardID: this.ActiveHomeTabDashboard?.ID ?? null,
      DashboardsCollapsed: !this.DashboardsExpanded,
      PinnedCollapsed: !this.PinnedExpanded,
    });
    this.navigationService.SetAgentContext(this, context);
  }

  /** Structured recent-item summaries (display name + resource type) for the agent context. */
  private buildRecentItemSummaries(): RecentItemSummary[] {
    return this.RecentItems.map(item => ({
      Name: item.recordName || item.entityName || item.recordId,
      ResourceType: item.resourceType,
    }));
  }

  /**
   * Register the client tools the AI agent can invoke against the Home dashboard.
   * All are navigation / discovery / panel-toggle operations (see SAFETY BOUNDARY
   * above). Each handler delegates to the same component method a user interaction
   * would call and returns a tolerant result.
   *
   * Tools:
   * - OpenApp: switch to an application by name (exact or partial match).
   * - OpenPin: open a pinned item by its display name (exact or partial match).
   * - SearchPins: find pinned items by a name query (read-only — returns matches).
   * - OpenRecent: open a recently-accessed item by display name (read-only navigation).
   * - SwitchHomeTab: switch Home to Overview or one of its dashboard tabs, by name or id.
   * - SearchAddPinPanel: open the Add Pin panel (if needed) and apply a search query.
   * - ClearAddPinPanelSearch: clear the Add Pin panel search query.
   * - OpenAddPinPanel / CloseAddPinPanel: toggle the Add Pin panel.
   * - ToggleSidebar: toggle the notifications/favorites/recents sidebar.
   * - TogglePinEditMode: toggle pin edit mode (reorder/rename UI affordances).
   */
  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'OpenApp',
        Description: 'Switch to an application by its name (e.g. "Data Explorer", "Knowledge Hub").',
        ParameterSchema: { type: 'object', properties: { appName: { type: 'string' } }, required: ['appName'] },
        Handler: async (params: Record<string, unknown>) => this.toolOpenApp(params),
      },
      {
        Name: 'OpenPin',
        Description: 'Open a pinned item on the Home screen by its display name (exact or partial match).',
        ParameterSchema: { type: 'object', properties: { pinName: { type: 'string' } }, required: ['pinName'] },
        Handler: async (params: Record<string, unknown>) => this.toolOpenPin(params),
      },
      {
        Name: 'SearchPins',
        Description: 'Find pinned items on the Home screen whose display name matches a query (case-insensitive contains). Read-only — returns the matching pin names; does not open anything.',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>) => this.toolSearchPins(params),
      },
      {
        Name: 'OpenRecent',
        Description: 'Open a recently-accessed item from the Home sidebar by its display name (exact or partial match). Read-only navigation.',
        ParameterSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        Handler: async (params: Record<string, unknown>) => this.toolOpenRecent(params),
      },
      {
        Name: 'SwitchHomeTab',
        Description: 'Switch the Home screen to one of its tabs: "Overview", or a Home tab dashboard by name (exact or partial match) or id. Navigation only — it does not add or remove Home tabs.',
        ParameterSchema: { type: 'object', properties: { tab: { type: 'string' } }, required: ['tab'] },
        Handler: async (params: Record<string, unknown>) => this.toolSwitchHomeTab(params),
      },
      {
        Name: 'SearchAddPinPanel',
        Description: 'Open the Add Pin panel (if not already open) and filter its available resources by a search query.',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>) => this.toolSearchAddPinPanel(params),
      },
      {
        Name: 'ClearAddPinPanelSearch',
        Description: 'Clear the search query in the Add Pin panel.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.toolClearAddPinPanelSearch(),
      },
      {
        Name: 'OpenAddPinPanel',
        Description: 'Open the Add Pin panel so the user can browse pinnable resources.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.OpenAddPinPanel();
          this.publishAgentContext();
          return { Success: true };
        },
      },
      {
        Name: 'CloseAddPinPanel',
        Description: 'Close the Add Pin panel.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.CloseAddPinPanel();
          this.publishAgentContext();
          return { Success: true };
        },
      },
      {
        Name: 'ToggleSidebar',
        Description: 'Toggle the Home sidebar (unread notifications, favorites, and recent items).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.ToggleSidebar();
          this.publishAgentContext();
          return { Success: true, Data: { SidebarOpen: this.SidebarOpen } };
        },
      },
      {
        Name: 'TogglePinEditMode',
        Description: 'Toggle pin edit mode on the Home screen (lets the user rename/reorder pins). This only changes the UI mode — it does not modify any pins.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.ToggleEditMode();
          this.publishAgentContext();
          return { Success: true, Data: { EditMode: this.EditMode } };
        },
      },
    ]);
  }

  /** Resolve an app by name (exact then partial, case-insensitive) and switch to it. */
  private async toolOpenApp(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
    const parsed = ValidateStringParam(params['appName'], 'appName');
    if (!parsed.ok) {
      return parsed.result;
    }
    const appName = parsed.value.trim();
    if (!appName) {
      return { Success: false, ErrorMessage: 'appName is required.' };
    }
    const candidates: NamedRecord[] = this.Apps.map(a => ({ Name: a.Name }));
    const match = ResolveNamedRecord(appName, candidates);
    if (!match) {
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(appName, 'app', candidates) };
    }
    const app = this.Apps.find(a => a.Name === match.Name);
    if (!app) {
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(appName, 'app', candidates) };
    }
    await this.OnAppClick(app);
    return { Success: true, Data: { AppName: app.Name } };
  }

  /** The pinned items narrowed to the resolver's structural shape (Name == DisplayName). */
  private get pinNamedRecords(): NamedRecord[] {
    return this.PinnedItems.map(p => ({ Name: p.DisplayName }));
  }

  /** Resolve a pinned item by display name (exact then partial, case-insensitive) and open it. */
  private toolOpenPin(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const parsed = ValidateStringParam(params['pinName'], 'pinName');
    if (!parsed.ok) {
      return parsed.result;
    }
    const pinName = parsed.value.trim();
    if (!pinName) {
      return { Success: false, ErrorMessage: 'pinName is required.' };
    }
    const match = ResolveNamedRecord(pinName, this.pinNamedRecords);
    if (!match) {
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(pinName, 'pinned item', this.pinNamedRecords) };
    }
    const pin = this.PinnedItems.find(p => p.DisplayName === match.Name);
    if (!pin) {
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(pinName, 'pinned item', this.pinNamedRecords) };
    }
    // OnPinClick is a no-op while in edit mode; clear edit mode so the open succeeds.
    if (this.EditMode) {
      this.EditMode = false;
    }
    this.OnPinClick(pin);
    return { Success: true, Data: { PinName: pin.DisplayName } };
  }

  /** Find pinned items whose display name matches a query (read-only — returns matches). */
  private toolSearchPins(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const parsed = ValidateStringParam(params['query'], 'query');
    if (!parsed.ok) {
      return parsed.result;
    }
    const query = parsed.value.trim().toLowerCase();
    const matches = query
      ? this.PinnedItems.filter(p => p.DisplayName.toLowerCase().includes(query))
      : [...this.PinnedItems];
    return { Success: true, Data: { Matches: matches.map(p => p.DisplayName), MatchCount: matches.length } };
  }

  /** Resolve a recent item by display name (exact then partial) and navigate to it. */
  private toolOpenRecent(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const parsed = ValidateStringParam(params['name'], 'name');
    if (!parsed.ok) {
      return parsed.result;
    }
    const name = parsed.value.trim();
    if (!name) {
      return { Success: false, ErrorMessage: 'name is required.' };
    }
    // Build the same display name the context publishes, then resolve against it.
    const named: NamedRecord[] = this.RecentItems.map(item => ({
      Name: item.recordName || item.entityName || item.recordId,
    }));
    const match = ResolveNamedRecord(name, named);
    if (!match) {
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(name, 'recent item', named) };
    }
    const idx = named.findIndex(n => n.Name === match.Name);
    const item = this.RecentItems[idx];
    if (!item) {
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(name, 'recent item', named) };
    }
    this.OnRecentClick(item);
    return { Success: true, Data: { Name: match.Name, ResourceType: item.resourceType } };
  }

  /** Resolve a Home tab by name or id ("Overview" included) and open it. */
  private toolSwitchHomeTab(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const parsed = ValidateStringParam(params['tab'], 'tab');
    if (!parsed.ok) {
      return parsed.result;
    }
    const reference = parsed.value.trim();
    if (!reference) {
      return { Success: false, ErrorMessage: 'tab is required.' };
    }
    const tab = ResolveHomeTabReference(reference, this.HomeTabs);
    if (!tab) {
      const candidates: NamedRecord[] = [{ Name: HOME_OVERVIEW_TAB_NAME }, ...this.HomeTabs.map(d => ({ Name: d.Name }))];
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(reference, 'Home tab', candidates) };
    }
    this.SetHomeTab(tab.ID);
    return { Success: true, Data: { ActiveHomeTab: tab.Name } };
  }

  /** Open the Add Pin panel (if needed) and apply a search query. */
  private async toolSearchAddPinPanel(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
    const parsed = ValidateStringParam(params['query'], 'query');
    if (!parsed.ok) {
      return parsed.result;
    }
    if (!this.AddPanelOpen) {
      await this.OpenAddPinPanel();
    }
    this.AddPanelSearchQuery = parsed.value;
    this.publishAgentContext();
    this.cdr.markForCheck();
    return { Success: true, Data: { Query: parsed.value } };
  }

  /** Clear the Add Pin panel search query. */
  private toolClearAddPinPanelSearch(): AgentToolResult {
    this.AddPanelSearchQuery = '';
    this.publishAgentContext();
    this.cdr.markForCheck();
    return { Success: true };
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
    this.homeTabSizeWait.Stop();
  }

  /**
   * Get a greeting based on time of day
   */
  get Greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /** @deprecated Use {@link Greeting}. */
  get greeting(): string {
    return this.Greeting;
  }

  /**
   * Get formatted date string
   */
  get FormattedDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  /** @deprecated Use {@link FormattedDate}. */
  get formattedDate(): string {
    return this.FormattedDate;
  }

  /**
   * Navigate to an application
   */
  async OnAppClick(app: BaseApplication): Promise<void> {
    // Use NavigationService to switch to the app (handles tab creation if needed)
    await this.navigationService.SwitchToApp(app.ID);
  }

  /** @deprecated Use {@link OnAppClick}. */
  async onAppClick(app: BaseApplication): Promise<void> {
    return this.OnAppClick(app);
  }

  /**
   * Open app configuration dialog
   */
  OpenConfigDialog(): void {
    this.ShowConfigDialog = true;
    setTimeout(() => {
      if (this.AppConfigDialog) {
        this.AppConfigDialog.Open();
      }
    }, 0);
  }

  /** @deprecated Use {@link OpenConfigDialog}. */
  openConfigDialog(): void {
    return this.OpenConfigDialog();
  }

  /**
   * Handle when config is saved
   */
  OnConfigSaved(): void {
    this.ShowConfigDialog = false;
  }

  /** @deprecated Use {@link OnConfigSaved}. */
  onConfigSaved(): void {
    return this.OnConfigSaved();
  }

  /**
   * Pre-compute display data for all apps to avoid repeated calculations during change detection
   */
  private async computeAppsDisplayData(): Promise<void> {
    this.AppsDisplayData = await Promise.all(this.Apps.map(async app => {
      const navItems = await app.GetNavItems();
      const navItemsCount = navItems.length;
      const navItemsPreview = navItems.slice(0, 3).map(item => ({
        Label: item.Label,
        Icon: item.Icon || 'fa-solid fa-circle'
      }));

      return {
        app,
        color: app.GetColor() || '#1976d2',
        icon: app.Icon || 'fa-solid fa-cube',
        navItemsCount,
        navItemsPreview,
        showMoreItems: navItemsCount > 3,
        moreItemsCount: navItemsCount - 3
      };
    }));
  }

  /**
   * Track function for apps loop
   */
  TrackByApp(_index: number, item: AppDisplayData): string {
    return item.app.ID;
  }

  /** @deprecated Use {@link TrackByApp}. */
  trackByApp(_index: number, item: AppDisplayData): string {
    return this.TrackByApp(_index, item);
  }

  /**
   * Track function for nav items preview
   */
  TrackByNavItem(_index: number, item: { Label: string; Icon: string }): string {
    return item.Label;
  }

  /** @deprecated Use {@link TrackByNavItem}. */
  trackByNavItem(_index: number, item: { Label: string; Icon: string }): string {
    return this.TrackByNavItem(_index, item);
  }

  /**
   * Load user favorites from UserInfoEngine (cached) and resolve record display names
   */
  private async loadFavorites(): Promise<void> {
    try {
      this.FavoritesLoading = true;

      // Get first 10 favorites (already ordered by __mj_CreatedAt DESC in engine)
      this.Favorites = UserInfoEngine.Instance.UserFavorites.slice(0, 10);

      // Batch-resolve record names for all favorites
      await this.resolveFavoriteNames();
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      this.FavoritesLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Batch-resolve record display names for favorites using GetEntityRecordNames()
   */
  private async resolveFavoriteNames(): Promise<void> {
    const nameInputs: EntityRecordNameInput[] = [];
    const favoriteIdByKey = new Map<string, string>(); // map key -> favorite ID

    for (const fav of this.Favorites) {
      if (!fav.Entity || !fav.RecordID) continue;
      const compositeKey = this.buildCompositeKeyForRecord(fav.Entity, fav.RecordID);
      if (!compositeKey) continue;

      nameInputs.push({ EntityName: fav.Entity, CompositeKey: compositeKey });
      favoriteIdByKey.set(`${fav.Entity}||${compositeKey.ToConcatenatedString()}`, fav.ID);
    }

    if (nameInputs.length === 0) return;

    try {
      const nameResults = await this.metadata.GetEntityRecordNames(nameInputs);
      for (const result of nameResults) {
        if (result.Success && result.RecordName) {
          const key = `${result.EntityName}||${result.CompositeKey.ToConcatenatedString()}`;
          const favId = favoriteIdByKey.get(key);
          if (favId) {
            this.FavoriteDisplayNames.set(favId, result.RecordName);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to resolve favorite record names:', error);
    }
  }

  /**
   * Build a CompositeKey for a record. RecordID may be stored as either:
   * - Concatenated format: "FieldName|Value" or "Field1|Val1||Field2|Val2"
   * - Plain value: just the raw value (e.g. a GUID)
   */
  private buildCompositeKeyForRecord(entityName: string, recordId: string): CompositeKey | null {
    if (!recordId) return null;
    const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
    // A plain value can only be resolved against the entity's real key column(s)
    if (!entityInfo && !recordId.includes(CompositeKey.DefaultValueDelimiter)) return null;
    const compositeKey = CompositeKey.FromURLSegment(entityInfo, recordId);
    return compositeKey.KeyValuePairs.length > 0 ? compositeKey : null;
  }

  /**
   * Get the display name for a favorite (resolved name or entity name fallback)
   */
  GetFavoriteDisplayName(favorite: MJUserFavoriteEntity): string {
    return this.FavoriteDisplayNames.get(favorite.ID) || favorite.Entity || favorite.RecordID;
  }

  /** @deprecated Use {@link GetFavoriteDisplayName}. */
  getFavoriteDisplayName(favorite: MJUserFavoriteEntity): string {
    return this.GetFavoriteDisplayName(favorite);
  }

  /**
   * Load recent items via the RecentAccessService
   */
  private async loadRecents(): Promise<void> {
    try {
      this.RecentsLoading = true;
      this.cdr.markForCheck();
      await this.recentAccessService.loadRecentItems(10);
    } catch (error) {
      console.error('Error loading recents:', error);
    } finally {
      this.RecentsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Navigate to a favorite item using NavigationService
   */
  OnFavoriteClick(favorite: MJUserFavoriteEntity): void {
    // Navigate based on entity type using NavigationService
    const entityName = favorite.Entity?.toLowerCase();
    const recordId = favorite.RecordID;

    if (IsDashboardEntity(favorite.Entity)) {
      this.openDashboard(recordId, 'Dashboard');
    } else if (ResourceTypeForEntity(favorite.Entity) === 'view') {
      this.navigationService.OpenView(recordId, 'View');
    } else if (entityName?.includes('artifact')) {
      this.navigationService.OpenArtifact(recordId, 'Artifact');
    } else {
      // Default: navigate to record
      const compositeKey = this.buildCompositeKeyForRecord(favorite.Entity, recordId);
      if (compositeKey) {
        this.navigationService.OpenEntityRecord(favorite.Entity, compositeKey);
      }
    }
  }

  /** @deprecated Use {@link OnFavoriteClick}. */
  onFavoriteClick(favorite: MJUserFavoriteEntity): void {
    return this.OnFavoriteClick(favorite);
  }

  /**
   * Navigate to a recent item using NavigationService
   */
  OnRecentClick(item: RecentAccessItem): void {
    // Use recordName if available, otherwise fall back to generic titles
    const name = item.recordName;

    switch (item.resourceType) {
      case 'view':
        this.navigationService.OpenView(item.recordId, name || 'View');
        break;
      case 'dashboard':
        this.openDashboard(item.recordId, name || 'Dashboard');
        break;
      case 'artifact':
        this.navigationService.OpenArtifact(item.recordId, name || 'Artifact');
        break;
      default: {
        // Regular record
        const compositeKey = this.buildCompositeKeyForRecord(item.entityName, item.recordId);
        if (compositeKey) {
          this.navigationService.OpenEntityRecord(item.entityName, compositeKey);
        }
      }
    }
  }

  /** @deprecated Use {@link OnRecentClick}. */
  onRecentClick(item: RecentAccessItem): void {
    return this.OnRecentClick(item);
  }

  /**
   * Navigate to a notification using NavigationService
   */
  OnNotificationClick(notification: MJUserNotificationEntity): void {
    // Navigate to the notifications view using NavigationService
    this.navigationService.OpenDynamicView('MJ: User Notifications');
  }

  /** @deprecated Use {@link OnNotificationClick}. */
  onNotificationClick(notification: MJUserNotificationEntity): void {
    return this.OnNotificationClick(notification);
  }

  /**
   * Get icon for an entity by name, using entity metadata Icon field (cached)
   */
  GetEntityIconByName(entityName: string): string {
    if (!entityName) return 'fa-solid fa-file';

    const cached = this.resourceIconCache.get(entityName);
    if (cached) return cached;

    const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
    const icon = entityInfo ? this.resolveEntityIcon(entityInfo.Icon) : 'fa-solid fa-file';

    this.resourceIconCache.set(entityName, icon);
    return icon;
  }

  /** @deprecated Use {@link GetEntityIconByName}. */
  getEntityIconByName(entityName: string): string {
    return this.GetEntityIconByName(entityName);
  }

  /**
   * Resolve an entity's Icon field to a full Font Awesome class string
   */
  private resolveEntityIcon(icon: string | undefined): string {
    if (!icon) return 'fa-solid fa-table';

    // Already has a style prefix
    if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
        icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
        icon.startsWith('fa ')) {
      return icon;
    }
    // Has fa- prefix but no style
    if (icon.startsWith('fa-')) {
      return `fa-solid ${icon}`;
    }
    // Just an icon name like "table" or "users"
    return `fa-solid fa-${icon}`;
  }

  /**
   * Format a date for display (pure function, safe to call in template)
   */
  formatDate(date: Date): string {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(date).toLocaleDateString();
  }

  /**
   * Track function for favorites
   */
  TrackByFavorite(_index: number, item: MJUserFavoriteEntity): string {
    return item.ID;
  }

  /** @deprecated Use {@link TrackByFavorite}. */
  trackByFavorite(_index: number, item: MJUserFavoriteEntity): string {
    return this.TrackByFavorite(_index, item);
  }

  /**
   * Remove duplicate recent items (same entity + recordId). Keeps the first occurrence.
   */
  private deduplicateRecents(items: RecentAccessItem[]): RecentAccessItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = `${item.entityName}-${item.recordId}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Track function for recent items
   */
  TrackByRecent(_index: number, item: RecentAccessItem): string {
    return `${item.entityName}-${item.recordId}`;
  }

  /** @deprecated Use {@link TrackByRecent}. */
  trackByRecent(_index: number, item: RecentAccessItem): string {
    return this.TrackByRecent(_index, item);
  }

  /**
   * Track function for notifications
   */
  TrackByNotification(_index: number, item: MJUserNotificationEntity): string {
    return item.ID;
  }

  /** @deprecated Use {@link TrackByNotification}. */
  trackByNotification(_index: number, item: MJUserNotificationEntity): string {
    return this.TrackByNotification(_index, item);
  }

  // =============================================
  // DASHBOARDS STRIP
  // =============================================

  /**
   * The Dashboards part of Home's first load: the automatic Dashboards app install (at most once
   * per user) and the first read of the strip and the Home tabs. Home stays on its loading view
   * until both finish, so the app-list reload that an install causes does not show a second loading
   * view. Each install step gives up after DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS, so a slow or
   * silent server holds Home for seconds, not indefinitely. Never rejects.
   */
  private async loadDashboards(): Promise<void> {
    await Promise.allSettled([AutoInstallDashboardsApp(this.appManager), this.loadDashboardStrip()]);
  }

  /**
   * Loads the dashboard cache if it is not loaded yet, then fills the strip and the Home tabs. After
   * this first read, the tab the URL names opens, or Overview shows when that tab is not in the list.
   * Never rejects.
   */
  private async loadDashboardStrip(): Promise<void> {
    try {
      await DashboardEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      this.refreshDashboardStrip();
    } catch (error) {
      LogError(`Home: could not load the Dashboards strip: ${errorMessage(error)}`);
    }
    this.homeTabsLoaded = true;
    this.refreshHomeTabs();
  }

  /**
   * Favorites, dashboard opens (the record logs reload after an open) and the dashboard cache also
   * change while Home is a background tab, so these refresh the strip only. They do not report to
   * the agent.
   */
  private subscribeToDashboardStripSources(): void {
    merge(this.favoritesService.Changed$, ObserveRecentDashboardChanges(), ObserveDashboardLibraryChanges())
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshDashboardStrip());
  }

  /** Re-reads the strip from the dashboard cache, the dashboard recents and the favorites. */
  private refreshDashboardStrip(): void {
    const userId = this.ProviderToUse.CurrentUser.ID;
    const favoriteIds = this.favoritesService.FavoriteIds();
    const strip = BuildHomeDashboardStrip(
      DashboardEngine.Instance.GetAccessibleDashboards(userId),
      GetRecentDashboardIds(this.ProviderToUse),
      favoriteIds,
      userId
    );
    this.ContinueDashboard = strip.Continue;
    this.FavoriteDashboards = strip.Favorites;
    this.FavoriteDashboardIds = favoriteIds;
    this.DashboardTotal = strip.TotalCount;
    this.DashboardSharedCount = strip.SharedCount;
    this.cdr.markForCheck();
  }

  /** Opens the dashboard. */
  public OpenDashboardFromStrip(dashboard: MJDashboardEntity): void {
    this.openDashboard(dashboard.ID, dashboard.Name);
  }

  /**
   * Opens a dashboard in place of the preview tab, which is usually the tab that shows Home, so Back
   * returns to Home. A Shift-click opens it in a separate tab.
   */
  private openDashboard(dashboardId: string, dashboardName: string): void {
    this.navigationService.OpenDashboard(dashboardId, dashboardName);
  }

  /** Stars or unstars the dashboard and tells the user. The strip refreshes when the favorites change. */
  public async ToggleDashboardFavorite(dashboard: MJDashboardEntity): Promise<void> {
    try {
      const isFavorite = await this.favoritesService.Toggle(dashboard.ID);
      const message = isFavorite ? `Added "${dashboard.Name}" to favorites` : `Removed "${dashboard.Name}" from favorites`;
      MJNotificationService.Instance.CreateSimpleNotification(message, 'success', 2000);
    } catch (error) {
      LogError(`Home: could not change the favorite: ${errorMessage(error)}`);
      MJNotificationService.Instance.CreateSimpleNotification('Could not change the favorite', 'error', 3000);
    }
  }

  /** Creates an empty dashboard and opens it in edit mode, like any dashboard open. Clicks while one is being created are ignored. */
  public async NewDashboardFromStrip(): Promise<void> {
    if (this.creatingDashboard) {
      return;
    }
    this.creatingDashboard = true;
    try {
      const dashboard = await CreateBlankDashboard(this.ProviderToUse);
      if (!dashboard) {
        MJNotificationService.Instance.CreateSimpleNotification('Could not create the dashboard', 'error', 3000);
        return;
      }
      await this.reloadDashboardCache();
      this.navigationService.OpenDashboard(dashboard.ID, dashboard.Name, { openInEditMode: true });
    } catch (error) {
      LogError(`Home: could not open the new dashboard: ${errorMessage(error)}`);
      MJNotificationService.Instance.CreateSimpleNotification('Could not open the new dashboard', 'error', 3000);
    } finally {
      this.creatingDashboard = false;
    }
  }

  /**
   * Goes to a page of the Dashboards app. First installs or re-enables the app when the user does
   * not have it. When the app cannot be opened, tells the user to try again or ask for access.
   */
  public async GoToDashboardsApp(navItem: 'Overview' | 'Browse'): Promise<void> {
    const app = await EnsureDashboardsApp(this.appManager);
    if (!app) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Could not open the Dashboards app. Try again, or ask your administrator for access.',
        'warning',
        4000
      );
      return;
    }
    await this.navigationService.SwitchToApp(app.ID, navItem);
  }

  /**
   * Reloads the dashboard cache before a new dashboard's tab opens. The tab reads the dashboard
   * from this cache, and the cache adds a saved dashboard by itself only after an asynchronous
   * copy. A failure is only logged.
   */
  private async reloadDashboardCache(): Promise<void> {
    try {
      await DashboardEngine.Instance.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    } catch (error) {
      LogError(`Home: could not reload the dashboards: ${errorMessage(error)}`);
    }
  }

  // =============================================
  // HOME DASHBOARD TABS
  // =============================================

  /**
   * The Home tabs change when the user edits them here or in another tab, and when the dashboard
   * cache changes (a dashboard, a permission or a preference row). These refresh the tabs only. They
   * do not report to the agent and do not change the URL.
   */
  private subscribeToHomeTabSources(): void {
    merge(this.homeTabsService.Changed$, ObserveHomeTabsChanges())
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshHomeTabs());
  }

  /** Re-reads the Home tabs and keeps the active tab on a dashboard that is still a tab. */
  private refreshHomeTabs(): void {
    this.HomeTabs = this.homeTabsService.Tabs();
    this.syncActiveHomeTab();
    this.cdr.markForCheck();
  }

  /** Makes `tabId` the active tab: Overview or a Home tab dashboard. Before the first read of the tabs, the id waits for that read. */
  private activateHomeTab(tabId: string): void {
    this.HomeActiveTab = IsHomeOverviewTab(tabId) ? HOME_OVERVIEW_TAB_ID : tabId.trim();
    this.syncActiveHomeTab();
  }

  /** Matches the active tab to the tab list: the dashboard it shows, or Overview when the list does not have it. */
  private syncActiveHomeTab(): void {
    if (!this.homeTabsLoaded) {
      return;
    }
    const tab = FindHomeTab(this.HomeTabs, this.HomeActiveTab);
    this.HomeActiveTab = tab ? tab.ID : HOME_OVERVIEW_TAB_ID;
    this.ActiveHomeTabDashboard = tab;
    this.syncHomeTabView();
  }

  /**
   * Keeps the active tab's viewer in step with its dashboard. The viewer is created again when the
   * dashboard, its name or its layout differs from what the viewer was built from, also when an edit
   * changed the same object. While Home is hidden, that rebuild waits until the tab container has a
   * size again (see PlanHomeTabView).
   */
  private syncHomeTabView(): void {
    const dashboard = this.ActiveHomeTabDashboard;
    if (!dashboard) {
      this.HomeTabViews = [];
      this.homeTabSizeWait.Stop();
      return;
    }
    const container = this.homeTabContainer?.nativeElement ?? null;
    const plan = PlanHomeTabView(this.HomeTabViews[0] ?? null, dashboard, container ? ElementHasSize(container) : null);
    if (plan === 'wait' && container) {
      this.homeTabSizeWait.Watch(container);
      return;
    }
    this.homeTabSizeWait.Stop();
    if (plan === 'build') {
      this.HomeTabViews = [CreateHomeTabView(dashboard, ++this.homeTabViewKey)];
    }
  }

  /** The active tab as the URL stores it. Overview has no `homeTab` param. */
  private get homeTabQueryParam(): string | null {
    return IsHomeOverviewTab(this.HomeActiveTab) ? null : this.HomeActiveTab;
  }

  /**
   * Opens a Home tab: 'overview' or a Home tab dashboard's ID. Writes the tab to the URL. When the
   * tab changes, records the dashboard open and reports the change to the agent.
   */
  public SetHomeTab(tabId: string): void {
    const previous = this.HomeActiveTab;
    this.activateHomeTab(tabId);
    this.UpdateQueryParams({ [HOME_TAB_QUERY_PARAM]: this.homeTabQueryParam });
    if (UUIDsEqual(previous, this.HomeActiveTab)) {
      return;
    }
    if (this.ActiveHomeTabDashboard) {
      void this.recentAccessService.LogAccess('MJ: Dashboards', this.ActiveHomeTabDashboard.ID, 'dashboard');
    }
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  /** Applies the tab the URL names, for back and forward, deep links and pins. Reports a change of tab to the agent. */
  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    const previous = this.HomeActiveTab;
    this.activateHomeTab(params[HOME_TAB_QUERY_PARAM] ?? '');
    if (this.homeTabsLoaded && !UUIDsEqual(previous, this.HomeActiveTab)) {
      this.publishAgentContext();
    }
    this.cdr.markForCheck();
  }

  /** Opens the Manage home dashboards dialog. */
  public OpenManageHomeDashboards(): void {
    this.ShowHomePrefsDialog = true;
    this.cdr.markForCheck();
  }

  /**
   * Closes the Manage home dashboards dialog and reloads the Home tabs. Reloads after every result,
   * not only a save: a failed save, or a close during a save, can still have written rows.
   */
  public async OnManageHomeDashboardsClosed(): Promise<void> {
    this.ShowHomePrefsDialog = false;
    this.cdr.markForCheck();
    try {
      await this.homeTabsService.Reload();
    } catch (error) {
      LogError(`Home: could not reload the Home tabs: ${errorMessage(error)}`);
    }
    this.refreshHomeTabs();
    this.reportHomeTabsChange();
  }

  /**
   * Removes the dashboard from the user's Home tabs and tells the user. Overview shows when the open
   * tab goes. Clicks while a removal runs are ignored.
   */
  public async RemoveHomeTab(dashboard: MJDashboardEntity): Promise<void> {
    if (this.IsRemovingHomeTab) {
      return;
    }
    this.IsRemovingHomeTab = true;
    this.cdr.markForCheck();
    try {
      await this.homeTabsService.Remove(dashboard.ID);
      MJNotificationService.Instance.CreateSimpleNotification(`Removed "${dashboard.Name}" from your Home tabs`, 'success', 2000);
    } catch (error) {
      LogError(`Home: could not remove the Home tab: ${errorMessage(error)}`);
      MJNotificationService.Instance.CreateSimpleNotification('Could not remove the Home tab', 'error', 3000);
    } finally {
      this.IsRemovingHomeTab = false;
    }
    this.refreshHomeTabs();
    this.reportHomeTabsChange();
  }

  /** Opens the active Home tab's dashboard in a dashboard tab (Open in Dashboards). */
  public OpenHomeTabInApp(dashboard: MJDashboardEntity): void {
    this.openDashboard(dashboard.ID, dashboard.Name);
  }

  /**
   * Follows a link from a panel of a dashboard that Home shows, in the open Home tab or in a tile of
   * the Dashboards section: a record, a dashboard or a query, as the dashboard tab does. Other link
   * types are only logged.
   */
  public OnDashboardNavigationRequested(event: DashboardNavRequestEvent): void {
    const request = event.request;
    switch (request.type) {
      case 'OpenEntityRecord': {
        const key = CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(request.entityName), request.recordId);
        this.navigationService.OpenEntityRecord(request.entityName, key);
        break;
      }
      case 'OpenDashboard':
        this.openDashboard(request.dashboardId, this.cachedDashboardName(request.dashboardId));
        break;
      case 'OpenQuery':
        this.navigationService.OpenQuery(request.queryId, 'Query');
        break;
      default:
        console.warn(`[Home] A dashboard panel asked for a link type that Home does not open: ${request.type}`);
    }
  }

  /** The dashboard's name from the dashboard cache, or 'Dashboard' when the cache does not have it. */
  private cachedDashboardName(dashboardId: string): string {
    const engine = DashboardEngine.Instance;
    if (engine.IsPermissionConstrained) {
      return 'Dashboard';
    }
    return engine.Dashboards.find(d => UUIDsEqual(d.ID, dashboardId))?.Name ?? 'Dashboard';
  }

  /** After a user action changed the tabs: writes the active tab to the URL and reports the tabs to the agent. */
  private reportHomeTabsChange(): void {
    this.UpdateQueryParams({ [HOME_TAB_QUERY_PARAM]: this.homeTabQueryParam });
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  // =============================================
  // PIN NAME RESOLUTION
  // =============================================

  /**
   * Resolve display names for record-type pins that have raw "Entity - ID|..." titles.
   * Uses batch GetEntityRecordNames() for efficiency, same pattern as favorites.
   */
  private async resolveRecordPinNames(): Promise<void> {
    // Find pins that need name resolution: records with raw ID titles,
    // or any pin whose DisplayName contains "ID|" (raw composite key)
    const pinsNeedingNames = this.PinnedItems.filter(pin => {
      const rt = this.resolveStoredResourceType(pin);
      if (rt !== 'Records') return false;
      // Check if the name looks like a raw ID format
      return pin.DisplayName.includes('ID|') || pin.DisplayName.includes(' - ID');
    });

    if (pinsNeedingNames.length === 0) return;

    const nameInputs: EntityRecordNameInput[] = [];
    const pinIdByKey = new Map<string, string>();

    for (const pin of pinsNeedingNames) {
      const entityName = (pin.Configuration['Entity'] || pin.Configuration['entity']) as string;
      const recordId = pin.Configuration['recordId'] as string;
      if (!entityName || !recordId) continue;

      const compositeKey = this.buildCompositeKeyForRecord(entityName, recordId);
      if (!compositeKey) continue;

      nameInputs.push({ EntityName: entityName, CompositeKey: compositeKey });
      pinIdByKey.set(`${entityName}||${compositeKey.ToConcatenatedString()}`, pin.Id);
    }

    if (nameInputs.length === 0) return;

    try {
      const nameResults = await this.metadata.GetEntityRecordNames(nameInputs);
      for (const result of nameResults) {
        if (result.Success && result.RecordName) {
          const key = `${result.EntityName}||${result.CompositeKey.ToConcatenatedString()}`;
          const pinId = pinIdByKey.get(key);
          if (pinId) {
            this.pinService.UpdatePin(pinId, { DisplayName: result.RecordName });
          }
        }
      }
    } catch (error) {
      console.warn('[Pin Names] Failed to resolve record names:', error);
    }
  }

  /**
   * Resolve missing icons for Custom (app nav item) pins by looking up nav items.
   */
  private async resolveCustomPinIcons(): Promise<void> {
    const pinsNeedingIcons = this.PinnedItems.filter(pin =>
      this.resolveStoredResourceType(pin) === 'Custom' && !pin.Icon
    );

    if (pinsNeedingIcons.length === 0) return;

    for (const pin of pinsNeedingIcons) {
      const appName = pin.ApplicationName || pin.Configuration['appName'] as string;
      const navItemName = pin.Configuration['navItemName'] as string;
      if (!appName || !navItemName) continue;

      const app = this.appManager.GetAllApps().find(a => a.Name === appName);
      if (!app) continue;

      const navItems = await app.GetNavItems();
      const navItem = navItems.find(ni => ni.Label === navItemName);
      if (navItem?.Icon) {
        this.pinService.UpdatePin(pin.Id, { Icon: navItem.Icon });
      }
    }
  }

  // =============================================
  // PIN MANAGEMENT
  // =============================================

  /**
   * Navigate to a pinned resource
   */
  OnPinClick(pin: HomeAppPinnedItem): void {
    if (this.EditMode) return;
    const config = pin.Configuration;
    const rt = this.resolveStoredResourceType(pin);

    switch (rt) {
      case 'Dashboards': {
        // A pin of an app's default dashboard tab stores the dashboard id only as recordId
        const dashboardId = (config['dashboardId'] ?? config['recordId']) as string | undefined;
        if (dashboardId) {
          this.openDashboard(dashboardId, pin.DisplayName);
        } else {
          console.warn('[Pin Click] Dashboards pin missing dashboardId and recordId', config);
        }
        break;
      }
      case 'User Views':
        if (config['isDynamic']) {
          this.navigationService.OpenDynamicView(
            (config['Entity'] || config['entity']) as string,
            config['extraFilter'] as string | undefined
          );
        } else {
          const viewId = config['viewId'] as string;
          if (viewId) {
            this.navigationService.OpenView(viewId, pin.DisplayName);
          }
        }
        break;
      case 'Queries': {
        const queryId = config['queryId'] as string;
        if (!queryId) break;
        // Opens in Data Explorer's Queries nav item once the Add Pin panel has found that app
        const deApp = this.HasDataExplorerApp
          ? this.appManager.GetAllApps().find(a => a.Name === 'Data Explorer')
          : null;
        if (deApp) {
          void this.navigationService.SwitchToApp(deApp.ID, 'Queries', { queryId: queryId });
        } else {
          this.navigationService.OpenQuery(queryId, pin.DisplayName);
        }
        break;
      }
      case 'Records': {
        const entityName = (config['Entity'] || config['entity']) as string;
        const recordId = config['recordId'] as string;
        if (entityName && recordId) {
          const compositeKey = this.buildCompositeKeyForRecord(entityName, recordId);
          if (compositeKey) {
            this.navigationService.OpenEntityRecord(entityName, compositeKey);
          }
        } else {
          console.warn('[Pin Click] Records pin missing Entity or recordId', config);
        }
        break;
      }
      case 'Custom': {
        // Custom resources are nav items within apps — always use app name, never ID
        const navItemName = config['navItemName'] as string;
        const appName = config['appName'] as string;
        const queryParams = config['queryParams'] as Record<string, string> | undefined;
        if (appName) {
          const app = this.appManager.GetAllApps().find(a => a.Name === appName);
          if (app) {
            // Pass query params INTO SwitchToApp so they're applied synchronously when the
            // target tab activates — before a cached resource component reattaches. The old
            // post-hoc UpdateActiveTabQueryParams() in a .then() raced the cache reattach and
            // lost: e.g. two conversation pins both landed on whatever chat was already open.
            void this.navigationService.SwitchToApp(app.ID, navItemName, queryParams);
          } else {
            console.warn(`[Pin Click] Custom pin: app "${appName}" not found`, config);
          }
        } else {
          console.warn('[Pin Click] Custom pin missing appName', config);
        }
        break;
      }
      case 'Actions': {
        const actionId = config['actionId'] as string;
        if (!actionId) {
          console.warn('[Pin Click] Action pin missing actionId', config);
          break;
        }
        this.ActionRunnerPin = pin;
        this.ActionRunnerDialogVisible = true;
        this.cdr.markForCheck();
        break;
      }
      default:
        console.warn('[Pin Click] Unrecognized resource type', rt, 'for pin', pin.DisplayName, config);
        break;
    }
  }

  /**
   * Resolve a pin's resource type from its stored ResourceType and config keys.
   * Handles legacy pins that may have stored a UUID resourceTypeId or
   * a raw config.resourceType string instead of the canonical type names.
   */
  private resolveStoredResourceType(pin: HomeAppPinnedItem): string {
    const rt = pin.ResourceType;
    const config = pin.Configuration;

    // Already a known canonical type
    const knownTypes = ['Dashboards', 'User Views', 'Queries', 'Reports', 'Records', 'Custom', 'Actions'];
    if (knownTypes.includes(rt)) return rt;

    // Check the config's own resourceType field
    const configRt = config['resourceType'] as string;
    if (configRt && knownTypes.includes(configRt)) return configRt;

    // Fall back to detecting by config keys
    if (config['dashboardId']) return 'Dashboards';
    if (config['viewId']) return 'User Views';
    if (config['queryId']) return 'Queries';
    if (config['reportId']) return 'Reports';
    if ((config['Entity'] || config['entity']) && config['recordId']) return 'Records';
    if (config['actionId']) return 'Actions';
    if (config['navItemName']) return 'Custom';

    return rt; // Give up and return whatever was stored
  }

  /**
   * Toggle edit mode for pins. Entering edit mode opens a collapsed Pinned section.
   */
  ToggleEditMode(): void {
    this.EditMode = !this.EditMode;
    if (this.EditMode) {
      this.openPinnedSection();
    } else {
      this.EditingPinId = null;
      this.EditingGroupName = null;
    }
    this.cdr.markForCheck();
  }

  /**
   * Permanently hide the "No pinned items yet" empty state for this user.
   * Persisted in UserSettings via UserInfoEngine.
   */
  DismissPinEmptyState(): void {
    this.HidePinEmptyState = true;
    UserInfoEngine.Instance.SetSettingDebounced('HomeApp.HidePinEmptyState', 'true');
    this.cdr.markForCheck();
  }

  /** Opens or collapses the Dashboards strip, saves the choice for the user and reports it to the agent. */
  OnDashboardsExpandedChange(expanded: boolean): void {
    this.DashboardsExpanded = expanded;
    this.sectionStateChanged(DASHBOARDS_COLLAPSED_SETTING, expanded);
  }

  /** Opens or collapses the Pinned section, saves the choice for the user and reports it to the agent. */
  OnPinnedExpandedChange(expanded: boolean): void {
    this.PinnedExpanded = expanded;
    this.sectionStateChanged(PINNED_COLLAPSED_SETTING, expanded);
  }

  /** Takes the tile sizes the user set in the Dashboards strip and saves them for the user. */
  OnDashboardTileSizesChange(sizes: HomeDashboardTileSizes): void {
    this.DashboardTileSizes = sizes;
    UserInfoEngine.Instance.SetSettingDebounced(DASHBOARD_TILE_SIZES_SETTING, SerializeHomeDashboardTileSizes(sizes));
    this.cdr.markForCheck();
  }

  /** Reads the user's tile sizes; a missing or bad setting gives the default sizes. */
  private loadDashboardTileSizes(): void {
    this.DashboardTileSizes = ParseHomeDashboardTileSizes(UserInfoEngine.Instance.GetSetting(DASHBOARD_TILE_SIZES_SETTING));
  }

  /** Reads whether each Overview section is open. 'true' means collapsed; a missing setting means open. */
  private loadSectionStates(): void {
    this.DashboardsExpanded = UserInfoEngine.Instance.GetSetting(DASHBOARDS_COLLAPSED_SETTING) !== 'true';
    this.PinnedExpanded = UserInfoEngine.Instance.GetSetting(PINNED_COLLAPSED_SETTING) !== 'true';
  }

  /** Saves a section's state for the user ('true' when collapsed), reports it to the agent and renders. */
  private sectionStateChanged(settingKey: string, expanded: boolean): void {
    UserInfoEngine.Instance.SetSettingDebounced(settingKey, expanded ? 'false' : 'true');
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  /** Opens the Pinned section when it is collapsed, so edit mode or a new pin shows. */
  private openPinnedSection(): void {
    if (!this.PinnedExpanded) {
      this.OnPinnedExpandedChange(true);
    }
  }

  /**
   * Remove a pin
   */
  RemovePin(pinId: string): void {
    this.pinService.RemovePin(pinId);
  }

  /**
   * Start inline editing of a pin's display name
   */
  StartEditingPin(pinId: string, event: Event): void {
    event.stopPropagation();
    this.EditingPinId = pinId;
    this.cdr.markForCheck();
  }

  /**
   * Save edited pin name
   */
  SavePinName(pinId: string, newName: string): void {
    if (newName.trim()) {
      this.pinService.UpdatePin(pinId, { DisplayName: newName.trim() });
    }
    this.EditingPinId = null;
    this.cdr.markForCheck();
  }

  /**
   * Extract input value from a DOM event (strict template helper)
   */
  GetInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /**
   * Start editing a group name
   */
  StartEditingGroup(groupName: string): void {
    this.EditingGroupName = groupName;
    this.cdr.markForCheck();
  }

  /**
   * Save edited group name - updates all pins in the group
   */
  SaveGroupName(oldName: string, newName: string): void {
    if (newName.trim() && newName.trim() !== oldName) {
      const pinsInGroup = this.pinService.GetPinsInGroup(oldName);
      for (const pin of pinsInGroup) {
        this.pinService.UpdatePin(pin.Id, { Group: newName.trim() });
      }
    }
    this.EditingGroupName = null;
    this.cdr.markForCheck();
  }

  /**
   * Remove a group - moves all pins to ungrouped
   */
  RemoveGroup(groupName: string): void {
    const pinsInGroup = this.pinService.GetPinsInGroup(groupName);
    for (const pin of pinsInGroup) {
      this.pinService.UpdatePin(pin.Id, { Group: undefined });
    }
  }

  /**
   * Get pins in a specific group
   */
  GetPinsInGroup(groupName: string): HomeAppPinnedItem[] {
    return this.pinService.GetPinsInGroup(groupName);
  }

  /**
   * Get icon for a pin based on resource type and metadata
   */
  GetPinIcon(pin: HomeAppPinnedItem): string {
    if (pin.Icon) return pin.Icon;
    const entity = (pin.Configuration['Entity'] || pin.Configuration['entity'] || '') as string;
    switch (pin.ResourceType) {
      case 'Dashboards': return 'fa-solid fa-gauge-high';
      case 'User Views': return entity ? this.GetEntityIconByName(entity) : 'fa-solid fa-table-list';
      case 'Queries': return 'fa-solid fa-database';
      case 'Reports': return 'fa-solid fa-chart-bar';
      case 'Records': return entity ? this.GetEntityIconByName(entity) : 'fa-solid fa-file';
      case 'Custom': return this.getNavItemIcon(pin) || this.getAppIcon(pin) || 'fa-solid fa-cube';
      case 'Actions': return 'fa-solid fa-bolt';
      default: return 'fa-solid fa-thumbtack';
    }
  }

  /**
   * Get display label for a resource type
   */
  GetResourceTypeLabel(pin: HomeAppPinnedItem): string {
    switch (pin.ResourceType) {
      case 'Dashboards': return 'Dashboard';
      case 'User Views': return 'View';
      case 'Queries': return 'Query';
      case 'Reports': return 'Report';
      case 'Records': return (pin.Configuration?.['Entity'] as string) || (pin.Configuration?.['entity'] as string) || 'Record';
      case 'Custom': return pin.ApplicationName || (pin.Configuration['appName'] as string) || 'App';
      case 'Actions': return 'Quick Action';
      default: return pin.ResourceType;
    }
  }

  /** Accent color for a pin — prefers the stored accentColor in Configuration, falls back to Color, then CSS var */
  GetPinAccentColor(pin: HomeAppPinnedItem): string {
    const fromConfig = (pin.Configuration as unknown as ActionPinConfiguration).accentColor;
    return fromConfig || pin.Color || 'var(--mj-text-muted)';
  }

  /**
   * Get the app icon for a pin by looking up the app by name
   */
  private getAppIcon(pin: HomeAppPinnedItem): string | undefined {
    const appName = pin.ApplicationName || pin.Configuration['appName'] as string;
    if (!appName) return undefined;
    const app = this.appManager.GetAllApps().find(a => a.Name === appName);
    return app?.Icon || undefined;
  }

  /**
   * Look up the nav item icon for a Custom pin from the app's nav items cache.
   * Uses the pre-computed appsDisplayData to avoid async lookups.
   */
  private getNavItemIcon(pin: HomeAppPinnedItem): string | undefined {
    const appName = pin.ApplicationName || pin.Configuration['appName'] as string;
    const navItemName = pin.Configuration['navItemName'] as string;
    if (!appName || !navItemName) return undefined;

    // Check the pre-computed display data first (fast)
    const appData = this.AppsDisplayData.find(d => d.app.Name === appName);
    if (appData) {
      const navItem = appData.navItemsPreview.find(ni => ni.Label === navItemName);
      if (navItem) return navItem.Icon;
    }

    // Fall back to AvailableApps data (if Add Panel was loaded)
    const panelApp = this.AvailableApps.find(a => a.appName === appName);
    if (panelApp) {
      const ni = panelApp.navItems.find(n => n.label === navItemName);
      if (ni) return ni.icon;
    }

    return undefined;
  }

  // =============================================
  // PIN CONTEXT MENU (ELLIPSIS)
  // =============================================

  /**
   * Show the pin context menu (triggered by ellipsis button)
   */
  ShowPinMenu(event: MouseEvent, pin: HomeAppPinnedItem): void {
    event.stopPropagation();
    event.preventDefault();
    this.PinMenuPin = pin;
    this.PinMenuX = event.clientX;
    this.PinMenuY = event.clientY;
    this.PinMenuVisible = true;
    this.cdr.markForCheck();

    // Close on click outside or Escape
    setTimeout(() => {
      const clickHandler = () => {
        this.HidePinMenu();
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler);
      };
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.HidePinMenu();
          document.removeEventListener('click', clickHandler);
          document.removeEventListener('keydown', keyHandler);
        }
      };
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler);
    }, 0);
  }

  /**
   * Hide the pin context menu
   */
  HidePinMenu(): void {
    this.PinMenuVisible = false;
    this.PinMenuPin = null;
    this.cdr.markForCheck();
  }

  /**
   * Edit a pin: enters edit mode focused on this pin, and opens a collapsed Pinned section.
   */
  OnPinMenuEdit(): void {
    if (this.PinMenuPin) {
      this.EditMode = true;
      this.EditingPinId = this.PinMenuPin.Id;
      this.openPinnedSection();
      this.cdr.markForCheck();
    }
    this.HidePinMenu();
  }

  /**
   * Move a pin to a different group
   */
  OnPinMenuMoveToGroup(groupName: string | undefined): void {
    if (this.PinMenuPin) {
      this.pinService.UpdatePin(this.PinMenuPin.Id, { Group: groupName });
    }
    this.HidePinMenu();
  }

  /**
   * Unpin a resource from the pin context menu
   */
  OnPinMenuUnpin(): void {
    if (this.PinMenuPin) {
      this.pinService.RemovePin(this.PinMenuPin.Id);
    }
    this.HidePinMenu();
  }

  // =============================================
  // DRAG AND DROP
  // =============================================

  OnDragStart(event: DragEvent, pin: HomeAppPinnedItem): void {
    this.DraggingPinId = pin.Id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', pin.Id);
    }
  }

  OnDragOver(event: DragEvent, targetPin: HomeAppPinnedItem): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.DragOverPinId = targetPin.Id;
  }

  OnDragLeave(): void {
    this.DragOverPinId = null;
  }

  OnDrop(event: DragEvent, targetPin: HomeAppPinnedItem): void {
    event.preventDefault();
    this.DragOverPinId = null;

    if (!this.DraggingPinId || this.DraggingPinId === targetPin.Id) {
      this.DraggingPinId = null;
      return;
    }

    const pins = [...this.PinnedItems];
    const dragIndex = pins.findIndex(p => p.Id === this.DraggingPinId);
    const dropIndex = pins.findIndex(p => p.Id === targetPin.Id);

    if (dragIndex === -1 || dropIndex === -1) {
      this.DraggingPinId = null;
      return;
    }

    // Move the dragged pin to the target position and adopt target's group
    const [draggedPin] = pins.splice(dragIndex, 1);
    draggedPin.Group = targetPin.Group;
    pins.splice(dropIndex, 0, draggedPin);

    this.pinService.ReorderPins(pins);
    this.DraggingPinId = null;
  }

  OnDragEnd(): void {
    this.DraggingPinId = null;
    this.DragOverPinId = null;
  }

  TrackByPin(_index: number, pin: HomeAppPinnedItem): string {
    return pin.Id;
  }

  /** @deprecated Use {@link TrackByPin}. */
  trackByPin(_index: number, pin: HomeAppPinnedItem): string {
    return this.TrackByPin(_index, pin);
  }

  TrackByGroup(_index: number, group: string): string {
    return group;
  }

  /** @deprecated Use {@link TrackByGroup}. */
  trackByGroup(_index: number, group: string): string {
    return this.TrackByGroup(_index, group);
  }

  // =============================================
  // ADD PIN PANEL
  // =============================================

  async OpenAddPinPanel(): Promise<void> {
    this.AddPanelOpen = true;
    this.AddPanelSearchQuery = '';
    this.AddPanelSelectedGroup = '';
    this.AddPanelLoading = true;
    this.cdr.markForCheck();

    await this.loadAvailableResources();
    this.AddPanelLoading = false;
    this.cdr.markForCheck();
  }

  CloseAddPinPanel(): void {
    this.AddPanelOpen = false;
    this.cdr.markForCheck();
  }

  private async loadAvailableResources(): Promise<void> {
    // All four engines are singletons that cache their data in memory. Config(false) is a no-op
    // after first init — DashboardEngine and QueryEngine auto-start at app startup, UserViewEngine
    // and ActionEngineBase initialize on first call. Running them in parallel means whichever
    // ones still need to load do so concurrently, and the already-initialized ones return immediately.
    await Promise.all([
      DashboardEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse),
      UserViewEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse),
      QueryEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse),
      ActionEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse)
    ]);

    const cachedDashboards = DashboardEngine.Instance.IsPermissionConstrained
      ? []
      : DashboardEngine.Instance.Dashboards
          .filter(d => d.Type === 'Config')
          .sort((a, b) => a.Name.localeCompare(b.Name));

    const cachedViews = UserViewEngine.Instance.IsPermissionConstrained
      ? []
      : UserViewEngine.Instance.GetViewsForCurrentUser()
          .slice()
          .sort((a, b) => a.Name.localeCompare(b.Name));

    const cachedQueries = QueryEngine.Instance.IsPermissionConstrained
      ? []
      : QueryEngine.Instance.Queries
          .slice()
          .sort((a, b) => a.Name.localeCompare(b.Name));

    const cachedActions = ActionEngineBase.Instance.Actions
      .filter(a => a.Status === 'Active')
      .sort((a, b) => a.Name.localeCompare(b.Name));

    this.AvailableDashboards = cachedDashboards.map(d => ({
      id: d.ID, name: d.Name,
      pinned: this.pinService.IsPinned('Dashboards', { dashboardId: d.ID })
    }));

    this.AvailableViews = cachedViews.map(v => ({
      id: v.ID, name: v.Name, entityName: v.Entity || '',
      pinned: this.pinService.IsPinned('User Views', { viewId: v.ID })
    }));

    this.AvailableQueries = cachedQueries.map(q => ({
      id: q.ID, name: q.Name,
      pinned: this.pinService.IsPinned('Queries', { queryId: q.ID })
    }));

    // Actions can be pinned multiple times with different configs, so we treat them
    // as always "not pinned" in the panel — the checkmark would be misleading.
    this.AvailableActions = cachedActions.map(a => ({
      id: a.ID, name: a.Name, description: a.Description || '',
      pinned: false
    }));

    // Load apps with their nav items
    await this.loadAvailableApps();

    // Query pins open in Data Explorer when the user has that app (see OnPinClick)
    this.HasDataExplorerApp = this.AvailableApps.some(a => a.appName === 'Data Explorer');
  }

  /**
   * Filter panel items by search query
   */
  FilterPanelItems<T extends { name: string }>(items: T[]): T[] {
    if (!this.AddPanelSearchQuery) return items;
    const q = this.AddPanelSearchQuery.toLowerCase();
    return items.filter(item => item.name.toLowerCase().includes(q));
  }

  /**
   * Load available apps with their nav items for the Add Pin panel
   */
  private async loadAvailableApps(): Promise<void> {
    const allApps = this.appManager.GetAllApps().filter(a => a.Name !== 'Home');
    this.AvailableApps = await Promise.all(allApps.map(async app => {
      const navItems = await app.GetNavItems();
      return {
        appId: app.ID,
        appName: app.Name,
        icon: app.Icon || 'fa-solid fa-cube',
        color: app.GetColor() || '#1976d2',
        navItems: navItems.map(ni => ({
          label: ni.Label,
          icon: ni.Icon || 'fa-solid fa-circle',
          pinned: this.pinService.IsPinned('Custom', { appName: app.Name, navItemName: ni.Label })
        }))
      };
    }));
  }

  /**
   * Set a section's collapsed state in the Add Pin panel from the accordion
   * panel's (ExpandedChange) output. The accordion reports the EXPANDED state,
   * which is the inverse of our stored COLLAPSED flag. OnPush component, so
   * mark for check after mutating the map.
   */
  OnPanelSectionExpandedChange(section: string, expanded: boolean): void {
    this.PanelSectionCollapsed[section] = !expanded;
    this.cdr.markForCheck();
  }

  /**
   * Pin an app nav item from the Add Panel
   */
  PinAppNavItem(appName: string, _appIcon: string, appColor: string, navItemLabel: string, navItemIcon: string): void {
    const input: HomeAppPinInput = {
      DisplayName: navItemLabel,
      ResourceType: 'Custom',
      ApplicationName: appName,
      Icon: navItemIcon,
      Color: appColor,
      Configuration: {
        resourceType: 'Custom',
        appName: appName,
        navItemName: navItemLabel,
      },
      Group: this.getSelectedGroup() || undefined,
    };

    const added = this.pinService.AddPin(input);
    if (added) {
      // Update pinned state in the panel
      this.AvailableApps = this.AvailableApps.map(app => {
        if (app.appName !== appName) return app;
        return {
          ...app,
          navItems: app.navItems.map(ni =>
            ni.label === navItemLabel ? { ...ni, pinned: true } : ni
          )
        };
      });
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${navItemLabel}" pinned to Home`, 'success', 3000
      );
      this.openPinnedSection();
      this.cdr.markForCheck();
    }
  }

  /**
   * Pin a resource from the Add Panel
   */
  PinFromPanel(resourceType: string, id: string, name: string): void {
    let config: Record<string, unknown> = {};
    switch (resourceType) {
      case 'Dashboards':
        config = { dashboardId: id };
        break;
      case 'User Views':
        config = { viewId: id };
        break;
      case 'Queries':
        config = { queryId: id };
        break;
      case 'Reports':
        config = { reportId: id };
        break;
    }

    const input: HomeAppPinInput = {
      DisplayName: name,
      ResourceType: resourceType,
      Configuration: config,
      Group: this.getSelectedGroup() || undefined,
    };

    const added = this.pinService.AddPin(input);
    if (added) {
      this.updatePanelPinnedState(resourceType, id, true);
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${name}" pinned to Home`, 'success', 3000
      );
      this.openPinnedSection();
    }
  }

  // =============================================
  // ACTION PIN DIALOGS
  // =============================================

  /**
   * Open the Configure Action Pin dialog — triggered when the user clicks an Action
   * in the Add Pin panel. Actions need extra configuration (preset params, runtime
   * params, title, theming) before they can be pinned.
   */
  OpenActionPinConfig(actionId: string, actionName: string, description: string): void {
    this.ActionConfigActionId = actionId;
    this.ActionConfigActionName = actionName;
    this.ActionConfigActionDescription = description || null;
    this.ActionConfigDialogVisible = true;
    this.cdr.markForCheck();
  }

  /** Callback from the Configure Action Pin dialog */
  OnActionConfigResult(result: ActionPinConfigResult): void {
    this.ActionConfigDialogVisible = false;
    this.cdr.markForCheck();
    if (result.Action !== 'save' || !result.Pin) return;

    const p = result.Pin;
    const config: ActionPinConfiguration = {
      actionId: p.ActionID,
      actionName: p.ActionName,
      presetParams: p.PresetParams,
      runtimeParamNames: p.RuntimeParamNames,
      accentColor: p.AccentColor,
      displayName: p.DisplayName
    };

    const input: HomeAppPinInput = {
      DisplayName: p.DisplayName,
      ResourceType: 'Actions',
      Icon: p.FaIcon,
      Color: p.AccentColor,
      Configuration: config as unknown as Record<string, unknown>,
      Group: this.getSelectedGroup() || undefined
    };

    const added = this.pinService.AddPin(input);
    if (added) {
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${p.DisplayName}" pinned to Home`, 'success', 3000
      );
      this.openPinnedSection();
    } else {
      MJNotificationService.Instance.CreateSimpleNotification(
        'A pin with the same title and config already exists.', 'warning', 3000
      );
    }
  }

  /** Callback from the Run Action Pin dialog */
  OnActionRunnerResult(_result: ActionPinRunResult): void {
    this.ActionRunnerDialogVisible = false;
    this.ActionRunnerPin = null;
    this.cdr.markForCheck();
  }

  /**
   * Resolve the selected group — handles the "new group" option
   */
  private getSelectedGroup(): string {
    if (this.AddPanelSelectedGroup === '__new__') {
      return this.AddPanelNewGroupName.trim();
    }
    return this.AddPanelSelectedGroup;
  }

  private updatePanelPinnedState(resourceType: string, id: string, pinned: boolean): void {
    switch (resourceType) {
      case 'Dashboards':
        this.AvailableDashboards = this.AvailableDashboards.map(d =>
          d.id === id ? { ...d, pinned } : d
        );
        break;
      case 'User Views':
        this.AvailableViews = this.AvailableViews.map(v =>
          v.id === id ? { ...v, pinned } : v
        );
        break;
      case 'Queries':
        this.AvailableQueries = this.AvailableQueries.map(q =>
          q.id === id ? { ...q, pinned } : q
        );
        break;
    }
    this.cdr.markForCheck();
  }

  /**
   * Filter apps by search query (matches app name or nav item labels)
   */
  FilterApps(): typeof this.AvailableApps {
    if (!this.AddPanelSearchQuery) return this.AvailableApps;
    const q = this.AddPanelSearchQuery.toLowerCase();
    return this.AvailableApps
      .map(app => ({
        ...app,
        navItems: app.navItems.filter(ni => ni.label.toLowerCase().includes(q))
      }))
      .filter(app => app.appName.toLowerCase().includes(q) || app.navItems.length > 0);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
