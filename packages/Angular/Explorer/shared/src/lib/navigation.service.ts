import { Injectable, OnDestroy } from '@angular/core';
import { WorkspaceStateManager, NavItem, TabRequest, ApplicationManager } from '@memberjunction/ng-base-application';
import { NavigationOptions } from './navigation.interfaces';
import { CompositeKey } from '@memberjunction/core';
import { fromEvent, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * System application ID for non-app-specific resources
 * Uses double underscore prefix to indicate system-level resource
 */
export const SYSTEM_APP_ID = '__explorer';

/**
 * Centralized navigation service that handles all navigation operations
 * with automatic shift-key detection for power user workflows
 */
@Injectable({
  providedIn: 'root'
})
export class NavigationService implements OnDestroy {
  private shiftKeyPressed = false;
  private subscriptions: Subscription[] = [];

  constructor(
    private workspaceManager: WorkspaceStateManager,
    private appManager: ApplicationManager
  ) {
    this.setupGlobalShiftKeyDetection();
  }

  /**
   * Get the neutral color used for system-wide resources (entities, views, dashboards)
   * Returns a light neutral gray
   */
  get ExplorerAppColor(): string {
    return '#9E9E9E'; // Material Design Gray 500 - neutral, professional
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Set up global keyboard event listeners to track shift key state
   */
  private setupGlobalShiftKeyDetection(): void {
    // Track shift key down
    const keyDown$ = fromEvent<KeyboardEvent>(document, 'keydown').pipe(
      map(event => event.shiftKey)
    );

    // Track shift key up
    const keyUp$ = fromEvent<KeyboardEvent>(document, 'keyup').pipe(
      map(event => event.shiftKey)
    );

    this.subscriptions.push(
      keyDown$.subscribe(shiftKey => {
        this.shiftKeyPressed = shiftKey;
      }),
      keyUp$.subscribe(shiftKey => {
        this.shiftKeyPressed = shiftKey;
      })
    );
  }

  /**
   * Get current shift key state
   */
  private isShiftPressed(): boolean {
    return this.shiftKeyPressed;
  }

  /**
   * Determine if a new tab should be forced based on options and shift key state
   */
  private shouldForceNewTab(options?: NavigationOptions): boolean {
    // If forceNewTab is explicitly set, use that
    if (options?.forceNewTab !== undefined) {
      return options.forceNewTab;
    }

    // Otherwise, use global shift key detection
    return this.isShiftPressed();
  }

  /**
   * Handle temporary tab preservation when forcing new tabs
   * Rule: Only ONE tab should be temporary at a time
   * When shift+clicking to force a new tab, pin the current active tab if it's temporary
   */
  private handleSingleResourceModeTransition(forceNew: boolean, newRequest: TabRequest): void {
    if (!forceNew) {
      return; // Normal navigation, not forcing new tab
    }

    const config = this.workspaceManager.GetConfiguration();
    console.log('[NavigationService.handleSingleResourceModeTransition] Current config:', {
      tabCount: config?.tabs?.length || 0,
      activeTabId: config?.activeTabId,
      tabs: config?.tabs?.map(t => ({ id: t.id, title: t.title, isPinned: t.isPinned }))
    });

    if (!config || !config.tabs || config.tabs.length === 0) {
      console.log('[NavigationService.handleSingleResourceModeTransition] No tabs to preserve');
      return; // No tabs to preserve
    }

    // Find the currently active tab
    const activeTab = config.tabs.find(tab => tab.id === config.activeTabId);
    if (!activeTab) {
      console.log('[NavigationService.handleSingleResourceModeTransition] No active tab found');
      return; // No active tab
    }

    console.log('[NavigationService.handleSingleResourceModeTransition] Active tab:', {
      id: activeTab.id,
      title: activeTab.title,
      isPinned: activeTab.isPinned
    });

    // If the active tab is NOT pinned (i.e., it's temporary), pin it to preserve it
    // This maintains the "only one temporary tab" rule
    if (!activeTab.isPinned) {
      console.log('[NavigationService.handleSingleResourceModeTransition] Pinning current temporary tab before creating new tab');
      this.workspaceManager.TogglePin(activeTab.id);
    } else {
      console.log('[NavigationService.handleSingleResourceModeTransition] Active tab already pinned, no action needed');
    }
  }

  /**
   * Check if a tab request matches an existing tab's resource
   */
  private isSameResource(tab: any, request: TabRequest): boolean {
    // Different apps = different resources
    if (tab.applicationId !== request.ApplicationId) {
      return false;
    }

    // For resource-based tabs, compare resourceType and recordId
    if (request.Configuration?.resourceType) {
      const requestRecordId = request.ResourceRecordId || '';
      const tabRecordId = tab.resourceRecordId || '';
      return tab.configuration?.resourceType === request.Configuration.resourceType &&
             tabRecordId === requestRecordId;
    }

    // For app nav items, compare appName and navItemName
    if (request.Configuration?.appName && request.Configuration?.navItemName) {
      return tab.configuration?.appName === request.Configuration.appName &&
             tab.configuration?.navItemName === request.Configuration.navItemName;
    }

    // Fallback to basic comparison
    return false;
  }

  /**
   * Open a navigation item within an app
   */
  public OpenNavItem(appId: string, navItem: NavItem, appColor: string, options?: NavigationOptions): string {
    console.log('[NavigationService.OpenNavItem] Called with:', {
      appId,
      navItemLabel: navItem.Label,
      navItemResourceType: navItem.ResourceType,
      navItemDriverClass: navItem.DriverClass,
      appColor,
      options
    });

    const forceNew = this.shouldForceNewTab(options);
    console.log('[NavigationService.OpenNavItem] forceNew:', forceNew);

    // Get the app to find its name
    const app = this.appManager.GetAppById(appId);
    const appName = app?.Name || '';
    console.log('[NavigationService.OpenNavItem] App name:', appName);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: navItem.Label,
      Configuration: {
        route: navItem.Route,
        resourceType: navItem.ResourceType,
        driverClass: navItem.DriverClass,  // Pass through DriverClass for Custom resource type
        recordId: navItem.RecordID,
        appName: appName,  // Store app name for URL building
        appId: appId,
        navItemName: navItem.Label,  // Store nav item name for URL building
        ...(navItem.Configuration || {})
      },
      IsPinned: options?.pinTab || false
    };

    console.log('[NavigationService.OpenNavItem] Tab request:', request);

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      // Always create a new tab
      console.log('[NavigationService.OpenNavItem] Opening forced new tab');
      const tabId = this.workspaceManager.OpenTabForced(request, appColor);
      console.log('[NavigationService.OpenNavItem] Created tab:', tabId);
      return tabId;
    } else {
      // Use existing OpenTab logic (may replace temporary tab)
      console.log('[NavigationService.OpenNavItem] Opening tab (may replace)');
      const tabId = this.workspaceManager.OpenTab(request, appColor);
      console.log('[NavigationService.OpenNavItem] Opened tab:', tabId);
      return tabId;
    }
  }

  /**
   * Open an entity record view
   * System-wide resource using __explorer app ID and neutral color
   */
  public OpenEntityRecord(
    entityName: string,
    recordPkey: CompositeKey,
    options?: NavigationOptions
  ): string {
    console.log('NavigationService.OpenEntityRecord called:', {
      entityName,
      recordPkey: recordPkey.ToURLSegment(),
      systemAppId: SYSTEM_APP_ID,
      color: this.ExplorerAppColor,
      options
    });

    const forceNew = this.shouldForceNewTab(options);

    const recordId = recordPkey.ToURLSegment();
    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: `${entityName} - ${recordId}`,
      Configuration: {
        resourceType: 'Records',
        Entity: entityName,  // Must use 'Entity' (capital E) - expected by record-resource.component
        recordId: recordId   // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: recordId,
      IsPinned: options?.pinTab || false
    };

    console.log('NavigationService.OpenEntityRecord request:', request, 'forceNew:', forceNew);

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      const tabId = this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
      console.log('NavigationService.OpenEntityRecord created new tab:', tabId);
      return tabId;
    } else {
      const tabId = this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
      console.log('NavigationService.OpenEntityRecord opened tab:', tabId);
      return tabId;
    }
  }

  /**
   * Open a view (system-wide resource)
   */
  public OpenView(
    viewId: string,
    viewName: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: viewName,
      Configuration: {
        resourceType: 'User Views',
        viewId,
        recordId: viewId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: viewId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a dashboard (system-wide resource)
   */
  public OpenDashboard(
    dashboardId: string,
    dashboardName: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: dashboardName,
      Configuration: {
        resourceType: 'Dashboards',
        dashboardId,
        recordId: dashboardId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: dashboardId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a report (system-wide resource)
   */
  public OpenReport(
    reportId: string,
    reportName: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: reportName,
      Configuration: {
        resourceType: 'Reports',
        reportId,
        recordId: reportId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: reportId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open an artifact (system-wide resource)
   * Artifacts are versioned content containers (reports, dashboards, UI components, etc.)
   */
  public OpenArtifact(
    artifactId: string,
    artifactName?: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: artifactName || `Artifact - ${artifactId}`,
      Configuration: {
        resourceType: 'Artifacts',
        artifactId,
        recordId: artifactId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: artifactId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a dynamic view (system-wide resource)
   * Dynamic views are entity-based views with custom filters, not saved views
   */
  public OpenDynamicView(
    entityName: string,
    extraFilter?: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const filterSuffix = extraFilter ? ' (Filtered)' : '';
    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: `${entityName}${filterSuffix}`,
      Configuration: {
        resourceType: 'User Views',
        Entity: entityName,
        ExtraFilter: extraFilter,
        isDynamic: true,
        recordId: 'dynamic'  // Special marker for dynamic views
      },
      ResourceRecordId: 'dynamic',
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a query (system-wide resource)
   */
  public OpenQuery(
    queryId: string,
    queryName: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: queryName,
      Configuration: {
        resourceType: 'Queries',
        queryId,
        recordId: queryId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: queryId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a new entity record creation form
   * System-wide resource using __explorer app ID and neutral color
   * @param entityName The name of the entity to create a new record for
   * @param options Navigation options including optional newRecordValues for pre-populating fields
   */
  public OpenNewEntityRecord(
    entityName: string,
    options?: NavigationOptions
  ): string {
    console.log('NavigationService.OpenNewEntityRecord called:', {
      entityName,
      systemAppId: SYSTEM_APP_ID,
      color: this.ExplorerAppColor,
      options
    });

    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: `New ${entityName}`,
      Configuration: {
        resourceType: 'Records',
        Entity: entityName,  // Must use 'Entity' (capital E) - expected by record-resource.component
        recordId: '',        // Empty recordId indicates new record
        isNew: true,         // Flag to indicate this is a new record
        NewRecordValues: options?.newRecordValues  // Pass through initial values if provided
      },
      ResourceRecordId: '',  // Empty for new records
      IsPinned: options?.pinTab || false
    };

    console.log('NavigationService.OpenNewEntityRecord request:', request, 'forceNew:', forceNew);

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      const tabId = this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
      console.log('NavigationService.OpenNewEntityRecord created new tab:', tabId);
      return tabId;
    } else {
      const tabId = this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
      console.log('NavigationService.OpenNewEntityRecord opened tab:', tabId);
      return tabId;
    }
  }

  /**
   * Switch to an application by ID.
   * This sets the app as active and either opens a specific nav item or creates a default tab.
   * If the requested nav item already has an open tab, switches to that tab instead of creating a new one.
   * @param appId The application ID to switch to
   * @param navItemName Optional name of a nav item to open within the app. If provided, opens that nav item.
   */
  async SwitchToApp(appId: string, navItemName?: string): Promise<void> {
    await this.appManager.SetActiveApp(appId);

    const app = this.appManager.GetAllApps().find(a => a.ID === appId);
    if (!app) {
      return;
    }

    const appTabs = this.workspaceManager.GetAppTabs(appId);

    // If a specific nav item is requested
    if (navItemName) {
      const navItems = app.GetNavItems();
      const navItem = navItems.find(item => item.Label === navItemName);
      if (navItem) {
        // Check if there's already a tab for this nav item
        const existingTab = appTabs.find(tab =>
          tab.title === navItem.Label ||
          (tab.configuration?.['route'] === navItem.Route && navItem.Route)
        );

        if (existingTab) {
          // Switch to existing tab
          this.workspaceManager.SetActiveTab(existingTab.id);
        } else {
          // Open new tab for this nav item
          this.OpenNavItem(appId, navItem, app.GetColor());
        }
        return;
      }
      // Nav item not found, fall through to default behavior
    }

    // No specific nav item requested - check if app has any tabs
    if (appTabs.length === 0) {
      // Create default tab
      const tabRequest = await app.CreateDefaultTab();
      if (tabRequest) {
        this.workspaceManager.OpenTab(tabRequest, app.GetColor());
      }
    } else {
      // App has tabs - switch to the first one (or active one if exists)
      const config = this.workspaceManager.GetConfiguration();
      const activeAppTab = appTabs.find(t => t.id === config?.activeTabId);
      if (!activeAppTab) {
        // No active tab for this app, switch to first tab
        this.workspaceManager.SetActiveTab(appTabs[0].id);
      }
    }
  }
}
