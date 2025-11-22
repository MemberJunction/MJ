import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { NavigationService } from '@memberjunction/ng-shared';
import { NavItemClickEvent } from './components/header/app-nav.component';

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
  tabBarVisible = true; // Controlled by workspace manager

  constructor(
    private appManager: ApplicationManager,
    private workspaceManager: WorkspaceStateManager,
    private layoutManager: GoldenLayoutManager,
    private tabService: TabService,
    private navigationService: NavigationService,
    private route: ActivatedRoute,
    private router: Router
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

    // Subscribe to tab bar visibility changes
    this.subscriptions.push(
      this.workspaceManager.TabBarVisible.subscribe(visible => {
        this.tabBarVisible = visible;
      })
    );

    // Subscribe to active app changes
    this.subscriptions.push(
      this.appManager.ActiveApp.subscribe(async app => {
        this.activeApp = app;

        // Create default tab when app is activated ONLY if app has no tabs yet
        if (app) {
          const existingTabs = this.workspaceManager.GetAppTabs(app.ID);

          if (existingTabs.length === 0) {
            const tabRequest = await app.CreateDefaultTab();
            if (tabRequest) {
              this.tabService.OpenTab(tabRequest);
            }
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

    // Subscribe to workspace configuration changes to sync URL
    this.subscriptions.push(
      this.workspaceManager.Configuration.subscribe(config => {
        if (config && this.initialized) {
          this.syncUrlWithWorkspace(config);
        }
      })
    );

    // Check for deep link parameters on initialization
    this.handleDeepLink();

    this.initialized = true;
    this.loading = false;
  }

  /**
   * Handle deep link parameters from URL (?tab=id1&tab=id2...)
   */
  private handleDeepLink(): void {
    const queryParams = this.route.snapshot.queryParams;
    const tabParam = queryParams['tab'];

    if (!tabParam) {
      return;
    }

    // Support multiple ?tab= parameters
    const tabIds = Array.isArray(tabParam) ? tabParam : [tabParam];

    if (tabIds.length > 0) {
      // If URL specifies 2+ tabs, ensure tab bar is visible
      // This will be handled automatically by shouldShowTabs logic

      // Activate the first tab in the URL
      this.workspaceManager.SetActiveTab(tabIds[0]);
    }
  }

  /**
   * Sync URL query parameters with workspace state
   */
  private syncUrlWithWorkspace(config: any): void {
    if (!config.activeTabId) {
      return;
    }

    // Update URL with active tab ID (without triggering navigation)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: config.activeTabId },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
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
        const defaultTab = await app.CreateDefaultTab();
        if (defaultTab) {
          this.workspaceManager.OpenTab(defaultTab, app.GetColor());
        }
      }
    }
  }

  /**
   * Handle navigation item click with shift-key detection
   */
  onNavItemClick(event: NavItemClickEvent): void {
    if (!this.activeApp) {
      console.error('[Shell] No active app, ignoring nav click');
      return;
    }

    const { item, shiftKey } = event;

    // Use NavigationService with forceNewTab option if shift was pressed
    this.navigationService.OpenNavItem(
      this.activeApp.ID,
      item,
      this.activeApp.GetColor(),
      { forceNewTab: shiftKey }
    );
  }
}
