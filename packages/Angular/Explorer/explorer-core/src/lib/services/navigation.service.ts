import { Injectable, OnDestroy } from '@angular/core';
import { WorkspaceStateManager, NavItem, TabRequest } from '@memberjunction/ng-base-application';
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

  constructor(private workspaceManager: WorkspaceStateManager) {
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
}
