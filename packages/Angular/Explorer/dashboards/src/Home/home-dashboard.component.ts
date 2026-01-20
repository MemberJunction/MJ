import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseDashboard, NavigationService, RecentAccessService, RecentAccessItem } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { ResourceData, UserFavoriteEntity, UserNotificationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { UserAppConfigComponent } from '@memberjunction/ng-explorer-settings';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Home Dashboard - Personalized home screen showing all available applications
 * with quick access navigation and configuration options.
 */
@Component({
  selector: 'mj-home-dashboard',
  templateUrl: './home-dashboard.component.html',
  styleUrls: ['./home-dashboard.component.css']
})
@RegisterClass(BaseDashboard, 'HomeDashboard')
export class HomeDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  @ViewChild('appConfigDialog') appConfigDialog!: UserAppConfigComponent;

  // State
  public isLoading = true;
  public apps: BaseApplication[] = [];
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
    return "Home"
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
          this.cdr.detectChanges();
        }
      });

    // Subscribe to applications list, filtering out the Home app
    this.appManager.Applications
      .pipe(takeUntil(this.destroy$))
      .subscribe(apps => {
        // Exclude the Home app from the list (users are already on Home)
        this.apps = apps.filter(app => app.Name !== 'Home');

        this.isLoading = false;
        this.NotifyLoadComplete();

        this.cdr.detectChanges();
      });

    // Subscribe to unread notifications
    MJNotificationService.Notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.unreadNotifications = notifications.filter(n => n.Unread).slice(0, 5);
        this.notificationsLoading = false;
        this.cdr.detectChanges();
      });

    // Subscribe to recent items
    this.recentAccessService.RecentItems
      .pipe(takeUntil(this.destroy$))
      .subscribe(items => {
        this.recentItems = items.slice(0, 5);
        this.recentsLoading = false;
        this.cdr.detectChanges();
      });

    // Favorites and recents load asynchronously in the sidebar
    this.NotifyLoadComplete();

    // Load favorites and recents asynchronously (don't block rendering)
    this.loadFavorites();
    this.loadRecents();
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }

  protected initDashboard(): void {
    // Called by BaseDashboard
  }

  protected loadData(): void {
    // Data loading handled by subscription
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
   * Get nav items count for an app
   */
  getNavItemsCount(app: BaseApplication): number {
    return app.GetNavItems().length;
  }

  /**
   * Get first few nav items for preview
   */
  getNavItemsPreview(app: BaseApplication): { Label: string; Icon: string }[] {
    return app.GetNavItems().slice(0, 3).map(item => ({
      Label: item.Label,
      Icon: item.Icon || 'fa-solid fa-circle'
    }));
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
      this.cdr.detectChanges();
    }
  }

  /**
   * Load recent items via the RecentAccessService
   */
  private async loadRecents(): Promise<void> {
    try {
      this.recentsLoading = true;
      this.cdr.detectChanges();
      await this.recentAccessService.loadRecentItems(10);
    } catch (error) {
      console.error('Error loading recents:', error);
    } finally {
      this.recentsLoading = false;
      this.cdr.detectChanges();
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
   * Get icon for a resource type
   */
  getResourceIcon(resourceType: string): string {
    switch (resourceType) {
      case 'view':
        return 'fa-solid fa-table';
      case 'dashboard':
        return 'fa-solid fa-gauge-high';
      case 'artifact':
        return 'fa-solid fa-cube';
      case 'report':
        return 'fa-solid fa-chart-bar';
      default:
        return 'fa-solid fa-file';
    }
  }

  /**
   * Get icon for a favorite based on its entity type
   */
  getFavoriteIcon(favorite: UserFavoriteEntity): string {
    const entityName = favorite.Entity?.toLowerCase();
    if (entityName === 'dashboards') return 'fa-solid fa-gauge-high';
    if (entityName === 'user views') return 'fa-solid fa-table';
    if (entityName === 'reports') return 'fa-solid fa-chart-bar';
    if (entityName?.includes('artifact')) return 'fa-solid fa-cube';
    return 'fa-solid fa-star';
  }

  /**
   * Format a date for display
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
}

/**
 * Tree-shaking prevention
 */
export function LoadHomeDashboard() {
  // Force inclusion in production builds
}
