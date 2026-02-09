import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseResourceComponent, NavigationService, RecentAccessService, RecentAccessItem } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { ResourceData, UserFavoriteEntity, UserNotificationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { UserAppConfigComponent } from '@memberjunction/ng-explorer-settings';
import { MJNotificationService } from '@memberjunction/ng-notifications';

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
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  @ViewChild('appConfigDialog') appConfigDialog!: UserAppConfigComponent;

  // State
  public isLoading = true;
  public apps: BaseApplication[] = [];
  public appsDisplayData: AppDisplayData[] = []; // Pre-computed display data
  public currentUser: { Name: string; Email: string } | null = null;
  public showConfigDialog = false;

  // Favorites
  public favorites: UserFavoriteEntity[] = [];
  public favoritesLoading = true;

  // Recents
  public recentItems: RecentAccessItem[] = [];
  public recentsLoading = true;

  // Notifications
  public unreadNotifications: UserNotificationEntity[] = [];
  public notificationsLoading = true;

  // Sidebar state - default closed on all screen sizes
  public sidebarOpen = false;

  // Cached icon lookups to avoid repeated method calls
  private favoriteIconCache = new Map<string, string>();
  private resourceIconCache = new Map<string, string>();

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
    private navigationService: NavigationService,
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
        this.recentItems = items.slice(0, 5);
        this.recentsLoading = false;
        this.cdr.markForCheck();
      });

    // Favorites and recents load asynchronously in the sidebar
    this.NotifyLoadComplete();

    // Load favorites and recents asynchronously (don't block rendering)
    this.loadFavorites();
    this.loadRecents();
  }

  ngOnDestroy(): void {
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
        this.appConfigDialog.open();
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
   * Load user favorites from UserInfoEngine (cached)
   */
  private async loadFavorites(): Promise<void> {
    try {
      this.favoritesLoading = true;

      // Get first 10 favorites (already ordered by __mj_CreatedAt DESC in engine)
      this.favorites = UserInfoEngine.Instance.UserFavorites.slice(0, 10);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      this.favoritesLoading = false;
      this.cdr.markForCheck();
    }
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
  onFavoriteClick(favorite: UserFavoriteEntity): void {
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
      const compositeKey = new CompositeKey();
      compositeKey.LoadFromSingleKeyValuePair('ID', recordId);
      this.navigationService.OpenEntityRecord(favorite.Entity, compositeKey);
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
      default:
        // Regular record
        const compositeKey = new CompositeKey();
        compositeKey.LoadFromSingleKeyValuePair('ID', item.recordId);
        this.navigationService.OpenEntityRecord(item.entityName, compositeKey);
    }
  }

  /**
   * Navigate to a notification using NavigationService
   */
  onNotificationClick(notification: UserNotificationEntity): void {
    // Navigate to the notifications view using NavigationService
    this.navigationService.OpenDynamicView('User Notifications');
  }

  /**
   * Get icon for a resource type (cached)
   */
  getResourceIcon(resourceType: string): string {
    if (this.resourceIconCache.has(resourceType)) {
      return this.resourceIconCache.get(resourceType)!;
    }

    let icon: string;
    switch (resourceType) {
      case 'view':
        icon = 'fa-solid fa-table';
        break;
      case 'dashboard':
        icon = 'fa-solid fa-gauge-high';
        break;
      case 'artifact':
        icon = 'fa-solid fa-cube';
        break;
      case 'report':
        icon = 'fa-solid fa-chart-bar';
        break;
      default:
        icon = 'fa-solid fa-file';
    }

    this.resourceIconCache.set(resourceType, icon);
    return icon;
  }

  /**
   * Get icon for a favorite based on its entity type (cached)
   */
  getFavoriteIcon(favorite: UserFavoriteEntity): string {
    const cacheKey = favorite.ID;
    if (this.favoriteIconCache.has(cacheKey)) {
      return this.favoriteIconCache.get(cacheKey)!;
    }

    let icon: string;
    const entityName = favorite.Entity?.toLowerCase();
    if (entityName === 'dashboards') {
      icon = 'fa-solid fa-gauge-high';
    } else if (entityName === 'user views') {
      icon = 'fa-solid fa-table';
    } else if (entityName === 'reports') {
      icon = 'fa-solid fa-chart-bar';
    } else if (entityName?.includes('artifact')) {
      icon = 'fa-solid fa-cube';
    } else {
      icon = 'fa-solid fa-star';
    }

    this.favoriteIconCache.set(cacheKey, icon);
    return icon;
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
  trackByFavorite(_index: number, item: UserFavoriteEntity): string {
    return item.ID;
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
  trackByNotification(_index: number, item: UserNotificationEntity): string {
    return item.ID;
  }
}
