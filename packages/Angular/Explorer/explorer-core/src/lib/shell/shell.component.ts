import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
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
  private urlBasedNavigation = false; // Track if we're loading from a URL

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
    console.log('[Shell.initializeShell] Starting initialization');

    // Initialize application manager (subscribes to LoggedIn event)
    this.appManager.Initialize();
    console.log('[Shell.initializeShell] ApplicationManager initialized');

    // Get current user
    const md = new Metadata();
    const user = md.CurrentUser;
    if (!user) {
      throw new Error('No current user found');
    }
    console.log('[Shell.initializeShell] Current user:', user.Name, user.ID);

    // Check the current URL to determine if we're loading from a URL-based navigation
    const currentUrl = this.router.url;
    this.urlBasedNavigation = currentUrl.includes('/app/') || currentUrl.includes('/resource/');

    console.log('[Shell.initializeShell] Current URL:', currentUrl);
    console.log('[Shell.initializeShell] URL-based navigation:', this.urlBasedNavigation);

    // CRITICAL: Wait for workspace initialization to complete
    // before allowing any tab operations
    console.log('[Shell.initializeShell] Starting workspace initialization...');
    await this.workspaceManager.Initialize(user.ID);
    console.log('[Shell.initializeShell] Workspace initialization complete');

    // Subscribe to tab bar visibility changes
    this.subscriptions.push(
      this.workspaceManager.TabBarVisible.subscribe(visible => {
        this.tabBarVisible = visible;
      })
    );

    // Subscribe to active app changes
    this.subscriptions.push(
      this.appManager.ActiveApp.subscribe(async app => {
        console.log('[Shell.ActiveApp.subscribe] App changed to:', app?.Name || 'null');
        this.activeApp = app;

        // Create default tab when app is activated ONLY if:
        // 1. App has no tabs yet
        // 2. We're not loading from a URL that will create its own tab
        if (app) {
          const existingTabs = this.workspaceManager.GetAppTabs(app.ID);
          console.log('[Shell.ActiveApp.subscribe] Existing tabs for app:', existingTabs.length);

          if (existingTabs.length === 0) {
            // Check if we're loading from a URL that will create a tab
            const currentUrl = this.router.url;
            const hasResourceUrl = currentUrl.includes('/app/') ||
                                   currentUrl.includes('/resource/');

            console.log('[Shell.ActiveApp.subscribe] No tabs, URL has resource:', hasResourceUrl);

            // Only create default tab if we're NOT loading from a resource URL
            if (!hasResourceUrl) {
              console.log('[Shell.ActiveApp.subscribe] Creating default tab for app:', app.Name);
              const tabRequest = await app.CreateDefaultTab();
              if (tabRequest) {
                this.tabService.OpenTab(tabRequest);
              }
            } else {
              console.log('[Shell.ActiveApp.subscribe] Skipping default tab - URL will create tab');
            }
          }
        }
      })
    );

    // Subscribe to applications loading - set app based on URL or default to first
    this.subscriptions.push(
      this.appManager.Applications.subscribe(async apps => {
        console.log('[Shell.Applications.subscribe] Apps loaded:', apps.length);
        if (apps.length > 0) {
          // Check if URL specifies an app by parsing the browser URL
          const currentUrl = this.router.url;
          const appMatch = currentUrl.match(/\/app\/([^\/]+)/);

          console.log('[Shell.Applications.subscribe] URL:', currentUrl);
          console.log('[Shell.Applications.subscribe] App match from URL:', appMatch ? appMatch[1] : 'none');

          if (appMatch) {
            const routeAppName = decodeURIComponent(appMatch[1]);
            // Find the app from the URL
            const urlApp = apps.find(a =>
              a.Name.trim().toLowerCase() === routeAppName.trim().toLowerCase()
            );

            console.log('[Shell.Applications.subscribe] Found app from URL:', urlApp?.Name || 'not found');

            if (urlApp) {
              // ALWAYS set the app from URL, even if another app is already active
              // This ensures URL-based navigation takes precedence over workspace restoration
              console.log('[Shell.Applications.subscribe] Setting active app to:', urlApp.Name);
              await this.appManager.SetActiveApp(urlApp.ID);

              // If the URL is just /app/:appName (no nav item), we need to let the app
              // create its default tab since ResourceResolver doesn't handle this
              const hasNavItem = currentUrl.match(/\/app\/[^\/]+\/[^\/]+/);
              console.log('[Shell.Applications.subscribe] Has nav item in URL:', !!hasNavItem);

              if (!hasNavItem) {
                // This is just /app/:appName - let it create the default tab
                const existingTabs = this.workspaceManager.GetAppTabs(urlApp.ID);
                console.log('[Shell.Applications.subscribe] App-only URL, existing tabs:', existingTabs.length);

                if (existingTabs.length === 0) {
                  console.log('[Shell.Applications.subscribe] Creating default tab for app-only URL');
                  const tabRequest = await urlApp.CreateDefaultTab();
                  if (tabRequest) {
                    this.tabService.OpenTab(tabRequest);
                  }
                }
              }

              return;
            }
          }

          // ONLY set default app if URL doesn't specify an app AND no app is active yet
          // If URL has /app/:appName but we didn't find it above, don't set a default
          const currentActiveApp = this.appManager.GetActiveApp();
          console.log('[Shell.Applications.subscribe] No URL app match, current active:', currentActiveApp?.Name || 'none');

          if (!appMatch && !currentActiveApp) {
            console.log('[Shell.Applications.subscribe] Setting default app:', apps[0].Name);
            await this.appManager.SetActiveApp(apps[0].ID);
          }
        }
      })
    );

    // Subscribe to tab open requests from TabService
    this.subscriptions.push(
      this.tabService.TabRequests.subscribe(async request => {
        console.log('[Shell.TabRequests.subscribe] Tab request received:', {
          appId: request.ApplicationId,
          title: request.Title,
          config: request.Configuration
        });

        const app = this.appManager.GetAppById(request.ApplicationId);
        const appColor = app?.GetColor() || '#757575';

        console.log('[Shell.TabRequests.subscribe] App for tab:', app?.Name || 'not found');

        // Determine if this is a URL-based tab request
        const isUrlBasedTab = request.Configuration?.appName ||
                             request.Configuration?.resourceType;

        console.log('[Shell.TabRequests.subscribe] Is URL-based tab:', isUrlBasedTab);
        console.log('[Shell.TabRequests.subscribe] urlBasedNavigation flag:', this.urlBasedNavigation);
        console.log('[Shell.TabRequests.subscribe] initialized flag:', this.initialized);

        const currentActiveApp = this.appManager.GetActiveApp();
        console.log('[Shell.TabRequests.subscribe] Current active app:', currentActiveApp?.Name || 'none');

        // CRITICAL: Only set the app as active if:
        // 1. We're initialized (past the startup phase)
        // 2. App is different from current
        // 3. Either NOT in URL-based navigation mode, OR this IS a URL-based tab
        const shouldSetActiveApp = this.initialized &&
                                  app &&
                                  currentActiveApp?.ID !== request.ApplicationId &&
                                  (!this.urlBasedNavigation || isUrlBasedTab);

        console.log('[Shell.TabRequests.subscribe] Should set active app:', shouldSetActiveApp);

        if (shouldSetActiveApp) {
          console.log('[Shell.TabRequests.subscribe] Setting active app to:', app.Name);
          await this.appManager.SetActiveApp(request.ApplicationId);
        } else {
          console.log('[Shell.TabRequests.subscribe] Skipping SetActiveApp - reason:',
            !this.initialized ? 'not initialized' :
            !app ? 'no app' :
            currentActiveApp?.ID === request.ApplicationId ? 'already active' :
            'in URL navigation mode and not URL-based tab'
          );
        }

        // Clear the URL navigation flag after first URL-based tab is processed
        if (this.urlBasedNavigation && isUrlBasedTab) {
          console.log('[Shell.TabRequests.subscribe] URL-based tab processed, clearing flag');
          this.urlBasedNavigation = false;
        }

        console.log('[Shell.TabRequests.subscribe] Opening tab in workspace manager');
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

    console.log('[Shell.initializeShell] Setting initialized=true');
    this.initialized = true;
    this.loading = false;
    console.log('[Shell.initializeShell] Initialization complete');
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
