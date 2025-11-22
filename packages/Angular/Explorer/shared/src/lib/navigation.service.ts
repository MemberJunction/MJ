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
   * Open a navigation item within an app
   */
  public OpenNavItem(appId: string, navItem: NavItem, appColor: string, options?: NavigationOptions): string {
    const forceNew = this.shouldForceNewTab(options);

    // Get the app to find its name
    const app = this.appManager.GetAppById(appId);
    const appName = app?.Name || '';

    const request: TabRequest = {
      ApplicationId: appId,
      Title: navItem.Label,
      Configuration: {
        route: navItem.Route,
        resourceType: navItem.ResourceType,
        recordId: navItem.RecordId,
        appName: appName,  // Store app name for URL building
        appId: appId,
        navItemName: navItem.Label,  // Store nav item name for URL building
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

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, this.ExplorerAppColor);
    } else {
      return this.workspaceManager.OpenTab(request, this.ExplorerAppColor);
    }
  }
}
