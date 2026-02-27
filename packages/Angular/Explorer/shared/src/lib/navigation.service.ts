import { Injectable, OnDestroy } from '@angular/core';
import { WorkspaceStateManager, NavItem, DynamicNavItem, TabRequest, ApplicationManager } from '@memberjunction/ng-base-application';
import { NavigationOptions } from './navigation.interfaces';
import { CompositeKey } from '@memberjunction/core';
import { fromEvent, Subscription } from 'rxjs';

/**
 * System application ID for non-app-specific resources (fallback only)
 * Uses double underscore prefix to indicate system-level resource
 * @deprecated Prefer using NavigationService.getDefaultApplicationId() instead
 */
export const SYSTEM_APP_ID = '__explorer';

/**
 * Neutral color for fallback when no app is available
 */
const NEUTRAL_APP_COLOR = '#9E9E9E'; // Material Design Gray 500

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

  /** Cached Home app ID (null means not found, undefined means not checked) */
  private _homeAppId: string | null | undefined = undefined;
  /** Cached Home app color */
  private _homeAppColor: string | null = null;

  constructor(
    private workspaceManager: WorkspaceStateManager,
    private appManager: ApplicationManager
  ) {
    this.setupGlobalShiftKeyDetection();
  }

  /**
   * Get the neutral color used for system-wide resources (entities, views, dashboards)
   * Returns a light neutral gray
   * @deprecated Use getDefaultAppColor() for better UX with Home app integration
   */
  get ExplorerAppColor(): string {
    return NEUTRAL_APP_COLOR;
  }

  /**
   * Gets the default application ID for orphan resources.
   * Priority: Home app > Active app > SYSTEM_APP_ID
   *
   * This ensures orphan resources (entity records, dashboards, views opened directly)
   * are grouped under the Home app instead of being orphaned in the tab system.
   */
  private getDefaultApplicationId(): string {
    // Check cache first
    if (this._homeAppId !== undefined) {
      if (this._homeAppId !== null) {
        return this._homeAppId;
      }
      // Home app not found, check active app
      const activeApp = this.appManager.GetActiveApp();
      if (activeApp) {
        return activeApp.ID;
      }
      return SYSTEM_APP_ID;
    }

    // First time - look for Home app
    const homeApp = this.appManager.GetAppByName('Home');
    if (homeApp) {
      this._homeAppId = homeApp.ID;
      this._homeAppColor = homeApp.GetColor();
      return homeApp.ID;
    }

    // Cache that Home app doesn't exist
    this._homeAppId = null;

    // Fall back to currently active app
    const activeApp = this.appManager.GetActiveApp();
    if (activeApp) {
      return activeApp.ID;
    }

    // Last resort - system app ID
    return SYSTEM_APP_ID;
  }

  /**
   * Gets the default app color for orphan resources.
   * Returns Home app color if available, otherwise neutral gray.
   */
  private getDefaultAppColor(): string {
    // Ensure cache is populated
    this.getDefaultApplicationId();

    // If Home app exists, use its color
    if (this._homeAppColor) {
      return this._homeAppColor;
    }

    // Check active app
    const activeApp = this.appManager.GetActiveApp();
    if (activeApp) {
      return activeApp.GetColor();
    }

    // Fall back to neutral color
    return NEUTRAL_APP_COLOR;
  }

  /**
   * Clears the cached Home app info.
   * Call this if apps are reloaded or user logs out.
   */
  public clearHomeAppCache(): void {
    this._homeAppId = undefined;
    this._homeAppColor = null;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Set up global keyboard event listeners to track shift key state
   */
  private setupGlobalShiftKeyDetection(): void {
    // Track shift key via mousedown events (capture phase) instead of keydown/keyup.
    // This is more reliable because:
    // 1. MouseEvent.shiftKey always reflects the actual modifier state at click time
    // 2. No risk of "stuck" state from missed keyup events (focus loss, tab switch, etc.)
    // 3. Navigation is always triggered by a click, so the shift state is read
    //    at exactly the right moment
    this.subscriptions.push(
      fromEvent<MouseEvent>(document, 'mousedown', { capture: true }).subscribe(event => {
        this.shiftKeyPressed = event.shiftKey;
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

    if (!config || !config.tabs || config.tabs.length === 0) {
      return; // No tabs to preserve
    }

    // Find the currently active tab
    const activeTab = config.tabs.find(tab => tab.id === config.activeTabId);
    if (!activeTab) {
      return; // No active tab
    }

    // If the active tab is NOT pinned (i.e., it's temporary), pin it to preserve it
    // This maintains the "only one temporary tab" rule
    if (!activeTab.isPinned) {
      this.workspaceManager.TogglePin(activeTab.id);
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
    const forceNew = this.shouldForceNewTab(options);

    // Get the app to find its name
    const app = this.appManager.GetAppById(appId);
    const appName = app?.Name || '';

    // Dynamic nav items (e.g. orphan entity records) carry their original tab Configuration
    // and should NOT get navItemName stamped on them — that would cause buildResourceUrl
    // to produce a nav-item-style URL like /app/home/<label> instead of the correct
    // resource-type URL like /app/home/record/Entity/ID|...
    const isDynamic = (navItem as DynamicNavItem).isDynamic === true;

    const request: TabRequest = {
      ApplicationId: appId,
      Title: navItem.Label,
      ResourceRecordId: navItem.RecordID || '',  // Also store at top level for consistent tab matching
      Configuration: {
        route: navItem.Route,
        resourceType: navItem.ResourceType,
        driverClass: navItem.DriverClass,  // Pass through DriverClass for Custom resource type
        recordId: navItem.RecordID,
        appName: appName,  // Store app name for URL building
        appId: appId,
        ...(isDynamic ? {} : { navItemName: navItem.Label }),  // Only set for static nav items
        ...(navItem.Configuration || {})
      },
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    let tabId: string;
    if (forceNew) {
      // Always create a new tab
      tabId = this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      // Use existing OpenTab logic (may replace temporary tab)
      tabId = this.workspaceManager.OpenTab(request, appColor);
    }

    // Apply query params to the newly opened/activated tab if provided
    if (options?.queryParams) {
      this.applyQueryParamsToTab(tabId, options.queryParams);
    }

    return tabId;
  }

  /**
   * Open an entity record view
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenEntityRecord(
    entityName: string,
    recordPkey: CompositeKey,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();

    const forceNew = this.shouldForceNewTab(options);

    const recordId = recordPkey.ToURLSegment();
    const request: TabRequest = {
      ApplicationId: appId,
      Title: `${entityName} - ${recordId}`,
      Configuration: {
        resourceType: 'Records',
        Entity: entityName,  // Must use 'Entity' (capital E) - expected by record-resource.component
        recordId: recordId   // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: recordId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    let tabId: string;
    if (forceNew) {
      tabId = this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      tabId = this.workspaceManager.OpenTab(request, appColor);
    }

    return tabId;
  }

  /**
   * Open a view
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenView(
    viewId: string,
    viewName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: viewName,
      Configuration: {
        resourceType: 'MJ: User Views',
        viewId,
        recordId: viewId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: viewId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a dashboard
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenDashboard(
    dashboardId: string,
    dashboardName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
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
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a report
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenReport(
    reportId: string,
    reportName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
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
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open an artifact
   * Artifacts are versioned content containers (reports, dashboards, UI components, etc.)
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenArtifact(
    artifactId: string,
    artifactName?: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
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
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a dynamic view
   * Dynamic views are entity-based views with custom filters, not saved views
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenDynamicView(
    entityName: string,
    extraFilter?: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    const forceNew = this.shouldForceNewTab(options);

    const filterSuffix = extraFilter ? ' (Filtered)' : '';
    const request: TabRequest = {
      ApplicationId: appId,
      Title: `${entityName}${filterSuffix}`,
      Configuration: {
        resourceType: 'MJ: User Views',
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
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a query
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenQuery(
    queryId: string,
    queryName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
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
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a new entity record creation form
   * Uses Home app if available, otherwise falls back to active app or system app
   * @param entityName The name of the entity to create a new record for
   * @param options Navigation options including optional newRecordValues for pre-populating fields
   */
  public OpenNewEntityRecord(
    entityName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();

    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
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

    // Handle transition from single-resource mode
    this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Navigate to a nav item by name within the current or specified application.
   * Allows passing additional configuration parameters to merge with the nav item's config.
   * This is useful for cross-resource navigation where a component needs to navigate
   * to another nav item with specific parameters (e.g., navigate to Conversations with a specific conversationId).
   *
   * @param navItemName The label/name of the nav item to navigate to
   * @param configuration Additional configuration to merge (e.g., conversationId, artifactId)
   * @param appId Optional app ID (defaults to current active app)
   * @param options Navigation options
   * @returns The tab ID if successful, null if nav item not found
   */
  public async OpenNavItemByName(
    navItemName: string,
    configuration?: Record<string, unknown>,
    appId?: string,
    options?: NavigationOptions
  ): Promise<string | null> {
    // Get app (use provided or current active)
    const targetAppId = appId || this.appManager.GetActiveApp()?.ID;
    if (!targetAppId) {
      return null;
    }

    const app = this.appManager.GetAppById(targetAppId);
    if (!app) {
      return null;
    }

    // Find the nav item by name
    const navItems = await app.GetNavItems();
    const navItem = navItems.find(item => item.Label === navItemName);
    if (!navItem) {
      return null;
    }

    // Create a merged nav item with additional configuration
    const mergedNavItem: NavItem = {
      ...navItem,
      Configuration: {
        ...(navItem.Configuration || {}),
        ...(configuration || {})
      }
    };

    // Use existing OpenNavItem
    return this.OpenNavItem(targetAppId, mergedNavItem, app.GetColor(), options);
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
      const navItems = await app.GetNavItems();
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

  /**
   * Update the query params for the currently active tab.
   * This updates the tab's configuration and triggers a URL sync via the shell's
   * workspace configuration subscription.
   *
   * Use this instead of directly calling router.navigate() to ensure proper
   * URL management that respects app-scoped routes.
   *
   * @param queryParams Object containing query param key-value pairs.
   *                    Use null values to remove a query param.
   * @example
   * // Add or update query params
   * navigationService.UpdateActiveTabQueryParams({ category: 'abc123', dashboard: 'xyz789' });
   *
   * // Remove a query param
   * navigationService.UpdateActiveTabQueryParams({ category: null });
   */
  UpdateActiveTabQueryParams(queryParams: Record<string, string | null>): void {
    const activeTabId = this.workspaceManager.GetActiveTabId();
    if (!activeTabId) {
      console.warn('NavigationService.UpdateActiveTabQueryParams: No active tab');
      return;
    }

    this.applyQueryParamsToTab(activeTabId, queryParams);
  }

  /**
   * Apply query params to a specific tab by ID.
   * Merges with any existing query params on the tab. Use null values to remove params.
   */
  private applyQueryParamsToTab(tabId: string, queryParams: Record<string, string | null>): void {
    const tab = this.workspaceManager.GetTab(tabId);
    if (!tab) {
      console.warn('NavigationService.applyQueryParamsToTab: Tab not found:', tabId);
      return;
    }

    // Get existing queryParams from tab configuration
    const existingQueryParams = (tab.configuration?.['queryParams'] || {}) as Record<string, string | null>;

    // Merge with new query params
    const mergedQueryParams: Record<string, string> = {};

    // Start with existing params (excluding nulls)
    for (const [key, value] of Object.entries(existingQueryParams)) {
      if (value !== null) {
        mergedQueryParams[key] = value;
      }
    }

    // Apply new params (null means remove)
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === null) {
        delete mergedQueryParams[key];
      } else {
        mergedQueryParams[key] = value;
      }
    }

    // Update the tab configuration
    this.workspaceManager.UpdateTabConfiguration(tabId, {
      queryParams: Object.keys(mergedQueryParams).length > 0 ? mergedQueryParams : undefined
    });
  }
}
