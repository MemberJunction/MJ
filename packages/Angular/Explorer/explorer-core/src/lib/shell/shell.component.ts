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

        // Create default tab when app is activated ONLY if:
        // 1. App has no tabs yet
        // 2. We're not loading from a URL that will create its own tab
        if (app) {
          const existingTabs = this.workspaceManager.GetAppTabs(app.ID);

          if (existingTabs.length === 0) {
            // Check if we're loading from a URL that will create a tab
            const currentUrl = this.router.url;
            const hasResourceUrl = currentUrl.includes('/app/') ||
                                   currentUrl.includes('/resource/');

            // Only create default tab if we're NOT loading from a resource URL
            if (!hasResourceUrl) {
              const tabRequest = await app.CreateDefaultTab();
              if (tabRequest) {
                this.tabService.OpenTab(tabRequest);
              }
            }
          }
        }
      })
    );

    // Subscribe to applications loading - set app based on URL or default to first
    this.subscriptions.push(
      this.appManager.Applications.subscribe(async apps => {
        if (apps.length > 0 && !this.appManager.GetActiveApp()) {
          // Check if URL specifies an app by parsing the browser URL
          const currentUrl = this.router.url;
          const appMatch = currentUrl.match(/\/app\/([^\/]+)/);

          if (appMatch) {
            const routeAppName = decodeURIComponent(appMatch[1]);
            // Find the app from the URL
            const urlApp = apps.find(a =>
              a.Name.trim().toLowerCase() === routeAppName.trim().toLowerCase()
            );

            if (urlApp) {
              await this.appManager.SetActiveApp(urlApp.ID);

              // If the URL is just /app/:appName (no nav item), we need to let the app
              // create its default tab since ResourceResolver doesn't handle this
              const hasNavItem = currentUrl.match(/\/app\/[^\/]+\/[^\/]+/);
              if (!hasNavItem) {
                // This is just /app/:appName - let it create the default tab
                const existingTabs = this.workspaceManager.GetAppTabs(urlApp.ID);
                if (existingTabs.length === 0) {
                  const tabRequest = await urlApp.CreateDefaultTab();
                  if (tabRequest) {
                    this.tabService.OpenTab(tabRequest);
                  }
                }
              }

              return;
            }
          }

          // ONLY set default app if URL doesn't specify an app at all
          // If URL has /app/:appName but we didn't find it above, don't set a default
          if (!appMatch) {
            await this.appManager.SetActiveApp(apps[0].ID);
          }
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
   * Handle deep links from URL
   * Resource URLs like /resource/record/Companies/123 are handled by ResourceResolver
   * Legacy ?tab= params are supported for backward compatibility
   */
  private handleDeepLink(): void {
    const queryParams = this.route.snapshot.queryParams;
    const tabParam = queryParams['tab'];

    // Legacy support for ?tab= parameters
    if (tabParam) {
      const tabIds = Array.isArray(tabParam) ? tabParam : [tabParam];
      if (tabIds.length > 0) {
        this.workspaceManager.SetActiveTab(tabIds[0]);
      }
    }

    // Note: Resource URLs like /resource/record/EntityName/123 are automatically
    // handled by the ResourceResolver which raises MJ events that the workspace
    // manager listens to. No additional handling needed here.
  }

  /**
   * Sync URL with active tab's resource
   */
  private syncUrlWithWorkspace(config: any): void {
    if (!config.activeTabId) {
      return;
    }

    // Find the active tab
    const activeTab = config.tabs?.find((tab: any) => tab.id === config.activeTabId);
    if (!activeTab) {
      return;
    }

    // Build resource URL from tab configuration
    const resourceUrl = this.buildResourceUrl(activeTab);
    if (resourceUrl) {
      // Only update URL if it's different from current URL to avoid navigation loops
      const currentUrl = this.router.url.split('?')[0]; // Remove query params for comparison
      const newUrl = resourceUrl.split('?')[0];

      if (currentUrl !== newUrl) {
        // Navigate to the resource URL without triggering full navigation
        this.router.navigateByUrl(resourceUrl, { replaceUrl: true });
      }
    }
  }

  /**
   * Build a shareable resource URL from tab data
   */
  private buildResourceUrl(tab: any): string | null {
    const config = tab.configuration || {};
    const resourceType = config.resourceType?.toLowerCase();
    const recordId = tab.resourceRecordId;

    // If this is an app nav item, build app-based URL
    if (config.appName && config.navItemName) {
      let url = `/app/${encodeURIComponent(config.appName)}/${encodeURIComponent(config.navItemName)}`;

      // Add query params if present
      if (config.queryParams && Object.keys(config.queryParams).length > 0) {
        const params = new URLSearchParams(config.queryParams);
        url += `?${params.toString()}`;
      }

      return url;
    }

    // If this is an app's default dashboard (no nav items), use app-level URL
    if (config.isAppDefault && config.appName) {
      return `/app/${encodeURIComponent(config.appName)}`;
    }

    // Fallback: If tab belongs to a non-system app but doesn't have appName/navItemName,
    // try to reconstruct the URL from the ApplicationId and tab title
    if (tab.applicationId && tab.applicationId !== '__explorer') {
      const app = this.appManager.GetAppById(tab.applicationId);
      if (app) {
        const navItems = app.GetNavItems();
        // Try to find the nav item by matching the tab title
        const navItem = navItems.find(item =>
          item.Label?.trim().toLowerCase() === tab.title?.trim().toLowerCase()
        );

        if (navItem) {
          let url = `/app/${encodeURIComponent(app.Name)}/${encodeURIComponent(navItem.Label)}`;

          // Add query params if present
          if (config.queryParams && Object.keys(config.queryParams).length > 0) {
            const params = new URLSearchParams(config.queryParams);
            url += `?${params.toString()}`;
          }

          return url;
        }
      }
    }

    switch (resourceType) {
      case 'records':
        // /resource/record/:entityName/:recordId
        const entityName = config.Entity || config.entity;
        if (entityName && recordId) {
          return `/resource/record/${encodeURIComponent(entityName)}/${recordId}`;
        }
        break;

      case 'user views':
        // Check if it's a dynamic view
        if (config.isDynamic || recordId === 'dynamic') {
          // /resource/view/dynamic/:entityName?ExtraFilter=...
          const entityName = config.Entity || config.entity;
          if (entityName) {
            let url = `/resource/view/dynamic/${encodeURIComponent(entityName)}`;
            if (config.ExtraFilter || config.extraFilter) {
              const filter = config.ExtraFilter || config.extraFilter;
              url += `?ExtraFilter=${encodeURIComponent(filter)}`;
            }
            return url;
          }
        } else if (recordId) {
          // /resource/view/:viewId (saved view)
          return `/resource/view/${recordId}`;
        }
        break;

      case 'dashboards':
        // /resource/dashboard/:dashboardId
        if (recordId) {
          return `/resource/dashboard/${recordId}`;
        }
        break;

      case 'artifacts':
        // /resource/artifact/:artifactId
        if (recordId) {
          return `/resource/artifact/${recordId}`;
        }
        break;

      case 'queries':
        // /resource/query/:queryId
        if (recordId) {
          return `/resource/query/${recordId}`;
        }
        break;
    }

    return null;
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

    // Check if app has any tabs
    const appTabs = this.workspaceManager.GetAppTabs(appId);
    if (appTabs.length === 0) {
      // No tabs - create default tab (will trigger URL sync via workspace config subscription)
      const app = this.appManager.GetAppById(appId);
      if (app) {
        const defaultTab = await app.CreateDefaultTab();
        if (defaultTab) {
          this.workspaceManager.OpenTab(defaultTab, app.GetColor());
        }
      }
    } else {
      // App has existing tabs - activate the first one and sync URL
      const firstTab = appTabs[0];
      this.workspaceManager.SetActiveTab(firstTab.id);

      // The workspace configuration subscription will trigger URL sync
      // but we can also manually trigger it here to ensure immediate update
      const resourceUrl = this.buildResourceUrl(firstTab);
      if (resourceUrl) {
        this.router.navigateByUrl(resourceUrl, { replaceUrl: true });
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
