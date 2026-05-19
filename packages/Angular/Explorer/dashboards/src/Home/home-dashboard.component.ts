import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseResourceComponent, NavigationService, RecentAccessService, RecentAccessItem, HomeAppPinService, HomeAppPinnedItem, HomeAppPinInput, ActionPinConfiguration } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey, EntityRecordNameInput, RunView } from '@memberjunction/core';
import { ResourceData, MJUserFavoriteEntity, MJUserNotificationEntity, UserInfoEngine, DashboardEngine, UserViewEngine, QueryEngine } from '@memberjunction/core-entities';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { UserAppConfigComponent } from '@memberjunction/ng-explorer-settings';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ActionPinConfigResult } from './action-pin-config-dialog.component';
import { ActionPinRunResult } from './action-pin-runner-dialog.component';

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

  @ViewChild('appConfigDialog') appConfigDialog!: UserAppConfigComponent;

  // State
  public isLoading = true;
  public apps: BaseApplication[] = [];
  public appsDisplayData: AppDisplayData[] = []; // Pre-computed display data
  public currentUser: { Name: string; Email: string } | null = null;
  public showConfigDialog = false;

  // Favorites
  public favorites: MJUserFavoriteEntity[] = [];
  public favoritesLoading = true;

  // Recents
  public recentItems: RecentAccessItem[] = [];
  public recentsLoading = true;

  // Notifications
  public unreadNotifications: MJUserNotificationEntity[] = [];
  public notificationsLoading = true;

  // Sidebar state - default closed on all screen sizes
  public sidebarOpen = false;

  // Pin empty-state dismissal preference (persisted in UserSettings via UserInfoEngine)
  public HidePinEmptyState = false;

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

  // Whether Data Explorer app is available (if so, dashboards/queries/views are accessible via its nav items)
  public HasDataExplorerApp = false;

  // Drag state
  public DraggingPinId: string | null = null;
  public DragOverPinId: string | null = null;

  // Cached icon lookups to avoid repeated method calls
  private favoriteIconCache = new Map<string, string>();
  private resourceIconCache = new Map<string, string>();

  // Resolved display names for favorites (keyed by favorite ID)
  public favoriteDisplayNames = new Map<string, string>();

  /**
   * Check if sidebar has any content to show
   */
  get hasSidebarContent(): boolean {
    return this.unreadNotifications.length > 0 ||
           this.favorites.length > 0 ||
           this.recentItems.length > 0 ||
           this.favoritesLoading ||
           this.recentsLoading;
  }

  /**
   * Toggle sidebar visibility
   */
  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
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
    this.currentUser = {
      Name: this.metadata.CurrentUser?.Name || 'User',
      Email: this.metadata.CurrentUser?.Email || ''
    };

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
        this.apps = apps.filter(app => app.Name !== 'Home');

        // Pre-compute display data for all apps
        await this.computeAppsDisplayData();

        this.isLoading = false;
        this.NotifyLoadComplete();

        this.cdr.markForCheck();
      });

    // Subscribe to unread notifications
    MJNotificationService.Notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.unreadNotifications = notifications.filter(n => n.Unread).slice(0, 5);
        this.notificationsLoading = false;
        this.cdr.markForCheck();
      });

    // Subscribe to recent items
    this.recentAccessService.RecentItems
      .pipe(takeUntil(this.destroy$))
      .subscribe(items => {
        this.recentItems = this.deduplicateRecents(items).slice(0, 5);
        this.recentsLoading = false;
        this.cdr.markForCheck();
      });

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
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get a greeting based on time of day
   */
  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /**
   * Get formatted date string
   */
  get formattedDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Navigate to an application
   */
  async onAppClick(app: BaseApplication): Promise<void> {
    // Use NavigationService to switch to the app (handles tab creation if needed)
    await this.navigationService.SwitchToApp(app.ID);
  }

  /**
   * Open app configuration dialog
   */
  openConfigDialog(): void {
    this.showConfigDialog = true;
    setTimeout(() => {
      if (this.appConfigDialog) {
        this.appConfigDialog.Open();
      }
    }, 0);
  }

  /**
   * Handle when config is saved
   */
  onConfigSaved(): void {
    this.showConfigDialog = false;
  }

  /**
   * Pre-compute display data for all apps to avoid repeated calculations during change detection
   */
  private async computeAppsDisplayData(): Promise<void> {
    this.appsDisplayData = await Promise.all(this.apps.map(async app => {
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
  trackByApp(_index: number, item: AppDisplayData): string {
    return item.app.ID;
  }

  /**
   * Track function for nav items preview
   */
  trackByNavItem(_index: number, item: { Label: string; Icon: string }): string {
    return item.Label;
  }

  /**
   * Load user favorites from UserInfoEngine (cached) and resolve record display names
   */
  private async loadFavorites(): Promise<void> {
    try {
      this.favoritesLoading = true;

      // Get first 10 favorites (already ordered by __mj_CreatedAt DESC in engine)
      this.favorites = UserInfoEngine.Instance.UserFavorites.slice(0, 10);

      // Batch-resolve record names for all favorites
      await this.resolveFavoriteNames();
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      this.favoritesLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Batch-resolve record display names for favorites using GetEntityRecordNames()
   */
  private async resolveFavoriteNames(): Promise<void> {
    const nameInputs: EntityRecordNameInput[] = [];
    const favoriteIdByKey = new Map<string, string>(); // map key -> favorite ID

    for (const fav of this.favorites) {
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
            this.favoriteDisplayNames.set(favId, result.RecordName);
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

    // If recordId contains '|', it's in concatenated format
    if (recordId.includes('|')) {
      try {
        const compositeKey = new CompositeKey();
        compositeKey.LoadFromConcatenatedString(recordId);
        if (compositeKey.KeyValuePairs.length > 0) return compositeKey;
      } catch {
        // Fall through to entity-based lookup
      }
    }

    // Plain value — look up entity primary key field(s) to construct the key
    const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
    if (!entityInfo) return null;

    const pkField = entityInfo.FirstPrimaryKey;
    if (!pkField) return null;

    const compositeKey = new CompositeKey();
    compositeKey.KeyValuePairs = [{ FieldName: pkField.Name, Value: recordId }];
    return compositeKey;
  }

  /**
   * Get the display name for a favorite (resolved name or entity name fallback)
   */
  getFavoriteDisplayName(favorite: MJUserFavoriteEntity): string {
    return this.favoriteDisplayNames.get(favorite.ID) || favorite.Entity || favorite.RecordID;
  }

  /**
   * Load recent items via the RecentAccessService
   */
  private async loadRecents(): Promise<void> {
    try {
      this.recentsLoading = true;
      this.cdr.markForCheck();
      await this.recentAccessService.loadRecentItems(10);
    } catch (error) {
      console.error('Error loading recents:', error);
    } finally {
      this.recentsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Navigate to a favorite item using NavigationService
   */
  onFavoriteClick(favorite: MJUserFavoriteEntity): void {
    // Navigate based on entity type using NavigationService
    const entityName = favorite.Entity?.toLowerCase();
    const recordId = favorite.RecordID;

    if (entityName === 'dashboards') {
      this.navigationService.OpenDashboard(recordId, 'Dashboard');
    } else if (entityName === 'user views') {
      this.navigationService.OpenView(recordId, 'View');
    } else if (entityName === 'reports') {
      this.navigationService.OpenReport(recordId, 'Report');
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

  /**
   * Navigate to a recent item using NavigationService
   */
  onRecentClick(item: RecentAccessItem): void {
    // Use recordName if available, otherwise fall back to generic titles
    const name = item.recordName;

    switch (item.resourceType) {
      case 'view':
        this.navigationService.OpenView(item.recordId, name || 'View');
        break;
      case 'dashboard':
        this.navigationService.OpenDashboard(item.recordId, name || 'Dashboard');
        break;
      case 'artifact':
        this.navigationService.OpenArtifact(item.recordId, name || 'Artifact');
        break;
      case 'report':
        this.navigationService.OpenReport(item.recordId, name || 'Report');
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

  /**
   * Navigate to a notification using NavigationService
   */
  onNotificationClick(notification: MJUserNotificationEntity): void {
    // Navigate to the notifications view using NavigationService
    this.navigationService.OpenDynamicView('MJ: User Notifications');
  }

  /**
   * Get icon for an entity by name, using entity metadata Icon field (cached)
   */
  getEntityIconByName(entityName: string): string {
    if (!entityName) return 'fa-solid fa-file';

    const cached = this.resourceIconCache.get(entityName);
    if (cached) return cached;

    const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
    const icon = entityInfo ? this.resolveEntityIcon(entityInfo.Icon) : 'fa-solid fa-file';

    this.resourceIconCache.set(entityName, icon);
    return icon;
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
  trackByFavorite(_index: number, item: MJUserFavoriteEntity): string {
    return item.ID;
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
  trackByRecent(_index: number, item: RecentAccessItem): string {
    return `${item.entityName}-${item.recordId}`;
  }

  /**
   * Track function for notifications
   */
  trackByNotification(_index: number, item: MJUserNotificationEntity): string {
    return item.ID;
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

    // For Dashboards, Views, Queries — route through Data Explorer if available
    const deApp = this.HasDataExplorerApp
      ? this.appManager.GetAllApps().find(a => a.Name === 'Data Explorer')
      : null;

    switch (rt) {
      case 'Dashboards': {
        const dashboardId = config['dashboardId'] as string;
        if (!dashboardId) break;
        if (deApp) {
          this.navigationService.SwitchToApp(deApp.ID, 'Dashboards').then(() => {
            this.navigationService.UpdateActiveTabQueryParams({ dashboard: dashboardId });
          });
        } else {
          this.navigationService.OpenDashboard(dashboardId, pin.DisplayName);
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
        if (deApp) {
          this.navigationService.SwitchToApp(deApp.ID, 'Queries').then(() => {
            this.navigationService.UpdateActiveTabQueryParams({ queryId: queryId });
          });
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
            this.navigationService.SwitchToApp(app.ID, navItemName).then(() => {
              // Apply query params after the tab is created/activated
              if (queryParams && Object.keys(queryParams).length > 0) {
                this.navigationService.UpdateActiveTabQueryParams(queryParams);
              }
            });
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
   * Toggle edit mode for pins
   */
  ToggleEditMode(): void {
    this.EditMode = !this.EditMode;
    if (!this.EditMode) {
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
      case 'User Views': return entity ? this.getEntityIconByName(entity) : 'fa-solid fa-table-list';
      case 'Queries': return 'fa-solid fa-database';
      case 'Reports': return 'fa-solid fa-chart-bar';
      case 'Records': return entity ? this.getEntityIconByName(entity) : 'fa-solid fa-file';
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
    const appData = this.appsDisplayData.find(d => d.app.Name === appName);
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
   * Edit a pin (enters edit mode focused on this pin)
   */
  OnPinMenuEdit(): void {
    if (this.PinMenuPin) {
      this.EditMode = true;
      this.EditingPinId = this.PinMenuPin.Id;
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

  trackByPin(_index: number, pin: HomeAppPinnedItem): string {
    return pin.Id;
  }

  trackByGroup(_index: number, group: string): string {
    return group;
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

    const cachedDashboards = DashboardEngine.Instance.Dashboards
      .filter(d => d.Type === 'Config')
      .sort((a, b) => a.Name.localeCompare(b.Name));

    const cachedViews = UserViewEngine.Instance.GetViewsForCurrentUser()
      .slice()
      .sort((a, b) => a.Name.localeCompare(b.Name));

    const cachedQueries = QueryEngine.Instance.Queries
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

    // Check if Data Explorer is available — if so, dashboards/queries/views
    // are accessible through its nav items, no need for standalone sections
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
   * Toggle a section's collapsed state in the Add Pin panel
   */
  TogglePanelSection(section: string): void {
    this.PanelSectionCollapsed[section] = !this.PanelSectionCollapsed[section];
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
