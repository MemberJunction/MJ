import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ViewContainerRef, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  ApplicationManager,
  WorkspaceStateManager,
  GoldenLayoutManager,
  BaseApplication,
  TabService,
  WorkspaceConfiguration,
  WorkspaceTab,
  AppAccessResult
} from '@memberjunction/ng-base-application';
import { Metadata, EntityInfo, LogStatus, StartupManager } from '@memberjunction/core';
import { MJEventType, MJGlobal, uuidv4 } from '@memberjunction/global';
import { EventCodes, NavigationService, SYSTEM_APP_ID, TitleService } from '@memberjunction/ng-shared';
import { LogoGradient } from '@memberjunction/ng-shared-generic';
import { NavItemClickEvent } from './components/header/app-nav.component';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UserAvatarService } from '@memberjunction/ng-user-avatar';
import { SettingsDialogService } from './services/settings-dialog.service';
import { LoadingTheme, LoadingAnimationType, AnimationStep, getActiveTheme } from './loading-themes';
import { AppAccessDialogComponent, AppAccessDialogConfig, AppAccessDialogResult } from './components/dialogs/app-access-dialog.component';

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
  private waitingForFirstResource = false;
  tabBarVisible = true; // Controlled by workspace manager
  userMenuVisible = false; // User avatar context menu
  mobileNavOpen = false; // Mobile navigation drawer
  unreadNotificationCount = 0; // Notification badge count
  isViewingSystemTab = false; // True when viewing a resource tab (not associated with a registered app)
  loadingAppId: string | null = null; // ID of app currently being loaded (for app switcher loading indicator)

  // Loading animation state
  private loadingMessageInterval: ReturnType<typeof setInterval> | null = null;
  private loadingMessageIndex = 0;
  private usedMessageIndices: number[] = [];
  private usedGradientIndices: number[] = [];
  private messageCycleCount = 0; // Track message cycles for color changes
  private activeTheme: LoadingTheme;
  private readonly messageIntervalMs = 2500; // 2.5 seconds per message
  private readonly colorChangeEveryNMessages = 2; // Change color every 2 messages (5 seconds)
  // All available animation types (used for random selection when theme doesn't specify)
  private readonly allAnimationTypes: LoadingAnimationType[] = ['pulse', 'spin', 'bounce', 'pulse-spin'];
  // Animation sequencing
  private animationSequence: AnimationStep[] = [];
  private currentAnimationIndex = 0;
  private animationSequenceTimeout: ReturnType<typeof setTimeout> | null = null;
  currentLoadingText: string;
  currentLoadingColor: string;
  currentLoadingTextColor: string;
  currentLoadingGradient: LogoGradient | null;
  currentLoadingAnimation: 'pulse' | 'spin' | 'bounce' | 'pulse-spin' = 'pulse';

  // User avatar state
  userImageURL = '';
  userIconClass: string | null = null;
  userName = '';

  // Search state
  isSearchOpen = false;
  searchableEntities: EntityInfo[] = [];
  selectedEntity: EntityInfo | null = null;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  // App access dialog
  @ViewChild('appAccessDialog') appAccessDialog!: AppAccessDialogComponent;
  private pendingAppPath: string | null = null; // Store the app path we tried to access

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
  ) {
    // Initialize theme immediately so loading UI shows correct colors from the start
    this.activeTheme = getActiveTheme();

    // Initialize animation based on theme configuration
    this.initializeAnimationFromTheme();

    // Set first message
    this.currentLoadingText = this.activeTheme.messages[0];

    if (this.activeTheme.staticColors) {
      // Standard theme: keep MJ blue, no gradient
      this.currentLoadingColor = this.activeTheme.colors[0];
      this.currentLoadingTextColor = '#757575'; // Default gray text
      this.currentLoadingGradient = null;
    } else {
      // Themed period: use theme colors and first gradient from the start
      this.currentLoadingColor = this.activeTheme.colors[0];
      this.currentLoadingTextColor = this.activeTheme.colors[0];

      // Set initial gradient if theme has gradients
      if (this.activeTheme.gradients && this.activeTheme.gradients.length > 0) {
        this.currentLoadingGradient = this.activeTheme.gradients[0];
      } else {
        this.currentLoadingGradient = null;
      }
    }
  }

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
    // Start the loading animation with cycling messages
    this.startLoadingAnimation();

    // Initialize application manager (subscribes to LoggedIn event)
    this.appManager.Initialize();

    await StartupManager.Instance.Startup();          

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
    // Use combineLatest to wait for loading to complete before deciding there are no apps
    this.subscriptions.push(
      combineLatest([this.appManager.Applications, this.appManager.Loading]).subscribe(async ([apps, isLoading]) => {
        // Don't make decisions while still loading - wait for load to complete
        if (isLoading) {
          return;
        }

        // Handle the case where user has no apps at all (only after loading is complete)
        if (apps.length === 0) {
          await this.handleNoAppsAvailable();
          return;
        }

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
          } else {
            // App not found in user's list - check why and show appropriate dialog
            await this.handleAppAccessError(routeAppPath, apps);
            return;
          }
        }

        // Set default app if URL doesn't specify one AND no app is active yet
        const currentActiveApp = this.appManager.GetActiveApp();
        if (!appMatch && !currentActiveApp) {
          await this.appManager.SetActiveApp(apps[0].ID);
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

    // Load searchable entities for search functionality
    await this.loadSearchableEntities();

    this.initialized = true;
    this.waitingForFirstResource = true;
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
      // Compare full URLs including query params to detect changes
      const currentUrl = this.router.url;
      const newUrl = resourceUrl;

      // Only update if URL is different (path or query params changed)
      if (currentUrl !== newUrl) {
        // Suppress ResourceResolver for this navigation - we're just syncing the URL
        // to reflect the current active tab, not requesting a new tab to be opened
        this.tabService.SuppressNextResolve();

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

    // Check for app-scoped resource URLs (new pattern)
    // Pattern: /app/:appName/:resourceType/:param1/:param2?

    // Dashboard: /app/:appName/dashboard/:dashboardId
    const appDashboardMatch = urlPath.match(/^\/app\/([^\/]+)\/dashboard\/(.+)$/);
    if (appDashboardMatch) {
      const dashboardId = appDashboardMatch[2];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabDashboardId = (tabConfig['dashboardId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'dashboards' && tabDashboardId === dashboardId;
      }) || null;
    }

    // Record: /app/:appName/record/:entityName/:recordId
    const appRecordMatch = urlPath.match(/^\/app\/([^\/]+)\/record\/([^\/]+)\/(.+)$/);
    if (appRecordMatch) {
      const entityName = decodeURIComponent(appRecordMatch[2]);
      const recordId = appRecordMatch[3];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const tabEntity = (tabConfig['Entity'] || tabConfig['entity']) as string | undefined;
        const tabRecordId = (tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return tabEntity?.toLowerCase() === entityName.toLowerCase() &&
               tabRecordId === recordId;
      }) || null;
    }

    // Dynamic view: /app/:appName/view/dynamic/:entityName
    const appDynamicViewMatch = urlPath.match(/^\/app\/([^\/]+)\/view\/dynamic\/(.+)$/);
    if (appDynamicViewMatch) {
      const entityName = decodeURIComponent(appDynamicViewMatch[2]);

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabEntity = (tabConfig['Entity'] || tabConfig['entity']) as string | undefined;
        const isDynamic = tabConfig['isDynamic'] as boolean | undefined;

        return resourceType === 'user views' && isDynamic && tabEntity?.toLowerCase() === entityName.toLowerCase();
      }) || null;
    }

    // Saved view: /app/:appName/view/:viewId
    const appViewMatch = urlPath.match(/^\/app\/([^\/]+)\/view\/([^\/]+)$/);
    if (appViewMatch) {
      const viewId = appViewMatch[2];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabViewId = (tabConfig['viewId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'user views' && tabViewId === viewId;
      }) || null;
    }

    // Query: /app/:appName/query/:queryId
    const appQueryMatch = urlPath.match(/^\/app\/([^\/]+)\/query\/(.+)$/);
    if (appQueryMatch) {
      const queryId = appQueryMatch[2];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabQueryId = (tabConfig['queryId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'queries' && tabQueryId === queryId;
      }) || null;
    }

    // Report: /app/:appName/report/:reportId
    const appReportMatch = urlPath.match(/^\/app\/([^\/]+)\/report\/(.+)$/);
    if (appReportMatch) {
      const reportId = appReportMatch[2];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabReportId = (tabConfig['reportId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'reports' && tabReportId === reportId;
      }) || null;
    }

    // Artifact: /app/:appName/artifact/:artifactId
    const appArtifactMatch = urlPath.match(/^\/app\/([^\/]+)\/artifact\/(.+)$/);
    if (appArtifactMatch) {
      const artifactId = appArtifactMatch[2];

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabArtifactId = (tabConfig['artifactId'] || tabConfig['recordId'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'artifacts' && tabArtifactId === artifactId;
      }) || null;
    }

    // Search: /app/:appName/search/:searchInput
    const appSearchMatch = urlPath.match(/^\/app\/([^\/]+)\/search\/(.+)$/);
    if (appSearchMatch) {
      const searchInput = decodeURIComponent(appSearchMatch[2]);

      return tabs.find(tab => {
        const tabConfig = tab.configuration || {};
        const resourceType = (tabConfig['resourceType'] as string | undefined)?.toLowerCase();
        const tabSearchInput = (tabConfig['SearchInput'] || tab.resourceRecordId) as string | undefined;

        return resourceType === 'search results' && tabSearchInput === searchInput;
      }) || null;
    }

    // Legacy resource URLs (kept for backward compatibility)
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
          // No matching nav item found, continue to orphan resource handling
        } else if (!resourceType || resourceType === 'custom') {
          // App has zero nav items AND this is not an orphan resource (no resourceType or custom)
          // Use app-level URL - this handles apps that only have a default dashboard
          return `/app/${encodeURIComponent(appPath)}`;
        }
        // If app has zero nav items but we have a resourceType (orphan resource),
        // fall through to orphan resource URL building below
      }
    }

    const entityName = (config['Entity'] || config['entity']) as string | undefined;
    const isDynamic = config['isDynamic'] as boolean | undefined;
    const extraFilter = (config['ExtraFilter'] || config['extraFilter']) as string | undefined;

    // For orphan resources (not tied to a specific nav item), use app-scoped URLs
    // Get the app path for the URL
    let appPath: string | null = null;
    if (tabAppId && tabAppId !== SYSTEM_APP_ID) {
      const app = this.appManager.GetAppById(tabAppId);
      if (app) {
        appPath = app.Path || app.Name;
      }
    }

    // If no app path found, try to use Home app as the default
    if (!appPath) {
      const homeApp = this.appManager.GetAppByName('Home');
      if (homeApp) {
        appPath = homeApp.Path || homeApp.Name;
      }
    }

    // Build app-scoped URLs (new pattern) if we have an app context
    if (appPath) {
      switch (resourceType) {
        case 'records':
          // /app/:appName/record/:entityName/:recordId
          if (entityName && recordId) {
            return `/app/${encodeURIComponent(appPath)}/record/${encodeURIComponent(entityName)}/${recordId}`;
          }
          break;

        case 'user views':
          // Check if it's a dynamic view
          if (isDynamic || recordId === 'dynamic') {
            // /app/:appName/view/dynamic/:entityName?ExtraFilter=...
            if (entityName) {
              let url = `/app/${encodeURIComponent(appPath)}/view/dynamic/${encodeURIComponent(entityName)}`;
              if (extraFilter) {
                url += `?ExtraFilter=${encodeURIComponent(extraFilter)}`;
              }
              return url;
            }
          } else if (recordId) {
            // /app/:appName/view/:viewId (saved view)
            return `/app/${encodeURIComponent(appPath)}/view/${recordId}`;
          }
          break;

        case 'dashboards':
          // /app/:appName/dashboard/:dashboardId
          if (recordId) {
            return `/app/${encodeURIComponent(appPath)}/dashboard/${recordId}`;
          }
          break;

        case 'artifacts':
          // /app/:appName/artifact/:artifactId
          if (recordId) {
            return `/app/${encodeURIComponent(appPath)}/artifact/${recordId}`;
          }
          break;

        case 'queries':
          // /app/:appName/query/:queryId
          if (recordId) {
            return `/app/${encodeURIComponent(appPath)}/query/${recordId}`;
          }
          break;

        case 'reports':
          // /app/:appName/report/:reportId
          if (recordId) {
            return `/app/${encodeURIComponent(appPath)}/report/${recordId}`;
          }
          break;

        case 'search results':
          // /app/:appName/search/:searchInput?Entity=...
          const searchInput = config['SearchInput'] as string | undefined;
          if (searchInput) {
            let url = `/app/${encodeURIComponent(appPath)}/search/${encodeURIComponent(searchInput)}`;
            if (entityName) {
              url += `?Entity=${encodeURIComponent(entityName)}`;
            }
            return url;
          }
          break;
      }
    }

    // Fallback to legacy routes (for backward compatibility during transition)
    switch (resourceType) {
      case 'records':
        if (entityName && recordId) {
          return `/resource/record/${encodeURIComponent(entityName)}/${recordId}`;
        }
        break;

      case 'user views':
        if (isDynamic || recordId === 'dynamic') {
          if (entityName) {
            let url = `/resource/view/dynamic/${encodeURIComponent(entityName)}`;
            if (extraFilter) {
              url += `?ExtraFilter=${encodeURIComponent(extraFilter)}`;
            }
            return url;
          }
        } else if (recordId) {
          return `/resource/view/${recordId}`;
        }
        break;

      case 'dashboards':
        if (recordId) {
          return `/resource/dashboard/${recordId}`;
        }
        break;

      case 'artifacts':
        if (recordId) {
          return `/resource/artifact/${recordId}`;
        }
        break;

      case 'queries':
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

  /**
   * Called when the first resource component finishes loading.
   * We accept subsequent calls to this method in ordre to ensure we are
   * not forever showing animation for loading - this can happen if there is
   * a race condition in components we DO NOT control, so while the naming
   * is intended to imply the goal it doesn't "hurt" to have this work this way
   */
  onFirstResourceLoadComplete(): void {
    this.waitingForFirstResource = false;
    this.loading = false;
    this.stopLoadingAnimation();
    this.cdr.detectChanges();
  }

  /**
   * Start the loading message cycling animation.
   * Messages cycle every 2.5 seconds without repeating until all are used.
   * Colors change every 5 seconds (every 2nd message cycle).
   * For themed periods: use theme colors/gradients from the start.
   * For standard theme: keep MJ blue throughout (no color changes).
   * Animation is randomly selected from pulse, spin, and pulse-spin.
   * Theme is selected based on current date and user's browser locale.
   */
  private startLoadingAnimation(): void {
    // Select the appropriate theme based on date and locale
    this.activeTheme = getActiveTheme();
    console.log(`🎨 Loading theme: ${this.activeTheme.name}`);

    // Reset state
    this.usedMessageIndices = [0]; // Mark first message as used
    this.usedGradientIndices = [];
    this.loadingMessageIndex = 0;
    this.messageCycleCount = 0;

    // Initialize display with first message and initial color/gradient
    this.initializeLoadingDisplay();

    // Initialize animation based on theme configuration
    this.initializeAnimationFromTheme();

    // Start the animation sequence (if there are multiple steps)
    this.startAnimationSequence();

    // Start cycling every 2.5 seconds
    this.loadingMessageInterval = setInterval(() => {
      this.cycleToNextMessage();
      this.cdr.detectChanges();
    }, this.messageIntervalMs);
  }

  /**
   * Stop the loading message cycling animation.
   */
  private stopLoadingAnimation(): void {
    if (this.loadingMessageInterval) {
      clearInterval(this.loadingMessageInterval);
      this.loadingMessageInterval = null;
    }
    // Also clear any animation sequence timeout
    if (this.animationSequenceTimeout) {
      clearTimeout(this.animationSequenceTimeout);
      this.animationSequenceTimeout = null;
    }
  }

  /**
   * Initialize the loading display with first message and initial color/gradient.
   * For themed periods, applies theme styling from the start.
   * For standard theme, keeps MJ blue throughout.
   */
  private initializeLoadingDisplay(): void {
    // Set first message
    this.currentLoadingText = this.activeTheme.messages[0];

    if (this.activeTheme.staticColors) {
      // Standard theme: keep MJ blue, no gradient
      this.currentLoadingColor = this.activeTheme.colors[0];
      this.currentLoadingTextColor = '#757575'; // Default gray text
      this.currentLoadingGradient = null;
    } else {
      // Themed period: use theme colors and first gradient from the start
      this.currentLoadingColor = this.activeTheme.colors[0];
      this.currentLoadingTextColor = this.activeTheme.colors[0];

      // Set initial gradient if theme has gradients
      if (this.activeTheme.gradients && this.activeTheme.gradients.length > 0) {
        this.currentLoadingGradient = this.activeTheme.gradients[0];
        this.usedGradientIndices = [0];
      } else {
        this.currentLoadingGradient = null;
      }
    }
  }

  /**
   * Cycle to the next loading message, avoiding repeats until all are used.
   * Colors change every colorChangeEveryNMessages cycles (5 seconds).
   * For standard theme, colors remain static.
   */
  private cycleToNextMessage(): void {
    const messages = this.activeTheme.messages;
    this.messageCycleCount++;

    // If we've used all messages, reset the used list (but exclude current to avoid immediate repeat)
    if (this.usedMessageIndices.length >= messages.length) {
      this.usedMessageIndices = [this.loadingMessageIndex];
    }

    // Find a random unused message index
    const availableIndices = messages
      .map((_, i) => i)
      .filter(i => !this.usedMessageIndices.includes(i));

    if (availableIndices.length > 0) {
      const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      this.usedMessageIndices.push(randomIndex);
      this.loadingMessageIndex = randomIndex;

      // Update the message
      this.currentLoadingText = this.activeTheme.messages[randomIndex];

      // Check if it's time to change colors (every 2nd message = every 5 seconds)
      // But only for non-static themes
      if (!this.activeTheme.staticColors && this.messageCycleCount % this.colorChangeEveryNMessages === 0) {
        this.cycleToNextColor();
      }
    }
  }

  /**
   * Cycle to the next color/gradient from the theme.
   * Alternates through gradients if available.
   */
  private cycleToNextColor(): void {
    // Cycle to next gradient if available
    if (this.activeTheme.gradients && this.activeTheme.gradients.length > 0) {
      const gradients = this.activeTheme.gradients;

      // If we've used all gradients, reset (but exclude current to avoid immediate repeat)
      if (this.usedGradientIndices.length >= gradients.length) {
        const lastUsed = this.usedGradientIndices[this.usedGradientIndices.length - 1];
        this.usedGradientIndices = [lastUsed];
      }

      // Find next gradient (simple rotation for gradients)
      const currentIndex = this.usedGradientIndices[this.usedGradientIndices.length - 1] ?? -1;
      const nextIndex = (currentIndex + 1) % gradients.length;
      this.usedGradientIndices.push(nextIndex);
      this.currentLoadingGradient = gradients[nextIndex];
    }

    // Also cycle text color through theme colors
    const colors = this.activeTheme.colors;
    if (colors.length > 1) {
      // Get a random color from the theme for text
      const randomIndex = Math.floor(Math.random() * colors.length);
      this.currentLoadingColor = colors[randomIndex];
      this.currentLoadingTextColor = colors[randomIndex];
    }
  }

  /**
   * Initialize animation configuration from the current theme.
   * Converts the theme's animation config (string or array) to a normalized sequence.
   */
  private initializeAnimationFromTheme(): void {
    this.currentAnimationIndex = 0;

    const themeAnimations = this.activeTheme.animations;

    if (!themeAnimations) {
      // No animation config - use random selection for non-standard themes
      if (this.activeTheme.id === 'standard') {
        // Standard theme defaults to pulse only
        this.animationSequence = [{ type: 'pulse' }];
      } else {
        // Random selection for themed holidays without explicit config
        const randomType = this.allAnimationTypes[
          Math.floor(Math.random() * this.allAnimationTypes.length)
        ];
        this.animationSequence = [{ type: randomType }];
      }
    } else if (typeof themeAnimations === 'string') {
      // Single animation type specified
      this.animationSequence = [{ type: themeAnimations }];
    } else {
      // Array of animation steps
      this.animationSequence = themeAnimations;
    }

    // Set initial animation
    if (this.animationSequence.length > 0) {
      this.currentLoadingAnimation = this.animationSequence[0].type;
    }
  }

  /**
   * Start the animation sequence, scheduling transitions between animation steps.
   */
  private startAnimationSequence(): void {
    // Clear any existing timeout
    if (this.animationSequenceTimeout) {
      clearTimeout(this.animationSequenceTimeout);
      this.animationSequenceTimeout = null;
    }

    this.currentAnimationIndex = 0;
    this.scheduleNextAnimationStep();
  }

  /**
   * Schedule the transition to the next animation step based on current step's duration.
   */
  private scheduleNextAnimationStep(): void {
    if (this.animationSequence.length <= 1) {
      // Only one step - no transitions needed
      return;
    }

    const currentStep = this.animationSequence[this.currentAnimationIndex];
    const durationMs = currentStep.durationMs;

    // If no duration specified (or 0), this step runs indefinitely
    if (!durationMs || durationMs <= 0) {
      return;
    }

    // Schedule transition to next step
    this.animationSequenceTimeout = setTimeout(() => {
      this.transitionToNextAnimation();
    }, durationMs);
  }

  /**
   * Transition to the next animation in the sequence.
   */
  private transitionToNextAnimation(): void {
    this.currentAnimationIndex++;

    if (this.currentAnimationIndex >= this.animationSequence.length) {
      // Sequence complete - stay on last animation
      return;
    }

    const nextStep = this.animationSequence[this.currentAnimationIndex];
    this.currentLoadingAnimation = nextStep.type;
    this.cdr.detectChanges();

    // Schedule the next transition if this step has a duration
    this.scheduleNextAnimationStep();
  }

  ngOnDestroy(): void {
    this.stopLoadingAnimation();
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
      // v3.0 API - Clean encapsulation! No provider-specific logic needed!
      // The provider handles whether it's Graph API, Auth0, or Okta internally
      const pictureUrl = await this.authBase.getProfilePictureUrl();

      if (pictureUrl) {
        return await this.userAvatarService.syncFromImageUrl(user, pictureUrl);
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

  // ========================================
  // SEARCH FUNCTIONALITY
  // ========================================

  /**
   * Load searchable entities from metadata
   */
  private async loadSearchableEntities(): Promise<void> {
    const md = new Metadata();
    this.searchableEntities = md.Entities.filter((e) => e.AllowUserSearchAPI).sort((a, b) => a.Name.localeCompare(b.Name));
    if (this.searchableEntities.length > 0) {
      this.selectedEntity = this.searchableEntities[0];
    }
  }

  /**
   * Toggle search popup visibility
   */
  toggleSearch(): void {
    this.isSearchOpen = !this.isSearchOpen;

    // Focus on search input when opened
    if (this.isSearchOpen) {
      setTimeout(() => {
        if (this.searchInput && this.searchInput.nativeElement) {
          this.searchInput.nativeElement.focus();
        }
      }, 100);
    }
  }

  /**
   * Close search popup
   */
  closeSearch(): void {
    this.isSearchOpen = false;
  }

  /**
   * Handle search submission
   */
  onSearch(event: Event): void {
    if (!this.searchInput) {
      return;
    }

    const inputValue = this.searchInput.nativeElement.value;
    if (inputValue && inputValue.length > 0 && inputValue.trim().length > 2) {
      this.searchInput.nativeElement.value = ''; // Clear input
      this.isSearchOpen = false; // Close search popup

      // Navigate to search results
      if (this.selectedEntity) {
        this.router.navigate(['resource', 'search', inputValue], { queryParams: { Entity: this.selectedEntity.Name } });
      }
    } else {
      // Show warning notification
      MJGlobal.Instance.RaiseEvent({
        component: this,
        event: MJEventType.DisplaySimpleNotificationRequest,
        eventCode: "",
        args: {
          message: 'Please enter at least 3 characters to search',
          style: 'warning',
          DisplayDuration: 1500
        }
      });
    }
  }

  // ========================================
  // NOTIFICATION FUNCTIONALITY
  // ========================================

  /**
   * Show notifications page as a tab
   */
  showNotifications(): void {
    MJGlobal.Instance.RaiseEvent({
      event: MJEventType.ComponentEvent,
      component: this,
      eventCode: EventCodes.ViewNotifications,
      args: {}
    });

    // Open notifications in a tab
    // Use 'Custom' resource type with explicit driverClass to load NotificationsResource component
    this.tabService.OpenTab({
      ApplicationId: SYSTEM_APP_ID,
      Title: 'Notifications',
      Configuration: {
        resourceType: 'Custom',
        driverClass: 'NotificationsResource',
        route: 'notifications'
      },
      IsPinned: false
    });
  }

  // ========================================
  // APP ACCESS ERROR HANDLING
  // ========================================

  /**
   * Handle app access error by showing the appropriate dialog based on the access check result.
   * IMPORTANT: This keeps the loading screen visible and does NOT navigate to any app
   * until the user makes a decision in the dialog.
   * @param appPath The app path from the URL that the user tried to access
   * @param availableApps The list of apps the user has access to (for fallback)
   */
  private async handleAppAccessError(appPath: string, availableApps: BaseApplication[]): Promise<void> {
    // Prevent showing the dialog multiple times for the same app path
    // This can happen when the applications$ observable emits multiple times during reload
    if (this.pendingAppPath === appPath) {
      return;
    }

    const accessResult = this.appManager.CheckAppAccess(appPath);
    this.pendingAppPath = appPath;

    LogStatus(`App access check for "${appPath}": ${accessResult.status} - ${accessResult.message}`);

    const dialogConfig = this.mapAccessResultToDialogConfig(accessResult);

    // IMPORTANT: Keep loading screen visible while dialog is shown
    // Do NOT set any active app or create any tabs yet
    // The loading screen stays visible because we haven't called onFirstResourceLoadComplete

    // Show the dialog on top of the loading screen
    // Use setTimeout to ensure the dialog component is ready after view init
    setTimeout(() => {
      if (this.appAccessDialog) {
        this.appAccessDialog.show(dialogConfig);
      } else {
        // Fallback if dialog not available - redirect to first app
        console.warn('App access dialog not available, redirecting to first app');
        this.redirectToFirstApp(availableApps);
      }
    }, 0);
  }

  /**
   * Map an AppAccessResult to the dialog configuration
   */
  private mapAccessResultToDialogConfig(accessResult: AppAccessResult): AppAccessDialogConfig {
    switch (accessResult.status) {
      case 'not_found':
        return {
          type: 'not_found',
          appName: accessResult.appName
        };

      case 'inactive':
        return {
          type: 'inactive',
          appName: accessResult.appName,
          appId: accessResult.appId
        };

      case 'not_installed':
        return {
          type: 'not_installed',
          appName: accessResult.appName,
          appId: accessResult.appId
        };

      case 'disabled':
        return {
          type: 'disabled',
          appName: accessResult.appName,
          appId: accessResult.appId
        };

      default:
        // 'accessible' shouldn't reach here, but handle it as a generic error
        return {
          type: 'no_access',
          appName: accessResult.appName
        };
    }
  }

  /**
   * Handle when user has no apps available at all
   */
  private async handleNoAppsAvailable(): Promise<void> {
    LogStatus('User has no applications available');

    // Stop loading animation and show the dialog
    this.stopLoadingAnimation();
    this.loading = false;
    this.cdr.detectChanges();

    setTimeout(() => {
      if (this.appAccessDialog) {
        this.appAccessDialog.show({ type: 'no_apps' });
      }
    }, 0);
  }

  /**
   * Handle Golden Layout initialization failure
   */
  handleLayoutError(): void {
    LogStatus('Golden Layout initialization failed');

    const availableApps = this.appManager.GetAllApps();
    if (availableApps.length > 0) {
      setTimeout(() => {
        if (this.appAccessDialog) {
          this.appAccessDialog.show({ type: 'layout_error' });
        } else {
          // Direct redirect if dialog not available
          this.redirectToFirstApp(availableApps);
        }
      }, 0);
    }
  }

  /**
   * Handle dialog result (install, enable, or redirect)
   */
  async onAppAccessDialogResult(result: AppAccessDialogResult): Promise<void> {
    const availableApps = this.appManager.GetAllApps();

    switch (result.action) {
      case 'install':
        if (result.appId) {
          await this.installAndNavigateToApp(result.appId);
        }
        break;

      case 'enable':
        if (result.appId) {
          await this.enableAndNavigateToApp(result.appId);
        }
        break;

      case 'redirect':
      case 'dismissed':
      default:
        this.redirectToFirstApp(availableApps);
        break;
    }
  }

  /**
   * Install an app for the user and navigate to it
   */
  private async installAndNavigateToApp(appId: string): Promise<void> {
    // Clear pendingAppPath to allow fresh handling after installation
    this.pendingAppPath = null;

    try {
      const userApp = await this.appManager.InstallAppForUser(appId);

      if (userApp) {
        // App installed successfully - navigate to it
        const app = this.appManager.GetAppById(appId);

        if (app) {
          await this.navigateToApp(app);
          this.appAccessDialog?.completeProcessing();
        } else {
          // Fallback - reload might be needed
          console.warn(`[ShellComponent] App ${appId} not found after install, redirecting to first app`);
          this.appAccessDialog?.completeProcessing();
          this.redirectToFirstApp(this.appManager.GetAllApps());
        }
      } else {
        // Installation failed
        console.error('[ShellComponent] Installation failed');
        this.appAccessDialog?.completeProcessing();
        this.redirectToFirstApp(this.appManager.GetAllApps());
      }
    } catch (error) {
      console.error('Error installing app:', error);
      this.appAccessDialog?.completeProcessing();
      this.redirectToFirstApp(this.appManager.GetAllApps());
    }
  }

  /**
   * Enable a disabled app for the user and navigate to it
   */
  private async enableAndNavigateToApp(appId: string): Promise<void> {
    try {
      const success = await this.appManager.EnableAppForUser(appId);

      if (success) {
        // App enabled successfully - navigate to it
        const app = this.appManager.GetAppById(appId);
        if (app) {
          await this.navigateToApp(app);
          this.appAccessDialog?.completeProcessing();
        } else {
          this.appAccessDialog?.completeProcessing();
          this.redirectToFirstApp(this.appManager.GetAllApps());
        }
      } else {
        this.appAccessDialog?.completeProcessing();
        this.redirectToFirstApp(this.appManager.GetAllApps());
      }
    } catch (error) {
      console.error('Error enabling app:', error);
      this.appAccessDialog?.completeProcessing();
      this.redirectToFirstApp(this.appManager.GetAllApps());
    }
  }

  /**
   * Navigate to a specific app and create its default tab
   */
  private async navigateToApp(app: BaseApplication): Promise<void> {
    await this.appManager.SetActiveApp(app.ID);

    const existingTabs = this.workspaceManager.GetAppTabs(app.ID);
    if (existingTabs.length === 0) {
      const tabRequest = await app.CreateDefaultTab();
      if (tabRequest) {
        this.tabService.OpenTab(tabRequest);
      }
    }

    // Update URL to reflect the new app
    const appPath = app.Path || app.Name;
    this.router.navigateByUrl(`/app/${encodeURIComponent(appPath)}`, { replaceUrl: true });
  }

  /**
   * Redirect to the first available app (fallback)
   */
  private async redirectToFirstApp(apps: BaseApplication[]): Promise<void> {
    if (apps.length > 0) {
      const firstApp = apps[0];
      await this.navigateToApp(firstApp);
    } else {
      // No apps available - this shouldn't happen, but handle gracefully
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}
