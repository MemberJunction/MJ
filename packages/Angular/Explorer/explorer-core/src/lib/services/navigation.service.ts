import { Injectable, OnDestroy } from '@angular/core';
import { WorkspaceStateManager, NavItem, TabRequest, ApplicationManager } from '@memberjunction/ng-base-application';
import { NavigationOptions } from './navigation.interfaces';
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
   * Open a navigation item within an app
   */
  openNavItem(appId: string, navItem: NavItem, appColor: string, options?: NavigationOptions): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: navItem.Label,
      Configuration: {
        route: navItem.Route,
        resourceType: navItem.ResourceType,
        recordId: navItem.RecordID,
        ...(navItem.Configuration || {})
      },
      IsPinned: options?.pinTab || false
    };

    if (forceNew) {
      // Always create a new tab
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      // Use existing OpenTab logic (may replace temporary tab)
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open an entity record view
   * System-wide resource using __explorer app ID and neutral color
   */
  openEntityRecord(
    entityName: string,
    recordId: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: `${entityName} - ${recordId}`,
      Configuration: {
        resourceType: 'entity-record',
        entityName,
        recordId
      },
      IsPinned: options?.pinTab || false
    };

    if (forceNew) {
      // Always create a new tab
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      // Use existing OpenTab logic (may replace temporary tab)
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a view (system-wide resource)
   */
  openView(
    viewId: string,
    viewName: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: viewName,
      Configuration: {
        resourceType: 'view',
        viewId
      },
      IsPinned: options?.pinTab || false
    };

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a dashboard (system-wide resource)
   */
  openDashboard(
    dashboardId: string,
    dashboardName: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: dashboardName,
      Configuration: {
        resourceType: 'dashboard',
        dashboardId
      },
      IsPinned: options?.pinTab || false
    };

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Open a report (system-wide resource)
   */
  openReport(
    reportId: string,
    reportName: string,
    options?: NavigationOptions
  ): string {
    const forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: SYSTEM_APP_ID,
      Title: reportName,
      Configuration: {
        resourceType: 'report',
        reportId
      },
      IsPinned: options?.pinTab || false
    };

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }

  /**
   * Switch to an application by ID.
   * This sets the app as active and either opens a specific nav item or creates a default tab.
   * If the requested nav item already has an open tab, switches to that tab instead of creating a new one.
   * @param appId The application ID to switch to
   * @param navItemName Optional name of a nav item to open within the app. If provided, opens that nav item.
   */
  async switchToApp(appId: string, navItemName?: string): Promise<void> {
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
          this.openNavItem(appId, navItem, app.GetColor());
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
