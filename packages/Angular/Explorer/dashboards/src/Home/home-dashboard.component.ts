import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseDashboard, NavigationService } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { UserAppConfigComponent } from '@memberjunction/ng-explorer-settings';

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
export class HomeDashboardComponent extends BaseDashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  @ViewChild('appConfigDialog') appConfigDialog!: UserAppConfigComponent;

  // State
  public isLoading = true;
  public apps: BaseApplication[] = [];
  public currentUser: { Name: string; Email: string } | null = null;
  public showConfigDialog = false;

  constructor(
    private appManager: ApplicationManager,
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  async ngOnInit(): Promise<void> {
    // Get current user info
    this.currentUser = {
      Name: this.metadata.CurrentUser?.Name || 'User',
      Email: this.metadata.CurrentUser?.Email || ''
    };

    // Subscribe to applications list, filtering out the Home app
    this.appManager.Applications
      .pipe(takeUntil(this.destroy$))
      .subscribe(apps => {
        // Exclude the Home app from the list (users are already on Home)
        this.apps = apps.filter(app => app.Name !== 'Home');
        this.isLoading = false;
        this.cdr.detectChanges();
      });
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
}

/**
 * Tree-shaking prevention
 */
export function LoadHomeDashboard() {
  // Force inclusion in production builds
}
