import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild, ChangeDetectionStrategy, ElementRef, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseResourceComponent, NavigationService, RecentAccessService, RecentAccessItem, HomeAppPinService, HomeAppPinnedItem, HomeAppPinInput, ActionPinConfiguration, IsDashboardEntity, SafeDetectChanges, BuildDashboardPinInput } from '@memberjunction/ng-shared';
import { ResourceTypeForEntity } from '@memberjunction/ng-shared-generic';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { Metadata, CompositeKey, EntityRecordNameInput, RunView, PermissionConstrainedError, LogError } from '@memberjunction/core';
import { ResourceData, MJUserFavoriteEntity, MJUserNotificationEntity, UserInfoEngine, DashboardEngine, UserViewEngine, QueryEngine } from '@memberjunction/core-entities';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { DASHBOARD_NAME_MAX_LENGTH } from '@memberjunction/ng-dashboard-viewer';
import type { DashboardNavRequestEvent } from '@memberjunction/ng-dashboard-viewer';
import { UserAppConfigComponent } from '@memberjunction/ng-explorer-settings';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import type { DashboardEditorComponent } from '../DashboardEditor/dashboard-editor.component';
import { ActionPinConfigResult } from './action-pin-config-dialog.component';
import { ActionPinRunResult } from './action-pin-runner-dialog.component';
import { BuildHomeAgentContext, BuildHomeNotFoundError, ResolveNamedRecord, NamedRecord, RecentItemSummary } from './home-agent-context';
import { MenuAnchor, MenuAnchorOf, NextMenuFocusIndex, PlaceMenu } from './home-menus';
import {
  BuildPinDashboardNames,
  BuildPinnedDashboards,
  CanShowInHome,
  DashboardIdOfPin,
  FindDashboard,
  HomeSwitcherDashboard,
  ResolvePinnedDashboardReference,
  ResolvePinResourceType,
} from './home-pinned-dashboards';
import { AgentToolResult, ValidateStringParam } from '../shared/agent-tool-validation';
import { ObserveDashboardLibraryChanges } from '../shared/dashboard-library-changes';
import { AutoInstallDashboardsApp, CreateBlankDashboard, DashboardNameMaxLength, EnsureDashboardsApp } from '../shared/dashboards-app.helpers';

/** User setting for the Pinned section: 'true' when collapsed, 'false' when open. A missing setting means open. */
const PINNED_COLLAPSED_SETTING = 'HomeApp.PinnedCollapsed';

/** The query param that names the dashboard Home shows in place of its overview. */
const DASHBOARD_QUERY_PARAM = 'dashboard';

/** The dashboard view's title: the switcher button that names the open dashboard. */
const DASHBOARD_TITLE_SELECTOR = '.dashboard-title .switcher-title';

/** The notice when Home cannot show the dashboard the URL or the editor names. */
const DASHBOARD_NOT_AVAILABLE = 'That dashboard is not available';

/** The name the SwitchHomeDashboard agent tool takes for Home's overview (any letter case). */
const HOME_OVERVIEW_NAME = 'Home';

/** Width of the pin options menu, in pixels. */
const PIN_MENU_WIDTH = 220;

/** Process-wide counter for the ids that label each Home's pin menu groups. */
let nextPinMenuUid = 0;

/** One run of pins in the grid: the ungrouped pins (Group null), or the pins of one group. */
interface HomePinSection {
  Key: string;
  Group: string | null;
  Pins: HomeAppPinnedItem[];
}

/** A pin and the name it shows, for the agent's name resolver. */
interface PinRecord extends NamedRecord {
  Pin: HomeAppPinnedItem;
}

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
  private confirmService = inject(MJConfirmService);
  private hostElement = inject<ElementRef<HTMLElement>>(ElementRef);

  @ViewChild('appConfigDialog') AppConfigDialog!: UserAppConfigComponent;
  @ViewChild('pinMenu') private pinMenuEl?: ElementRef<HTMLElement>;
  @ViewChild('dashboardEditor') private dashboardEditor?: DashboardEditorComponent;

  /** @deprecated Use {@link AppConfigDialog}. */
  get appConfigDialog(): UserAppConfigComponent {
    return this.AppConfigDialog;
  }
  /** @deprecated Use {@link AppConfigDialog}. */
  set appConfigDialog(value: UserAppConfigComponent) {
    this.AppConfigDialog = value;
  }

  // State
  /** True until Home's first load finishes; the page shows its loading view meanwhile. A later app-list reload does not set it. */
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
  public CurrentUser: { Name: string; Email: string; FirstName?: string } | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  public get currentUser(): { Name: string; Email: string; FirstName?: string } | null {
    return this.CurrentUser;
  }
  /** @deprecated Use {@link CurrentUser}. */
  public set currentUser(value: { Name: string; Email: string; FirstName?: string } | null) {
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

  /** Whether the Pinned section is open. Saved for each user in the HomeApp.PinnedCollapsed setting. */
  public PinnedExpanded = true;

  // Pin state
  public PinnedItems: HomeAppPinnedItem[] = [];
  public UngroupedPins: HomeAppPinnedItem[] = [];
  public PinGroups: string[] = [];
  /** The pin grid's runs: ungrouped pins first, then each group in group order. */
  public PinSections: HomePinSection[] = [];
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
  /** The pin menu's max height in pixels: the room on its side of the button. Null while the menu is measured. */
  public PinMenuMaxHeight: number | null = null;
  public PinMenuPin: HomeAppPinnedItem | null = null;
  /** Id of the menu's "Move to Group" header, which names the group rows. */
  public readonly PinMenuGroupLabelId = `home-pin-menu-groups-${nextPinMenuUid++}`;
  /** The ellipsis button that opened the pin options menu. Escape and Tab put focus back on it. */
  private pinMenuTrigger: HTMLElement | null = null;

  // Whether the Add Pin panel found the Data Explorer app. Query pins then open in its Queries nav item.
  public HasDataExplorerApp = false;

  // Dashboard view: a pinned dashboard shown in place of the overview
  /** The dashboard Home shows in place of its overview, or null on the overview. */
  public CurrentDashboard: MJDashboardEntity | null = null;
  /** ID of that dashboard, or null. */
  public CurrentDashboardId: string | null = null;
  /** True when the dashboard view opens in edit mode. The editor reads it once, then sets it back to false. */
  public DashboardStartsInEditMode = false;
  /** True while the dashboard Home shows is in edit mode. */
  public IsDashboardEditing = false;
  /** The pinned Config dashboards, in pin order, for the Dashboards switcher. */
  public PinnedDashboards: HomeSwitcherDashboard[] = [];
  /** The names dashboard pins show, by pin id: their dashboards' names from the dashboard cache. */
  private pinDashboardNames = new Map<string, string>();
  /** True once the first load of the dashboard cache has finished, also when it failed. */
  private dashboardCacheLoaded = false;
  /** The dashboard the URL asks for; shown once the dashboard cache has loaded. */
  private requestedDashboardId: string | null = null;
  /**
   * The dashboard Home shows because a URL change named it: back, forward or a deep link into the open tab. When the
   * editor cannot show it, Home leaves the URL as it is. Home's first load does not set it, and any other change of the
   * shown dashboard clears it.
   */
  private urlShownDashboardId: string | null = null;
  /**
   * The dashboard whose title gets focus when the editor has shown it: one the user picked in a switcher or opened from a
   * pin, or one an agent showed after its switch removed the part of Home that had focus.
   */
  private focusTitleOnLoad: string | null = null;

  // New dashboard: the name dialog
  /** True while the New dashboard name dialog is open. */
  public ShowNewDashboardDialog = false;
  /** True while the named dashboard is being created. */
  public IsCreatingDashboard = false;
  /** The longest name the dialog accepts. */
  public NewDashboardNameMaxLength = DASHBOARD_NAME_MAX_LENGTH;

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

  /** True when Home shows its overview: the greeting, Pinned and My applications. */
  public get ShowOverview(): boolean {
    return !this.isLoading && !this.CurrentDashboard;
  }

  /** True when Home shows a dashboard in place of its overview. */
  public get ShowDashboardView(): boolean {
    return !this.isLoading && this.CurrentDashboard !== null;
  }

  /** The Quick Access button and sidebar show on the overview only: in the dashboard view the button would cover the header's actions. */
  public get ShowQuickAccess(): boolean {
    return this.HasSidebarContent && !this.CurrentDashboard;
  }

  /** The name of the dashboard Home shows, from the dashboard cache; null on the overview. */
  public get CurrentDashboardName(): string | null {
    return this.CurrentDashboardId ? this.cachedDashboardName(this.CurrentDashboardId) : null;
  }

  /** True while the dashboard Home shows is in edit mode (see BaseResourceComponent.IsEditing). */
  public override IsEditing(): boolean {
    return this.IsDashboardEditing;
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
   * Opens or closes the Quick Access sidebar and marks Home for check, so the change shows at the next render also
   * when the agent's ToggleSidebar tool calls this outside a template event.
   */
  ToggleSidebar(): void {
    this.SidebarOpen = !this.SidebarOpen;
    this.cdr.markForCheck();
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
      Email: this.metadata.CurrentUser?.Email || '',
      FirstName: this.metadata.CurrentUser?.FirstName || ''
    };
    this.loadSectionStates();

    // The dashboard the tab's data names, for when the query-param stream has not delivered one
    const initialDashboard = this.GetQueryParams()[DASHBOARD_QUERY_PARAM]?.trim();
    if (initialDashboard && !this.requestedDashboardId) {
      this.requestedDashboardId = initialDashboard;
    }

    // The Dashboards part of the first load: the automatic app install and the dashboard cache
    const dashboardsLoad = this.loadDashboards();

    // Subscribe to applications list, filtering out the Home app. The loading view shows during the first load
    // only: a later reload of the list (an app install) keeps the page as it is, so an open dashboard and its edit
    // stay, and the overview keeps its apps until the new list arrives.
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

    // The switcher, the dashboard pin names and the open dashboard follow changes to the dashboard cache
    ObserveDashboardLibraryChanges()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshPinnedDashboards());

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
        this.PinSections = [
          { Key: 'ungrouped', Group: null, Pins: this.UngroupedPins },
          ...this.PinGroups.map(group => ({ Key: `group:${group}`, Group: group, Pins: this.pinService.GetPinsInGroup(group) })),
        ];
        this.refreshPinnedDashboards();
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
  // rename, no group mutation, no reordering, and no dashboard create, rename,
  // edit, save or delete — those are user-confirm-driven or destructive and stay
  // in the UI. Home registers no dashboard edit tools for the dashboard it shows
  // (those are on the dashboard tab). Every tool below maps to the exact same
  // component method a user click would call (OpenApp→OnAppClick, OpenPin→openPin,
  // which a pin click calls, SwitchHomeDashboard→OpenDashboardInHome / GoHome,
  // which a switcher pick calls, search→AddPanel search field, panel/sidebar/
  // edit-mode toggles). Leaving a dashboard with unsaved changes asks the user
  // first, as it does for a click. Handlers are tolerant: they never throw,
  // returning { Success, Data?, ErrorMessage? }.

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
      PinNames: this.PinnedItems.map(p => this.PinName(p)),
      UnreadNotifications: this.UnreadNotifications.length,
      NotificationTitles: this.UnreadNotifications.map(n => n.Title ?? '(untitled)'),
      RecentItemsCount: this.RecentItems.length,
      RecentItems: this.buildRecentItemSummaries(),
      EditMode: this.EditMode,
      AddPanelOpen: this.AddPanelOpen,
      SidebarOpen: this.SidebarOpen,
      AddPanelSearchQuery: this.AddPanelSearchQuery,
      PinnedCollapsed: !this.PinnedExpanded,
      CurrentDashboardName: this.CurrentDashboardName,
      CurrentDashboardID: this.CurrentDashboardId,
      IsEditingDashboard: this.IsDashboardEditing,
      PinnedDashboardNames: this.PinnedDashboards.map(d => d.Name),
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
   * - OpenPin: open a pinned item by the name it shows (exact or partial match). A pinned dashboard opens inside Home.
   * - SearchPins: find pinned items by a name query (read-only — returns matches).
   * - OpenRecent: open a recently-accessed item by display name (read-only navigation).
   * - SearchAddPinPanel: open the Add Pin panel (if needed) and apply a search query.
   * - ClearAddPinPanelSearch: clear the Add Pin panel search query.
   * - OpenAddPinPanel / CloseAddPinPanel: toggle the Add Pin panel.
   * - ToggleSidebar: toggle the notifications/favorites/recents sidebar (on the overview only).
   * - TogglePinEditMode: toggle pin edit mode (reorder/rename UI affordances; on the overview only).
   * - SwitchHomeDashboard: show a pinned dashboard inside Home by its name (exact or partial match) or id, or "Home"
   *   for the overview.
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
        Description: 'Open a pinned item on the Home screen by the name it shows (exact or partial match). A pinned dashboard opens inside Home; other pins open as before.',
        ParameterSchema: { type: 'object', properties: { pinName: { type: 'string' } }, required: ['pinName'] },
        Handler: async (params: Record<string, unknown>) => this.toolOpenPin(params),
      },
      {
        Name: 'SearchPins',
        Description: 'Find pinned items on the Home screen whose name, as the pin shows it, matches a query (case-insensitive contains). Read-only — returns the matching pin names; does not open anything.',
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
        Description: `Toggle the Home sidebar (unread notifications, favorites, and recent items). Quick Access shows on the ${HOME_OVERVIEW_NAME} overview only: while Home shows a dashboard, use SwitchHomeDashboard with "${HOME_OVERVIEW_NAME}" first.`,
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.toolToggleSidebar(),
      },
      {
        Name: 'TogglePinEditMode',
        Description: `Toggle pin edit mode on the Home overview (lets the user rename/reorder pins). This only changes the UI mode — it does not modify any pins. Pin edit mode shows on the ${HOME_OVERVIEW_NAME} overview only: while Home shows a dashboard, use SwitchHomeDashboard with "${HOME_OVERVIEW_NAME}" first.`,
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.toolTogglePinEditMode(),
      },
      {
        Name: 'SwitchHomeDashboard',
        Description: `Show a pinned dashboard inside Home by its name (exact or partial match) or id, or "${HOME_OVERVIEW_NAME}" to return to the Home overview. Navigation only — it does not pin, unpin, rename or edit dashboards. When the open dashboard has unsaved changes, the user is asked first.`,
        ParameterSchema: { type: 'object', properties: { dashboard: { type: 'string' } }, required: ['dashboard'] },
        Handler: async (params: Record<string, unknown>) => this.toolSwitchHomeDashboard(params),
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

  /** The pinned items with the names they show, for the resolver. */
  private get pinNamedRecords(): PinRecord[] {
    return this.PinnedItems.map(pin => ({ Name: this.PinName(pin), Pin: pin }));
  }

  /**
   * Resolve a pinned item by the name it shows (exact then partial, case-insensitive) and open it. A pinned dashboard
   * opens inside Home. Focus stays where it is unless the change removed it (see refocusIfRemoved).
   */
  private async toolOpenPin(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
    const parsed = ValidateStringParam(params['pinName'], 'pinName');
    if (!parsed.ok) {
      return parsed.result;
    }
    const pinName = parsed.value.trim();
    if (!pinName) {
      return { Success: false, ErrorMessage: 'pinName is required.' };
    }
    const records = this.pinNamedRecords;
    const match = ResolveNamedRecord(pinName, records);
    if (!match) {
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(pinName, 'pinned item', records) };
    }
    const opened = await this.switchViewForAgent(() => this.leaveEditModeAndOpenPin(match.Pin));
    if (!opened) {
      return { Success: false, ErrorMessage: `"${match.Name}" did not open. The pin may be broken, or the user kept editing the open dashboard.` };
    }
    return { Success: true, Data: { PinName: match.Name } };
  }

  /** Opens a pin for the agent. A pin does not open in edit mode: Home leaves it first, as Done does, and tells the agent. */
  private leaveEditModeAndOpenPin(pin: HomeAppPinnedItem): Promise<boolean> {
    if (this.EditMode) {
      this.ToggleEditMode();
      this.publishAgentContext();
    }
    return this.openPin(pin);
  }

  /** Find pinned items whose shown name matches a query (read-only — returns matches). */
  private toolSearchPins(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const parsed = ValidateStringParam(params['query'], 'query');
    if (!parsed.ok) {
      return parsed.result;
    }
    const query = parsed.value.trim().toLowerCase();
    const names = this.PinnedItems.map(p => this.PinName(p));
    const matches = query ? names.filter(name => name.toLowerCase().includes(query)) : names;
    return { Success: true, Data: { Matches: matches, MatchCount: matches.length } };
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

  /**
   * Shows a pinned dashboard in Home by id (any letter case) or name (exact, then partial), or the overview for
   * "Home". It uses the methods a switcher pick uses, so the user is asked first about unsaved changes. Unlike a pick,
   * it moves focus only when the switch removed it (see refocusIfRemoved).
   */
  private async toolSwitchHomeDashboard(params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
    const parsed = ValidateStringParam(params['dashboard'], 'dashboard');
    if (!parsed.ok) {
      return parsed.result;
    }
    const reference = parsed.value.trim();
    if (!reference) {
      return { Success: false, ErrorMessage: 'dashboard is required.' };
    }
    if (reference.toLowerCase() === HOME_OVERVIEW_NAME.toLowerCase()) {
      return (await this.switchViewForAgent(() => this.GoHome()))
        ? { Success: true, Data: { HomeView: 'Overview' } }
        : { Success: false, ErrorMessage: `The ${HOME_OVERVIEW_NAME} overview did not open. The user kept editing the open dashboard.` };
    }
    const target = ResolvePinnedDashboardReference(reference, this.PinnedDashboards);
    if (!target) {
      const candidates: NamedRecord[] = [{ Name: HOME_OVERVIEW_NAME }, ...this.PinnedDashboards.map(d => ({ Name: d.Name }))];
      return { Success: false, ErrorMessage: BuildHomeNotFoundError(reference, 'pinned dashboard', candidates) };
    }
    // The switcher's list can trail the dashboard cache by a moment
    if (!this.findHomeDashboard(target.ID)) {
      return { Success: false, ErrorMessage: `"${target.Name}" did not open. The dashboard is not available.` };
    }
    if (!(await this.switchViewForAgent(() => this.OpenDashboardInHome(target.ID)))) {
      return { Success: false, ErrorMessage: `"${target.Name}" did not open. The user kept editing the open dashboard.` };
    }
    return { Success: true, Data: { CurrentDashboardName: target.Name } };
  }

  /** Opens or closes Quick Access. While a dashboard shows, where Quick Access does not show, it changes nothing. */
  private toolToggleSidebar(): AgentToolResult & { Data?: Record<string, unknown> } {
    if (this.CurrentDashboardId) {
      return { Success: false, ErrorMessage: overviewOnlyError('Quick Access') };
    }
    this.ToggleSidebar();
    this.publishAgentContext();
    return { Success: true, Data: { SidebarOpen: this.SidebarOpen } };
  }

  /**
   * Turns pin edit mode on or off. While a dashboard shows, where the pins do not show, it changes nothing: it neither
   * opens a collapsed Pinned section nor saves that.
   */
  private toolTogglePinEditMode(): AgentToolResult & { Data?: Record<string, unknown> } {
    if (this.CurrentDashboardId) {
      return { Success: false, ErrorMessage: overviewOnlyError('Pin edit mode') };
    }
    this.ToggleEditMode();
    this.publishAgentContext();
    return { Success: true, Data: { EditMode: this.EditMode } };
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

  /** The first name the greeting uses, or the user's display name. */
  public get GreetingName(): string {
    return this.CurrentUser?.FirstName || this.CurrentUser?.Name || 'User';
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
        color: app.GetColor() || 'var(--mj-brand-primary)',
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
  // DASHBOARDS APP AND CACHE
  // =============================================

  /**
   * The Dashboards part of Home's first load: the automatic Dashboards app install (at most once
   * per user) and the dashboard cache. Home stays on its loading view until both finish, so the
   * app-list reload that an install causes does not show a second loading view. Each install step
   * gives up after DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS. The cache load has no time limit: Home
   * shows its loading view until the server answers or the load fails. Never rejects.
   */
  private async loadDashboards(): Promise<void> {
    await Promise.allSettled([AutoInstallDashboardsApp(this.appManager), this.loadDashboardCache()]);
  }

  /**
   * Loads the dashboard cache if it is not loaded yet, then reads the switcher's list and the dashboard pin names
   * from it and shows the dashboard the URL asks for (one Home cannot show is removed from the URL). A failed load is
   * only logged. Never rejects.
   */
  private async loadDashboardCache(): Promise<void> {
    try {
      await DashboardEngine.Instance.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    } catch (error) {
      LogError(`Home: could not load the dashboards: ${errorMessage(error)}`);
    }
    this.dashboardCacheLoaded = true;
    this.refreshPinnedDashboards();
    this.applyRequestedDashboard(true);
  }

  /** Reloads the dashboard cache, so a dashboard saved a moment ago is in it. A failure is only logged. */
  private async reloadDashboardCache(): Promise<void> {
    try {
      await DashboardEngine.Instance.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    } catch (error) {
      LogError(`Home: could not reload the dashboards: ${errorMessage(error)}`);
    }
  }

  /** The dashboards the user can open, from the dashboard cache; none when the user cannot read the cache. */
  private accessibleDashboards(): MJDashboardEntity[] {
    const engine = DashboardEngine.Instance;
    return engine.IsPermissionConstrained ? [] : engine.GetAccessibleDashboards(this.ProviderToUse.CurrentUser.ID);
  }

  /** Re-reads the switcher's list and the names dashboard pins show, and keeps the open dashboard in step with the cache. */
  private refreshPinnedDashboards(): void {
    const dashboards = this.accessibleDashboards();
    this.PinnedDashboards = BuildPinnedDashboards(this.PinnedItems, dashboards);
    this.pinDashboardNames = BuildPinDashboardNames(this.PinnedItems, dashboards);
    this.syncCurrentDashboard(dashboards);
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  /**
   * Opens a dashboard in place of the preview tab, which is usually the tab that shows Home, so Back
   * returns to Home. A Shift-click opens it in a separate tab.
   */
  private openDashboard(dashboardId: string, dashboardName: string): void {
    this.navigationService.OpenDashboard(dashboardId, dashboardName);
  }

  /**
   * Follows a link from a panel of the dashboard Home shows: a record, a dashboard or a query, as the
   * dashboard tab does. Other link types are only logged.
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

  // =============================================
  // DASHBOARD VIEW
  // =============================================

  /**
   * Shows a dashboard inside Home in place of the overview and writes it to the URL (?dashboard=<id>). Only a Config
   * dashboard the user can open shows in Home. Asks first when the open dashboard has unsaved changes. Returns false
   * when the dashboard did not open.
   */
  public async OpenDashboardInHome(dashboardId: string, startInEditMode = false): Promise<boolean> {
    const dashboard = this.findHomeDashboard(dashboardId);
    if (!dashboard) return false;
    if (UUIDsEqual(dashboard.ID, this.CurrentDashboardId)) return true;
    if (!(await this.confirmLeaveDashboard())) return false;
    // Another open of the same dashboard (a double click) finished meanwhile
    if (UUIDsEqual(dashboard.ID, this.CurrentDashboardId)) return true;
    this.requestedDashboardId = dashboard.ID;
    this.setCurrentDashboard(dashboard, startInEditMode);
    this.UpdateQueryParams({ [DASHBOARD_QUERY_PARAM]: dashboard.ID });
    void this.recentAccessService.LogAccess('MJ: Dashboards', dashboard.ID, 'dashboard');
    return true;
  }

  /**
   * Returns to the overview (switcher Home, breadcrumb Home) and removes the dashboard from the URL. Asks first when
   * the open dashboard has unsaved changes. Returns false when the user keeps editing.
   */
  public async GoHome(): Promise<boolean> {
    if (!this.CurrentDashboardId) return true;
    if (!(await this.confirmLeaveDashboard())) return false;
    this.closeDashboardView();
    return true;
  }

  /**
   * A pick in a Dashboards switcher, or the breadcrumb's Home: null returns to the overview, an id opens that
   * dashboard in Home. Focus then moves to what shows.
   */
  public OnSwitcherPick(dashboardId: string | null): void {
    void this.followSwitcherPick(dashboardId);
  }

  /**
   * Manage pins (switcher): the overview with the pins in edit mode, and focus on the Pinned header. When the user
   * keeps editing the open dashboard, Home stays on it and focus goes to its title.
   */
  public async ManagePins(): Promise<void> {
    const home = await this.GoHome();
    if (home && !this.EditMode) {
      this.ToggleEditMode();
    }
    this.focusShownView();
  }

  /** The switcher's New dashboard: asks to leave unsaved changes first, then asks for the name. */
  public async OpenNewDashboardDialog(): Promise<void> {
    if (!(await this.confirmLeaveDashboard())) return;
    this.NewDashboardNameMaxLength = DashboardNameMaxLength(this.ProviderToUse);
    this.ShowNewDashboardDialog = true;
    this.cdr.markForCheck();
  }

  /** Closes the name dialog; nothing is created. */
  public OnNewDashboardCancelled(): void {
    this.ShowNewDashboardDialog = false;
    this.cdr.markForCheck();
  }

  /**
   * Creates the named dashboard, pins it to Home and shows it in Home in edit mode. When the save fails, the
   * dialog stays open with the name and the user is told. A second Create while one runs is ignored.
   */
  public async OnNewDashboardNamed(name: string): Promise<void> {
    if (this.IsCreatingDashboard) return;
    this.IsCreatingDashboard = true;
    this.cdr.markForCheck();
    try {
      const dashboard = await CreateBlankDashboard(this.ProviderToUse, name);
      if (!dashboard) {
        MJNotificationService.Instance.CreateSimpleNotification('Could not create the dashboard', 'error', 3000);
        return;
      }
      await this.reloadDashboardCache();
      this.pinService.AddPin(BuildDashboardPinInput(dashboard));
      this.ShowNewDashboardDialog = false;
      if (!(await this.OpenDashboardInHome(dashboard.ID, true))) {
        this.openDashboard(dashboard.ID, dashboard.Name);
      }
    } catch (error) {
      LogError(`Home: could not open the new dashboard: ${errorMessage(error)}`);
      MJNotificationService.Instance.CreateSimpleNotification('Could not open the new dashboard', 'error', 3000);
    } finally {
      this.IsCreatingDashboard = false;
      this.cdr.markForCheck();
    }
  }

  /** Opens the dashboard in a tab of the Dashboards app, installing the app first when the user lacks it. */
  public async OpenDashboardInDashboardsApp(dashboard: MJDashboardEntity): Promise<void> {
    const app = await EnsureDashboardsApp(this.appManager);
    this.navigationService.OpenDashboard(dashboard.ID, dashboard.Name, app ? { applicationId: app.ID } : undefined);
  }

  /**
   * The editor entered or left edit mode. The editor can report leaving it while Home renders (it drops an edit when
   * it gets another dashboard), so this sets no state the template reads, and tells the agent after the render.
   */
  public OnDashboardEditingChange(editing: boolean): void {
    this.IsDashboardEditing = editing;
    queueMicrotask(() => this.publishAgentContext());
  }

  /**
   * The editor saved the dashboard, or its saved name changed: the switcher and the pin names read the new name from
   * the cache.
   */
  public OnDashboardSaved(): void {
    this.refreshPinnedDashboards();
  }

  /** The editor has shown a dashboard. Its title gets focus when Home asked for that (see focusTitleOnLoad). */
  public OnDashboardViewLoaded(dashboard: MJDashboardEntity): void {
    if (this.focusTitleOnLoad && UUIDsEqual(dashboard.ID, this.focusTitleOnLoad)) {
      this.focusTitleOnLoad = null;
      this.focusInHome(DASHBOARD_TITLE_SELECTOR);
    }
  }

  /**
   * The editor could not show the dashboard: Home returns to its overview and tells the user. A dashboard that a URL
   * change named stays in the URL, since a write would add a history entry that every later Back lands on again. Any
   * other dashboard is removed from the URL: one the user opened in Home, or the one Home opened with on its first load,
   * so the tab does not keep it.
   */
  public OnDashboardViewLoadFailed(): void {
    const namedByUrl = this.urlShownDashboardId !== null && UUIDsEqual(this.urlShownDashboardId, this.CurrentDashboardId);
    this.closeDashboardView(DASHBOARD_NOT_AVAILABLE, !namedByUrl);
  }

  /** Applies the dashboard the URL names, for back and forward, deep links and pins of Home. */
  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    const requested = params[DASHBOARD_QUERY_PARAM]?.trim() || null;
    if (UUIDsEqual(requested, this.requestedDashboardId)) return;
    if (this.hasUnsavedDashboardChanges()) {
      void this.followDashboardParamAfterConfirm(requested);
      return;
    }
    this.requestedDashboardId = requested;
    this.applyRequestedDashboard(false);
  }

  /**
   * Asks before a URL change leaves unsaved changes. When the user keeps editing, writes the open dashboard back to the
   * URL.
   */
  private async followDashboardParamAfterConfirm(requested: string | null): Promise<void> {
    if (!(await this.confirmLeaveDashboard())) {
      this.UpdateQueryParams({ [DASHBOARD_QUERY_PARAM]: this.CurrentDashboardId });
      return;
    }
    this.requestedDashboardId = requested;
    this.applyRequestedDashboard(false);
  }

  /**
   * Shows the dashboard the URL asks for, once the dashboard cache has loaded: the dashboard view for a Config
   * dashboard the user can open, else the overview. For a dashboard Home cannot show, the user is told, and
   * `removeFromUrl` removes it from the URL. After a URL change (back, forward, a deep link into the open tab) the URL
   * stays as it is: a write then would add a history entry that every later Back lands on again. After a URL change,
   * Home also notes that the URL named the dashboard it shows (see OnDashboardViewLoadFailed).
   */
  private applyRequestedDashboard(removeFromUrl: boolean): void {
    if (!this.dashboardCacheLoaded) return;
    const requested = this.requestedDashboardId;
    const dashboard = requested ? this.findHomeDashboard(requested) : null;
    if (requested && !dashboard) {
      this.closeDashboardView(DASHBOARD_NOT_AVAILABLE, removeFromUrl);
      return;
    }
    this.setCurrentDashboard(dashboard, false);
    this.urlShownDashboardId = removeFromUrl ? null : dashboard?.ID ?? null;
  }

  /**
   * Keeps the open dashboard in step with the cache: one that is gone, or that the user can no longer open, returns
   * Home to the overview.
   */
  private syncCurrentDashboard(dashboards: readonly MJDashboardEntity[]): void {
    if (!this.dashboardCacheLoaded || !this.CurrentDashboardId || FindDashboard(dashboards, this.CurrentDashboardId)) return;
    this.closeDashboardView('The dashboard is no longer available');
  }

  /**
   * Returns Home to its overview and, with a notice, tells the user. `removeFromUrl` also removes the dashboard from
   * the URL; that write runs after the current call stack, and only when no dashboard shows by then.
   */
  private closeDashboardView(notice?: string, removeFromUrl = true): void {
    this.requestedDashboardId = null;
    this.setCurrentDashboard(null, false);
    if (removeFromUrl) {
      queueMicrotask(() => {
        if (!this.CurrentDashboardId) {
          this.UpdateQueryParams({ [DASHBOARD_QUERY_PARAM]: null });
        }
      });
    }
    if (notice) {
      MJNotificationService.Instance.CreateSimpleNotification(notice, 'warning', 3000);
    }
  }

  /**
   * Shows `dashboard` (or the overview for null). Home keeps the object it was given for the same dashboard: the
   * editor follows the dashboard cache itself after a save, so a new copy of the same dashboard is not pushed to it.
   */
  private setCurrentDashboard(dashboard: MJDashboardEntity | null, startInEditMode: boolean): void {
    if (UUIDsEqual(dashboard?.ID, this.CurrentDashboardId)) return;
    this.CurrentDashboard = dashboard;
    this.CurrentDashboardId = dashboard?.ID ?? null;
    this.DashboardStartsInEditMode = dashboard !== null && startInEditMode;
    this.IsDashboardEditing = false;
    this.focusTitleOnLoad = null;
    this.urlShownDashboardId = null;
    this.EditingPinId = null;
    this.SidebarOpen = false;
    this.HidePinMenu();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  /** A Config dashboard the user can open, by id (any letter case), or null. */
  private findHomeDashboard(dashboardId: string): MJDashboardEntity | null {
    const dashboard = FindDashboard(this.accessibleDashboards(), dashboardId);
    return dashboard && CanShowInHome(dashboard) ? dashboard : null;
  }

  /** True while the open dashboard is in edit mode with changes the editor has not saved. */
  private hasUnsavedDashboardChanges(): boolean {
    return this.IsDashboardEditing && (this.dashboardEditor?.HasUnsavedChanges ?? false);
  }

  /**
   * True when Home may leave the open dashboard: it is not being edited, its changes are saved, or the user chose to
   * discard them (the editor then cancels its edit). False when the user keeps editing.
   */
  private async confirmLeaveDashboard(): Promise<boolean> {
    const editor = this.dashboardEditor;
    if (!editor || !this.IsDashboardEditing) return true;
    if (editor.HasUnsavedChanges && !(await this.confirmDiscardDashboardChanges())) return false;
    editor.CancelEdit();
    return true;
  }

  /**
   * Asks whether to discard the open dashboard's unsaved changes. Resolves true for Discard changes, false for Keep
   * editing.
   */
  private confirmDiscardDashboardChanges(): Promise<boolean> {
    return this.confirmService.Confirm({
      title: 'Discard changes?',
      message: `Leave "${this.CurrentDashboardName}" without saving?`,
      detail: 'Your changes to this dashboard will be lost.',
      type: 'warning',
      confirmText: 'Discard changes',
      cancelText: 'Keep editing',
    });
  }

  /**
   * Follows a switcher pick, then moves focus to what shows: a dashboard Home switched to gets focus on its title once
   * the editor has shown it; otherwise focus goes to the open dashboard's title, or to the Pinned header.
   */
  private async followSwitcherPick(dashboardId: string | null): Promise<void> {
    const switching = dashboardId !== null && !UUIDsEqual(dashboardId, this.CurrentDashboardId);
    const moved = dashboardId ? await this.OpenDashboardInHome(dashboardId) : await this.GoHome();
    if (moved && switching) {
      this.focusTitleOnLoad = this.CurrentDashboardId;
    } else {
      this.focusShownView();
    }
  }

  /** Runs an agent's change of Home's view, then moves focus when the change removed it (see refocusIfRemoved). */
  private async switchViewForAgent(switchView: () => Promise<boolean>): Promise<boolean> {
    const focused = this.focusedElementInHome();
    const switched = await switchView();
    this.refocusIfRemoved(focused);
    return switched;
  }

  /** The element in Home that has focus, or null when focus is outside Home. */
  private focusedElementInHome(): HTMLElement | null {
    const focused = document.activeElement;
    return focused instanceof HTMLElement && this.hostElement.nativeElement.contains(focused) ? focused : null;
  }

  /**
   * After an agent changed Home's view: renders Home, and when `focused` is gone (the change removed the part of Home it
   * was in), moves focus as a switcher pick does, to the title of the dashboard Home shows once the editor has shown it,
   * or on the overview to the Pinned header. Focus that is still on the page stays where it is.
   */
  private refocusIfRemoved(focused: HTMLElement | null): void {
    if (!focused) return;
    SafeDetectChanges(this.cdr);
    if (focused.isConnected) return;
    if (this.CurrentDashboardId) {
      this.focusTitleOnLoad = this.CurrentDashboardId;
    } else {
      this.focusShownView();
    }
  }

  /**
   * Moves focus to the open dashboard's title, or on the overview to the Pinned header: its Dashboards button, or Done
   * while the pins are in edit mode.
   */
  private focusShownView(): void {
    if (this.CurrentDashboardId) {
      this.focusInHome(DASHBOARD_TITLE_SELECTOR);
    } else {
      this.focusInHome(this.EditMode ? '.pinned-actions > button' : '.pinned-actions .switcher-button');
    }
  }

  /**
   * Renders Home, then focuses the first element in it that matches `selector`, and returns that element. Returns null,
   * and focuses nothing, when none shows.
   */
  private focusInHome<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    SafeDetectChanges(this.cdr);
    const element = this.hostElement.nativeElement.querySelector<T>(selector);
    element?.focus();
    return element;
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
      const rt = ResolvePinResourceType(pin);
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
      ResolvePinResourceType(pin) === 'Custom' && !pin.Icon
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
   * Opens a pinned resource. A click in edit mode does nothing. A dashboard the click shows in Home gets focus on its
   * title once the editor has shown it.
   */
  OnPinClick(pin: HomeAppPinnedItem): void {
    void this.openPinForUser(pin);
  }

  /** Opens a pin the user clicked. When it shows a dashboard in Home, that dashboard's title gets focus once the editor has shown it. */
  private async openPinForUser(pin: HomeAppPinnedItem): Promise<void> {
    const shown = this.CurrentDashboardId;
    if ((await this.openPin(pin)) && this.CurrentDashboardId && !UUIDsEqual(this.CurrentDashboardId, shown)) {
      this.focusTitleOnLoad = this.CurrentDashboardId;
    }
  }

  /**
   * Opens a pin: a dashboard pin as openDashboardPin describes, other pins as Home always has. Returns false when
   * nothing opened: in edit mode, for a broken pin, or when the user kept editing the open dashboard.
   */
  private async openPin(pin: HomeAppPinnedItem): Promise<boolean> {
    if (this.EditMode) return false;
    const resourceType = ResolvePinResourceType(pin);
    return resourceType === 'Dashboards' ? this.openDashboardPin(pin) : this.openResourcePin(pin, resourceType);
  }

  /**
   * Opens a dashboard pin: a Config dashboard the user can open shows inside Home; a Code dashboard, or one the cache
   * does not have, opens in a tab under the name the pin shows. Returns false when nothing opened.
   */
  private async openDashboardPin(pin: HomeAppPinnedItem): Promise<boolean> {
    const dashboardId = DashboardIdOfPin(pin);
    if (!dashboardId) {
      console.warn('[Pin Click] Dashboards pin missing dashboardId and recordId', pin.Configuration);
      return false;
    }
    if (this.findHomeDashboard(dashboardId)) {
      return this.OpenDashboardInHome(dashboardId);
    }
    this.openDashboard(dashboardId, this.PinName(pin));
    return true;
  }

  /**
   * Opens a pin that is not a dashboard pin: a view, a query, a record, an app page or an action. Returns false when
   * the pin is broken and nothing opened.
   */
  private openResourcePin(pin: HomeAppPinnedItem, resourceType: string): boolean {
    const config = pin.Configuration;
    switch (resourceType) {
      case 'User Views': {
        if (config['isDynamic']) {
          const entityName = (config['Entity'] || config['entity']) as string | undefined;
          if (!entityName) {
            console.warn('[Pin Click] Dynamic view pin missing Entity', config);
            return false;
          }
          this.navigationService.OpenDynamicView(entityName, config['extraFilter'] as string | undefined);
          return true;
        }
        const viewId = config['viewId'] as string;
        if (!viewId) return false;
        this.navigationService.OpenView(viewId, pin.DisplayName);
        return true;
      }
      case 'Queries': {
        const queryId = config['queryId'] as string;
        if (!queryId) return false;
        // Opens in Data Explorer's Queries nav item once the Add Pin panel has found that app
        const deApp = this.HasDataExplorerApp
          ? this.appManager.GetAllApps().find(a => a.Name === 'Data Explorer')
          : null;
        if (deApp) {
          void this.navigationService.SwitchToApp(deApp.ID, 'Queries', { queryId: queryId });
        } else {
          this.navigationService.OpenQuery(queryId, pin.DisplayName);
        }
        return true;
      }
      case 'Records': {
        const entityName = (config['Entity'] || config['entity']) as string;
        const recordId = config['recordId'] as string;
        if (!entityName || !recordId) {
          console.warn('[Pin Click] Records pin missing Entity or recordId', config);
          return false;
        }
        const compositeKey = this.buildCompositeKeyForRecord(entityName, recordId);
        if (!compositeKey) return false;
        this.navigationService.OpenEntityRecord(entityName, compositeKey);
        return true;
      }
      case 'Custom':
        return this.openAppPagePin(config);
      case 'Actions': {
        const actionId = config['actionId'] as string;
        if (!actionId) {
          console.warn('[Pin Click] Action pin missing actionId', config);
          return false;
        }
        this.ActionRunnerPin = pin;
        this.ActionRunnerDialogVisible = true;
        this.cdr.markForCheck();
        return true;
      }
      default:
        console.warn('[Pin Click] Unrecognized resource type', resourceType, 'for pin', pin.DisplayName, config);
        return false;
    }
  }

  /** Opens an app page pin (a Custom pin): a nav item of an app, found by the app's name. Returns false when the pin is broken. */
  private openAppPagePin(config: Record<string, unknown>): boolean {
    // Custom resources are nav items within apps — always use app name, never ID
    const navItemName = config['navItemName'] as string;
    const appName = config['appName'] as string;
    const queryParams = config['queryParams'] as Record<string, string> | undefined;
    if (!appName) {
      console.warn('[Pin Click] Custom pin missing appName', config);
      return false;
    }
    const app = this.appManager.GetAllApps().find(a => a.Name === appName);
    if (!app) {
      console.warn(`[Pin Click] Custom pin: app "${appName}" not found`, config);
      return false;
    }
    // SwitchToApp gets the query params, so the target tab has them when it activates, before a cached resource
    // component reattaches: the page opens on the state the pin names.
    void this.navigationService.SwitchToApp(app.ID, navItemName, queryParams);
    return true;
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

  /** Opens or collapses the Pinned section, saves the choice for the user and reports it to the agent. */
  OnPinnedExpandedChange(expanded: boolean): void {
    this.PinnedExpanded = expanded;
    this.sectionStateChanged(PINNED_COLLAPSED_SETTING, expanded);
  }

  /** Reads whether the Pinned section is open. 'true' means collapsed; a missing setting means open. */
  private loadSectionStates(): void {
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
   * Starts renaming a pin: shows its rename box, with focus in it and the name selected. A dashboard pin is renamed
   * only by a user who can edit its dashboard; other users are told why not.
   */
  StartEditingPin(pinId: string, event: Event): void {
    event.stopPropagation();
    const pin = this.PinnedItems.find(p => p.Id === pinId);
    if (pin && !this.canRenamePin(pin)) {
      this.notifyCannotRename(pin);
      return;
    }
    this.EditingPinId = pinId;
    this.focusPinNameInput();
  }

  /**
   * Saves the name typed in a pin's rename box and closes the box. A dashboard pin renames its dashboard, since it
   * shows the dashboard's name; other pins rename only the pin. An empty or unchanged name changes nothing. A call
   * after the rename has ended does nothing: the browser can blur the box as it goes away.
   */
  SavePinName(pinId: string, newName: string): void {
    if (this.EditingPinId !== pinId) return;
    this.EditingPinId = null;
    this.cdr.markForCheck();
    const pin = this.PinnedItems.find(p => p.Id === pinId);
    const name = newName.trim();
    if (!pin || !name || name === this.PinName(pin)) return;
    const dashboard = this.pinDashboard(pin);
    if (dashboard) {
      void this.renameDashboard(dashboard, pin, name);
      return;
    }
    this.pinService.UpdatePin(pinId, { DisplayName: name });
  }

  /** Enter in a pin's rename box: saves the name, then moves focus to Done, since the box goes away. */
  public OnPinNameEnter(pinId: string, event: Event): void {
    this.SavePinName(pinId, this.GetInputValue(event));
    this.focusShownView();
  }

  /** Renders Home, then puts focus in the open rename box and selects the name, so typing replaces it. */
  private focusPinNameInput(): void {
    this.focusInHome<HTMLInputElement>('.pin-card .pin-name-input')?.select();
  }

  /** The dashboard a dashboard pin shows, from the dashboard cache. Null for other pins, and when the cache lacks it. */
  private pinDashboard(pin: HomeAppPinnedItem): MJDashboardEntity | null {
    return FindDashboard(this.accessibleDashboards(), DashboardIdOfPin(pin));
  }

  /** True when the user may rename the pin: a pin that shows no cached dashboard, or a dashboard pin whose dashboard the user can edit. */
  private canRenamePin(pin: HomeAppPinnedItem): boolean {
    const dashboard = this.pinDashboard(pin);
    return !dashboard || DashboardEngine.Instance.CanUserEditDashboard(dashboard.ID, this.ProviderToUse.CurrentUser.ID);
  }

  /** Tells the user that only people who can edit the pin's dashboard can rename the pin. */
  private notifyCannotRename(pin: HomeAppPinnedItem): void {
    MJNotificationService.Instance.CreateSimpleNotification(`Only people who can edit "${this.PinName(pin)}" can rename it`, 'info', 3000);
  }

  /**
   * Renames the dashboard a pin shows, and keeps the pin's stored name in step: the name the pin shows when the cache
   * lacks the dashboard. It renames the cache's own dashboard object, so the switcher, the pin names and an editor that
   * shows the dashboard have the new name at once. While a save of that object runs (an editor's Save, for example),
   * it renames nothing and tells the user: its own save would join the running one and write nothing. A failed save
   * puts the old name back and tells the user.
   */
  private async renameDashboard(dashboard: MJDashboardEntity, pin: HomeAppPinnedItem, name: string): Promise<void> {
    if (dashboard.IsSaving) {
      MJNotificationService.Instance.CreateSimpleNotification(`"${dashboard.Name}" is being saved. Rename it again in a moment.`, 'info', 3000);
      return;
    }
    const previous = dashboard.Name;
    dashboard.Name = name;
    this.refreshPinnedDashboards();
    const failure = await this.saveRenamedDashboard(dashboard);
    if (failure !== null) {
      dashboard.Name = previous;
      this.refreshPinnedDashboards();
      LogError(`Home: could not rename the dashboard "${previous}": ${failure}`);
      MJNotificationService.Instance.CreateSimpleNotification(`Could not rename "${previous}"`, 'error', 3000);
      return;
    }
    this.pinService.UpdatePin(pin.Id, { DisplayName: name });
    MJNotificationService.Instance.CreateSimpleNotification(`Renamed the dashboard to "${name}"`, 'success', 2000);
  }

  /** Saves a renamed dashboard. Returns null when it saved, else why not. Never throws. */
  private async saveRenamedDashboard(dashboard: MJDashboardEntity): Promise<string | null> {
    try {
      return (await dashboard.Save()) ? null : dashboard.LatestResult?.CompleteMessage ?? 'unknown error';
    } catch (error) {
      return errorMessage(error);
    }
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

  /** The name a pin shows: a dashboard pin shows its dashboard's name from the cache; other pins show their own. */
  public PinName(pin: HomeAppPinnedItem): string {
    return this.pinDashboardNames.get(pin.Id) ?? pin.DisplayName;
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
   * Opens the pin options menu under the pin's ellipsis button, right-aligned and inside the viewport, and moves
   * focus to its first row. A click elsewhere, Escape or Tab closes it.
   */
  ShowPinMenu(event: MouseEvent, pin: HomeAppPinnedItem): void {
    event.stopPropagation();
    event.preventDefault();
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) {
      return;
    }
    const anchor = MenuAnchorOf(trigger);
    this.pinMenuTrigger = trigger;
    this.PinMenuPin = pin;
    this.PinMenuVisible = true;
    this.placePinMenu(anchor, 0);
    // Render the menu with no max height to measure its full height, then place it again with that height
    this.PinMenuMaxHeight = null;
    this.cdr.detectChanges();
    this.placePinMenu(anchor, this.pinMenuEl?.nativeElement.offsetHeight ?? 0);
    this.cdr.detectChanges();
    this.pinMenuRows()[0]?.focus({ preventScroll: true });
    this.watchPinMenuDismiss();
  }

  /**
   * Keys in the pin options menu: ArrowDown, ArrowUp, Home and End move between the rows. Escape closes the menu
   * and puts focus back on its button. Tab closes it too, and the browser moves focus on from the button.
   */
  public OnPinMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePinMenuToTrigger();
    } else if (event.key === 'Tab') {
      this.closePinMenuToTrigger();
    } else {
      this.focusPinMenuRow(event);
    }
  }

  /** Moves focus to the menu row that ArrowDown, ArrowUp, Home or End picks. Other keys do nothing. */
  private focusPinMenuRow(event: KeyboardEvent): void {
    const rows = this.pinMenuRows();
    const next = NextMenuFocusIndex(event.key, rows.findIndex(row => row === document.activeElement), rows.length);
    if (next !== null) {
      event.preventDefault();
      rows[next].focus();
    }
  }

  /** The menu's rows, in order: its menuitem buttons. */
  private pinMenuRows(): HTMLElement[] {
    return Array.from(this.pinMenuEl?.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  /** Closes the pin options menu and puts focus back on the button that opened it. */
  private closePinMenuToTrigger(): void {
    const trigger = this.pinMenuTrigger;
    this.HidePinMenu();
    trigger?.focus();
  }

  /**
   * Places the pin options menu next to its button and limits its height to the room on that side. A height of 0
   * places it below the button.
   */
  private placePinMenu(anchor: MenuAnchor, height: number): void {
    const place = PlaceMenu(anchor, PIN_MENU_WIDTH, height, 'right', { Width: window.innerWidth, Height: window.innerHeight });
    this.PinMenuX = place.Left;
    this.PinMenuY = place.Top;
    this.PinMenuMaxHeight = place.MaxHeight;
  }

  /** Closes the pin options menu on the next click anywhere or on Escape. */
  private watchPinMenuDismiss(): void {
    setTimeout(() => {
      const close = () => {
        this.HidePinMenu();
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', onKeydown);
      };
      const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          close();
        }
      };
      document.addEventListener('click', close);
      document.addEventListener('keydown', onKeydown);
    }, 0);
  }

  /**
   * Hide the pin context menu
   */
  HidePinMenu(): void {
    this.PinMenuVisible = false;
    this.PinMenuPin = null;
    this.pinMenuTrigger = null;
    this.cdr.markForCheck();
  }

  /**
   * Edit in a pin's menu: closes the menu, puts the pins in edit mode (opening a collapsed Pinned section) and starts
   * renaming the pin, with focus in its rename box. For a dashboard pin the user cannot rename, it says why and moves
   * focus to Done instead.
   */
  OnPinMenuEdit(): void {
    const pin = this.PinMenuPin;
    this.HidePinMenu();
    if (!pin) return;
    this.EditMode = true;
    this.openPinnedSection();
    if (this.canRenamePin(pin)) {
      this.EditingPinId = pin.Id;
      this.focusPinNameInput();
    } else {
      this.EditingPinId = null;
      this.notifyCannotRename(pin);
      this.focusShownView();
    }
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

/** What a Home agent tool for a part of the overview says while a dashboard shows: the part shows on the overview only. */
function overviewOnlyError(part: string): string {
  return `${part} shows on the ${HOME_OVERVIEW_NAME} overview only. Use SwitchHomeDashboard with "${HOME_OVERVIEW_NAME}" first.`;
}
