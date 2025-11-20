import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ApplicationManager,
  WorkspaceStateManager,
  GoldenLayoutManager,
  BaseApplication,
  TabService
} from '@memberjunction/ng-base-application';
import { Metadata } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';

/**
 * Main shell component for the new Explorer UX.
 *
 * Provides:
 * - App-centric header with app switcher and nav items
 * - Golden Layout-based tab container
 * - Unified workspace state management
 */
@Component({
  selector: 'mj-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.css']
})
export class ShellComponent implements OnInit, OnDestroy, AfterViewInit {
  private subscriptions: Subscription[] = [];

  activeApp: BaseApplication | null = null;
  loading = true;
  initialized = false;

  constructor(
    private appManager: ApplicationManager,
    private workspaceManager: WorkspaceStateManager,
    private layoutManager: GoldenLayoutManager,
    private tabService: TabService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      MJGlobal.Instance.GetEventListener(true).subscribe(event => {
        if (event.event === MJEventType.LoggedIn) {
          // Initialize shell on login
          this.initializeShell().catch(err => {
            console.error('Error during shell initialization:', err);
            this.loading = false;
          });
        }
      });
    } catch (error) {
      console.error('Failed to initialize shell:', error);
      this.loading = false;
    }
  }

  async initializeShell(): Promise<void> {
    // Initialize application manager (subscribes to LoggedIn event)
    this.appManager.Initialize();

    // Get current user and initialize workspace
    const md = new Metadata();
    const user = md.CurrentUser;
    if (user) {
      // CRITICAL: Wait for workspace initialization to complete
      // before allowing any tab operations
      await this.workspaceManager.Initialize(user.ID);
    } else {
      throw new Error('No current user found');
    }

    // Subscribe to active app changes
    this.subscriptions.push(
      this.appManager.ActiveApp.subscribe(app => {
        console.log('[Shell] Active app changed:', app?.Name);
        this.activeApp = app;

        // Create default tab when app is activated
        if (app) {
          const tabRequest = app.CreateDefaultTab();
          console.log('[Shell] Creating default tab:', tabRequest);
          if (tabRequest) {
            this.tabService.OpenTab(tabRequest);
          }
        }
      })
    );

    // Subscribe to applications loading - set first app as active when loaded
    this.subscriptions.push(
      this.appManager.Applications.subscribe(async apps => {
        if (apps.length > 0 && !this.appManager.GetActiveApp()) {
          await this.appManager.SetActiveApp(apps[0].ID);
        }
      })
    );

    // Subscribe to tab open requests from TabService
    this.subscriptions.push(
      this.tabService.TabRequests.subscribe(request => {
        const app = this.appManager.GetAppById(request.ApplicationId);
        const appColor = app?.GetColor() || '#757575';
        this.workspaceManager.OpenTab(request, appColor);
      })
    );

    this.initialized = true;
    this.loading = false;
  }

  ngAfterViewInit(): void {
    // Layout initialization happens in TabContainerComponent
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.layoutManager.Destroy();
  }

  /**
   * Handle app switch from app switcher
   */
  async onAppSwitch(appId: string): Promise<void> {
    await this.appManager.SetActiveApp(appId);

    // Check if app has any tabs, if not open default
    const appTabs = this.workspaceManager.GetAppTabs(appId);
    if (appTabs.length === 0) {
      const app = this.appManager.GetAppById(appId);
      if (app) {
        const defaultTab = app.CreateDefaultTab();
        if (defaultTab) {
          this.workspaceManager.OpenTab(defaultTab, app.GetColor());
        }
      }
    }
  }

  /**
   * Handle navigation item click
   */
  onNavItemClick(route: string): void {
    if (!this.activeApp) return;

    // Create tab request for nav item
    const tabRequest = {
      ApplicationId: this.activeApp.ID,
      Title: this.getNavItemLabel(route),
      Route: route
    };

    this.workspaceManager.OpenTab(tabRequest, this.activeApp.GetColor());
  }

  /**
   * Get label for a route from nav items
   */
  private getNavItemLabel(route: string): string {
    if (!this.activeApp) return 'Tab';
    const navItems = this.activeApp.GetNavItems();
    const item = navItems.find(n => n.Route === route);
    return item?.Label || 'Tab';
  }
}
