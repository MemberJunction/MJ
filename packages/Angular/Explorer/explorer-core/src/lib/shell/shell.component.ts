import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
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
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { NavigationService } from '@memberjunction/ng-shared';
import { NavItemClickEvent } from './components/header/app-nav.component';
import { MJAuthBase } from '@memberjunction/ng-auth-services';

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
    private authBase: MJAuthBase
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
            const routeAppName = decodeURIComponent(appMatch[1]);
            // Find the app from the URL
            const urlApp = apps.find(a =>
              a.Name.trim().toLowerCase() === routeAppName.trim().toLowerCase()
            );

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
      return;
    }

    // Find the active tab
    const activeTab = config.tabs?.find(tab => tab.id === config.activeTabId);
    if (!activeTab) {
      return;
    }

    // Get the tab's application ID
    const tabAppId = activeTab.applicationId;
    if (!tabAppId) {
      return;
    }

    // Check if active app needs to be updated
    const currentActiveApp = this.appManager.GetActiveApp();
    if (currentActiveApp?.ID !== tabAppId) {
      // Update the active app to match the tab's application
      await this.appManager.SetActiveApp(tabAppId);
    }
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
   * Build a shareable resource URL from tab data
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

    // If this is an app nav item, build app-based URL
    if (appName && navItemName) {
      let url = `/app/${encodeURIComponent(appName)}/${encodeURIComponent(navItemName)}`;

      // Add query params if present
      if (queryParams && Object.keys(queryParams).length > 0) {
        const params = new URLSearchParams(queryParams);
        url += `?${params.toString()}`;
      }

      return url;
    }

    // If this is an app's default dashboard (no nav items), use app-level URL
    if (isAppDefault && appName) {
      return `/app/${encodeURIComponent(appName)}`;
    }

    // Fallback: If tab belongs to a non-system app but doesn't have appName/navItemName,
    // try to reconstruct the URL from the ApplicationId and tab title
    if (tabAppId && tabAppId !== '__explorer') {
      const app = this.appManager.GetAppById(tabAppId);
      if (app) {
        const navItems = app.GetNavItems();

        // If app has nav items, try to find the matching one by title
        if (navItems.length > 0) {
          const navItem = navItems.find(item =>
            item.Label?.trim().toLowerCase() === tabTitle?.trim().toLowerCase()
          );

          if (navItem) {
            let url = `/app/${encodeURIComponent(app.Name)}/${encodeURIComponent(navItem.Label)}`;

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
          return `/app/${encodeURIComponent(app.Name)}`;
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
    const newTabId = this.generateUUID();

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
   * Generate UUID for new tabs
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
