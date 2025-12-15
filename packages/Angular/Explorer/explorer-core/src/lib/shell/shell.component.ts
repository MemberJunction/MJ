import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  ApplicationManager,
  WorkspaceStateManager,
  GoldenLayoutManager,
  BaseApplication,
  TabService,
  WorkspaceConfiguration,
  WorkspaceTab
} from '@memberjunction/ng-base-application';
import { Metadata } from '@memberjunction/core';
import { MJEventType, MJGlobal, uuidv4 } from '@memberjunction/global';
import { EventCodes, NavigationService, SYSTEM_APP_ID, TitleService } from '@memberjunction/ng-shared';
import { NavItemClickEvent } from './components/header/app-nav.component';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UserAvatarService } from '@memberjunction/ng-user-avatar';
import { SettingsDialogService } from './services/settings-dialog.service';

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
  private initialNavigationComplete = false; // Track if initial navigation has completed
  private firstUrlSync = true; // Track if this is the first URL sync (for replaceUrl behavior)

  activeApp: BaseApplication | null = null;
  loading = true;
  initialized = false;
  tabBarVisible = true; // Controlled by workspace manager
  userMenuVisible = false; // User avatar context menu
  mobileNavOpen = false; // Mobile navigation drawer
  unreadNotificationCount = 0; // Notification badge count
  isViewingSystemTab = false; // True when viewing a resource tab (not associated with a registered app)
  loadingAppId: string | null = null; // ID of app currently being loaded (for app switcher loading indicator)

  // User avatar state
  userImageURL = '';
  userIconClass: string | null = null;
  userName = '';

  /**
   * Get Nav Bar apps positioned to the left of the app switcher
   * Filters out apps that have HideNavBarIconWhenActive=true and are currently active
   */
  get leftOfSwitcherApps(): BaseApplication[] {
    return this.appManager.GetNavBarApps('Left of App Switcher')
      .filter(app => !(app.HideNavBarIconWhenActive && app.ID === this.activeApp?.ID));
  }

  /**
   * Get Nav Bar apps positioned to the left of the user menu
   * Filters out apps that have HideNavBarIconWhenActive=true and are currently active
   */
  get leftOfUserMenuApps(): BaseApplication[] {
    return this.appManager.GetNavBarApps('Left of User Menu')
      .filter(app => !(app.HideNavBarIconWhenActive && app.ID === this.activeApp?.ID));
  }

  constructor(
    private appManager: ApplicationManager,
    private workspaceManager: WorkspaceStateManager,
    private layoutManager: GoldenLayoutManager,
    private tabService: TabService,
    private navigationService: NavigationService,
    private route: ActivatedRoute,
    private router: Router,
    private authBase: MJAuthBase,
    private cdr: ChangeDetectorRef,
    private userAvatarService: UserAvatarService,
    private settingsDialogService: SettingsDialogService,
    private viewContainerRef: ViewContainerRef,
    private titleService: TitleService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      MJGlobal.Instance.GetEventListener(true).subscribe(async (loginEvent) => {
        if (loginEvent.event === MJEventType.LoggedIn) {
          if (this.authBase.initialPath === "/") {
            // Base route - no need to wait for NavigationEnd
            await this.initializeShell();
          }
          else {
            // Deep link route - wait for NavigationEnd to ensure router URL is correct
            this.router.events.pipe(
              filter((event): event is NavigationEnd => event instanceof NavigationEnd),
              filter(() => !this.initialNavigationComplete)
            ).subscribe(async () => {
              this.initialNavigationComplete = true;
              await this.initializeShell();
            });
          }
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

    // Get current user
    const md = new Metadata();
    const user = md.CurrentUser;
    if (!user) {
      throw new Error('No current user found');
    }

    // Check the current URL to determine if we're loading from a URL-based navigation
    const currentUrl = this.router.url;
    this.urlBasedNavigation = currentUrl.includes('/app/') || currentUrl.includes('/resource/');

    // Wait for workspace initialization to complete before allowing any tab operations
    await this.workspaceManager.Initialize(user.ID);

    // Subscribe to tab bar visibility changes
    this.subscriptions.push(
      this.workspaceManager.TabBarVisible.subscribe(visible => {
        this.tabBarVisible = visible;
      })
    );

    // Subscribe to unread notification count changes
    this.subscriptions.push(
      MJNotificationService.UnreadCount$.subscribe(count => {
        this.unreadNotificationCount = count;
        this.cdr.detectChanges();
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
        if (apps.length > 0) {
          // Check if URL specifies an app by parsing the browser URL
          const currentUrl = this.router.url;
          const appMatch = currentUrl.match(/\/app\/([^\/]+)/);

          if (appMatch) {
            const routeAppPath = decodeURIComponent(appMatch[1]);
            // Find the app from the URL by Path (or Name for backwards compatibility)
            const urlApp = this.appManager.GetAppByPath(routeAppPath);

            if (urlApp) {
              // Set the app from URL - takes precedence over workspace restoration
              await this.appManager.SetActiveApp(urlApp.ID);

              // If the URL is just /app/:appName (no nav item), create default tab
              const hasNavItem = currentUrl.match(/\/app\/[^\/]+\/[^\/]+/);

              if (!hasNavItem) {
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

          // Set default app if URL doesn't specify one AND no app is active yet
          const currentActiveApp = this.appManager.GetActiveApp();
          if (!appMatch && !currentActiveApp) {
            await this.appManager.SetActiveApp(apps[0].ID);
          }
        }
      })
    );

    // Subscribe to tab open requests from TabService
    this.subscriptions.push(
      this.tabService.TabRequests.subscribe(async request => {
        await this.processTabRequest(request);
      })
    );

    // Replay any tab requests that were queued before we subscribed
    // This handles the case where ResourceResolver creates requests before shell is ready
    const queuedRequests = this.tabService.GetQueuedRequests();
    if (queuedRequests.length > 0) {
      for (const request of queuedRequests) {
        await this.processTabRequest(request);
      }
      this.tabService.ClearQueue();
    }

    // Clear urlBasedNavigation flag after initial setup completes
    // This must happen regardless of whether there were queued requests,
    // because apps with zero nav items create tabs directly (not via ResourceResolver)
    // and we still need URL sync to work for subsequent navigation
    if (this.urlBasedNavigation) {
      this.urlBasedNavigation = false;
    }

    // Subscribe to workspace configuration changes to sync URL and active app
    this.subscriptions.push(
      this.workspaceManager.Configuration.subscribe(async config => {
        if (config && this.initialized) {
          // Sync active app with active tab's application
          await this.syncActiveAppWithTab(config);
          this.syncUrlWithWorkspace(config);
          // Update browser tab title
          this.updateBrowserTitle(config);
        }
      })
    );

    // Subscribe to router navigation events (for browser back/forward)
    this.subscriptions.push(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      ).subscribe(event => {
        if (this.initialized) {
          this.syncWorkspaceWithUrl(event.urlAfterRedirects || event.url);
        }
      })
    );

    // Check for deep link parameters on initialization
    this.handleDeepLink();

    // Load user avatar
    await this.loadUserAvatar(user);

    // Listen for avatar updates from settings page
    this.subscriptions.push(
      MJGlobal.Instance.GetEventListener(false).subscribe(async (updateEvent) => {
        if (updateEvent.eventCode === EventCodes.AvatarUpdated) {
          const md = new Metadata();
          const currentUserInfo = md.CurrentUser;
          const userEntity = await md.GetEntityObject<any>('Users');
          await userEntity.Load(currentUserInfo.ID);
          this.applyUserAvatar(userEntity);
        }
      })
    );

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
   * Process a tab request (from subscription or replay)
   */
  private async processTabRequest(request: any): Promise<void> {
    const app = this.appManager.GetAppById(request.ApplicationId);
    const appColor = app?.GetColor() || '#757575';

    // Determine if this is a URL-based tab request
    // URL-based tabs have appName/resourceType BUT NOT isAppDefault
    // (isAppDefault indicates workspace restoration, not URL navigation)
    const isUrlBasedTab = (request.Configuration?.appName || request.Configuration?.resourceType) &&
                         !request.Configuration?.isAppDefault;

    const currentActiveApp = this.appManager.GetActiveApp();

    // Only set the app as active if:
    // 1. We're initialized (past the startup phase)
    // 2. App is different from current
    // 3. Either NOT in URL-based navigation mode, OR this IS a URL-based tab
    const shouldSetActiveApp = this.initialized &&
                              app &&
                              currentActiveApp?.ID !== request.ApplicationId &&
                              (!this.urlBasedNavigation || isUrlBasedTab);

    if (shouldSetActiveApp) {
      await this.appManager.SetActiveApp(request.ApplicationId);
    }

    this.workspaceManager.OpenTab(request, appColor);
  }

  /**
   * Sync active app with the active tab's application
   * Called when workspace configuration changes (e.g., user clicks on a tab in Golden Layout)
   */
  private async syncActiveAppWithTab(config: WorkspaceConfiguration): Promise<void> {
    if (!config.activeTabId) {
      this.titleService.reset();
      return;
    }

    // Find the active tab
    const activeTab = config.tabs?.find(tab => tab.id === config.activeTabId);
    if (!activeTab) {
      this.titleService.reset();
      return;
    }

    // Get the tab's application ID
    const tabAppId = activeTab.applicationId;
    if (!tabAppId) {
      this.titleService.setResourceName(activeTab.title || null);
      return;
    }

    // Check if this is a system tab (not associated with a registered app)
    if (tabAppId === SYSTEM_APP_ID) {
      this.isViewingSystemTab = true;
      // Don't try to set active app - SYSTEM_APP_ID has no registered app
      // Update browser title with just the tab title (no app context)
      this.titleService.setContext(null, activeTab.title || 'Explorer');
      return;
    }

    // Not a system tab - clear the flag
    this.isViewingSystemTab = false;

    // Check if active app needs to be updated
    const currentActiveApp = this.appManager.GetActiveApp();
    if (currentActiveApp?.ID !== tabAppId) {
      // Update the active app to match the tab's application
      await this.appManager.SetActiveApp(tabAppId);
    }

    // Update browser title with app and tab context
    const app = this.appManager.GetAppById(tabAppId);
    const appName = app?.Name || null;
    const tabTitle = activeTab.title || null;
    this.titleService.setContext(appName, tabTitle);
  }

  /**
   * Sync URL with active tab's resource
   */
  private syncUrlWithWorkspace(config: WorkspaceConfiguration): void {
    // Don't sync URL during URL-based navigation initialization
    if (this.urlBasedNavigation) {
      return;
    }

    if (!config.activeTabId) {
      return;
    }

    // Find the active tab
    const activeTab = config.tabs?.find(tab => tab.id === config.activeTabId);
    if (!activeTab) {
      return;
    }

    // Build resource URL from tab configuration
    const resourceUrl = this.buildResourceUrl(activeTab);
    if (resourceUrl) {
      // Only update URL if it's different from current URL to avoid navigation loops
      const currentUrl = this.router.url.split('?')[0];
      const newUrl = resourceUrl.split('?')[0];

      if (currentUrl !== newUrl) {
        // Replace URL on first sync (initialization), push new history entries after that
        const replaceUrl = this.firstUrlSync;
        this.firstUrlSync = false;
        this.router.navigateByUrl(resourceUrl, { replaceUrl });
      }
    }
  }

  /**
   * Sync workspace state with the current URL (for browser back/forward navigation).
   * Finds and activates the tab that matches the URL.
   */
  private async syncWorkspaceWithUrl(url: string): Promise<void> {
    const config = this.workspaceManager.GetConfiguration();
    if (!config?.tabs?.length) {
      return;
    }

    // Find the tab that matches this URL
    const matchingTab = this.findTabForUrl(url, config.tabs);

    if (matchingTab && matchingTab.id !== config.activeTabId) {
      // Activate the matching tab
      this.workspaceManager.SetActiveTab(matchingTab.id);
    } else if (!matchingTab) {
      // No matching tab found - check if this is an app-only URL for an app with zero nav items
      // If so, we need to create a new tab for it (the old one was replaced when navigating away)
      await this.handleMissingTabForUrl(url);
    }
  }

  /**
   * Handle the case where no tab matches the URL during back/forward navigation.
   * For apps with zero nav items, creates a new default tab.
   */
  private async handleMissingTabForUrl(url: string): Promise<void> {
    const urlPath = url.split('?')[0];

    // Check for app-only URL: /app/:appName
    const appOnlyMatch = urlPath.match(/^\/app\/([^\/]+)$/);
    if (appOnlyMatch) {
      const appPath = decodeURIComponent(appOnlyMatch[1]);
      const app = this.appManager.GetAppByPath(appPath) || this.appManager.GetAppByName(appPath);

      if (app) {
        const navItems = app.GetNavItems();
        // Only auto-create tabs for apps with zero nav items
        // Apps with nav items should have had their tabs preserved
        if (navItems.length === 0) {
          // Set the app as active and create its default tab
          // Use urlBasedNavigation flag to prevent syncUrlWithWorkspace from navigating again
          this.urlBasedNavigation = true;
          try {
            await this.appManager.SetActiveApp(app.ID);
            const defaultTab = await app.CreateDefaultTab();
            if (defaultTab) {
              this.workspaceManager.OpenTab(defaultTab, app.GetColor());
            }
          } finally {
            this.urlBasedNavigation = false;
          }
        }
      }
    }
  }

  /**
   * Find the tab that matches a given URL
   */
  private findTabForUrl(url: string, tabs: WorkspaceTab[]): WorkspaceTab | null {
    // Parse the URL to extract resource info
    const urlPath = url.split('?')[0];

    // Check for app nav item URL: /app/:appName/:navItemName
    const appNavMatch = urlPath.match(/^\/app\/([^\/]+)\/([^\/]+)$/);
    if (appNavMatch) {
      const appPath = decodeURIComponent(appNavMatch[1]);
      const navItemName = decodeURIComponent(appNavMatch[2]);

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const tabAppName = tabConfig['appName'] as string | undefined;
        const tabNavItemName = tabConfig['navItemName'] as string | undefined;

        if (!tabAppName || !tabNavItemName) return false;

        // Match by app path/name and nav item name (case-insensitive)
        const app = this.appManager.GetAppByPath(appPath) || this.appManager.GetAppByName(appPath);
        if (!app) return false;

        const appMatches = tabAppName.toLowerCase() === app.Name.toLowerCase() ||
                          tab.applicationId === app.ID;
        const navMatches = tabNavItemName.toLowerCase() === navItemName.toLowerCase();

        return appMatches && navMatches;
      }) || null;
    }

    // Check for app-only URL: /app/:appName
    const appOnlyMatch = urlPath.match(/^\/app\/([^\/]+)$/);
    if (appOnlyMatch) {
      const appPath = decodeURIComponent(appOnlyMatch[1]);
      const app = this.appManager.GetAppByPath(appPath) || this.appManager.GetAppByName(appPath);

      if (app) {
        // First, try to find a tab with isAppDefault for this app
        const defaultTab = tabs.find(tab => {
          const tabConfig = tab.configuration || {};
          return tab.applicationId === app.ID && tabConfig['isAppDefault'] === true;
        });
        if (defaultTab) {
          return defaultTab;
        }

        // Fallback for apps with zero nav items: match ANY tab belonging to this app
        // This handles the case where the default tab was replaced when navigating away
        const navItems = app.GetNavItems();
        if (navItems.length === 0) {
          return tabs.find(tab => tab.applicationId === app.ID) || null;
        }

        return null;
      }
    }

    // Check for resource record URL: /resource/record/:entityName/:recordId
    const recordMatch = urlPath.match(/^\/resource\/record\/([^\/]+)\/(.+)$/);
    if (recordMatch) {
      const entityName = decodeURIComponent(recordMatch[1]);
      const recordId = recordMatch[2];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const tabEntity = (tabConfig['Entity'] || tabConfig['entity']) as string | undefined;
        const tabRecordId = (tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return tabEntity?.toLowerCase() === entityName.toLowerCase() &&
               tabRecordId === recordId;
      }) || null;
    }

    // Check for view URL: /resource/view/:viewId
    const viewMatch = urlPath.match(/^\/resource\/view\/([^\/]+)$/);
    if (viewMatch) {
      const viewId = viewMatch[1];

      // Check if it's a dynamic view
      if (viewId === 'dynamic') {
        // Dynamic views include entity name in a different path
        return null; // Let the resolver handle dynamic views
      }

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabViewId = (tabConfig['viewId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'user views' && tabViewId === viewId;
      }) || null;
    }

    // Check for dashboard URL: /resource/dashboard/:dashboardId
    const dashboardMatch = urlPath.match(/^\/resource\/dashboard\/(.+)$/);
    if (dashboardMatch) {
      const dashboardId = dashboardMatch[1];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabDashboardId = (tabConfig['dashboardId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'dashboards' && tabDashboardId === dashboardId;
      }) || null;
    }

    // Check for artifact URL: /resource/artifact/:artifactId
    const artifactMatch = urlPath.match(/^\/resource\/artifact\/(.+)$/);
    if (artifactMatch) {
      const artifactId = artifactMatch[1];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabArtifactId = (tabConfig['artifactId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'artifacts' && tabArtifactId === artifactId;
      }) || null;
    }

    // Check for query URL: /resource/query/:queryId
    const queryMatch = urlPath.match(/^\/resource\/query\/(.+)$/);
    if (queryMatch) {
      const queryId = queryMatch[1];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabQueryId = (tabConfig['queryId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'queries' && tabQueryId === queryId;
      }) || null;
    }

    return null;
  }

  /**
   * Build a shareable resource URL from tab data.
   * Uses app.Path for cleaner URLs (e.g., /app/data-explorer instead of /app/Data%20Explorer)
   */
  private buildResourceUrl(tab: WorkspaceTab): string | null {
    const config = tab.configuration || {};
    const resourceType = (config['resourceType'] as string | undefined)?.toLowerCase();
    const recordId = tab.resourceRecordId;
    const appName = config['appName'] as string | undefined;
    const navItemName = config['navItemName'] as string | undefined;
    const queryParams = config['queryParams'] as Record<string, string> | undefined;
    const isAppDefault = config['isAppDefault'] as boolean | undefined;
    const tabAppId = tab.applicationId;
    const tabTitle = tab.title;

    // Helper function to get app path for URL
    const getAppPath = (appIdOrName: string): string | null => {
      // First try by ID
      let app = this.appManager.GetAppById(appIdOrName);
      if (!app) {
        // Try by name
        app = this.appManager.GetAppByName(appIdOrName);
      }
      if (app) {
        // Prefer Path, fall back to Name for backwards compatibility
        return app.Path || app.Name;
      }
      return null;
    };

    // If this is an app nav item, build app-based URL
    if (appName && navItemName) {
      // Look up the app to get its Path
      const appPath = getAppPath(appName) || appName;
      let url = `/app/${encodeURIComponent(appPath)}/${encodeURIComponent(navItemName)}`;

      // Add query params if present
      if (queryParams && Object.keys(queryParams).length > 0) {
        const params = new URLSearchParams(queryParams);
        url += `?${params.toString()}`;
      }

      return url;
    }

    // If this is an app's default dashboard (no nav items), use app-level URL
    if (isAppDefault && appName) {
      const appPath = getAppPath(appName) || appName;
      return `/app/${encodeURIComponent(appPath)}`;
    }

    // Fallback: If tab belongs to a non-system app but doesn't have appName/navItemName,
    // try to reconstruct the URL from the ApplicationId and tab title
    if (tabAppId && tabAppId !== '__explorer') {
      const app = this.appManager.GetAppById(tabAppId);
      if (app) {
        // Prefer Path, fall back to Name
        const appPath = app.Path || app.Name;
        const navItems = app.GetNavItems();

        // If app has nav items, try to find the matching one by title
        if (navItems.length > 0) {
          const navItem = navItems.find(item =>
            item.Label?.trim().toLowerCase() === tabTitle?.trim().toLowerCase()
          );

          if (navItem) {
            let url = `/app/${encodeURIComponent(appPath)}/${encodeURIComponent(navItem.Label)}`;

            // Add query params if present
            if (queryParams && Object.keys(queryParams).length > 0) {
              const params = new URLSearchParams(queryParams);
              url += `?${params.toString()}`;
            }

            return url;
          }
        } else {
          // App has zero nav items - use app-level URL
          // This handles apps that only have a default dashboard
          return `/app/${encodeURIComponent(appPath)}`;
        }
      }
    }

    const entityName = (config['Entity'] || config['entity']) as string | undefined;
    const isDynamic = config['isDynamic'] as boolean | undefined;
    const extraFilter = (config['ExtraFilter'] || config['extraFilter']) as string | undefined;

    switch (resourceType) {
      case 'records':
        // /resource/record/:entityName/:recordId
        if (entityName && recordId) {
          return `/resource/record/${encodeURIComponent(entityName)}/${recordId}`;
        }
        break;

      case 'user views':
        // Check if it's a dynamic view
        if (isDynamic || recordId === 'dynamic') {
          // /resource/view/dynamic/:entityName?ExtraFilter=...
          if (entityName) {
            let url = `/resource/view/dynamic/${encodeURIComponent(entityName)}`;
            if (extraFilter) {
              url += `?ExtraFilter=${encodeURIComponent(extraFilter)}`;
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
    // Clear the system tab flag since we're switching to a real app
    this.isViewingSystemTab = false;

    // Show loading indicator in app switcher
    this.loadingAppId = appId;
    this.cdr.detectChanges();

    try {
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
    } finally {
      // Clear loading indicator
      this.loadingAppId = null;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle Nav Bar app icon click (single click switches to app)
   */
  onNavBarAppClick(app: BaseApplication, event: MouseEvent): void {
    // If shift key is held, force new tab
    if (event.shiftKey) {
      this.openNavBarAppInNewTab(app);
    } else {
      this.onAppSwitch(app.ID);
    }
  }

  /**
   * Handle Nav Bar app icon double-click (opens in new tab)
   */
  onNavBarAppDblClick(app: BaseApplication, event: MouseEvent): void {
    event.preventDefault();
    this.openNavBarAppInNewTab(app);
  }

  /**
   * Open a nav bar app's default content in a new tab
   */
  private async openNavBarAppInNewTab(app: BaseApplication): Promise<void> {
    // Create the default tab for this app with forceNewTab
    const tabRequest = await app.CreateDefaultTab();
    if (tabRequest) {
      // Set the app as active first if it isn't already
      if (this.activeApp?.ID !== app.ID) {
        await this.appManager.SetActiveApp(app.ID);
      }

      // Open in new tab by adding to workspace
      this.workspaceManager.OpenTab(tabRequest, app.GetColor());
    }
  }

  /**
   * Handle navigation item click with shift-key and double-click detection
   */
  onNavItemClick(event: NavItemClickEvent): void {
    if (!this.activeApp) {
      return;
    }

    const { item, shiftKey, dblClick } = event;

    // Close mobile nav if open
    this.mobileNavOpen = false;

    // Use NavigationService with forceNewTab option if shift was pressed or double-clicked
    this.navigationService.OpenNavItem(
      this.activeApp.ID,
      item,
      this.activeApp.GetColor(),
      { forceNewTab: shiftKey || dblClick }
    );
  }

  /**
   * Toggle mobile navigation drawer
   */
  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
  }

  /**
   * Close mobile navigation drawer
   */
  closeMobileNav(): void {
    this.mobileNavOpen = false;
  }

  /**
   * Toggle user menu visibility
   */
  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.userMenuVisible = !this.userMenuVisible;

    if (this.userMenuVisible) {
      // Close menu when clicking outside
      const closeHandler = () => {
        this.userMenuVisible = false;
        document.removeEventListener('click', closeHandler);
      };
      setTimeout(() => {
        document.addEventListener('click', closeHandler);
      }, 0);
    }
  }

  /**
   * Open Settings in a full-screen modal dialog
   */
  onSettings(): void {
    this.userMenuVisible = false;
    this.settingsDialogService.open(this.viewContainerRef);
  }

  /**
   * Log current workspace configuration to console (debug)
   */
  onLogLayout(): void {
    const config = this.workspaceManager.GetConfiguration();
    console.log('📋 Workspace Configuration:', JSON.stringify(config, null, 2));
    console.log('📋 Workspace Configuration (object):', config);
    this.userMenuVisible = false;
  }

  /**
   * Reset workspace layout - clears all tabs and switches to single-resource mode
   */
  async onResetLayout(): Promise<void> {
    this.userMenuVisible = false;

    // Get current active app to create a fresh default tab
    const currentApp = this.activeApp;
    if (!currentApp) {
      console.warn('No active app to reset to');
      return;
    }

    // Create a fresh configuration with just one default tab
    const defaultTabRequest = await currentApp.CreateDefaultTab();
    if (!defaultTabRequest) {
      console.warn('Could not create default tab for app');
      return;
    }

    // Generate a new tab ID
    const newTabId = uuidv4();

    // Create minimal configuration with single tab (will trigger single-resource mode)
    const freshConfig = {
      version: 1,
      layout: {
        root: {
          type: 'row' as const,
          content: []
        }
      },
      activeTabId: newTabId,
      theme: 'light' as const,
      preferences: {
        tabPosition: 'top' as const,
        showTabIcons: true,
        autoSaveInterval: 5000
      },
      tabs: [{
        id: newTabId,
        applicationId: defaultTabRequest.ApplicationId,
        title: defaultTabRequest.Title,
        resourceTypeId: defaultTabRequest.ResourceTypeId || '',
        resourceRecordId: defaultTabRequest.ResourceRecordId || '',
        isPinned: false,
        sequence: 0,
        lastAccessedAt: new Date().toISOString(),
        configuration: defaultTabRequest.Configuration || {}
      }]
    };

    console.log('🔄 Resetting layout to fresh state:', freshConfig);

    // Update workspace configuration
    this.workspaceManager.UpdateConfiguration(freshConfig);
  }

  /**
   * Logout user and clear authentication data
   */
  async onLogout(): Promise<void> {
    this.userMenuVisible = false;
    this.authBase.logout();
    localStorage.removeItem('auth');
    localStorage.removeItem('claims');
  }

  /**
   * Load user avatar from database, auto-sync from auth provider if needed
   */
  private async loadUserAvatar(currentUserInfo: { ID: string; FirstLast?: string; Name?: string }): Promise<void> {
    try {
      const md = new Metadata();
      this.userName = currentUserInfo.FirstLast || currentUserInfo.Name || 'User';

      // Load the full UserEntity to access avatar fields
      const currentUserEntity = await md.GetEntityObject<any>('Users');
      await currentUserEntity.Load(currentUserInfo.ID);

      // Auto-sync avatar from auth provider if user has no avatar settings in DB
      if (!currentUserEntity.UserImageURL && !currentUserEntity.UserImageIconClass) {
        const synced = await this.syncAvatarFromAuthProvider(currentUserEntity);
        if (synced) {
          // Reload user entity to get saved values
          await currentUserEntity.Load(currentUserInfo.ID);
        }
      }

      // Load avatar for display (always from DB after potential sync)
      this.applyUserAvatar(currentUserEntity);
    } catch (error) {
      console.warn('Could not load user avatar:', error);
      // Use fallback
      this.userImageURL = '';
      this.userIconClass = null;
    }
  }

  /**
   * Syncs avatar from auth provider (Microsoft, Google, etc.)
   */
  private async syncAvatarFromAuthProvider(user: any): Promise<boolean> {
    try {
      const claims = await firstValueFrom(await this.authBase.getUserClaims());

      // Check if Microsoft
      if (claims && claims.authority &&
          (claims.authority.includes('microsoftonline.com') || claims.authority.includes('microsoft.com'))) {
        // Microsoft Graph API photo endpoint
        const imageUrl = 'https://graph.microsoft.com/v1.0/me/photo/$value';
        const authHeaders = { 'Authorization': `Bearer ${claims.accessToken}` };

        return await this.userAvatarService.syncFromImageUrl(user, imageUrl, authHeaders);
      }

      return false;
    } catch (error) {
      console.warn('Could not sync avatar from auth provider:', error);
      return false;
    }
  }

  /**
   * Apply user avatar to component state
   * Priority: UserImageURL > UserImageIconClass > default icon
   */
  private applyUserAvatar(user: any): void {
    if (user.UserImageURL) {
      this.userImageURL = user.UserImageURL;
      this.userIconClass = null;
    } else if (user.UserImageIconClass) {
      this.userIconClass = user.UserImageIconClass;
      this.userImageURL = '';
    } else {
      // Default fallback - show icon
      this.userImageURL = '';
      this.userIconClass = null;
    }
    this.cdr.detectChanges();
  }

  /**
   * Update browser tab title based on current app and active tab.
   * Format: "Resource Name - App Name - MemberJunction"
   */
  private updateBrowserTitle(config: WorkspaceConfiguration): void {
    // Find the active tab
    const activeTab = config.tabs?.find(tab => tab.id === config.activeTabId);

    // Get app name
    const appName = this.activeApp?.Name || null;

    // Get resource name from active tab
    let resourceName: string | null = null;
    if (activeTab) {
      resourceName = activeTab.title || null;
    }

    // Update title via TitleService
    this.titleService.setContext(appName, resourceName);
  }
}
